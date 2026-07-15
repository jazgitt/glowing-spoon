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
```

Workspace paths are resolved by `getWorkspacePath(tenantId, projectId)` in `utils/workspace.js`.

---

For the module build sequence and which guardrails file to read before each step, see the `build-order` skill.

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
