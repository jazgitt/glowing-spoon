# Skill System

Skills are versioned markdown files injected into agent system prompts. Skill version is snapshotted at session start — mid-session skill updates never affect in-flight sessions.

## Skill File Format

```markdown
---
skill: write-react-component
version: 1.2
agent: dev-agent
---

# Skill: Write React Component

## When to invoke
Task requires creating or modifying a React component.

## Steps
1. Identify component type from spec (page / feature / primitive)
2. Check patterns.md: naming conventions, file structure, export style
3. Check guardrails.md: forbidden patterns
4. Write component — functional only, hooks, no class components
5. Add TypeScript types per stack.md
6. Export per patterns.md

## Output format
Return ONLY file contents. No explanation. No markdown fences.
First line must be: // filepath: src/components/{Name}/{Name}.tsx
```

## resolveSkills() (engine/skill-resolver.js)

Uses Haiku (via `AGENT_MODEL["skill-resolver"]`) to match task description to skill files.

```javascript
export async function resolveSkills(agentId, taskDescription, session) {
  const availableSkills = await listSkills(agentId);  // reads skill headers only
  // Claude picks which skills apply to this task
  // Returns skill filenames — contents then injected into agent system prompt
  // Uses session.skillVersionSnapshot to load pinned versions
}
```
