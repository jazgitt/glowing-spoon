---
skill: write-test-plan
version: 1.0
agent: qa-agent
---

# Skill: Write Test Plan

## When to invoke
A new feature or epic needs a structured test plan before writing individual tests. Helps QA understand scope and coverage strategy.

## Steps
1. Identify all scenarios from acceptance criteria
2. Categorize: unit / integration / manual
3. For each scenario: describe test type, inputs, expected outcome, and pass/fail criteria
4. Flag scenarios that require manual testing (e.g. visual regression, 3rd-party integration)
5. Estimate coverage: % of acceptance criteria covered by automated tests

## Output format
// filepath: tests/test-plan.md
Return structured plan with sections: Scope, Automated Tests, Manual Tests, Coverage Estimate.
