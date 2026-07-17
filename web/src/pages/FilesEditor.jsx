// Edit the inputs the brigade cooks from: PRODUCT.md, specs, and the context vault.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import { api } from '../api/client.js';
import { Modal, useToast } from '../components/ui.jsx';

const AREAS = [
  { key: 'product', label: '🏷️ Product', hint: 'What you’re building, in your words.' },
  { key: 'specs', label: '📋 Specs', hint: 'The stories and requirements the team builds from.' },
  { key: 'vault', label: '🗄️ Vault', hint: 'Standing instructions injected into every agent.' },
];

// Mirrors utils/workspace.js VAULT_TOKEN_LIMITS (tokens ≈ chars / 4).
const VAULT_TOKEN_LIMITS = {
  'guardrails.md': 2000, 'patterns.md': 3000, 'architecture.md': 4000,
  'stack.md': 1000, 'decisions.md': 2000,
};

const CM_THEME = {
  '&': { backgroundColor: 'transparent', fontSize: '13.5px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
};

export default function FilesEditor() {
  const { id: projectId } = useParams();
  const [params] = useSearchParams();
  const initialArea = ['product', 'specs', 'vault'].includes(params.get('tab')) ? params.get('tab') : 'product';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [area, setArea] = useState(initialArea);
  const [fileName, setFileName] = useState(initialArea === 'product' ? 'PRODUCT.md' : '');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const dirty = content !== savedContent;

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}`),
  });
  const running = Boolean(projectData?.project?.session?.running);

  const { data: filesData } = useQuery({
    queryKey: ['files', projectId, area],
    queryFn: () => api.get(`/api/projects/${projectId}/files?area=${area}`),
  });
  const files = filesData?.files ?? [];

  const { data: fileData, isFetching } = useQuery({
    queryKey: ['file', projectId, area, fileName],
    queryFn: () => api.get(`/api/projects/${projectId}/file?area=${area}&name=${encodeURIComponent(fileName)}`),
    enabled: Boolean(fileName),
    retry: false,
  });

  useEffect(() => {
    const text = fileData?.content ?? '';
    setContent(text);
    setSavedContent(text);
  }, [fileData]);

  // Nothing selected yet (e.g. landed on the Specs tab) — open the first file.
  useEffect(() => {
    if (!fileName && files.length > 0) setFileName(files[0]);
  }, [fileName, files]);

  function switchArea(next) {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setArea(next);
    setFileName(next === 'product' ? 'PRODUCT.md' : '');
    setPreview(false);
  }

  function switchFile(name) {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setFileName(name);
  }

  async function save() {
    try {
      await api.put(`/api/projects/${projectId}/file`, { area, name: fileName, content });
      setSavedContent(content);
      toast(`${fileName} saved`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function createSpec() {
    const name = newName.endsWith('.md') ? newName : `${newName}.md`;
    try {
      await api.put(`/api/projects/${projectId}/file`, { area: 'specs', name, content: `# ${newName.replace(/\.md$/, '')}\n\n` });
      queryClient.invalidateQueries({ queryKey: ['files', projectId, 'specs'] });
      setNewOpen(false);
      setNewName('');
      setFileName(name);
      toast(`${name} created`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  // Interactive spec drafting: generate a clean draft from ALL notes (PRODUCT.md
  // + every spec file), let the user review/edit it, save only on approval.
  async function generateDraft() {
    setDraftOpen(true);
    setDrafting(true);
    setDraftError(null);
    setDraftText('');
    try {
      const { draft } = await api.post(`/api/projects/${projectId}/draft-specs`);
      setDraftText(draft);
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function approveDraft() {
    try {
      await api.put(`/api/projects/${projectId}/file`, { area: 'specs', name: 'stories.md', content: draftText });
      queryClient.invalidateQueries({ queryKey: ['files', projectId, 'specs'] });
      queryClient.invalidateQueries({ queryKey: ['file', projectId, 'specs', 'stories.md'] });
      setDraftOpen(false);
      setFileName('stories.md');
      toast('Clean specs saved to stories.md');
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function deleteSpec(name) {
    if (!window.confirm(`Delete ${name}? This can’t be undone.`)) return;
    try {
      await api.del(`/api/projects/${projectId}/file`, { area: 'specs', name });
      queryClient.invalidateQueries({ queryKey: ['files', projectId, 'specs'] });
      if (fileName === name) setFileName('');
      toast(`${name} deleted`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  const tokenBudget = area === 'vault' ? VAULT_TOKEN_LIMITS[fileName] : null;
  const tokenEstimate = useMemo(() => Math.ceil(content.length / 4), [content]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Project files</h1>
          <p className="sub">{AREAS.find(a => a.key === area)?.hint}</p>
        </div>
        <Link to={`/projects/${projectId}`} className="btn btn-ghost">← Mission control</Link>
      </div>

      {running && (
        <div className="form-error" style={{ borderColor: 'rgba(255,182,72,0.4)', background: 'var(--glow-soft)', color: 'var(--glow)' }}>
          A session is cooking right now — changes you save apply to the <strong>next</strong> session.
        </div>
      )}

      <div className="tabs">
        {AREAS.map(a => (
          <button key={a.key} className={area === a.key ? 'on' : ''} onClick={() => switchArea(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="editor-grid">
        <div className="panel file-list">
          {files.map(f => (
            <button key={f} className={fileName === f ? 'on' : ''} onClick={() => switchFile(f)}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f}</span>
              {area === 'specs' && (
                <span
                  role="button" title={`Delete ${f}`} style={{ opacity: 0.6 }}
                  onClick={(e) => { e.stopPropagation(); deleteSpec(f); }}
                >🗑</span>
              )}
            </button>
          ))}
          {area === 'specs' && (
            <button onClick={() => setNewOpen(true)} style={{ color: 'var(--glow)', fontWeight: 800 }}>
              + New spec file
            </button>
          )}
          {area === 'specs' && (
            <button onClick={generateDraft} style={{ color: 'var(--glow)', fontWeight: 800 }}>
              ✨ Generate clean specs
            </button>
          )}
          {area === 'specs' && files.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '8px 12px' }}>
              No specs yet — the team needs at least one story to cook.
            </p>
          )}
        </div>

        <div className="panel">
          {fileName ? (
            <>
              <div className="editor-toolbar">
                <span className="fname">{fileName}{dirty && <span className="dirty-dot" title="Unsaved changes" />}</span>
                {tokenBudget && (
                  <span style={{ fontSize: 12, color: tokenEstimate > tokenBudget ? 'var(--danger)' : 'var(--text-faint)' }}>
                    ~{tokenEstimate.toLocaleString()} / {tokenBudget.toLocaleString()} tokens
                    {tokenEstimate > tokenBudget && ' — over budget, costs extra every session'}
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
                  {preview ? '✏️ Edit' : '👁 Preview'}
                </button>
                <button className="btn btn-glow btn-sm" disabled={!dirty || isFetching} onClick={save}>
                  Save changes
                </button>
              </div>
              {preview ? (
                <div className="md-preview"><ReactMarkdown>{content}</ReactMarkdown></div>
              ) : (
                <CodeMirror
                  value={content}
                  onChange={setContent}
                  extensions={[markdown()]}
                  theme="dark"
                  style={CM_THEME['&']}
                  height="62vh"
                  basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
                />
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="big">📄</span>
              <p>Pick a file on the left{area === 'specs' ? ', or create your first spec' : ''}.</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={draftOpen} onClose={() => setDraftOpen(false)}>
        <h2>✨ Clean specs draft</h2>
        {drafting ? (
          <p className="sub">Reading your notes (product description + every spec file) and drafting clean stories…</p>
        ) : draftError ? (
          <div className="form-error">{draftError}</div>
        ) : (
          <>
            <p className="sub">
              Drafted from all your notes. Edit anything below, then approve — nothing is saved until you do.
              Approving writes <strong>specs/stories.md</strong>{files.includes('stories.md') ? ' (replacing the current one)' : ''};
              your other note files stay untouched.
            </p>
            <div style={{ maxHeight: '48vh', overflow: 'auto', border: '1px solid var(--border, #333)', borderRadius: 8 }}>
              <CodeMirror
                value={draftText}
                onChange={setDraftText}
                extensions={[markdown()]}
                theme="dark"
                style={CM_THEME['&']}
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              />
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setDraftOpen(false)}>Cancel</button>
          {!drafting && !draftError && (
            <button className="btn btn-glow" disabled={!draftText.trim()} onClick={approveDraft}>
              ✓ Approve &amp; save
            </button>
          )}
          {draftError && (
            <button className="btn btn-glow" onClick={generateDraft}>Try again</button>
          )}
        </div>
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)}>
        <h2>New spec file</h2>
        <p className="sub">One file per feature area works well — e.g. “stories” or “requirements”.</p>
        <div className="field">
          <label htmlFor="specname">File name</label>
          <input id="specname" autoFocus value={newName} placeholder="stories" onChange={e => setNewName(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>Cancel</button>
          <button className="btn btn-glow" disabled={!newName.trim()} onClick={createSpec}>Create</button>
        </div>
      </Modal>
    </main>
  );
}
