// Server configuration — read once at startup. dotenv is loaded by server/index.js
// before anything else (the engine modules also snapshot WORKSPACE_ROOT at import time).
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const isProduction = process.env.NODE_ENV === 'production';

function resolveSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  if (isProduction) {
    console.error('[ERROR] SESSION_SECRET must be set (>= 32 chars) in production. Add it to .env.');
    process.exit(1);
  }
  // Dev convenience: ephemeral secret — logins do not survive a server restart.
  console.warn('[WARN]  SESSION_SECRET not set — using an ephemeral secret. Sessions reset on restart.');
  return crypto.randomBytes(32).toString('hex');
}

export const config = {
  port: parseInt(process.env.PORT, 10) || 3808,
  isProduction,
  sessionSecret: resolveSessionSecret(),
  // Secure cookies require TLS; enable on the VPS (behind nginx) via COOKIE_SECURE=true.
  cookieSecure: process.env.COOKIE_SECURE === 'true' || isProduction,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  dataDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'),
  webDist: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist'),
};
