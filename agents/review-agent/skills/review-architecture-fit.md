---
skill: review-architecture-fit
version: 1.0
agent: review-agent
---

# Skill: Review Architecture Fit

## When to invoke
Code has been written and needs review for alignment with the documented architecture.

## Steps
1. Read architecture.md to understand system boundaries and layer responsibilities
2. Check: does this code respect layer boundaries? Does it couple what should be decoupled?
3. Check: are tenant isolation rules followed? (tenantId + projectId on every operation)
4. Check: are abstraction seams preserved for Phase 2/3 upgrades?
5. Flag violations by file and line number

## Output format
// filepath: review/architecture-findings.md
List findings as: "[file:line] severity — description — suggested fix"
If no issues: "Architecture fit: PASS"
