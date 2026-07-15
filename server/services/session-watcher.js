// Per-project watcher: polls .session.json/.pending.json mtimes (1s) and tails
// session.log + events.jsonl by byte offset. Stat-polling, not fs.watch — reliable
// on both Windows (dev) and Linux (VPS). Watchers are refcounted by subscriber.
import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from '../../utils/workspace.js';
import { getSession, getPending } from '../../store/file-store.js';
import { publicSession } from './session-view.js';

const POLL_INTERVAL_MS = 1000;
const MAX_CHUNK = 256 * 1024;

const watchers = new Map(); // "tenant/project" → watcher

async function statMtime(file) {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return null; // file absent
  }
}

async function readFrom(file, offset) {
  try {
    const stat = await fs.stat(file);
    if (stat.size < offset) offset = 0; // file truncated/rotated — restart
    if (stat.size === offset) return { offset, chunk: '' };
    const handle = await fs.open(file, 'r');
    try {
      const length = Math.min(stat.size - offset, MAX_CHUNK);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      return { offset: offset + length, chunk: buffer.toString('utf8') };
    } finally {
      await handle.close();
    }
  } catch {
    return { offset, chunk: '' };
  }
}

function createWatcher(tenantId, projectId) {
  const ws = getWorkspacePath(tenantId, projectId);
  const sessionFile = path.join(ws, '.session.json');
  const pendingFile = path.join(ws, '.pending.json');
  const logFile = path.join(ws, 'session.log');
  const eventsFile = path.join(ws, 'events.jsonl');

  const watcher = {
    subscribers: new Set(),
    timer: null,
    state: { sessionMtime: 0, pendingMtime: undefined, logOffset: null, eventsOffset: null },
  };

  function broadcast(event, data) {
    for (const send of watcher.subscribers) send(event, data);
  }

  async function tick() {
    const s = watcher.state;

    // Session state — emit full public view on any change.
    const sessionMtime = await statMtime(sessionFile);
    if (sessionMtime !== null && sessionMtime !== s.sessionMtime) {
      s.sessionMtime = sessionMtime;
      const session = await getSession(tenantId, projectId);
      if (session) {
        broadcast('state', publicSession(session, await getPending(tenantId, projectId)));
      }
    }

    // Pending block — appearance, change, or resolution all matter.
    const pendingMtime = await statMtime(pendingFile);
    if (pendingMtime !== s.pendingMtime) {
      s.pendingMtime = pendingMtime;
      broadcast('pending', { pending: await getPending(tenantId, projectId) });
    }

    // Raw log tail. First tick starts at end-of-file: clients backfill history
    // through GET /api/sessions/:id/log and only need new lines from the stream.
    if (s.logOffset === null) {
      s.logOffset = (await statMtime(logFile)) === null ? 0 : (await fs.stat(logFile).catch(() => ({ size: 0 }))).size;
    } else {
      const { offset, chunk } = await readFrom(logFile, s.logOffset);
      s.logOffset = offset;
      if (chunk) broadcast('log', { chunk });
    }

    // Structured JSONL events from the engine's output emitter.
    if (s.eventsOffset === null) {
      s.eventsOffset = (await statMtime(eventsFile)) === null ? 0 : (await fs.stat(eventsFile).catch(() => ({ size: 0 }))).size;
    } else {
      const { offset, chunk } = await readFrom(eventsFile, s.eventsOffset);
      s.eventsOffset = offset;
      if (chunk) {
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue;
          try {
            broadcast('agent-event', JSON.parse(line));
          } catch { /* partial line at chunk boundary — will complete next tick */ }
        }
      }
    }
  }

  watcher.start = () => {
    watcher.timer = setInterval(() => {
      tick().catch(() => { /* keep the watcher alive through transient fs errors */ });
    }, POLL_INTERVAL_MS);
  };
  watcher.stop = () => clearInterval(watcher.timer);

  return watcher;
}

// Subscribe to a project's live events. `send(event, data)` is called per event.
// Returns an unsubscribe function; the watcher stops when the last subscriber leaves.
export function subscribe(tenantId, projectId, send) {
  const key = `${tenantId}/${projectId}`;
  let watcher = watchers.get(key);
  if (!watcher) {
    watcher = createWatcher(tenantId, projectId);
    watchers.set(key, watcher);
    watcher.start();
  }
  watcher.subscribers.add(send);

  return () => {
    watcher.subscribers.delete(send);
    if (watcher.subscribers.size === 0) {
      watcher.stop();
      watchers.delete(key);
    }
  };
}
