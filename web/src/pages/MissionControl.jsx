// Mission Control — the kitchen floor for one project.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useSessionStream } from '../api/useSessionStream.js';
import { StatusPill, Modal, useToast } from '../components/ui.jsx';
import NowPlaying from '../components/NowPlaying.jsx';
import PipelineBoard from '../components/PipelineBoard.jsx';
import DecisionDock from '../components/DecisionDock.jsx';
import LiveLog from '../components/LiveLog.jsx';
import CostMeter from '../components/CostMeter.jsx';
import ConfettiManager from '../components/ConfettiManager.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import ThePass from '../components/ThePass.jsx';
import ExpoTicket from '../components/ExpoTicket.jsx';
import JourneyRail from '../components/JourneyRail.jsx';
import MissionClock from '../components/MissionClock.jsx';
import LaunchControl from '../components/LaunchControl.jsx';
import LaunchPad from '../components/LaunchPad.jsx';
import PrepStation from '../components/PrepStation.jsx';
import { deriveJourney } from '../lib/journey.js';

function StartModal({ open, onClose, projectId, onEditSpecs }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [budget, setBudget] = useState('5.00');
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noSpecs, setNoSpecs] = useState(false);
  const [drafting, setDrafting] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setNoSpecs(false);
    try {
      await api.post('/api/sessions/start', { projectId, budget: Number(budget), dryRun });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast('Burners on — the session is starting');
      onClose();
    } catch (err) {
      if (err.code === 'NO_SPECS') {
        setNoSpecs(true);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function draftStories() {
    setDrafting(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/generate-specs`);
      toast('Starter stories drafted into specs/stories.md');
      setNoSpecs(false);
      await start(); // specs exist now — go
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2>Fire up a session</h2>
      <p className="sub">The team plans first — nothing runs without your approval.</p>
      {error && <div className="form-error">{error}</div>}
      {noSpecs && (
        <div className="form-error" style={{ borderColor: 'rgba(255,182,72,0.45)', background: 'var(--glow-soft)', color: 'var(--text)' }}>
          <strong>No specs yet — the team has nothing to build from.</strong>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '6px 0 10px' }}>
            Without stories, the agents invent requirements and waste your budget.
            Draft starter stories from your product description, or write them yourself.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-glow btn-sm" disabled={drafting} onClick={draftStories}>
              {drafting ? 'Drafting…' : '✨ Draft stories from my description'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onEditSpecs(); }}>
              I’ll write them myself
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="budget">Cost budget (USD)</label>
        <input id="budget" type="number" min="0.5" step="0.5" value={budget} onChange={e => setBudget(e.target.value)} />
        <span className="hint">The session warns at 80% and stops at 100%.</span>
      </div>
      <div className="switch-row">
        <div>
          <div className="sw-label">Dry run</div>
          <div className="sw-sub">Rehearsal mode — no real AI calls, no cost. Great for a first tour.</div>
        </div>
        <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} style={{ width: 20, height: 20 }} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-glow" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : 'Start cooking'}
        </button>
      </div>
    </Modal>
  );
}

export default function MissionControl() {
  const { id: projectId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [startOpen, setStartOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}`),
    refetchInterval: 5000,
  });
  const project = projectData?.project;
  const sessionId = project?.session?.sessionId;

  // SSE keeps this query's cache fresh; polling is the fallback while disconnected.
  const { connected, logText, previewLogText } = useSessionStream(sessionId, projectId);
  const { data: sessionData } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get(`/api/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: connected ? false : 2500,
  });
  const session = sessionData?.session;

  // Same query key PreviewPanel uses — react-query dedupes the fetch.
  const { data: previewData } = useQuery({
    queryKey: ['preview', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/preview`),
    refetchInterval: 4000,
  });
  const hasPrototype = Boolean(previewData?.hasPrototype);
  const journey = deriveJourney(project, session ?? project?.session, {
    hasPrototype,
    previewStatus: previewData?.preview?.status ?? null,
    previewUrl: previewData?.preview?.url ?? null,
  });

  // Prep station (product/specs/vault editing, inline): null = collapsed.
  // Auto-open while the Describe or Specs journey step is what's next, so a
  // fresh project drops the PM straight into the right editor on this page.
  const [prepTab, setPrepTab] = useState(null);
  const nextKey = journey?.next?.key;
  useEffect(() => {
    if (nextKey === 'describe') setPrepTab(t => t ?? 'product');
    else if (nextKey === 'specs') setPrepTab(t => t ?? 'specs');
  }, [nextKey]);

  function openPrep(tab) {
    setPrepTab(tab);
    // Next frame — the expanded panel must exist before we can scroll to it.
    requestAnimationFrame(() => {
      document.getElementById('prep-station')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function assemble() {
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/assemble`);
      toast('Assembly session started — watch the pipeline');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function act(path, body, okMsg) {
    setBusy(true);
    try {
      await api.post(`/api/sessions/${sessionId}/${path}`, body);
      if (okMsg) toast(okMsg);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const canStart = !session || ['complete', 'stopped'].includes(session.status)
    ? !(session?.status === 'stopped') // stopped sessions resume instead
    : false;
  const showResume = session && session.status !== 'complete' && !session.running;
  const showStop = session && session.running;

  return (
    <main className="page">
      <ConfettiManager session={session} />

      <div className="page-head">
        <div>
          <h1>{project?.name ?? projectId}</h1>
          <p className="sub" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusPill session={session ?? project?.session} />
            <MissionClock session={session} />
            <span className="pid" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{projectId}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => openPrep('specs')}>📝 Edit specs</button>
          <Link to={`/projects/${projectId}/output`} className="btn btn-ghost">📦 Output</Link>
          <Link to={`/projects/${projectId}/history`} className="btn btn-ghost">🗂 History</Link>
          {showStop && (
            <button className="btn btn-danger-outline" disabled={busy} onClick={() => act('stop', {}, 'Stopping after the current step…')}>
              Stop
            </button>
          )}
          {showResume && (
            <button className="btn btn-glow" disabled={busy} onClick={() => act('resume', {}, 'Back to the stove — resuming')}>
              ▶ Resume
            </button>
          )}
          {canStart && !showResume && (
            <button className="btn btn-glow" onClick={() => setStartOpen(true)}>🔥 Start session</button>
          )}
        </div>
      </div>

      <JourneyRail journey={journey} projectId={projectId} onPrep={openPrep} />

      <div className="mission-grid">
        <div>
          <div style={{ marginBottom: 20 }}>
            <ExpoTicket
              journey={journey}
              projectId={projectId}
              busy={busy}
              onStart={() => setStartOpen(true)}
              onResume={() => act('resume', {}, 'Back to the stove — resuming')}
              onAssemble={assemble}
              onPrep={openPrep}
            />
          </div>
          <PrepStation
            projectId={projectId}
            running={Boolean(session?.running)}
            tab={prepTab}
            setTab={setPrepTab}
          />
          {session?.running && (
            <div style={{ marginBottom: 20 }}>
              <NowPlaying session={session} />
            </div>
          )}
          {session && <PipelineBoard session={session} />}
          {hasPrototype && (
            <div style={{ marginTop: 20 }}>
              <LaunchPad
                projectId={projectId}
                sessionRunning={Boolean(session?.running)}
                previewLogText={previewLogText}
              />
            </div>
          )}
        </div>
        <div className="mission-side">
          <ThePass projectId={projectId} />
          {session && <CostMeter session={session} />}
          <LaunchControl session={session} />
          <LiveLog logText={logText} connected={connected} />
          {sessionId && session?.status !== 'complete' && (
            <MessageComposer sessionId={sessionId} disabled={!session?.running} />
          )}
        </div>
      </div>

      <DecisionDock
        session={session}
        projectId={projectId}
        busy={busy}
        onApprove={() => act('approve', {}, 'Approved ✓')}
        onReject={(feedback) => act('reject', { feedback }, 'Feedback sent to the team')}
      />

      <StartModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        projectId={projectId}
        onEditSpecs={() => openPrep('specs')}
      />
    </main>
  );
}
