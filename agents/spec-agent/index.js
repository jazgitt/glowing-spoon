import { callClaude } from '../../utils/claude.js';
import { loadSpecs } from '../../utils/workspace.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import { validateFiles } from '../../utils/file-validator.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'spec-agent';

export async function runSpecAgent({ session, taskDescription, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, `Task: ${taskDescription}`);

  const specs = await loadSpecs(session.tenantId, session.projectId);

  const skillFilenames = await resolveSkills(AGENT_ID, taskDescription, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames, session.skillVersionSnapshot);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `Task: ${taskDescription}${feedbackSection}\n\n` +
    `Refine the relevant stories and write acceptance criteria. ` +
    `Output each file using: // filepath: specs/{filename}.md`;

  const systemPrompt = skillContent
    ? `You are a Spec Agent. Refine user stories and write acceptance criteria.\n\n${skillContent}`
    : 'You are a Spec Agent. Refine user stories and write acceptance criteria.';

  out.log(AGENT_ID, 'Calling Claude...');
  const response = await callClaude({
    systemPrompt,
    userPrompt,
    agentId: AGENT_ID,
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    specs,
    dryRun: session.dryRun,
  });

  const outputText = response.content[0].text;
  const files = parseFilesFromOutput(outputText);

  if (files.length === 0) {
    files.push({ relativePath: 'specs/refined-spec.md', content: outputText });
  }

  const { version } = await saveAgentOutput({
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    agentId: AGENT_ID,
    files,
    trigger: pmFeedback.length > 0 ? 'retry' : 'initial',
  });

  out.log(AGENT_ID, `Output saved as v${version}`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec: taskDescription,
    session,
  });

  return { outputText, files, version, gateResult };
}
