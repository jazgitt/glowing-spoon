---
skill: decompose-epic
version: 1.0
agent: spec-agent
---

# Skill: Decompose Epic

## When to invoke
Task is described as an epic, feature, or large requirement spanning multiple deliverables that cannot be completed in a single agent run.

## Steps
1. Identify the top-level goal of the epic
2. Break into independently deliverable stories (no story depends on an unwritten story)
3. Order stories by: shared infrastructure first, user-facing features after
4. Estimate relative complexity: S / M / L
5. Flag stories that have unresolved dependencies or missing specs

## Output format
// filepath: specs/epic-decomposition.md
Return ordered list: story number, title, complexity, dependencies.
