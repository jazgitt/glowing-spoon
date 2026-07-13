# SME Agents — Integration + MVP Report

Read `CLAUDE.md` first. These five agents position Glowing Spoon as a fast MVP builder
for small and medium businesses: the pipeline doesn't just ship code, it ships a
sellable, priced, compliance-checked MVP.

---

## The Two Kinds

**Pipeline agent** (runs inside a story, quality-gated):

| Agent | Model | Gate | Runs |
|---|---|---|---|
| `integration-agent` | reasoning | syntax + quality gate | after dev checkpoint, before review — only when triggered |

**Report agents** (run once per session, after all stories — the "MVP Report" phase):

| Agent | Model | Gate | Output |
|---|---|---|---|
| `cost-agent` | fast | none | `report/run-cost.md` |
| `compliance-agent` | fast | none | `report/compliance-checklist.md` |
| `pitch-agent` | fast | none | `report/pitch-one-pager.md`, `report/demo-script.md`, `report/pricing-draft.md` |
| `teardown-agent` | fast | none | `report/build-teardown.md` |

Report agents return `gateResult: null`, which `runAgentWithRetry` treats as pass.
They are informational deliverables — gating them would double their cost (principle 10)
for output the PM reads and judges directly anyway (principle 8).

---

## integration-agent

- **Trigger:** `needsIntegration(spec)` — a keyword scan for explicit third-party
  signals (stripe, oauth, twilio, webhook, ...). Generic words like "email" are
  deliberately excluded so the agent doesn't fire on every story. Zero extra cost
  when a story has no integrations.
- **Position:** inside `runReviewQaDocs`, before review-agent. Its output is appended
  to the code fed to review/qa/docs, so integration code gets reviewed, tested, and
  documented like dev output.
- **Non-negotiables baked into skills:** hosted checkout only (PCI), secrets from env
  vars only, webhook signature verification, `.env.example` entries for every new key.
- **Output path:** `src/integrations/{provider}/...`

## MVP Report phase

- Runs in `runMvpReport(session)` after the story loop, before `Session Complete`.
- Input is `readOutputDigest()` — a capped (~40k chars) walk of `output/` excluding
  `output/report/` (reports never feed back into reports). Prose files get 4k chars
  each, code files 1.5k.
- If `output/` is empty (all stories escalated), the phase logs a warning and skips.
- `teardown-agent` additionally receives the session's actual dollar cost so the
  agency/freelancer comparison uses real numbers.
- Order: cost → compliance → pitch → teardown. The digest is built once, before the
  phase, so every report agent sees the same input — ordering is for log readability
  only, not data flow.

---

## Failure behavior

- `integration-agent` failures follow dev-agent semantics: syntax retry ×2, quality
  retry ×2, then BLOCKING escalation to the attention queue.
- Report agent failures never block session completion in spirit — but they run through
  `runAgentWithRetry` for consistent cost/status tracking. With `gateResult: null`
  they pass on first attempt; only a thrown error (budget, API) stops them, and budget
  exhaustion stopping a report is correct behavior (principle 10).

## What NOT to do

- Do not add per-provider agents (stripe-agent, twilio-agent). Providers are skills
  under `integration-agent` — one agent, growing skill library.
- Do not gate report agents or route them to the reasoning model.
- Do not let compliance-agent claim legal authority; every report header states it is
  a guardrail checklist, not legal advice.
- Do not feed `output/report/` back into any digest.
