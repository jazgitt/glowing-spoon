# Agent PM — Session Brain

Agent PM is not a one-shot call. It maintains conversation history across the entire session.

## System Prompt Source

Loaded at session start from the workspace vault — NOT a hardcoded constant:
`/workspaces/{tenantId}/{projectId}/context-vault/agent-pm-prompt.md`

Platform ships a default at `/defaults/agent-pm-prompt.md` copied into every new workspace by `glowing-spoon workspace init`.

The prompt must cover: role, planning rules (5-8 stories/session), intent classification, routing logic, recovery behavior, output format (structured JSON so agent-pm.js can parse routing without regex).

## AgentPM Class (engine/agent-pm.js)

```javascript
class AgentPM {
  constructor(session) {
    this.session = session;
    this.conversationHistory = [];
  }

  async loadSystemPrompt() {
    const promptPath = path.join(
      getWorkspacePath(this.session.tenantId, this.session.projectId),
      'context-vault', 'agent-pm-prompt.md'
    );
    return fs.readFile(promptPath, 'utf8');
  }

  async think(userMessage) {
    const systemPrompt = this._systemPrompt || (this._systemPrompt = await this.loadSystemPrompt());
    const response = await callClaude({
      systemPrompt, userPrompt: userMessage, agentId: "agent-pm",
      tenantId: this.session.tenantId, projectId: this.session.projectId,
      sessionId: this.session.sessionId, conversationHistory: this.conversationHistory,
    });

    const text = response.content[0].text;
    this.conversationHistory.push({ role: "user", content: userMessage });
    this.conversationHistory.push({ role: "assistant", content: text });

    // Compress history every 20 turns — uses Haiku
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = await this.compressHistory();
    }

    await store.updateAgentPMHistory(this.session.sessionId, this.conversationHistory);
    return text;
  }

  async compressHistory() {
    const toCompress = this.conversationHistory.slice(0, -6);
    const recentTurns = this.conversationHistory.slice(-6);

    const summary = await callClaude({
      systemPrompt: "Compress this agent session history into a compact state snapshot. Preserve: all decisions made, all agent outputs summarised, current plan status, any PM feedback. Return plain text.",
      userPrompt: JSON.stringify(toCompress),
      agentId: "history-compressor",
      tenantId: this.session.tenantId, projectId: this.session.projectId,
      sessionId: this.session.sessionId,
    });

    return [
      { role: "user",      content: "[COMPRESSED SESSION HISTORY — decisions and outputs preserved]" },
      { role: "assistant", content: summary.content[0].text },
      ...recentTurns
    ];
  }

  // Named entry points — all route through think()
  plan()                { return this.think("Analyze all specs. Select the next 5-8 stories to execute this session. Prioritise by: dependencies first, then complexity low-to-high. Do not plan more than 8 stories. Produce execution plan."); }
  revisePlan(feedback)  { return this.think(`PM feedback on plan: "${feedback}". Revise and restate full plan.`); }
  routeNext(lastOutput) { return this.think(`Step complete. Output summary: ${lastOutput}. Decide next step.`); }
  handleFailure(err)    { return this.think(`Failure occurred: ${JSON.stringify(err)}. Auto-recover or escalate with diagnosis.`); }
  answerQuestion(q)     { return this.think(`PM question: "${q}". Answer using full session context.`); }
  handleScopeChange(fb) { return this.think(`PM scope change: "${fb}". Re-plan from current step.`); }
}
```

## Specialist Agents Are Stateless

Specialist agents receive everything they need per call. Agent PM feeds them exactly the right context from session history.
