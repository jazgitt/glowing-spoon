import { Router } from 'express';
import {
  hasUsers, findUserByEmail, verifyPassword, registerUser,
  createInvite, listUsers, listInvites, deleteUser, deleteInvite,
} from './user-store.js';
import { createSessionCookie, setSessionCookie, clearSessionCookie } from './cookie.js';
import {
  requireAuth, requireAdmin, loginRateLimiter, recordLoginFailure, clearLoginFailures,
} from './middleware.js';

export const authRouter = Router();

// Public: lets the SPA decide whether to show first-run Register or Login.
authRouter.get('/bootstrap', async (req, res) => {
  res.json({ needsFirstUser: !(await hasUsers()) });
});

// Public: first user ever = admin; everyone after needs a valid invite token.
authRouter.post('/register', loginRateLimiter, async (req, res) => {
  const { email, password, inviteToken } = req.body ?? {};
  try {
    const user = await registerUser({ email, password, inviteToken });
    setSessionCookie(res, createSessionCookie(user.id));
    res.status(201).json({ user });
  } catch (err) {
    recordLoginFailure(req, email);
    const status = err.code === 'INVITE_REQUIRED' ? 403
      : err.code === 'EMAIL_TAKEN' ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

authRouter.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = email && typeof password === 'string' ? await findUserByEmail(email) : null;
  if (!user || !(await verifyPassword(user, password))) {
    recordLoginFailure(req, email);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  clearLoginFailures(req, email);
  setSessionCookie(res, createSessionCookie(user.id));
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- Admin: user + invite management -------------------------------------

authRouter.get('/users', requireAuth, requireAdmin, async (req, res) => {
  res.json({ users: await listUsers() });
});

authRouter.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    await deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

authRouter.get('/invites', requireAuth, requireAdmin, async (req, res) => {
  res.json({ invites: await listInvites() });
});

// Returns the raw token once — only its hash is stored.
authRouter.post('/invites', requireAuth, requireAdmin, async (req, res) => {
  const invite = await createInvite({ createdBy: req.user.email, role: req.body?.role });
  res.status(201).json({ invite });
});

authRouter.delete('/invites/:id', requireAuth, requireAdmin, async (req, res) => {
  await deleteInvite(req.params.id);
  res.json({ ok: true });
});
