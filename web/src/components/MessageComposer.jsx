// Talk to the team mid-run: ask a question, or flag a scope change.
import { useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from './ui.jsx';

export default function MessageComposer({ sessionId, disabled }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await api.post(`/api/sessions/${sessionId}/message`, { message, scope });
      toast(scope ? 'Scope change sent — the team will replan around it' : 'Question sent — answer appears in the log');
      setMessage('');
      setScope(false);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel panel-pad">
      <h3 style={{ fontSize: 15, marginBottom: 10 }}>📣 Talk to the team</h3>
      <div className="field" style={{ marginBottom: 10 }}>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder={scope ? 'Describe the scope change…' : 'Ask the team anything…'}
          value={message}
          disabled={disabled}
          onChange={e => setMessage(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={scope} onChange={e => setScope(e.target.checked)} />
          This changes the scope
        </label>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" disabled={busy || disabled || !message.trim()} onClick={send}>
          Send
        </button>
      </div>
      {disabled && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>Messages are read between steps while a session is running.</p>}
    </div>
  );
}
