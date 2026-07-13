import crypto from 'crypto';

export function createSession({ tenantId, projectId, costBudget = 5.00, dryRun = false }) {
  return {
    tenantId,
    projectId,
    sessionId: crypto.randomUUID(),

    // states: initializing → planning → awaiting-approval
    //       → executing → checkpoint → complete | error | paused
    status: 'initializing',

    dryRun,

    agentPM: {
      conversationHistory: [],
      currentPlan: null,
      planRevisions: [],
    },

    currentStep: null,
    completedSteps: [],

    agents: {
      'spec-agent':        { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'dev-agent':         { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'integration-agent': { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'review-agent':      { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'qa-agent':          { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'docs-agent':        { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'cost-agent':        { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'compliance-agent':  { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'pitch-agent':       { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
      'teardown-agent':    { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] },
    },

    pmFeedback: [],
    attentionQueue: [],
    checkpoints: [],

    costBudget,
    tokenUsage: {
      total: 0,
      perAgent: {},
      perCall: [],
    },

    // stage: 'plan' | 'spec' | 'checkpoint' | 'done'
    // checkpointData: set when dev-agent completes, cleared after checkpoint approved
    pipeline: {
      stories: [],
      storyIndex: 0,
      stage: 'plan',
      checkpointData: null,
    },

    // background run metadata (pid, log path)
    runtime: {
      background: false,
      pid: null,
      logFile: null,
    },

    feed: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceValidated: false,
  };
}
