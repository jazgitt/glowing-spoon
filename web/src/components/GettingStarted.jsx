// Numbered onboarding steps for a project that hasn't run a session yet.
// Each step is a CTA; completed steps get a check and the current one glows.
import { Link } from 'react-router-dom';

export default function GettingStarted({ projectId, project, onStartSession }) {
  const steps = [
    {
      title: 'Describe your product',
      done: Boolean(project?.hasProduct),
      body: 'A few sentences about what you’re building. The team drafts your story specs from this — you can change everything later.',
      cta: <Link to={`/projects/${projectId}/files?tab=product`} className="btn btn-glow btn-sm">Edit description</Link>,
    },
    {
      title: 'Get your story specs ready',
      done: Boolean(project?.hasSpecs),
      body: 'Stories are what the team actually builds from. Write them yourself, or let the team draft a clean set from all your notes — you review and approve before anything is saved.',
      cta: <Link to={`/projects/${projectId}/files?tab=specs`} className="btn btn-glow btn-sm">Review specs</Link>,
    },
    {
      title: 'Start a session',
      done: false,
      body: 'The team plans first and shows you the plan — nothing gets built without your approval.',
      cta: <button className="btn btn-glow btn-sm" onClick={onStartSession}>🔥 Start session</button>,
    },
    {
      title: 'Approve as it cooks',
      done: false,
      body: 'You approve the plan, then taste-test each story’s code at a checkpoint. Send anything back with feedback.',
      cta: null,
    },
    {
      title: 'Taste the dish',
      done: false,
      body: 'When the session finishes, the assembler wires everything into a runnable app — open it right from the Preview panel.',
      cta: null,
    },
  ];

  // The first not-done step is "current"; later steps are upcoming.
  const currentIdx = steps.findIndex(s => !s.done);

  return (
    <div className="panel panel-pad" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>👨‍🍳 Getting started</h2>
      <div>
        {steps.map((step, i) => {
          const isCurrent = i === currentIdx;
          const upcoming = i > currentIdx;
          return (
            <div
              key={i}
              style={{
                display: 'flex', gap: 12, padding: '10px 0',
                opacity: upcoming ? 0.55 : 1,
                borderBottom: i < steps.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.06))' : 'none',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13,
                background: step.done ? 'rgba(94,194,105,0.15)' : isCurrent ? 'var(--glow-soft)' : 'var(--bg-sunken)',
                color: step.done ? '#5ec269' : isCurrent ? 'var(--glow)' : 'var(--text-dim)',
              }}>
                {step.done ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  Step {i + 1} — {step.title}
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '3px 0 6px' }}>{step.body}</p>
                {isCurrent && step.cta}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
