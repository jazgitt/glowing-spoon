import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'docs-agent';

export async function runDocsAgent({ session, spec, code, tests, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Generating docs...');

  const skillFilenames = await resolveSkills(AGENT_ID, spec, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames, session.skillVersionSnapshot);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const codeSection = code ? `\n\nCode:\n${code}` : '';
  const testsSection = tests ? `\n\nTests summary:\n${tests.slice(0, 2000)}` : '';

  const userPrompt =
    `Spec:\n${spec}${codeSection}${testsSection}${feedbackSection}\n\n` +
    `Generate component docs, API docs, and update CHANGELOG. ` +
    `Output each file using: // filepath: docs/{filename}`;

  const systemPrompt = skillContent
    ? `You are a Docs Agent. Write clear, accurate documentation.\n\n${skillContent}`
    : 'You are a Docs Agent. Write clear, accurate documentation.';

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
    files.push({ relativePath: 'docs/README.md', content: outputText });
  }

  const { version } = await saveAgentOutput({
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    agentId: AGENT_ID,
    files,
    trigger: pmFeedback.length > 0 ? 'retry' : 'initial',
  });

  out.log(AGENT_ID, `Docs saved as v${version}`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec,
    session,
  });

  return { outputText, files, version, gateResult };
}
