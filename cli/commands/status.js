import fs from 'fs/promises';
import { loadSession } from '../../engine/session.js';
import { getPending, checkStopFlag } from '../../store/file-store.js';
import * as out from '../../utils/output.js';

export function registerStatusCommands(program) {
  program
    .command('status')
    .description('Show current status of a session')
    .requiredOption('--session <id>', 'Session ID')
    .option('--tail <n>', 'Lines of log to show (background sessions only)', '20')
    .action(async (opts) => {
      const session = await loadSession(opts.session);
      const tail = Math.max(1, parseInt(opts.tail, 10) || 20);

      out.header(`Session ${session.sessionId}`);
      out.log('status', `Project : ${session.projectId}`);
      out.log('status', `Status  : ${session.status}${session.dryRun ? ' (dry-run)' : ''}`);
      out.log('status', `Budget  : $${session.tokenUsage.total.toFixed(4)} used / $${session.costBudget}`);
      out.log('status', `Cursor  : story ${session.pipeline.storyIndex + 1} | stage: ${session.pipeline.stage}`);
      out.log('status', `Steps   : ${session.completedSteps.length} completed`);
      if (session.currentStep) out.log('status', `Running : ${session.currentStep}`);

      // Pending approval or checkpoint — show what's actually being approved,
      // not just that something is waiting.
      const pending = await getPending(session.tenantId, session.projectId);
      if (pending) {
        out.divider();
        out.pending(`Waiting for your input (${pending.type}):`);

        if (pending.type === 'plan-approval') {
          out.log('plan', pending.plan);
        } else if (pending.type === 'checkpoint') {
          for (const f of pending.files ?? []) {
            out.log('checkpoint', `— ${f.relativePath}${f.truncated ? ' (truncated preview)' : ''}`);
            process.stdout.write(f.content + '\n');
          }
          if (!pending.files?.length) {
            out.log('checkpoint', `Output at: workspaces/${session.tenantId}/${session.projectId}/output/`);
          }
        } else if (pending.type === 'escalation') {
          out.log('escalation', `Agent: ${pending.agent} — ${pending.failureType ?? 'unknown failure'}`);
          for (const issue of pending.issues ?? []) {
            out.log('escalation', typeof issue === 'string' ? issue : JSON.stringify(issue));
          }
        }

        out.divider();
        out.pending(`  glowing-spoon approve --session ${session.sessionId}`);
        out.pending(`  glowing-spoon reject  --session ${session.sessionId} --feedback "reason"`);
      }

      // Stop flag
      if (await checkStopFlag(session.tenantId, session.projectId)) {
        out.warn('Stop flag set — session will pause at the next stage boundary.');
      }

      // Blocking attention items
      const blocking = session.attentionQueue?.filter(i => !i.resolved && i.attention === 'BLOCKING') ?? [];
      if (blocking.length > 0) {
        out.divider();
        out.header('Needs Attention');
        for (const item of blocking) {
          out.warn(`[${item.type}] ${item.agent}: ${JSON.stringify(item.issues ?? item.failureType)}`);
        }
      }

      // Log tail (background sessions)
      if (session.runtime?.logFile) {
        try {
          const log = await fs.readFile(session.runtime.logFile, 'utf8');
          const lines = log.split('\n').filter(Boolean).slice(-tail).join('\n');
          out.divider();
          out.header(`Log — last ${tail} lines`);
          process.stdout.write(lines + '\n');
        } catch {
          out.log('status', `Log not readable: ${session.runtime.logFile}`);
        }
      } else {
        out.log('status', 'Foreground session — no log file. Check your terminal.');
      }
    });
}
