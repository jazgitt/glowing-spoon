import fs from 'fs/promises';
import path from 'path';
import { createSession } from '../store/session-schema.js';
import {
  saveSession, getSession, lookupSession, updateAgentPMHistory,
  checkStopFlag, clearStopFlag,
} from '../store/file-store.js';
import { validateWorkspace, getWorkspacePath, hasSpecs } from '../utils/workspace.js';
import { loadProductMd } from './context-loader.js';
import * as out from '../utils/output.js';

export async function initSession({ tenantId, projectId, costBudget, dryRun = false, mode = 'full' }) {
  await validateWorkspace(tenantId, projectId);

  if (mode === 'assemble-only') {
    // Assembly reads output/src, not specs — guard on generated code existing.
    const srcDir = path.join(getWorkspacePath(tenantId, projectId), 'output', 'src');
    const hasOutput = await fs.readdir(srcDir).then(f => f.length > 0).catch(() => false);
    if (!hasOutput) {
      throw Object.assign(
        new Error(`No generated code in output/src for "${projectId}". Run a full session first.`),
        { code: 'NO_OUTPUT' }
      );
    }
  } else if (!(await hasSpecs(tenantId, projectId))) {
    // Empty specs make every downstream agent hallucinate requirements and the
    // planner collapse to one oversized story — refuse before any spend.
    throw Object.assign(
      new Error(`No specs found for "${projectId}". Add at least one story to specs/ ` +
        `(or generate starter stories from your product description) before starting a session.`),
      { code: 'NO_SPECS' }
    );
  }

  const session = createSession({ tenantId, projectId, costBudget, dryRun, mode });
  session.status = 'planning';

  const product = await loadProductMd(tenantId, projectId);
  session.productSummary = product;

  await saveSession(session);
  out.success(`Session ${session.sessionId} initialized`);
  return session;
}

export async function loadSession(sessionId) {
  const entry = await lookupSession(sessionId);
  if (!entry) throw new Error(`Session not found in registry: ${sessionId}`);
  const session = await getSession(entry.tenantId, entry.projectId);
  if (!session) throw new Error(`Session file not found: ${sessionId}`);
  return session;
}

export async function updateSession(session) {
  // tokenUsage is owned by cost-tracker, which read-modify-writes it on disk after
  // every API call. The runner's long-lived in-memory session is stale for that field —
  // adopt the disk copy before saving so a runner write never clobbers spend totals.
  const onDisk = await getSession(session.tenantId, session.projectId);
  if (onDisk?.tokenUsage) session.tokenUsage = onDisk.tokenUsage;
  session.updatedAt = Date.now();
  await saveSession(session);
  return session;
}

export async function syncAgentPMHistory(session, agentPM) {
  session.agentPM.conversationHistory = agentPM.conversationHistory;
  await updateAgentPMHistory(session.tenantId, session.projectId, agentPM.conversationHistory);
}

export async function setSessionStatus(session, status) {
  session.status = status;
  await updateSession(session);
}

export async function recordAgentStart(session, agentId) {
  session.agents[agentId].status = 'running';
  session.currentStep = agentId;
  out.log(agentId, 'Starting...');
  await updateSession(session);
}

export async function recordAgentComplete(session, agentId, scores) {
  session.agents[agentId].status = 'idle';
  if (scores) session.agents[agentId].scores.push(scores);
  session.completedSteps.push({ agentId, timestamp: Date.now() });
  await updateSession(session);
}

export async function recordAgentRetry(session, agentId, reason) {
  session.agents[agentId].retryCount += 1;
  out.warn(`[${agentId}] Retry ${session.agents[agentId].retryCount}/2 — ${reason}`);
  await updateSession(session);
}

export async function recordPMFeedback(session, feedback, context = '') {
  session.pmFeedback.push({ feedback, context, timestamp: Date.now() });
  await updateSession(session);
}

export async function addToAttentionQueue(session, item) {
  session.attentionQueue.push({ ...item, timestamp: Date.now(), resolved: false });
  await updateSession(session);
}

export async function resolveAttentionItem(session, index) {
  if (session.attentionQueue[index]) {
    session.attentionQueue[index].resolved = true;
    await updateSession(session);
  }
}

// Persist the pipeline cursor so resume can continue from the right stage.
// checkpointData: pass explicitly to set, omit to leave unchanged, null to clear.
export async function setPipelineCursor(session, storyIndex, stage, checkpointData) {
  session.pipeline.storyIndex = storyIndex;
  session.pipeline.stage = stage;
  if (checkpointData !== undefined) session.pipeline.checkpointData = checkpointData;
  await updateSession(session);
}

// Write a session summary to session-history/ for post-mortem and audit.
export async function archiveSession(session) {
  const dir = path.join(getWorkspacePath(session.tenantId, session.projectId), 'session-history');
  await fs.mkdir(dir, { recursive: true });
  const archive = {
    sessionId: session.sessionId,
    projectId: session.projectId,
    tenantId: session.tenantId,
    status: session.status,
    completedSteps: session.completedSteps,
    currentPlan: session.agentPM?.currentPlan ?? null,
    tokenUsage: session.tokenUsage,
    costBudget: session.costBudget,
    attentionQueue: session.attentionQueue,
    pipeline: { storyIndex: session.pipeline.storyIndex, stage: session.pipeline.stage },
    createdAt: session.createdAt,
    completedAt: Date.now(),
  };
  await fs.writeFile(
    path.join(dir, `${session.sessionId}.json`),
    JSON.stringify(archive, null, 2)
  );
}

// Returns true if a stop flag was written by `glowing-spoon stop`.
export async function shouldStop(session) {
  return checkStopFlag(session.tenantId, session.projectId);
}

export { clearStopFlag };
