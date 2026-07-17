// Process utility for the assembler-agent's build verification and the preview
// runner. No LLM calls here — pure child_process orchestration.
import { spawn } from 'child_process';

// Allowlist enforced BEFORE any `npm install`. The assembler LLM chooses the
// dependencies, so an unvetted package name is the realistic attack surface
// (typosquats, malicious postinstall). Exact-name match on deps + devDeps.
export const DEPENDENCY_ALLOWLIST = new Set([
  'react', 'react-dom', 'react-router-dom',
  'express', 'cors', 'bcryptjs', 'jsonwebtoken',
  'pg-mem', 'sequelize', 'zod', 'uuid',
  'vite', '@vitejs/plugin-react', 'typescript', 'tsx', 'concurrently',
  '@types/express', '@types/react', '@types/react-dom', '@types/node',
  '@types/jsonwebtoken', '@types/bcryptjs', '@types/cors', '@types/uuid',
]);

// Returns the list of disallowed dependency names ([] = ok).
// Throws on unparseable JSON — callers surface that as a build error.
export function validateDependencies(pkgJsonContent) {
  const pkg = JSON.parse(pkgJsonContent);
  const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  return all.filter((d) => !DEPENDENCY_ALLOWLIST.has(d));
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
