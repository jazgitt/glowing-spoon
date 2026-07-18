import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../api/client.js';
import { StatusPill } from '../components/ui.jsx';
import { deriveJourney } from '../lib/journey.js';

function ProjectCard({ project, index }) {
  const s = project.session;
  const needsYou = Boolean(s?.pendingType);
  const next = deriveJourney(project, s)?.next;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link
        to={`/projects/${project.id}`}
        className={`panel project-card ${needsYou ? 'glowing' : ''}`}
        style={needsYou ? { '--glow-color': 'rgba(255,182,72,0.28)', borderColor: 'rgba(255,182,72,0.5)' } : undefined}
      >
        <h3>{project.name}</h3>
        <span className="pid">{project.id}</span>
        <div className="meta">
          <StatusPill session={s ? { ...s, pending: s.pendingType ? {} : null } : null} />
          {s && s.storyCount > 0 && (
            <span className="story-sub">
              {s.status === 'complete' ? s.storyCount : Math.min(s.storyIndex, s.storyCount)} of {s.storyCount} stories done
            </span>
          )}
          {s && <span className="cost">${(s.costUsed ?? 0).toFixed(2)} / ${s.costBudget}</span>}
        </div>
        {next && (
          <div className={`next-hint ${next.quiet ? 'quiet' : ''}`}>
            {next.quiet ? '👨‍🍳' : '👉'} {next.quiet ? next.shortLabel : `Next: ${next.shortLabel}`}
          </div>
        )}
      </Link>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
    refetchInterval: 5000,
  });

  const projects = data?.projects ?? [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="sub">Every project gets its own AI kitchen brigade.</p>
        </div>
        <Link to="/projects/new" className="btn btn-glow">+ New project</Link>
      </div>

      {error && <div className="form-error">{error.message}</div>}

      {isLoading ? null : projects.length === 0 ? (
        <div className="panel empty-state">
          <span className="big">🥄</span>
          <h2>The kitchen is empty</h2>
          <p>Create your first project and let the brigade start cooking.</p>
          <p style={{ marginTop: 18 }}>
            <Link to="/projects/new" className="btn btn-glow">Create a project</Link>
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
        </div>
      )}
    </main>
  );
}
