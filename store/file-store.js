import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || './workspaces';

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

// Blocks until .response.json appears, then returns and cleans up both files.
export async function pollResponse(tenantId, projectId, intervalMs = 2000) {
  const rPath = responseFilePath(tenantId, projectId);
  const pPath = pendingFilePath(tenantId, projectId);

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const raw = await fs.readFile(rPath, 'utf8');
        const response = JSON.parse(raw);
        clearInterval(interval);
        await fs.unlink(rPath).catch(() => {});
        await fs.unlink(pPath).catch(() => {});
        resolve(response);
      } catch {
        // File not yet written — keep polling
      }
    }, intervalMs);
  });
}

export async function writeResponse(tenantId, projectId, response) {
  await fs.writeFile(responseFilePath(tenantId, projectId), JSON.stringify(response, null, 2));
}
