---
skill: estimate-coverage
version: 1.0
agent: qa-agent
---

# Skill: Estimate Coverage

## When to invoke
Tests have been written and a coverage summary is needed to verify the quality gate threshold will be met.

## Steps
1. Count total acceptance criteria from spec
2. Count criteria covered by written tests
3. Identify untested paths: error flows, edge cases, async error handling
4. Calculate: covered / total × 100 = estimated coverage %
5. Flag if estimated coverage < 80% — list specific gaps

## Output format
// filepath: tests/coverage-estimate.md
Return: total criteria, covered count, estimated %, list of gaps.
