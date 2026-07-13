import { callClaude } from '../../utils/claude.js';
import { resolveSkills, loadSkillContents } from '../../engine/skill-resolver.js';
import { runQualityGate } from '../../engine/quality-gate.js';
import { saveAgentOutput, parseFilesFromOutput } from '../../engine/output-store.js';
import { validateFiles } from '../../utils/file-validator.js';
import * as out from '../../utils/output.js';

const AGENT_ID = 'integration-agent';

// Third-party service signals. Only these trigger the integration stage —
// generic terms like "email" are excluded to avoid firing on every story.
const INTEGRATION_SIGNALS = /\b(stripe|paypal|payment|checkout|shopify|twilio|sms|sendgrid|mailgun|oauth|sso|google sign-?in|slack|quickbooks|xero|webhook|zapier|calendly|maps api)\b/i;

export function needsIntegration(specText) {
  return INTEGRATION_SIGNALS.test(specText);
}

export async function runIntegrationAgent({ session, spec, code, taskDescription, pmFeedback = [], syntaxErrors = [] }) {
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

  const userPrompt =
    `Task: ${taskDescription}${feedbackSection}${syntaxSection}\n\n` +
    `Spec:\n${spec}\n\n` +
    `Existing implementation:\n${code}\n\n` +
    `Scaffold the third-party integrations this spec requires. ` +
    `Wire them into the existing implementation — do not rewrite it. ` +
    `All secrets come from environment variables; never hardcode keys. ` +
    `Output each file using: // filepath: src/integrations/{path}`;

  const systemPrompt = skillContent
    ? `You are an Integration Agent. Scaffold reliable third-party service integrations (payments, auth, messaging, webhooks).\n\n${skillContent}`
    : 'You are an Integration Agent. Scaffold reliable third-party service integrations (payments, auth, messaging, webhooks).';

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
    files.push({ relativePath: 'src/integrations/integration.js', content: outputText });
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
    spec,
    session,
  });

  return { outputText, files, gateResult, syntaxErrors: [] };
}
