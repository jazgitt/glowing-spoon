import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'cost-agent';

// Report agent: informational deliverable, no quality gate (gateResult: null = pass).
export async function runCostAgent({ session, digest, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Estimating monthly run-cost...');

  const skillFilenames = await resolveSkills(AGENT_ID, 'estimate hosting and API run-cost for the built MVP', session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `MVP built this session:\n${digest}${feedbackSection}\n\n` +
    `Estimate the monthly run-cost of operating this MVP at 100, 1k, and 10k users: ` +
    `hosting, database, third-party API fees, email/SMS. Recommend the cheapest viable ` +
    `hosting setup for a small business. State every assumption. ` +
    `Output the report using: // filepath: report/run-cost.md`;

  const systemPrompt = skillContent
    ? `You are a Cost Agent. Estimate realistic operating costs for small-business MVPs. Prefer cheap, boring infrastructure.\n\n${skillContent}`
    : 'You are a Cost Agent. Estimate realistic operating costs for small-business MVPs. Prefer cheap, boring infrastructure.';

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
    files.push({ relativePath: 'report/run-cost.md', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, 'Run-cost report saved');

  return { outputText, files, gateResult: null };
}
