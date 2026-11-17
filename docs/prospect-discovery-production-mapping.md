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
| 3. Guardrails | `GuardrailsStep.tsx`, `worker/src/lib/guardrails.ts`, channel workflows | The task snapshot is evaluated server-side before persistence for Google Maps / OSM, web search, Facebook and Instagram. Keyword positions/modes, website/domain rules and conservative website-type classification, company names/available aliases/group names, geography, products, DNC contact lists, job titles, configured internal email domains, competitor employer names, non-decision role heuristics, employee floor, and independent-site requirement are applied. Unknown employee/site evidence under `pending` policy is retained with `guardrail_review_required`. Task scope and owner-scoped global/both configuration are implemented using the existing audited `trade_business_settings` namespace. The migration extending its scope checks is included but must be applied during the approved release. Only the current-result keyword action is exposed; company-wide and page-specific actions remain disabled until their data semantics are implemented. Duplicate merge/skip/review behavior is now enforced at the four connected channel persistence boundaries. |
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
- Global/both scope now uses owner-scoped `trade_business_settings` with the existing RLS policies and audit trigger. Migration `20261117090000_add_prospect_guardrails_settings_scope.sql` adds the `prospect_guardrails` scope to the settings and history constraints. The migration is committed but has not been applied to production; the endpoint will return a storage error until the migration is deployed.
- Only `keywordAction=result` is currently enabled: a matching candidate is skipped at the current channel result boundary. The UI disables company-wide and page-specific actions because they require different cross-record and page-crawl semantics; these are not presented as working controls.
- Duplicate policy is now enforced for Google Maps / OSM, web search, Facebook and Instagram: `merge` updates the existing record; `skip` preserves the existing record and adds the new source occurrence without replacing its business data; `review` marks `raw_data.duplicate_review_required` while preserving the occurrence. STEP 5 displays the duplicate-review marker. This is per-channel record deduplication, not a global cross-channel identity review queue.
- Website-type detection is evidence-based and cannot classify every unknown domain without a crawl/classification provider.
- The named-role and employer rules can only act on fields actually returned by a provider. They do not manufacture missing employment history or decision-maker data.
- LinkedIn, TikTok, Amazon, Alibaba.com, eBay, Walmart, YouTube, Reddit, Pinterest and other catalog entries do not have verified independent execution chains. These channels are explicitly deferred to a later integration phase and are not release blockers for the current four-channel scope.

## Current validation boundary
- A dedicated Node test suite now covers keyword boundaries, website-type/platform exclusions, personnel rules, company alias/group matching, DNC behavior, unknown-evidence handling, duplicate-policy selection, and result visibility for legacy records without occurrences. CI runs this suite before the design-system and build checks.
- Worker dry-run validates the bundle only; it does not deploy.
- No controlled end-to-end provider run has been performed as part of this code-only work. Provider credentials, external API quotas, actor behavior, and production result quality remain unverified.
- No production database rows or credentials were changed by this implementation.
- A read-only audit found one historical `search_engine` record with no visible occurrence row. The records API now uses a left join for the all-results view and retains records with no occurrence history, while excluding records whose occurrences are all removed; run-specific queries retain the efficient inner join and run filter.

## Read-only production environment audit (2026-11-17)
- `discovery_runs` currently contains five old non-terminal runs: two `queued` map runs, one `running` agent run, one `running` Facebook run, and one `running` map run. Their timestamps are from Nov 13–14. A read-only Cloudflare Workflows audit found no currently queued/running instances for any TradePilot workflow; the agent workflow has one errored instance, and the latest Facebook/lead instances are complete. The stale database rows have no matching active workflow instance and their logs stop mid-run. They were not rewritten or cancelled because this is historical production data and needs an explicit reconciliation policy.
- Supabase health advisor returned no findings.
- The security advisor reports pre-existing project-wide findings: 17 RLS-enabled tables without policies, two trigger functions with mutable `search_path`, five `SECURITY DEFINER` RPCs executable by authenticated users, and leaked-password protection disabled. The core discovery tables were not among the listed RLS-without-policy findings. The 17 tables currently fail closed under RLS; four also retain table grants to anon/authenticated but no policies, so access remains denied. No broad policies were added because ownership and intended access paths must be verified per table. Migration `20261117091000_harden_tradepilot_function_search_paths.sql` now pins the two trigger functions and five owner-checking RPCs to an empty search path; it is committed but not applied. Leaked-password protection is a Supabase Auth project setting and still requires an administrator-side change.
- The performance advisor reports 49 unindexed foreign keys and four duplicate-index warnings. Two identical partial indexes exist on `discovery_records(entity_id, owner_id)`; no index was dropped and no bulk FK indexes were added because those are production schema changes requiring per-query plan review, write-cost assessment, and a migration/rollback plan.
- These advisor findings are project-wide and pre-existing; this PR did not mutate the database schema or data.


## Scope decision update (2026-11-17)
- The user explicitly deferred independent execution-chain integrations for LinkedIn, TikTok, Amazon, Alibaba.com, eBay, Walmart, YouTube, Reddit, Pinterest and other catalog-only channels. They remain visible as catalog-only / no verified executor, but are excluded from the current release acceptance scope.
- Current release channel scope remains Google Maps / OSM, Web Search, Facebook and Instagram.
- Global guardrail settings now have an owner-scoped API backed by the existing audited settings table. The schema migration is included in this branch only; production schema was not changed.
- The keyword action UI now enables only “skip current search result”. Company-wide and page-specific actions are disabled rather than represented as implemented.


## Follow-up hardening in feature branch (2026-11-17)
- Global guardrails use `trade_business_settings` with owner_id scoping, the existing authenticated owner RLS policies, unique (owner_id, scope_key), and the existing audit trigger/history table. The API resolves the caller through Supabase Auth and always filters by the verified owner ID while using service-role credentials server-side.
- The additive migration `20261117090000_add_prospect_guardrails_settings_scope.sql` extends only the settings/history scope checks to permit `prospect_guardrails`. Existing rows and policies are not rewritten.
- The settings API accepts a bounded allow-list of guardrail configuration keys and rejects payloads over 100 KB. Task creation fetches global config only when the selected scope is global/both; global-only requires a saved global config; both merges global defaults with task overrides.
- The UI now exposes only the current-result keyword action. Company-wide and page-level options are disabled because they require separate identity/page-crawl semantics.
- The five SECURITY DEFINER RPCs inspected in the read-only audit all contain explicit auth.uid() and owner_id checks; their execute grants were retained. Their search_path is hardened by the additive migration rather than revoking authenticated execution.
- The two mutable-search_path trigger functions reference public tables with schema qualification and are hardened to an empty search_path by the same migration.
- The 17 RLS-enabled/no-policy tables remain fail-closed. No generic allow policies were added. The Supabase Auth leaked-password-protection setting still requires an administrator-side configuration change.
