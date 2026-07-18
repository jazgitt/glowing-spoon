// The Pass — the shelf where finished work lands, pinned to the top of the
// Mission Control sidebar. One surface for everything the PM takes away:
// the runnable prototype, the four report deliverables, the freshest files,
// a one-click zip of the whole build, and the door to the full browser.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

const REPORTS = [
  { file: 'report/run-cost.md', icon: '🪙', name: 'Run cost' },
  { file: 'report/compliance-checklist.md', icon: '🛡️', name: 'Compliance' },
  { file: 'report/pitch-one-pager.md', icon: '✨', name: 'Pitch' },
  { file: 'report/build-teardown.md', icon: '🧰', name: 'Teardown' },
  { file: 'report/model-performance.md', icon: '🤖', name: 'Models' },
];

function timeAgo(ms) {
  if (!ms) return '';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ThePass({ projectId }) {
  const { data } = useQuery({
    queryKey: ['output-tree', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/output/tree`),
    refetchInterval: 10000,
  });
  const files = data?.files ?? [];

  const reports = REPORTS.filter(r => files.some(f => f.path === r.file));
  const recent = useMemo(
    () => [...files]
      .filter(f => !f.path.startsWith('report/'))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, 3),
    [files],
  );

  return (
    <div className="panel pass">
      <div className="pass-head">
        <h3>🛎️ The Pass</h3>
        <span className="pass-sub">where finished work lands</span>
      </div>

      {files.length === 0 ? (
        <p className="pass-empty">
          Nothing plated yet — files appear here as soon as the first agent finishes a step.
        </p>
      ) : (
        <>
          {reports.length > 0 && (
            <div className="pass-section">
              <div className="pass-label">MVP report</div>
              <div className="pass-reports">
                {reports.map(r => (
                  <Link
                    key={r.file}
                    className="pass-report"
                    to={`/projects/${projectId}/output?file=${encodeURIComponent(r.file)}`}
                  >
                    <span>{r.icon}</span> {r.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className="pass-section">
              <div className="pass-label">Fresh off the stove</div>
              {recent.map(f => (
                <Link
                  key={f.path}
                  className="pass-file"
                  to={`/projects/${projectId}/output?file=${encodeURIComponent(f.path)}`}
                >
                  <span className="pf-name">{f.path}</span>
                  <span className="pf-when">{timeAgo(f.modifiedAt)}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="pass-actions">
            <a className="btn btn-glow btn-sm" href={`/api/projects/${projectId}/output/download`}>
              ⬇ Download .zip
            </a>
            <Link to={`/projects/${projectId}/output`} className="btn btn-ghost btn-sm">
              Browse all {files.length} files →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
