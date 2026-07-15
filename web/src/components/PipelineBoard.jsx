// The line: vertical stepper of stories, each expanding into its agent chain.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { deriveTimeline } from '../lib/deriveTimeline.js';
import { agentInfo } from '../lib/agents.js';
import { AgentAvatar } from './ui.jsx';

function NodeState({ status, retryCount }) {
  return (
    <span className={`chain-state ${status}`}>
      {retryCount > 0 && status !== 'done' && <span className="retry-badge">retry {retryCount}/2</span>}
      {status === 'running' && 'cooking'}
      {status === 'done' && '✓ done'}
      {status === 'blocked' && 'your call'}
      {status === 'failed' && 'needs help'}
      {status === 'todo' && 'waiting'}
    </span>
  );
}

function ChainNode({ node }) {
  if (node.hidden) return null;

  if (node.gate) {
    return (
      <div className="chain-node">
        <span className={`gate-node ${node.status}`} style={{ '--glow-color': 'rgba(255,182,72,0.4)' }}>
          {node.status === 'done' ? '✅' : '✋'}
        </span>
        <span className="chain-rail" />
        <span className="chain-label">
          Your checkpoint
          <span className="role">you review the story before the team continues</span>
        </span>
        <NodeState status={node.status} />
      </div>
    );
  }

  const info = agentInfo(node.agentId);
  return (
    <div className="chain-node">
      <AgentAvatar agentId={node.agentId} size="sm" running={node.status === 'running'} />
      <span className={`chain-rail ${node.status === 'done' ? 'done' : ''}`} />
      <span className="chain-label">
        {info.name}
        <span className="role">{info.role}</span>
      </span>
      <NodeState status={node.status} retryCount={node.retryCount} />
    </div>
  );
}

function StepCard({ step, expanded, onToggle }) {
  const numCls = step.status === 'done' ? 'done' : (step.status === 'running' || step.status === 'blocked' || step.status === 'failed') ? 'active' : '';
  const icon = step.kind === 'plan' ? '🗺️' : step.kind === 'report' ? '📊' : null;

  return (
    <motion.div layout className="panel story-card">
      <button className="story-head" onClick={onToggle} aria-expanded={expanded}>
        <span className={`story-num ${numCls}`}>
          {step.status === 'done' ? '✓' : icon ?? step.index + 1}
        </span>
        <span className="story-title">
          {step.title}
          {step.description && <div className="story-sub">{step.description}</div>}
        </span>
        <NodeState status={step.status === 'blocked' ? 'blocked' : step.status} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && step.nodes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="agent-chain">
              {step.nodes.map((node, i) => <ChainNode key={node.gate ? `gate-${i}` : node.agentId} node={node} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PipelineBoard({ session }) {
  const { steps } = deriveTimeline(session);
  const [userToggled, setUserToggled] = useState({});

  if (!session) return null;

  const autoExpandKey = (step) =>
    step.kind === 'story' ? `story-${step.index}` : step.kind;

  return (
    <div className="story-list">
      {steps.map((step) => {
        const key = autoExpandKey(step);
        const isActive = ['running', 'blocked', 'failed'].includes(step.status);
        const expanded = userToggled[key] ?? isActive;
        return (
          <StepCard
            key={key}
            step={step}
            expanded={Boolean(expanded && step.nodes)}
            onToggle={() => setUserToggled(t => ({ ...t, [key]: !(t[key] ?? isActive) }))}
          />
        );
      })}
    </div>
  );
}
