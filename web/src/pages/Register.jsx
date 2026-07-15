import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { user, needsFirstUser, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState(params.get('invite') ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, inviteToken || undefined);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="panel auth-card">
        <span className="spoon-hero">🥄</span>
        <h1>{needsFirstUser ? 'Set up Glowing Spoon' : 'Join the kitchen'}</h1>
        <p className="sub">
          {needsFirstUser
            ? 'You’re first in — this account becomes the admin.'
            : 'Paste the invite your admin sent you.'}
        </p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
            <span className="hint">At least 8 characters.</span>
          </div>
          {!needsFirstUser && (
            <div className="field">
              <label htmlFor="invite">Invite code</label>
              <input id="invite" required value={inviteToken} onChange={e => setInviteToken(e.target.value)} />
            </div>
          )}
          <button className="btn btn-glow" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="alt">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
