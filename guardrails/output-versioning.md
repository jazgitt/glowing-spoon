# Output Versioning

Dev Agent never overwrites. Every output run creates a new version directory.

## engine/output-store.js

```javascript
export async function saveAgentOutput({ tenantId, projectId, sessionId, agentId, files, trigger }) {
  const version = await incrementVersion(tenantId, projectId, sessionId, agentId);
  const versionPath = path.join(
    getWorkspacePath(tenantId, projectId),
    'output', 'versions', `v${version}`
  );

  for (const file of files) {
    const fullPath = path.join(versionPath, file.relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content);
  }

  await fs.writeFile(path.join(versionPath, 'manifest.json'), JSON.stringify({
    version, agentId, sessionId, tenantId, projectId,
    timestamp: Date.now(),
    files: files.map(f => f.relativePath),
    trigger,  // "initial" | "retry" | "pm-feedback"
  }, null, 2));

  return { version, versionPath };
}

export async function promoteToCurrentVersion({ tenantId, projectId, version }) {
  // JSON pointer instead of symlink — works on Windows without elevated privileges
  const base = getWorkspacePath(tenantId, projectId);
  await fs.writeFile(
    path.join(base, 'output', 'current.json'),
    JSON.stringify({ version, path: `versions/v${version}` }, null, 2)
  );
}

export async function getCurrentVersion(tenantId, projectId) {
  const base = getWorkspacePath(tenantId, projectId);
  const pointer = JSON.parse(
    await fs.readFile(path.join(base, 'output', 'current.json'), 'utf8')
  );
  return { version: pointer.version, versionPath: path.join(base, 'output', pointer.path) };
}
```

`promoteToCurrentVersion()` is only called after quality gate passes. UI `VersionDiff.jsx` shows PM what changed between v1 and v2 on retry.
