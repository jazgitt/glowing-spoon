// Preview runner — starts/stops the assembled prototype (`npm run dev` in
// <workspace>/prototype/) as a detached child, tracked in .preview.json.
//
// MEDIUM-3 (SECURITY — Phase 2 blocker): starting a preview executes LLM-generated
// code on this machine. Acceptable ONLY for Phase 1 single-local-user, only ever
// user-initiated (never auto-started by the pipeline), behind requireAuth. Do NOT
// carry this forward to multi-tenant hosting without sandboxing (container/VM).
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { getWorkspacePath } from '../../utils/workspace.js';
import { validateDependencies, killTree } from '../../utils/build-runner.js';
import { isPidAlive } from './spawner.js';

const API_PORT_BASE = 4310;
const WEB_PORT_BASE = 5310;
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_MS = 2_000;

function previewFilePath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.preview.json');
}

function prototypeDir(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), 'prototype');
}

async function savePreview(tenantId, projectId, preview) {
  const file = previewFilePath(tenantId, projectId);
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(preview, null, 2));
  await fs.rename(tmp, file);
  return preview;
}

// Read preview state, reconciling a dead pid: a "running" record whose process
// is gone (crash, reboot, manual kill) is rewritten as stopped.
export async function getPreview(tenantId, projectId) {
  let preview;
  try {
    preview = JSON.parse(await fs.readFile(previewFilePath(tenantId, projectId), 'utf8'));
  } catch {
    return null;
  }
  if (['installing', 'starting', 'running'].includes(preview.status) && !isPidAlive(preview.pid)) {
    preview = { ...preview, status: 'stopped', exitDetected: true };
    await savePreview(tenantId, projectId, preview);
  }
  return preview;
}

export async function hasPrototype(tenantId, projectId) {
  try {
    await fs.access(path.join(prototypeDir(tenantId, projectId), 'package.json'));
    return true;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

export async function findFreePort(start, limit = 50) {
  for (let p = start; p < start + limit; p++) {
    if (await isPortFree(p)) return p;
  }
  throw Object.assign(new Error(`No free port in ${start}-${start + limit}`), { code: 'NO_FREE_PORT' });
}

function probePort(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1_000, () => { sock.destroy(); resolve(false); });
  });
}

// Fire-and-forget: flips .preview.json starting → running when the web port
// answers, or → failed if the process dies / times out first. Each transition
// rewrites the file — the session-watcher's mtime poll broadcasts it.
function watchReadiness(tenantId, projectId, pid, webPort) {
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    const current = await getPreview(tenantId, projectId).catch(() => null);
    // A newer run or a stop replaced/ended this one — stand down.
    if (!current || current.pid !== pid || ['stopped', 'failed', 'running'].includes(current.status)) {
      clearInterval(timer);
      return;
    }
    if (!isPidAlive(pid)) {
      clearInterval(timer);
      await savePreview(tenantId, projectId, { ...current, status: 'failed' });
      return;
    }
    if (await probePort(webPort)) {
      clearInterval(timer);
      await savePreview(tenantId, projectId, { ...current, status: 'running' });
      return;
    }
    if (Date.now() - startedAt > READY_TIMEOUT_MS) {
      clearInterval(timer);
      killTree(pid);
      await savePreview(tenantId, projectId, { ...current, status: 'failed' });
    }
  }, READY_POLL_MS);
  timer.unref?.();
}

export async function startPreview(tenantId, projectId) {
  const dir = prototypeDir(tenantId, projectId);

  let pkgContent;
  try {
    pkgContent = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
  } catch {
    throw Object.assign(new Error('No prototype found — run a session or "Assemble prototype" first.'), { code: 'NO_PROTOTYPE' });
  }

  const existing = await getPreview(tenantId, projectId);
  if (existing && ['installing', 'starting', 'running'].includes(existing.status)) {
    throw Object.assign(new Error('Preview is already running.'), { code: 'ALREADY_RUNNING' });
  }

  // Defense in depth: package.json is on disk and editable — re-validate deps
  // at start time, not just at assembly time.
  let disallowed;
  try {
    disallowed = validateDependencies(pkgContent);
  } catch {
    throw Object.assign(new Error('prototype/package.json is not valid JSON.'), { code: 'BAD_PACKAGE_JSON' });
  }
  if (disallowed.length > 0) {
    throw Object.assign(
      new Error(`package.json contains disallowed dependencies: ${disallowed.join(', ')}`),
      { code: 'DISALLOWED_DEPS' }
    );
  }

  const apiPort = await findFreePort(API_PORT_BASE);
  const webPort = await findFreePort(WEB_PORT_BASE);
  const logFile = path.join(getWorkspacePath(tenantId, projectId), 'preview.log');

  await savePreview(tenantId, projectId, {
    pid: null, apiPort, webPort, url: `http://localhost:${webPort}`,
    status: 'installing', startedAt: Date.now(), logFile,
  });

  // Fresh log per run — the watcher tails from offset 0 and its shrink-reset
  // handles the truncation.
  const logStream = createWriteStream(logFile, { flags: 'w' });
  await new Promise(resolve => logStream.once('open', resolve));

  // Constant command string — never interpolate anything into it (see
  // utils/build-runner.js). Ports travel via env; the assembler's config
  // templates read API_PORT/WEB_PORT.
  const child = spawn(
    'npm install --ignore-scripts --no-audit --no-fund && npm run dev',
    {
      cwd: dir,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', logStream, logStream],
      env: {
        ...process.env,
        API_PORT: String(apiPort),
        WEB_PORT: String(webPort),
        PORT: String(apiPort),
        BROWSER: 'none',
      },
    }
  );
  child.unref();

  const preview = await savePreview(tenantId, projectId, {
    pid: child.pid, apiPort, webPort, url: `http://localhost:${webPort}`,
    status: 'starting', startedAt: Date.now(), logFile,
  });

  watchReadiness(tenantId, projectId, child.pid, webPort);
  return preview;
}

export async function stopPreview(tenantId, projectId) {
  const preview = await getPreview(tenantId, projectId);
  if (!preview) {
    throw Object.assign(new Error('No preview to stop.'), { code: 'NOT_RUNNING' });
  }
  if (preview.pid) killTree(preview.pid);
  return savePreview(tenantId, projectId, { ...preview, status: 'stopped' });
}
