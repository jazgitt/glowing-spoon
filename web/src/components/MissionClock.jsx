// Mission clock — T+ elapsed since the session started, launch-control style.
// Ticks while the session lives; freezes at the last update once it's over.
import { useEffect, useState } from 'react';

function fmt(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function MissionClock({ session }) {
  const [, tick] = useState(0);
  const live = Boolean(session?.running || session?.pending);

  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => tick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!session?.createdAt) return null;
  const end = live ? Date.now() : (session.updatedAt ?? Date.now());

  return (
    <span className="mission-clock" title="Time since this session started">
      <span className="mc-label">T+</span>{fmt(end - session.createdAt)}
    </span>
  );
}
