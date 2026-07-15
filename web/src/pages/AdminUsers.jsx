// Admin: who's in the kitchen, plus invite management.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../auth.jsx';
import { Modal, useToast } from '../components/ui.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState(null); // { token } freshly minted

  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/api/auth/users') });
  const { data: invitesData } = useQuery({ queryKey: ['invites'], queryFn: () => api.get('/api/auth/invites') });

  async function createInvite() {
    try {
      const { invite } = await api.post('/api/auth/invites', {});
      setInvite(invite);
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function removeUser(id, email) {
    if (!window.confirm(`Remove ${email}? They will be signed out immediately.`)) return;
    try {
      await api.del(`/api/auth/users/${id}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast(`${email} removed`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  const inviteUrl = invite ? `${window.location.origin}/register?invite=${invite.token}` : null;
  const openInvites = (invitesData?.invites ?? []).filter(i => !i.usedBy && Date.now() < i.expiresAt);

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="sub">Everyone here shares this kitchen — all projects, all sessions.</p>
        </div>
        <button className="btn btn-glow" onClick={createInvite}>+ Invite someone</button>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <table className="table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {(usersData?.users ?? []).map(u => (
              <tr key={u.id}>
                <td>{u.email}{u.id === me.id && ' (you)'}</td>
                <td>{u.role === 'admin' ? '👑 admin' : 'member'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  {u.id !== me.id && (
                    <button className="btn btn-danger-outline btn-sm" onClick={() => removeUser(u.id, u.email)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openInvites.length > 0 && (
        <div className="panel panel-pad">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Open invites</h3>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            {openInvites.length} unused invite{openInvites.length > 1 ? 's' : ''} — each works once and expires after 7 days.
          </p>
        </div>
      )}

      <Modal open={Boolean(invite)} onClose={() => setInvite(null)}>
        <h2>Invite created</h2>
        <p className="sub">Send this link. It works once and expires in 7 days — it won’t be shown again.</p>
        <div className="field">
          <input readOnly value={inviteUrl ?? ''} onFocus={e => e.target.select()} />
        </div>
        <div className="modal-actions">
          <button
            className="btn btn-glow"
            onClick={() => { navigator.clipboard?.writeText(inviteUrl); toast('Invite link copied'); }}
          >
            Copy link
          </button>
          <button className="btn btn-ghost" onClick={() => setInvite(null)}>Done</button>
        </div>
      </Modal>
    </main>
  );
}
