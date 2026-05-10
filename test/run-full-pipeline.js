/**
 * Test: run the full agent pipeline for a project
 * Usage: node test/run-full-pipeline.js --tenant local --project my-product
 * Add --dry-run to skip real Claude calls (verifies wiring only)
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { config } from '../utils/config.js';
import { initSession } from '../engine/session.js';
import { AgentPM } from '../engine/agent-pm.js';
import { runSpecAgent } from '../agents/spec-agent/index.js';
import { runDevAgent } from '../agents/dev-agent/index.js';
import { runReviewAgent } from '../agents/review-agent/index.js';
import { runQAAgent } from '../agents/qa-agent/index.js';
import { runDocsAgent } from '../agents/docs-agent/index.js';
import { promoteToCurrentVersion } from '../engine/output-store.js';
import * as out from '../utils/output.js';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string', default: 'local' },
    project: { type: 'string', default: 'my-product' },
    'dry-run': { type: 'boolean', default: false },
    budget: { type: 'string', default: '5.00' },
  },
});

if (values['dry-run']) config.dryRun = true;

out.header('Full Pipeline Test');
out.log('test', `Tenant: ${values.tenant} | Project: ${values.project} | Budget: $${values.budget}`);
if (values['dry-run']) out.warn('DRY RUN — no real Claude calls');

try {
  const session = await initSession({
    tenantId: values.tenant,
    projectId: values.project,
    costBudget: parseFloat(values.budget),
    dryRun: values['dry-run'],
  });

  out.success(`Session: ${session.sessionId}`);

  // Agent PM plans
  out.divider();
  const agentPM = new AgentPM(session);
  out.log('agent-pm', 'Planning...');
  const planText = await agentPM.plan();

  let plan;
  try {
    plan = JSON.parse(planText.match(/\{[\s\S]*\}/)?.[0] ?? planText);
  } catch {
    plan = { stories: [{ title: 'test-story', description: 'Run test pipeline' }] };
  }

  const stories = plan.stories ?? [{ title: 'test-story', description: planText.slice(0, 200) }];
  out.log('agent-pm', `Plan: ${stories.length} stories`);

  // Run pipeline for first story only (smoke test)
  const story = stories[0];
  const taskDescription = story.description || story.title;

  out.divider();
  out.header(`Running pipeline for: ${story.title || taskDescription}`);

  // Spec
  out.log('test', '--- Spec Agent ---');
  const specResult = await runSpecAgent({ session, taskDescription });
  out.log('test', `Spec: v${specResult.version} | gate: ${specResult.gateResult?.action}`);

  // Dev
  out.log('test', '--- Dev Agent ---');
  const devResult = await runDevAgent({
    session,
    refinedSpec: specResult.outputText,
    taskDescription: story.title || taskDescription,
  });
  out.log('test', `Dev: v${devResult.version} | gate: ${devResult.gateResult?.action} | syntax errors: ${devResult.syntaxErrors?.length ?? 0}`);

  if (devResult.version) {
    await promoteToCurrentVersion({ tenantId: values.tenant, projectId: values.project, version: devResult.version });
    out.log('test', `Promoted v${devResult.version} to current`);
  }

  // Review
  out.log('test', '--- Review Agent ---');
  const reviewResult = await runReviewAgent({ session, code: devResult.outputText, spec: specResult.outputText });
  out.log('test', `Review: v${reviewResult.version} | gate: ${reviewResult.gateResult?.action}`);

  // QA
  out.log('test', '--- QA Agent ---');
  const qaResult = await runQAAgent({ session, spec: specResult.outputText, code: devResult.outputText });
  out.log('test', `QA: v${qaResult.version} | gate: ${qaResult.gateResult?.action}`);

  // Docs
  out.log('test', '--- Docs Agent ---');
  const docsResult = await runDocsAgent({ session, spec: specResult.outputText, code: devResult.outputText, tests: qaResult.outputText });
  out.log('test', `Docs: v${docsResult.version} | gate: ${docsResult.gateResult?.action}`);

  out.divider();
  out.header('Pipeline Summary');
  out.log('test', `Session cost: $${session.tokenUsage?.total?.toFixed(4) ?? '0.0000'} of $${values.budget}`);
  out.log('test', `Output at: workspaces/${values.tenant}/${values.project}/output/`);
  out.success('Full pipeline test complete');

} catch (err) {
  out.error(`Pipeline test failed: ${err.message}`);
  if (process.env.GLOWING_DEBUG) console.error(err);
  process.exit(1);
}
