import chalk from 'chalk';
import { appendFileSync } from 'fs';

// Structured event sink for the web UI: when GS_EVENT_FILE is set (by the web
// server's spawner), every output call also appends a JSONL event. No-op for
// normal CLI use, and a sink failure must never break the session.
function emit(evt) {
  const file = process.env.GS_EVENT_FILE;
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify({ ts: Date.now(), ...evt }) + '\n');
  } catch {
    // Never let event logging interfere with the session.
  }
}

const PREFIX = {
  'agent-pm':           chalk.cyan('[agent-pm]    '),
  'spec-agent':         chalk.blue('[spec-agent]  '),
  'dev-agent':          chalk.green('[dev-agent]   '),
  'review-agent':       chalk.magenta('[review-agent]'),
  'qa-agent':           chalk.yellow('[qa-agent]    '),
  'docs-agent':         chalk.white('[docs-agent]  '),
  'integration-agent':  chalk.greenBright('[integration] '),
  'cost-agent':         chalk.cyanBright('[cost-agent]  '),
  'compliance-agent':   chalk.redBright('[compliance]  '),
  'pitch-agent':        chalk.magentaBright('[pitch-agent] '),
  'teardown-agent':     chalk.yellowBright('[teardown]    '),
  'assembler-agent':    chalk.greenBright('[assembler]   '),
  'quality':            chalk.blue('[quality]     '),
  'cost':               chalk.gray('[cost]        '),
  'session':            chalk.white('[session]     '),
  'skill-resolver':     chalk.gray('[skills]      '),
};

function prefix(agentId) {
  return PREFIX[agentId] ?? chalk.white(`[${agentId}]`.padEnd(14));
}

export function log(agentId, message) {
  console.log(`${prefix(agentId)} ${message}`);
  emit({ type: 'log', agentId, message });
}

export function pending(message) {
  console.log(chalk.yellow(`\n[PENDING]      ${message}`));
  emit({ type: 'pending', message });
}

export function warn(message) {
  console.log(chalk.yellow(`[WARN]         ${message}`));
  emit({ type: 'warn', message });
}

export function error(message) {
  console.log(chalk.red(`[ERROR]        ${message}`));
  emit({ type: 'error', message });
}

export function blocked(message) {
  console.log(chalk.red(`\n[BLOCKED]      ${message}`));
  emit({ type: 'blocked', message });
}

export function success(message) {
  console.log(chalk.green(`[✓]            ${message}`));
  emit({ type: 'success', message });
}

export function info(message) {
  console.log(chalk.gray(`               ${message}`));
  emit({ type: 'info', message });
}

export function cost({ agentId, callCost, sessionTotal, budget }) {
  const pct = Math.round((sessionTotal / budget) * 100);
  const colorFn = pct >= 100 ? chalk.red : pct >= 80 ? chalk.yellow : chalk.gray;
  const callStr = `$${callCost.toFixed(4)}`;
  const totalStr = `$${sessionTotal.toFixed(4)}`;
  console.log(colorFn(`[cost]         ${callStr} this call | ${totalStr} total (${pct}% of $${budget})`));
  emit({ type: 'cost', agentId, callCost, sessionTotal, budget });
}

// Stream Claude output chunk-by-chunk without newline
export function chunk(text) {
  process.stdout.write(text);
}

// End a streaming section with a newline
export function chunkEnd() {
  process.stdout.write('\n');
}

export function divider() {
  console.log(chalk.gray('─'.repeat(60)));
}

export function header(message) {
  console.log('');
  console.log(chalk.bold(message));
  console.log(chalk.gray('─'.repeat(60)));
  emit({ type: 'header', message });
}
