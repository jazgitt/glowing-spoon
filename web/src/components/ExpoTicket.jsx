// The Expo Ticket — the expediter's order ticket, clipped to the top of
// Mission Control. In every lifecycle state it names the step you're on and
// the single next action. Amber glow ONLY when the PM must act; quiet while
// the brigade cooks; green once the order is served.
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

function TicketCta({ cta, projectId, busy, onStart, onResume, onAssemble }) {
  if (!cta) return null;
  switch (cta.type) {
    case 'link':
      return <Link to={`/projects/${projectId}/${cta.to}`} className="btn btn-glow">{cta.label}</Link>;
    case 'start':
      return <button className="btn btn-glow" onClick={onStart}>{cta.label}</button>;
    case 'resume':
      return <button className="btn btn-glow" disabled={busy} onClick={onResume}>{cta.label}</button>;
    case 'assemble':
      return <button className="btn btn-glow" disabled={busy} onClick={onAssemble}>{busy ? 'Starting…' : cta.label}</button>;
    case 'anchor':
      return <a className="btn btn-glow" href={cta.to}>{cta.label}</a>;
    case 'open':
      return <a className="btn btn-approve" href={cta.href} target="_blank" rel="noreferrer">{cta.label}</a>;
    default:
      return null;
  }
}

export default function ExpoTicket({ journey, projectId, busy, onStart, onResume, onAssemble }) {
  const next = journey?.next;
  if (!next) return null;

  const total = journey.steps.length;
  const served = ['collect', 'assemble', 'launch', 'launched'].includes(next.key);
  const variant = served ? 'ticket-served' : next.quiet ? 'ticket-quiet' : 'ticket-live';
  const eyebrow = served
    ? `Order up · step ${next.step + 1} of ${total}`
    : next.quiet
      ? `On the stove · step ${next.step + 1} of ${total} · nothing needed`
      : `Next up · step ${next.step + 1} of ${total}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={next.key}
        className={`ticket ${variant} ${!next.quiet && !served ? 'glowing' : ''}`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25 }}
      >
        <span className="ticket-clip" aria-hidden="true" />
        <div className="ticket-body">
          <div className="ticket-eyebrow">{eyebrow}</div>
          <h2 className="ticket-title">{next.title}</h2>
          <p className="ticket-sub">{next.body}</p>
        </div>
        {(next.cta || served) && (
          <>
            <div className="ticket-tear" aria-hidden="true" />
            <div className="ticket-actions">
              <TicketCta
                cta={next.cta}
                projectId={projectId}
                busy={busy}
                onStart={onStart}
                onResume={onResume}
                onAssemble={onAssemble}
              />
              {served && (
                <Link to={`/projects/${projectId}/output`} className="btn btn-ghost">Browse all output</Link>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
