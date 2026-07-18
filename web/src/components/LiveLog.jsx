// Terminal-styled live feed. Lines are colored by their [prefix] using the same
// hues the CLI's chalk output uses, so terminal users and web users see one language.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, LOG_PREFIX_COLORS } from '../lib/agents.js';

const PREFIX_RE = /^\[([^\]]+)\]/;

// "[dev-agent]" → agent color; "[ERROR]" → status color; unknown → dim.
function prefixColor(prefix) {
  const key = prefix.trim();
  if (AGENTS[key]) return AGENTS[key].color;
  if (key === 'integration') return AGENTS['integration-agent'].color;
  if (key === 'teardown') return AGENTS['teardown-agent'].color;
  if (key === 'pitch-agent') return AGENTS['pitch-agent'].color;
  if (key === 'compliance') return AGENTS['compliance-agent'].color;
  if (key === 'assembler') return AGENTS['assembler-agent'].color;
  return LOG_PREFIX_COLORS[key] ?? '#9c94c0';
}

function agentIdForLine(prefix) {
  const key = prefix.trim();
  if (AGENTS[key]) return key;
  if (key === 'integration') return 'integration-agent';
  if (key === 'teardown') return 'teardown-agent';
  if (key === 'compliance') return 'compliance-agent';
  if (key === 'assembler') return 'assembler-agent';
  return null;
}

export default function LiveLog({ logText, connected }) {
  const bodyRef = useRef(null);
  const [pinned, setPinned] = useState(true);
  const [filter, setFilter] = useState(null); // agentId or null = all

  const lines = useMemo(() => {
    const raw = logText.split('\n');
    // Keep the tail — the panel is a feed, not an archive.
    return raw.slice(-2000);
  }, [logText]);

  const activeAgents = useMemo(() => {
    const seen = new Set();
    for (const line of lines) {
      const m = PREFIX_RE.exec(line);
      const id = m && agentIdForLine(m[1]);
      if (id) seen.add(id);
    }
    return [...seen];
  }, [lines]);

  const visible = useMemo(() => {
    if (!filter) return lines;
    return lines.filter(line => {
      const m = PREFIX_RE.exec(line);
      return m && agentIdForLine(m[1]) === filter;
    });
  }, [lines, filter]);

  // Autoscroll unless the user scrolled up to read.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [visible, pinned]);

  function onScroll() {
    const el = bodyRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }

  return (
    <div className="panel livelog">
      <div className="livelog-head">
        <span className={`livelog-dot ${connected ? '' : 'off'}`} />
        <h3>Kitchen radio</h3>
        {!pinned && (
          <button className="btn btn-ghost btn-sm" onClick={() => setPinned(true)}>
            ↓ Follow
          </button>
        )}
      </div>
      {activeAgents.length > 1 && (
        <div className="log-filters">
          <button className={`log-chip ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>all</button>
          {activeAgents.map(id => (
            <button
              key={id}
              className={`log-chip ${filter === id ? 'on' : ''}`}
              style={{ '--chip-color': AGENTS[id]?.color }}
              onClick={() => setFilter(f => (f === id ? null : id))}
            >
              {AGENTS[id]?.emoji} {AGENTS[id]?.name ?? id}
            </button>
          ))}
        </div>
      )}
      <div className="livelog-body" ref={bodyRef} onScroll={onScroll}>
        {visible.length === 0 || (visible.length === 1 && !visible[0]) ? (
          <span className="livelog-empty">Waiting for the first sizzle…</span>
        ) : (
          visible.map((line, i) => {
            const m = PREFIX_RE.exec(line);
            if (!m) return <div key={i}>{line}</div>;
            return (
              <div key={i}>
                <span className="ll-prefix" style={{ color: prefixColor(m[1]) }}>[{m[1]}]</span>
                {line.slice(m[0].length)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
