# Workspace Structure & Initialization

## Product Workspace Layout

Resolved at runtime from tenantId + projectId. Never hardcoded.

```
/workspaces/{tenantId}/{projectId}/
  PRODUCT.md                       ← product name, description, tech stack, session goal
  /specs
    stories.md
    requirements.md
    figma-notes.md
    *.md                           ← any number of spec files, all loaded
  /context-vault
    agent-pm-prompt.md             ← Agent PM system prompt — tunable per project
    architecture.md
    patterns.md
    guardrails.md                  ← NEVER trimmed from context, always injected
    stack.md
    decisions.md
  /output
    /versions
      /v1
        /src
        /tests
        /docs
        manifest.json              ← agent, session, timestamp, files, trigger reason
      /v2                          ← after retry — v1 never deleted
    /current.json                  ← { "version": N, "path": "versions/vN" } — no symlinks (Windows-safe)
  /session-history
    {sessionId}.json               ← full session record, append-only log
```

## glowing-spoon workspace init

Workspaces are never created manually. Run `glowing-spoon workspace init` to scaffold one.

```javascript
// cli/commands/workspace.js — init action
export async function initWorkspace({ projectId, productName, description, techStack }) {
  const tenantId = "local";  // MVP hardcoded
  const workspacePath = getWorkspacePath(tenantId, projectId);

  await fs.mkdir(path.join(workspacePath, 'specs'),                { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'context-vault'),        { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'output', 'versions'),   { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'session-history'),      { recursive: true });

  await fs.writeFile(path.join(workspacePath, 'PRODUCT.md'),
    `# ${productName}\n\n${description}\n\n## Tech Stack\n${techStack}\n`);

  const vaultFiles = ['guardrails.md', 'patterns.md', 'architecture.md', 'stack.md', 'decisions.md'];
  for (const f of vaultFiles) {
    await fs.writeFile(path.join(workspacePath, 'context-vault', f), `# ${f}\n\n`);
  }

  await fs.writeFile(
    path.join(workspacePath, 'context-vault', 'agent-pm-prompt.md'),
    await fs.readFile(path.join(process.cwd(), 'defaults', 'agent-pm-prompt.md'), 'utf8')
  );

  output.success(`Workspace created at ${workspacePath}`);
  output.log('session', 'Fill in context-vault/ files before starting a session.');
}
```

## Vault File Size Limits (utils/workspace.js)

Enforced during `validateWorkspace()`. Warn PM — do not block.

```javascript
const VAULT_TOKEN_LIMITS = {
  "guardrails.md":   2_000,
  "patterns.md":     3_000,
  "architecture.md": 4_000,
  "stack.md":        1_000,
  "decisions.md":    2_000,
};
// If exceeded: emit Tier 2 WARNING explaining cost impact. Log excess. Let PM decide.
```

## Mandatory Inputs (hard stop — enforced by engine/readiness.js)

A session refuses to start (`WORKSPACE_NOT_READY`) until every MANDATORY item exists with real content, and the checklist is printed as the first visible step of the Specs stage:

| Item | Level | Why |
|---|---|---|
| PRODUCT.md — description (≥40 chars) | MANDATORY | The seed everything else is drafted from |
| PRODUCT.md — `## Tech Stack` section | MANDATORY | Without it every story invents its own stack |
| specs/ — `## Story` headings with acceptance criteria | MANDATORY | Empty specs make agents hallucinate requirements |
| context-vault/guardrails.md (non-stub) | MANDATORY | Always injected — empty means no rules enforced |
| context-vault/patterns.md (non-stub) | MANDATORY | Always injected — empty means no shared conventions |
| context-vault/stack.md (non-stub) | MANDATORY | The contract keeping every story on one stack |
| context-vault/architecture.md | RECOMMENDED | Placement of new code |
| context-vault/decisions.md | RECOMMENDED | Choices later stories must not contradict |

`glowing-spoon workspace check --project X` prints the checklist; `glowing-spoon workspace prepare --project X` drafts failing items from PRODUCT.md (the PM's initial comments) for review — generated files are never trusted unreviewed and real content is never overwritten. Web equivalents: `GET /api/projects/:id/readiness`, `POST /api/projects/:id/prepare`.

## Cross-Story Handoff (output/handoff.md)

After each story's checkpoint approval the runner appends what the story built (mechanical, no LLM) to `output/handoff.md`. The dev-agent receives this plus the full content of shared contract files (`src/models|services|store|hooks|routes|…`) via `readCodebaseContext()` — story N extends story N-1 instead of reinventing it.
