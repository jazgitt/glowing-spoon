import { runSpecAgent } from '../agents/spec-agent/index.js';
import { runDevAgent } from '../agents/dev-agent/index.js';
import { runIntegrationAgent, needsIntegration } from '../agents/integration-agent/index.js';
import { runReviewAgent } from '../agents/review-agent/index.js';
import { runQAAgent } from '../agents/qa-agent/index.js';
import { runDocsAgent } from '../agents/docs-agent/index.js';
import { runCostAgent } from '../agents/cost-agent/index.js';
import { runComplianceAgent } from '../agents/compliance-agent/index.js';
import { runPitchAgent } from '../agents/pitch-agent/index.js';
import { runTeardownAgent } from '../agents/teardown-agent/index.js';
import { runAssemblerAgent } from '../agents/assembler-agent/index.js';
import { readOutputDigest, saveAgentOutput, appendStoryHandoff } from './output-store.js';
import { getModelStats, getPoolHealth } from '../utils/claude.js';
import { checkReadiness, printReadiness } from './readiness.js';
import {
  setSessionStatus, recordAgentStart, recordAgentComplete, recordAgentRetry,
  addToAttentionQueue, syncAgentPMHistory, setPipelineCursor, archiveSession, shouldStop,
  recordStoryOutcome, updateSession,
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

// Cap per-file content for the checkpoint approval payload — full files are
// already on disk under output/ (link there for the uncapped version).
function previewFiles(files, cap = 4_000) {
  return (files ?? []).map(f => ({
    relativePath: f.relativePath,
    content: f.content.slice(0, cap),
    truncated: f.content.length > cap,
  }));
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
    if (err.message === 'INVALID_PM_RESPONSE') {
      out.error('Malformed response file — not treating as approval.');
      return null;
    }
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
// Model pool health gate — checked at stage boundaries. When the round-robin has
// collapsed onto a single last-resort model, continuing means the entire product
// gets built by that model (bp-tracker-99: 112/112 calls answered by one free
// model while five others 429'd/404'd). That is a PM decision, not a default.
// Returns true to continue, false when the session was stopped.
// ---------------------------------------------------------------------------

async function assertPoolHealthy(session) {
  if (session.dryRun || session.poolDegradedAccepted) return true;
  const health = getPoolHealth();
  if (!health.degraded) return true;

  out.divider();
  out.blocked(`Model pool degraded — ${health.soleSurvivor ?? health.liveModels[0] ?? 'a single model'} ` +
    `is the only model answering (${health.liveModels.length}/${health.poolSize} live` +
    (health.prunedModels.length ? `; pruned as nonexistent: ${health.prunedModels.join(', ')}` : '') + ').');
  out.log('session', 'Continuing builds the whole product on the pool\'s last resort — output quality will match that model, not your intended pool.');

  await addToAttentionQueue(session, {
    type: 'model-pool:degraded', attention: 'BLOCKING',
    agent: 'models', failureType: 'MODEL_POOL_DEGRADED', health,
  });
  await writePending(session.tenantId, session.projectId, {
    type: 'escalation', agent: 'models', failureType: 'MODEL_POOL_DEGRADED', issues: [health],
  });
  out.pending(`Continue on degraded pool: glowing-spoon approve --session ${session.sessionId}`);
  out.pending(`Stop and fix MODEL_POOL:  glowing-spoon reject  --session ${session.sessionId} --feedback "stopping to fix pool"`);

  let response = null;
  try {
    response = await pollResponse(session.tenantId, session.projectId);
  } catch (err) {
    if (err.message !== 'POLL_TIMEOUT' && err.message !== 'INVALID_PM_RESPONSE') throw err;
  }

  if (response?.action === 'approve') {
    session.poolDegradedAccepted = true;
    await updateSession(session);
    out.warn('PM accepted the degraded pool — continuing. Expect output quality to match the surviving model.');
    return true;
  }

  out.error('Session stopped on degraded model pool. Fix MODEL_POOL in .env (remove dead ids, add a reliable model), then: ' +
    `glowing-spoon resume --session ${session.sessionId}`);
  await setSessionStatus(session, 'stopped');
  await archiveSession(session);
  return false;
}

// ---------------------------------------------------------------------------
// Public entry point — handles fresh runs and resumes via pipeline cursor.
// ---------------------------------------------------------------------------

// Any unhandled throw (provider 403s, COST_BUDGET_EXCEEDED, network) must leave
// the session in a resumable 'stopped' state — never stranded at 'executing'.
export async function runSession(session, agentPM) {
  try {
    await runSessionInner(session, agentPM);
  } catch (err) {
    out.error(`Session halted: ${err.message}`);
    out.log('session', `Progress saved at story ${session.pipeline.storyIndex + 1}, stage: ${session.pipeline.stage}.`);
    out.pending(`Fix the cause, then: glowing-spoon resume --session ${session.sessionId}`);
    await setSessionStatus(session, 'stopped');
    await archiveSession(session);
    process.exitCode = 1;
  }
}

async function runSessionInner(session, agentPM) {
  // Restore dry-run from persisted session state (needed when spawned as child process).
  if (session.dryRun) config.dryRun = true;

  // --- Assemble-only mode: skip plan/story/report, just build the prototype ---
  if (session.mode === 'assemble-only') {
    await setSessionStatus(session, 'executing');
    const assembly = await runAssembler(session);
    out.divider();
    if (assembly === 'verified') {
      out.success('Assembly session complete — prototype installed and typechecked.');
      session.outcome = 'clean';
    } else {
      out.warn(`Assembly session finished WITHOUT a runnable prototype (${assembly}).`);
      session.outcome = 'issues';
      process.exitCode = 1;
    }
    await setSessionStatus(session, 'complete');
    await archiveSession(session);
    return;
  }

  // --- Plan phase ---
  if (session.pipeline.stage === 'plan') {
    // Specs stage, step 0 — mandatory inputs check. initSession already enforced
    // this, but files can change between init and resume, and the checklist must
    // be a visible step of every session, not a hidden precondition.
    out.divider();
    out.header('Specs Stage — Mandatory Inputs Check');
    const readiness = await checkReadiness(session.tenantId, session.projectId);
    const failing = printReadiness(readiness.items);
    if (failing.length > 0 && !session.dryRun) {
      out.blocked(`${failing.length} mandatory input(s) missing — session cannot proceed to planning.`);
      out.pending(`Fill them in (or draft from PRODUCT.md: glowing-spoon workspace prepare --project ${session.projectId}), then: glowing-spoon resume --session ${session.sessionId}`);
      await setSessionStatus(session, 'stopped');
      await archiveSession(session);
      return;
    }

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

    // Default-deny: only an explicit approve starts execution.
    if (response.action !== 'approve') {
      out.error(`Unrecognized PM response — session stopped without executing.`);
      await setSessionStatus(session, 'stopped');
      await archiveSession(session);
      return;
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

    // A degraded model pool is a blocking PM decision, not something to ride out.
    if (!(await assertPoolHealthy(session))) return;

    const resumeAtCheckpoint = (i === session.pipeline.storyIndex)
      && session.pipeline.stage === 'checkpoint';

    await runStoryPipeline(session, agentPM, story, i, resumeAtCheckpoint);

    // A timeout inside the story (checkpoint or escalation) marks the session
    // stopped — do not keep burning budget on the remaining stories.
    if (session.status === 'stopped') return;

    // Catch-all: any story that finished the pipeline without an explicit
    // outcome was skipped somewhere (escalation skip, checkpoint abort).
    session.pipeline.storyOutcomes ??= [];
    if (!session.pipeline.storyOutcomes[i]) {
      await recordStoryOutcome(session, i, story, 'skipped',
        'story did not complete — an agent escalated and the PM skipped it');
    }
  }

  // --- MVP Report phase ---
  if (await shouldStop(session)) { await haltSession(session); return; }
  if (!(await assertPoolHealthy(session))) return;
  await runMvpReport(session);

  // --- Assemble phase: make the output runnable ---
  if (await shouldStop(session)) { await haltSession(session); return; }
  if (!(await assertPoolHealthy(session))) return;
  await runAssembler(session);

  // --- Done — report honestly: skipped stories and a failed assembly are not
  // success, and must never be summarized as if they were. ---
  const final = await getSession(session.tenantId, session.projectId);
  const outcomes = session.pipeline.storyOutcomes ?? [];
  const skipped = outcomes.filter(o => o?.status === 'skipped');
  const completed = outcomes.filter(o => o?.status === 'completed');
  const assemblyOk = session.assembly === 'verified';

  out.divider();
  if (skipped.length === 0 && assemblyOk) {
    out.header('Session Complete');
    out.success(`All ${stories.length} stories finished; prototype installed and typechecked. Session: ${session.sessionId}`);
    session.outcome = 'clean';
  } else {
    out.header('Session Finished — WITH ISSUES');
    out.warn(`${completed.length}/${stories.length} stories completed.`);
    for (const s of skipped) {
      out.warn(`Skipped: "${s.title}" — ${s.reason}`);
    }
    if (!assemblyOk) {
      out.warn(`Prototype NOT verified (assembly: ${session.assembly ?? 'did not run'}) — it will likely not start. ` +
        'Fix the cause, then re-assemble (web UI "Assemble" or glowing-spoon assemble).');
    }
    session.outcome = 'issues';
    process.exitCode = 1;
  }
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
    if (!specOutput) {
      if (session.status !== 'stopped') {
        await recordStoryOutcome(session, storyIndex, story, 'skipped', 'spec-agent failed and the PM skipped the story');
      }
      return;
    }

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
    if (!devOutput) {
      if (session.status !== 'stopped') {
        await recordStoryOutcome(session, storyIndex, story, 'skipped', 'dev-agent failed (persistent syntax errors or quality gate) and the PM skipped the story');
      }
      return;
    }

    const codeInput = sanitizeAgentOutput(devOutput.outputText);
    await setPipelineCursor(session, storyIndex, 'checkpoint', { devInput, codeInput, files: devOutput.files });

    // --- Checkpoint ---
    const approved = await runCheckpoint(session, agentPM, story, storyIndex, devInput, codeInput, taskDescription, devOutput.files);
    if (!approved) return;

    // Story-to-story handoff: record what this story built so the next story's
    // dev-agent extends it instead of reinventing it.
    await appendStoryHandoff({
      tenantId: session.tenantId, projectId: session.projectId,
      story, files: session.pipeline.checkpointData?.files ?? devOutput.files,
    });

    // Advance cursor BEFORE review/qa/docs — crash here = skip to next story (safe).
    await setPipelineCursor(session, storyIndex + 1, 'spec', null);
    await runReviewQaDocs(session, agentPM, story, devInput, codeInput);
    await recordStoryOutcome(session, storyIndex, story, 'completed');

  } else {
    // Resume from checkpoint — checkpointData has devInput + codeInput from the dev run.
    const cp = session.pipeline.checkpointData;
    if (!cp?.devInput || !cp?.codeInput) {
      out.warn(`[resume] Missing checkpoint data for story ${storyIndex} — re-running from spec`);
      session.pipeline.stage = 'spec';
      return runStoryPipeline(session, agentPM, story, storyIndex, false);
    }

    const approved = await runCheckpoint(session, agentPM, story, storyIndex, cp.devInput, cp.codeInput, taskDescription, cp.files);
    if (!approved) return;

    await appendStoryHandoff({
      tenantId: session.tenantId, projectId: session.projectId,
      story, files: session.pipeline.checkpointData?.files ?? cp.files,
    });

    await setPipelineCursor(session, storyIndex + 1, 'spec', null);
    await runReviewQaDocs(session, agentPM, story, cp.devInput, cp.codeInput);
    await recordStoryOutcome(session, storyIndex, story, 'completed');
  }
}

// ---------------------------------------------------------------------------
// MVP Report phase — SME deliverables generated once, after all stories:
// run-cost estimate, compliance checklist, pitch materials, build teardown.
// Report agents are informational: fast model, no quality gate.
// ---------------------------------------------------------------------------

async function runMvpReport(session) {
  out.divider();
  out.header('MVP Report — run-cost, compliance, pitch, teardown');

  const digest = await readOutputDigest({ tenantId: session.tenantId, projectId: session.projectId });
  if (!digest) {
    out.warn('No output found to report on — skipping MVP report.');
    return;
  }

  await runAgentWithRetry({
    agentId: 'cost-agent', session,
    agentFn: (fb) => runCostAgent({ session, digest, pmFeedback: fb }),
  });

  await runAgentWithRetry({
    agentId: 'compliance-agent', session,
    agentFn: (fb) => runComplianceAgent({ session, digest, pmFeedback: fb }),
  });

  await runAgentWithRetry({
    agentId: 'pitch-agent', session,
    agentFn: (fb) => runPitchAgent({ session, digest, pmFeedback: fb }),
  });

  const current = await getSession(session.tenantId, session.projectId);
  const sessionCost = (current?.tokenUsage?.total ?? session.tokenUsage?.total ?? 0).toFixed(4);
  await runAgentWithRetry({
    agentId: 'teardown-agent', session,
    agentFn: (fb) => runTeardownAgent({ session, digest, sessionCost, pmFeedback: fb }),
  });

  await writeModelPerformanceReport(session);

  out.log('session', 'MVP report written to output/report/');
}

// Model performance — pure bookkeeping from this process's call scoreboard,
// written directly (no LLM involved: it would only be summarizing its own logs).
async function writeModelPerformanceReport(session) {
  const stats = getModelStats();
  const lines = [
    '# Model Performance',
    '',
    `Session \`${session.sessionId}\` — every model the round-robin touched, what it answered, and what it refused.`,
    '',
  ];

  if (stats.length === 0) {
    lines.push(session.dryRun
      ? '_Dry run — no external model calls were made._'
      : '_No model calls were recorded this session._');
  } else {
    lines.push('| Model | Answered | Failed | Failure reasons | Tokens in | Tokens out | Used by |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const s of stats) {
      const reasons = Object.entries(s.errors)
        .map(([status, n]) => `${status}×${n}`)
        .join(', ') || '—';
      lines.push(`| \`${s.model}\` | ${s.ok} | ${s.failed} | ${reasons} | ${s.inputTokens.toLocaleString()} | ${s.outputTokens.toLocaleString()} | ${s.agents.join(', ')} |`);
    }
    const totalOk = stats.reduce((n, s) => n + s.ok, 0);
    const totalFailed = stats.reduce((n, s) => n + s.failed, 0);
    lines.push('');
    lines.push(`**${totalOk}** calls answered, **${totalFailed}** attempts failed across **${stats.length}** model(s).`);
    lines.push('');
    lines.push('Failure reasons are HTTP statuses from OpenRouter: 429 rate limit, 5xx provider errors, 402 out of credits, `network` = connection error. Failed attempts rotate to the next model in the pool — a failure here does not mean lost work.');
  }

  try {
    await saveAgentOutput({
      tenantId: session.tenantId,
      projectId: session.projectId,
      files: [{ relativePath: 'report/model-performance.md', content: lines.join('\n') + '\n' }],
    });
    out.log('session', 'Model performance report written to output/report/model-performance.md');
  } catch (err) {
    out.warn(`Could not write model performance report: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Assemble phase — assembler-agent turns output/src into a runnable app in
// prototype/. Build failures (npm install / tsc) ride the same syntaxErrors
// retry loop as dev-agent; after 2 failed retries it escalates to the PM, and
// "skip" completes the session without a prototype — assembly never bricks it.
// ---------------------------------------------------------------------------

async function runAssembler(session) {
  out.divider();
  out.header('Assembler — building runnable prototype');

  const result = await runAgentWithRetry({
    agentId: 'assembler-agent', session,
    agentFn: (fb, errs) => runAssemblerAgent({
      session, pmFeedback: fb, syntaxErrors: errs ?? [],
    }),
    handleSyntaxErrors: true,
  });

  // 'verified' = glue produced and (outside dry-run) npm install + tsc passed.
  // 'empty' = nothing to assemble. 'failed' = retries exhausted / PM skipped.
  session.assembly = result === null ? 'failed'
    : (result.files?.length ?? 0) > 0 ? 'verified' : 'empty';
  await updateSession(session);

  if (session.assembly === 'verified') {
    out.log('session', `Prototype at: workspaces/${session.tenantId}/${session.projectId}/prototype/`);
  } else {
    out.warn(`Assembly ${session.assembly} — prototype/ is not in a runnable state.`);
  }
  return session.assembly;
}

// Checkpoint pause: wait for PM approval before running review/qa/docs.
// On reject: re-run dev with feedback, then recurse back to checkpoint.
async function runCheckpoint(session, agentPM, story, storyIndex, devInput, codeInput, taskDescription, files) {
  await processInbox(session, agentPM);

  out.divider();
  out.header('Dev Agent Complete — Code Ready for Review');
  out.log('checkpoint', `Story: ${story.title ?? taskDescription}`);
  out.log('checkpoint', `Output at: workspaces/${session.tenantId}/${session.projectId}/output/`);
  out.pending(`Approve: glowing-spoon approve --session ${session.sessionId}`);
  out.pending(`Reject:  glowing-spoon reject --session ${session.sessionId} --feedback "what to change"`);

  await writePending(session.tenantId, session.projectId, {
    type: 'checkpoint', stage: 'dev-complete', storyIndex,
    files: previewFiles(files),
  });

  let response;
  try {
    response = await pollResponse(session.tenantId, session.projectId);
  } catch (err) {
    if (err.message === 'POLL_TIMEOUT' || err.message === 'INVALID_PM_RESPONSE') {
      out.error(err.message === 'POLL_TIMEOUT'
        ? 'No PM response within timeout. Session stopped at checkpoint.'
        : 'Malformed response file — not treating as approval. Session stopped at checkpoint.');
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
    const newCodeInput = sanitizeAgentOutput(reDevOutput.outputText);
    await setPipelineCursor(session, storyIndex, 'checkpoint', { devInput, codeInput: newCodeInput, files: reDevOutput.files });
    return runCheckpoint(session, agentPM, story, storyIndex, devInput, newCodeInput, taskDescription, reDevOutput.files);
  }

  // Default-deny: only an explicit approve unlocks review/qa/docs.
  if (response.action !== 'approve') {
    out.error('Unrecognized PM response — session stopped at checkpoint.');
    await setSessionStatus(session, 'stopped');
    await archiveSession(session);
    return false;
  }

  return true;
}

async function runReviewQaDocs(session, agentPM, story, devInput, codeInput) {
  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  // --- Integration (conditional: only when the spec signals third-party services) ---
  let fullCode = codeInput;
  if (needsIntegration(devInput)) {
    const integrationOutput = await runAgentWithRetry({
      agentId: 'integration-agent', session,
      agentFn: (fb, errs) => runIntegrationAgent({
        session, spec: devInput, code: codeInput,
        taskDescription: story.title ?? 'Scaffold third-party integrations',
        pmFeedback: fb, syntaxErrors: errs ?? [],
      }),
      handleSyntaxErrors: true,
    });
    if (integrationOutput) {
      // Review/QA/docs cover the integration code alongside the dev output.
      fullCode = sanitizeAgentOutput(`${codeInput}\n\n${integrationOutput.outputText}`);
    }
  }

  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  await runAgentWithRetry({
    agentId: 'review-agent', session,
    agentFn: (fb) => runReviewAgent({ session, code: fullCode, spec: devInput, pmFeedback: fb }),
  });

  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  const qaOutput = await runAgentWithRetry({
    agentId: 'qa-agent', session,
    agentFn: (fb) => runQAAgent({ session, spec: devInput, code: fullCode, pmFeedback: fb }),
  });

  await processInbox(session, agentPM);
  if (await shouldStop(session)) { await haltSession(session); return; }

  await runAgentWithRetry({
    agentId: 'docs-agent', session,
    agentFn: (fb) => runDocsAgent({
      session, spec: devInput, code: fullCode,
      tests: qaOutput?.outputText ?? '', pmFeedback: fb,
    }),
  });
}

// ---------------------------------------------------------------------------
// Agent retry wrapper — quality gate + syntax error retry logic.
// ---------------------------------------------------------------------------

// Escalation blocks for PM action (principle 8): approve = skip this story,
// reject --feedback = give the agent direction and a fresh set of retries.
// Returns the PM response, or null on timeout (session marked stopped).
async function escalateAndWait(session, { agentId, failureType, issues }) {
  await addToAttentionQueue(session, {
    type: 'agent:escalated', attention: 'BLOCKING',
    agent: agentId, failureType, issues,
  });
  await writePending(session.tenantId, session.projectId, {
    type: 'escalation', agent: agentId, failureType, issues,
  });
  out.pending(`Skip story:  glowing-spoon approve --session ${session.sessionId}`);
  out.pending(`Give fix:    glowing-spoon reject  --session ${session.sessionId} --feedback "direction for ${agentId}"`);

  try {
    return await pollResponse(session.tenantId, session.projectId);
  } catch (err) {
    if (err.message === 'POLL_TIMEOUT' || err.message === 'INVALID_PM_RESPONSE') {
      out.error(err.message === 'POLL_TIMEOUT'
        ? 'No PM response to escalation within timeout. Session stopped.'
        : 'Malformed response file — session stopped.');
      await setSessionStatus(session, 'stopped');
      await archiveSession(session);
      return null;
    }
    throw err;
  }
}

async function runAgentWithRetry({ agentId, session, agentFn, handleSyntaxErrors = false }) {
  // Sessions persisted before an agent existed lack its registry entry — backfill.
  session.agents[agentId] ??= { status: 'idle', retryCount: 0, scores: [], skillsLoaded: [] };

  let feedback = [];
  let syntaxErrors = [];
  let attempt = 0;

  // Applies the PM's escalation decision. Returns true to restart attempts with
  // the PM's feedback, false to skip the story (timeout or explicit approve).
  async function pmDecidesRetry(failureType, issues) {
    const response = await escalateAndWait(session, { agentId, failureType, issues });
    if (response?.action === 'reject' && response.feedback) {
      out.log(agentId, `PM direction: ${response.feedback}`);
      feedback = [response.feedback];
      syntaxErrors = [];
      attempt = 0;
      session.agents[agentId].retryCount = 0; // quality gate keys retries off this
      return true;
    }
    if (response?.action === 'approve') out.warn(`[${agentId}] PM chose to skip this story.`);
    return false;
  }

  while (attempt <= 2) {
    await recordAgentStart(session, agentId);
    const result = await agentFn(feedback, syntaxErrors);

    if (handleSyntaxErrors && result.syntaxErrors?.length > 0) {
      if (attempt < 2) {
        syntaxErrors = result.syntaxErrors;
        feedback = result.syntaxErrors.map(e => `Syntax error in ${e.file} line ${e.line}: ${e.error}`);
        await recordAgentRetry(session, agentId, 'syntax errors');
        attempt++;
        continue;
      }
      out.error(`[${agentId}] Syntax errors persist after 2 retries — escalating`);
      if (await pmDecidesRetry('SYNTAX_ERROR', result.syntaxErrors)) continue;
      return null;
    }

    const { gateResult } = result;

    if (!gateResult || gateResult.action === 'pass') {
      await recordAgentComplete(session, agentId, gateResult?.scores);
      return result;
    }

    if (gateResult.action === 'retry' && attempt < 2) {
      feedback = [...(gateResult.feedback ?? []), ...(gateResult.suggestions ?? [])];
      await recordAgentRetry(session, agentId, gateResult.feedback?.join('; ') ?? 'quality gate fail');
      attempt++;
      continue;
    }

    out.blocked(`[${agentId}] Quality gate failed permanently — escalating to PM`);
    if (await pmDecidesRetry('QUALITY_GATE_PERMANENT', gateResult.issues)) continue;
    return null;
  }

  return null;
}
