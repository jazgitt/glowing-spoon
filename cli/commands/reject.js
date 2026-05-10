import { writeResponse } from '../../store/file-store.js';
import { loadSession } from '../../engine/session.js';
import * as out from '../../utils/output.js';

export function registerRejectCommands(program) {
  program
    .command('reject')
    .description('Reject a pending plan or output with feedback')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--feedback <text>', 'Feedback for Agent PM')
    .action(async (opts) => {
      const session = await loadSession(opts.session);
      await writeResponse(session.tenantId, session.projectId, {
        action: 'reject',
        feedback: opts.feedback,
      });
      out.success('Feedback sent — Agent PM will revise');
    });
}
