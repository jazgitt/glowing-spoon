# Code Patterns

## React Component
- File: `src/components/ComponentName/ComponentName.tsx`
- Named export + default export on the same file
- Props typed with an interface above the component
- Loading state via `const [loading, setLoading] = useState(false)`
- Errors via `const [error, setError] = useState('')`

## Express Route
- File: `src/routes/routeName.ts`
- One router per domain (auth.ts, users.ts, etc.)
- Validate request body before any business logic
- Return `{ error: string }` on failure, `{ data: ... }` on success
- HTTP status: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 429 Too Many Requests, 500 Internal Server Error

## Database Query
- File: `src/db/queries.ts`
- Use parameterized queries only — never string interpolation in SQL
- Return typed results; never return raw pg rows to the route handler

## Test File
- File: `tests/ComponentName.test.tsx` or `tests/routeName.test.ts`
- One describe block per component/module
- Test: renders correctly, handles user input, handles error states, handles loading states
