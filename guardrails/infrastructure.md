# Infrastructure: Output Writer & File Store

## Output Writer (utils/output.js)

Replaces the streamer. All agent output goes to stdout via chalk. No SSE, no server.

```javascript
import chalk from "chalk";

const PREFIX = {
  "agent-pm":     chalk.cyan("[agent-pm]"),
  "spec-agent":   chalk.blue("[spec-agent]"),
  "dev-agent":    chalk.green("[dev-agent]"),
  "review-agent": chalk.magenta("[review-agent]"),
  "qa-agent":     chalk.yellow("[qa-agent]"),
  "docs-agent":   chalk.white("[docs-agent]"),
  "quality":      chalk.blue("[quality]"),
  "cost":         chalk.gray("[cost]"),
  "session":      chalk.white("[session]"),
};

export function log(agentId, message) {
  console.log(`${PREFIX[agentId] ?? chalk.white(`[${agentId}]`)}  ${message}`);
}

export function pending(message) {
  console.log(chalk.yellow(`\n[PENDING]  ${message}`));
}

export function warn(message) {
  console.log(chalk.yellow(`[WARN]     ${message}`));
}

export function error(message) {
  console.log(chalk.red(`[ERROR]    ${message}`));
}

export function blocked(message) {
  console.log(chalk.red(`\n[BLOCKED]  ${message}`));
}

export function success(message) {
  console.log(chalk.green(`[✓]        ${message}`));
}

export function cost({ agentId, callCost, sessionTotal, budget }) {
  const pct = Math.round((sessionTotal / budget) * 100);
  const color = pct >= 80 ? chalk.red : pct >= 60 ? chalk.yellow : chalk.gray;
  console.log(color(`[cost]     $${callCost.toFixed(4)} this call | $${sessionTotal.toFixed(4)} session total (${pct}% of $${budget} budget)`));
}

// Streaming chunks from Claude — write without newline, flush on complete
export function chunk(agentId, text) {
  process.stdout.write(text);
}
```

## File Store (store/file-store.js)

Replaces memory-store. State is written to disk on every change so separate CLI commands can read it.

```javascript
import fs from "fs/promises";
import path from "path";
import { getWorkspacePath } from "../utils/workspace.js";

function sessionPath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.session.json');
}

export async function saveSession(session) {
  const p = sessionPath(session.tenantId, session.projectId);
  session.updatedAt = Date.now();
  await fs.writeFile(p, JSON.stringify(session, null, 2));
}

export async function getSession(tenantId, projectId) {
  try {
    const raw = await fs.readFile(sessionPath(tenantId, projectId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writePending(tenantId, projectId, pending) {
  const p = path.join(getWorkspacePath(tenantId, projectId), '.pending.json');
  await fs.writeFile(p, JSON.stringify(pending, null, 2));
}

export async function pollResponse(tenantId, projectId, intervalMs = 2000) {
  const p = path.join(getWorkspacePath(tenantId, projectId), '.response.json');
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const response = JSON.parse(raw);
        clearInterval(interval);
        await fs.unlink(p);
        await fs.unlink(path.join(getWorkspacePath(tenantId, projectId), '.pending.json')).catch(() => {});
        resolve(response);
      } catch { /* file not yet written */ }
    }, intervalMs);
  });
}

export async function writeResponse(tenantId, projectId, response) {
  const p = path.join(getWorkspacePath(tenantId, projectId), '.response.json');
  await fs.writeFile(p, JSON.stringify(response, null, 2));
}
```
