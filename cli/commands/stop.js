import { loadSession } from '../../engine/session.js';
import { writeStopFlag } from '../../store/file-store.js';
import * as out from '../../utils/output.js';

export function registerStopCommands(program) {
  program
    .command('stop')
    .description('Gracefully stop a running session (pauses at the next stage boundary)')
    .requiredOption('--session <id>', 'Session ID')
    .action(async (opts) => {
      const session = await loadSession(opts.session);

      if (session.status === 'complete') {
        out.warn('Session is already complete — nothing to stop.');
        return;
      }

      await writeStopFlag(session.tenantId, session.projectId);

      // Best-effort signal if we have a background PID.
      if (session.runtime?.pid) {
        try {
          process.kill(session.runtime.pid, 'SIGTERM');
          out.log('stop', `Sent SIGTERM to PID ${session.runtime.pid}`);
        } catch {
          // Process may have already exited — stop flag is sufficient.
        }
      }

      out.success('Stop flag set — session pauses at the next stage boundary.');
      out.log('stop', `Resume: glowing-spoon resume --session ${session.sessionId}`);
    });
}
