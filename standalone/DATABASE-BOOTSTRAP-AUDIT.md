# Standalone database bootstrap audit

Audit date: 2026-11-24

## Status

**Not certified for a clean installation yet.** The current repository migrations do not reproduce the source database migration history one-to-one. Do not run all SQL files blindly against a new or existing Supabase project.

This audit compared the handoff branch's migration filenames with the source project's applied migration ledger and inspected database metadata read-only. No database schema, data, settings, or migration history was changed.

## Migration ledger comparison

| Measure | Count |
|---|---:|
| SQL files in `supabase/migrations/` on the handoff branch | 121 |
| Applied migration versions in the source database | 121 |
| Versions matching exactly by timestamp | 114 |
| Repository migration files not present in applied history | 7 |
| Applied versions without an exact matching repository migration file | 7 |

### Repository files not present in the applied history

These must be reviewed before inclusion in a clean-install path; they are not automatically safe to apply just because they are in the directory.

- `20261122070847_index_intelligence_monitoring_foreign_keys.sql`
- `20261122120000_add_monitoring_execution_logs.sql`
- `20261122120500_add_monitoring_cron_claim.sql`
- `20261122121000_fix_monitoring_cron_claim_output_columns.sql`
- `20261122130000_add_monitoring_run_heartbeat_and_stage.sql`
- `20261123100000_manage_google_maps_discovery_runs.sql`
- `20261124100000_create_private_product_assets_bucket.sql` (new standalone migration; intentionally not applied to the source project)

### Applied versions without exact matching repository files

The applied database ledger contains these versions, which do not have exact timestamp matches in the handoff branch:

- `20261122070853_index_intelligence_monitoring_foreign_keys`
- `20261122080519_add_monitoring_execution_logs`
- `20261122080521_add_monitoring_cron_claim`
- `20261122080650_fix_monitoring_cron_claim_output_columns`
- `20261122081057_fix_monitoring_cron_claim_inactive_objects`
- `20261122084453_monitoring_run_heartbeat_and_execution_stage`
- `20261122220538_manage_google_maps_discovery_runs`

The six timestamp/name differences were checked against the live schema metadata: the expected indexes, execution-log table and owner policies, final cron-claim function, heartbeat/stage columns, and Google Maps discovery-run fields/index are present. The additional `fix_monitoring_cron_claim_inactive_objects` behavior is also present in the live cron-claim function. The standalone migration `20261122121000_fix_monitoring_cron_claim_output_columns.sql` has now been consolidated to preserve both the qualified INSERT RETURNING fields and the active-object eligibility guard, so a clean install will end in the same relevant function behavior. This resolves the known monitoring migration content gap for the handoff chain; the full application schema still needs a from-zero test.

## Read-only schema inventory

The source database inspection reported:

- 89 tables in the `public` schema; all 89 had RLS enabled.
- 257 policies in the `public` schema.
- 73 functions in the `public` schema.
- 134 non-internal triggers on `public` tables.
- No ordinary or materialized views in the `public` schema.
- Five Storage buckets: `avatars`, `crm-assets`, `payment-documents`, `product-assets`, and `trade-document-files`.
- Five installed extensions: `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`, and `pg_stat_statements`.

The inventory is metadata only. It does not include customer rows, authentication users, object contents, secrets, or production file data.

## Security and operational observations

The Supabase security advisor returned these findings at audit time:

- Four private WebAuthn tables have RLS enabled and no policies. This may be intentional for private-schema access, but must be validated against the functions and grants used by the application.
- Eleven `SECURITY DEFINER` functions are executable by the `authenticated` role. Review each function's ownership checks, argument validation, search path, and intended caller before certifying the bootstrap.
- Leaked-password protection was reported disabled in Auth.
- The performance advisor reported 54 unindexed foreign keys and 69 unused indexes. These are review items, not automatic reasons to add/drop indexes in a clean-install migration.

The five Storage bucket definitions and their object policies are platform configuration that must be provisioned and tested separately. A database schema migration alone does not copy bucket contents or prove object-level access controls. The audit also found that the existing private `product-assets` bucket and its four owner-folder policies were present in the source project but were not represented by any repository migration. The handoff branch now adds `20261124100000_create_private_product_assets_bucket.sql` and aligns the local bucket configuration; this new migration is intentionally not applied to the source project.

## Deferred migration

`supabase/deferred-migrations/20261116233000_create_inbox_private_attachments.sql` remains deferred. Do not move it into the normal migration sequence until the private bucket, owner-scoped object policies, scanner service, upload/quarantine/scan/release/delete/download flows, retention, and retry behavior have all passed end-to-end tests.

## Required work before certification

1. Obtain a schema-only export of the source database using a supported Supabase CLI workflow; do not export or copy production user data.
2. Compare the export with all 120 repository migrations, including function bodies, triggers, RLS policies, grants, custom schemas, extensions, and storage policies.
3. Keep the six timestamp differences documented and preserve the consolidated cron-claim behavior in the handoff migration. Do not repair source migration history merely to silence the diff.
4. Create a clean-install baseline from reviewed schema definitions, keeping Supabase-managed schemas and platform-managed resources separate. A local Supabase config and full clean-bootstrap CI job have now been added; the first end-to-end run is still pending.
5. Add only synthetic development seed data. Never bundle production users, customer records, API credentials, Vault secrets, or Storage objects.
6. Initialize a disposable Supabase project from zero and run schema, migration, RLS, RPC, trigger, Storage, and application integration tests.
7. Run Supabase security and performance advisors on the disposable project and document accepted findings.
8. Keep the inbox private-attachment migration gated until its operational prerequisites pass.

## Safety boundary

All source database inspection for this audit was read-only. The standalone handoff branch is the only intended code target. Do not change the original `main` or `develop` branches, and do not apply standalone bootstrap work to the source production database.
