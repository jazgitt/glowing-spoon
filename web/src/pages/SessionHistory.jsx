// Past sessions for this project, from session-history/ archives.
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export default function SessionHistory() {
  const { id: projectId } = useParams();
  const { data } = useQuery({
    queryKey: ['history', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/history`),
  });
  const archives = data?.archives ?? [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Session history</h1>
          <p className="sub">Every past run of this project’s kitchen.</p>
        </div>
        <Link to={`/projects/${projectId}`} className="btn btn-ghost">← Mission control</Link>
      </div>

      {archives.length === 0 ? (
        <div className="panel empty-state">
          <span className="big">🗂</span>
          <h2>No finished sessions yet</h2>
          <p>Completed and stopped sessions are archived here.</p>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Session</th>
                <th>Status</th>
                <th>Steps done</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {archives.map(a => (
                <tr key={a.sessionId}>
                  <td>{a.completedAt ? new Date(a.completedAt).toLocaleString() : '—'}</td>
                  <td className="mono">{a.sessionId?.slice(0, 8)}…</td>
                  <td>{a.status === 'complete' ? '✅ complete' : `⏸ ${a.status}`}</td>
                  <td>{a.completedSteps?.length ?? 0}</td>
                  <td className="mono">${(a.tokenUsage?.total ?? 0).toFixed(2)} / ${a.costBudget}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
