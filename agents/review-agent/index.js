import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'review-agent';

export async function runReviewAgent({ session, code, spec, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Reviewing code...');

  const skillFilenames = await resolveSkills(AGENT_ID, spec, session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `Spec:\n${spec}${feedbackSection}\n\nCode to review:\n${code}\n\n` +
    `Review for: architecture fit, code quality, pattern compliance. ` +
    `Output findings as: // filepath: review/findings.md`;

  const systemPrompt = skillContent
    ? `You are a Review Agent. Evaluate code against spec and patterns.\n\n${skillContent}`
    : 'You are a Review Agent. Evaluate code against spec and patterns.';

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
    files.push({ relativePath: 'review/findings.md', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, `Review saved`);

  const gateResult = await runQualityGate({
    agentId: AGENT_ID,
    output: outputText,
    spec,
    session,
  });

  return { outputText, files, gateResult };
}
