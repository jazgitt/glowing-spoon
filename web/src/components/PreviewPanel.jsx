// Live preview of the assembled prototype: assemble on demand, start/stop the
// dev server, open the running app. The start button is deliberately explicit —
// it executes AI-generated code on the server machine (see MEDIUM-3 in
// server/services/preview.js).
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from './ui.jsx';

const STATUS_LABELS = {
  installing: { label: 'Installing…', color: 'var(--glow)' },
  starting:   { label: 'Starting…',   color: 'var(--glow)' },
  running:    { label: 'Running',     color: '#5ec269' },
  stopped:    { label: 'Stopped',     color: 'var(--text-dim)' },
  failed:     { label: 'Failed',      color: '#e5484d' },
};

function PreviewLog({ text, tall = false }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div
      ref={bodyRef}
      style={{
        maxHeight: tall ? 320 : 180, minHeight: tall ? 120 : undefined,
        overflow: 'auto', background: 'var(--bg-sunken)',
        borderRadius: 8, padding: '8px 10px', fontSize: 12,
        fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', marginTop: 10,
      }}
    >
      {text || 'No output yet — the launch log appears here.'}
    </div>
  );
}

export default function PreviewPanel({ projectId, sessionRunning, previewLogText, embedded = false, expanded = false }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data } = useQuery({
    queryKey: ['preview', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/preview`),
    refetchInterval: 4000,
  });
  const preview = data?.preview;
  const hasPrototype = data?.hasPrototype;
  const isActive = ['installing', 'starting', 'running'].includes(preview?.status);
  const statusInfo = preview ? (STATUS_LABELS[preview.status] ?? STATUS_LABELS.stopped) : null;

  async function call(path, okMsg) {
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/${path}`);
      if (okMsg) toast(okMsg);
      queryClient.invalidateQueries({ queryKey: ['preview', projectId] });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  // No output at all yet — nothing to offer.
  if (!hasPrototype && !preview && sessionRunning) return null;

  return (
    <div className={embedded ? undefined : 'panel'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: embedded ? 14 : undefined }}>🍽️ Taste the dish</h3>
        {statusInfo && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: statusInfo.color,
            marginLeft: 'auto',
          }}>
            ● {statusInfo.label}
          </span>
        )}
      </div>

      {!hasPrototype ? (
        <div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13.5, marginBottom: 10 }}>
            No runnable prototype yet. Assemble one from the generated code —
            the assembler wires everything into an app you can open.
          </p>
          <button
            className="btn btn-glow btn-sm"
            disabled={busy || sessionRunning}
            onClick={() => call('assemble', 'Assembly session started — watch the pipeline')}
          >
            {busy ? 'Starting…' : '🧩 Assemble prototype'}
          </button>
          {sessionRunning && (
            <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 6 }}>
              Available when the current session finishes.
            </p>
          )}
        </div>
      ) : (
        <div>
          {!isActive && (
            confirming ? (
              <div>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 8 }}>
                  This runs the AI-generated code on the server machine. Start it?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-approve btn-sm" disabled={busy} onClick={() => call('preview/start', 'Preview starting — installing dependencies first')}>
                    {busy ? 'Starting…' : 'Yes, run it'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-glow btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
                ▶ Start preview
              </button>
            )
          )}

          {isActive && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {preview.status === 'running' && (
                <a className="btn btn-approve btn-sm" href={preview.url} target="_blank" rel="noreferrer">
                  🔗 Open app
                </a>
              )}
              <button className="btn btn-danger-outline btn-sm" disabled={busy} onClick={() => call('preview/stop', 'Preview stopped')}>
                Stop
              </button>
            </div>
          )}

          {preview?.status === 'failed' && (
            <p style={{ color: 'var(--text-dim)', fontSize: 12.5, marginTop: 8 }}>
              The app didn't come up — check the log below, then re-assemble or start again.
            </p>
          )}

          {!expanded && (isActive || preview) && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => setShowLog(s => !s)}
            >
              {showLog ? 'Hide log' : 'Show log'}
            </button>
          )}
          {(expanded || showLog) && <PreviewLog text={previewLogText} tall={expanded} />}
        </div>
      )}
    </div>
  );
}
