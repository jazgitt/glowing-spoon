# GLOWING SPOON — Agentic Engineering Platform

Read this entire file before writing a single line of code. Then read any referenced guardrails file before implementing the corresponding module.

---

## What is This

Multi-tenant SaaS platform that runs AI-native engineering teams. No human developers. Agents do all work using skills. Multiple PMs run independent projects simultaneously — their data never touches.

This is a **CLI tool**. PMs and engineers interact entirely via terminal commands. No UI.

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
6. **Output is single-source.** Every agent output writes directly to `output/`. Retries overwrite the previous run.
7. **Token budget is managed proactively.** Every Claude call knows its budget before it starts. Never silently overflow.
8. **PM attention is scarce.** Session output clearly separates informational logs from blocked states that require PM action.
9. **Right model for right task.** Sonnet for reasoning. Haiku for mechanical tasks (scoring, skill resolution, history compression). Never use Sonnet where Haiku is sufficient.
10. **Cost is tracked in real time.** Every Claude call records token usage and cost. Sessions have a cost budget. PM is warned at 80% and blocked at 100%.

---

## Tenant & Project Data Model

This scopes everything — sessions, file paths. Even in local MVP, `tenantId` is always `"local"`. Never skip it.

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

  /cli
    index.js                         ← commander.js entry point, installed as `glowing-spoon`
    /commands
      workspace.js                   ← workspace init, list
      session.js                     ← session start, status, stop
      plan.js                        ← plan view, approve, reject
      approve.js                     ← approve current checkpoint
      reject.js                      ← reject checkpoint with feedback
      respond.js                     ← send message to Agent PM

  /engine
    agent-pm.js                      ← orchestrator, session brain
    session.js                       ← session lifecycle management
    context-loader.js
    quality-gate.js
    skill-resolver.js
    token-manager.js
    output-store.js

  /agents
    /spec-agent/index.js + /skills
    /dev-agent/index.js  + /skills
    /integration-agent/index.js + /skills   ← third-party scaffolds (Stripe, OAuth, ...)
    /review-agent/index.js + /skills
    /qa-agent/index.js   + /skills
    /docs-agent/index.js + /skills
    /cost-agent/index.js + /skills          ← MVP report: monthly run-cost estimate
    /compliance-agent/index.js + /skills    ← MVP report: GDPR/PCI/a11y checklist
    /pitch-agent/index.js + /skills         ← MVP report: one-pager, demo script, pricing
    /teardown-agent/index.js + /skills      ← MVP report: agency/freelancer comparison

  /utils
    claude.js                        ← ONLY file that calls Anthropic API
    workspace.js
    output.js                        ← chalk-based stdout writer (replaces streamer)
    token-counter.js
    cost-tracker.js
    file-validator.js
    logger.js                        ← structured logs always include tenantId

  /store
    file-store.js                    ← reads/writes session state to disk (replaces memory-store)
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
6.  utils/output.js                  → guardrails/infrastructure.md
7.  store/file-store.js              → guardrails/infrastructure.md
8.  utils/workspace.js               → guardrails/workspace.md
9.  utils/claude.js                  → guardrails/context-injection.md
10. utils/file-validator.js          → guardrails/quality-gate.md
11. engine/output-store.js           → guardrails/output-store.md
12. engine/skill-resolver.js         → guardrails/skill-system.md
13. engine/quality-gate.js           → guardrails/quality-gate.md
14. agents/spec-agent/index.js

    → TEST: see guardrails/testing.md

15. agents/dev-agent/index.js
16. agents/review-agent/index.js
17. agents/qa-agent/index.js
17b. agents/integration-agent/index.js  → guardrails/sme-agents.md
17c. agents/cost-agent + compliance-agent
     + pitch-agent + teardown-agent      → guardrails/sme-agents.md
18. engine/agent-pm.js               → guardrails/agent-pm.md
19. cli/commands/workspace.js        → guardrails/cli.md
20. cli/commands/session.js          → guardrails/cli.md
21. cli/commands/plan.js             → guardrails/cli.md
22. cli/commands/approve.js + reject.js + respond.js
23. cli/index.js                     ← wire all commands, register as `glowing-spoon`

    → TEST: see guardrails/testing.md
```

---

## Environment

Copy `.env.example` to `.env` and fill in values. `.env` is gitignored — never commit it.

---

## What NOT to Build in MVP

- No UI of any kind
- No real auth (tenantId hardcoded to `"local"`)
- No database (file-based state only)
- No cloud storage, no parallelism, no GitHub, no Figma MCP

Design every interface as if these exist. The seams are already in the architecture.

---

## Phase Roadmap

```
Phase 1: Local MVP — CLI, file-based state, local file system  ← BUILD THIS
Phase 2: Multi-user — Clerk auth, Postgres sessions
Phase 3: SaaS — S3 per-tenant storage, stateless server
Phase 4: GitHub integration, parallel agents, Figma MCP
```
