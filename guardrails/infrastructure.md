# Infrastructure: Streamer & SSE

## Streamer (utils/streamer.js)

EventEmitter MVP behind a stable interface — Phase 2 can swap in Redis without touching any caller.

```javascript
import { EventEmitter } from "events";

const bus = new EventEmitter();
bus.setMaxListeners(100);  // one per open SSE connection

function key(tenantId, sessionId) { return `${tenantId}:${sessionId}`; }

export function emit(tenantId, sessionId, event) {
  bus.emit(key(tenantId, sessionId), event);
}

export function subscribe(tenantId, sessionId, cb) {
  const k = key(tenantId, sessionId);
  bus.on(k, cb);
  return () => bus.off(k, cb);  // caller holds this and invokes on SSE close
}

// Phase 2 swap: replace emit/subscribe bodies with Redis pub/sub.
// Interface stays identical — zero callers change.
```

## SSE Endpoint (server/routes/events.js)

Every SSE connection is validated against tenantId. Cross-tenant leakage is structurally impossible.

```javascript
router.get('/events/:sessionId', authMiddleware, async (req, res) => {
  const { tenantId } = req.tenant;
  const { sessionId } = req.params;

  const session = await store.getSession(sessionId);
  if (!session || session.tenantId !== tenantId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const unsubscribe = streamer.subscribe(tenantId, sessionId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', unsubscribe);
});
```
