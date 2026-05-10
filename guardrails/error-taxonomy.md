# Error Taxonomy & Event Model

## ErrorTypes (utils/errors.js)

No generic errors. Every failure has a type, recovery strategy, retry limit, and PM notification level.

```javascript
export const ErrorTypes = {
  SYNTAX_ERROR: {
    code: "SYNTAX_ERROR",
    recovery: "retry-dev-agent-with-error-location",
    maxRetries: 2,
    notifyPM: false,
  },
  QUALITY_GATE_FAIL: {
    code: "QUALITY_GATE_FAIL",
    recovery: "retry-agent-with-review-feedback",
    maxRetries: 2,
    notifyPM: false,
  },
  QUALITY_GATE_PERMANENT: {
    code: "QUALITY_GATE_PERMANENT",
    recovery: "escalate-to-pm",
    maxRetries: 0,
    notifyPM: true,
    attention: "BLOCKING",
  },
  AMBIGUITY_UNRESOLVABLE: {
    code: "AMBIGUITY_UNRESOLVABLE",
    recovery: "pause-and-ask-pm",
    maxRetries: 0,
    notifyPM: true,
    attention: "BLOCKING",
  },
  TOKEN_BUDGET_EXCEEDED: {
    code: "TOKEN_BUDGET_EXCEEDED",
    recovery: "split-task-and-retry",
    maxRetries: 1,
    notifyPM: true,
    attention: "WARNING",
  },
  API_ERROR: {
    code: "API_ERROR",
    recovery: "exponential-backoff-retry",
    maxRetries: 3,
    notifyPM: false,
  },
};
```

## PM Attention Model — Two Event Tiers

Tier 1 → `AgentFeed.jsx` (informational scroll). Tier 2 → `AttentionQueue.jsx` (requires PM action, blocks pipeline).

```javascript
// Tier 1 — informational, no PM action needed
{ type: "agent:start",    tier: 1, agent, step }
{ type: "agent:thinking", tier: 1, agent, chunk }
{ type: "agent:output",   tier: 1, agent, content, version }
{ type: "agent:score",    tier: 1, agent, scores }
{ type: "agent:retry",    tier: 1, agent, reason, attempt }
{ type: "token:usage",    tier: 1, agent, tokensUsed, budget }
{ type: "version:saved",  tier: 1, agent, version, files }

// Tier 2 — requires PM action, pipeline pauses until resolved
{ type: "checkpoint",       tier: 2, attention: "BLOCKING", summary, actions: ["approve","reject"] }
{ type: "agent:escalated",  tier: 2, attention: "BLOCKING", agent, failureType, diagnosis }
{ type: "ambiguity:found",  tier: 2, attention: "BLOCKING", agent, question, context }
{ type: "quality:failed",   tier: 2, attention: "BLOCKING", agent, scores, suggestion }
{ type: "token:critical",   tier: 2, attention: "WARNING",  agent, message }

// Session events
{ type: "session:complete" }
{ type: "session:error", failureType, message, recoverable }
```
