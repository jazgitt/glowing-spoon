import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';

const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_ROOT || './workspaces');

function assertValidSessionId(sessionId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }
}

function registryFilePath(sessionId) {
  return path.join(WORKSPACE_ROOT, 'local', '.sessions', `${sessionId}.json`);
}

async function writeRegistry(session) {
  const dir = path.join(WORKSPACE_ROOT, 'local', '.sessions');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    registryFilePath(session.sessionId),
    JSON.stringify({ tenantId: session.tenantId, projectId: session.projectId, createdAt: session.createdAt }, null, 2)
  );
}

export async function lookupSession(sessionId) {
  assertValidSessionId(sessionId);
  try {
    const raw = await fs.readFile(registryFilePath(sessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sessionFilePath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.session.json');
}

function pendingFilePath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.pending.json');
}

function responseFilePath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.response.json');
}

export async function saveSession(session) {
  session.updatedAt = Date.now();
  await fs.writeFile(sessionFilePath(session.tenantId, session.projectId),
    JSON.stringify(session, null, 2));
  await writeRegistry(session);
}

export async function getSession(tenantId, projectId) {
  try {
    const raw = await fs.readFile(sessionFilePath(tenantId, projectId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteSession(tenantId, projectId) {
  await fs.unlink(sessionFilePath(tenantId, projectId)).catch(() => {});
  await fs.unlink(pendingFilePath(tenantId, projectId)).catch(() => {});
  await fs.unlink(responseFilePath(tenantId, projectId)).catch(() => {});
}

export async function updateAgentPMHistory(tenantId, projectId, conversationHistory) {
  const session = await getSession(tenantId, projectId);
  if (!session) return;
  session.agentPM.conversationHistory = conversationHistory;
  await saveSession(session);
}

// ---------------------------------------------------------------------------
// Inbox — PM messages queued between pipeline stages (non-blocking)
// ---------------------------------------------------------------------------

function inboxFilePath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.inbox.json');
}

// Append one message to the inbox. Safe for concurrent CLI → runner writes at Phase 1 scale.
export async function writeInbox(tenantId, projectId, message) {
  const filePath = inboxFilePath(tenantId, projectId);
  let messages = [];
  try { messages = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch {}
  messages.push({ message, timestamp: Date.now() });
  await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
}

// Read all queued messages, delete the inbox file, return the array.
export async function drainInbox(tenantId, projectId) {
  const filePath = inboxFilePath(tenantId, projectId);
  try {
    const messages = JSON.parse(await fs.readFile(filePath, 'utf8'));
    await fs.unlink(filePath).catch(() => {});
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stop flag — graceful shutdown signal written by `glowing-spoon stop`
// ---------------------------------------------------------------------------

function stopFlagPath(tenantId, projectId) {
  return path.join(getWorkspacePath(tenantId, projectId), '.stop');
}

export async function writeStopFlag(tenantId, projectId) {
  await fs.writeFile(stopFlagPath(tenantId, projectId), '1');
}

export async function clearStopFlag(tenantId, projectId) {
  await fs.unlink(stopFlagPath(tenantId, projectId)).catch(() => {});
}

export async function checkStopFlag(tenantId, projectId) {
  try {
    await fs.access(stopFlagPath(tenantId, projectId));
    return true;
  } catch {
    return false;
  }
}

// MEDIUM-2 (SECURITY — Phase 2 blocker):
// writePending / pollResponse / writeResponse implement an unauthenticated local control
// channel: any process that can write .response.json can approve plans or inject messages
// into the Agent PM prompt. This is acceptable for Phase 1 (single local user, CLI only).
// Before Phase 2 (multi-user): replace this file-based channel with an authenticated,
// per-tenant transport (e.g. signed tokens over a local socket or HTTP endpoint). Do NOT
// carry this pattern into a networked or multi-tenant deployment.
export async function writePending(tenantId, projectId, pending) {
  await fs.writeFile(pendingFilePath(tenantId, projectId), JSON.stringify(pending, null, 2));
}

export async function getPending(tenantId, projectId) {
  try {
    const raw = await fs.readFile(pendingFilePath(tenantId, projectId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const DEFAULT_POLL_TIMEOUT_MS = parseInt(process.env.POLL_TIMEOUT_MS, 10) || 30 * 60 * 1000;

// Only two response shapes exist (written by `approve` and `reject`). Anything else
// is malformed or tampered — must never be treated as an approval (default-deny).
function isValidResponse(response) {
  if (!response || typeof response !== 'object') return false;
  if (response.action === 'approve') return true;
  if (response.action === 'reject') {
    return typeof response.feedback === 'string' && response.feedback.length <= 2000;
  }
  return false;
}

// Blocks until .response.json appears, then returns and cleans up both files.
// Rejects with Error('POLL_TIMEOUT') if no response arrives within timeoutMs.
// Rejects with Error('INVALID_PM_RESPONSE') if the response file is malformed.
export async function pollResponse(tenantId, projectId, intervalMs = 2000, timeoutMs = DEFAULT_POLL_TIMEOUT_MS) {
  const rPath = responseFilePath(tenantId, projectId);
  const pPath = pendingFilePath(tenantId, projectId);

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      let response;
      try {
        const raw = await fs.readFile(rPath, 'utf8');
        response = JSON.parse(raw);
      } catch {
        // File not yet written — keep polling
        return;
      }
      clearInterval(interval);
      clearTimeout(timer);
      await fs.unlink(rPath).catch(() => {});
      await fs.unlink(pPath).catch(() => {});
      if (isValidResponse(response)) {
        resolve(response);
      } else {
        reject(new Error('INVALID_PM_RESPONSE'));
      }
    }, intervalMs);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('POLL_TIMEOUT'));
    }, timeoutMs);
  });
}

export async function writeResponse(tenantId, projectId, response) {
  await fs.writeFile(responseFilePath(tenantId, projectId), JSON.stringify(response, null, 2));
}
