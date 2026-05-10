# GLOWING SPOON — Agentic Engineering Platform

Read this entire file before writing a single line of code. Then read any referenced guardrails file before implementing the corresponding module.

---

## What This Is

Multi-tenant SaaS platform that runs AI-native engineering teams. No human developers. Agents do all work using skills. Multiple PMs run independent projects simultaneously — their data never touches.

```
GLOWING SPOON (this repo — shared platform, tenant-aware)
        +
PRODUCT WORKSPACE (per tenant, per project — specs, vault, output)
```

---

## 10 Foundational Principles

Every design decision follows from these. Internalize them first.

1. **Tenant isolation is absolute.** No query, file read, or agent call ever crosses tenant boundaries. `tenantId + projectId` scope everything.
2. **No agent calls Claude directly.** All Claude API calls go through `utils/claude.js` only.
3. **Context vault is selective, not full.** Each agent declares exactly which vault files it needs. Only those are injected. `guardrails.md` and `patterns.md` are always injected. Nothing else by default.
4. **Agent PM holds the session brain.** It maintains running conversation history for the entire session. Specialist agents are stateless workers.
5. **All failures are typed.** No generic errors. Every failure has a type, a recovery strategy, and a PM notification level.
6. **Output is versioned.** Every agent output is a new version. Retries never overwrite.
7. **Token budget is managed proactively.** Every Claude call knows its budget before it starts. Never silently overflow.
8. **PM attention is scarce.** UI clearly separates informational events (AgentFeed) from events requiring PM action (AttentionQueue).
9. **Right model for right task.** Sonnet for reasoning. Haiku for mechanical tasks (scoring, skill resolution, history compression). Never use Sonnet where Haiku is sufficient.
10. **Cost is tracked in real time.** Every Claude call records token usage and cost. Sessions have a cost budget. PM is warned at 80% and blocked at 100%.

---

## Tenant & Project Data Model

This scopes everything — sessions, file paths, API routes, SSE streams. Even in local MVP, `tenantId` is always `"local"`. Never skip it.

```javascript
{ tenantId: "uuid", projectId: "uuid", sessionId: "uuid" }

function getWorkspacePath(tenantId, projectId) {
  if (process.env.STORAGE === 'local') {
    return path.join(process.env.WORKSPACE_ROOT, tenantId, projectId);
  }
  // Phase 3: return `s3://${bucket}/${tenantId}/${projectId}`;
}
```

---

## Repo Structure

```
/glowing-spoon
  CLAUDE.md
  /guardrails                        ← implementation specs, read before building each module

  /ui/src
    App.jsx
    /views
      WorkspaceSelector.jsx          ← PM selects project; calls POST /workspace/init if needed
      SessionControl.jsx             ← main interactive dashboard
      AgentFeed.jsx                  ← live Tier 1 event stream
      AttentionQueue.jsx             ← Tier 2 BLOCKING items only
      PlanReview.jsx                 ← Agent PM plan: approve or give inline feedback
      QualityPanel.jsx               ← per-agent scores + version history
      OutputViewer.jsx               ← browse generated files, diff between versions
      ContextVaultViewer.jsx
    /components
      AgentCard.jsx
      CheckpointGate.jsx
      SkillBadge.jsx
      StatusDot.jsx
      TokenBudgetBar.jsx             ← live cost vs budget, per-agent breakdown
      VersionDiff.jsx
    /hooks
      useSession.js
      useAgentStream.js              ← SSE connection, scoped to tenantId+sessionId

  /engine
    agent-pm.js                      ← orchestrator, session brain
    session.js
    context-loader.js
    quality-gate.js
    skill-resolver.js
    token-manager.js
    output-store.js

  /agents
    /spec-agent/index.js + /skills
    /dev-agent/index.js  + /skills
    /review-agent/index.js + /skills
    /qa-agent/index.js   + /skills
    /docs-agent/index.js + /skills

  /utils
    claude.js                        ← ONLY file that calls Anthropic API
    workspace.js
    streamer.js
    token-counter.js
    cost-tracker.js
    file-validator.js
    logger.js                        ← structured logs always include tenantId

  /server
    index.js
    /middleware
      auth.js                        ← hardcode tenantId="local" for MVP
      tenant-scope.js
    /routes
      session.js
      agents.js
      workspace.js
      events.js                      ← SSE endpoint

  /store
    memory-store.js                  ← MVP: in-memory, namespaced by tenantId
    session-schema.js

  /test
    workspace-test.js
    run-spec-agent.js
    run-full-pipeline.js

  /defaults
    agent-pm-prompt.md               ← copied into every new workspace on init

  package.json
  .env.example
```

---

## Build Order

Follow exactly. Read the referenced guardrails file before building each step.

```
1.  defaults/agent-pm-prompt.md      → guardrails/agent-pm.md
2.  store/session-schema.js          → guardrails/session-schema.md
3.  utils/errors.js                  → guardrails/error-taxonomy.md
4.  utils/token-counter.js
5.  utils/cost-tracker.js            → guardrails/cost-management.md
6.  utils/streamer.js                → guardrails/infrastructure.md
7.  utils/workspace.js               → guardrails/workspace.md
8.  utils/claude.js                  → guardrails/context-injection.md
9.  utils/file-validator.js          → guardrails/quality-gate.md
10. engine/output-store.js           → guardrails/output-versioning.md
11. engine/skill-resolver.js         → guardrails/skill-system.md
12. engine/quality-gate.js           → guardrails/quality-gate.md
13. agents/spec-agent/index.js

    → TEST: see guardrails/testing.md

14. agents/dev-agent/index.js
15. agents/review-agent/index.js
16. agents/qa-agent/index.js
17. engine/agent-pm.js               → guardrails/agent-pm.md
18. store/memory-store.js
19. server/middleware/auth.js
20. server/index.js + all routes     → guardrails/workspace.md, guardrails/infrastructure.md
21. UI: WorkspaceSelector
22. UI: AgentFeed + AttentionQueue   → guardrails/error-taxonomy.md
23. UI: PlanReview                   → guardrails/agent-pipeline.md
24. UI: QualityPanel + OutputViewer + VersionDiff
25. UI: TokenBudgetBar               → guardrails/cost-management.md

    → TEST: see guardrails/testing.md
```

---

## Environment

Copy `.env.example` to `.env` and fill in values. `.env` is gitignored — never commit it.

---

## What NOT to Build in MVP

- No real auth (tenantId hardcoded to `"local"`)
- No database (memory store only)
- No cloud storage, no parallelism, no GitHub, no Figma MCP

Design every interface as if these exist. The seams are already in the architecture.

---

## Phase Roadmap

```
Phase 1: Local MVP — one PM, memory store, local file system  ← BUILD THIS
Phase 2: Multi-user — Clerk auth, Postgres sessions
Phase 3: SaaS — S3 per-tenant storage, stateless server
Phase 4: GitHub integration, parallel agents, Figma MCP
```
