# Glowing Spoon

**The fast MVP builder for small businesses.** Describe what you want to build — a team of AI agents plans it, writes it, reviews it, tests it, documents it, and then does what no dev agency does on day one: estimates your monthly run-cost, checks the compliance basics, writes your pitch materials, and shows you what the same build would have cost elsewhere. You approve, reject, and steer from the terminal.

```
glowing-spoon run --project my-app --budget 5.00 --background
glowing-spoon status  --session <id>
glowing-spoon approve --session <id>
```

## Prefer a browser? There's a web UI

No terminal needed — a full web dashboard covers everything: create projects,
edit specs, start sessions, watch the agent pipeline live, approve plans and
checkpoints with one click, browse output, and track cost. With real user
accounts (invite-only after the first admin).

```
npm --prefix web install && npm run web:build   # once
npm run serve                                   # http://localhost:3808
```

See [docs/deploy.md](docs/deploy.md) to put it on a VPS.

---

## Prerequisites

- **Node.js 20+**
- **An OpenRouter API key** — get one free at [openrouter.ai/keys](https://openrouter.ai/keys)
- **Provider keys in OpenRouter** — go to [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) and add your keys for Anthropic (Claude), OpenAI (GPT), and/or Google (Gemini). OpenRouter routes through your keys so you control billing per provider.

Dry-run mode needs no API key or credits.

---

## Quick Start

```bash
# 1. Clone, install, and register the CLI command
git clone https://github.com/jazgitt/glowing-spoon.git
cd glowing-spoon
npm install
npm link            # makes `glowing-spoon` available globally
                    # (or use: node cli/index.js <command> ... without linking)

# 2. Configure your OpenRouter key
cp .env.example .env
# Open .env and set OPENROUTER_API_KEY=sk-or-...
# (Skip this step for dry-run — no API key needed)

# 3. Seed the built-in example workspace
glowing-spoon workspace seed --project demo

# 4. Dry-run — no API credits spent, two terminals needed
# Terminal A:
glowing-spoon run --project demo --dry-run
# Terminal B (when Terminal A prints "Waiting for PM approval"):
glowing-spoon approve --session <id>
# Back to Terminal B when the dev checkpoint appears:
glowing-spoon approve --session <id>

# 5. Real build in the background (single terminal)
glowing-spoon run --project demo --budget 3.00 --background
glowing-spoon status  --session <id>    # check progress
glowing-spoon approve --session <id>    # approve plan
glowing-spoon approve --session <id>    # approve dev checkpoint
```

Output lands in `workspaces/local/demo/output/`.

---

## All Commands

| Command | What it does |
|---|---|
| `workspace init --project <id> --name <name>` | Create a blank workspace |
| `workspace seed --project <id>` | Populate from the built-in login-app example |
| `workspace list` | List all workspaces |
| `run --project <id> --budget <$>` | Start a new session (foreground) |
| `run ... --background` | Start in background; logs to `session.log` |
| `run ... --dry-run` | Skip real Claude calls; uses canned responses |
| `status --session <id>` | Show status, cost, cursor, log tail |
| `approve --session <id>` | Approve the pending plan or checkpoint |
| `reject --session <id> --feedback "text"` | Reject with feedback; agents revise |
| `respond --session <id> --message "text"` | Send a message to Agent PM between stages |
| `stop --session <id>` | Pause at next stage boundary |
| `resume --session <id>` | Continue a stopped session |
| `resume --session <id> --background` | Continue in background |
| `plan --session <id>` | Show the current execution plan |

---

## How It Works

```
You describe what to build → Agent PM plans the session
  → spec-agent        refines each story and writes acceptance criteria
  → dev-agent         writes the implementation
  → [YOU review the code and approve or reject]
  → integration-agent scaffolds Stripe / OAuth / SMS / webhooks (only when the spec needs them)
  → review-agent      checks architecture and code quality
  → qa-agent          generates unit and integration tests
  → docs-agent        writes component and API documentation

After all stories complete, the MVP Report phase runs once:
  → cost-agent        estimates monthly run-cost at 100 / 1k / 10k users + hosting pick
  → compliance-agent  GDPR / PCI / accessibility checklist (guardrail, not legal advice)
  → pitch-agent       one-pager, 3-minute demo script, pricing draft
  → teardown-agent    what an agency or freelancer would have quoted vs. this session
```

Each agent's output is written directly to `output/`. Retries overwrite the previous output — only the latest run is kept. The MVP Report lands in `output/report/`.

A **dev checkpoint** pauses after dev-agent completes so you can read the code before tests and docs are generated. Use `approve` to continue or `reject --feedback` to have dev-agent revise.

---

## Setting Up Your Own Project

### 1. Initialize a workspace

```bash
glowing-spoon workspace init --project my-app --name "My App" --stack "React, Node.js, PostgreSQL"
```

This creates `workspaces/local/my-app/` with empty vault files and a specs directory.

### 2. Fill in the vault files

Open `workspaces/local/my-app/context-vault/` and edit:

| File | What to write |
|---|---|
| `guardrails.md` | Your coding standards, what agents must/must not do |
| `patterns.md` | Code patterns and file naming conventions to follow |
| `architecture.md` | Your component structure, layers, and data flow |
| `stack.md` | Libraries, frameworks, versions in use |
| `decisions.md` | Key architectural choices and why you made them |

The `guardrails.md` and `patterns.md` files are injected into every agent. The others are injected selectively per agent type. Keep each file concise — longer files cost more per call and may be truncated.

### 3. Write your specs

Add `.md` files to `workspaces/local/my-app/specs/`. Write user stories:

```markdown
## Story: User can reset password
As a user I can reset my password via email so that I can regain access if I forget it.

Acceptance Criteria:
- Reset link sent to verified email
- Link expires after 1 hour
- New password must meet complexity requirements
- Old password invalidated immediately on reset
```

### 4. Run

```bash
glowing-spoon run --project my-app --budget 5.00 --background
```

---

## Cost & Safety

- **Start small.** Use `--budget 2.00` for your first real run. The session stops if it would exceed the budget.
- **Dry-run first.** `--dry-run` walks the full pipeline with canned responses — free, instant, verifies your setup.
- **Per-call estimates.** The platform checks estimated cost before each API call and stops if it would overshoot your budget.
- **One key, any model.** A single `OPENROUTER_API_KEY` routes to Claude, GPT, or Gemini. Switch models in `.env` without changing code.
- **You control provider billing.** Add your Anthropic/OpenAI/Google keys in [OpenRouter settings](https://openrouter.ai/settings/keys) — charges go directly to each provider at their published rates.

---

## Background Mode

When you run with `--background`, the session runs detached and logs to `workspaces/local/<project>/session.log`.

```bash
# Start
glowing-spoon run --project my-app --budget 5.00 --background
# → prints session ID immediately and returns

# Check in
glowing-spoon status --session <id>
# → shows status, cost, cursor, and log tail

# Approve the plan
glowing-spoon approve --session <id>

# Approve the dev checkpoint
glowing-spoon approve --session <id>

# Stop gracefully (saves cursor, resumable)
glowing-spoon stop --session <id>

# Resume later
glowing-spoon resume --session <id> --background
```

---

## Troubleshooting

**`Insufficient credits` / `402` error**
Add credits for the relevant provider in your [OpenRouter account](https://openrouter.ai/credits), or use `--dry-run` to test without spend.

**`OPENROUTER_API_KEY not set`**
Make sure `.env` exists and contains `OPENROUTER_API_KEY=sk-or-...`. Run from the repo root where `.env` lives.

**`Workspace not found`**
Run `glowing-spoon workspace init --project <id>` (or `workspace seed`) before `run`.

**`No specs found`**
Add at least one `.md` file to `workspaces/local/<project>/specs/`.

**Model not found / invalid model ID**
Anthropic occasionally changes model IDs. Update `AGENT_MODEL` in `utils/claude.js` to the current IDs from [docs.anthropic.com/en/docs/about-claude/models](https://docs.anthropic.com/en/docs/about-claude/models).

**Session stops unexpectedly**
Run `glowing-spoon status --session <id>` — check the attention queue for BLOCKING items that need your input, then `resume`.

---

## Project Layout

```
glowing-spoon/
  cli/           CLI commands (run, status, approve, reject, ...)
  engine/        Orchestration (session-runner, agent-pm, quality-gate, ...)
  agents/        Specialist agents + skill files
  utils/         Claude API wrapper, cost tracker, workspace loader, ...
  store/         File-based session state
  defaults/      Agent PM system prompt (copied into every workspace on init)
  examples/      Seed workspaces (login-app demo)
  guardrails/    Builder documentation — architecture decisions and specs
                 (sme-agents.md covers integration/cost/compliance/pitch/teardown)
  .env.example   Copy to .env and add your API key
```

---

## Contributing

Spec-first: before writing code, open the relevant guardrails file and read it. The build order in `CLAUDE.md` is the canonical implementation guide.
