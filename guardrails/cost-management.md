# Cost Management

## trackCost() (utils/cost-tracker.js)

Called on every Claude API call — non-negotiable.

```javascript
const COST_PER_M_TOKENS = {
  "claude-sonnet-4-20250514":  { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 0.25,  output: 1.25  },
};

export async function trackCost({ sessionId, tenantId, agentId, model, usage }) {
  const rates = COST_PER_M_TOKENS[model];
  const cost = (usage.input_tokens  / 1_000_000 * rates.input)
             + (usage.output_tokens / 1_000_000 * rates.output);

  const session = await store.getSession(sessionId);
  session.tokenUsage.total += cost;
  session.tokenUsage.perAgent[agentId] = (session.tokenUsage.perAgent[agentId] || 0) + cost;
  session.tokenUsage.perCall.push({ agentId, model, cost,
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, timestamp: Date.now() });
  await store.saveSession(session);

  // Always stream to UI (Tier 1)
  streamer.emit(tenantId, sessionId, {
    type: "token:usage", tier: 1, agentId, model, cost,
    sessionTotal: session.tokenUsage.total,
    budget: session.costBudget,
    pctUsed: Math.round((session.tokenUsage.total / session.costBudget) * 100)
  });

  // Warn at 80% (Tier 2 WARNING)
  if (session.tokenUsage.total >= session.costBudget * 0.8
      && session.tokenUsage.total < session.costBudget * 0.8 + cost) {
    streamer.emit(tenantId, sessionId, {
      type: "cost:warning", tier: 2, attention: "WARNING",
      message: `Session at 80% of $${session.costBudget} budget ($${session.tokenUsage.total.toFixed(4)} used)`,
      suggestion: "Consider reducing remaining stories or compressing specs"
    });
  }

  // Hard stop at 100% (Tier 2 BLOCKING)
  if (session.tokenUsage.total >= session.costBudget) {
    streamer.emit(tenantId, sessionId, {
      type: "cost:exceeded", tier: 2, attention: "BLOCKING",
      message: `Budget of $${session.costBudget} reached. Session paused.`,
      actions: ["increase-budget", "end-session"]
    });
    throw new Error("COST_BUDGET_EXCEEDED");
  }
}
```

## Story Batching — 5-8 Stories Per Session Max

```
WRONG:  1 session × 100 stories → Agent PM history balloons → tokens explode
RIGHT:  13 sessions × 8 stories → history stays bounded → cost is predictable

After each session:
  - Decisions → appended to context-vault/decisions.md
  - Patterns → appended to context-vault/patterns.md
  - Generated code → committed to /output/current
  - New session starts fresh with enriched vault
```

## Expected Cost (With All Controls Active)

| Project | Stories | Sessions | Avg/Session | Total |
|---|---|---|---|---|
| Small   | 5   | 1  | $0.30 | ~$0.30  |
| Medium  | 20  | 3  | $0.80 | ~$2.40  |
| Large   | 100 | 13 | $1.50 | ~$20    |
| Large + retries | 100 | 13 | $2.50 | ~$32 |

Without controls (full vault every call, Sonnet everywhere, no history compression): Large project → $200-$300 per session run.
