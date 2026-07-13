---
skill: list-production-gaps
version: 1.0
agent: teardown-agent
---

# Skill: List Production Gaps

## When to invoke
Task involves stating honestly what the MVP still needs before real customers depend on it.

## Steps
1. Review the built output for the usual MVP gaps: monitoring, backups, rate limiting, design polish, edge-case handling
2. List only gaps that apply to this specific build — no generic boilerplate warnings
3. For each gap: what it is, what breaks without it, and roughly what closing it takes (hours, not weeks, where true)
4. Split into "before first paying customer" and "before 1k users"
5. Keep the tone factual — the credibility of the whole teardown depends on this section being honest

## Output format
// filepath: report/build-teardown.md (gaps section)
Two lists: before-first-customer and before-1k-users, each item with impact and effort.
