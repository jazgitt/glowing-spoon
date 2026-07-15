# Deploying the Glowing Spoon Web UI on a VPS

The web UI is a single Node process: an Express server (`server/index.js`) that
serves the built React app and exposes an authenticated API over the same
file-based engine state the CLI uses. CLI and web UI can be used side by side.

## 1. Requirements

- Linux VPS with Node.js >= 20
- A domain (recommended) with nginx or Caddy for TLS — the login cookie is
  marked `Secure` in production, so HTTPS is effectively required

## 2. Install

```bash
git clone <your-repo> /opt/glowing-spoon
cd /opt/glowing-spoon
npm install
npm --prefix web install
npm run web:build          # builds web/dist, served by the server
```

## 3. Configure

```bash
cp .env.example .env
```

Set at minimum:

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | your key (omit if you only run dry-run sessions) |
| `WORKSPACE_ROOT` | absolute path, e.g. `/opt/glowing-spoon/workspaces` |
| `SESSION_SECRET` | 32+ random chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | `3808` (or your choice) |
| `COOKIE_SECURE` | `true` (you are behind TLS) |
| `POLL_TIMEOUT_MS` | `86400000` (sessions wait up to 24h for your decision, then stop resumably) |

`NODE_ENV=production` (set in the systemd unit below) makes `SESSION_SECRET`
mandatory and cookies `Secure`.

## 4. First run

```bash
npm run serve
```

Open the site — the first account registered becomes the **admin**. After
that, registration requires a single-use invite link that admins mint on the
Team page. Do this immediately so a stranger can't claim the admin seat.

## 5. Run it as a service (systemd)

`/etc/systemd/system/glowing-spoon.service`:

```ini
[Unit]
Description=Glowing Spoon web UI
After=network.target

[Service]
Type=simple
User=spoon
WorkingDirectory=/opt/glowing-spoon
EnvironmentFile=/opt/glowing-spoon/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin spoon
sudo chown -R spoon:spoon /opt/glowing-spoon
sudo systemctl enable --now glowing-spoon
```

Prefer PM2? `pm2 start server/index.js --name glowing-spoon` works too.

Note: agent sessions run as **detached child processes** — restarting the web
server does not kill a running session; the UI reattaches to it.

## 6. nginx in front (TLS + SSE)

```nginx
server {
    listen 443 ssl http2;
    server_name spoon.example.com;
    # ssl_certificate ... (certbot etc.)

    location / {
        proxy_pass http://127.0.0.1:3808;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Server-Sent Events (live log/state stream)
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

The server already sends `X-Accel-Buffering: no` on the SSE endpoint and sends
a heartbeat every 15 s, so the stream survives proxies.

## 7. Updating

```bash
cd /opt/glowing-spoon
git pull
npm install && npm --prefix web install
npm run web:build
sudo systemctl restart glowing-spoon
```

## Security model (Phase 1 reality check)

- The engine itself is single-tenant (`local`) — **every account sees every
  project**. Accounts are identities, not isolation. `server/data/audit.jsonl`
  records who approved/rejected/stopped what.
- `server/data/users.json` holds bcrypt password hashes; both files are
  gitignored. Back them up with the workspaces.
- Login is rate-limited (5 failures / 15 min per IP+email); registration is
  invite-only after the first user.
