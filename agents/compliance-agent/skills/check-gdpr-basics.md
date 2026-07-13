---
skill: check-gdpr-basics
version: 1.0
agent: compliance-agent
---

# Skill: Check GDPR Basics

## When to invoke
The built MVP stores or processes any personal data (accounts, emails, names, analytics).

## Steps
1. Check for a consent point before non-essential cookies or trackers load
2. Check personal data collected is limited to what features actually use
3. Check a user can request deletion — a manual admin path is acceptable at MVP stage
4. Check any privacy policy page or link exists (a placeholder counts as GAP, absence counts as GAP)
5. Mark each item PASS / GAP with concrete fix / N/A — never speculate beyond what the output shows

## Output format
// filepath: report/compliance-checklist.md (GDPR section)
Checklist table with PASS/GAP/N/A and a one-line fix per GAP. Header must state this is a guardrail checklist, not legal advice.
