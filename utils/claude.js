import Anthropic from '@anthropic-ai/sdk';
import { loadSelectiveVault } from './workspace.js';
import { estimateTokens, trimToFit } from './token-counter.js';
import { trackCost } from './cost-tracker.js';
import { config } from './config.js';
import * as out from './output.js';

const MAX_TOKENS_OUT = 8096;
const CONTEXT_WINDOW = 180000;

// HTTP status codes that indicate a key problem — trigger fallback to next key
const RETRYABLE_STATUSES = new Set([401, 403, 429]);

// ---------------------------------------------------------------------------
// Key loading (lazy — deferred until first callClaude to ensure dotenv has run)
// ---------------------------------------------------------------------------

// Scans API_KEY_1 through API_KEY_10. Skips missing slots (no gap-stop).
// Falls back to ANTHROPIC_API_KEY for backwards compatibility.
function loadApiKeys() {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`API_KEY_${i}`];
    if (key) {
      const provider = key.startsWith('sk-or-') ? 'openrouter' : 'anthropic';
      keys.push({ key, provider });
    }
  }
  if (keys.length === 0 && process.env.ANTHROPIC_API_KEY) {
    keys.push({ key: process.env.ANTHROPIC_API_KEY, provider: 'anthropic' });
  }
  return keys;
}

let _apiKeys = null;
function getApiKeys() {
  if (!_apiKeys) _apiKeys = loadApiKeys();
  return _apiKeys;
}

// ---------------------------------------------------------------------------
// Anthropic client cache — one client per key, built on first use
// ---------------------------------------------------------------------------

const _anthropicClients = new Map();

function getAnthropicClient(key) {
  if (!_anthropicClients.has(key)) {
    _anthropicClients.set(key, new Anthropic({ apiKey: key }));
  }
  return _anthropicClients.get(key);
}

// ---------------------------------------------------------------------------
// Model name mapping
// ---------------------------------------------------------------------------

export const AGENT_CONTEXT_NEEDS = {
  'agent-pm':           ['guardrails', 'patterns', 'architecture', 'decisions'],
  'spec-agent':         ['guardrails', 'patterns'],
  'dev-agent':          ['guardrails', 'patterns', 'stack'],
  'review-agent':       ['guardrails', 'patterns', 'architecture'],
  'qa-agent':           ['guardrails', 'patterns', 'stack'],
  'docs-agent':         ['guardrails', 'patterns'],
  'quality-scorer':     ['guardrails', 'patterns'],
  'skill-resolver':     [],
  'history-compressor': [],
};

export const AGENT_MODEL = {
  'agent-pm':           'claude-sonnet-4-20250514',
  'spec-agent':         'claude-sonnet-4-20250514',
  'dev-agent':          'claude-sonnet-4-20250514',
  'review-agent':       'claude-sonnet-4-20250514',
  'quality-scorer':     'claude-haiku-4-5-20251001',
  'skill-resolver':     'claude-haiku-4-5-20251001',
  'history-compressor': 'claude-haiku-4-5-20251001',
  'qa-agent':           'claude-haiku-4-5-20251001',
  'docs-agent':         'claude-haiku-4-5-20251001',
};

// Lazy-read: env vars may not be available at module-load time (before dotenv)
let _openRouterModelMap = null;
function getOpenRouterModel(anthropicModel) {
  if (!_openRouterModelMap) {
    _openRouterModelMap = {
      'claude-sonnet-4-20250514':  process.env.OPENROUTER_SONNET_MODEL || 'anthropic/claude-sonnet-4',
      'claude-haiku-4-5-20251001': process.env.OPENROUTER_HAIKU_MODEL  || 'anthropic/claude-haiku-4-5',
    };
  }
  return _openRouterModelMap[anthropicModel] ?? anthropicModel;
}

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
      { step: 1, agent: 'spec-agent', description: 'Refine stories and write acceptance criteria' },
      { step: 2, agent: 'dev-agent',  description: 'Implement components from refined spec' },
      { step: 3, agent: 'review-agent', description: 'Code review pass' },
      { step: 4, agent: 'qa-agent',   description: 'Generate unit tests' },
      { step: 5, agent: 'docs-agent', description: 'Generate component docs' },
    ],
  }),
  'spec-agent': `// filepath: specs/refined-stories.md
# Refined Stories — DRY RUN

## Story 1: User Login
As a user I can log in with email and password so that I can access my account.

Acceptance Criteria:
- Email validates format on blur
- Password required, min 8 characters
- Submit disabled until both fields valid
- On success: token stored, redirect to /dashboard
- On failure: "Invalid email or password" shown inline
- Loading state shown during API call

// filepath: specs/acceptance-criteria.md
# Acceptance Criteria — DRY RUN

STORY 1: Login
  GIVEN valid credentials WHEN I click Sign In THEN redirected to /dashboard
  GIVEN invalid credentials WHEN I click Sign In THEN error shown inline`,

  'dev-agent': `// filepath: src/components/LoginForm/LoginForm.tsx
import React, { useState } from 'react';

interface LoginFormProps {
  onSuccess: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // API call here
      onSuccess();
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Login form">
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={loading || !email || !password}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
};

export default LoginForm;`,

  'review-agent': `## Code Review — DRY RUN

### Architecture Fit: PASS
Components follow the established pattern. No architectural violations.

### Code Quality: PASS
- TypeScript types present on all props
- Error handling present
- Loading states implemented

### Pattern Compliance: PASS
- Named + default exports on all files
- Functional components only
- No class components

**Overall: PASS — recommend proceeding to QA**`,

  'qa-agent': `// filepath: tests/LoginForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from '../src/components/LoginForm/LoginForm';

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    render(<LoginForm onSuccess={jest.fn()} />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('disables submit when fields empty', () => {
    render(<LoginForm onSuccess={jest.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});`,

  'docs-agent': `// filepath: docs/components/LoginForm.md
# LoginForm

Login form component with email/password validation and loading state.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| onSuccess | () => void | Yes | Called after successful login |

## Usage

\`\`\`tsx
<LoginForm onSuccess={() => navigate('/dashboard')} />
\`\`\``,

  'quality-scorer': JSON.stringify({
    scores: { spec_compliance: 88, pattern_compliance: 85, guardrail_compliance: 100, completeness: 82 },
    overall: 87,
    passed: true,
    issues: [],
    suggestions: ['Consider adding more edge case handling'],
  }),

  'skill-resolver': JSON.stringify({ skills: ['refine-story', 'write-acceptance-criteria'] }),

  'history-compressor': '[DRY RUN] Compressed session history. Key decisions: routing spec-agent → dev-agent. Plan approved.',
};

// ---------------------------------------------------------------------------
// Provider call helpers
// ---------------------------------------------------------------------------

// Anthropic SDK — non-streaming (uses cached client per key)
async function callAnthropicSync(key, model, system, messages, maxTokens) {
  return getAnthropicClient(key).messages.create({ model, max_tokens: maxTokens, system, messages });
}

// Anthropic SDK — streaming (returns stream handle; caller attaches listeners)
function callAnthropicStream(key, model, system, messages, maxTokens) {
  return getAnthropicClient(key).messages.stream({ model, max_tokens: maxTokens, system, messages });
}

// OpenRouter — non-streaming (OpenAI-compatible REST API via native fetch)
async function callOpenRouter(key, model, system, messages, maxTokens) {
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const orModel = getOpenRouterModel(model);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://glowing-spoon.local',
      'X-Title': 'Glowing Spoon',
    },
    body: JSON.stringify({
      model: orModel,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = new Error(`OpenRouter HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  if (!data.choices?.length) {
    throw new Error(`OpenRouter: no choices in response (model=${orModel})`);
  }
  if (!data.usage) {
    throw new Error(`OpenRouter: missing usage object in response (model=${orModel})`);
  }

  // Normalize to Anthropic response shape so callers need no provider awareness
  return {
    content: [{ text: data.choices[0].message?.content ?? '' }],
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Fallback orchestration
// ---------------------------------------------------------------------------

// Try each key in order. Retries on 429/401/403 (key problem).
// Any other error is rethrown immediately (not a key issue).
async function callWithFallback(model, system, messages, maxTokens) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('No API keys configured. Set API_KEY_1 or ANTHROPIC_API_KEY in .env');
  }

  let lastErr;
  for (const { key, provider } of keys) {
    try {
      if (provider === 'openrouter') {
        return await callOpenRouter(key, model, system, messages, maxTokens);
      }
      return await callAnthropicSync(key, model, system, messages, maxTokens);
    } catch (err) {
      const status = err.status ?? err.error?.status;
      if (RETRYABLE_STATUSES.has(status)) {
        out.warn(`[${provider}] key failed with ${status} — trying next key`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('All API keys exhausted');
}

// For streaming: use the first Anthropic key (streaming is Anthropic-only).
function findFirstAnthropicKey() {
  return getApiKeys().find(k => k.provider === 'anthropic')?.key ?? null;
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
  stream = false,
  dryRun,
}) {
  const isDryRun = dryRun ?? config.dryRun;

  if (isDryRun) {
    const text = DRY_RUN_RESPONSES[agentId] ?? `[DRY RUN] ${agentId} response placeholder.`;
    out.log(agentId, `[dry-run] skipping API call`);
    await trackCost({
      sessionId, tenantId, projectId, agentId,
      model: AGENT_MODEL[agentId] ?? 'claude-sonnet-4-20250514',
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    return { content: [{ text }] };
  }

  const model = AGENT_MODEL[agentId] ?? 'claude-sonnet-4-20250514';

  const declaredNeeds = AGENT_CONTEXT_NEEDS[agentId];
  if (declaredNeeds === undefined) {
    out.warn(`[claude] unknown agentId "${agentId}" — no vault needs declared. Using defaults.`);
  }
  const vaultNeeds = declaredNeeds ?? ['guardrails', 'patterns'];

  const vault = tenantId && projectId
    ? await loadSelectiveVault(tenantId, projectId, vaultNeeds)
    : '';

  const fullSystem = vault
    ? `═══ CONTEXT VAULT ═══\n${vault}\n\n═══ AGENT INSTRUCTIONS ═══\n${systemPrompt}`.trim()
    : systemPrompt.trim();

  const specSection = specs ? `\n\n═══ RELEVANT SPECS ═══\n${specs}` : '';
  const finalSystem = fullSystem + specSection;

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

  // Streaming: Anthropic keys only, first available, no key fallback mid-stream
  if (stream) {
    const anthropicKey = findFirstAnthropicKey();
    if (!anthropicKey) throw new Error('Streaming requires an Anthropic key (sk-ant-*). No Anthropic key found in API_KEY_N list.');
    const stream_ = callAnthropicStream(anthropicKey, model, finalSystem, messages, MAX_TOKENS_OUT);
    stream_.on('text', (chunk) => out.chunk(chunk));
    stream_.on('error', (err) => out.warn(`[stream] error mid-flight: ${err.message}`));
    stream_.on('message', async (finalMessage) => {
      out.chunkEnd();
      try {
        await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: finalMessage.usage });
      } catch (e) {
        out.blocked(e.message);
      }
    });
    return stream_;
  }

  // Non-streaming: full key fallback
  const response = await callWithFallback(model, finalSystem, messages, MAX_TOKENS_OUT);
  await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: response.usage });
  return response;
}
