---
skill: generate-unit-tests
version: 1.0
agent: qa-agent
---

# Skill: Generate Unit Tests

## When to invoke
Code has been written and needs unit test coverage for individual functions or components.

## Steps
1. Identify all public functions and their expected inputs/outputs from spec
2. Write tests for: happy path, null/empty inputs, boundary values, error cases
3. Mock external dependencies (API calls, file system, DB) — never hit real services in unit tests
4. Use the test framework specified in stack.md (default: Node built-in test runner)
5. Each test must have a clear description of what it verifies

## Output format
// filepath: tests/unit/{module}.test.js
Return only test file contents. No explanation.
