---
skill: scaffold-webhook-handler
version: 1.0
agent: integration-agent
---

# Skill: Scaffold Webhook Handler

## When to invoke
Spec involves receiving events from an external service (payment events, Zapier, Shopify, calendar updates) or mentions webhooks explicitly.

## Steps
1. One endpoint per provider, mounted under `/webhooks/{provider}`
2. Verify the provider's signature or shared secret before touching the payload; reject with 401 otherwise
3. Respond 200 immediately after persisting the event; do heavy processing after acknowledging
4. Make handlers idempotent — the same event delivered twice must not double-apply
5. Read verification secrets from environment variables; add `.env.example` entries

## Output format
// filepath: src/integrations/webhooks/{filename}
Working code plus a setup comment block (where to register the webhook URL in the provider dashboard). No explanation outside the files.
