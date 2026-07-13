import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'pitch-agent';

// Report agent: informational deliverable, no quality gate (gateResult: null = pass).
export async function runPitchAgent({ session, digest, pmFeedback = [] }) {
  out.divider();
  out.log(AGENT_ID, 'Writing pitch materials...');

  const skillFilenames = await resolveSkills(AGENT_ID, 'write a one-pager, demo script, and pricing draft for the built MVP', session);
  session.agents[AGENT_ID].skillsLoaded = skillFilenames;
  const skillContent = await loadSkillContents(AGENT_ID, skillFilenames);

  const feedbackSection = pmFeedback.length > 0
    ? `\n\n## Previous Feedback\n${pmFeedback.join('\n')}`
    : '';

  const userPrompt =
    `MVP built this session:\n${digest}${feedbackSection}\n\n` +
    `Turn this MVP into sales-ready materials: a one-page summary (problem, solution, ` +
    `who it's for), a 3-minute demo script that walks the built features in order, and ` +
    `a simple pricing draft with two or three tiers. Write for a small-business owner ` +
    `showing this to their first customers — plain language, no engineering jargon. ` +
    `Output each file using: // filepath: report/{filename}.md`;

  const systemPrompt = skillContent
    ? `You are a Pitch Agent. Turn shipped MVPs into materials a founder can sell with tomorrow.\n\n${skillContent}`
    : 'You are a Pitch Agent. Turn shipped MVPs into materials a founder can sell with tomorrow.';

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
    files.push({ relativePath: 'report/pitch-one-pager.md', content: outputText });
  }

  await saveAgentOutput({ tenantId: session.tenantId, projectId: session.projectId, files });
  out.log(AGENT_ID, 'Pitch materials saved');

  return { outputText, files, gateResult: null };
}
