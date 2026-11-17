# Prospect Discovery Production Integration Map

> Scope: `TradePilot-2.0`, implementation branch `feat/prospect-discovery-production-flow`, target `develop`.
> This document records the integration points verified from the current source. It does not authorize production data collection or database mutations.

## Verified Worker entry points

| Channel / capability | Request | Worker route | Workflow / persistence |
|---|---|---|---|
| Google Maps / local businesses | `POST /api/v1/discovery-runs` | `worker/src/routes/discovery.ts` | `LEAD_DISCOVERY_WORKFLOW` → `LeadDiscoveryWorkflow`; `discovery_runs`, `discovery_run_logs`, `discovery_records`, `discovery_record_occurrences` |
| Web search | `POST /api/v1/search-discovery-runs` | `worker/src/routes/search-discovery.ts` | `LEAD_DISCOVERY_WORKFLOW` → `LeadDiscoveryWorkflow`; requires Serper and/or SerpAPI credentials |
| Facebook | `POST /api/v1/facebook-discovery-runs` | `worker/src/routes/facebook-discovery.ts` | `FACEBOOK_DISCOVERY_WORKFLOW` → `FacebookDiscoveryWorkflow`; Apify token is read from integration secrets |
| Instagram | `POST /api/v1/instagram-discovery-runs` | `worker/src/routes/instagram-discovery.ts` | `INSTAGRAM_DISCOVERY_WORKFLOW` → `InstagramDiscoveryWorkflow`; Apify token is read from integration secrets |
| Task list / detail / logs / records | `GET /api/v1/discovery-runs`, `GET /api/v1/discovery-runs/:id`, `GET /api/v1/discovery-records` | `worker/src/routes/discovery.ts` | Owner-scoped reads from existing discovery tables |
| Website / provider contact enrichment | `POST /api/v1/discovery-contact-enrichments` | `worker/src/routes/discovery.ts` | `CONTACT_ENRICHMENT_WORKFLOW` → `ContactEnrichmentWorkflow`; enrichment run records |
| CRM promotion | `POST /api/v1/discovery-records/:id/action` | `worker/src/routes/discovery.ts` | Existing RPC and CRM account/contact/lead tables; requires human review |

## Current six-step frontend boundary

| Step | Frontend | Verified production gap |
|---|---|---|
| 1. Intent / profile | `ProspectDiscoveryPage.tsx` | Profile is held in React state; it is not yet persisted as a durable immutable run snapshot before execution. |
| 2. Platform selection | `PlatformSelectionStep.tsx` | Catalog entries outnumber verified executors. Status dots now distinguish connected executor, connection/credential verification required, and no verified executor. Selection still needs capability validation before task creation. |
| 3. Guardrails | `GuardrailsStep.tsx` | Rules are stored in browser local storage. The complete rule snapshot is not yet enforced by the backend execution pipeline. |
| 4. Execution | `ExecutionStep.tsx` | Current implementation generates timer-based progress, sample counts, fabricated log events, and synthetic lead IDs. It must be replaced by real per-channel run creation and polling. |
| 5. AI scoring | `ScoringStep.tsx` | Uses seeded sample companies and local timer-based scoring; no durable AI scoring result is created. |
| 6. Decision-maker enrichment / CRM | `DecisionMakerStep.tsx` | Uses seeded contacts and simulated enrichment / CRM sync; existing contact enrichment and CRM APIs are not wired to this step. |

## Task status and result read model

- The generic discovery route already exposes owner-scoped task list and task detail reads, including status, progress, discovered count, created lead count, message, search config, and logs.
- The generic discovery route exposes owner-scoped record reads and record actions.
- The UI must use the persisted run ID as the identity. The locally generated `TPD-...` plan code is not the same as the backend run's `task_code` and must not be represented as such.
- Multi-channel execution should retain one backend run per channel, linked in the UI by a client-side plan/session ID until a reviewed schema change establishes a durable parent-run relationship.
- A channel failure must not erase successful sibling-channel results. The UI should aggregate to partial completion when some runs succeed and others fail.

## Implementation order

1. Replace synthetic execution with real calls to the four verified channel entry points, validate each channel's input and credentials, and persist returned run IDs in the browser session / plan state.
2. Poll the existing owner-scoped task detail endpoint for real status, progress, counts, and logs. Remove generated progress, fake counts, and fake lead IDs.
3. Load result records from `GET /api/v1/discovery-records` and carry actual record UUIDs into step 5.
4. Inspect the existing schema and available AI integration contract; implement scoring only after confirming the persisted record and model interfaces.
5. Wire step 6 to the existing contact enrichment job and CRM promotion APIs; retain human confirmation before CRM writes.
6. Persist the full profile and guardrail snapshots. First check whether existing JSON columns can safely carry these snapshots; submit a separate migration / rollback proposal if schema changes are unavoidable.

## Safety and release gates

- No production collection was started during this audit.
- No database rows, credentials, existing workflows, or historical task statuses were modified.
- Do not mark catalog presence as execution capability.
- Do not expose provider names in end-user labels.
- Before production rollout: typecheck, design-system boundary check, build, Worker dry-run, CI, deployment verification, then a controlled end-to-end test using a user-approved market and bounded result limit.
