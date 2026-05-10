---
skill: write-api-docs
version: 1.0
agent: docs-agent
---

# Skill: Write API Docs

## When to invoke
An API endpoint has been implemented and needs HTTP documentation (method, path, request/response shapes).

## Steps
1. Document: HTTP method, path, authentication requirement
2. Request: headers, path params, query params, body schema (with types)
3. Response: success shape with status code, error shapes with status codes
4. Add one curl example per endpoint
5. Note any rate limits or special behaviors from guardrails

## Output format
// filepath: docs/api/{resource}.md
Return structured markdown per endpoint.
