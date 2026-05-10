import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../../utils/workspace.js';
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
      const workspacePath = getWorkspacePath(TENANT_ID, opts.project);

      try {
        await fs.access(workspacePath);
        out.warn(`Workspace already exists at ${workspacePath}`);
        return;
      } catch {
        // Does not exist — proceed
      }

      await fs.mkdir(path.join(workspacePath, 'specs'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'context-vault'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'output', 'versions'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'session-history'), { recursive: true });

      await fs.writeFile(
        path.join(workspacePath, 'PRODUCT.md'),
        `# ${opts.name}\n\n${opts.description}\n\n## Tech Stack\n${opts.stack}\n`
      );

      const vaultFiles = ['guardrails.md', 'patterns.md', 'architecture.md', 'stack.md', 'decisions.md'];
      for (const f of vaultFiles) {
        await fs.writeFile(path.join(workspacePath, 'context-vault', f), `# ${f}\n\n`);
      }

      const defaultPromptPath = path.join(process.cwd(), 'defaults', 'agent-pm-prompt.md');
      const defaultPrompt = await fs.readFile(defaultPromptPath, 'utf8');
      await fs.writeFile(path.join(workspacePath, 'context-vault', 'agent-pm-prompt.md'), defaultPrompt);

      out.success(`Workspace initialized at ${workspacePath}`);
      out.log('workspace', `Next: edit ${path.join(workspacePath, 'context-vault')} vault files, then add specs to ${path.join(workspacePath, 'specs')}`);
    });

  ws.command('list')
    .description('List all workspaces for tenant local')
    .action(async () => {
      const root = path.join(process.env.WORKSPACE_ROOT || './workspaces', TENANT_ID);
      try {
        const projects = await fs.readdir(root);
        if (projects.length === 0) {
          out.log('workspace', 'No workspaces found. Run: glowing-spoon workspace init');
          return;
        }
        out.header('Workspaces');
        for (const p of projects) {
          out.log('workspace', p);
        }
      } catch {
        out.log('workspace', 'No workspaces found. Run: glowing-spoon workspace init');
      }
    });
}
