import path from 'path';
import { initWorkspace, seedWorkspace, listWorkspaces } from '../../utils/workspace-init.js';
import * as out from '../../utils/output.js';

const TENANT_ID = 'local';

export function registerWorkspaceCommands(program) {
  const ws = program.command('workspace').description('Manage product workspaces');

  ws.command('init')
    .description('Initialize a new workspace for a project')
    .requiredOption('--project <id>', 'Project ID (slug, no spaces)')
    .requiredOption('--name <name>', 'Product name')
    .option('--description <text>', 'Product description', '')
    .option('--stack <text>', 'Tech stack description', '')
    .action(async (opts) => {
      let workspacePath;
      try {
        workspacePath = await initWorkspace({
          tenantId: TENANT_ID,
          projectId: opts.project,
          name: opts.name,
          description: opts.description,
          stack: opts.stack,
        });
      } catch (err) {
        if (err.code === 'WORKSPACE_EXISTS') {
          out.warn(err.message);
          return;
        }
        out.error(err.message);
        process.exit(1);
      }

      out.success(`Workspace initialized at ${workspacePath}`);
      out.log('workspace', `Next: edit ${path.join(workspacePath, 'context-vault')} vault files, then add specs to ${path.join(workspacePath, 'specs')}`);
    });

  ws.command('seed')
    .description('Populate a new workspace from the built-in login-app example')
    .requiredOption('--project <id>', 'Project ID to seed')
    .action(async (opts) => {
      let result;
      try {
        result = await seedWorkspace({ tenantId: TENANT_ID, projectId: opts.project });
      } catch (err) {
        out.error(err.message);
        process.exit(1);
      }

      if (result.existed) {
        out.warn(`Workspace already existed at ${result.workspacePath} — files were overwritten.`);
      }
      out.success(`Workspace seeded at ${result.workspacePath}`);
      out.log('workspace', `Try it: glowing-spoon run --project ${opts.project} --dry-run`);
    });

  ws.command('list')
    .description('List all workspaces for tenant local')
    .action(async () => {
      const projects = await listWorkspaces(TENANT_ID);
      if (projects.length === 0) {
        out.log('workspace', 'No workspaces found. Run: glowing-spoon workspace init');
        return;
      }
      out.header('Workspaces');
      for (const p of projects) {
        out.log('workspace', p);
      }
    });
}
