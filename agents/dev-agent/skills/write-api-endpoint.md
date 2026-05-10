---
skill: write-api-endpoint
version: 1.0
agent: dev-agent
---

# Skill: Write API Endpoint

## When to invoke
Task requires creating a new API route or modifying an existing one.

## Steps
1. Identify HTTP method, path, request shape, and response shape from spec
2. Check stack.md for framework conventions (Express, Fastify, etc.)
3. Validate input at system boundary — do not trust request body
4. Return typed responses: success shape + error shape
5. No business logic in route handler — delegate to service layer

## Output format
// filepath: src/routes/{resource}.js
Return only file contents. No explanation. No markdown fences.
