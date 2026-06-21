import { runSpecAgent } from '../agents/spec-agent/index.js';
import { runDevAgent } from '../agents/dev-agent/index.js';
import { runReviewAgent } from '../agents/review-agent/index.js';
import { runQAAgent } from '../agents/qa-agent/index.js';
import { runDocsAgent } from '../agents/docs-agent/index.js';
import { promoteToCurrentVersion } from './output-store.js';
import {
  setSessionStatus, recordAgentStart, recordAgentComplete, recordAgentRetry,
  addToAttentionQueue, syncAgentPMHistory, setPipelineCursor, archiveSession, shouldStop,
} from './session.js';
import { getSession, writePending, pollResponse, drainInbox } from '../store/file-store.js';
import { config } from '../utils/config.js';
import * as out from '../utils/output.js';

// Strip filepath directives and cap length before passing output between agents.
function sanitizeAgentOutput(text, maxChars = 50_000) {
  return text
    .split('\n')
    .filter(line => !line.trimStart().startsWith('// filepath:'))
    .join('\n')
    .slice(0, maxChars);
}

function parsePlan(text) {
  try {
    return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
  } catch {
    return { stories: [], sessionGoal: text };
  }
}

function displayPlan(title, plan, text) {
  out.header(title);
  if (plan.sessionGoal) out.log('plan', plan.sessionGoal);
  if (plan.stories?.length > 0) {
    plan.stories.forEach((s, i) =>
      out.log('plan', `${i + 1}. [${s.complexity ?? '?'}] ${s.title ?? s.description}`)
    );
  } else {
    out.log('plan', text.slice(0, 500));
  }
}

async function pollApproval(session, planText) {
  await writePending(session.tenantId, session.projectId, { type: 'plan-approval', plan: planText });
  out.pending(`Approve: glowing-spoon approve --session ${session.sessionId}`);
  out.pending(`Reject:  glowing-spoon reject --session ${session.sessionId} --feedback "reason"`);
  try {
    return await pollResponse(session.tenantId, session.projectId);
  } catch (err) {
    if (err.message === 'POLL_TIMEOUT') return null;
    throw err;
  }
}

// Drain inbox and let Agent PM process any queued messages between stages.
async function processInbox(session, agentPM) {
  const messages = await drainInbox(session.tenantId, session.projectId);
  for (const { message } of messages) {
    out.divider();
    out.log('agent-pm', `Inbox: ${message.slice(0, 80)}`);
    const reply = message.startsWith('SCOPE:')
      ? await agentPM.handleScopeChange(message.slice(6).trim())
      : await agentPM.answerQuestion(message);
    await syncAgentPMHistory(session, agentPM);
    out.log('agent-pm', reply.slice(0, 400));
  }
}

async function haltSession(session) {
  out.warn('Stop flag detected — pausing at stage boundary.');
  await setSessionStatus(session, 'stopped');
  await archiveSession(session);
}

// ---------------------------------------------------------------------------
// Public entry point — handles fresh runs and resumes via pipeline cursor.
// ---------------------------------------------------------------------------

export async function runSession(session, agentPM) {
  // Restore dry-run from persisted session state (needed when spawned as child process).
  if (session.dryRun) config.dryRun = true;

  // --- Plan phase ---
  if (session.pipeline.stage === 'plan') {
    out.divider();
    out.log('agent-pm', 'Generating execution plan...');
    await setSessionStatus(session, 'planning');

    const planText = await agentPM.plan();
    await syncAgentPMHistory(session, agentPM);
    out.divider();

    let plan = parsePlan(planText);
    displayPlan('Execution Plan', plan, planText);
    out.divider();

    let response = await pollApproval(session, planText);
    if (!response) {
      out.error('No PM response within timeout. Session stopped.');
      await setSessionStatus(session, 'stopped');
      await archiveSession(session);
      return;
    }

    if (response.action === 'reject') {
      out.log('agent-pm', `PM feedback: ${response.feedback}`);
      const revisedText = await agentPM.revisePlan(response.feedback);
      await syncAgentPMHistory(session, agentPM);
      const revisedPlan = parsePlan(revisedText);
      out.divider();
      displayPlan('Revised Plan', revisedPlan, revisedText);
      out.divider();

      response = await pollApproval(session, revisedText);
      if (!response) {
        out.error('No PM response within timeout. Session stopped.');
        await setSessionStatus(session, 'stopped');
        await archiveSession(session);
        return;
      }
      if (response.action === 'reject') {
        out.error('Revised plan rejected. Update specs and re-run.');
        await setSessionStatus(session, 'stopped');
        await archiveSession(session);
        return;
      }
      plan = revisedPlan;
    }

    const stories = plan.stories?.length > 0
      ? plan.stories
      : [{ title: 'Execute all specs', description: plan.sessionGoal ?? planText.slice(0, 200) }];
    session.pipeline.stories = stories;
    await setPipelineCursor(session, 0, 'spec');
    await setSessionStatus(session, 'executing');
  }

  // --- Story execution loop ---
  const stories = session.pipeline.stories;
  if (!stories?.length) {
    out.error('No stories in pipeline — cannot execute.');
    return;
  }

  for (let i = session.pipeline.storyIndex; i < stories.length; i++) {
    const story = stories[i];
    out.divider();
    out.header(`Story ${i + 1}/${stories.length}: ${story.title ?? story.description}`);

    await processInbox(session, agentPM);

    if (await shouldStop(session)) {
      await haltSession(session);
      return;
    }

    const resumeAtCheckpoint = (i === session.pipeline.storyIndex)
      && session.pipeline.stage === 'checkpoint';

    await runStoryPipeline(session, agentPM, story, i, resumeAtCheckpoint);
  }

  // --- Done ---
  const final = await getSession(session.tenantId, session.projectId);
  out.divider();
  out.header('Session Complete');
  out.success(`All stories finished. Session: ${session.sessionId}`);
  out.log('session', `Cost: $${final?.tokenUsage?.total?.toFixed(4) ?? '0.0000'} of $${session.costBudget}`);
  out.log('session', `Output: workspaces/${session.tenantId}/${session.projectId}/output/`);
  await setSessionStatus(session, 'complete');
  await archiveSession(session);
}

// ---------------------------------------------------------------------------
// Story pipeline — runs one story through all stages.
// resumeAtCheckpoint: skip spec/dev, use persisted checkpointData directly.
// ---------------------------------------------------------------------------

async function runStoryPipeline(session, agentPM, story, storyIndex, resumeAtCheckpoint) {
  const taskDescription = story.description ?? story.title;

  if (!resumeAtCheckpoint) {
    // --- Spec ---
    await setPipelineCursor(session, storyIndex, 'spec');

    const specOutput = await runAgentWithRetry({
      agentId: 'spec-agent', session,
      agentFn: (fb) => runSpecAgent({ session, taskDescription, pmFeedback: fb }),
    });
    if (!specOutput) return;

    await processInbox(session, agentPM);
    if (await shouldStop(session)) { await haltSession(session); return; }

    // --- Dev ---
    const devInput = sanitizeAgentOutput(specOutput.outputText);
    const devOutput = await runAgentWithRetry({
      agentId: 'dev-agent', session,
      agentFn: (fb, errs) => runDevAgent({
        session,
        refinedSpec: devInput,
        taskDescription: story.title ?? taskDescription,
        pmFeedback: fb,
        syntaxErrors: errs ?? [],
      }),
      handleSyntaxErrors: true,
    });
    if (!devOutput) return;

    if (devOutput.version) {
      await promoteToCurrentVersion({
        tenantId: session.tenantId, projectId: session.projectId, version: devOutput.version,
      });
    }

    const codeInput = sanitizeAgentOutput(devOutput.outputText);
    await setPipelineCursor(session, storyIndex, 'checkpoint', {
      devInput, codeInput, version: devOutput.version,
    });

    // --- Checkpoint ---
    const approved = await runCheckpoint(session, agentPM, story, storyIndex, devInput, codeInput, devOutput.version, taskDescription);
    if (!approved) return;

    // Advance cursor BEFORE review/qa/docs — crash here = skip to next story (safe; dev output versioned).
    await setPipelineCursor(session, storyIndex + 1, 'spec', null);
    await runReviewQaDocs(session, agentPM, story, devInput, codeInput);

  } else {
    // Resume from checkpoint — checkpointData has devInput + codeInput from the dev run.
    const cp = session.pipeline.checkpointData;
    if (!cp?.devInput || !cp?.codeInput) {
      out.warn(`[resume] Missing checkpoint data for story ${storyIndex} — re-running from spec`);
      session.pipeline.stage = 'spec';
      return runStoryPipeline(session, agentPM, story, storyIndex, false);
    }

    const approved = await runCheckpoint(session, agentPM, story, storyIndex, cp.devInput, cp.codeInput, cp.version, taskDescription);
    if (!approved) return;

    await setPipelineCursor(session, storyIndex + 1, 'spec', null);
    await runReviewQaDocs(session, agentPM, story, cp.devInput, cp.codeInput);
  }
}

// Checkpoint pause: show dev output location, wait for PM approval.
// On reject: re-run dev with feedback, then recurse back to checkpoint.
async function runCheckpoint(session, agentPM, story, storyIndex, devInput, codeInput, version, taskDescription) {
  await processInbox(session, agentPM);

  out.divider();
  out.header('Dev Agent Complete — Code Ready for Review');
  out.log('checkpoint', `Story: ${story.title ?? taskDescription}`);
  if (version) {
    out.log('checkpoint', `v${version} at: workspaces/${session.tenantId}/${session.projectId}/output/versions/v${version}`);
  }
  out.pending(`Approve: glowing-spoon approve --session ${session.sessionId}`);
  out.pending(`Reject:  glowing-spoon reject --session ${session.sessionId} --feedback "what to change"`);

  await writePending(session.tenantId, session.projectId, {
    type: 'checkpoint', stage: 'dev-complete', storyIndex, version,
  });

  let response;
  try {
    response = await pollResponse(session.tenantId, session.projectId);
  } catch (err) {
    if (err.message === 'POLL_TIMEOUT') {
      out.error('No PM response within timeout. Session stopped at checkpoint.');
      await setSessionStatus(session, 'stopped');
      await archiveSession(session);
      return false;
    }
    throw err;
  }

  if (response.action === 'reject') {
    out.log('checkpoint', `PM feedback: ${response.feedback}`);
    const reDevOutput = await runAgentWithRetry({
      agentId: 'dev-agent', session,
      agentFn: (fb, errs) => runDevAgent({
        session, refinedSpec: devInput,
        taskDescription: story.title ?? taskDescription,
        pmFeedback: [response.feedback, ...(fb ?? [])],
        syntaxErrors: errs ?? [],
      }),
      handleSyntaxErrors: true,
    });
    if (!reDevOutput) return false;
    if (reDevOutput.version) {
      await promoteToCurrentVersion({
        tenantId: session.tenantId, projectId: session.projectId, version: reDevOutput.version,
      });
    }
    const newCodeInput = sanitizeAgentOutput(reDevOutput.outputText);
    await setPipelineCursor(session, storyIndex, 'checkpoint', {
      devInput, codeInput: newCodeInput, version: reDevOutput.version,
    });
    // Re-prompt after revised dev output.
    return runCheckpoint(session, agentPM, story, storyIndex, devInput, newCodeInput, reDevOutput.version, taskDescription);
  }

  return true;
}

async function runReviewQaDocs(session, agentPM, story, devInput, codeInput) {
  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  await runAgentWithRetry({
    agentId: 'review-agent', session,
    agentFn: (fb) => runReviewAgent({ session, code: codeInput, spec: devInput, pmFeedback: fb }),
  });

  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  const qaOutput = await runAgentWithRetry({
    agentId: 'qa-agent', session,
    agentFn: (fb) => runQAAgent({ session, spec: devInput, code: codeInput, pmFeedback: fb }),
  });

  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  await runAgentWithRetry({
    agentId: 'docs-agent', session,
    agentFn: (fb) => runDocsAgent({
      session, spec: devInput, code: codeInput,
      tests: qaOutput?.outputText ?? '', pmFeedback: fb,
    }),
  });
}

// ---------------------------------------------------------------------------
// Agent retry wrapper — quality gate + syntax error retry logic.
// ---------------------------------------------------------------------------

async function runAgentWithRetry({ agentId, session, agentFn, handleSyntaxErrors = false }) {
  let feedback = [];
  let syntaxErrors = [];

  for (let attempt = 0; attempt <= 2; attempt++) {
    await recordAgentStart(session, agentId);
    const result = await agentFn(feedback, syntaxErrors);

    if (handleSyntaxErrors && result.syntaxErrors?.length > 0) {
      if (attempt < 2) {
        syntaxErrors = result.syntaxErrors;
        feedback = result.syntaxErrors.map(e => `Syntax error in ${e.file} line ${e.line}: ${e.error}`);
        await recordAgentRetry(session, agentId, 'syntax errors');
        continue;
      }
      out.error(`[${agentId}] Syntax errors persist after 2 retries — escalating`);
      await addToAttentionQueue(session, {
        type: 'agent:escalated', attention: 'BLOCKING',
        agent: agentId, failureType: 'SYNTAX_ERROR', issues: result.syntaxErrors,
      });
      return null;
    }

    const { gateResult, version } = result;

    if (!gateResult || gateResult.action === 'pass') {
      await recordAgentComplete(session, agentId, version, gateResult?.scores);
      return result;
    }

    if (gateResult.action === 'retry' && attempt < 2) {
      feedback = [...(gateResult.feedback ?? []), ...(gateResult.suggestions ?? [])];
      await recordAgentRetry(session, agentId, gateResult.feedback?.join('; ') ?? 'quality gate fail');
      continue;
    }

    out.blocked(`[${agentId}] Quality gate failed permanently — escalating to PM`);
    await addToAttentionQueue(session, {
      type: 'quality:failed', attention: 'BLOCKING',
      agent: agentId, scores: gateResult.scores, issues: gateResult.issues,
    });
    return null;
  }

  return null;
}
