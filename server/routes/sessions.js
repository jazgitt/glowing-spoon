// Session lifecycle + decision endpoints. Every control action is an authenticated
// wrapper over the engine's file-based channel (store/file-store.js) — this server
// is the auth layer file-store.js:131 calls for.
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { initSession, loadSession } from '../../engine/session.js';
import {
  lookupSession, getSession, getPending, writeResponse, writeInbox, writeStopFlag,
} from '../../store/file-store.js';
import { getWorkspacePath } from '../../utils/workspace.js';
import { PROJECT_ID_PATTERN } from '../../utils/workspace-init.js';
import { spawnSessionRunner, isPidAlive, isSessionRunning } from '../services/spawner.js';
import { publicSession } from '../services/session-view.js';
import { subscribe } from '../services/session-watcher.js';
import { audit } from '../services/audit.js';

const TENANT_ID = 'local';

export const sessionsRouter = Router();

// --- helpers -----------------------------------------------------------------

// Resolves a session id → { session, pending } or responds 404 and returns null.
async function resolve(req, res) {
  let entry = null;
  try {
    entry = await lookupSession(req.params.id); // validates uuid format, throws if bad
  } catch {
    res.status(400).json({ error: 'Invalid session id' });
    return null;
  }
  if (!entry) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  const session = await getSession(entry.tenantId, entry.projectId);
  if (!session) {
    res.status(404).json({ error: 'Session file missing' });
    return null;
  }
  const pending = await getPending(entry.tenantId, entry.projectId);
  return { session, pending };
}

// --- start (nested under project for clarity) ---------------------------------

sessionsRouter.post('/start', async (req, res) => {
  const { projectId, budget = 5, dryRun = false } = req.body ?? {};
  if (!PROJECT_ID_PATTERN.test(projectId ?? '')) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  const parsedBudget = Number(budget);
  if (!Number.isFinite(parsedBudget) || parsedBudget <= 0 || parsedBudget > 1000) {
    return res.status(400).json({ error: 'Budget must be a positive number (max 1000)' });
  }
  if (!dryRun && !process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server. Enable dry-run or add the key to .env.' });
  }

  const existing = await getSession(TENANT_ID, projectId);
  if (existing && isSessionRunning(existing)) {
    return res.status(409).json({ error: 'A session is already running for this project', sessionId: existing.sessionId });
  }

  let session;
  try {
    session = await initSession({
      tenantId: TENANT_ID,
      projectId,
      costBudget: parsedBudget,
      dryRun: Boolean(dryRun),
    });
  } catch (err) {
    // code (e.g. NO_SPECS, WORKSPACE_NOT_READY) lets the UI offer the right next
    // step; items carries the readiness checklist so it can mark what's missing.
    return res.status(400).json({ error: err.message, code: err.code, items: err.items });
  }

  const pid = await spawnSessionRunner(session);
  await audit(req.user, 'session.start', { projectId, sessionId: session.sessionId, budget: parsedBudget, dryRun: Boolean(dryRun), pid });
  res.status(201).json({ session: publicSession(session, null) });
});

// --- lifecycle -----------------------------------------------------------------

sessionsRouter.get('/:id', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  res.json({ session: publicSession(ctx.session, ctx.pending) });
});

sessionsRouter.post('/:id/resume', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  const { session } = ctx;
  if (session.status === 'complete') {
    return res.status(409).json({ error: 'Session already complete — nothing to resume' });
  }
  if (isPidAlive(session.runtime?.pid)) {
    return res.status(409).json({ error: 'Session runner is already alive' });
  }
  if (!session.dryRun && !process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' });
  }
  const fresh = await loadSession(session.sessionId);
  const pid = await spawnSessionRunner(fresh);
  await audit(req.user, 'session.resume', { sessionId: session.sessionId, pid });
  res.json({ ok: true, pid });
});

sessionsRouter.post('/:id/stop', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  const { session } = ctx;
  if (session.status === 'complete') {
    return res.status(409).json({ error: 'Session already complete' });
  }
  await writeStopFlag(session.tenantId, session.projectId);
  if (isPidAlive(session.runtime?.pid)) {
    try { process.kill(session.runtime.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  await audit(req.user, 'session.stop', { sessionId: session.sessionId });
  res.json({ ok: true });
});

// --- decisions -------------------------------------------------------------------
// Guard: approve/reject are only valid while something is actually pending. Without
// this, a stale .response.json would silently auto-approve the NEXT block the user
// never saw (the response-file race).

sessionsRouter.post('/:id/approve', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  if (!ctx.pending) {
    return res.status(409).json({ error: 'Nothing is awaiting approval right now' });
  }
  await writeResponse(ctx.session.tenantId, ctx.session.projectId, { action: 'approve' });
  await audit(req.user, 'session.approve', { sessionId: ctx.session.sessionId, pendingType: ctx.pending.type });
  res.json({ ok: true });
});

sessionsRouter.post('/:id/reject', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  if (!ctx.pending) {
    return res.status(409).json({ error: 'Nothing is awaiting approval right now' });
  }
  const feedback = req.body?.feedback;
  if (typeof feedback !== 'string' || feedback.trim().length === 0 || feedback.length > 2000) {
    return res.status(400).json({ error: 'Feedback is required (max 2000 characters)' });
  }
  await writeResponse(ctx.session.tenantId, ctx.session.projectId, { action: 'reject', feedback });
  await audit(req.user, 'session.reject', { sessionId: ctx.session.sessionId, pendingType: ctx.pending.type, feedback: feedback.slice(0, 200) });
  res.json({ ok: true });
});

sessionsRouter.post('/:id/message', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  const { message, scope = false } = req.body ?? {};
  if (typeof message !== 'string' || message.trim().length === 0 || message.length > 2000) {
    return res.status(400).json({ error: 'Message is required (max 2000 characters)' });
  }
  const finalMessage = scope ? `SCOPE: ${message}` : message;
  await writeInbox(ctx.session.tenantId, ctx.session.projectId, finalMessage);
  await audit(req.user, 'session.message', { sessionId: ctx.session.sessionId, scope: Boolean(scope) });
  res.json({ ok: true });
});

// --- live event stream (SSE) --------------------------------------------------

sessionsRouter.get('/:id/events', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  const { session } = ctx;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: don't buffer the stream
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Initial snapshot so the client renders immediately, then live updates.
  send('state', publicSession(session, ctx.pending));

  const unsubscribe = subscribe(session.tenantId, session.projectId, send);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// --- log tail (REST backfill for the live log; SSE streams only new lines) ---------

sessionsRouter.get('/:id/log', async (req, res) => {
  const ctx = await resolve(req, res);
  if (!ctx) return;
  const { session } = ctx;
  const logFile = path.join(getWorkspacePath(session.tenantId, session.projectId), 'session.log');
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  try {
    const stat = await fs.stat(logFile);
    if (offset >= stat.size) {
      return res.json({ offset: stat.size, content: '' });
    }
    const handle = await fs.open(logFile, 'r');
    try {
      const length = Math.min(stat.size - offset, 256 * 1024);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      res.json({ offset: offset + length, content: buffer.toString('utf8') });
    } finally {
      await handle.close();
    }
  } catch {
    res.json({ offset: 0, content: '' });
  }
});
