// Append-only audit trail of who did what — the accountability mechanism while
// every account shares the single "local" tenant (until Phase 2 multi-tenancy).
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const AUDIT_FILE = path.join(config.dataDir, 'audit.jsonl');

export async function audit(user, action, details = {}) {
  const line = JSON.stringify({
    ts: Date.now(),
    user: user?.email ?? 'unknown',
    action,
    ...details,
  });
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.appendFile(AUDIT_FILE, line + '\n');
  } catch {
    // Auditing must never break the action itself.
  }
}

export async function readAuditTail(limit = 200) {
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    return raw.trim().split('\n').slice(-limit).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
