# TradePilot Worker

This directory contains the TypeScript source recovered from the currently deployed Cloudflare Worker named `tradepilot`.

## Source provenance

- Recovered on 2026-11-15 from the deployed Worker's uploaded source maps.
- 21 TypeScript source files were recovered into `worker/src/`.
- A scan of recovered source files found no hard-coded API key, bearer token, JWT, or service-role secret literals.
- Runtime credentials remain Cloudflare Worker secret bindings and are not copied into this repository.

## Current production contract

The deployed Worker currently exposes these workflow classes:

- `AgentOrchestrationWorkflow`
- `ContactEnrichmentWorkflow`
- `FacebookDiscoveryWorkflow`
- `InstagramDiscoveryWorkflow`
- `LeadDiscoveryWorkflow`

The Worker also serves static assets through the `ASSETS` binding and exposes API routes for discovery, agent orchestration, trade documents, master data, settings, translation, and health.

## Deployment safety

This source recovery does not deploy or modify the production Worker. The repository did not contain a Worker configuration or a Worker build pipeline when the source was recovered. Do not deploy this directory to production until:

1. The configuration format and build tool are explicitly selected.
2. Every production binding and Workflow name is reconciled with the recovered source.
3. A non-production validation path and rollback plan are available.
4. Worker type generation and a production-equivalent build pass.
5. The static asset build and routing behavior are verified together.

The production Worker is currently deployed from Wrangler, but its configuration is not yet committed in this repository. The live Worker remains the production source of truth until this integration gate is completed.
