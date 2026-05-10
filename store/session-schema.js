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
      'spec-agent':   { status: 'idle', currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      'dev-agent':    { status: 'idle', currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      'review-agent': { status: 'idle', currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      'qa-agent':     { status: 'idle', currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      'docs-agent':   { status: 'idle', currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
    },

    skillVersionSnapshot: {},

    pmFeedback: [],
    attentionQueue: [],
    checkpoints: [],

    costBudget,
    tokenUsage: {
      total: 0,
      perAgent: {},
      perCall: [],
    },

    feed: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceValidated: false,
  };
}
