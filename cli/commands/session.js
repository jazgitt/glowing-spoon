import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import path from 'path';
import { initSession } from '../../engine/session.js';
import { AgentPM } from '../../engine/agent-pm.js';
import { runSession } from '../../engine/session-runner.js';
import { saveSession } from '../../store/file-store.js';
import { config } from '../../utils/config.js';
import * as out from '../../utils/output.js';

const TENANT_ID = 'local';

export function registerSessionCommands(program) {
  program
    .command('run')
    .description('Start a new session for a project')
    .requiredOption('--project <id>', 'Project ID')
    .option('--budget <dollars>', 'Cost budget in USD', '5.00')
    .option('--dry-run', 'Dry run — no real Claude calls', false)
    .option('--background', 'Run in background; logs to session.log', false)
    .action(async (opts) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(opts.project)) {
        out.error('Project ID must contain only letters, numbers, hyphens, and underscores.');
        process.exit(1);
      }

      // HIGH-1: validate budget before initSession
      const budget = parseFloat(opts.budget);
      if (!Number.isFinite(budget) || budget <= 0) {
        out.error('--budget must be a positive number (e.g. --budget 5.00)');
        process.exit(1);
      }

      if (opts.dryRun) config.dryRun = true;

      const session = await initSession({
        tenantId: TENANT_ID,
        projectId: opts.project,
        costBudget: budget,
        dryRun: opts.dryRun,
      });

      out.header(`Session ${session.sessionId}`);
      out.log('session', `Project: ${opts.project} | Budget: $${opts.budget}${opts.dryRun ? ' | DRY RUN' : ''}`);

      if (opts.background) {
        await spawnBackground(session, opts);
        return;
      }

      const agentPM = new AgentPM(session);
      await runSession(session, agentPM);
    });
}

async function spawnBackground(session, opts) {
  const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT || './workspaces');
  const logFile = path.join(workspaceRoot, session.tenantId, session.projectId, 'session.log');

  session.runtime.background = true;
  session.runtime.logFile = logFile;
  await saveSession(session);

  // Spawn `glowing-spoon resume --session <id>` as detached child — inherits env (API keys).
  // resume uses the persisted session (including dryRun flag) so no extra args needed.
  const logStream = createWriteStream(logFile, { flags: 'a' });
  await new Promise(resolve => logStream.once('open', resolve));

  const child = spawn(
    process.execPath,
    [process.argv[1], 'resume', '--session', session.sessionId],
    { detached: true, stdio: ['ignore', logStream, logStream] }
  );
  child.unref();

  session.runtime.pid = child.pid;
  await saveSession(session);

  out.success(`Session running in background (PID ${child.pid})`);
  out.log('session', `Session ID : ${session.sessionId}`);
  out.log('session', `Log        : ${logFile}`);
  out.log('session', `Status     : glowing-spoon status  --session ${session.sessionId}`);
  out.log('session', `Approve    : glowing-spoon approve --session ${session.sessionId}`);
  out.log('session', `Stop       : glowing-spoon stop    --session ${session.sessionId}`);
}
