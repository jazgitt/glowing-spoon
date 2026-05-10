---
skill: detect-ambiguity
version: 1.0
agent: spec-agent
---

# Skill: Detect Ambiguity

## When to invoke
Story or requirement contains unclear terms, missing context, conflicting constraints, or undefined behavior at boundaries.

## Steps
1. Read spec carefully for undefined terms, missing actors, implicit assumptions
2. Check for conflicts between requirements
3. Identify missing error states and boundary conditions
4. For each ambiguity: state the question precisely and explain why it blocks implementation
5. Do not guess — flag and escalate

## Output format
// filepath: specs/ambiguity-report.md
List each ambiguity as: "Q: [question] — blocks: [what it blocks]"
If no ambiguities found, write: "No ambiguities detected."
