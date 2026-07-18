// Project (workspace) endpoints: list/create/seed, editable files, output browser,
// session history. All file access is confined to the workspace via
// getWorkspacePath()'s traversal guard plus per-area filename allowlists.
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver'; // pinned to v7 — v8 replaced this API with classes
import { getWorkspacePath, hasSpecs } from '../../utils/workspace.js';
import { initWorkspace, seedWorkspace, listWorkspaces, PROJECT_ID_PATTERN } from '../../utils/workspace-init.js';
import { callClaude } from '../../utils/claude.js';
import { getSession, getPending } from '../../store/file-store.js';
import { isPidAlive, isSessionRunning, isRunnerDead, spawnSessionRunner } from '../services/spawner.js';
import { initSession } from '../../engine/session.js';
import { checkReadiness, draftReadinessFiles } from '../../engine/readiness.js';
import { getPreview, hasPrototype, startPreview, stopPreview } from '../services/preview.js';
import { audit } from '../services/audit.js';

const TENANT_ID = 'local';

export const projectsRouter = Router();

// --- helpers ---------------------------------------------------------------

function assertProjectParam(req, res) {
  if (!PROJECT_ID_PATTERN.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid project id' });
    return false;
  }
  return true;
}

const VAULT_FILES = ['guardrails.md', 'patterns.md', 'architecture.md', 'stack.md', 'decisions.md', 'agent-pm-prompt.md'];
const SPEC_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*\.md$/;

// Maps (area, name) → path relative to the workspace, or null if not allowed.
// Editable surface is deliberately small: PRODUCT.md, specs/*.md, context-vault allowlist.
function editablePath(area, name) {
  if (area === 'product') return 'PRODUCT.md';
  if (area === 'vault') {
    return VAULT_FILES.includes(name) ? path.join('context-vault', name) : null;
  }
  if (area === 'specs') {
    if (typeof name !== 'string' || !SPEC_NAME_PATTERN.test(name) || name.includes('..')) return null;
    return path.join('specs', name);
  }
  return null;
}

async function projectSummary(projectId) {
  const session = await getSession(TENANT_ID, projectId);
  const pending = session ? await getPending(TENANT_ID, projectId) : null;
  let productName = projectId;
  let hasProduct = false;
  try {
    const product = await fs.readFile(path.join(getWorkspacePath(TENANT_ID, projectId), 'PRODUCT.md'), 'utf8');
    const heading = product.match(/^#\s+(.+)$/m);
    if (heading) productName = heading[1].trim();
    // "Described" = more than just the heading scaffold initWorkspace writes.
    hasProduct = product.replace(/^#.*$/m, '').replace(/^##.*$/gm, '').trim().length >= 40;
  } catch { /* no PRODUCT.md yet */ }

  return {
    id: projectId,
    name: productName,
    hasProduct,
    hasSpecs: await hasSpecs(TENANT_ID, projectId),
    session: session ? {
      sessionId: session.sessionId,
      status: session.status,
      dryRun: session.dryRun,
      running: isSessionRunning(session),
      runnerDead: isRunnerDead(session),
      pendingType: pending?.type ?? null,
      storyIndex: session.pipeline?.storyIndex ?? 0,
      storyCount: session.pipeline?.stories?.length ?? 0,
      stage: session.pipeline?.stage ?? null,
      currentStep: session.currentStep,
      costUsed: session.tokenUsage?.total ?? 0,
      costBudget: session.costBudget,
      updatedAt: session.updatedAt,
    } : null,
  };
}

// --- projects ---------------------------------------------------------------

projectsRouter.get('/', async (req, res) => {
  const ids = await listWorkspaces(TENANT_ID);
  const projects = await Promise.all(ids.map(projectSummary));
  res.json({ projects });
});

projectsRouter.post('/', async (req, res) => {
  const { projectId, name, description = '', stack = '' } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Product name is required' });
  }
  try {
    await initWorkspace({ tenantId: TENANT_ID, projectId, name, description, stack });
  } catch (err) {
    const status = err.code === 'WORKSPACE_EXISTS' ? 409
      : err.code === 'INVALID_PROJECT_ID' ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
  await audit(req.user, 'project.create', { projectId });
  res.status(201).json({ project: await projectSummary(projectId) });
});

projectsRouter.post('/:id/seed', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  try {
    await seedWorkspace({ tenantId: TENANT_ID, projectId: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  await audit(req.user, 'project.seed', { projectId: req.params.id });
  res.json({ project: await projectSummary(req.params.id) });
});

projectsRouter.get('/:id', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  try {
    await fs.access(getWorkspacePath(TENANT_ID, req.params.id));
  } catch {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({ project: await projectSummary(req.params.id) });
});

// --- editable files (product / specs / vault) -------------------------------

projectsRouter.get('/:id/files', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const ws = getWorkspacePath(TENANT_ID, req.params.id);
  const area = req.query.area;

  if (area === 'product') return res.json({ files: ['PRODUCT.md'] });
  if (area === 'vault') return res.json({ files: VAULT_FILES });
  if (area === 'specs') {
    try {
      const entries = await fs.readdir(path.join(ws, 'specs'));
      return res.json({ files: entries.filter(f => f.endsWith('.md')).sort() });
    } catch {
      return res.json({ files: [] });
    }
  }
  res.status(400).json({ error: 'area must be product, specs, or vault' });
});

projectsRouter.get('/:id/file', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const rel = editablePath(req.query.area, req.query.name);
  if (!rel) return res.status(400).json({ error: 'File not accessible' });
  try {
    const content = await fs.readFile(path.join(getWorkspacePath(TENANT_ID, req.params.id), rel), 'utf8');
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

projectsRouter.put('/:id/file', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const { area, name, content } = req.body ?? {};
  const rel = editablePath(area, name);
  if (!rel) return res.status(400).json({ error: 'File not accessible' });
  if (typeof content !== 'string' || content.length > 500_000) {
    return res.status(400).json({ error: 'content must be a string under 500 KB' });
  }
  const abs = path.join(getWorkspacePath(TENANT_ID, req.params.id), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
  await audit(req.user, 'file.save', { projectId: req.params.id, file: rel });
  res.json({ ok: true });
});

projectsRouter.delete('/:id/file', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const { area, name } = req.body ?? {};
  if (area !== 'specs') return res.status(400).json({ error: 'Only spec files can be deleted' });
  const rel = editablePath(area, name);
  if (!rel) return res.status(400).json({ error: 'File not accessible' });
  try {
    await fs.unlink(path.join(getWorkspacePath(TENANT_ID, req.params.id), rel));
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  await audit(req.user, 'file.delete', { projectId: req.params.id, file: rel });
  res.json({ ok: true });
});

// --- readiness: the mandatory-inputs checklist sessions are gated on -----------

projectsRouter.get('/:id/readiness', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  try {
    await fs.access(getWorkspacePath(TENANT_ID, req.params.id));
  } catch {
    return res.status(404).json({ error: 'Project not found' });
  }
  const readiness = await checkReadiness(TENANT_ID, req.params.id);
  res.json(readiness);
});

// Drafts every failing mandatory input from PRODUCT.md (plus any spec notes) and
// writes ONLY missing/stub files — real content is never overwritten. The user
// reviews the drafts on the Files page before a session can be started.
projectsRouter.post('/:id/prepare', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server — fill the files in manually instead.' });
  }
  try {
    const result = await draftReadinessFiles({ tenantId: TENANT_ID, projectId: req.params.id });
    await audit(req.user, 'workspace.prepare', { projectId: req.params.id, drafted: result.drafted });
    res.json(result);
  } catch (err) {
    const status = err.code === 'NO_PRODUCT_DESCRIPTION' ? 400 : 502;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- starter stories from the product description -----------------------------
// One-off AI call (goes through utils/claude.js like everything else). Writes
// specs/stories.md. Refuses when specs already exist — never overwrites work.

const DRAFT_SPECS_SYSTEM = `You write user stories for a software MVP.
Given a product description, produce 6-8 small, independently buildable user stories.

Rules:
- Each story must be small enough to implement in a few files (one screen, one flow, one endpoint group).
- Order them so earlier stories unblock later ones.
- Output ONLY markdown in exactly this format, no preamble:

# User Stories

## Story 1: <short title>
As a <user>, I want <capability> so that <benefit>.

Acceptance criteria:
- <criterion>
- <criterion>

(repeat for each story)`;

projectsRouter.post('/:id/generate-specs', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const projectId = req.params.id;
  const ws = getWorkspacePath(TENANT_ID, projectId);

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server — write specs manually instead.' });
  }
  if (await hasSpecs(TENANT_ID, projectId)) {
    return res.status(409).json({ error: 'This project already has specs. Edit them on the Files page instead.' });
  }

  let product = '';
  try {
    product = await fs.readFile(path.join(ws, 'PRODUCT.md'), 'utf8');
  } catch { /* handled below */ }
  if (product.trim().length < 40) {
    return res.status(400).json({ error: 'The product description is too short to draft stories from. Add a few sentences to PRODUCT.md first.' });
  }

  try {
    // tenantId/projectId deliberately omitted: this is a pre-session one-off —
    // no session budget exists yet to check or bill against.
    const response = await callClaude({
      systemPrompt: DRAFT_SPECS_SYSTEM,
      userPrompt: `Product description:\n\n${product.slice(0, 8000)}`,
      agentId: 'spec-agent',
    });
    const stories = response.content?.[0]?.text ?? '';
    if (stories.trim().length < 100) {
      return res.status(502).json({ error: 'The model returned an unusably short draft — try again.' });
    }
    await fs.mkdir(path.join(ws, 'specs'), { recursive: true });
    await fs.writeFile(path.join(ws, 'specs', 'stories.md'), stories.trim() + '\n');
    await audit(req.user, 'specs.generate', { projectId });
    res.status(201).json({ file: 'stories.md' });
  } catch (err) {
    res.status(502).json({ error: `Story drafting failed: ${err.message}` });
  }
});

// --- interactive spec drafting -------------------------------------------------
// Reads the user's notes from ALL editable markdown (PRODUCT.md + every file in
// specs/) and returns a clean, structured draft WITHOUT writing anything. The
// user reviews/edits it in the UI and saves via the normal PUT /file endpoint —
// nothing lands on disk until they approve.

const CLEAN_SPECS_SYSTEM = `You turn rough product notes into clean user stories for a software MVP.
You receive the product description plus every note file the user has written — these may be
messy, redundant, or contradictory. Produce ONE clean, deduplicated set of 6-10 small,
independently buildable user stories that captures everything the notes ask for.

Rules:
- Each story must be small enough to implement in a few files (one screen, one flow, one endpoint group).
- Order them so earlier stories unblock later ones.
- Preserve every concrete requirement from the notes; resolve contradictions in favor of the most recent/specific note and say so in a one-line comment under that story.
- Output ONLY markdown in exactly this format, no preamble:

# User Stories

## Story 1: <short title>
As a <user>, I want <capability> so that <benefit>.

Acceptance criteria:
- <criterion>
- <criterion>

(repeat for each story)`;

projectsRouter.post('/:id/draft-specs', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const projectId = req.params.id;
  const ws = getWorkspacePath(TENANT_ID, projectId);

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' });
  }

  // Gather notes: PRODUCT.md + every spec .md file.
  const sections = [];
  try {
    const product = await fs.readFile(path.join(ws, 'PRODUCT.md'), 'utf8');
    if (product.trim()) sections.push(`## PRODUCT.md\n${product.trim()}`);
  } catch { /* none */ }
  try {
    const specFiles = (await fs.readdir(path.join(ws, 'specs'))).filter(f => f.endsWith('.md'));
    for (const f of specFiles) {
      const content = await fs.readFile(path.join(ws, 'specs', f), 'utf8');
      if (content.trim()) sections.push(`## specs/${f}\n${content.trim()}`);
    }
  } catch { /* none */ }

  const notes = sections.join('\n\n---\n\n').slice(0, 40_000);
  if (notes.trim().length < 40) {
    return res.status(400).json({
      error: 'Not enough notes to draft from. Add a few sentences to the product description or a spec file first.',
    });
  }

  try {
    // tenantId/projectId deliberately omitted: pre-session one-off, no session
    // budget to bill against (same as generate-specs above).
    const response = await callClaude({
      systemPrompt: CLEAN_SPECS_SYSTEM,
      userPrompt: `The user's notes:\n\n${notes}`,
      agentId: 'spec-agent',
    });
    const draft = response.content?.[0]?.text ?? '';
    if (draft.trim().length < 100) {
      return res.status(502).json({ error: 'The model returned an unusably short draft — try again.' });
    }
    await audit(req.user, 'specs.draft', { projectId });
    res.json({ draft: draft.trim() + '\n' });
  } catch (err) {
    res.status(502).json({ error: `Spec drafting failed: ${err.message}` });
  }
});

// --- on-demand assembly --------------------------------------------------------
// Creates an assemble-only session (skips plan/story/report) and spawns it
// detached like any other session — progress streams over the existing SSE.

projectsRouter.post('/:id/assemble', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const projectId = req.params.id;

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' });
  }

  const existing = await getSession(TENANT_ID, projectId);
  if (existing && isSessionRunning(existing)) {
    return res.status(409).json({ error: 'A session is already running for this project. Wait for it to finish.' });
  }

  let session;
  try {
    session = await initSession({
      tenantId: TENANT_ID,
      projectId,
      costBudget: 2.00,
      mode: 'assemble-only',
    });
  } catch (err) {
    const status = err.code === 'NO_OUTPUT' ? 409 : 500;
    return res.status(status).json({ error: err.message });
  }

  try {
    await spawnSessionRunner(session);
  } catch (err) {
    return res.status(500).json({ error: `Failed to start assembly: ${err.message}` });
  }

  await audit(req.user, 'project.assemble', { projectId, sessionId: session.sessionId });
  res.status(201).json({ sessionId: session.sessionId });
});

// --- output browser (read-only) ----------------------------------------------

const MAX_TREE_ENTRIES = 500;

async function walkOutput(dir, base, acc) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_TREE_ENTRIES) return;
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkOutput(abs, rel, acc);
    } else {
      const stat = await fs.stat(abs).catch(() => null);
      acc.push({ path: rel, size: stat?.size ?? 0, modifiedAt: stat?.mtimeMs ?? 0 });
    }
  }
}

projectsRouter.get('/:id/output/tree', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const outputDir = path.join(getWorkspacePath(TENANT_ID, req.params.id), 'output');
  const files = [];
  await walkOutput(outputDir, '', files);
  res.json({ files });
});

projectsRouter.get('/:id/output/file', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const relPath = String(req.query.path ?? '');
  const outputDir = path.join(getWorkspacePath(TENANT_ID, req.params.id), 'output');
  const abs = path.resolve(outputDir, relPath);
  if (!abs.startsWith(outputDir + path.sep)) {
    return res.status(400).json({ error: 'Path traversal blocked' });
  }
  try {
    const stat = await fs.stat(abs);
    if (stat.size > 1_000_000) return res.status(413).json({ error: 'File too large to preview' });
    const content = await fs.readFile(abs, 'utf8');
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Everything in output/ as one zip — cookie-authenticated like every other
// route, so a plain <a href> in the SPA triggers the browser download.
projectsRouter.get('/:id/output/download', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const outputDir = path.join(getWorkspacePath(TENANT_ID, req.params.id), 'output');
  try {
    await fs.access(outputDir);
  } catch {
    return res.status(404).json({ error: 'This project has no output yet' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}-output.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[output/download]', err);
    res.destroy(err);
  });
  archive.pipe(res);
  archive.directory(outputDir, false);
  await audit(req.user, 'output.download', { projectId: req.params.id });
  await archive.finalize();
});

// --- live preview of the assembled prototype -----------------------------------
// See MEDIUM-3 in server/services/preview.js: start executes LLM-generated code,
// user-initiated only, Phase-1 single-local-user.

projectsRouter.get('/:id/preview', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  res.json({
    preview: await getPreview(TENANT_ID, req.params.id),
    hasPrototype: await hasPrototype(TENANT_ID, req.params.id),
  });
});

projectsRouter.post('/:id/preview/start', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  try {
    const preview = await startPreview(TENANT_ID, req.params.id);
    await audit(req.user, 'preview.start', {
      projectId: req.params.id, apiPort: preview.apiPort, webPort: preview.webPort,
    });
    res.status(201).json({ preview });
  } catch (err) {
    const status = ['NO_PROTOTYPE', 'ALREADY_RUNNING'].includes(err.code) ? 409
      : ['DISALLOWED_DEPS', 'BAD_PACKAGE_JSON'].includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

projectsRouter.post('/:id/preview/stop', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  try {
    const preview = await stopPreview(TENANT_ID, req.params.id);
    await audit(req.user, 'preview.stop', { projectId: req.params.id });
    res.json({ preview });
  } catch (err) {
    const status = err.code === 'NOT_RUNNING' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

projectsRouter.get('/:id/preview/log', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const logFile = path.join(getWorkspacePath(TENANT_ID, req.params.id), 'preview.log');
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  try {
    const stat = await fs.stat(logFile);
    const start = Math.min(offset, stat.size);
    const length = Math.min(stat.size - start, 256 * 1024);
    const handle = await fs.open(logFile, 'r');
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      res.json({ offset: start + length, content: buffer.toString('utf8') });
    } finally {
      await handle.close();
    }
  } catch {
    res.json({ offset: 0, content: '' });
  }
});

// --- session history ----------------------------------------------------------

projectsRouter.get('/:id/history', async (req, res) => {
  if (!assertProjectParam(req, res)) return;
  const dir = path.join(getWorkspacePath(TENANT_ID, req.params.id), 'session-history');
  try {
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
    const archives = [];
    for (const f of files) {
      try {
        archives.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')));
      } catch { /* skip corrupt archive */ }
    }
    archives.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    res.json({ archives });
  } catch {
    res.json({ archives: [] });
  }
});
