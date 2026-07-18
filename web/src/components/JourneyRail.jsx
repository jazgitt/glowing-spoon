// The journey rail — all 6 steps of a project's life, always visible under the
// page head. The lifecycle genuinely is a sequence, so the numbering is honest:
// describe → specs → start → plan → build → collect. Done steps get a check,
// the current one glows amber, upcoming ones stay dim.
import { Link } from 'react-router-dom';

// Steps that are safe to revisit link somewhere; mid-session steps don't.
const STEP_LINKS = {
  describe: 'files?tab=product',
  specs: 'files?tab=specs',
  collect: 'output',
};

export default function JourneyRail({ journey, projectId }) {
  if (!journey?.next) return null;
  const currentIdx = journey.next.step;

  return (
    <nav className="journey-rail" aria-label="Project journey">
      {journey.steps.map((step, i) => {
        const state = step.done ? 'done' : i === currentIdx ? 'current' : 'todo';
        const to = STEP_LINKS[step.key];
        const chip = (
          <span className={`jr-chip jr-${state}`} title={step.full}>
            <span className="jr-num" aria-hidden="true">{step.done ? '✓' : i + 1}</span>
            <span className="jr-label">{step.label}</span>
          </span>
        );
        const linkable = step.done || state === 'current';
        return (
          <span className="jr-step" key={step.key}>
            {step.key === 'launch' && linkable
              ? <a href="#launch-pad" className="jr-link">{chip}</a>
              : to && linkable
                ? <Link to={`/projects/${projectId}/${to}`} className="jr-link">{chip}</Link>
                : chip}
            {i < journey.steps.length - 1 && <span className={`jr-line ${step.done ? 'done' : ''}`} aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
