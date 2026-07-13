import { loadSelectiveVault } from './workspace.js';
import { estimateTokens, trimToFit } from './token-counter.js';
import { trackCost, checkBudgetBefore } from './cost-tracker.js';
import { config } from './config.js';
import * as out from './output.js';

const MAX_TOKENS_OUT = 8096;
const CONTEXT_WINDOW = 180_000;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

// ---------------------------------------------------------------------------
// Model selection — two tiers, overridable via env
// ---------------------------------------------------------------------------

// Agents that need multi-step reasoning use the reasoning model.
// Mechanical agents (scoring, routing, compression) use the fast model.
const REASONING_AGENTS = new Set(['agent-pm', 'spec-agent', 'dev-agent', 'integration-agent', 'review-agent']);

function getModel(agentId) {
  return REASONING_AGENTS.has(agentId)
    ? (process.env.REASONING_MODEL || 'anthropic/claude-sonnet-4')
    : (process.env.FAST_MODEL     || 'anthropic/claude-haiku-4-5');
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

  'skill-resolver': JSON.stringify({ skills: ['refine-story', 'write-acceptance-criteria'] }),

  'history-compressor': '[DRY RUN] Compressed session history. Key decisions: routing spec-agent → dev-agent. Plan approved.',
};

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

async function callOpenRouter(model, system, messages, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set. Add it to your .env file.');

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
}) {
  const isDryRun = dryRun ?? config.dryRun;
  const model = getModel(agentId);

  if (isDryRun) {
    const text = DRY_RUN_RESPONSES[agentId] ?? `[DRY RUN] ${agentId} response placeholder.`;
    out.log(agentId, `[dry-run] skipping API call`);
    await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: { input_tokens: 1000, output_tokens: 500 } });
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
    + MAX_TOKENS_OUT;

  if (totalEstimate > CONTEXT_WINDOW) {
    history = trimToFit({
      history,
      budget: CONTEXT_WINDOW - estimateTokens(finalSystem) - estimateTokens(userPrompt) - MAX_TOKENS_OUT,
    });
  }

  const messages = [...history, { role: 'user', content: userPrompt }];

  // HIGH-2: pre-call budget check before any spend
  const estimatedInputTokens = estimateTokens(finalSystem) + estimateTokens(JSON.stringify(messages));
  await checkBudgetBefore({ tenantId, projectId, model, estimatedInputTokens });

  const response = await callOpenRouter(model, finalSystem, messages, MAX_TOKENS_OUT);
  await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: response.usage });
  return response;
}
