---
skill: check-accessibility
version: 1.0
agent: compliance-agent
---

# Skill: Check Accessibility Minimum Bar

## When to invoke
The built MVP includes any user-facing UI.

## Steps
1. Check every form input has an associated label (not placeholder-only)
2. Check interactive elements are real buttons/links, not bare divs with click handlers
3. Check images and icons that convey meaning have alt text or aria-labels
4. Check error messages are rendered as text near the field, not color-only signals
5. Mark each item PASS / GAP with concrete fix / N/A — scope is the minimum bar, not a WCAG audit

## Output format
// filepath: report/compliance-checklist.md (accessibility section)
Checklist table with PASS/GAP/N/A and a one-line fix per GAP.
