import Anthropic from '@anthropic-ai/sdk';
import { loadSelectiveVault } from './workspace.js';
import { estimateTokens, trimToFit } from './token-counter.js';
import { trackCost } from './cost-tracker.js';
import { config } from './config.js';
import * as out from './output.js';

const client = new Anthropic();

const MAX_TOKENS_OUT = 8096;
const CONTEXT_WINDOW = 180000;

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

// Canned dry-run responses per agentId — used when config.dryRun = true.
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
    // Simulate token usage for cost tracking
    await trackCost({
      sessionId, tenantId, projectId, agentId,
      model: AGENT_MODEL[agentId] ?? 'claude-sonnet-4-20250514',
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    return { content: [{ text }] };
  }

  const model = AGENT_MODEL[agentId] ?? 'claude-sonnet-4-20250514';
  const vaultNeeds = AGENT_CONTEXT_NEEDS[agentId] ?? ['guardrails', 'patterns'];
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
  const callParams = { model, max_tokens: MAX_TOKENS_OUT, system: finalSystem, messages };

  if (!stream) {
    const response = await client.messages.create(callParams);
    await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: response.usage });
    return response;
  }

  // Streaming
  const stream_ = client.messages.stream(callParams);
  stream_.on('text', (text) => out.chunk(text));
  stream_.on('message', async (finalMessage) => {
    out.chunkEnd();
    await trackCost({ sessionId, tenantId, projectId, agentId, model, usage: finalMessage.usage });
  });
  return stream_;
}
