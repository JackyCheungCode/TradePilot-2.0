# Harmonia Worker Runtime

This directory contains the TypeScript source recovered from the currently deployed Cloudflare Worker named `tradepilot`.

## Source provenance

- Recovered on 2026-11-15 from the deployed Worker's uploaded source maps.
- 21 TypeScript source files are preserved under `worker/src/`.
- Recovered source was scanned for hard-coded API keys, bearer tokens, JWTs, and service-role secret literals; no matches were found.
- Runtime credentials remain Cloudflare Worker secret bindings and are not copied into this repository.

## Production contract captured from the live Worker

The committed `wrangler.jsonc` matches the live Worker name, compatibility date and flag, static-assets binding, Workers AI binding, and five Workflow names/classes:

- `AgentOrchestrationWorkflow` → `tradepilot-agent-orchestration`
- `ContactEnrichmentWorkflow` → `tradepilot-contact-enrichment`
- `FacebookDiscoveryWorkflow` → `tradepilot-facebook-discovery`
- `InstagramDiscoveryWorkflow` → `tradepilot-instagram-discovery`
- `LeadDiscoveryWorkflow` → `tradepilot-lead-discovery`

The SPA asset fallback is configured for React Router deep links; API paths are routed to the Worker before static asset resolution.

## Local development

1. Install dependencies with `npm install`.
2. Build the frontend with `npm run build`.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in local-only credentials.
4. Start the Worker with `npm run worker:dev`.

`.dev.vars` is ignored by Git. Never commit actual API keys, bearer tokens, encryption keys, or Supabase service-role keys.

## Validation and deployment safety

- `npm run worker:validate` performs a Wrangler dry-run bundle validation only; it does not deploy.
- `npm run worker:deploy` is the explicit deployment command and must not be run without approval.
- GitHub CI runs the frontend build, Worker typecheck, secret scan, design-system boundary check, and Worker dry-run validation.
- Production Worker and Supabase resources have not been modified by adding this configuration.

Before any production deployment, reconcile all secret bindings and resource permissions, run the dry-run successfully, verify the frontend assets, and obtain explicit deployment approval.
