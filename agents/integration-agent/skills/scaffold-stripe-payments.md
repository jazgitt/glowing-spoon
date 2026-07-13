---
skill: scaffold-stripe-payments
version: 1.0
agent: integration-agent
---

# Skill: Scaffold Stripe Payments

## When to invoke
Spec involves payments, checkout, subscriptions, invoices, or mentions Stripe/PayPal explicitly.

## Steps
1. Use Stripe Checkout (hosted page) by default — never build a custom card form; it keeps the app out of PCI scope
2. Create a thin server-side module: create-checkout-session endpoint + success/cancel redirect handlers
3. Handle the `checkout.session.completed` webhook to fulfill the order — never trust the redirect alone
4. Read `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from environment variables
5. Verify webhook signatures before processing
6. Add a `.env.example` entry for every new variable

## Output format
// filepath: src/integrations/stripe/{filename}
Working code plus a short setup comment block at the top of each file (which Stripe dashboard settings to configure). No explanation outside the files.
