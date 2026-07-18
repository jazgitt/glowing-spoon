# Error Taxonomy & Output Events

## ErrorTypes (utils/errors.js)

No generic errors. Every failure has a type, recovery strategy, retry limit, and PM notification level.

```javascript
export const ErrorTypes = {
  SYNTAX_ERROR: {
    code: "SYNTAX_ERROR",
    recovery: "retry-dev-agent-with-error-location",
    maxRetries: 2,
    notifyPM: false,       // auto-recovers silently; logged to stdout as [ERROR]
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
    attention: "BLOCKING",  // writes .pending.json; logs [BLOCKED] to stdout
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
    attention: "WARNING",   // logs [WARN] to stdout; does not block
  },
  API_ERROR: {
    code: "API_ERROR",
    recovery: "exponential-backoff-retry",
    maxRetries: 3,
    notifyPM: false,
  },
};
```

## Output Levels (via utils/output.js)

| Level | CLI prefix | When |
|---|---|---|
| Info | `[agent-id]` | Normal agent activity, streamed output |
| Cost | `[cost]` | After every Claude call |
| Warning | `[WARN]` | Token budget >80%, vault size exceeded — pipeline continues |
| Error | `[ERROR]` | Auto-recoverable failures (syntax error, quality retry) |
| Blocked | `[BLOCKED]` | Pipeline paused; PM must respond via CLI command |
| Pending | `[PENDING]` | Awaiting PM input; prints the command to run |
| Success | `[✓]` | Step or session complete |

`notifyPM: true` + `attention: "BLOCKING"` → writes `.pending.json` AND logs `[BLOCKED]` + the command to run.
`notifyPM: true` + `attention: "WARNING"` → logs `[WARN]` only; pipeline does not pause.

## Pool & Readiness Failures (added post bp-tracker-99)

| Type | Recovery | PM |
|---|---|---|
| `MODEL_POOL_DEGRADED` | Block at the next stage boundary; PM approves continuing on the surviving model or stops to fix `MODEL_POOL` | BLOCKING |
| `MODEL_POOL_EXHAUSTED` | Stop session; every pool model failed or was pruned (404 = dead model id) | BLOCKING |
| `WORKSPACE_NOT_READY` | Refuse to start; mandatory inputs (PRODUCT.md tech stack, stories, non-stub vault) missing — `workspace check` / `workspace prepare` | BLOCKING |

Detection lives in `utils/claude.js` (`getPoolHealth()`: a model that 404s twice is pruned; 3 consecutive calls answered only by a sole surviving model = degraded) and `engine/readiness.js` (`checkReadiness()`). The session runner blocks on both at stage boundaries — a degraded pool or a skipped story must never end in a green "Session Complete".
