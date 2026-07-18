// Process utility for the assembler-agent's build verification and the preview
// runner. No LLM calls here — pure child_process orchestration.
import { spawn } from 'child_process';

// Allowlist enforced BEFORE any `npm install`. The assembler LLM chooses the
// dependencies, so an unvetted package name is the realistic attack surface
// (typosquats, malicious postinstall). Exact-name match on deps + devDeps.
export const DEPENDENCY_ALLOWLIST = new Set([
  'react', 'react-dom', 'react-router-dom',
  'express', 'cors', 'bcryptjs', 'jsonwebtoken', 'multer',
  'pg-mem', 'sequelize', 'zod', 'uuid',
  'vite', '@vitejs/plugin-react', 'typescript', 'tsx', 'concurrently',
  '@types/express', '@types/react', '@types/react-dom', '@types/node',
  '@types/jsonwebtoken', '@types/bcryptjs', '@types/cors', '@types/uuid',
  '@types/multer',
]);

// Returns the list of disallowed dependency names ([] = ok).
// Throws on unparseable JSON — callers surface that as a build error.
export function validateDependencies(pkgJsonContent) {
  const pkg = JSON.parse(pkgJsonContent);
  const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  return all.filter((d) => !DEPENDENCY_ALLOWLIST.has(d));
}

// Node builtins that look like bare imports but need no dependency entry.
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'dns', 'events', 'fs', 'http',
  'https', 'net', 'os', 'path', 'process', 'querystring', 'readline', 'stream',
  'string_decoder', 'timers', 'tls', 'url', 'util', 'worker_threads', 'zlib',
]);

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'".][^'"]*)['"]/g;

// `tsc --noEmit` never checks .js files (checkJs is off), so a generated .js
// route importing a package that isn't in package.json only explodes at
// runtime, in front of the user. Scan the assembled sources for bare imports
// that aren't declared — the assembler's retry loop turns these into fixes.
// Returns [{ file, packageName }].
export async function findUndeclaredImports(srcDir, pkgJsonContent) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const pkg = JSON.parse(pkgJsonContent);
  const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));

  const missing = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') await walk(abs);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) continue;
      const content = await fs.readFile(abs, 'utf8').catch(() => '');
      for (const match of content.matchAll(IMPORT_RE)) {
        const spec = match[1];
        if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
        // Bare specifier → package name ("@scope/pkg/sub" → "@scope/pkg").
        const parts = spec.split('/');
        const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        if (NODE_BUILTINS.has(name) || declared.has(name)) continue;
        if (!missing.some(m => m.packageName === name)) {
          missing.push({ file: path.relative(srcDir, abs), packageName: name });
        }
      }
    }
  }
  await walk(srcDir);
  return missing;
}

// Runs a command in cwd, captures combined stdout+stderr (last 60KB — build
// errors live at the end), enforces a wall-clock timeout. Never rejects.
// shell:true is required on Windows to resolve npm.cmd / npx.cmd. Command
// strings must be constants — never interpolate user or LLM input into them.
export function runCommand(command, { cwd, timeoutMs = 300_000, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, ...env },
    });

    let output = '';
    const cap = (d) => { output = (output + d).slice(-60_000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);

    const timer = setTimeout(() => {
      killTree(child.pid);
      resolve({ code: -1, output: output + '\n[TIMEOUT after ' + Math.round(timeoutMs / 1000) + 's]' });
    }, timeoutMs);

    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, output: output + '\n' + String(err) }); });
  });
}

// Kill a spawned process AND its children. npm/vite spawn cmd.exe → node trees
// on Windows; SIGTERM to the root orphans the grandchildren.
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn(`taskkill /pid ${pid} /T /F`, { shell: true, windowsHide: true });
  } else {
    // detached:true put the child in its own process group — signal the group.
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
  }
}

// Parse `tsc --noEmit` output into the {file, line, error} shape the
// session-runner's syntax-error retry loop already understands.
// Falls back to one synthetic entry (e.g. npm install failures) so the
// assembler always gets actionable feedback.
export function parseTscErrors(output) {
  const errors = [];
  const regex = /^(.+?)\((\d+),\d+\): (error TS\d+: .+)$/gm;
  let match;
  while ((match = regex.exec(output)) !== null) {
    errors.push({ file: match[1].trim(), line: parseInt(match[2], 10), error: match[3].trim() });
    if (errors.length >= 30) break; // enough signal for a fix attempt
  }
  if (errors.length === 0) {
    errors.push({ file: 'build', line: 0, error: output.slice(-2_000) || 'Build failed with no output' });
  }
  return errors;
}
