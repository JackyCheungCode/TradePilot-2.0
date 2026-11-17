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
| 1. Intent / profile | `ProspectDiscoveryPage.tsx`, `ExecutionStep.tsx` | Profile snapshot and plan session code are now copied into each channel run's existing `search_config` JSONB. A durable parent plan/run relation is still absent. |
| 2. Platform selection | `PlatformSelectionStep.tsx` | Carbon semantic status dots distinguish wired executor, credential/connection verification, and catalog-only sources. Step 4 currently executes only the four wired IDs: Google Maps, Google Search, Facebook, Instagram. |
| 3. Guardrails | `GuardrailsStep.tsx`, `worker/src/lib/guardrails.ts`, channel workflows | The task snapshot is evaluated server-side before persistence for Google Maps / OSM, web search, Facebook and Instagram. Keyword positions/modes, website/domain rules and conservative website-type classification, company names/available aliases/group names, geography, products, DNC contact lists, job titles, configured internal email domains, competitor employer names, non-decision role heuristics, employee floor, and independent-site requirement are applied. Unknown employee/site evidence under `pending` policy is retained with `guardrail_review_required`. Global/both scope and differentiated keyword actions still need implementation. Duplicate merge/skip/review behavior is now enforced at the four connected channel persistence boundaries. |
| 4. Execution | `ExecutionStep.tsx`, channel routes | Real per-channel task creation, persisted run IDs, status/progress/count/log polling, and real record UUID handoff are wired. Pause/cancel is intentionally not shown because no corresponding backend control API was verified. |
| 5. AI scoring | `ScoringStep.tsx`, `POST /api/v1/discovery-records/score`, `callAgentChatModel` | Loads real records, calls the configured `prospect_scoring` task model, and persists score, dimensions, evidence, risks, model, and timestamp in `raw_data.ai_scoring`. Provider-output validation and partial-save retries still need acceptance testing. |
| 6. Decision-maker enrichment / CRM | `DecisionMakerStep.tsx`, `ContactEnrichmentWorkflow`, `/api/v1/discovery-contact-candidates/convert` | Uses existing contact-enrichment jobs, polls real job state, reloads candidate data, and submits selected candidate keys for human-confirmed CRM account/contact/lead conversion. Website-only enrichment may return contact details without named candidates; Apollo/ZoomInfo credentials may be required for named contacts. |

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

## Guardrail execution contract (2026-11-17)

### Implemented in the feature branch
- Website-type presets are consumed by the server evaluator using the selected Chinese category labels, URL host signals, and available source metadata. This is intentionally conservative: an unknown host/category is not guessed into a website class.
- Personnel controls are bound to state and included in the task snapshot. Job-title exclusions use supplied job-title text; internal-staff exclusions require the user to provide internal email domains; competitor-staff exclusions require competitor names and a source record that exposes employer/company fields; non-decision exclusions use a small explicit role-term list.
- Company alias and group matching controls are bound. The evaluator checks alias/former-name/brand and parent/group fields only when those fields exist in the provider payload.
- The DNC switch is now respected independently: disabling DNC prevents the saved contact-entry list from being applied, even if the general contact rule category remains enabled.
- Execution task references are stored in browser local storage per plan code. On refresh, the UI restores those references and re-polls persisted backend run state. This is a browser-local recovery aid, not a cross-device task dashboard.

### Still not production-complete
- `scope` values `global` and `both` do not have an owner-scoped server settings store. Current execution is task-snapshot scoped only. A durable global setting requires a reviewed schema/RLS migration and rollback plan.
- `keywordAction` values (`company`, `page`, `result`) are not yet semantically distinct in the persistence layer. Current candidate-level rejection removes the matching candidate from the current channel result set.
- Duplicate policy is now enforced for Google Maps / OSM, web search, Facebook and Instagram: `merge` updates the existing record; `skip` preserves the existing record and adds the new source occurrence without replacing its business data; `review` marks `raw_data.duplicate_review_required` while preserving the occurrence. STEP 5 displays the duplicate-review marker. This is per-channel record deduplication, not a global cross-channel identity review queue.
- Website-type detection is evidence-based and cannot classify every unknown domain without a crawl/classification provider.
- The named-role and employer rules can only act on fields actually returned by a provider. They do not manufacture missing employment history or decision-maker data.
- LinkedIn, TikTok, Amazon, Alibaba.com, eBay, Walmart, YouTube, Reddit, Pinterest and other catalog entries still do not have verified independent execution chains in this branch.

## Current validation boundary
- A dedicated Node test suite now covers keyword boundaries, website-type exclusions, personnel rules, company alias/group matching, DNC behavior, unknown-evidence handling, and duplicate-policy selection. CI runs this suite before the design-system and build checks.
- Worker dry-run validates the bundle only; it does not deploy.
- No controlled end-to-end provider run has been performed as part of this code-only work. Provider credentials, external API quotas, actor behavior, and production result quality remain unverified.
- No production database rows or credentials were changed by this implementation.
