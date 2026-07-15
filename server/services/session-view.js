// Shared view shape for a session sent to the browser — strips unbounded fields
// (agentPM.conversationHistory grows across the whole session) and caps perCall.
import { isSessionRunning, isRunnerDead } from './spawner.js';

export function publicSession(session, pending) {
  const { agentPM, productSummary, ...rest } = session;
  return {
    ...rest,
    tokenUsage: {
      ...session.tokenUsage,
      perCall: (session.tokenUsage?.perCall ?? []).slice(-25),
    },
    running: isSessionRunning(session),
    runnerDead: isRunnerDead(session),
    pending: pending ?? null,
  };
}
