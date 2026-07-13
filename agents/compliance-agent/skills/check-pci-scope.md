---
skill: check-pci-scope
version: 1.0
agent: compliance-agent
---

# Skill: Check PCI Scope

## When to invoke
The built MVP takes payments or handles anything card-related.

## Steps
1. Verify card details never touch application code or the database — hosted checkout / tokenized fields only
2. If any form field accepts a card number directly, mark it a BLOCKING GAP with the fix "switch to hosted checkout"
3. Check payment webhooks verify signatures before fulfilling orders
4. Check secret keys are read from environment variables, never committed
5. Mark each item PASS / GAP with concrete fix / N/A

## Output format
// filepath: report/compliance-checklist.md (PCI section)
Checklist table with PASS/GAP/N/A. BLOCKING gaps listed first.
