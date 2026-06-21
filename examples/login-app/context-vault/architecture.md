# Architecture

## Frontend (React SPA)
- Entry: `src/main.tsx`
- Components: `src/components/{Name}/{Name}.tsx`
- Pages: `src/pages/{Name}.tsx` (thin wrappers over components)
- API calls: `src/api/auth.ts` — thin fetch wrappers, returns typed results
- Routes: React Router v6 (`/`, `/login`, `/register`, `/dashboard`)

## Backend (Express REST API)
- Entry: `src/server.ts`
- Routes: `src/routes/auth.ts` (register, login, logout)
- Business logic: `src/services/authService.ts`
- DB access: `src/db/queries.ts`
- Middleware: `src/middleware/auth.ts` (JWT verification)

## Database
- PostgreSQL 15
- Schema: `users(id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
- Connection: `src/db/client.ts` (single Pool instance)

## Auth Flow
1. Register: hash password → insert user → return 201
2. Login: fetch user by email → bcrypt.compare → sign JWT → return token
3. Protected routes: Authorization: Bearer <token> header → middleware validates → req.user set
