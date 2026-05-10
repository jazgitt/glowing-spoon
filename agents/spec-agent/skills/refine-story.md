---
skill: refine-story
version: 1.0
agent: spec-agent
---

# Skill: Refine Story

## When to invoke
Task involves making a user story clearer, more specific, or implementation-ready. Story is vague, missing detail, or not testable.

## Steps
1. Identify the actor, action, and desired outcome
2. Clarify ambiguous terms using product context
3. Split compound stories into single-responsibility stories
4. Ensure each story is independently deliverable
5. Rewrite in standard format: "As a [actor], I want [action] so that [outcome]"

## Output format
// filepath: specs/refined-{story-slug}.md
Return the refined story only. No explanation.
