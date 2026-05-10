import { loadSession } from '../../engine/session.js';
import * as out from '../../utils/output.js';

export function registerPlanCommands(program) {
  program
    .command('plan')
    .description('Show the current execution plan for a session')
    .requiredOption('--session <id>', 'Session ID')
    .action(async (opts) => {
      const session = await loadSession(opts.session);
      out.header('Current Plan');

      const plan = session.agentPM?.currentPlan;
      if (!plan) {
        out.log('plan', 'No plan found. Is the session still initializing?');
        return;
      }

      out.log('plan', JSON.stringify(plan, null, 2));
      out.divider();
      out.log('session', `Status: ${session.status}`);
      out.log('session', `Current step: ${session.currentStep ?? 'none'}`);
      out.log('session', `Completed: ${session.completedSteps.length} steps`);
    });
}
