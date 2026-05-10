---
skill: write-acceptance-criteria
version: 1.0
agent: spec-agent
---

# Skill: Write Acceptance Criteria

## When to invoke
Task requires defining done criteria for a user story. Story has been refined but lacks testable conditions.

## Steps
1. Identify all scenarios: happy path, edge cases, error states
2. Write each criterion in Given/When/Then format
3. Ensure every criterion is independently verifiable
4. Cover: functional behavior, error handling, boundary conditions
5. Flag any criterion that requires PM clarification

## Output format
// filepath: specs/{story-slug}-acceptance.md
List criteria as numbered Given/When/Then statements. No prose.
