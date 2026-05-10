import { writeResponse } from '../../store/file-store.js';
import { loadSession } from '../../engine/session.js';
import * as out from '../../utils/output.js';

export function registerApproveCommands(program) {
  program
    .command('approve')
    .description('Approve a pending plan or checkpoint')
    .requiredOption('--session <id>', 'Session ID')
    .action(async (opts) => {
      const session = await loadSession(opts.session);
      await writeResponse(session.tenantId, session.projectId, { action: 'approve' });
      out.success('Approved — session will continue');
    });
}
