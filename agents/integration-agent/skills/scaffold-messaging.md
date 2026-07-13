---
skill: scaffold-messaging
version: 1.0
agent: integration-agent
---

# Skill: Scaffold Messaging (SMS / Transactional Email)

## When to invoke
Spec involves sending SMS, transactional email, or notifications via Twilio, SendGrid, Mailgun, or similar.

## Steps
1. Wrap the provider behind a single `sendMessage(to, template, data)` module so the provider can be swapped later
2. Templates live as plain functions or files — no inline message strings scattered through the app
3. Read API keys and sender identity from environment variables; add `.env.example` entries
4. Fail soft: a failed notification logs and retries once — it never crashes the calling flow
5. Include a dev mode that logs messages to console instead of sending (when the API key is absent)

## Output format
// filepath: src/integrations/messaging/{filename}
Working code plus a setup comment block (provider account steps, sender verification). No explanation outside the files.
