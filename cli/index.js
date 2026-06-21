#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';

// Only commands that call the Claude API need a key. Let workspace/status/approve/reject/
// stop/plan run freely so users can manage sessions without having an API key configured yet.
const API_REQUIRED_COMMANDS = new Set(['run', 'resume']);
const firstArg = process.argv[2];
const hasKey = process.env.ANTHROPIC_API_KEY || process.env.API_KEY_1;
if (API_REQUIRED_COMMANDS.has(firstArg) && !hasKey) {
  console.error('[ERROR] No API key configured. Set API_KEY_1 (or ANTHROPIC_API_KEY) in your .env file.');
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
