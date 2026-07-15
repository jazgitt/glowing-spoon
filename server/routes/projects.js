// Project (workspace) endpoints: list/create/seed, editable files, output browser,
// session history. All file access is confined to the workspace via
// getWorkspacePath()'s traversal guard plus per-area filename allowlists.
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath, hasSpecs } from '../../utils/workspace.js';
import { initWorkspace, seedWorkspace, listWorkspaces, PROJECT_ID_PATTERN } from '../../utils/workspace-init.js';
import { callClaude } from '../../utils/claude.js';
import { getSession, getPending } from '../../store/file-store.js';
import { isPidAlive, isSessionRunning, isRunnerDead } from '../services/spawner.js';
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
  try {
    const product = await fs.readFile(path.join(getWorkspacePath(TENANT_ID, projectId), 'PRODUCT.md'), 'utf8');
    const heading = product.match(/^#\s+(.+)$/m);
    if (heading) productName = heading[1].trim();
  } catch { /* no PRODUCT.md yet */ }

  return {
    id: projectId,
    name: productName,
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
