import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput, readCodebaseContext } from '../../engine/output-store.js';
import { validateFiles } from '../../utils/file-validator.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'dev-agent';

// One app, built incrementally. Without these rules each story invents its own
// stack and the assembler inherits duplicate .js/.ts modules it cannot reconcile.
const CONSISTENCY_RULES = `
Consistency rules (non-negotiable):
- You are extending ONE app built incrementally by earlier stories. The "Existing Codebase" section below is what already exists.
- REUSE existing models, services, stores, and types. NEVER write a second implementation of a module that already exists — extend the existing file instead, and output the full updated file.
- NEVER switch language or module style: if the codebase is TypeScript with ES modules, all new code is TypeScript with ES modules (.ts/.tsx). Do not emit .js/.jsx copies of existing .ts/.tsx files.
- Keep data shapes and field names exactly consistent with existing models (e.g. if readings use "recordedAt", do not introduce "measuredAt").
- One persistence approach for the whole app — follow whatever the existing services use; do not add a parallel one.`;

export async function runDevAgent({ session, refinedSpec, taskDescription, pmFeedback = [], syntaxErrors = [] }) {
  out.divider();
  out.log(AGENT_ID, `Task: ${taskDescription}`);

  const skillFilenames = await resolveSkills(AGENT_ID, taskDescription, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const syntaxSection = syntaxErrors.length > 0
    ? `\n\n## Syntax Errors to Fix\n${syntaxErrors.map(e => `${e.file} line ${e.line}: ${e.error}`).join('\n')}`
    : '';

  // Cross-story context: what earlier stories built. Stateless agents get no
  // memory — this section IS the story-to-story communication channel.
  const codebase = await readCodebaseContext({
    tenantId: session.tenantId, projectId: session.projectId,
  });
  const codebaseSection = codebase
    ? `\n\n## Existing Codebase (built by earlier stories — extend it, never duplicate it)\n${codebase}`
    : '';

  const userPrompt =
    `Task: ${taskDescription}${feedbackSection}${syntaxSection}${codebaseSection}\n\n` +
    `Refined Spec:\n${refinedSpec}\n\n` +
    `Write the implementation. Output each file using: // filepath: src/{path}`;

  const systemPromptBase = `You are a Dev Agent. Write clean, production-ready code.\n${CONSISTENCY_RULES}`;
  const systemPrompt = skillContent
    ? `${systemPromptBase}\n\n${skillContent}`
    : systemPromptBase;

  const response = await callClaude({
    systemPrompt,
    userPrompt,
    agentId: AGENT_ID,
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    dryRun: session.dryRun,
  });

  const outputText = response.content[0].text;
  const files = parseFilesFromOutput(outputText);

  if (files.length === 0) {
    files.push({ relativePath: 'src/output.js', content: outputText });
  }

  // Syntax validation before quality gate
  const validation = validateFiles(files);
  if (!validation.valid) {
    out.warn(`[${AGENT_ID}] Syntax errors in ${validation.failed.length} file(s)`);
    return { outputText, files, gateResult: null, syntaxErrors: validation.failed };
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, `Output saved`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec: refinedSpec,
    session,
  });

  return { outputText, files, gateResult, syntaxErrors: [] };
}
