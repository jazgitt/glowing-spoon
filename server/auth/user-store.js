// File-backed user + invite store (server/data/users.json). Mirrors the platform's
// file-based state philosophy — no database until Phase 2.
//
// Shape:
// {
//   "users":   [{ id, email, passwordHash, role: 'admin'|'member', createdAt, invitedBy }],
//   "invites": [{ id, tokenHash, role, createdBy, createdAt, expiresAt, usedBy }]
// }
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

const USERS_FILE = path.join(config.dataDir, 'users.json');
const BCRYPT_ROUNDS = 10;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Serialize writes through a single promise chain — Express handlers may overlap.
let writeLock = Promise.resolve();

async function load() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      invites: Array.isArray(data.invites) ? data.invites : [],
    };
  } catch {
    return { users: [], invites: [] };
  }
}

async function save(data) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, USERS_FILE);
}

// Run fn against the store with exclusive write access; fn may mutate data and
// must return { result }; data is persisted afterwards.
function withStore(fn) {
  const run = writeLock.then(async () => {
    const data = await load();
    const result = await fn(data);
    await save(data);
    return result;
  });
  // Keep the chain alive even if this operation fails.
  writeLock = run.catch(() => {});
  return run;
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

export async function hasUsers() {
  return (await load()).users.length > 0;
}

export async function findUserByEmail(email) {
  const { users } = await load();
  return users.find(u => u.email === email.toLowerCase()) ?? null;
}

export async function findUserById(id) {
  const { users } = await load();
  return users.find(u => u.id === id) ?? null;
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

// Creates the user. First user ever becomes admin; all others need a valid invite token.
// Throws Error with .code on failure.
export async function registerUser({ email, password, inviteToken }) {
  const normalized = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw Object.assign(new Error('Invalid email address'), { code: 'INVALID_EMAIL' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { code: 'WEAK_PASSWORD' });
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  return withStore(async (data) => {
    if (data.users.some(u => u.email === normalized)) {
      throw Object.assign(new Error('An account with this email already exists'), { code: 'EMAIL_TAKEN' });
    }

    let role = 'member';
    let invitedBy = null;

    if (data.users.length === 0) {
      role = 'admin'; // first registered user administers the instance
    } else {
      const tokenHash = hashInviteToken(String(inviteToken ?? ''));
      const invite = data.invites.find(i => i.tokenHash === tokenHash && !i.usedBy);
      if (!invite || Date.now() > invite.expiresAt) {
        throw Object.assign(new Error('A valid invite is required to register'), { code: 'INVITE_REQUIRED' });
      }
      role = invite.role;
      invitedBy = invite.createdBy;
      invite.usedBy = normalized;
    }

    const user = {
      id: crypto.randomUUID(),
      email: normalized,
      passwordHash,
      role,
      createdAt: Date.now(),
      invitedBy,
    };
    data.users.push(user);
    return publicUser(user);
  });
}

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Returns the raw token exactly once — only its hash is stored.
export async function createInvite({ createdBy, role = 'member' }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const invite = {
    id: crypto.randomUUID(),
    tokenHash: hashInviteToken(token),
    role: role === 'admin' ? 'admin' : 'member',
    createdBy,
    createdAt: Date.now(),
    expiresAt: Date.now() + INVITE_TTL_MS,
    usedBy: null,
  };
  await withStore(async (data) => {
    data.invites.push(invite);
    return null;
  });
  return { token, expiresAt: invite.expiresAt, role: invite.role };
}

export async function listUsers() {
  const { users } = await load();
  return users.map(publicUser);
}

export async function listInvites() {
  const { invites } = await load();
  return invites.map(({ id, role, createdBy, createdAt, expiresAt, usedBy }) =>
    ({ id, role, createdBy, createdAt, expiresAt, usedBy }));
}

export async function deleteUser(id) {
  return withStore(async (data) => {
    const idx = data.users.findIndex(u => u.id === id);
    if (idx === -1) {
      throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    }
    const isLastAdmin = data.users[idx].role === 'admin'
      && data.users.filter(u => u.role === 'admin').length === 1;
    if (isLastAdmin) {
      throw Object.assign(new Error('Cannot delete the last admin'), { code: 'LAST_ADMIN' });
    }
    data.users.splice(idx, 1);
    return true;
  });
}

export async function deleteInvite(id) {
  return withStore(async (data) => {
    data.invites = data.invites.filter(i => i.id !== id);
    return true;
  });
}
