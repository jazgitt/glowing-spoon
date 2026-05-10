import { callClaude } from '../utils/claude.js';
import * as out from '../utils/output.js';

const PASS_THRESHOLD = { dimension: 75, overall: 80 };

export async function runQualityGate({ agentId, output, spec, session }) {
  const response = await callClaude({
    systemPrompt: 'You are a quality scorer. Evaluate agent output against the spec. Return ONLY valid JSON — no explanation, no markdown fences.',
    userPrompt: `Agent: ${agentId}
Spec provided to agent:
${spec}

Agent output to score:
${typeof output === 'string' ? output : JSON.stringify(output)}

Score each dimension 0–100:
- spec_compliance: does output fulfill the spec?
- pattern_compliance: follows coding/writing conventions?
- guardrail_compliance: violates any guardrails? (100 = no violations)
- completeness: anything missing from the spec?

Threshold: all dimensions >= ${PASS_THRESHOLD.dimension}, overall >= ${PASS_THRESHOLD.overall}

Return JSON only:
{
  "scores": { "spec_compliance": 0, "pattern_compliance": 0, "guardrail_compliance": 0, "completeness": 0 },
  "overall": 0,
  "passed": false,
  "issues": ["specific issue descriptions"],
  "suggestions": ["specific fix suggestions"]
}`,
    agentId: 'quality-scorer',
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    dryRun: session.dryRun,
  });

  let result;
  try {
    const text = response.content[0].text.trim();
    result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
  } catch (err) {
    out.error(`Quality gate parse error: ${err.message}`);
    result = {
      scores: { spec_compliance: 50, pattern_compliance: 50, guardrail_compliance: 50, completeness: 50 },
      overall: 50, passed: false,
      issues: ['Could not parse quality scorer response'],
      suggestions: ['Retry'],
    };
  }

  const retryCount = session.agents[agentId]?.retryCount ?? 0;
  const scoreStr = Object.entries(result.scores)
    .map(([k, v]) => `${k}:${v}`)
    .join(' | ');

  out.log('quality', `${agentId} — ${scoreStr} | overall:${result.overall} — ${result.passed ? 'PASS' : 'FAIL'}`);

  if (!result.passed) {
    if (retryCount < 2) {
      return { action: 'retry', feedback: result.issues, suggestions: result.suggestions, scores: result.scores, overall: result.overall };
    }
    return { action: 'escalate', failureType: 'QUALITY_GATE_PERMANENT', scores: result.scores, overall: result.overall, issues: result.issues };
  }

  return { action: 'pass', scores: result.scores, overall: result.overall };
}
