// Browse everything the brigade produced: specs, source, tests, reviews, docs,
// and the four MVP report deliverables.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import ReactMarkdown from 'react-markdown';
import { api } from '../api/client.js';

const REPORTS = [
  { file: 'report/run-cost.md', icon: '🪙', name: 'Run cost', sub: 'Monthly cost estimate' },
  { file: 'report/compliance-checklist.md', icon: '🛡️', name: 'Compliance', sub: 'GDPR · PCI · a11y' },
  { file: 'report/pitch-one-pager.md', icon: '✨', name: 'Pitch', sub: 'One-pager & demo script' },
  { file: 'report/build-teardown.md', icon: '🧰', name: 'Teardown', sub: 'vs agency & freelancer' },
];

export default function OutputBrowser() {
  const { id: projectId } = useParams();
  const [selected, setSelected] = useState(null);

  const { data: treeData } = useQuery({
    queryKey: ['output-tree', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/output/tree`),
    refetchInterval: 10000,
  });
  const files = treeData?.files ?? [];

  const { data: fileData, isFetching } = useQuery({
    queryKey: ['output-file', projectId, selected],
    queryFn: () => api.get(`/api/projects/${projectId}/output/file?path=${encodeURIComponent(selected)}`),
    enabled: Boolean(selected),
    retry: false,
  });

  const groups = useMemo(() => {
    const byDir = new Map();
    for (const f of files) {
      const dir = f.path.includes('/') ? f.path.split('/')[0] : '·';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(f);
    }
    return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const availableReports = REPORTS.filter(r => files.some(f => f.path === r.file));
  const isMarkdown = selected?.endsWith('.md');

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Output</h1>
          <p className="sub">Everything the team has built so far. Files update as agents finish.</p>
        </div>
        <Link to={`/projects/${projectId}`} className="btn btn-ghost">← Mission control</Link>
      </div>

      {availableReports.length > 0 && (
        <div className="report-shortcuts">
          {availableReports.map(r => (
            <button key={r.file} className="report-card" onClick={() => setSelected(r.file)}>
              <span className="rc-icon">{r.icon}</span>
              <div className="rc-name">{r.name}</div>
              <div className="rc-sub">{r.sub}</div>
            </button>
          ))}
        </div>
      )}

      {files.length === 0 ? (
        <div className="panel empty-state">
          <span className="big">🍽️</span>
          <h2>Nothing plated yet</h2>
          <p>Output lands here as soon as the first agent finishes a step.</p>
        </div>
      ) : (
        <div className="output-grid">
          <div className="panel tree">
            {groups.map(([dir, dirFiles]) => (
              <div key={dir}>
                <div className="dir">{dir === '·' ? 'root' : dir}</div>
                {dirFiles.map(f => (
                  <button key={f.path} className={selected === f.path ? 'on' : ''} onClick={() => setSelected(f.path)}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.path.includes('/') ? f.path.slice(dir.length + 1) : f.path}
                    </span>
                    <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{(f.size / 1024).toFixed(1)}k</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="panel">
            {selected ? (
              isFetching ? null : isMarkdown ? (
                <div className="md-preview"><ReactMarkdown>{fileData?.content ?? ''}</ReactMarkdown></div>
              ) : (
                <CodeMirror
                  value={fileData?.content ?? ''}
                  editable={false}
                  theme="dark"
                  height="70vh"
                  basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
                />
              )
            ) : (
              <div className="empty-state">
                <span className="big">👈</span>
                <p>Pick a file to read it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
