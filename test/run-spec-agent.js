/**
 * Test: run spec-agent in isolation against a single story
 * Usage: node test/run-spec-agent.js --tenant local --project test --story "user can log in"
 * Add --dry-run to skip real Claude calls
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { config } from '../utils/config.js';
import { createSession } from '../store/session-schema.js';
import { validateWorkspace } from '../utils/workspace.js';
import { runSpecAgent } from '../agents/spec-agent/index.js';
import * as out from '../utils/output.js';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string', default: 'local' },
    project: { type: 'string', default: 'test' },
    story: { type: 'string', default: 'As a user I want to log in with email and password' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (values['dry-run']) config.dryRun = true;

out.header('Spec Agent Test');
out.log('test', `Tenant: ${values.tenant} | Project: ${values.project}`);
out.log('test', `Story: ${values.story}`);
if (values['dry-run']) out.warn('DRY RUN — no real Claude calls');

try {
  await validateWorkspace(values.tenant, values.project);

  const session = createSession({
    tenantId: values.tenant,
    projectId: values.project,
    costBudget: 5.00,
    dryRun: values['dry-run'],
  });

  out.divider();
  const result = await runSpecAgent({
    session,
    taskDescription: values.story,
  });

  out.divider();
  out.header('Result');
  out.log('test', `Files: ${result.files.map(f => f.relativePath).join(', ')}`);
  out.log('test', `Quality gate: ${result.gateResult?.action ?? 'n/a'} | overall: ${result.gateResult?.overall ?? 'n/a'}`);

  if (result.gateResult?.action !== 'pass') {
    out.warn(`Gate issues: ${result.gateResult?.feedback?.join('; ')}`);
  }

  out.divider();
  out.success(`Spec agent test complete. Output at: workspaces/${values.tenant}/${values.project}/output/`);
} catch (err) {
  out.error(`Spec agent test failed: ${err.message}`);
  if (process.env.GLOWING_DEBUG) console.error(err);
  process.exit(1);
}
