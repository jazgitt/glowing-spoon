import * as store from '../store/file-store.js';
import * as out from './output.js';

// Rates in USD per 1M tokens. All calls go through OpenRouter.
// OpenRouter adds a small markup (~0.5%) which is negligible for budgeting purposes.
const COST_PER_M_TOKENS = {
  // Claude (via OpenRouter)
  'anthropic/claude-sonnet-4':       { input: 3.00,  output: 15.00 },
  'anthropic/claude-haiku-4-5':      { input: 0.25,  output: 1.25  },
  'anthropic/claude-opus-4':         { input: 15.00, output: 75.00 },
  // OpenAI (via OpenRouter)
  'openai/gpt-4o':                   { input: 2.50,  output: 10.00 },
  'openai/gpt-4o-mini':              { input: 0.15,  output: 0.60  },
  // Google (via OpenRouter)
  'google/gemini-2.0-flash-001':     { input: 0.10,  output: 0.40  },
  'google/gemini-pro-1.5':           { input: 1.25,  output: 5.00  },
};

// Mirrors MAX_TOKENS_OUT in claude.js — used for worst-case pre-call estimate.
const MAX_TOKENS_OUT_ESTIMATE = 8096;

// HIGH-2: pre-call guard — call BEFORE dispatching to the API so budget overruns
// are blocked before a cent is spent. estimatedInputTokens = rough token count of
// (system prompt + conversation messages). Throws COST_BUDGET_EXCEEDED if this call
// would push total over budget.
export async function checkBudgetBefore({ tenantId, projectId, model, estimatedInputTokens }) {
  if (!tenantId || !projectId) return;
  const session = await store.getSession(tenantId, projectId);
  if (!session) return;

  // Defense-in-depth against HIGH-1: invalid budget must never silently skip enforcement
  if (!Number.isFinite(session.costBudget) || session.costBudget <= 0) {
    throw new Error('Session has invalid costBudget — aborting to prevent unbounded spend');
  }

  const rates = COST_PER_M_TOKENS[model] ?? { input: 3.00, output: 15.00 }; // conservative fallback
  const estimatedCost = (estimatedInputTokens / 1_000_000 * rates.input)
                      + (MAX_TOKENS_OUT_ESTIMATE / 1_000_000 * rates.output);

  if (session.tokenUsage.total + estimatedCost > session.costBudget) {
    out.blocked(
      `Pre-call budget check: $${session.tokenUsage.total.toFixed(4)} used` +
      ` + ~$${estimatedCost.toFixed(4)} estimated > $${session.costBudget} budget. Stopping.`
    );
    throw new Error('COST_BUDGET_EXCEEDED');
  }
}

export async function trackCost({ sessionId, tenantId, projectId, agentId, model, usage }) {
  // Unknown model falls back to Sonnet pricing (conservative overestimate).
  const rates = COST_PER_M_TOKENS[model] ?? { input: 3.00, output: 15.00 };
  const callCost = (usage.input_tokens  / 1_000_000 * rates.input)
                 + (usage.output_tokens / 1_000_000 * rates.output);

  const session = await store.getSession(tenantId, projectId);
  if (!session) throw new Error(`trackCost: session not found for ${tenantId}/${projectId} — cannot enforce budget`);

  // HIGH-1 defense-in-depth: invalid costBudget (e.g. NaN from bad --budget flag) must
  // never silently disable the hard stop. Throw here so the caller surfaces the problem.
  if (!Number.isFinite(session.costBudget) || session.costBudget <= 0) {
    throw new Error('Session has invalid costBudget — aborting to prevent unbounded spend');
  }

  session.tokenUsage.total += callCost;
  session.tokenUsage.perAgent[agentId] = (session.tokenUsage.perAgent[agentId] || 0) + callCost;
  session.tokenUsage.perCall.push({
    agentId, model, callCost,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    timestamp: Date.now(),
  });
  if (session.tokenUsage.perCall.length > 100) {
    session.tokenUsage.perCall = session.tokenUsage.perCall.slice(-100);
  }
  await store.saveSession(session);

  out.cost({ agentId, callCost, sessionTotal: session.tokenUsage.total, budget: session.costBudget });

  // Warn at 80%
  const pct = session.tokenUsage.total / session.costBudget;
  if (pct >= 0.8 && pct - (callCost / session.costBudget) < 0.8) {
    out.warn(`Session at 80% of $${session.costBudget} budget. Consider reducing remaining stories.`);
  }

  // Hard stop at 100%
  if (session.tokenUsage.total >= session.costBudget) {
    out.blocked(`Budget of $${session.costBudget} reached. Session paused.`);
    out.pending('To continue: glowing-spoon reject --feedback "increase budget" or end the session.');
    throw new Error('COST_BUDGET_EXCEEDED');
  }
}
