import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'teardown-agent';

// Report agent: informational deliverable, no quality gate (gateResult: null = pass).
export async function runTeardownAgent({ session, digest, sessionCost, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Writing build teardown...');

  const skillFilenames = await resolveSkills(AGENT_ID, 'compare this build against agency and freelancer cost and timeline', session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `MVP built this session (actual session cost: $${sessionCost}):\n${digest}${feedbackSection}\n\n` +
    `Write a build teardown: estimate what a dev agency and a freelancer would quote to ` +
    `build the same MVP (cost range and timeline), compare against this session's actual ` +
    `cost and same-day turnaround, and list honestly what a human team would still add ` +
    `(production hardening, design polish, ops). Keep estimates conservative and state ` +
    `assumptions. ` +
    `Output the report using: // filepath: report/build-teardown.md`;

  const systemPrompt = skillContent
    ? `You are a Teardown Agent. Compare AI-built MVPs against traditional build options with honest, conservative numbers.\n\n${skillContent}`
    : 'You are a Teardown Agent. Compare AI-built MVPs against traditional build options with honest, conservative numbers.';

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
    files.push({ relativePath: 'report/build-teardown.md', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, 'Build teardown saved');

  return { outputText, files, gateResult: null };
}
