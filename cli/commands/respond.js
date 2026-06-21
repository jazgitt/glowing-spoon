import { loadSession } from '../../engine/session.js';
import { writeInbox } from '../../store/file-store.js';
import * as out from '../../utils/output.js';

export function registerRespondCommands(program) {
  program
    .command('respond')
    .description('Send a message to Agent PM (processed between pipeline stages)')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--message <text>', 'Message for Agent PM (prefix with "SCOPE: " for a plan revision)')
    .action(async (opts) => {
      if (opts.message.length > 2000) {
        out.error('Message must be 2000 characters or fewer.');
        process.exit(1);
      }
      const session = await loadSession(opts.session);
      await writeInbox(session.tenantId, session.projectId, opts.message);
      out.success('Message queued — Agent PM will process it between pipeline stages.');
      out.log('respond', 'Prefix message with "SCOPE: " to trigger a plan revision.');
      out.log('respond', 'Otherwise the message is treated as a question and answered in the log.');
    });
}
