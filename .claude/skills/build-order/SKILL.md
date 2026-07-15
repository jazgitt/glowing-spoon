---
name: build-order
description: The module build sequence for Glowing Spoon's MVP, and which guardrails/*.md file to read before implementing each module. Use when building a new module from scratch or checking what comes next in the build order.
---

# Build Order

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
