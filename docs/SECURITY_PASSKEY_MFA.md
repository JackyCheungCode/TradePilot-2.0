# TradePilot Passkey and MFA implementation

## Scope

This feature branch adds:
- Passwordless Passkey sign-in through Supabase Auth WebAuthn APIs.
- Passkey enrollment, listing, and revocation in the Security settings page.
- Optional TOTP MFA enrollment and AAL2 verification after either password or Passkey sign-in.
- One-time recovery-code generation, status, regeneration, and verification.
- A protected-route check that redirects sessions at AAL1 to the MFA challenge when a verified factor is enrolled.

The Supabase JS SDK is pinned to 2.119.0. Passkey APIs are still documented as experimental and must be enabled in the Supabase Auth project configuration. Recovery-code APIs require the client experimental flag.

## Supabase Auth configuration required before production enablement

In Supabase Dashboard → Authentication → Passkeys:
1. Enable Passkey authentication.
2. Set the relying-party display name to TradePilot.
3. Set the RP ID to the stable registrable domain that will host TradePilot (bare hostname only; no scheme, port, or path).
4. Add the exact HTTPS production origin and any approved preview/local origins (up to the platform limit).
5. Keep the RP ID stable after the first user registers a credential. Changing it invalidates existing Passkeys.

Do not enable Passkeys in production until the canonical custom domain and any supported preview origins have been confirmed. The current Wrangler configuration does not declare a production custom-domain route, so the final RP ID must not be guessed from the Worker name.

## Authentication behavior

- Password sign-in: password is the first factor. If Supabase reports current AAL1 and next AAL2, the app requires a verified TOTP factor or a one-time recovery code before entering protected routes.
- Passkey sign-in: the browser runs the platform WebAuthn ceremony. The authenticator may request biometrics, device PIN, or a security key. If TOTP MFA is enrolled, the app also requires the TOTP/recovery-code step.
- Passkey is currently a passwordless sign-in credential, not a native Supabase JavaScript AAL2 factor.
- The JavaScript Supabase MFA API documents TOTP and phone as second factors. This implementation deliberately does not claim that a Passkey assertion itself upgrades a session to AAL2.
- A dedicated Passkey-as-second-factor flow remains a separate security workstream. It must use a supported WebAuthn MFA API or a separately reviewed server-side WebAuthn factor implementation; do not implement it by trusting frontend state or by treating a second Passkey login session as proof for a different session.

## Security requirements before production release

1. Confirm Supabase Passkey RP ID/origins and enablement in the project dashboard.
2. Verify that recovery-code APIs are enabled by the hosted Auth service and test generation, one-time verification, and regeneration against a non-production account.
3. Add AAL-aware authorization to all protected data access paths. The current React route guard is a UX/access boundary, not a replacement for RLS or Worker authorization.
4. Review every exposed public table's RLS policies. For users with enrolled MFA, database policies must enforce the intended AAL requirement without locking out users who have not opted into MFA.
5. Review Worker API routes and any service-role operations so an AAL1 token cannot bypass an enabled MFA policy.
6. Test lost-device recovery, last-Passkey deletion, TOTP disablement, session revocation, browser refresh, and multi-tab behavior.
7. Run Carbon/design-system checks, TypeScript checks, Worker type checks, tests, and a production build before merge.
8. Deploy only through the separately approved release process. This feature branch must not be used as an automatic production deployment source.

## Current limitation

The settings and login flows provide Passkey sign-in plus TOTP-based MFA. They do not yet provide Passkey as the second AAL2 factor in the JavaScript Supabase SDK. The feature must not be marked complete for the original biometric-MFA requirement until that gap and backend AAL enforcement have been resolved and tested.
