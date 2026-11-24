#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/monitoring-auth-baseline.sql

migrations=(
  20261122065936_add_intelligence_monitoring_core.sql
  20261122070847_index_intelligence_monitoring_foreign_keys.sql
  20261122120000_add_monitoring_execution_logs.sql
  20261122120500_add_monitoring_cron_claim.sql
  20261122121000_fix_monitoring_cron_claim_output_columns.sql
  20261122130000_add_monitoring_run_heartbeat_and_stage.sql
  20261123100000_manage_google_maps_discovery_runs.sql
)

for migration in "${migrations[@]}"; do
  psql -v ON_ERROR_STOP=1 -f "supabase/migrations/${migration}"
done

psql -v ON_ERROR_STOP=1 -f supabase/tests/monitoring-bootstrap.test.sql
echo "Monitoring clean-install migration tests passed."
