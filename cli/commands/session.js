import { initSession } from '../../engine/session.js';
import { AgentPM } from '../../engine/agent-pm.js';
import { runSpecAgent } from '../../agents/spec-agent/index.js';
import { runDevAgent } from '../../agents/dev-agent/index.js';
import { runReviewAgent } from '../../agents/review-agent/index.js';
import { runQAAgent } from '../../agents/qa-agent/index.js';
import { runDocsAgent } from '../../agents/docs-agent/index.js';
import { promoteToCurrentVersion } from '../../engine/output-store.js';
import {
  updateSession, setSessionStatus,
  recordAgentStart, recordAgentComplete, recordAgentRetry,
  addToAttentionQueue, syncAgentPMHistory,
} from '../../engine/session.js';
import { writePending, pollResponse } from '../../store/file-store.js';
import { config } from '../../utils/config.js';
import * as out from '../../utils/output.js';

const TENANT_ID = 'local';

export function registerSessionCommands(program) {
  program
    .command('run')
    .description('Start a new session for a project')
    .requiredOption('--project <id>', 'Project ID')
    .option('--budget <dollars>', 'Cost budget in USD', '5.00')
    .option('--dry-run', 'Dry run — no real Claude calls', false)
    .action(async (opts) => {
      if (opts.dryRun) config.dryRun = true;

      const session = await initSession({
        tenantId: TENANT_ID,
        projectId: opts.project,
        costBudget: parseFloat(opts.budget),
        dryRun: opts.dryRun,
      });

      out.header(`Session ${session.sessionId}`);
      out.log('session', `Project: ${opts.project} | Budget: $${opts.budget}${opts.dryRun ? ' | DRY RUN' : ''}`);

      const agentPM = new AgentPM(session);

      // Phase 1: Plan
      out.divider();
      out.log('agent-pm', 'Generating execution plan...');
      await setSessionStatus(session, 'planning');

      const planText = await agentPM.plan();
      await syncAgentPMHistory(session, agentPM);

      let plan;
      try {
        plan = JSON.parse(planText.match(/\{[\s\S]*\}/)?.[0] ?? planText);
      } catch {
        plan = { stories: [], sessionGoal: planText };
      }

      out.divider();
      out.header('Execution Plan');
      if (plan.sessionGoal) out.log('plan', plan.sessionGoal);
      if (plan.stories?.length > 0) {
        plan.stories.forEach((s, i) => out.log('plan', `${i + 1}. [${s.complexity || '?'}] ${s.title || s.description}`));
      } else {
        out.log('plan', planText.slice(0, 500));
      }

      out.divider();
      out.pending('Waiting for PM approval. Run: glowing-spoon approve --session ' + session.sessionId);
      out.pending('Or to reject: glowing-spoon reject --session ' + session.sessionId + ' --feedback "your feedback"');

      await writePending(session.tenantId, session.projectId, {
        type: 'plan-approval',
        plan: planText,
      });

      const pmResponse = await pollResponse(session.tenantId, session.projectId);

      if (pmResponse.action === 'reject') {
        out.log('agent-pm', `PM feedback: ${pmResponse.feedback}`);
        const revisedPlanText = await agentPM.revisePlan(pmResponse.feedback);
        await syncAgentPMHistory(session, agentPM);
        out.log('agent-pm', 'Plan revised. Starting execution...');
      }

      // Phase 2: Execute pipeline
      await setSessionStatus(session, 'executing');
      await runPipeline(session, agentPM, plan);

      // Final checkpoint
      out.divider();
      out.header('Session Complete');
      out.success(`All agents finished. Session ID: ${session.sessionId}`);
      out.log('session', `Output at: workspaces/${TENANT_ID}/${opts.project}/output/`);
    });
}

async function runPipeline(session, agentPM, plan) {
  const stories = plan.stories ?? [{ title: 'Execute all specs', description: plan.sessionGoal || 'Run pipeline' }];

  for (const story of stories) {
    out.divider();
    out.header(`Story: ${story.title || story.description}`);

    await runStoryPipeline(session, agentPM, story.description || story.title, story.title);
  }
}

async function runStoryPipeline(session, agentPM, taskDescription, storyTitle) {
  // --- Spec Agent ---
  let specOutput = await runAgentWithRetry({
    agentId: 'spec-agent',
    session,
    agentFn: (fb) => runSpecAgent({ session, taskDescription, pmFeedback: fb }),
    spec: taskDescription,
  });

  if (!specOutput) return;

  // --- Dev Agent ---
  const devInput = specOutput.outputText;

  let devOutput = await runAgentWithRetry({
    agentId: 'dev-agent',
    session,
    agentFn: (fb, syntaxErrors) => runDevAgent({
      session,
      refinedSpec: devInput,
      taskDescription: storyTitle || taskDescription,
      pmFeedback: fb,
      syntaxErrors: syntaxErrors || [],
    }),
    spec: devInput,
    handleSyntaxErrors: true,
  });

  if (!devOutput) return;

  // Promote dev output to current
  if (devOutput.version) {
    await promoteToCurrentVersion({ tenantId: session.tenantId, projectId: session.projectId, version: devOutput.version });
  }

  // --- Review Agent ---
  await runAgentWithRetry({
    agentId: 'review-agent',
    session,
    agentFn: (fb) => runReviewAgent({ session, code: devOutput.outputText, spec: devInput, pmFeedback: fb }),
    spec: devInput,
  });

  // --- QA Agent ---
  let qaOutput = await runAgentWithRetry({
    agentId: 'qa-agent',
    session,
    agentFn: (fb) => runQAAgent({ session, spec: devInput, code: devOutput.outputText, pmFeedback: fb }),
    spec: devInput,
  });

  // --- Docs Agent ---
  await runAgentWithRetry({
    agentId: 'docs-agent',
    session,
    agentFn: (fb) => runDocsAgent({
      session,
      spec: devInput,
      code: devOutput.outputText,
      tests: qaOutput?.outputText ?? '',
      pmFeedback: fb,
    }),
    spec: devInput,
  });
}

async function runAgentWithRetry({ agentId, session, agentFn, spec, handleSyntaxErrors = false }) {
  let feedback = [];
  let syntaxErrors = [];

  for (let attempt = 0; attempt <= 2; attempt++) {
    await recordAgentStart(session, agentId);
    const result = await agentFn(feedback, syntaxErrors);

    // Handle syntax errors from dev-agent before quality gate
    if (handleSyntaxErrors && result.syntaxErrors?.length > 0) {
      if (attempt < 2) {
        syntaxErrors = result.syntaxErrors;
        feedback = result.syntaxErrors.map(e => `Syntax error in ${e.file} line ${e.line}: ${e.error}`);
        await recordAgentRetry(session, agentId, 'syntax errors');
        continue;
      } else {
        out.error(`[${agentId}] Syntax errors persist after 2 retries — escalating`);
        await addToAttentionQueue(session, {
          type: 'agent:escalated',
          attention: 'BLOCKING',
          agent: agentId,
          failureType: 'SYNTAX_ERROR',
          issues: result.syntaxErrors,
        });
        return null;
      }
    }

    const { gateResult, version } = result;

    if (!gateResult || gateResult.action === 'pass') {
      await recordAgentComplete(session, agentId, version, gateResult?.scores);
      return result;
    }

    if (gateResult.action === 'retry' && attempt < 2) {
      feedback = [...(gateResult.feedback || []), ...(gateResult.suggestions || [])];
      await recordAgentRetry(session, agentId, gateResult.feedback?.join('; ') || 'quality gate fail');
      continue;
    }

    // Escalate
    out.blocked(`[${agentId}] Quality gate failed permanently — escalating to PM`);
    await addToAttentionQueue(session, {
      type: 'quality:failed',
      attention: 'BLOCKING',
      agent: agentId,
      scores: gateResult.scores,
      issues: gateResult.issues,
    });
    return null;
  }

  return null;
}
