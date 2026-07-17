import { initSession } from '../../engine/session.js';
import { AgentPM } from '../../engine/agent-pm.js';
import { runSession } from '../../engine/session-runner.js';
import { config } from '../../utils/config.js';
import * as out from '../../utils/output.js';

const TENANT_ID = 'local';

export function registerAssembleCommands(program) {
  program
    .command('assemble')
    .description('Assemble existing output/ into a runnable prototype/ (no new stories)')
    .requiredOption('--project <id>', 'Project ID')
    .option('--budget <dollars>', 'Cost budget in USD', '2.00')
    .option('--dry-run', 'Dry run — no real Claude calls, canned prototype', false)
    .action(async (opts) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(opts.project)) {
        out.error('Project ID must contain only letters, numbers, hyphens, and underscores.');
        process.exit(1);
      }

      const budget = parseFloat(opts.budget);
      if (!Number.isFinite(budget) || budget <= 0) {
        out.error('--budget must be a positive number (e.g. --budget 2.00)');
        process.exit(1);
      }

      if (opts.dryRun) config.dryRun = true;

      let session;
      try {
        session = await initSession({
          tenantId: TENANT_ID,
          projectId: opts.project,
          costBudget: budget,
          dryRun: opts.dryRun,
          mode: 'assemble-only',
        });
      } catch (err) {
        out.error(err.message);
        process.exit(1);
      }

      out.header(`Assembly session ${session.sessionId}`);
      out.log('session', `Project: ${opts.project} | Budget: $${opts.budget}${opts.dryRun ? ' | DRY RUN' : ''}`);

      const agentPM = new AgentPM(session);
      await runSession(session, agentPM);
    });
}
