// Live session updates over SSE, written straight into the react-query cache so
// every component reads one source of truth. Falls back to REST polling (the
// ['session', id] query's refetchInterval) while the stream is down.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const MAX_LOG_CHARS = 200_000;

export function useSessionStream(sessionId, projectId) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [logText, setLogText] = useState('');
  const [previewLogText, setPreviewLogText] = useState('');
  const backfilled = useRef(false);

  const appendLog = useCallback((chunk) => {
    setLogText(prev => {
      const next = prev + chunk;
      return next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next;
    });
  }, []);

  const appendPreviewLog = useCallback((chunk) => {
    setPreviewLogText(prev => {
      const next = prev + chunk;
      return next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next;
    });
  }, []);

  // One-time history backfill; the SSE stream only carries lines after connect.
  useEffect(() => {
    if (!sessionId || backfilled.current) return;
    backfilled.current = true;
    fetch(`/api/sessions/${sessionId}/log?offset=0`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.content) setLogText(d.content); })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const es = new EventSource(`/api/sessions/${sessionId}/events`);

    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false)); // EventSource auto-reconnects

    es.addEventListener('state', (e) => {
      try {
        const session = JSON.parse(e.data);
        queryClient.setQueryData(['session', sessionId], { session });
      } catch { /* malformed frame */ }
    });

    es.addEventListener('pending', (e) => {
      try {
        const { pending } = JSON.parse(e.data);
        queryClient.setQueryData(['session', sessionId], (old) =>
          old ? { session: { ...old.session, pending } } : old);
      } catch { /* malformed frame */ }
    });

    es.addEventListener('log', (e) => {
      try {
        const { chunk } = JSON.parse(e.data);
        if (chunk) appendLog(chunk);
      } catch { /* malformed frame */ }
    });

    es.addEventListener('preview', (e) => {
      try {
        const { preview } = JSON.parse(e.data);
        if (projectId) {
          queryClient.setQueryData(['preview', projectId], (old) =>
            ({ ...(old ?? {}), preview }));
        }
      } catch { /* malformed frame */ }
    });

    es.addEventListener('preview-log', (e) => {
      try {
        const { chunk } = JSON.parse(e.data);
        if (chunk) appendPreviewLog(chunk);
      } catch { /* malformed frame */ }
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId, projectId, queryClient, appendLog, appendPreviewLog]);

  return { connected, logText, previewLogText };
}
