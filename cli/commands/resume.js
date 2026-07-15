import { createWriteStream } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { loadSession } from '../../engine/session.js';
import { AgentPM } from '../../engine/agent-pm.js';
import { runSession } from '../../engine/session-runner.js';
import { saveSession, clearStopFlag } from '../../store/file-store.js';
import { config } from '../../utils/config.js';
import * as out from '../../utils/output.js';

export function registerResumeCommands(program) {
  program
    .command('resume')
    .description('Resume a stopped or interrupted session from where it left off')
    .requiredOption('--session <id>', 'Session ID')
    .option('--background', 'Resume in background; logs to session.log', false)
    // Accepted so spawned children of dry-run sessions pass the argv API-key guard
    // in cli/index.js; the actual dry-run state is restored from the session file.
    .option('--dry-run', 'Dry run — no real Claude calls', false)
    .action(async (opts) => {
      const session = await loadSession(opts.session);

      if (session.status === 'complete') {
        out.error('Session already complete — nothing to resume.');
        process.exit(1);
      }

      // Clear stale stop flag before continuing.
      await clearStopFlag(session.tenantId, session.projectId);

      // Restore dry-run from session (applies whether foreground or background).
      if (session.dryRun) config.dryRun = true;

      out.header(`Resuming Session ${session.sessionId}`);
      out.log('resume', `Project: ${session.projectId} | Cursor: story ${session.pipeline.storyIndex + 1}, stage: ${session.pipeline.stage}`);

      if (opts.background) {
        const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT || './workspaces');
        const logFile = session.runtime?.logFile
          ?? path.join(workspaceRoot, session.tenantId, session.projectId, 'session.log');

        session.runtime = { ...session.runtime, background: true, logFile };
        await saveSession(session);

        const logStream = createWriteStream(logFile, { flags: 'a' });
        await new Promise(resolve => logStream.once('open', resolve));

        // Spawn self without --background so the child runs the foreground path.
        // Forward --dry-run so the child passes the argv API-key guard.
        const args = [process.argv[1], 'resume', '--session', opts.session];
        if (session.dryRun) args.push('--dry-run');
        const child = spawn(
          process.execPath,
          args,
          { detached: true, stdio: ['ignore', logStream, logStream] }
        );
        child.unref();

        session.runtime.pid = child.pid;
        await saveSession(session);

        out.success(`Resumed in background (PID ${child.pid})`);
        out.log('resume', `Status: glowing-spoon status --session ${session.sessionId}`);
        return;
      }

      const agentPM = new AgentPM(session);
      await runSession(session, agentPM);
    });
}
