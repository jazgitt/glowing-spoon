// Stateless signed session cookie: base64url(JSON payload) + '.' + HMAC-SHA256 signature.
// No server-side session store — the payload carries { uid, exp }.
import crypto from 'crypto';
import { config } from '../config.js';

export const COOKIE_NAME = 'gs_session';

function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

export function createSessionCookie(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + config.sessionTtlMs })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Returns { uid } or null. Constant-time signature comparison.
export function verifySessionCookie(value) {
  if (typeof value !== 'string') return null;
  const dot = value.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number') return null;
    if (Date.now() > data.exp) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

// Minimal cookie-header parsing — avoids a cookie-parser dependency.
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(res, value) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
  ];
  if (config.cookieSecure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
}
