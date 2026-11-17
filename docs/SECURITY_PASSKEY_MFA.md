# TradePilot Passkey and WebAuthn MFA

## Scope

This branch contains three separate authentication capabilities:

- Supabase Auth Passkey passwordless sign-in.
- Optional TOTP MFA and one-time recovery codes, using Supabase AAL2.
- A separate TradePilot Worker WebAuthn ceremony for biometric/user-verification as an additional factor on a Supabase session.

The independent WebAuthn factor is not represented as Supabase AAL2. The Worker verifies the assertion and grants a short-lived authorization tied to the exact Supabase `session_id`. A new login session must prove the factor again.

## Production WebAuthn relying party

The confirmed production origin and relying-party ID are:

- Origin: `https://tradepilot.xg-y.workers.dev`
- RP ID: `tradepilot.xg-y.workers.dev`
- RP display name: `TradePilot`

The Worker requires an exact Origin match, the configured RP ID, and user verification. Registration and authentication challenges are single-use, expire after five minutes, and are bound to the authenticated user and Supabase session.

Do not change the production hostname or RP ID after users register credentials without a planned credential migration. WebAuthn credentials are origin/RP scoped.

## Authentication behavior

- Password sign-in: if Supabase TOTP MFA is enrolled, complete the TOTP or recovery-code step first. If independent WebAuthn MFA is enabled, complete a separate WebAuthn assertion before entering the protected workspace.
- Passkey sign-in: Supabase Auth performs the passwordless WebAuthn ceremony. If TOTP MFA is enrolled, the TOTP/recovery-code step remains required. If the TradePilot WebAuthn factor is enabled, the session must also obtain a session-bound Worker grant before protected data access.
- Device verification: the authenticator may use Face ID, Touch ID, Windows Hello, Android biometrics, device PIN, or an external security key. TradePilot receives the WebAuthn assertion and public-key verification result, never raw fingerprint or face data.
- Passkey passwordless sign-in and the separate WebAuthn second-factor ceremony are distinct flows. Do not treat a Supabase Passkey session as an already verified TradePilot WebAuthn grant.

## Data and authorization enforcement

The migration creates private credential, challenge, preference, and session-grant tables. The Worker uses service-role-only RPC functions for credential and challenge operations.

For authenticated users, the migration adds:
- Restrictive RLS policies to existing public tables with authenticated access policies.
- A restrictive policy on `storage.objects` where authenticated storage policies exist.
- A write trigger on those tables and Storage objects to enforce the session gate even when a permitted SECURITY DEFINER routine would otherwise bypass RLS.
- A private authorization function that checks the current `auth.uid()`, JWT `session_id`, active credential, and unexpired grant.

Users who have not enabled WebAuthn MFA remain unaffected by the session gate. Service-role operations and direct administrative database operations are not blocked by the trigger. Worker routes must still validate the user's bearer token and enforce the grant before using service-role data access.

**Public Storage exception:** the existing `crm-assets` bucket is configured as public. Public object downloads are intentionally accessible by URL and cannot be made session-bound by Storage RLS. Do not store confidential documents in that bucket; sensitive documents must use private buckets and authenticated/signed access.

## Required production release order

1. Confirm Cloudflare Worker has the `SUPABASE_SERVICE_ROLE_KEY` secret configured. Never expose it in browser code or Wrangler public vars.
2. Review the migration and its effect on current RLS policies. Back up the production database and prepare a rollback migration before applying it.
3. Apply both pending migrations in lexical order: `202611170001_webauthn_mfa.sql` first, then `20261117212000_add_webauthn_session_mfa.sql`. The second migration extends the credential schema and enforcement installed by the first; do not apply it alone.
4. Deploy the Worker and frontend from the reviewed release commit.
5. Verify status, registration, authentication, grant expiry, revocation, and direct Data API/Storage denial from a real browser session.
6. Test supported desktop and mobile browsers, including platform authenticators and external security keys.
7. Only then enable WebAuthn MFA for the user account.

Do not deploy the Worker before the database migration: authenticated API calls will fail closed while the WebAuthn RPC functions are unavailable. Do not enable the feature before the new Worker and RLS enforcement are live.

## Security test checklist

- Wrong Origin and RP ID are rejected.
- Missing user verification is rejected.
- Challenges expire, are one-time, and cannot be consumed from another user or session.
- Invalid signatures and unknown/revoked credentials are rejected.
- Credential counters cannot roll back when the authenticator provides a non-zero counter.
- Session grants are bound to one Supabase `session_id`, expire, and are revoked when a credential is revoked or MFA is disabled.
- Direct Supabase Data API reads/writes and Storage object operations are blocked without a valid grant for enabled users.
- SECURITY DEFINER write paths cannot bypass the session gate.
- Users who have not opted into WebAuthn MFA retain the existing access behavior.
- Lost-device recovery and last-credential revocation are tested.

## Current release status

The feature implementation and SQL migration are on `feature/security-passkey-mfa`. The migration has been syntax-checked and its session-gate behavior has been exercised inside a transaction that was rolled back. No production schema changes or production deployment have been performed.

The pull request is draft pending CI results, full integration/device testing, and review of the production rollout and rollback plan.
