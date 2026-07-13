---
skill: estimate-run-cost
version: 1.0
agent: cost-agent
---

# Skill: Estimate Run-Cost

## When to invoke
Task involves estimating what the built MVP costs to operate per month.

## Steps
1. Inventory cost drivers from the built output: compute, database, file storage, third-party APIs (payments, SMS, email), background jobs
2. Estimate each driver at 100, 1k, and 10k monthly active users
3. Use published entry-tier pricing for the stack in use; when unsure, state the assumption and round up
4. Flag any driver that scales non-linearly (per-message fees, per-transaction fees) — these surprise small businesses most
5. Give one total per user tier and identify the single biggest cost lever

## Output format
// filepath: report/run-cost.md
A table per user tier, an assumptions list, and a one-paragraph "biggest lever" summary. No explanation outside the file.
