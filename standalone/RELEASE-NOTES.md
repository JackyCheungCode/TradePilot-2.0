# Standalone handoff notes

## Source snapshot

- Source repository: `JackyCheungCode/TradePilot-2.0`
- Source branch: `main`
- Source commit at preparation: `c19ca306c4de2d6afd8383c266ac82bf10d6c37a`
- Handoff branch: `standalone/developer-handoff`

## Isolation changes in this branch

- Added ZIP-download and fresh-Git-history instructions.
- Replaced source Supabase URL/key in the runtime Wrangler configurations with operator placeholders.
- Replaced the source Worker and Workflow names with standalone-specific names.
- Removed the original Cloudflare account ID from `cloudflare.config.ts`; account ID is now read from the operator's environment.
- Replaced the original production deploy workflow with a manual-only workflow requiring explicit approval and the operator's Cloudflare credentials.
- Removed preview deployment workflows that targeted the source Cloudflare account.
- Updated CI to validate `main` and `develop` without deploying.
- Kept service credentials out of committed environment files.

## Not yet certified

- A complete scan of all tracked files and historical Git objects for accidental credentials.
- A clean Supabase database bootstrap from zero. The source migration history does not fully match the live production schema.
- Provisioning and validation of the recipient's Cloudflare R2 bucket and Workflow resources.
- A complete independent deployment against accounts owned by the recipient.

The handoff branch is intentionally separate. It does not change `main`, `develop`, or the original production environment.
