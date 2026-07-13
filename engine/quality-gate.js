import { callClaude } from '../utils/claude.js';
import * as out from '../utils/output.js';

const PASS_THRESHOLD = { dimension: 75, overall: 80 };

// What each agent is responsible for producing. The scorer must judge output
// against the agent's ROLE, not the whole story — a qa-agent that produces only
// tests is doing its job, not missing the implementation.
const AGENT_ROLES = {
  'spec-agent':        'Refined user stories and acceptance criteria. Do NOT expect implementation code.',
  'dev-agent':         'Implementation code fulfilling the spec.',
  'integration-agent': 'Third-party integration scaffolding code only. Do NOT expect the rest of the application.',
  'review-agent':      'A code review document. Score the QUALITY OF THE REVIEW itself — accuracy and coverage of findings. A review that correctly identifies real problems in the code is a GOOD output and must score HIGH. Do NOT score the reviewed code.',
  'qa-agent':          'Test files only. The implementation is INPUT to this agent, not its output — do NOT penalize missing implementation files.',
  'docs-agent':        'Documentation files for the provided code.',
};

export async function runQualityGate({ agentId, output, spec, session }) {
  const role = AGENT_ROLES[agentId] ?? 'Output appropriate to the agent\'s task.';
  const response = await callClaude({
    systemPrompt: 'You are a quality scorer. Evaluate agent output strictly against that agent\'s role and the spec. Return ONLY valid JSON — no explanation, no markdown fences.',
    userPrompt: `Agent: ${agentId}
This agent's sole responsibility: ${role}
Score ONLY whether the output fulfills that responsibility. Never penalize the absence of deliverables that belong to other agents.

Spec provided to agent:
${spec}

Agent output to score:
${typeof output === 'string' ? output : JSON.stringify(output)}

Score each dimension 0–100:
- spec_compliance: does output fulfill this agent's responsibility for the spec?
- pattern_compliance: follows coding/writing conventions applicable to this output type?
- guardrail_compliance: violates any guardrails? (100 = no violations)
- completeness: anything missing from THIS AGENT's responsibility? (not the whole story)

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

  // MEDIUM-1: shape-validate after parse — malformed-but-valid JSON (e.g. missing
  // `scores`) must not crash Object.entries() further down. Default to FAIL, not crash.
  const FALLBACK_RESULT = {
    scores: { spec_compliance: 50, pattern_compliance: 50, guardrail_compliance: 50, completeness: 50 },
    overall: 50, passed: false,
    issues: ['Could not parse quality scorer response'],
    suggestions: ['Retry'],
  };

  let result;
  try {
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    // Validate required shape before accepting
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.scores && typeof parsed.scores === 'object' &&
      typeof parsed.overall === 'number' &&
      typeof parsed.passed === 'boolean'
    ) {
      result = parsed;
    } else {
      out.error('Quality gate response missing required fields — treating as FAIL');
      result = { ...FALLBACK_RESULT, issues: ['Quality scorer returned incomplete response'] };
    }
  } catch (err) {
    out.error(`Quality gate parse error: ${err.message}`);
    result = FALLBACK_RESULT;
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
