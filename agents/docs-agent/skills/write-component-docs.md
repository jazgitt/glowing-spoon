---
skill: write-component-docs
version: 1.0
agent: docs-agent
---

# Skill: Write Component Docs

## When to invoke
A component or module has been implemented and needs API documentation for other developers (or future agents) to use it correctly.

## Steps
1. Identify all exported functions, components, types, and constants
2. For each export: describe purpose, parameters (name, type, required/optional), return value
3. Add one usage example per export
4. Note any side effects, async behavior, or error conditions
5. Keep it terse — one sentence per item where possible

## Output format
// filepath: docs/components/{Name}.md
Return structured markdown: exports table, parameters, examples.
