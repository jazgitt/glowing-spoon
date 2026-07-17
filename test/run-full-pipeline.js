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
import { runIntegrationAgent, needsIntegration } from '../agents/integration-agent/index.js';
import { runReviewAgent } from '../agents/review-agent/index.js';
import { runQAAgent } from '../agents/qa-agent/index.js';
import { runDocsAgent } from '../agents/docs-agent/index.js';
import { runCostAgent } from '../agents/cost-agent/index.js';
import { runComplianceAgent } from '../agents/compliance-agent/index.js';
import { runPitchAgent } from '../agents/pitch-agent/index.js';
import { runTeardownAgent } from '../agents/teardown-agent/index.js';
import { readOutputDigest } from '../engine/output-store.js';
import { getSession } from '../store/file-store.js';
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

// initSession refuses to start against empty specs (NO_SPECS guard) — seed a
// minimal story so the wiring test has something legitimate to build from.
{
  const { getWorkspacePath } = await import('../utils/workspace.js');
  const fs = await import('fs/promises');
  const path = await import('path');
  const specsDir = path.join(getWorkspacePath(values.tenant, values.project), 'specs');
  await fs.mkdir(specsDir, { recursive: true });
  const seedFile = path.join(specsDir, 'stories.md');
  try {
    await fs.access(seedFile);
  } catch {
    await fs.writeFile(seedFile,
      '# User Stories\n\n## Story 1: User Registration\nAs a user, I can register with email and password.\n\nAcceptance criteria:\n- Email format validated\n- Password minimum 8 characters\n');
    out.log('test', 'Seeded specs/stories.md (specs folder was empty)');
  }
}

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
  out.log('test', `Spec: gate: ${specResult.gateResult?.action}`);

  // Dev
  out.log('test', '--- Dev Agent ---');
  const devResult = await runDevAgent({
    session,
    refinedSpec: specResult.outputText,
    taskDescription: story.title || taskDescription,
  });
  out.log('test', `Dev: gate: ${devResult.gateResult?.action} | syntax errors: ${devResult.syntaxErrors?.length ?? 0}`);

  // Integration — smoke test runs it unconditionally; the real pipeline
  // only triggers it when needsIntegration(spec) matches.
  out.log('test', `--- Integration Agent (trigger would fire: ${needsIntegration(specResult.outputText)}) ---`);
  const integrationResult = await runIntegrationAgent({
    session,
    spec: specResult.outputText,
    code: devResult.outputText,
    taskDescription: story.title || taskDescription,
  });
  out.log('test', `Integration: gate: ${integrationResult.gateResult?.action} | syntax errors: ${integrationResult.syntaxErrors?.length ?? 0}`);

  // Review
  out.log('test', '--- Review Agent ---');
  const reviewResult = await runReviewAgent({ session, code: devResult.outputText, spec: specResult.outputText });
  out.log('test', `Review: gate: ${reviewResult.gateResult?.action}`);

  // QA
  out.log('test', '--- QA Agent ---');
  const qaResult = await runQAAgent({ session, spec: specResult.outputText, code: devResult.outputText });
  out.log('test', `QA: gate: ${qaResult.gateResult?.action}`);

  // Docs
  out.log('test', '--- Docs Agent ---');
  const docsResult = await runDocsAgent({ session, spec: specResult.outputText, code: devResult.outputText, tests: qaResult.outputText });
  out.log('test', `Docs: gate: ${docsResult.gateResult?.action}`);

  // MVP Report phase
  out.log('test', '--- MVP Report (cost / compliance / pitch / teardown) ---');
  const digest = await readOutputDigest({ tenantId: values.tenant, projectId: values.project });
  const costResult = await runCostAgent({ session, digest });
  out.log('test', `Cost report: ${costResult.files.length} file(s)`);
  const complianceResult = await runComplianceAgent({ session, digest });
  out.log('test', `Compliance report: ${complianceResult.files.length} file(s)`);
  const pitchResult = await runPitchAgent({ session, digest });
  out.log('test', `Pitch materials: ${pitchResult.files.length} file(s)`);
  const midSession = await getSession(values.tenant, values.project);
  const teardownResult = await runTeardownAgent({
    session, digest,
    sessionCost: (midSession?.tokenUsage?.total ?? 0).toFixed(4),
  });
  out.log('test', `Teardown report: ${teardownResult.files.length} file(s)`);

  const finalSession = await getSession(values.tenant, values.project);
  out.divider();
  out.header('Pipeline Summary');
  out.log('test', `Session cost: $${finalSession?.tokenUsage?.total?.toFixed(4) ?? '0.0000'} of $${values.budget}`);
  out.log('test', `Output at: workspaces/${values.tenant}/${values.project}/output/`);
  out.success('Full pipeline test complete');

} catch (err) {
  out.error(`Pipeline test failed: ${err.message}`);
  if (process.env.GLOWING_DEBUG) console.error(err);
  process.exit(1);
}
