# Output Store

Agent output is written directly to `output/` inside the workspace. Every run overwrites the previous output — only the latest version of each file is kept.

## engine/output-store.js

```javascript
export async function saveAgentOutput({ tenantId, projectId, files }) {
  const outputPath = path.resolve(getWorkspacePath(tenantId, projectId), 'output');
  for (const file of files) {
    const fullPath = path.resolve(outputPath, file.relativePath);
    // path traversal guard
    if (!fullPath.startsWith(outputPath + path.sep)) {
      throw new Error(`Path traversal blocked: ${file.relativePath}`);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content);  // overwrites on retry
  }
}
```

Files are parsed from agent output using `// filepath:` directives:

```javascript
export function parseFilesFromOutput(text) {
  // returns [{ relativePath, content }]
  // drops absolute paths and directory traversal attempts silently
}
```

Output structure after a full pipeline run:

```
workspaces/local/<project>/output/
  specs/          ← spec-agent output
  src/            ← dev-agent output
  review/         ← review-agent output
  tests/          ← qa-agent output
  docs/           ← docs-agent output
```
