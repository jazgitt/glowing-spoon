import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'compliance-agent';

// Report agent: informational deliverable, no quality gate (gateResult: null = pass).
export async function runComplianceAgent({ session, digest, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Running compliance checklist...');

  const skillFilenames = await resolveSkills(AGENT_ID, 'check GDPR, PCI scope, and accessibility basics for the built MVP', session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `MVP built this session:\n${digest}${feedbackSection}\n\n` +
    `Run the compliance-lite checklist against this MVP: GDPR basics (consent, data ` +
    `deletion, cookie notice), PCI scope (are card details ever touched directly?), and ` +
    `accessibility minimum bar (labels, contrast, keyboard nav). For each item: PASS, ` +
    `GAP with a concrete fix, or N/A. This is a guardrail checklist, not legal advice — ` +
    `say so in the report header. ` +
    `Output the report using: // filepath: report/compliance-checklist.md`;

  const systemPrompt = skillContent
    ? `You are a Compliance Agent. Flag the compliance basics small businesses skip and regret. Checklist only — never claim to provide legal advice.\n\n${skillContent}`
    : 'You are a Compliance Agent. Flag the compliance basics small businesses skip and regret. Checklist only — never claim to provide legal advice.';

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
    files.push({ relativePath: 'report/compliance-checklist.md', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, 'Compliance checklist saved');

  return { outputText, files, gateResult: null };
}
