// Celebrations: watches session transitions and fires confetti at the right sizes.
// Small burst = plan approved · medium = story shipped · cannon = session complete.
import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

const BRAND_COLORS = ['#ffb648', '#4ade80', '#5b9dff', '#e879f9', '#facc15', '#2dd4bf'];

function burst(power) {
  const base = { colors: BRAND_COLORS, disableForReducedMotion: true };
  if (power === 'small') {
    confetti({ ...base, particleCount: 50, spread: 60, origin: { y: 0.7 } });
  } else if (power === 'medium') {
    confetti({ ...base, particleCount: 120, spread: 90, origin: { y: 0.65 } });
  } else {
    // Full cannon: three volleys across the screen.
    confetti({ ...base, particleCount: 160, spread: 100, origin: { x: 0.2, y: 0.7 } });
    setTimeout(() => confetti({ ...base, particleCount: 160, spread: 100, origin: { x: 0.8, y: 0.7 } }), 250);
    setTimeout(() => confetti({ ...base, particleCount: 220, spread: 140, origin: { x: 0.5, y: 0.6 } }), 550);
  }
}

export default function ConfettiManager({ session }) {
  const prev = useRef(null);

  useEffect(() => {
    if (!session) return;
    const p = prev.current;
    prev.current = {
      status: session.status,
      storyIndex: session.pipeline?.storyIndex ?? 0,
      hadPlanPending: session.pending?.type === 'plan-approval',
      storyCount: session.pipeline?.stories?.length ?? 0,
    };
    if (!p) return; // first observation — no transition yet

    // Plan approved: plan-approval pending disappeared and stories now exist.
    if (p.hadPlanPending && session.pending?.type !== 'plan-approval' && (session.pipeline?.stories?.length ?? 0) > 0) {
      burst('small');
      return;
    }
    // Story shipped: the cursor moved forward.
    if ((session.pipeline?.storyIndex ?? 0) > p.storyIndex && session.status === 'executing') {
      burst('medium');
      return;
    }
    // Order up!
    if (session.status === 'complete' && p.status !== 'complete') {
      burst('cannon');
    }
  }, [session]);

  return null;
}
