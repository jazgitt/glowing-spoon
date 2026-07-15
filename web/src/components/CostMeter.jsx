// Budget gauge + per-agent spend bars.
import { useMemo } from 'react';
import { agentInfo } from '../lib/agents.js';

export default function CostMeter({ session }) {
  const total = session?.tokenUsage?.total ?? 0;
  const budget = session?.costBudget ?? 0;
  const perAgent = session?.tokenUsage?.perAgent ?? {};
  const pct = budget > 0 ? Math.min(total / budget, 1) : 0;

  const ringColor = pct >= 1 ? 'var(--danger)' : pct >= 0.8 ? 'var(--glow)' : 'var(--approve)';

  const bars = useMemo(() => {
    const entries = Object.entries(perAgent).filter(([, v]) => v > 0);
    entries.sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 1;
    return entries.slice(0, 6).map(([agentId, value]) => ({
      agentId, value, width: `${Math.max(4, (value / max) * 100)}%`,
    }));
  }, [perAgent]);

  const R = 30;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="panel">
      <div className="costmeter">
        <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Budget used: ${Math.round(pct * 100)}%`}>
          <circle cx="38" cy="38" r={R} fill="none" stroke="var(--bg-sunken)" strokeWidth="9" />
          <circle
            cx="38" cy="38" r={R} fill="none"
            stroke={ringColor} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct)}
            transform="rotate(-90 38 38)"
            style={{ transition: 'stroke-dashoffset 0.7s ease, stroke 0.4s ease' }}
          />
          <text x="38" y="43" textAnchor="middle" fill="var(--text)" fontSize="15" fontWeight="800" fontFamily="var(--font-display)">
            {Math.round(pct * 100)}%
          </text>
        </svg>
        <div className="cm-nums">
          <div className="cm-total">${total.toFixed(2)}</div>
          <div className="cm-sub">of ${Number(budget).toFixed(2)} budget{session?.dryRun ? ' · dry run' : ''}</div>
          {pct >= 0.8 && pct < 1 && <div className="cm-sub" style={{ color: 'var(--glow)', fontWeight: 700 }}>Running warm — 80%+ used</div>}
          {pct >= 1 && <div className="cm-sub" style={{ color: 'var(--danger)', fontWeight: 700 }}>Budget reached — session halts</div>}
          {bars.length > 0 && (
            <div className="cm-bars">
              {bars.map(bar => {
                const info = agentInfo(bar.agentId);
                return (
                  <div className="cm-bar-row" key={bar.agentId}>
                    <span className="nm">{info.emoji} {info.name}</span>
                    <span className="cm-bar-track">
                      <span className="cm-bar-fill" style={{ width: bar.width, background: info.color }} />
                    </span>
                    <span>${bar.value.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
