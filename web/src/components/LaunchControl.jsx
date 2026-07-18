// Launch control — the audio layer of a session. Two opt-in toggles (autoplay
// policy requires the enabling click) and a transition watcher that calls the
// build like a rocket launch: countdown at ignition, stage separations per
// story, applause and fireworks at touchdown. Visual confetti stays in
// ConfettiManager; this component owns everything you can hear.
import { useEffect, useRef, useState } from 'react';
import {
  startMusic, stopMusic, cheer, say, stopSpeech, unlock,
} from '../lib/mission-audio.js';
import { JOURNEY_STEPS } from '../lib/journey.js';

// 1-based step numbers pulled from the same source the rail and ticket use,
// so what you hear always matches what you see.
const STEP = Object.fromEntries(JOURNEY_STEPS.map((s, i) => [s.key, i + 1]));

function usePref(key) {
  const [on, setOn] = useState(() => localStorage.getItem(key) === '1');
  useEffect(() => { localStorage.setItem(key, on ? '1' : '0'); }, [key, on]);
  return [on, setOn];
}

export default function LaunchControl({ session }) {
  const [musicOn, setMusicOn] = usePref('gs-music');
  const [voiceOn, setVoiceOn] = usePref('gs-voice');
  const prev = useRef(null);
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;

  const running = Boolean(session?.running);

  // The symphony plays whenever it's switched on — from step one, cooking or not.
  useEffect(() => {
    if (musicOn) startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [musicOn]);

  useEffect(() => () => stopSpeech(), []);

  // Milestone commentary — same transition-watching pattern as ConfettiManager.
  useEffect(() => {
    if (!session) return;
    const p = prev.current;
    const cur = {
      running,
      status: session.status,
      pendingType: session.pending?.type ?? null,
      storyIndex: session.pipeline?.storyIndex ?? 0,
      storyCount: session.pipeline?.stories?.length ?? 0,
    };
    prev.current = cur;
    if (!p || !voiceRef.current) return;

    if (cur.running && !p.running && cur.status !== 'complete') {
      say(`T minus 3. 2. 1. Ignition. Step ${STEP.plan}, planning the menu.`);
    } else if (cur.pendingType === 'plan-approval' && p.pendingType !== 'plan-approval') {
      say(`Step ${STEP.plan}, plan. The flight plan is in — awaiting your go.`);
    } else if (p.pendingType === 'plan-approval' && cur.pendingType !== 'plan-approval' && cur.storyCount > 0) {
      say(`Step ${STEP.plan} complete. Go for launch. Step ${STEP.build}, build, underway.`);
      cheer(1.6);
    } else if (cur.pendingType === 'checkpoint' && p.pendingType !== 'checkpoint') {
      say(`Step ${STEP.build}, build. Story ${cur.storyIndex + 1} of ${cur.storyCount} is holding for taste test — your call.`);
    } else if (cur.pendingType === 'escalation' && p.pendingType !== 'escalation') {
      say(`Step ${STEP.build}, build. We have a problem — your call.`);
    } else if (cur.storyIndex > p.storyIndex && cur.status === 'executing') {
      say(`Step ${STEP.build}, build. Story ${cur.storyIndex} of ${cur.storyCount} shipped.`);
      cheer(1.8);
    } else if (cur.status === 'complete' && p.status !== 'complete') {
      say(`Step ${STEP.collect}, collect. Touchdown — mission accomplished. The dish is served.`);
      cheer(2.6);
    }
  }, [session, running]);

  return (
    <div className="panel launch-control">
      <span className="lc-label">🚀 Launch audio</span>
      <button
        className={`log-chip ${musicOn ? 'on' : ''}`}
        style={{ '--chip-color': 'var(--glow)' }}
        aria-pressed={musicOn}
        onClick={() => {
          unlock(); // the click IS the autoplay-policy gesture — use it
          setMusicOn(v => !v);
        }}
        title="Mozart symphonies No. 25, 40 and 41 — full movements, in order"
      >
        🎻 Symphony
      </button>
      <button
        className={`log-chip ${voiceOn ? 'on' : ''}`}
        style={{ '--chip-color': 'var(--glow)' }}
        aria-pressed={voiceOn}
        onClick={() => {
          unlock();
          if (!voiceOn) say('Launch audio check. Mission control is online.');
          else stopSpeech();
          setVoiceOn(v => !v);
        }}
        title="Flight-director commentary at every milestone"
      >
        🎙 Commentary
      </button>
      <span className="lc-hint">Mozart symphonies 25 → 40 → 41, full movements in order — commentary calls each step.</span>
    </div>
  );
}
