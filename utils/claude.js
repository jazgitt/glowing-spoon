import { loadSelectiveVault } from './workspace.js';
import { estimateTokens, trimToFit } from './token-counter.js';
import { trackCost, checkBudgetBefore } from './cost-tracker.js';
import { config } from './config.js';
import * as out from './output.js';

const MAX_TOKENS_OUT = 8096;
const CONTEXT_WINDOW = 180_000;
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

// SECURITY: dotenv loads .env from the current directory, so a malicious .env in an
// untrusted repo could redirect API calls (and the Bearer key) to an attacker host.
// Require https for any override and warn loudly the first time it is used.
let baseUrlWarned = false;
function getBaseUrl() {
  const override = process.env.OPENROUTER_BASE_URL;
  if (!override || override === DEFAULT_BASE_URL) return DEFAULT_BASE_URL;

  let parsed;
  try {
    parsed = new URL(override);
  } catch {
    throw new Error(`OPENROUTER_BASE_URL is not a valid URL: ${override}`);
  }
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(`OPENROUTER_BASE_URL must use https (got ${override})`);
  }
  if (!baseUrlWarned) {
    out.warn(`OPENROUTER_BASE_URL overridden to ${override} — your API key will be sent to this host.`);
    baseUrlWarned = true;
  }
  return override;
}

// ---------------------------------------------------------------------------
// Model selection
//
// Two modes:
//  1. MODEL_POOL set (comma-separated OpenRouter model ids): ALL agents draw
//     from the pool round-robin. Rate-limited/unavailable models are skipped;
//     when every model is down, we wait with backoff and cycle again. Designed
//     for free-tier models that hit per-model rate limits.
//  2. MODEL_POOL unset: classic two-tier REASONING_MODEL / FAST_MODEL split.
// ---------------------------------------------------------------------------

// Agents that need multi-step reasoning use the reasoning model.
// Mechanical agents (scoring, routing, compression) use the fast model.
const REASONING_AGENTS = new Set(['agent-pm', 'spec-agent', 'dev-agent', 'integration-agent', 'review-agent', 'assembler-agent']);

function getModel(agentId) {
  return REASONING_AGENTS.has(agentId)
    ? (process.env.REASONING_MODEL || 'anthropic/claude-sonnet-4')
    : (process.env.FAST_MODEL     || 'anthropic/claude-haiku-4-5');
}

function getModelPool() {
  return (process.env.MODEL_POOL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// Statuses worth rotating past: rate limit (429), provider overload (5xx/529),
// timeouts (408), out of credits on a paid model (402 — a free model may still
// work), and model-not-found (404 — likely a typo for one pool entry).
// 400/401 are configuration errors: rotating won't help, fail fast.
const ROTATABLE_STATUS = new Set([402, 404, 408, 429, 500, 502, 503, 529]);

// Give up only after this long with every model failing (default 30 min).
const MODEL_RETRY_MAX_MS = parseInt(process.env.MODEL_RETRY_MAX_MS, 10) || 30 * 60 * 1000;

let poolCursor = 0;

// Tries each candidate model in round-robin order; on a full failed cycle,
// waits with exponential backoff and cycles again until MODEL_RETRY_MAX_MS.
// Returns { response, model } — the model that actually answered.
async function callWithRotation(agentId, system, messages, maxTokens) {
  const pool = getModelPool();
  const candidates = pool.length ? pool : [getModel(agentId)];
  const startedAt = Date.now();
  let waitMs = 15_000;

  for (;;) {
    let lastError;
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[(poolCursor + i) % candidates.length];
      try {
        const response = await callOpenRouter(model, system, messages, maxTokens);
        // Next call starts on the model AFTER the one that answered → round-robin.
        poolCursor = (poolCursor + i + 1) % candidates.length;
        return { response, model };
      } catch (err) {
        // undefined status = network error (DNS, reset) — worth rotating/retrying.
        const rotatable = err.status === undefined || ROTATABLE_STATUS.has(err.status);
        if (!rotatable) throw err;
        lastError = err;
        out.warn(`[models] ${model} unavailable (${err.status ?? 'network'}) — ` +
          (i < candidates.length - 1 ? 'trying next model in pool' : 'pool cycle exhausted'));
      }
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed + waitMs > MODEL_RETRY_MAX_MS) {
      throw new Error(`MODEL_POOL_EXHAUSTED: no model in [${candidates.join(', ')}] answered within ` +
        `${Math.round(MODEL_RETRY_MAX_MS / 60_000)} min. Last error: ${lastError?.message ?? 'unknown'}`);
    }
    out.warn(`[models] all ${candidates.length} model(s) failed — waiting ${Math.round(waitMs / 1000)}s, then trying again`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    waitMs = Math.min(waitMs * 2, 120_000);
  }
}

// ---------------------------------------------------------------------------
// Vault context needs per agent
// ---------------------------------------------------------------------------

export const AGENT_CONTEXT_NEEDS = {
  'agent-pm':           ['guardrails', 'patterns', 'architecture', 'decisions'],
  'spec-agent':         ['guardrails', 'patterns'],
  'dev-agent':          ['guardrails', 'patterns', 'stack'],
  'review-agent':       ['guardrails', 'patterns', 'architecture'],
  'qa-agent':           ['guardrails', 'patterns', 'stack'],
  'docs-agent':         ['guardrails', 'patterns'],
  'integration-agent':  ['guardrails', 'patterns', 'stack'],
  'cost-agent':         ['guardrails', 'patterns', 'stack'],
  'compliance-agent':   ['guardrails', 'patterns'],
  'pitch-agent':        ['guardrails', 'patterns'],
  'teardown-agent':     ['guardrails', 'patterns', 'stack'],
  'assembler-agent':    ['guardrails', 'patterns', 'stack'],
  'quality-scorer':     ['guardrails', 'patterns'],
  'skill-resolver':     [],
  'history-compressor': [],
};

// ---------------------------------------------------------------------------
// Dry-run canned responses
// ---------------------------------------------------------------------------

const DRY_RUN_RESPONSES = {
  'agent-pm': JSON.stringify({
    action: 'route',
    nextAgent: 'spec-agent',
    agentContext: 'Refine all stories and write acceptance criteria.',
    message: '[DRY RUN] Routing to spec-agent.',
    planSteps: [
      { step: 1, agent: 'spec-agent',    description: 'Refine stories and write acceptance criteria' },
      { step: 2, agent: 'dev-agent',     description: 'Implement components from refined spec' },
      { step: 3, agent: 'review-agent',  description: 'Code review pass' },
      { step: 4, agent: 'qa-agent',      description: 'Generate unit tests' },
      { step: 5, agent: 'docs-agent',    description: 'Generate component docs' },
    ],
    type: 'plan',
    stories: [
      { id: 'story-1', title: 'User Registration', description: 'User can register with email and password', complexity: 'M', agentSequence: ['spec-agent','dev-agent','review-agent','qa-agent','docs-agent'] },
      { id: 'story-2', title: 'User Login',         description: 'User can log in with email and password',  complexity: 'S', agentSequence: ['spec-agent','dev-agent','review-agent','qa-agent','docs-agent'] },
    ],
    sessionGoal: 'Build registration and login flows',
    totalStories: 2,
    remainingAfterSession: 0,
  }),

  'spec-agent': `// filepath: specs/refined-stories.md
# Refined Stories — DRY RUN

## Story 1: User Registration
As a new user I can register with email and password so that I can create an account.

Acceptance Criteria:
- Email validates format on blur
- Password min 8 characters, confirm must match
- Submit disabled until valid
- On success: account created, redirect to /login
- On failure: inline error shown

// filepath: specs/acceptance-criteria.md
# Acceptance Criteria — DRY RUN

STORY 1: Registration
  GIVEN valid fields WHEN I click Register THEN account created, redirected to /login
  GIVEN invalid email WHEN I blur email THEN format error shown inline`,

  'dev-agent': `// filepath: src/components/RegisterForm/RegisterForm.tsx
import React, { useState } from 'react';

interface RegisterFormProps {
  onSuccess: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      onSuccess();
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Registration form">
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={loading || !email || !password}>
        {loading ? 'Registering...' : 'Register'}
      </button>
    </form>
  );
};

export default RegisterForm;`,

  'review-agent': `## Code Review — DRY RUN

### Architecture Fit: PASS
Components follow the established pattern. No architectural violations.

### Code Quality: PASS
- TypeScript types present on all props
- Error handling present
- Loading states implemented

**Overall: PASS — recommend proceeding to QA**`,

  'qa-agent': `// filepath: tests/RegisterForm.test.tsx
import { render, screen } from '@testing-library/react';
import { RegisterForm } from '../src/components/RegisterForm/RegisterForm';

describe('RegisterForm', () => {
  it('renders email and password fields', () => {
    render(<RegisterForm onSuccess={jest.fn()} />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
  it('disables submit when fields empty', () => {
    render(<RegisterForm onSuccess={jest.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});`,

  'docs-agent': `// filepath: docs/components/RegisterForm.md
# RegisterForm

Registration form with email/password validation and loading state.

## Props
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| onSuccess | () => void | Yes | Called after successful registration |`,

  'quality-scorer': JSON.stringify({
    scores: { spec_compliance: 88, pattern_compliance: 85, guardrail_compliance: 100, completeness: 82 },
    overall: 87,
    passed: true,
    issues: [],
    suggestions: ['Consider adding more edge case handling'],
  }),

  'integration-agent': `// filepath: src/integrations/stripe/checkout.js
// DRY RUN — Stripe Checkout scaffold
// Setup: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env
export async function createCheckoutSession(priceId) {
  return { url: 'https://checkout.stripe.com/dry-run' };
}`,

  'cost-agent': `// filepath: report/run-cost.md
# Run-Cost Estimate — DRY RUN

| Users | Hosting | Database | Third-party | Total/mo |
|---|---|---|---|---|
| 100 | $0 | $0 | $5 | ~$5 |
| 1k | $7 | $15 | $25 | ~$47 |
| 10k | $25 | $50 | $180 | ~$255 |

Biggest lever: per-transaction payment fees.`,

  'compliance-agent': `// filepath: report/compliance-checklist.md
# Compliance Checklist — DRY RUN
> Guardrail checklist, not legal advice.

| Item | Status | Fix |
|---|---|---|
| Cookie consent | GAP | Add consent banner before analytics load |
| Card data in app code | PASS | Hosted checkout — out of PCI scope |
| Form labels | PASS | — |`,

  'pitch-agent': `// filepath: report/pitch-one-pager.md
# One-Pager — DRY RUN

**Problem:** Small teams lose customers to clunky signup flows.
**Solution:** A login and registration experience that just works.
**For:** Independent SaaS founders.
**Ask:** Try the demo — two minutes, no card.`,

  'teardown-agent': `// filepath: report/build-teardown.md
# Build Teardown — DRY RUN

| | Agency | Freelancer | This session |
|---|---|---|---|
| Cost | $12k–$20k | $4k–$8k | <$5 |
| Timeline | 4–6 weeks | 3–5 weeks | same day |

Gaps before first customer: monitoring, backups.`,

  'assembler-agent': `// filepath: package.json
{
  "name": "prototype",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "concurrently -n api,web \\"npm:dev:api\\" \\"npm:dev:web\\"",
    "dev:api": "tsx src/server/index.ts",
    "dev:web": "vite",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "express": "^4.19.0", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "tsx": "^4.16.0", "typescript": "^5.5.0", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.0", "concurrently": "^8.2.0" }
}

// filepath: src/server/index.ts
import express from 'express';
const app = express();
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true, dryRun: true }));
const port = Number(process.env.API_PORT) || 4000;
app.listen(port, () => console.log('[DRY RUN] API on :' + port));

// filepath: vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: { '/api': 'http://localhost:' + (process.env.API_PORT || 4000) },
  },
});

// filepath: index.html
<!doctype html>
<html><head><title>Prototype (dry run)</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>

// filepath: src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(<h1>Dry-run prototype</h1>);

// filepath: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "allowJs": true, "checkJs": false,
    "strict": false, "noEmit": true, "esModuleInterop": true, "skipLibCheck": true
  },
  "include": ["src"]
}

// filepath: README.md
# Prototype — DRY RUN
Placeholder assembly. Run a real (non-dry-run) session to generate working glue.`,

  'skill-resolver': JSON.stringify({ skills: ['refine-story', 'write-acceptance-criteria'] }),

  'history-compressor': '[DRY RUN] Compressed session history. Key decisions: routing spec-agent → dev-agent. Plan approved.',
};

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

async function callOpenRouter(model, system, messages, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set. Add it to your .env file.');

  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/jazgitt/glowing-spoon',
      'X-Title': 'Glowing Spoon',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  if (!data.choices?.length) throw new Error(`OpenRouter: no choices in response (model=${model})`);
  if (!data.usage)           throw new Error(`OpenRouter: missing usage in response (model=${model})`);

  return {
    content: [{ text: data.choices[0].message?.content ?? '' }],
    usage: {
      input_tokens:  data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function callClaude({
  systemPrompt,
  userPrompt,
  agentId,
  tenantId,
  projectId,
  sessionId,
  conversationHistory,
  specs,
  dryRun,
  maxTokens = MAX_TOKENS_OUT,
}) {
  const isDryRun = dryRun ?? config.dryRun;

  if (isDryRun) {
    const text = DRY_RUN_RESPONSES[agentId] ?? `[DRY RUN] ${agentId} response placeholder.`;
    out.log(agentId, `[dry-run] skipping API call`);
    await trackCost({ sessionId, tenantId, projectId, agentId, model: getModel(agentId), usage: { input_tokens: 1000, output_tokens: 500 } });
    return { content: [{ text }] };
  }

  const declaredNeeds = AGENT_CONTEXT_NEEDS[agentId];
  if (declaredNeeds === undefined) {
    out.warn(`[claude] unknown agentId "${agentId}" — using default vault needs`);
  }
  const vaultNeeds = declaredNeeds ?? ['guardrails', 'patterns'];

  const vault = tenantId && projectId
    ? await loadSelectiveVault(tenantId, projectId, vaultNeeds)
    : '';

  const fullSystem = vault
    ? `═══ CONTEXT VAULT ═══\n${vault}\n\n═══ AGENT INSTRUCTIONS ═══\n${systemPrompt}`.trim()
    : systemPrompt.trim();

  const finalSystem = fullSystem + (specs ? `\n\n═══ RELEVANT SPECS ═══\n${specs}` : '');

  let history = conversationHistory || [];
  const totalEstimate = estimateTokens(finalSystem)
    + estimateTokens(JSON.stringify(history))
    + estimateTokens(userPrompt)
    + maxTokens;

  if (totalEstimate > CONTEXT_WINDOW) {
    history = trimToFit({
      history,
      budget: CONTEXT_WINDOW - estimateTokens(finalSystem) - estimateTokens(userPrompt) - maxTokens,
    });
  }

  const messages = [...history, { role: 'user', content: userPrompt }];

  // HIGH-2: pre-call budget check before any spend. With a pool, check against
  // the model the round-robin will try first.
  const pool = getModelPool();
  const budgetModel = pool.length ? pool[poolCursor % pool.length] : getModel(agentId);
  const estimatedInputTokens = estimateTokens(finalSystem) + estimateTokens(JSON.stringify(messages));
  await checkBudgetBefore({ tenantId, projectId, model: budgetModel, estimatedInputTokens });

  const { response, model } = await callWithRotation(agentId, finalSystem, messages, maxTokens);
  await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: response.usage });
  return response;
}
