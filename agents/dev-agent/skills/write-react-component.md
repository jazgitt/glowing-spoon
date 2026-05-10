---
skill: write-react-component
version: 1.0
agent: dev-agent
---

# Skill: Write React Component

## When to invoke
Task requires creating or modifying a React component (page, feature, or primitive UI element).

## Steps
1. Identify component type from spec: page / feature / primitive
2. Check patterns.md: naming conventions, file structure, export style
3. Check guardrails.md: forbidden patterns
4. Write functional component only — hooks, no class components
5. Add TypeScript types if stack.md specifies TypeScript
6. Export per patterns.md convention

## Output format
// filepath: src/components/{Name}/{Name}.tsx
Return only file contents. No explanation. No markdown fences.
