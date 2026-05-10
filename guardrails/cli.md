# CLI Design

## Entry Point

`/cli/index.js` — built with [commander.js](https://github.com/tj/commander.js). Installed globally as `glowing-spoon`.

All commands resolve the active session from `workspaces/{tenantId}/{projectId}/.session.json`. tenantId is always `"local"` in MVP.

## Sub-Commands

```
glowing-spoon workspace init --project <id> --name "<name>" --description "<text>" --stack "<text>"
glowing-spoon workspace list

glowing-spoon session start --project <id> [--budget 5.00]
glowing-spoon session status
glowing-spoon session stop

glowing-spoon plan view
glowing-spoon plan approve
glowing-spoon plan reject --feedback "<text>"

glowing-spoon approve                        ← approve current checkpoint
glowing-spoon reject --feedback "<text>"     ← reject checkpoint with feedback

glowing-spoon respond --message "<text>"     ← send message to Agent PM (question / scope change / feedback)
```

## Session IPC — File-Based

The session process (`session start`) is a foreground process. It writes progress to stdout and state to disk. Separate commands issued by the PM (in another terminal) communicate back via two files in the workspace root:

```
workspaces/{tenantId}/{projectId}/
  .session.json        ← full session state, written on every state change
  .pending.json        ← written by session when it needs PM input; deleted after response consumed
  .response.json       ← written by PM command; consumed and deleted by session process
```

### Flow

1. Session reaches a decision point → writes `.pending.json`, logs "Waiting for PM input. Run `glowing-spoon plan view`" → polls `.response.json` every 2s
2. PM runs `glowing-spoon plan view` → reads `.session.json`, prints plan to stdout
3. PM runs `glowing-spoon plan approve` → writes `.response.json: { action: "approve" }` → exits
4. Session poll detects `.response.json` → reads + deletes it → deletes `.pending.json` → continues

### .pending.json shape

```json
{
  "type": "plan-approval | checkpoint | ambiguity | quality-failed | escalation",
  "sessionId": "uuid",
  "payload": { ... }
}
```

### .response.json shape

```json
{
  "action": "approve | reject | respond",
  "feedback": "optional text"
}
```

## Output Format

All session output uses `utils/output.js` (chalk-based). Consistent prefixes:

```
[agent-pm]      Planning session...
[spec-agent]    Refining story: user can log in
[quality]       Score: 87/100 — PASS
[cost]          $0.0032 this call | $0.041 session total (8% of $0.50 budget)
[PENDING]       Plan ready. Run: glowing-spoon plan view
[WARN]          architecture.md exceeds token limit (5,200 / 4,000)
[ERROR]         SYNTAX_ERROR in src/auth/Login.tsx:42 — retrying (1/2)
[BLOCKED]       Quality gate failed after 2 retries. Run: glowing-spoon reject --feedback "..."
[✓]             Session complete. Output at: workspaces/local/my-app/output/current/
```
