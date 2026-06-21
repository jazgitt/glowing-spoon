#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[ERROR] ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}
import { registerWorkspaceCommands } from './commands/workspace.js';
import { registerSessionCommands } from './commands/session.js';
import { registerPlanCommands } from './commands/plan.js';
import { registerApproveCommands } from './commands/approve.js';
import { registerRejectCommands } from './commands/reject.js';
import { registerRespondCommands } from './commands/respond.js';

program
  .name('glowing-spoon')
  .description('AI-native engineering platform — multi-agent software builder')
  .version('1.0.0');

registerWorkspaceCommands(program);
registerSessionCommands(program);
registerPlanCommands(program);
registerApproveCommands(program);
registerRejectCommands(program);
registerRespondCommands(program);

program.parse();
