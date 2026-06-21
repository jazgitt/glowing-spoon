import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 500_000;

async function getCurrentVersionNumber(tenantId, projectId) {
  const pointerPath = path.join(getWorkspacePath(tenantId, projectId), 'output', 'current.json');
  try {
    const raw = await fs.readFile(pointerPath, 'utf8');
    return JSON.parse(raw).version;
  } catch {
    return 0;
  }
}

export async function saveAgentOutput({ tenantId, projectId, sessionId, agentId, files, trigger }) {
  if (files.length > MAX_FILES) {
    throw new Error(`Agent output contains too many files: ${files.length} (max ${MAX_FILES})`);
  }
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`File too large: ${file.relativePath} (${bytes} bytes, max ${MAX_FILE_BYTES})`);
    }
  }

  const currentVersion = await getCurrentVersionNumber(tenantId, projectId);
  const version = currentVersion + 1;
  const versionPath = path.resolve(
    getWorkspacePath(tenantId, projectId),
    'output', 'versions', `v${version}`
  );

  for (const file of files) {
    const fullPath = path.resolve(versionPath, file.relativePath);
    if (!fullPath.startsWith(versionPath + path.sep)) {
      throw new Error(`Path traversal blocked: ${file.relativePath}`);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content);
  }

  const manifest = {
    version, agentId, sessionId, tenantId, projectId,
    timestamp: Date.now(),
    files: files.map(f => f.relativePath),
    trigger,
  };
  await fs.writeFile(path.join(versionPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { version, versionPath };
}

export async function promoteToCurrentVersion({ tenantId, projectId, version }) {
  const base = getWorkspacePath(tenantId, projectId);
  await fs.writeFile(
    path.join(base, 'output', 'current.json'),
    JSON.stringify({ version, path: `versions/v${version}` }, null, 2)
  );
}

export async function getCurrentVersion(tenantId, projectId) {
  const base = getWorkspacePath(tenantId, projectId);
  const raw = await fs.readFile(path.join(base, 'output', 'current.json'), 'utf8');
  const pointer = JSON.parse(raw);
  if (!/^versions\/v\d+$/.test(pointer.path)) {
    throw new Error(`Corrupt current.json: invalid path "${pointer.path}"`);
  }
  return { version: pointer.version, versionPath: path.join(base, 'output', pointer.path) };
}

// Parse agent output text into { relativePath, content }[] using filepath comments.
// Silently drops any path that is absolute or attempts directory traversal.
export function parseFilesFromOutput(text) {
  const files = [];
  const regex = /\/\/ filepath: (.+?)\n([\s\S]*?)(?=\n\/\/ filepath: |$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawPath = match[1].trim();
    const content = match[2].trim();
    if (!rawPath || !content) continue;
    const normalized = path.normalize(rawPath);
    if (path.isAbsolute(normalized) || normalized.startsWith('..')) continue;
    files.push({ relativePath: normalized, content });
  }
  return files;
}
