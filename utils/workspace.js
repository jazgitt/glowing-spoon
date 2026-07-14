import fs from 'fs/promises';
import path from 'path';
import * as out from './output.js';

const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_ROOT || './workspaces');

export function getWorkspacePath(tenantId, projectId) {
  const result = path.resolve(WORKSPACE_ROOT, tenantId, projectId);
  if (!result.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Path traversal blocked: ${tenantId}/${projectId}`);
  }
  return result;
}

const VAULT_TOKEN_LIMITS = {
  'guardrails.md':   2_000,
  'patterns.md':     3_000,
  'architecture.md': 4_000,
  'stack.md':        1_000,
  'decisions.md':    2_000,
};

// Maps vault need key → file name
const VAULT_FILE_MAP = {
  guardrails:   'guardrails.md',
  patterns:     'patterns.md',
  architecture: 'architecture.md',
  stack:        'stack.md',
  decisions:    'decisions.md',
};

// Maps spec need key → folder-relative glob
const SPEC_FILE_MAP = {
  stories:      'stories.md',
  requirements: 'requirements.md',
};

export async function validateWorkspace(tenantId, projectId) {
  const base = getWorkspacePath(tenantId, projectId);
  try {
    await fs.access(base);
  } catch {
    throw new Error(`Workspace not found: ${base}. Run: glowing-spoon workspace init --project ${projectId}`);
  }

  // Warn on vault files that exceed token limits
  for (const [filename, limitTokens] of Object.entries(VAULT_TOKEN_LIMITS)) {
    const filePath = path.join(base, 'context-vault', filename);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const tokens = Math.ceil(content.length / 4);
      if (tokens > limitTokens) {
        const costPerSession = ((tokens - limitTokens) / 1_000_000 * 3.00).toFixed(4);
        out.warn(`${filename} is ${tokens.toLocaleString()} tokens — limit is ${limitTokens.toLocaleString()}. Extra $${costPerSession}/session.`);
      }
    } catch {
      // File missing — not an error at validation time
    }
  }

  return true;
}

// LOW-2: hard caps prevent unbounded context injection from ballooning API costs.
// ~4 chars per token; vault sum = max per-file limits (12 k tokens → 48 k chars);
// specs cap = 10 k tokens → 40 k chars.
const MAX_VAULT_CHARS = 48_000;
const MAX_SPECS_CHARS = 40_000;

export async function loadSelectiveVault(tenantId, projectId, needs = []) {
  const base = path.join(getWorkspacePath(tenantId, projectId), 'context-vault');

  // Always inject guardrails + patterns
  const alwaysInject = ['guardrails', 'patterns'];
  const allNeeds = [...new Set([...alwaysInject, ...needs])];

  const sections = [];
  for (const need of allNeeds) {
    // Allowlist only — never use the raw need as a filename (path traversal).
    const filename = VAULT_FILE_MAP[need];
    if (!filename) {
      out.warn(`[vault] unknown vault need "${need}" — skipped`);
      continue;
    }
    const filePath = path.join(base, filename);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (content.trim()) {
        sections.push(`## ${filename}\n\n${content.trim()}`);
      }
    } catch {
      // Vault file doesn't exist yet — skip silently
    }
  }

  const joined = sections.join('\n\n---\n\n');
  if (joined.length > MAX_VAULT_CHARS) {
    out.warn(`Context vault truncated to ${MAX_VAULT_CHARS} chars (was ${joined.length}). Trim vault files to reduce cost.`);
    return joined.slice(0, MAX_VAULT_CHARS);
  }
  return joined;
}

export async function loadSpecs(tenantId, projectId) {
  const specsDir = path.join(getWorkspacePath(tenantId, projectId), 'specs');
  const sections = [];
  try {
    const files = await fs.readdir(specsDir);
    for (const file of files.filter(f => f.endsWith('.md'))) {
      const content = await fs.readFile(path.join(specsDir, file), 'utf8');
      if (content.trim()) {
        sections.push(`## ${file}\n\n${content.trim()}`);
      }
    }
  } catch {
    // specs dir missing — return empty
  }
  const joined = sections.join('\n\n---\n\n');
  if (joined.length > MAX_SPECS_CHARS) {
    out.warn(`Specs truncated to ${MAX_SPECS_CHARS} chars (was ${joined.length}). Split large specs into smaller files to avoid truncation.`);
    return joined.slice(0, MAX_SPECS_CHARS);
  }
  return joined;
}

export async function loadProductMd(tenantId, projectId) {
  const filePath = path.join(getWorkspacePath(tenantId, projectId), 'PRODUCT.md');
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

