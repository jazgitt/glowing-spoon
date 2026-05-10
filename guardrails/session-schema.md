# Session State Schema

Single source of truth. Never deviate.

```javascript
// store/session-schema.js
export function createSession({ tenantId, projectId }) {
  return {
    tenantId,
    projectId,
    sessionId: crypto.randomUUID(),

    // states: initializing → loading → planning → awaiting-approval
    //       → executing → checkpoint → complete | error | paused
    status: "initializing",

    agentPM: {
      conversationHistory: [],
      currentPlan: null,
      planRevisions: [],
    },

    currentStep: null,
    completedSteps: [],

    agents: {
      "spec-agent":   { status: "idle", currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      "dev-agent":    { status: "idle", currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      "review-agent": { status: "idle", currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      "qa-agent":     { status: "idle", currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
      "docs-agent":   { status: "idle", currentVersion: 0, retryCount: 0, scores: [], skillsLoaded: [] },
    },

    skillVersionSnapshot: {},   // locked at session start, never updated mid-session

    pmFeedback: [],
    attentionQueue: [],
    checkpoints: [],

    costBudget: 5.00,           // PM sets this at session start; default $5
    tokenUsage: {
      total: 0,                 // running USD cost
      perAgent: {},
      perCall: [],
    },

    feed: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceValidated: false,
  };
}
```
