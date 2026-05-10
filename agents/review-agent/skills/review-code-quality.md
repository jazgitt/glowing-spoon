---
skill: review-code-quality
version: 1.0
agent: review-agent
---

# Skill: Review Code Quality

## When to invoke
Code has been written and needs review for bugs, correctness, and maintainability.

## Steps
1. Check for logic errors, off-by-one errors, unhandled edge cases
2. Identify security issues: injection, missing input validation at boundaries, hardcoded secrets
3. Flag unnecessary complexity: code that can be simplified without losing clarity
4. Check error handling: typed errors only, no generic catch-all swallowing
5. Look for missing null/undefined guards at system boundaries

## Output format
// filepath: review/quality-findings.md
List findings as: "[file:line] severity — description — suggested fix"
If no issues: "Code quality: PASS"
