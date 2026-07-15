// Glowing Spoon web server — authenticated adapter over the file-based engine state.
// dotenv MUST load before any engine import: engine modules snapshot WORKSPACE_ROOT
// at import time.
import 'dotenv/config';

import path from 'path';
import express from 'express';
import { config } from './config.js';
import { authRouter } from './auth/routes.js';
import { requireAuth, requireJsonBody } from './auth/middleware.js';

const { projectsRouter } = await import('./routes/projects.js');
const { sessionsRouter } = await import('./routes/sessions.js');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // nginx sits in front on the VPS
app.use(express.json({ limit: '1mb' }));
app.use(requireJsonBody);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/sessions', requireAuth, sessionsRouter);

// Built SPA (web/dist). In dev, Vite serves the SPA and proxies /api here instead.
app.use(express.static(config.webDist));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(config.webDist, 'index.html'), (err) => {
    if (err) res.status(503).send('Web UI not built yet. Run: npm run web:build');
  });
});

// JSON errors for the API, never HTML stack traces.
app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`glowing-spoon web server listening on http://localhost:${config.port}`);
});
