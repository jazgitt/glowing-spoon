# Agent Pipeline & CLI Interaction

## Sequential Pipeline (MVP)

**Phase 0 — Workspace Load**
Validate tenant workspace → log to stdout → status: `planning`

**Phase 1 — Agent PM Plans**
`agentPM.plan()` → plan printed to stdout → write `.pending.json` (type: `plan-approval`) → log `[PENDING] Plan ready. Run: glowing-spoon plan view` → poll `.response.json` → PM approves or rejects with feedback → `agentPM.revisePlan(feedback)` → loop until approved → status: `executing`

**Phase 2 — Spec Agent**
Agent PM feeds stories → Spec Agent resolves skills → refines stories + writes acceptance criteria → quality gate → pass or retry (max 2) → output saved → Agent PM updates history

**Phase 3 — Dev Agent**
Agent PM feeds refined spec → Dev Agent resolves skills by task type → writes code → file validator (syntax) → quality gate via Review Agent → pass, retry, or escalate → output saved if passed

**Phase 4 — QA Agent**
Agent PM feeds spec + validated code → QA Agent generates tests → quality gate → output saved

**Phase 5 — Docs Agent**
Agent PM feeds spec + code + tests → Docs Agent generates docs → output saved

**Phase 6 — Final Checkpoint (BLOCKING)**
Summary printed to stdout → write `.pending.json` (type: `checkpoint`) → log `[PENDING] Session complete. Review output then run: glowing-spoon approve` → poll `.response.json` → Approve (complete) or Reject with feedback (Agent PM re-routes from appropriate step)

## PM Interaction via CLI

PM can interact at any point using separate commands. Session polls for responses when blocked.

**Approvals**
```bash
glowing-spoon plan view            # prints current plan from .session.json
glowing-spoon plan approve         # writes { action: "approve" } to .response.json
glowing-spoon plan reject --feedback "split the auth story into two"
glowing-spoon approve              # approve current checkpoint
glowing-spoon reject --feedback "the test coverage is too low"
```

**Inline messages to Agent PM** (question / scope change / feedback on current agent)
```bash
glowing-spoon respond --message "skip the password reset story for now"
```
Agent PM classifies intent:
- Feedback on current agent → retry with feedback
- Scope change → `agentPM.handleScopeChange()` → re-plans
- Question → `agentPM.answerQuestion()` → response printed to stdout, pipeline unaffected

**Session visibility**
```bash
glowing-spoon session status       # current step, pending items, cost so far, agent scores
```
