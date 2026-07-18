// The expediter's brain: one function that looks at a project + session and
// answers "which of the 6 journey steps are done, and what should the PM do
// next?". Used by the Expo Ticket, the journey rail, and the dashboard cards —
// one derivation so they can never disagree.
//
// Works with both session shapes the API produces:
//  - the full session view   (session.pending object, session.pipeline)
//  - the dashboard summary   (pendingType, storyIndex, storyCount flat fields)

export const JOURNEY_STEPS = [
  { key: 'describe', label: 'Describe', full: 'Describe your product' },
  { key: 'specs', label: 'Specs', full: 'Get story specs ready' },
  { key: 'start', label: 'Start', full: 'Start a session' },
  { key: 'plan', label: 'Plan', full: 'Approve the plan' },
  { key: 'build', label: 'Build', full: 'Build & taste-test' },
  { key: 'collect', label: 'Collect', full: 'Collect the dish' },
  { key: 'launch', label: 'Launch', full: 'Run the prototype' },
];

export function deriveJourney(project, session, { hasPrototype = false, previewStatus = null, previewUrl = null } = {}) {
  const pendingType = session?.pending?.type ?? session?.pendingType ?? null;
  const pending = session?.pending ?? null;
  const storyCount = session?.pipeline?.stories?.length ?? session?.storyCount ?? 0;
  const storyIndex = pending?.storyIndex ?? session?.pipeline?.storyIndex ?? session?.storyIndex ?? 0;
  const status = session?.status ?? null;
  const running = Boolean(session?.running);
  const complete = status === 'complete';

  const done = [
    Boolean(project?.hasProduct),
    Boolean(project?.hasSpecs),
    Boolean(session),
    Boolean(session && (storyCount > 0 || complete)),
    complete,
    complete && hasPrototype,
    previewStatus === 'running',
  ];

  // next: { step (0-based), key, title, body, shortLabel, quiet, cta }
  // cta: { type: 'link'|'start'|'resume'|'assemble'|'open'|'anchor', label, to? } | null
  // quiet = the brigade is working; nothing is needed from the PM.
  let next;

  if (!project) {
    next = null;
  } else if (!done[0]) {
    next = {
      step: 0, key: 'describe', quiet: false,
      title: 'Describe your product',
      body: 'A few sentences about what you’re building. The team drafts your story specs from this — you can change everything later.',
      shortLabel: 'Describe your product',
      cta: { type: 'link', label: 'Write the description', to: 'files?tab=product' },
    };
  } else if (!done[1]) {
    next = {
      step: 1, key: 'specs', quiet: false,
      title: 'Get your story specs ready',
      body: 'Stories are what the team builds from. Write them yourself, or let the team draft a clean set from your notes — nothing is saved until you approve it.',
      shortLabel: 'Write story specs',
      cta: { type: 'link', label: 'Get specs ready', to: 'files?tab=specs' },
    };
  } else if (!session) {
    next = {
      step: 2, key: 'start', quiet: false,
      title: 'Start a session',
      body: 'The team plans first and shows you the plan — nothing gets built without your approval.',
      shortLabel: 'Start a session',
      cta: { type: 'start', label: '🔥 Start session' },
    };
  } else if (pendingType === 'plan-approval') {
    next = {
      step: 3, key: 'plan', quiet: false,
      title: 'Approve the plan',
      body: 'The proposed menu is in the amber decision card at the bottom of your screen. Approve it, or send it back with notes.',
      shortLabel: 'Approve the plan',
      cta: null,
    };
  } else if (pendingType === 'checkpoint') {
    next = {
      step: 4, key: 'checkpoint', quiet: false,
      title: `Taste-test story ${storyIndex + 1}`,
      body: 'The code for this story is written. Review it in the decision card at the bottom of your screen, then approve or send it back.',
      shortLabel: 'Taste-test a story',
      cta: null,
    };
  } else if (pendingType === 'escalation') {
    next = {
      step: 4, key: 'escalation', quiet: false,
      title: 'The team needs your call',
      body: 'A story kept failing even after retries. Use the decision card at the bottom of your screen to skip it or send guidance.',
      shortLabel: 'Team needs your call',
      cta: null,
    };
  } else if (session.runnerDead) {
    next = {
      step: storyCount > 0 ? 4 : 3, key: 'crashed', quiet: false,
      title: 'The kitchen went dark',
      body: 'The session process stopped unexpectedly. Resume it — the team remembers exactly where it was.',
      shortLabel: 'Resume the session',
      cta: { type: 'resume', label: '▶ Resume session' },
    };
  } else if (!running && !complete) {
    next = {
      step: storyCount > 0 ? 4 : 3, key: 'paused', quiet: false,
      title: 'The session is paused',
      body: 'Resume whenever you’re ready — the team picks up exactly where it left off.',
      shortLabel: 'Resume the session',
      cta: { type: 'resume', label: '▶ Resume session' },
    };
  } else if (running && storyCount === 0) {
    next = {
      step: 3, key: 'planning', quiet: true,
      title: 'Maestro is planning the menu',
      body: 'Nothing needed from you yet. The plan lands here for your approval in a minute or two.',
      shortLabel: 'Planning — nothing needed',
      cta: null,
    };
  } else if (running) {
    next = {
      step: 4, key: 'cooking', quiet: true,
      title: `Story ${Math.min(storyIndex + 1, storyCount)} of ${storyCount} is cooking`,
      body: 'Nothing needed from you right now. The next taste test appears here the moment it’s ready.',
      shortLabel: 'Cooking — nothing needed',
      cta: null,
    };
  } else if (!hasPrototype) {
    next = {
      step: 5, key: 'assemble', quiet: false,
      title: 'Order up! Assemble your dish',
      body: 'All stories shipped. Assemble them into a runnable prototype — then launch it from the Launch pad.',
      shortLabel: 'Collect your build',
      cta: { type: 'assemble', label: '🧩 Assemble prototype' },
    };
  } else if (previewStatus === 'running') {
    next = {
      step: 6, key: 'launched', quiet: false,
      title: 'Your app is live',
      body: 'The prototype is up and serving. Open it and taste the dish — the full build lives in your project workspace folder.',
      shortLabel: 'App is live — open it',
      cta: previewUrl
        ? { type: 'open', href: previewUrl, label: '🔗 Open the running app' }
        : { type: 'anchor', to: '#launch-pad', label: '🚀 Go to the Launch pad' },
    };
  } else {
    next = {
      step: 6, key: 'launch', quiet: false,
      title: 'Launch your prototype',
      body: 'The dish is plated — one step left. Fire it up from the Launch pad below and open your running app.',
      shortLabel: 'Launch your prototype',
      cta: { type: 'anchor', to: '#launch-pad', label: '🚀 Go to the Launch pad' },
    };
  }

  return { steps: JOURNEY_STEPS.map((s, i) => ({ ...s, done: done[i] })), next };
}
