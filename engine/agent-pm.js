import fs from 'fs/promises';
import path from 'path';
import { callClaude } from '../utils/claude.js';
import { getWorkspacePath } from '../utils/workspace.js';
import * as out from '../utils/output.js';

export class AgentPM {
  constructor(session) {
    this.session = session;
    this.conversationHistory = session.agentPM?.conversationHistory ?? [];
    this._systemPrompt = null;
  }

  async loadSystemPrompt() {
    if (this._systemPrompt) return this._systemPrompt;
    const promptPath = path.join(
      getWorkspacePath(this.session.tenantId, this.session.projectId),
      'context-vault', 'agent-pm-prompt.md'
    );
    this._systemPrompt = await fs.readFile(promptPath, 'utf8');
    return this._systemPrompt;
  }

  async think(userMessage) {
    const systemPrompt = await this.loadSystemPrompt();

    const response = await callClaude({
      systemPrompt,
      userPrompt: userMessage,
      agentId: 'agent-pm',
      tenantId: this.session.tenantId,
      projectId: this.session.projectId,
      sessionId: this.session.sessionId,
      conversationHistory: this.conversationHistory,
      dryRun: this.session.dryRun,
    });

    const text = response.content[0].text;
    this.conversationHistory.push({ role: 'user', content: userMessage });
    this.conversationHistory.push({ role: 'assistant', content: text });

    if (this.conversationHistory.length > 20) {
      this.conversationHistory = await this.compressHistory();
    }

    return text;
  }

  async compressHistory() {
    const toCompress = this.conversationHistory.slice(0, -6);
    const recentTurns = this.conversationHistory.slice(-6);

    out.log('agent-pm', 'Compressing session history...');

    const summary = await callClaude({
      systemPrompt: 'Compress this agent session history into a compact state snapshot. Preserve: all decisions made, all agent outputs summarised, current plan status, any PM feedback. Return plain text.',
      userPrompt: JSON.stringify(toCompress),
      agentId: 'history-compressor',
      tenantId: this.session.tenantId,
      projectId: this.session.projectId,
      sessionId: this.session.sessionId,
      dryRun: this.session.dryRun,
    });

    return [
      { role: 'user', content: '[COMPRESSED SESSION HISTORY — decisions and outputs preserved]' },
      { role: 'assistant', content: summary.content[0].text },
      ...recentTurns,
    ];
  }

  plan() {
    return this.think(
      'Analyze all specs. Select the next 5-8 stories to execute this session. ' +
      'Prioritise by: dependencies first, then complexity low-to-high. ' +
      'Do not plan more than 8 stories per session. ' +
      'Remaining stories will be picked up in subsequent sessions. ' +
      'Produce execution plan as structured JSON.'
    );
  }

  revisePlan(feedback) {
    return this.think(`PM feedback on plan: "${feedback}". Revise and restate full plan as structured JSON.`);
  }

  routeNext(lastOutput) {
    return this.think(`Step complete. Output summary: ${lastOutput}. Decide next step and which agent to run. Return structured JSON decision.`);
  }

  handleFailure(err) {
    return this.think(`Failure occurred: ${JSON.stringify(err)}. Auto-recover if possible, or escalate with diagnosis. Return structured JSON decision.`);
  }

  answerQuestion(q) {
    return this.think(`PM question: "${q}". Answer using full session context. Do not affect pipeline state.`);
  }

  handleScopeChange(feedback) {
    return this.think(`PM scope change: "${feedback}". Re-plan from current step. Return updated structured JSON plan.`);
  }
}
