---
skill: review-pattern-compliance
version: 1.0
agent: review-agent
---

# Skill: Review Pattern Compliance

## When to invoke
Code has been written and needs review for adherence to project patterns and guardrails.

## Steps
1. Read patterns.md — check every naming convention, file structure rule, export style
2. Read guardrails.md — check every forbidden pattern; any violation is a blocker
3. Check import style matches patterns.md
4. Check that no agent imports Anthropic SDK directly (only utils/claude.js allowed)
5. Check that no file path is hardcoded; all workspace paths derived from tenantId+projectId

## Output format
// filepath: review/pattern-findings.md
List violations as: "[file:line] VIOLATION — rule from patterns/guardrails — fix"
If no violations: "Pattern compliance: PASS"
