// The journey rail — all 6 steps of a project's life, always visible under the
// page head. The lifecycle genuinely is a sequence, so the numbering is honest:
// describe → specs → start → plan → build → collect. Done steps get a check,
// the current one glows amber, upcoming ones stay dim.
import { Link } from 'react-router-dom';

// Steps that are safe to revisit link somewhere; mid-session steps don't.
// describe/specs open the inline Prep Station on Mission Control via onPrep.
const STEP_LINKS = { collect: 'output' };
const PREP_TABS = { describe: 'product', specs: 'specs' };

export default function JourneyRail({ journey, projectId, onPrep }) {
  if (!journey?.next) return null;
  const currentIdx = journey.next.step;

  return (
    <nav className="journey-rail" aria-label="Project journey">
      {journey.steps.map((step, i) => {
        const state = step.done ? 'done' : i === currentIdx ? 'current' : 'todo';
        const to = STEP_LINKS[step.key];
        const prepTab = PREP_TABS[step.key];
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
              : prepTab && linkable && onPrep
                ? <button
                    type="button" className="jr-link"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={() => onPrep(prepTab)}
                  >{chip}</button>
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
