// Workspace creation/seeding — shared by the CLI (cli/commands/workspace.js) and the
// web server. Resolves repo assets (defaults/, examples/) relative to this file, not
// process.cwd(), so it works no matter where the process was launched from.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWorkspacePath } from './workspace.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function assertProjectId(projectId) {
  if (!PROJECT_ID_PATTERN.test(projectId ?? '')) {
    throw Object.assign(
      new Error('Project ID must contain only letters, numbers, hyphens, and underscores.'),
      { code: 'INVALID_PROJECT_ID' }
    );
  }
}

// Creates a fresh workspace. Throws { code: 'WORKSPACE_EXISTS' } if already present.
export async function initWorkspace({ tenantId = 'local', projectId, name, description = '', stack = '' }) {
  assertProjectId(projectId);
  const workspacePath = getWorkspacePath(tenantId, projectId);

  try {
    await fs.access(workspacePath);
    throw Object.assign(new Error(`Workspace already exists at ${workspacePath}`), { code: 'WORKSPACE_EXISTS' });
  } catch (err) {
    if (err.code === 'WORKSPACE_EXISTS') throw err;
    // Does not exist — proceed
  }

  await fs.mkdir(path.join(workspacePath, 'specs'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'context-vault'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'output', 'versions'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'session-history'), { recursive: true });

  await fs.writeFile(
    path.join(workspacePath, 'PRODUCT.md'),
    `# ${name}\n\n${description}\n\n## Tech Stack\n${stack}\n`
  );

  const vaultFiles = ['guardrails.md', 'patterns.md', 'architecture.md', 'stack.md', 'decisions.md'];
  for (const f of vaultFiles) {
    await fs.writeFile(path.join(workspacePath, 'context-vault', f), `# ${f}\n\n`);
  }

  // Seed stack conventions so per-story dev-agent output converges on something
  // the assembler-agent can wire together without heavy reconciliation.
  await fs.writeFile(
    path.join(workspacePath, 'context-vault', 'stack.md'),
    `# stack.md\n\n${stack ? stack + '\n\n' : ''}` +
    `- ES modules only (import/export) — no require/module.exports\n` +
    `- TypeScript preferred for backend code; React function components (.tsx) for UI\n` +
    `- Express routers exported as default from src/routes/*.ts\n` +
    `- Frontend routing assumes React Router\n`
  );

  const defaultPrompt = await fs.readFile(path.join(REPO_ROOT, 'defaults', 'agent-pm-prompt.md'), 'utf8');
  await fs.writeFile(path.join(workspacePath, 'context-vault', 'agent-pm-prompt.md'), defaultPrompt);

  return workspacePath;
}

// Copies the built-in login-app example into the workspace (creates or overwrites files).
// Returns { workspacePath, existed } — existed=true means files were overwritten.
export async function seedWorkspace({ tenantId = 'local', projectId }) {
  assertProjectId(projectId);
  const workspacePath = getWorkspacePath(tenantId, projectId);
  const examplePath = path.join(REPO_ROOT, 'examples', 'login-app');

  try {
    await fs.access(examplePath);
  } catch {
    throw Object.assign(new Error(`Example not found at ${examplePath}`), { code: 'EXAMPLE_MISSING' });
  }

  let existed = true;
  try {
    await fs.access(workspacePath);
  } catch {
    existed = false;
  }

  await copyDir(examplePath, workspacePath);

  // Ensure required runtime directories exist even if example doesn't include them.
  await fs.mkdir(path.join(workspacePath, 'output', 'versions'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'session-history'), { recursive: true });

  return { workspacePath, existed };
}

// Lists project ids under the tenant root (workspace directories only).
export async function listWorkspaces(tenantId = 'local') {
  const root = path.join(path.resolve(process.env.WORKSPACE_ROOT || './workspaces'), tenantId);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
}
