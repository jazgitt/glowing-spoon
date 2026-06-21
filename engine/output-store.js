import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 500_000;

export async function saveAgentOutput({ tenantId, projectId, files }) {
  if (files.length > MAX_FILES) {
    throw new Error(`Agent output contains too many files: ${files.length} (max ${MAX_FILES})`);
  }
  const outputPath = path.resolve(getWorkspacePath(tenantId, projectId), 'output');
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`File too large: ${file.relativePath} (${bytes} bytes, max ${MAX_FILE_BYTES})`);
    }
    const fullPath = path.resolve(outputPath, file.relativePath);
    if (!fullPath.startsWith(outputPath + path.sep)) {
      throw new Error(`Path traversal blocked: ${file.relativePath}`);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content);
  }
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
