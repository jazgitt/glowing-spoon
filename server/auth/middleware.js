import { COOKIE_NAME, readCookie, verifySessionCookie } from './cookie.js';
import { findUserById } from './user-store.js';

// Attaches req.user (public shape) or responds 401.
export async function requireAuth(req, res, next) {
  const cookie = readCookie(req, COOKIE_NAME);
  const session = cookie && verifySessionCookie(cookie);
  if (!session) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  const user = await findUserById(session.uid);
  if (!user) {
    return res.status(401).json({ error: 'Account no longer exists' });
  }
  req.user = { id: user.id, email: user.email, role: user.role };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// CSRF hardening alongside SameSite=Strict: mutating requests must be JSON —
// cross-origin forms cannot send application/json without a CORS preflight.
export function requireJsonBody(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const type = req.headers['content-type'] ?? '';
    if (!type.includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
  }
  next();
}

// In-memory login rate limit: 5 failures / 15 minutes per IP+email.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const attempts = new Map(); // key → { fails, resetAt }

function rateKey(req, email) {
  return `${req.ip}|${String(email ?? '').toLowerCase()}`;
}

export function loginRateLimiter(req, res, next) {
  const entry = attempts.get(rateKey(req, req.body?.email));
  if (entry && entry.fails >= MAX_FAILS && Date.now() < entry.resetAt) {
    const retryMin = Math.ceil((entry.resetAt - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${retryMin} min.` });
  }
  next();
}

export function recordLoginFailure(req, email) {
  const key = rateKey(req, email);
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { fails: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.fails += 1;
  }
  // Opportunistic cleanup so the map cannot grow without bound.
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) {
      if (Date.now() > v.resetAt) attempts.delete(k);
    }
  }
}

export function clearLoginFailures(req, email) {
  attempts.delete(rateKey(req, email));
}
