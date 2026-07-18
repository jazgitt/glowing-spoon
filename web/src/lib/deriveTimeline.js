// Pure derivation: (.session.json view + .pending.json) → renderable step timeline.
//
// Engine facts this leans on (engine/session-runner.js, store/session-schema.js):
// - pipeline.stage ∈ 'plan' | 'spec' | 'checkpoint' | 'done'
// - per-story agent order: spec → dev → ✋checkpoint → (integration) → review → qa → docs
// - completedSteps is a flat, chronological [{agentId, timestamp}] across all stories
// - pending ∈ {type:'plan-approval'} | {type:'checkpoint'} | {type:'escalation', agent}
// - MVP report agents run once after the last story.

const STORY_AGENTS = ['spec-agent', 'dev-agent', 'integration-agent', 'review-agent', 'qa-agent', 'docs-agent'];
const REPORT_AGENTS = ['cost-agent', 'compliance-agent', 'pitch-agent', 'teardown-agent'];

// status values: 'todo' | 'running' | 'done' | 'blocked' | 'failed'
export function deriveTimeline(session, pendingOverride) {
  if (!session) return { steps: [], progress: 0 };
  const pending = pendingOverride !== undefined ? pendingOverride : session.pending;
  const { pipeline = {}, completedSteps = [], agents = {}, currentStep, status } = session;
  const stories = pipeline.stories ?? [];
  const storyIndex = pipeline.storyIndex ?? 0;
  const stage = pipeline.stage ?? 'plan';
  const isComplete = status === 'complete';
  const runnerActive = Boolean(session.running);

  // How many times each agent completed — completions ≥ storyNumber ⇒ that story's run is done.
  const completions = {};
  for (const step of completedSteps) {
    completions[step.agentId] = (completions[step.agentId] ?? 0) + 1;
  }

  const steps = [];

  // ── 1. Plan step ───────────────────────────────────────────
  const planDone = stories.length > 0 && stage !== 'plan';
  steps.push({
    kind: 'plan',
    title: 'Plan the build',
    status: pending?.type === 'plan-approval' ? 'blocked'
      : planDone || isComplete ? 'done'
      : status === 'planning' && runnerActive ? 'running'
      : 'todo',
  });

  // ── 2. One step per story ──────────────────────────────────
  stories.forEach((story, i) => {
    const storyDone = isComplete || i < storyIndex || stage === 'done';
    const isCurrent = !storyDone && i === storyIndex;
    const title = typeof story === 'string' ? story : (story.title ?? story.name ?? `Story ${i + 1}`);
    const description = typeof story === 'object' ? (story.description ?? '') : '';

    const nodes = [];
    let sawRunning = false;

    // The chain is strictly sequential, but completion COUNTS can't be
    // attributed to stories once any story was skipped (escalation skip) —
    // an agent's count then lags storyIndex and everything before the active
    // agent wrongly rendered as "waiting". Position outranks counting: within
    // the current story, everything before the active position is done.
    let progressPos = -1;
    if (isCurrent) {
      if (pending?.type === 'checkpoint') {
        progressPos = STORY_AGENTS.indexOf('dev-agent') + 1; // spec + dev done, gate open
      } else if (pending?.type === 'escalation') {
        progressPos = STORY_AGENTS.indexOf(pending.agent);
      } else if (STORY_AGENTS.includes(currentStep)) {
        progressPos = STORY_AGENTS.indexOf(currentStep);
      }
    }

    for (const agentId of STORY_AGENTS) {
      const doneForThisStory = (completions[agentId] ?? 0) >= i + 1;
      const beforeActive = progressPos > -1 && STORY_AGENTS.indexOf(agentId) < progressPos;
      let nodeStatus = 'todo';

      if (isCurrent && pending?.type === 'escalation' && pending.agent === agentId) {
        nodeStatus = 'failed'; // an active escalation always outranks derived completion
      } else if (storyDone || doneForThisStory || beforeActive) {
        nodeStatus = 'done';
      } else if (isCurrent && currentStep === agentId && agents[agentId]?.status === 'running' && runnerActive) {
        nodeStatus = 'running';
        sawRunning = true;
      }

      nodes.push({
        agentId,
        status: nodeStatus,
        retryCount: isCurrent ? (agents[agentId]?.retryCount ?? 0) : 0,
        optional: agentId === 'integration-agent',
      });

      // The PM checkpoint gate sits right after dev-agent.
      if (agentId === 'dev-agent') {
        const devDone = storyDone || doneForThisStory
          || (progressPos > STORY_AGENTS.indexOf('dev-agent') && pending?.type !== 'checkpoint');
        nodes.push({
          gate: true,
          status: isCurrent && pending?.type === 'checkpoint' ? 'blocked'
            : devDone ? 'done' : 'todo',
        });
      }
    }

    // Integration is conditional per story and completedSteps can't attribute its
    // runs to stories reliably — only surface the node when it's visibly active.
    const integration = nodes.find(n => n.agentId === 'integration-agent');
    if (integration && integration.status !== 'running' && integration.status !== 'failed') {
      integration.hidden = true;
    }

    steps.push({
      kind: 'story',
      index: i,
      title,
      description,
      status: storyDone ? 'done'
        : pending?.type === 'checkpoint' && isCurrent ? 'blocked'
        : pending?.type === 'escalation' && isCurrent ? 'failed'
        : isCurrent && (sawRunning || runnerActive) && status === 'executing' ? 'running'
        : isCurrent ? 'todo'
        : 'todo',
      nodes,
    });
  });

  // ── 3. MVP report step ─────────────────────────────────────
  if (stories.length > 0) {
    const reportRunning = stage === 'done' && !isComplete;
    steps.push({
      kind: 'report',
      title: 'MVP report',
      description: 'Run cost, compliance, pitch and teardown deliverables',
      status: isComplete ? 'done' : reportRunning && runnerActive ? 'running' : 'todo',
      nodes: REPORT_AGENTS.map(agentId => ({
        agentId,
        status: (completions[agentId] ?? 0) > 0 ? 'done'
          : currentStep === agentId && runnerActive ? 'running' : 'todo',
      })),
    });
  }

  const done = steps.filter(s => s.status === 'done').length;
  return { steps, progress: steps.length ? done / steps.length : 0 };
}
