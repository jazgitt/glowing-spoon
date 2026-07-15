// The stove: who's cooking right now, with the signature warm glow.
import { useEffect, useMemo, useState } from 'react';
import { agentInfo, KITCHEN_QUIET } from '../lib/agents.js';
import { AgentAvatar } from './ui.jsx';

function useRotating(list, intervalMs = 5000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return list[i % list.length];
}

function Elapsed({ since }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return <div className="np-timer">on it for {m}:{s}</div>;
}

export default function NowPlaying({ session }) {
  const pending = session?.pending;
  const running = session?.running;
  const status = session?.status;
  const currentStep = session?.currentStep;

  const info = agentInfo(pending?.type === 'escalation' ? pending.agent : currentStep ?? 'agent-pm');
  const flavor = useRotating(info.flavor ?? ['working…']);
  const quiet = useRotating(KITCHEN_QUIET, 7000);

  const mode = useMemo(() => {
    if (pending?.type === 'plan-approval') return 'plan-wait';
    if (pending?.type === 'checkpoint') return 'checkpoint-wait';
    if (pending?.type === 'escalation') return 'escalation';
    if (status === 'complete') return 'complete';
    if (running && currentStep) return 'cooking';
    if (running) return 'planning';
    if (session?.runnerDead) return 'crashed';
    if (status === 'stopped') return 'paused';
    return 'idle';
  }, [pending, running, status, currentStep, session?.runnerDead]);

  const content = {
    'cooking': {
      halo: info.color,
      avatar: <AgentAvatar agentId={currentStep} size="lg" running />,
      title: `${info.name} is cooking`,
      sub: flavor,
      timer: session?.updatedAt,
    },
    'planning': {
      halo: '#ffb648',
      avatar: <AgentAvatar agentId="agent-pm" size="lg" running />,
      title: 'Maestro is planning the menu',
      sub: 'Breaking your product into bite-size stories…',
      timer: session?.updatedAt,
    },
    'plan-wait': {
      halo: '#ffb648',
      avatar: <AgentAvatar agentId="agent-pm" size="lg" />,
      title: 'The plan is ready for you',
      sub: 'Review it below — approve it or ask for changes.',
    },
    'checkpoint-wait': {
      halo: '#ffb648',
      avatar: <AgentAvatar agentId="dev-agent" size="lg" />,
      title: 'Taste test time',
      sub: 'Forge finished this story’s code. Give it a look before the team moves on.',
    },
    'escalation': {
      halo: '#fb7185',
      avatar: <AgentAvatar agentId={pending?.agent} size="lg" />,
      title: `${info.name} needs a hand`,
      sub: 'Something kept failing. Skip this story or send guidance below.',
    },
    'complete': {
      halo: '#4ade80',
      avatar: <span style={{ fontSize: 44 }}>🛎️</span>,
      title: 'Order up! Everything is done',
      sub: 'Browse the output and the MVP report — your build is ready.',
    },
    'crashed': {
      halo: '#fb7185',
      avatar: <span style={{ fontSize: 44 }}>💤</span>,
      title: 'The kitchen went dark',
      sub: 'The session process stopped unexpectedly. Resume to pick up where it left off.',
    },
    'paused': {
      halo: 'transparent',
      avatar: <span style={{ fontSize: 44 }}>⏸️</span>,
      title: 'Paused',
      sub: 'Resume whenever you’re ready — the team remembers exactly where it was.',
    },
    'idle': {
      halo: 'transparent',
      avatar: <span style={{ fontSize: 44 }}>🥄</span>,
      title: quiet,
      sub: 'Start a session to fire up the burners.',
    },
  }[mode];

  return (
    <div className="panel nowplaying">
      <div className="halo" style={{ '--np-halo': content.halo }} />
      {content.avatar}
      <div className="np-body">
        <div className="np-title">{content.title}</div>
        <div className="np-flavor">{content.sub}</div>
        {content.timer && mode === 'cooking' && <Elapsed since={content.timer} />}
      </div>
    </div>
  );
}
