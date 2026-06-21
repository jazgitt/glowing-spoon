# Architecture Decisions

## JWT in localStorage (not httpOnly cookies)
Demo simplicity — easier to demonstrate without CORS/cookie setup.
Production: use httpOnly cookies with CSRF protection.

## Raw SQL over ORM
Keeps the example focused on application logic, not ORM abstractions.
Production: Drizzle or Prisma would be appropriate.

## Single PostgreSQL pool
Sufficient for a demo. Production: connection pooling via PgBouncer.

## Rate limiting per IP
5 failed login attempts per 15 minutes. Implemented with express-rate-limit.
