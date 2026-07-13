---
skill: recommend-hosting
version: 1.0
agent: cost-agent
---

# Skill: Recommend Hosting

## When to invoke
Task involves choosing where a small business should deploy the built MVP.

## Steps
1. Match the stack to hosting classes: static frontend → CDN host, server app → PaaS, database → managed entry tier
2. Recommend exactly one primary setup — small businesses need a decision, not a survey
3. Name one cheaper fallback and one growth path, each in a single sentence
4. Prefer platforms with a real free tier and predictable pricing over usage-billed serverless when traffic is unknown
5. List the launch checklist: domain, TLS, environment variables, database backup

## Output format
// filepath: report/run-cost.md (hosting section)
One recommended setup with monthly price, fallback, growth path, launch checklist. No explanation outside the file.
