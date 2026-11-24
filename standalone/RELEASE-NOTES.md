# Standalone handoff notes

## Source snapshot

- Source repository: `JackyCheungCode/TradePilot-2.0`
- Source branch: `main`
- Source commit at preparation: `c19ca306c4de2d6afd8383c266ac82bf10d6c37a`
- Handoff branch: `standalone/developer-handoff`

## What this handoff adds

- Independent-copy instructions using a ZIP download and fresh Git initialization.
- Explicit isolation requirements for Supabase, Cloudflare, R2, API credentials, and CI/CD.
- A sanitized Wrangler configuration template with placeholders instead of the source installation's Supabase URL/key, Cloudflare account ID, Worker name, and R2 bucket name.
- A warning that database migration history must be reconciled and clean-install tested before promising an automated setup.

## Not yet certified

- A full secret scan of every tracked file and historical Git object.
- A clean Supabase database bootstrap from zero.
- Provisioning of a new Cloudflare account's Worker, R2 bucket, Workflow bindings, and secrets.
- A complete independent deployment in an account owned by the recipient.

The handoff branch is intentionally separate. It does not change `main`, `develop`, or production deployment settings.
