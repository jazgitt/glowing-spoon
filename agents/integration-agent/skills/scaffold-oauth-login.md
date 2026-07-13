---
skill: scaffold-oauth-login
version: 1.0
agent: integration-agent
---

# Skill: Scaffold OAuth Login

## When to invoke
Spec involves "sign in with Google/Microsoft/GitHub", SSO, or social login.

## Steps
1. Use the authorization-code flow with PKCE — never the implicit flow
2. Create the redirect endpoint, callback handler, and token exchange in one module
3. Store only what the app needs (provider id, email, display name) — no raw tokens in the database unless the spec requires offline access
4. Read client id/secret from environment variables; add `.env.example` entries
5. Set session cookies httpOnly + secure; validate the `state` parameter on callback

## Output format
// filepath: src/integrations/oauth/{filename}
Working code plus a setup comment block (where to register the OAuth app, which redirect URI to whitelist). No explanation outside the files.
