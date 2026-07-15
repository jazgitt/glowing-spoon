// Small shared primitives: avatar, status pill, modal, toasts.
import { createContext, useCallback, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { agentInfo } from '../lib/agents.js';

// ── Agent avatar badge ───────────────────────────────────────
export function AgentAvatar({ agentId, size = 'md', running = false }) {
  const info = agentInfo(agentId);
  const style = {
    '--av-hi': `${info.color}55`,
    '--av-lo': `${info.color}18`,
    '--av-ring': running ? info.color : `${info.color}66`,
    '--glow-color': `${info.color}55`,
  };
  const badge = (
    <span className={`avatar size-${size} ${running ? 'glowing' : ''}`} style={style} title={`${info.name} · ${info.role}`}>
      {info.emoji}
    </span>
  );
  if (!running) return badge;
  return (
    <motion.span
      style={{ display: 'inline-flex' }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      {badge}
    </motion.span>
  );
}

// ── Session status pill ──────────────────────────────────────
export function StatusPill({ session }) {
  if (!session) return <span className="pill pill-idle"><span className="pill-dot" />No session yet</span>;
  const { status, running, runnerDead, pendingType } = session;
  if (pendingType || session.pending) {
    return <span className="pill pill-blocked"><span className="pill-dot" />Needs your decision</span>;
  }
  if (status === 'complete') return <span className="pill pill-complete"><span className="pill-dot" />Complete</span>;
  if (runnerDead) return <span className="pill pill-crashed"><span className="pill-dot" />Crashed — resume it</span>;
  if (running) return <span className="pill pill-running"><span className="pill-dot" />Cooking</span>;
  if (status === 'stopped') return <span className="pill pill-stopped"><span className="pill-dot" />Paused</span>;
  return <span className="pill pill-idle"><span className="pill-dot" />{status}</span>;
}

// ── Modal ────────────────────────────────────────────────────
export function Modal({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-back"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
          <motion.div
            className="panel modal"
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Toasts ───────────────────────────────────────────────────
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              className={`toast ${t.kind}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
