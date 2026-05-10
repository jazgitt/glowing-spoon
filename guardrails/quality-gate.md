# Quality Gate & File Validation

## runQualityGate() (engine/quality-gate.js)

Quality scoring is mechanical structured JSON — uses Haiku, not Sonnet.

```javascript
export async function runQualityGate({ agentId, output, spec, session }) {
  const scoreResponse = await callClaude({
    systemPrompt: `You are a quality scorer. Return only valid JSON. No explanation.`,
    agentId: "quality-scorer",
    userPrompt: `
Agent: ${agentId}
Spec: ${spec}
Output to score: ${output}

Score each dimension 0-100:
- spec_compliance: does output fulfill the spec?
- pattern_compliance: follows patterns.md conventions?
- guardrail_compliance: violates any guardrails? (100 = no violations)
- completeness: anything missing from the spec?

Threshold for pass: all dimensions >= 75, overall >= 80

Return JSON only:
{
  "scores": { "spec_compliance": 0, "pattern_compliance": 0, "guardrail_compliance": 0, "completeness": 0 },
  "overall": 0,
  "passed": false,
  "issues": ["specific issue descriptions"],
  "suggestions": ["specific fix suggestions"]
}
    `,
    tenantId: session.tenantId, projectId: session.projectId, sessionId: session.sessionId,
  });

  const result = JSON.parse(scoreResponse.content[0].text);
  const retryCount = session.agents[agentId].retryCount;

  if (!result.passed) {
    if (retryCount < 2) {
      return { action: "retry", feedback: result.issues, suggestions: result.suggestions, scores: result.scores };
    }
    return { action: "escalate", failureType: "QUALITY_GATE_PERMANENT", scores: result.scores };
  }

  return { action: "pass", scores: result.scores };
}
```

## validateFiles() (utils/file-validator.js)

Syntax errors are not quality issues — they're build failures. File validator runs before Review Agent sees anything.

```javascript
import { parse } from "@babel/parser";

export async function validateFiles(files) {
  const results = files
    .filter(f => /\.(js|jsx|ts|tsx)$/.test(f.relativePath))
    .map(f => {
      try {
        parse(f.content, { sourceType: "module", plugins: ["jsx", "typescript"] });
        return { file: f.relativePath, valid: true };
      } catch (err) {
        return { file: f.relativePath, valid: false, error: err.message, line: err.loc?.line };
      }
    });

  const failed = results.filter(r => !r.valid);
  return { valid: failed.length === 0, results, failed };
}
```

If validation fails → emit `ErrorTypes.SYNTAX_ERROR` → Dev Agent retries with exact error location injected. Max 2 retries before escalating to PM.
