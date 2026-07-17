import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../utils/workspace.js';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 500_000;

export async function saveAgentOutput({ tenantId, projectId, files, subdir = 'output' }) {
  if (files.length > MAX_FILES) {
    throw new Error(`Agent output contains too many files: ${files.length} (max ${MAX_FILES})`);
  }
  const outputPath = path.resolve(getWorkspacePath(tenantId, projectId), subdir);
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

// Build a capped digest of everything in output/ for the MVP report agents.
// Full content for specs and docs; file list + first lines for code.
export async function readOutputDigest({ tenantId, projectId, maxChars = 40_000 }) {
  const outputPath = path.resolve(getWorkspacePath(tenantId, projectId), 'output');

  async function walk(dir) {
    const results = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'report') continue; // don't feed reports back into reports
        results.push(...await walk(full));
      } else {
        results.push(full);
      }
    }
    return results;
  }

  const files = await walk(outputPath);
  const sections = [];
  for (const file of files) {
    const rel = path.relative(outputPath, file).split(path.sep).join('/');
    let content;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const isProse = rel.endsWith('.md');
    const cap = isProse ? 4_000 : 1_500;
    sections.push(`### ${rel}\n${content.slice(0, cap)}`);
  }

  return sections.join('\n\n').slice(0, maxChars);
}

// Full source content for the assembler-agent — unlike readOutputDigest's
// 1.5k-char snippets, import reconciliation needs whole files. Walks only
// output/src; if over budget, drops the largest test files first, then the
// largest remaining files, so app code survives truncation longest.
export async function readSourceFiles({ tenantId, projectId, maxChars = 120_000 }) {
  const srcPath = path.resolve(getWorkspacePath(tenantId, projectId), 'output', 'src');

  async function walk(dir) {
    const results = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...await walk(full));
      else results.push(full);
    }
    return results;
  }

  const files = [];
  for (const file of await walk(srcPath)) {
    let content;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue; // binary or unreadable — skip
    }
    const rel = 'src/' + path.relative(srcPath, file).split(path.sep).join('/');
    files.push({ rel, content, isTest: /\.test\.|\.spec\./.test(rel) });
  }

  let total = files.reduce((n, f) => n + f.content.length, 0);
  if (total > maxChars) {
    // Drop tests first (largest first), then largest app files, until we fit.
    const droppable = [...files].sort((a, b) =>
      (b.isTest - a.isTest) || (b.content.length - a.content.length));
    for (const f of droppable) {
      if (total <= maxChars) break;
      total -= f.content.length;
      f.dropped = true;
    }
  }

  const kept = files.filter(f => !f.dropped);
  const droppedNames = files.filter(f => f.dropped).map(f => f.rel);
  let result = kept.map(f => `### ${f.rel}\n${f.content}`).join('\n\n');
  if (droppedNames.length > 0) {
    result += `\n\n### [OMITTED FOR SIZE]\n${droppedNames.join('\n')}`;
  }
  return result;
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
