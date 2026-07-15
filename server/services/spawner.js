// Spawns engine sessions as detached background children — the same pattern as the
// CLI's `run --background` (cli/commands/session.js). The server must NEVER call
// runSession() in-process: it blocks for up to POLL_TIMEOUT_MS at approval polls.
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { saveSession, clearStopFlag } from '../../store/file-store.js';
import { getWorkspacePath } from '../../utils/workspace.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'cli', 'index.js');

// Default 24h for web sessions — browser users respond asynchronously, unlike a
// terminal user sitting at the default 30-min poll.
const WEB_POLL_TIMEOUT_MS = process.env.POLL_TIMEOUT_MS || String(24 * 60 * 60 * 1000);

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but not ours
  }
}

// A session is "running" only if its recorded child process is actually alive.
export function isSessionRunning(session) {
  return ['planning', 'executing'].includes(session?.status) && isPidAlive(session?.runtime?.pid);
}

// Detects a crashed runner: session says it's working but the pid is gone.
export function isRunnerDead(session) {
  return ['planning', 'executing'].includes(session?.status) && !isPidAlive(session?.runtime?.pid);
}

// Starts (or resumes) the engine for `session` as a detached child logging to
// session.log. Clears stale control files first — a leftover .response.json would
// instantly auto-approve the next block the user never saw.
export async function spawnSessionRunner(session) {
  const workspacePath = getWorkspacePath(session.tenantId, session.projectId);
  const logFile = path.join(workspacePath, 'session.log');

  await fs.unlink(path.join(workspacePath, '.response.json')).catch(() => {});
  await clearStopFlag(session.tenantId, session.projectId);

  session.runtime = { ...session.runtime, background: true, logFile };
  await saveSession(session);

  const logStream = createWriteStream(logFile, { flags: 'a' });
  await new Promise(resolve => logStream.once('open', resolve));

  // --dry-run must be forwarded explicitly: the CLI's API-key guard checks argv
  // before the session file (with its persisted dryRun flag) is ever loaded.
  const args = [CLI_ENTRY, 'resume', '--session', session.sessionId];
  if (session.dryRun) args.push('--dry-run');

  const child = spawn(
    process.execPath,
    args,
    {
      detached: true,
      stdio: ['ignore', logStream, logStream],
      windowsHide: true,
      env: {
        ...process.env,
        // Structured event feed for the UI (engine's utils/output.js emits when set).
        GS_EVENT_FILE: path.join(workspacePath, 'events.jsonl'),
        POLL_TIMEOUT_MS: WEB_POLL_TIMEOUT_MS,
      },
    }
  );
  child.unref();

  session.runtime.pid = child.pid;
  await saveSession(session);
  return child.pid;
}
