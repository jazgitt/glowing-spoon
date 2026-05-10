import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import { validateFiles } from '../../utils/file-validator.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'dev-agent';

export async function runDevAgent({ session, refinedSpec, taskDescription, pmFeedback = [], syntaxErrors = [] }) {
  out.divider();
  out.log(AGENT_ID, `Task: ${taskDescription}`);

  const skillFilenames = await resolveSkills(AGENT_ID, taskDescription, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames, session.skillVersionSnapshot);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const syntaxSection = syntaxErrors.length > 0
    ? `\n\n## Syntax Errors to Fix\n${syntaxErrors.map(e => `${e.file} line ${e.line}: ${e.error}`).join('\n')}`
    : '';

  const userPrompt =
    `Task: ${taskDescription}${feedbackSection}${syntaxSection}\n\n` +
    `Refined Spec:\n${refinedSpec}\n\n` +
    `Write the implementation. Output each file using: // filepath: src/{path}`;

  const systemPrompt = skillContent
    ? `You are a Dev Agent. Write clean, production-ready code.\n\n${skillContent}`
    : 'You are a Dev Agent. Write clean, production-ready code.';

  out.log(AGENT_ID, 'Calling Claude...');
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
    return { outputText, files, version: null, gateResult: null, syntaxErrors: validation.failed };
  }

  const { version } = await saveAgentOutput({
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    agentId: AGENT_ID,
    files,
    trigger: pmFeedback.length > 0 || syntaxErrors.length > 0 ? 'retry' : 'initial',
  });

  out.log(AGENT_ID, `Output saved as v${version}`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec: refinedSpec,
    session,
  });

  return { outputText, files, version, gateResult, syntaxErrors: [] };
}
