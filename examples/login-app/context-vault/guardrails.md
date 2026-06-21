# Project Guardrails

## Code Quality
- TypeScript strict mode everywhere — no `any` types
- Functional React components only (no class components)
- All async operations must have error handling at the call site
- No direct database calls from React components

## Security
- Passwords hashed with bcrypt, minimum 10 rounds
- JWT tokens stored in localStorage (this is a demo — production should use httpOnly cookies)
- Never log passwords, tokens, or raw user input
- Validate and sanitize all user input on the server before any DB operation

## Output Format
- Output each file with a leading `// filepath: <relative-path>` line
- Paths relative to project root (e.g. `src/components/LoginForm/LoginForm.tsx`)
- Each file must be complete and runnable — no placeholder comments like `// TODO: implement`
