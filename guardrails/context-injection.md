# Context Injection & Model Selection

## AGENT_CONTEXT_NEEDS

Each agent declares exactly which vault files it needs. `guardrails` and `patterns` are always injected — never skipped.

```javascript
export const AGENT_CONTEXT_NEEDS = {
  "agent-pm":     ["guardrails", "patterns", "architecture", "decisions", "stories", "requirements"],
  "spec-agent":   ["guardrails", "patterns", "stories", "requirements"],
  "dev-agent":    ["guardrails", "patterns", "stack"],
  "review-agent": ["guardrails", "patterns", "architecture"],
  "qa-agent":     ["guardrails", "patterns", "stack"],
  "docs-agent":   ["guardrails", "patterns"],
};
// ALWAYS_INJECT = ["guardrails", "patterns"] — enforced in loadVault(), not optional
```

## AGENT_MODEL

```javascript
export const AGENT_MODEL = {
  // Sonnet — complex reasoning, ambiguous requirements, architecture decisions
  "agent-pm":           "claude-sonnet-4-20250514",
  "spec-agent":         "claude-sonnet-4-20250514",
  "dev-agent":          "claude-sonnet-4-20250514",
  "review-agent":       "claude-sonnet-4-20250514",

  // Haiku — mechanical, well-defined output, no reasoning required (~20x cheaper)
  "quality-scorer":     "claude-haiku-4-5-20251001",
  "skill-resolver":     "claude-haiku-4-5-20251001",
  "history-compressor": "claude-haiku-4-5-20251001",
  "file-validator":     "claude-haiku-4-5-20251001",
  "qa-agent":           "claude-haiku-4-5-20251001",
  "docs-agent":         "claude-haiku-4-5-20251001",
};
// Rule: if the task has a defined output format and doesn't reason across ambiguity → Haiku
```

## callClaude() — Full Implementation (utils/claude.js)

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { loadSelectiveVault } from "./workspace.js";
import { estimateTokens, trimToFit } from "./token-counter.js";
import { trackCost } from "./cost-tracker.js";
import { AGENT_CONTEXT_NEEDS, AGENT_MODEL } from "./claude.js";

const client = new Anthropic();
const MAX_TOKENS_OUT = 8096;
const CONTEXT_WINDOW = 180000;

export async function callClaude({
  systemPrompt, userPrompt, agentId,
  tenantId, projectId, sessionId,
  conversationHistory, specs, stream = false
}) {
  const model = AGENT_MODEL[agentId] || "claude-sonnet-4-20250514";

  // 1. Load ONLY what this agent needs
  const vaultNeeds = AGENT_CONTEXT_NEEDS[agentId] || ["guardrails", "patterns"];
  const vault = await loadSelectiveVault(tenantId, projectId, vaultNeeds);

  // 2. Build system prompt — vault always before agent instructions
  const fullSystem = `
═══ CONTEXT VAULT (always follow — overrides your defaults) ═══
${vault}

═══ AGENT INSTRUCTIONS ═══
${systemPrompt}
`.trim();

  // 3. Specs only injected if passed in (Agent PM controls what specialists see)
  const specSection = specs ? `\n\n═══ RELEVANT SPECS ═══\n${specs}` : "";
  const finalSystem = fullSystem + specSection;

  // 4. Proactive token budget — never silently overflow
  let history = conversationHistory || [];
  const total = estimateTokens(finalSystem)
    + estimateTokens(JSON.stringify(history))
    + estimateTokens(userPrompt)
    + MAX_TOKENS_OUT;

  if (total > CONTEXT_WINDOW) {
    history = trimToFit({
      history,
      budget: CONTEXT_WINDOW - estimateTokens(finalSystem) - estimateTokens(userPrompt) - MAX_TOKENS_OUT
    });
  }

  // 5. Call Claude
  const messages = [...history, { role: "user", content: userPrompt }];
  const callParams = { model, max_tokens: MAX_TOKENS_OUT, system: finalSystem, messages };

  if (!stream) {
    const response = await client.messages.create(callParams);
    await trackCost({ sessionId, tenantId, agentId, model, usage: response.usage });
    return response;
  }

  // Streaming: trackCost() called exactly once when stream finalizes
  const stream_ = client.messages.stream(callParams);
  stream_.on("message", async (finalMessage) => {
    await trackCost({ sessionId, tenantId, agentId, model, usage: finalMessage.usage });
  });
  return stream_;
}
```
