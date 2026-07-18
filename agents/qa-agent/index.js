import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'qa-agent';

export async function runQAAgent({ session, spec, code, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Generating tests...');

  const skillFilenames = await resolveSkills(AGENT_ID, spec, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `Spec:\n${spec}${feedbackSection}\n\nCode:\n${code}\n\n` +
    `Generate unit and integration tests. Output each file using: // filepath: tests/{filename}`;

  const systemPrompt = skillContent
    ? `You are a QA Agent. Write comprehensive tests for the provided code.\n\n${skillContent}`
    : 'You are a QA Agent. Write comprehensive tests for the provided code.';

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
    files.push({ relativePath: 'tests/spec.test.js', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, `Tests saved`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec,
    session,
  });

  return { outputText, files, gateResult };
}
