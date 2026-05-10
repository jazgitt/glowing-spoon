# Agent Pipeline & UI Interaction

## Sequential Pipeline (MVP)

**Phase 0 — Workspace Load**
Validate tenant workspace → snapshot skill versions → confirm to UI → status: `planning`

**Phase 1 — Agent PM Plans**
`agentPM.plan()` → UI shows in `PlanReview.jsx` → PM approves or gives feedback → `agentPM.revisePlan(feedback)` → loop until approved → status: `executing`

**Phase 2 — Spec Agent**
Agent PM feeds stories → Spec Agent resolves skills → refines stories + writes acceptance criteria → quality gate → pass or retry (max 2) → version saved → Agent PM updates history

**Phase 3 — Dev Agent**
Agent PM feeds refined spec → Dev Agent resolves skills by task type → writes code → file validator (syntax) → quality gate via Review Agent → pass, retry, or escalate → version saved + promoted if passed

**Phase 4 — QA Agent**
Agent PM feeds spec + validated code → QA Agent generates tests → quality gate → version saved

**Phase 5 — Docs Agent**
Agent PM feeds spec + code + tests → Docs Agent generates docs → version saved

**Phase 6 — Human Checkpoint (BLOCKING)**
`AttentionQueue` shows summary → PM reviews all versions, scores, diffs → Approve (promote /current, complete) or Reject with feedback (Agent PM re-routes from appropriate step)

## UI Interaction Model

Both modes always available simultaneously. They share `pmFeedback` history.

**Mode 1 — Step Approval**
Agent completes → `CheckpointGate.jsx` → PM clicks Approve or Reject+feedback → pipeline continues or retries.

**Mode 2 — Inline Chat**
PM types freely at any point → Agent PM classifies intent:
- Feedback on current agent → retry with feedback
- Scope change → `agentPM.handleScopeChange()` → re-plan
- Question → `agentPM.answerQuestion()` → responds without affecting pipeline
- "Stop" or "Pause" → session paused, full state preserved
