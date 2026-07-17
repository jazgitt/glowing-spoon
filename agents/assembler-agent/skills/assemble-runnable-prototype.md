---
skill: assemble-runnable-prototype
version: 1.0
agent: assembler-agent
---

# Skill: Assemble Runnable Prototype

## When to invoke
Every assembly task. This skill encodes the lessons from hand-assembling agent output into a running app.

## Steps
1. Inventory first: list every router, model, service, and component in the source, and every import that points at a file which does not exist — each missing file must be created as glue.
2. Auth contract shims: different stories generate different auth conventions (req.user.id vs req.user.userId vs req.memberId). Write ONE auth middleware that populates ALL observed spellings so no generated route needs editing.
3. Route path normalization: components may fetch('/api/bookings/request') while the router exposes POST /api/bookings. Add alias routes in the server entry rather than editing components.
4. Database inference: read every model/query to derive tables and columns. pg-mem for raw-SQL/pg code; for Sequelize-style ORM code, create the missing config file exporting a stub with the same API surface the models actually call (define, findOne, create, ...) backed by in-memory maps.
5. Seed data: 2-3 rows per table, with at least one demo login (document credentials in the README). A prototype that renders an empty screen looks broken even when it works.
6. Field-name mismatches between frontend and backend (origin vs pickup_location): normalize in the server response, not in the components.
7. Module system: the entry point and glue are ESM/TypeScript. Wrap or convert CommonJS files ONLY when tsc fails on them — allowJs true tolerates most.
8. On retry with build errors: fix ONLY the reported errors, output ONLY changed files. Do not regenerate files that already typecheck.

## Output format
Glue files via // filepath: blocks — package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, src/server/index.ts, missing config/db files, README.md.
