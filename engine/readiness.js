// Mandatory-inputs gate for the Specs stage.
//
// A session built on stub inputs is wasted spend: empty guardrails/patterns give
// every agent free rein, an empty tech stack lets each story invent its own, and
// the assembler inherits an unreconcilable mess (see bp-tracker-99 post-mortem).
// checkReadiness() is the single source of truth for what "ready" means; it is
// enforced as a hard stop in initSession() and re-checked as a visible step at
// the top of the Specs stage in the session runner.
//
// draftReadinessFiles() fills failing items from the PM's initial comments in
// PRODUCT.md — generated content is always written for PM review, never
// silently trusted.
import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';
import { callClaude } from '../utils/claude.js';
import { parseFilesFromOutput } from './output-store.js';
import * as out from '../utils/output.js';

const MIN_DESCRIPTION_CHARS = 40;
const MIN_STACK_CHARS = 10;
const MIN_VAULT_CHARS = 40; // beyond the "# file.md" heading a stub file has

function stripHeadings(md) {
  return md.replace(/^#{1,6}\s.*$/gm, '').trim();
}

// Returns the body of a "## <name>" section, or null if the heading is absent.
function sectionBody(md, name) {
  const lines = md.split('\n');
  const headingRe = new RegExp(`^##\\s+${name}\\s*$`, 'i');
  const start = lines.findIndex(l => headingRe.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,2}\s/.test(l));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n').trim();
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The checklist. Every item: { id, label, mandatory, status: 'ok'|'stub'|'missing',
// detail, fix }. Mandatory items with status !== 'ok' are hard stops.
// ---------------------------------------------------------------------------

export async function checkReadiness(tenantId, projectId) {
  const ws = getWorkspacePath(tenantId, projectId);
  const items = [];

  // --- PRODUCT.md: description + tech stack -------------------------------
  const product = (await readIfExists(path.join(ws, 'PRODUCT.md'))) ?? '';
  const stackSection = sectionBody(product, 'Tech Stack');
  const description = stripHeadings(
    stackSection ? product.replace(stackSection, '') : product
  );

  items.push({
    id: 'product-description',
    label: 'PRODUCT.md — product description',
    mandatory: true,
    status: product === '' ? 'missing' : description.length >= MIN_DESCRIPTION_CHARS ? 'ok' : 'stub',
    detail: product === ''
      ? 'PRODUCT.md does not exist'
      : description.length >= MIN_DESCRIPTION_CHARS
        ? ''
        : `needs a few sentences describing the product (currently ${description.length} chars; minimum ${MIN_DESCRIPTION_CHARS})`,
    fix: 'Write what the product is and who it is for — every generated file is drafted from this.',
  });

  items.push({
    id: 'product-stack',
    label: 'PRODUCT.md — ## Tech Stack section',
    mandatory: true,
    status: (stackSection ?? '').length >= MIN_STACK_CHARS ? 'ok' : stackSection === null ? 'missing' : 'stub',
    detail: stackSection === null
      ? 'no "## Tech Stack" heading in PRODUCT.md'
      : stackSection.length >= MIN_STACK_CHARS
        ? ''
        : 'the "## Tech Stack" section is empty',
    fix: 'Name the stack (e.g. "React 18, TypeScript, Express, Vite") — without it every story invents its own.',
  });

  // --- specs/: at least one real story with acceptance criteria ------------
  let specStatus = 'missing';
  let specDetail = 'specs/ has no .md files';
  try {
    const specFiles = (await fs.readdir(path.join(ws, 'specs'))).filter(f => f.endsWith('.md'));
    for (const f of specFiles) {
      const content = (await readIfExists(path.join(ws, 'specs', f))) ?? '';
      if (!content.trim()) continue;
      specStatus = 'stub';
      specDetail = `specs exist but no "## Story" heading with acceptance criteria found`;
      if (/^##\s+Story/im.test(content) && /acceptance criteria/i.test(content)) {
        specStatus = 'ok';
        specDetail = '';
        break;
      }
    }
  } catch { /* specs dir missing */ }

  items.push({
    id: 'specs-stories',
    label: 'specs/ — user stories with acceptance criteria',
    mandatory: true,
    status: specStatus,
    detail: specDetail,
    fix: 'Add stories under "## Story N: <title>" headings, each with an "Acceptance criteria:" list.',
  });

  // --- context vault -------------------------------------------------------
  const vaultChecks = [
    { file: 'guardrails.md',   mandatory: true,  why: 'always injected into every agent — empty means no rules are enforced' },
    { file: 'patterns.md',     mandatory: true,  why: 'always injected into every agent — empty means no shared conventions' },
    { file: 'stack.md',        mandatory: true,  why: 'the contract that keeps every story on one stack' },
    { file: 'architecture.md', mandatory: false, why: 'helps agents place new code in the intended structure' },
    { file: 'decisions.md',    mandatory: false, why: 'records choices later stories must not contradict' },
  ];

  for (const { file, mandatory, why } of vaultChecks) {
    const content = await readIfExists(path.join(ws, 'context-vault', file));
    const body = content === null ? '' : stripHeadings(content);
    items.push({
      id: `vault-${file.replace('.md', '')}`,
      label: `context-vault/${file}`,
      mandatory,
      status: content === null ? 'missing' : body.length >= MIN_VAULT_CHARS ? 'ok' : 'stub',
      detail: content === null ? 'file does not exist'
        : body.length >= MIN_VAULT_CHARS ? ''
        : `stub — only a heading, no content (${why})`,
      fix: `Fill it in, or draft it from PRODUCT.md: glowing-spoon workspace prepare --project ${projectId}`,
    });
  }

  return {
    items,
    ready: items.every(i => !i.mandatory || i.status === 'ok'),
  };
}

// Prints the checklist in session/CLI output. Returns the failing mandatory items.
export function printReadiness(items) {
  const failing = [];
  for (const item of items) {
    const tag = item.mandatory ? '[MANDATORY]  ' : '[RECOMMENDED]';
    if (item.status === 'ok') {
      out.log('session', `PASS ${tag} ${item.label}`);
    } else if (item.mandatory) {
      out.error(`FAIL ${tag} ${item.label} — ${item.detail}`);
      failing.push(item);
    } else {
      out.warn(`SKIP ${tag} ${item.label} — ${item.detail}`);
    }
  }
  return failing;
}

export function readinessError(projectId, items) {
  const missing = items.filter(i => i.mandatory && i.status !== 'ok');
  const lines = missing.map(i => `  [MANDATORY] ${i.label} — ${i.detail}. ${i.fix}`);
  return Object.assign(
    new Error(
      `Workspace "${projectId}" is missing mandatory inputs — sessions are blocked until they exist:\n` +
      lines.join('\n') + '\n' +
      `Check:  glowing-spoon workspace check --project ${projectId}\n` +
      `Draft:  glowing-spoon workspace prepare --project ${projectId}  (generates the missing files from PRODUCT.md for your review)`
    ),
    { code: 'WORKSPACE_NOT_READY', items }
  );
}

// ---------------------------------------------------------------------------
// Drafting — generate failing items from the PM's initial comments (PRODUCT.md
// plus any existing spec notes). Writes ONLY items that are missing/stub, never
// overwrites real content. The PM reviews everything before running a session.
// ---------------------------------------------------------------------------

// Destination allowlist: model output can only land on these paths.
const DRAFTABLE = {
  'specs/stories.md':            'specs-stories',
  'context-vault/guardrails.md': 'vault-guardrails',
  'context-vault/patterns.md':   'vault-patterns',
  'context-vault/stack.md':      'vault-stack',
  'context-vault/architecture.md': 'vault-architecture',
  'PRODUCT-tech-stack.md':       'product-stack', // merged into PRODUCT.md, see below
};

const DRAFT_SYSTEM = `You bootstrap a project workspace for an AI-native engineering team.
From the product notes you receive, produce ONLY the requested files, each preceded by a line:
// filepath: <path>

File requirements:
- specs/stories.md: 6-8 small, independently buildable user stories. Format each as
  "## Story N: <title>", an "As a <user>, I want <capability> so that <benefit>." line,
  then "Acceptance criteria:" with 3-6 bullets. Order so earlier stories unblock later ones.
- PRODUCT-tech-stack.md: 1-3 plain lines naming the exact tech stack (frameworks + versions), nothing else.
- context-vault/stack.md: concrete stack conventions as bullets — language, module system,
  file extensions, where routes/models/components live, naming. Every story's code must fit these.
- context-vault/guardrails.md: 5-10 hard rules agents must never break for THIS product
  (e.g. validation lives in one shared module, no second implementation of an existing module,
  all data access goes through the service layer).
- context-vault/patterns.md: shared code conventions — error handling shape, API response shape,
  component structure, test naming.
- context-vault/architecture.md: one-page structure — layers, folders, how frontend talks to backend,
  where state lives.

Be concrete and specific to the product described. No placeholders, no "TBD".`;

export async function draftReadinessFiles({ tenantId, projectId }) {
  const ws = getWorkspacePath(tenantId, projectId);
  const { items } = await checkReadiness(tenantId, projectId);
  const byId = Object.fromEntries(items.map(i => [i.id, i]));

  if (byId['product-description'].status !== 'ok') {
    throw Object.assign(
      new Error('PRODUCT.md needs at least a few sentences describing the product first — ' +
        'that description is the seed everything else is drafted from.'),
      { code: 'NO_PRODUCT_DESCRIPTION' }
    );
  }

  const wanted = Object.entries(DRAFTABLE)
    .filter(([, itemId]) => byId[itemId] && byId[itemId].status !== 'ok')
    .map(([file]) => file);

  if (wanted.length === 0) {
    return { drafted: [], skipped: 'all mandatory inputs already have content' };
  }

  // Notes = PRODUCT.md + any existing spec notes (may be rough).
  const sections = [];
  const product = (await readIfExists(path.join(ws, 'PRODUCT.md'))) ?? '';
  sections.push(`## PRODUCT.md\n${product.trim()}`);
  try {
    for (const f of (await fs.readdir(path.join(ws, 'specs'))).filter(f => f.endsWith('.md'))) {
      const content = (await readIfExists(path.join(ws, 'specs', f))) ?? '';
      if (content.trim()) sections.push(`## specs/${f}\n${content.trim()}`);
    }
  } catch { /* no specs dir */ }

  // Pre-session one-off: tenantId/projectId deliberately omitted so no session
  // budget is required (same convention as the web server's generate-specs).
  const response = await callClaude({
    systemPrompt: DRAFT_SYSTEM,
    userPrompt:
      `Product notes:\n\n${sections.join('\n\n---\n\n').slice(0, 30_000)}\n\n` +
      `Produce ONLY these files:\n${wanted.map(f => `- ${f}`).join('\n')}`,
    agentId: 'spec-agent',
  });

  const files = parseFilesFromOutput(response.content[0].text);
  const drafted = [];

  for (const file of files) {
    const rel = file.relativePath.split(path.sep).join('/');
    if (!wanted.includes(rel)) continue; // allowlist: ignore anything not requested

    if (rel === 'PRODUCT-tech-stack.md') {
      await mergeTechStack(ws, file.content);
      drafted.push('PRODUCT.md (## Tech Stack section)');
      continue;
    }
    const abs = path.join(ws, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.content.trim() + '\n');
    drafted.push(rel);
  }

  return { drafted, requested: wanted };
}

// Inserts drafted stack lines into PRODUCT.md's empty "## Tech Stack" section
// (or appends the section if the heading is missing). Never touches a section
// that already has content.
async function mergeTechStack(ws, stackText) {
  const productPath = path.join(ws, 'PRODUCT.md');
  const product = (await readIfExists(productPath)) ?? '';
  const clean = stackText.trim();
  if (!clean) return;

  const existing = sectionBody(product, 'Tech Stack');
  if (existing !== null && existing.length > 0) return; // real content — hands off

  let next;
  if (existing === null) {
    next = product.trimEnd() + `\n\n## Tech Stack\n${clean}\n`;
  } else {
    // Replacer function — clean may contain "$" sequences a replacement string would mangle.
    next = product.replace(/^##\s+Tech Stack\s*$/im, (heading) => `${heading}\n${clean}`);
  }
  await fs.writeFile(productPath, next);
}
