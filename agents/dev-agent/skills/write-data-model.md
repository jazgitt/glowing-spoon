---
skill: write-data-model
version: 1.0
agent: dev-agent
---

# Skill: Write Data Model

## When to invoke
Task requires defining a database schema, ORM model, or data structure for persistent storage.

## Steps
1. Identify all entities and their relationships from spec
2. Check stack.md for ORM / DB conventions
3. Define fields with types, constraints, and defaults
4. Add created_at / updated_at timestamps to all entities
5. Write migration if stack uses migrations

## Output format
// filepath: src/models/{Entity}.js
Return only file contents. No explanation. No markdown fences.
