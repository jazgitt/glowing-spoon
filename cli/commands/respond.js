import { writeResponse } from '../../store/file-store.js';
import { loadSession } from '../../engine/session.js';
import * as out from '../../utils/output.js';

export function registerRespondCommands(program) {
  program
    .command('respond')
    .description('Send a free-form message to Agent PM during an active session')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--message <text>', 'Message to send to Agent PM')
    .action(async (opts) => {
      const session = await loadSession(opts.session);
      await writeResponse(session.tenantId, session.projectId, {
        action: 'message',
        message: opts.message,
      });
      out.success('Message sent to Agent PM');
    });
}
