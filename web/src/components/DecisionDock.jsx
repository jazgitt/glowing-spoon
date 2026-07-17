// Sticky decision bar — appears only while the session is blocked on the PM.
// The single most important surface in the app: huge, obvious, impossible to miss.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { agentInfo } from '../lib/agents.js';

function PlanBody({ plan }) {
  // The engine stores the Agent PM's plan as a JSON string inside .pending.json.
  let parsed = plan;
  if (typeof plan === 'string') {
    try { parsed = JSON.parse(plan); } catch { parsed = null; }
  }
  const stories = parsed?.stories ?? [];
  if (!stories.length) return <p style={{ color: 'var(--text-dim)' }}>The plan is ready — approve to start building.</p>;
  return (
    <div>
      {parsed?.sessionGoal && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, marginBottom: 6 }}>
          <strong style={{ color: 'var(--text)' }}>Goal:</strong> {parsed.sessionGoal}
        </p>
      )}
      {stories.map((story, i) => {
        const title = typeof story === 'string' ? story : story.title ?? story.name ?? `Story ${i + 1}`;
        const desc = typeof story === 'object' ? story.description : null;
        const complexity = typeof story === 'object' ? story.complexity : null;
        return (
          <div className="plan-story" key={i}>
            <span className="ps-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="ps-title">
                {title}
                {complexity && (
                  <span className="retry-badge" style={{ marginLeft: 8, color: 'var(--text-dim)', background: 'var(--bg-sunken)' }}>
                    size {complexity}
                  </span>
                )}
              </div>
              {desc && <div className="ps-desc">{desc}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FAILURE_LABELS = {
  SYNTAX_ERROR: 'the generated code has syntax errors',
  QUALITY_GATE_PERMANENT: 'the work kept failing the quality check',
};

// Issues arrive either as strings (quality gate) or as validator objects
// { file, error, line } (syntax errors) — render both readably.
function IssueLine({ issue }) {
  if (issue && typeof issue === 'object' && (issue.file || issue.error)) {
    return (
      <li>
        <code style={{ color: 'var(--text)' }}>{issue.file}</code>
        {issue.error && <> — {issue.error}</>}
        {issue.line != null && <span style={{ color: 'var(--text-faint)' }}> (line {issue.line})</span>}
      </li>
    );
  }
  return <li>{typeof issue === 'string' ? issue : JSON.stringify(issue)}</li>;
}

function CheckpointBody({ pending, projectId }) {
  const files = pending.files ?? [];
  return (
    <div>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 8 }}>
        Story {(pending.storyIndex ?? 0) + 1} is built.{' '}
        <Link to={`/projects/${projectId}/output`} style={{ color: 'var(--glow)', fontWeight: 700 }}>
          Browse the full output →
        </Link>
      </p>
      {files.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No file preview available for this checkpoint.</p>
      ) : (
        files.map((f, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {f.relativePath}
              {f.truncated && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> (preview truncated — see full output)</span>}
            </div>
            <pre style={{
              margin: 0, padding: '8px 10px', maxHeight: 220, overflow: 'auto',
              background: 'var(--bg-sunken)', borderRadius: 8, fontSize: 12.5,
              fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {f.content}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

function EscalationBody({ pending }) {
  const info = agentInfo(pending.agent);
  const reason = FAILURE_LABELS[pending.failureType] ?? 'the step kept failing';
  return (
    <div>
      <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
        <strong style={{ color: info.color }}>{info.name}</strong> hit a wall — {reason},
        even after retries.
      </p>
      {Array.isArray(pending.issues) && pending.issues.length > 0 && (
        <ul style={{ margin: '8px 0 0 20px', color: 'var(--text-dim)', fontSize: 13.5 }}>
          {pending.issues.slice(0, 6).map((issue, i) => <IssueLine key={i} issue={issue} />)}
        </ul>
      )}
      {pending.failureType === 'SYNTAX_ERROR' && (
        <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 8 }}>
          Tip: errors at the very end of a file usually mean the story is too big to
          generate in one go — ask for it to be split into smaller pieces.
        </p>
      )}
    </div>
  );
}

const COPY = {
  'plan-approval': {
    icon: '🗺️',
    title: 'Your plan is served',
    sub: 'This is the menu the team proposes. Approve it, or send it back with notes.',
    approve: 'Approve plan',
    rejectPrompt: 'What should change about the plan?',
  },
  'checkpoint': {
    icon: '✋',
    title: 'Taste test — a story is ready',
    sub: 'The code for this story is written. Approve to let the reviewers take over.',
    approve: 'Looks good — keep cooking',
    rejectPrompt: 'What should the developer change?',
  },
  'escalation': {
    icon: '🆘',
    title: 'The team needs your call',
    sub: 'Approve to skip this story, or send guidance for another attempt.',
    approve: 'Skip this story',
    rejectPrompt: 'Guidance for the next attempt…',
  },
};

export default function DecisionDock({ session, projectId, onApprove, onReject, busy }) {
  const pending = session?.pending;
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const copy = pending ? COPY[pending.type] ?? COPY['checkpoint'] : null;

  function close() {
    setRejecting(false);
    setFeedback('');
  }

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="dock-wrap"
          initial={{ y: 140, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 140, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
          <div className="dock">
            <div className="dock-head">
              <span className="dk-icon">{copy.icon}</span>
              <div>
                <h3>{copy.title}</h3>
                <div className="dk-sub">{copy.sub}</div>
              </div>
            </div>

            <div className="dock-body">
              {pending.type === 'plan-approval' && <PlanBody plan={pending.plan} />}
              {pending.type === 'checkpoint' && <CheckpointBody pending={pending} projectId={projectId} />}
              {pending.type === 'escalation' && <EscalationBody pending={pending} />}
            </div>

            {rejecting ? (
              <div>
                <textarea
                  autoFocus
                  maxLength={2000}
                  placeholder={copy.rejectPrompt}
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                />
                <div className="dock-actions" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-glow"
                    disabled={busy || !feedback.trim()}
                    onClick={() => { onReject(feedback); close(); }}
                  >
                    Send it back
                  </button>
                  <button className="btn btn-ghost" onClick={close}>Cancel</button>
                  <span className="char-count">{feedback.length}/2000</span>
                </div>
              </div>
            ) : (
              <div className="dock-actions">
                <button className="btn btn-approve" disabled={busy} onClick={onApprove}>
                  {copy.approve}
                </button>
                <button className="btn btn-danger-outline" disabled={busy} onClick={() => setRejecting(true)}>
                  Request changes
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
