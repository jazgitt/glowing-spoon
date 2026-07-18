import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from '../components/ui.jsx';

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export default function NewProject() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/projects', { projectId, name, description });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast(`Project “${name}” created`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    // Straight to Mission Control at step 1 — the Prep Station auto-opens on
    // Describe, and every file there has a ✨ Generate option when wanted.
    navigate(`/projects/${projectId}`);
  }

  async function seedExample() {
    setBusy(true);
    setError(null);
    const id = projectId || 'login-app-demo';
    try {
      await api.post(`/api/projects/${id}/seed`);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast('Example project ready to cook');
      navigate(`/projects/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>New project</h1>
          <p className="sub">Tell the brigade what you’re building. You can refine everything later.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="panel panel-pad" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Product name</label>
          <input
            id="name" required autoFocus value={name}
            placeholder="e.g. Neighborhood Tool Library"
            onChange={e => {
              setName(e.target.value);
              if (!idTouched) setProjectId(slugify(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="pid">Project ID</label>
          <input
            id="pid" required value={projectId} pattern="[a-zA-Z0-9_-]+"
            onChange={e => { setIdTouched(true); setProjectId(e.target.value); }}
          />
          <span className="hint">Letters, numbers, hyphens and underscores only. This becomes the folder name.</span>
        </div>
        <div className="field">
          <label htmlFor="desc">What is it? (a few sentences)</label>
          <textarea
            id="desc" rows={4} value={description}
            placeholder="Neighbors lend and borrow tools from each other. Members list tools with photos, request to borrow, and rate each other…"
            onChange={e => setDescription(e.target.value)}
          />
          <span className="hint">
            This is the seed for everything — on the next screen you can refine it and
            generate your <strong>story specs</strong> and other project files from it, reviewing each one.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-glow" disabled={busy || !projectId}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={seedExample}>
            Or try the built-in example app
          </button>
        </div>
      </form>
    </main>
  );
}
