import * as store from '../store/file-store.js';
import * as out from './output.js';

const COST_PER_M_TOKENS = {
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.25,  output: 1.25  },
};

export async function trackCost({ sessionId, tenantId, projectId, agentId, model, usage }) {
  const rates = COST_PER_M_TOKENS[model] ?? { input: 3.00, output: 15.00 };
  const callCost = (usage.input_tokens  / 1_000_000 * rates.input)
                 + (usage.output_tokens / 1_000_000 * rates.output);

  const session = await store.getSession(tenantId, projectId);
  if (!session) throw new Error(`trackCost: session not found for ${tenantId}/${projectId} — cannot enforce budget`);

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
