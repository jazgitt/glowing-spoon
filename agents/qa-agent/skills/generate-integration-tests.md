---
skill: generate-integration-tests
version: 1.0
agent: qa-agent
---

# Skill: Generate Integration Tests

## When to invoke
Code involves multiple components or services working together (API + DB, agent + store, etc.) and needs end-to-end flow verification.

## Steps
1. Identify the full flow from trigger to outcome per acceptance criterion
2. Set up real dependencies where possible (not mocks) — integration tests must catch wiring bugs
3. Test: request → processing → side effects → response
4. Cover: success flows, failure flows, and recovery paths
5. Tear down any state created during tests

## Output format
// filepath: tests/integration/{flow}.test.js
Return only test file contents. No explanation.
