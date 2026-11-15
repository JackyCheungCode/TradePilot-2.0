# Cloudflare Worker integration baseline

## Scope

The `worker/src/` tree was recovered from the currently deployed `tradepilot` Worker source maps. This preserves the existing server-side routes and Workflow implementations while the new repository is being established.

## Production snapshot (read-only inspection)

- Worker name: `tradepilot`
- Compatibility date: `2026-11-13`
- Compatibility flag: `nodejs_compat`
- Usage model: `standard`
- Static assets: enabled through `ASSETS`
- Workers AI: enabled through `AI`
- Workers Logs: enabled and persisted
- Traces: currently disabled
- Latest inspected deployment: `2026-11-15T02:34:37Z`
- Latest inspected deployment ID: `65692cbe-e8ab-4bdc-9515-db2e33aab029`
- Latest inspected version ID: `adf6d38f-5c0a-437f-a881-7347bc5c0745`

## Workflow bindings

| Binding | Workflow name | Class |
|---|---|---|
| `AGENT_ORCHESTRATION_WORKFLOW` | `tradepilot-agent-orchestration` | `AgentOrchestrationWorkflow` |
| `CONTACT_ENRICHMENT_WORKFLOW` | `tradepilot-contact-enrichment` | `ContactEnrichmentWorkflow` |
| `FACEBOOK_DISCOVERY_WORKFLOW` | `tradepilot-facebook-discovery` | `FacebookDiscoveryWorkflow` |
| `INSTAGRAM_DISCOVERY_WORKFLOW` | `tradepilot-instagram-discovery` | `InstagramDiscoveryWorkflow` |
| `LEAD_DISCOVERY_WORKFLOW` | `tradepilot-lead-discovery` | `LeadDiscoveryWorkflow` |

## Other inspected bindings

- `ASSETS`
- `AI`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The production Worker also has secret bindings named `AGENT_ENCRYPTION_KEY`, `AI_PROVIDER_OPENROUTER_API_KEY`, `APIFY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `DEEPL_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SERPAPI_API_KEY`, `SERPER_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Only names are documented here; secret values are never copied to source control.

## Source layout recovered

- `worker/src/index.ts`: Worker entry point and API routing.
- `worker/src/routes/`: health, discovery, search discovery, settings, translation, exclusions, Facebook, Instagram, agent center, trade documents, and master data.
- `worker/src/workflows/`: five durable Workflow classes.
- `worker/src/lib/`: HTTP responses, deduplication, and owner-scoped query helpers.

## Required integration work (not yet performed)

- Choose the repository's Cloudflare configuration/build approach. The live Worker was deployed with Wrangler, but this repository had no Worker configuration file at the time of inspection.
- Reconcile the live Worker settings and bindings with a committed, non-secret configuration.
- Generate platform binding types from the actual configuration; replace handwritten environment interfaces where practical.
- Add a Worker-specific typecheck/build and tests for route and Workflow behavior.
- Connect CI/CD to a safe non-production validation path before considering production deployment.
- Verify Workers Logs and Traces configuration; the inspected production Worker has Logs enabled but Traces disabled.

## Safety boundary

No Cloudflare Worker settings, secrets, Workflow instances, bindings, assets, deployments, or production traffic were changed during source recovery. Do not deploy the recovered source to the production `tradepilot` Worker until the integration work above has passed.
