// Prep Station — the inputs the brigade cooks from (PRODUCT.md, specs, vault),
// embedded directly in Mission Control so describing the product and getting
// specs ready happen in the main flow, not on a separate page. Collapsible:
// auto-opened by Mission Control while the Describe/Specs journey steps are
// incomplete, one click away the rest of the time.
import { useEffect, useMemo, useState } from 'react';
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
};

// tab: null (collapsed) | 'product' | 'specs' | 'vault'. setTab lifts the
// open/collapse + active-area state to Mission Control so the journey rail,
// Expo Ticket, and header button can all drive this panel.
// describeOnly: journey step 1 — the PM writes their charter in PRODUCT.md and
// nothing else. Specs and vault stay hidden until the description exists.
export default function PrepStation({ projectId, running, tab, setTab, describeOnly = false }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const area = describeOnly ? 'product' : (tab ?? 'product');
  const [fileName, setFileName] = useState('PRODUCT.md');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  // Draft target: { area, name } of the file being generated for review.
  const [draftTarget, setDraftTarget] = useState(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const dirty = content !== savedContent;

  const { data: filesData } = useQuery({
    queryKey: ['files', projectId, area],
    queryFn: () => api.get(`/api/projects/${projectId}/files?area=${area}`),
    enabled: tab !== null,
  });
  const files = filesData?.files ?? [];

  const { data: fileData, isFetching } = useQuery({
    queryKey: ['file', projectId, area, fileName],
    queryFn: () => api.get(`/api/projects/${projectId}/file?area=${area}&name=${encodeURIComponent(fileName)}`),
    enabled: tab !== null && Boolean(fileName),
    retry: false,
  });

  useEffect(() => {
    const text = fileData?.content ?? '';
    setContent(text);
    setSavedContent(text);
  }, [fileData]);

  // Area changed from outside (rail/ticket) or nothing selected — pick a file.
  useEffect(() => {
    if (area === 'product') setFileName('PRODUCT.md');
    else setFileName('');
  }, [area]);

  useEffect(() => {
    if (!fileName && files.length > 0) setFileName(files[0]);
  }, [fileName, files]);

  function guardDirty() {
    return !dirty || window.confirm('You have unsaved changes. Discard them?');
  }

  function switchArea(next) {
    if (next === area) return;
    if (!guardDirty()) return;
    setPreview(false);
    setTab(next);
  }

  function switchFile(name) {
    if (!guardDirty()) return;
    setFileName(name);
  }

  async function save() {
    try {
      await api.put(`/api/projects/${projectId}/file`, { area, name: fileName, content });
      setSavedContent(content);
      // The journey rail keys off hasProduct/hasSpecs — refresh so the next
      // step lights up the moment the description or specs are saved.
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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

  // On-request generation for ANY editable file, always review-first: specs go
  // through /draft-specs (clean stories from all notes), everything else through
  // /draft-file (that one file from the product notes). Nothing is written until
  // the user approves the draft.
  async function generateDraft(target) {
    setDraftTarget(target);
    setDraftOpen(true);
    setDrafting(true);
    setDraftError(null);
    setDraftText('');
    try {
      const { draft } = target.area === 'specs'
        ? await api.post(`/api/projects/${projectId}/draft-specs`)
        : await api.post(`/api/projects/${projectId}/draft-file`, { area: target.area, name: target.name });
      setDraftText(draft);
    } catch (err) {
      setDraftError(err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function approveDraft() {
    const target = draftTarget;
    if (!target) return;
    try {
      await api.put(`/api/projects/${projectId}/file`, { area: target.area, name: target.name, content: draftText });
      queryClient.invalidateQueries({ queryKey: ['files', projectId, target.area] });
      queryClient.invalidateQueries({ queryKey: ['file', projectId, target.area, target.name] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setDraftOpen(false);
      if (target.area === area) setFileName(target.name);
      toast(`${target.name} saved`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  // What the ✨ Generate button drafts for the file currently open in the editor.
  const generateTarget = area === 'specs'
    ? { area: 'specs', name: 'stories.md' }
    : fileName ? { area, name: fileName } : null;
  // agent-pm-prompt.md is tuning, not draftable content.
  const canGenerate = generateTarget && (area !== 'vault' || fileName !== 'agent-pm-prompt.md');

  async function deleteSpec(name) {
    if (!window.confirm(`Delete ${name}? This can’t be undone.`)) return;
    try {
      await api.del(`/api/projects/${projectId}/file`, { area: 'specs', name });
      queryClient.invalidateQueries({ queryKey: ['files', projectId, 'specs'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      if (fileName === name) setFileName('');
      toast(`${name} deleted`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  const tokenBudget = area === 'vault' ? VAULT_TOKEN_LIMITS[fileName] : null;
  const tokenEstimate = useMemo(() => Math.ceil(content.length / 4), [content]);

  // Collapsed: one slim inviting row.
  if (tab === null) {
    return (
      <div className="panel" id="prep-station" style={{ marginBottom: 20 }}>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
          onClick={() => setTab('product')}
        >
          <span>{describeOnly
            ? '📜 Step 1 — Describe your charter'
            : '🧑‍🍳 Prep station — product description, story specs & vault'}</span>
          <span aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel panel-pad" id="prep-station" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{describeOnly ? '📜 Step 1 — Describe your charter' : '🧑‍🍳 Prep station'}</h3>
        {!describeOnly && <span className="sub" style={{ flex: 1 }}>{AREAS.find(a => a.key === area)?.hint}</span>}
        {describeOnly && <span style={{ flex: 1 }} />}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { if (guardDirty()) setTab(null); }}
          title="Collapse"
        >▴ Collapse</button>
      </div>

      {describeOnly && (
        <p className="sub" style={{ marginTop: 0, marginBottom: 12 }}>
          This is your charter. Tell the team anything and everything about the app —
          what it is, who it&rsquo;s for, your goals, what great looks like, what you
          care about most. Don&rsquo;t worry about structure: <strong>✨ Polish</strong> will
          shape it into a clean PRODUCT.md for your review. Story specs and the vault
          unlock as soon as your description is saved.
        </p>
      )}

      {running && (
        <div className="form-error" style={{ borderColor: 'rgba(255,182,72,0.4)', background: 'var(--glow-soft)', color: 'var(--glow)' }}>
          A session is cooking right now — changes you save apply to the <strong>next</strong> session.
        </div>
      )}

      {!describeOnly && (
        <div className="tabs">
          {AREAS.map(a => (
            <button key={a.key} className={area === a.key ? 'on' : ''} onClick={() => switchArea(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className={describeOnly ? undefined : 'editor-grid'}>
        {!describeOnly && (
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
            <button onClick={() => generateDraft({ area: 'specs', name: 'stories.md' })} style={{ color: 'var(--glow)', fontWeight: 800 }}>
              ✨ Generate clean specs
            </button>
          )}
          {area === 'specs' && files.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '8px 12px' }}>
              No specs yet — the team needs at least one story to cook.
            </p>
          )}
        </div>
        )}

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
                {canGenerate && (
                  <button
                    className="btn btn-ghost btn-sm"
                    title={area === 'product'
                      ? 'Rewrite your rough notes into a clean description + tech stack — you review before saving'
                      : 'Draft this file from your product notes — you review before saving'}
                    onClick={() => generateDraft(generateTarget)}
                  >
                    {area === 'product' ? '✨ Polish' : '✨ Generate'}
                  </button>
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
                  height="46vh"
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
        <h2>✨ {draftTarget?.area === 'product' ? 'Polished description' : `${draftTarget?.name ?? 'File'} draft`}</h2>
        {drafting ? (
          <p className="sub">Reading your notes (product description + every spec file) and drafting…</p>
        ) : draftError ? (
          <div className="form-error">{draftError}</div>
        ) : (
          <>
            <p className="sub">
              Drafted from your notes. Edit anything below, then approve — nothing is saved until you do.
              Approving writes <strong>{draftTarget?.name}</strong>, replacing its current content;
              every other file stays untouched.
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
            <button className="btn btn-glow" onClick={() => generateDraft(draftTarget)}>Try again</button>
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
    </div>
  );
}
