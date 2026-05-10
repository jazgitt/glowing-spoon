/**
 * Test: workspace validation and vault loading
 * Usage: node test/workspace-test.js --tenant local --project test
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { validateWorkspace, loadSelectiveVault, loadSpecs, loadProductMd } from '../utils/workspace.js';
import * as out from '../utils/output.js';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string', default: 'local' },
    project: { type: 'string', default: 'test' },
  },
});

const { tenant, project } = values;

out.header('Workspace Test');
out.log('test', `Tenant: ${tenant} | Project: ${project}`);

try {
  out.log('test', 'Validating workspace...');
  await validateWorkspace(tenant, project);
  out.success('Workspace valid');

  out.log('test', 'Loading product summary...');
  const product = await loadProductMd(tenant, project);
  out.log('test', `PRODUCT.md: ${product.slice(0, 100)}...`);

  out.log('test', 'Loading selective vault (guardrails + patterns)...');
  const vault = await loadSelectiveVault(tenant, project, ['guardrails', 'patterns']);
  out.log('test', `Vault loaded: ${vault.length} chars`);

  out.log('test', 'Loading specs...');
  const specs = await loadSpecs(tenant, project);
  out.log('test', `Specs loaded: ${specs.length} chars`);

  out.success('All workspace tests passed');
} catch (err) {
  out.error(`Workspace test failed: ${err.message}`);
  process.exit(1);
}
