#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';

// Only commands that call the Claude API need a key. Let workspace/status/approve/reject/
// stop/plan run freely so users can manage sessions without having an API key configured yet.
const API_REQUIRED_COMMANDS = new Set(['run', 'resume']);
const firstArg = process.argv[2];
if (API_REQUIRED_COMMANDS.has(firstArg) && !process.env.OPENROUTER_API_KEY) {
  console.error('[ERROR] OPENROUTER_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}
import { registerWorkspaceCommands } from './commands/workspace.js';
import { registerSessionCommands } from './commands/session.js';
import { registerResumeCommands } from './commands/resume.js';
import { registerPlanCommands } from './commands/plan.js';
import { registerStatusCommands } from './commands/status.js';
import { registerApproveCommands } from './commands/approve.js';
import { registerRejectCommands } from './commands/reject.js';
import { registerRespondCommands } from './commands/respond.js';
import { registerStopCommands } from './commands/stop.js';

program
  .name('glowing-spoon')
  .description('AI-native engineering platform — multi-agent software builder')
  .version('1.0.0');

registerWorkspaceCommands(program);
registerSessionCommands(program);
registerResumeCommands(program);
registerPlanCommands(program);
registerStatusCommands(program);
registerApproveCommands(program);
registerRejectCommands(program);
registerRespondCommands(program);
registerStopCommands(program);

program.parse();
