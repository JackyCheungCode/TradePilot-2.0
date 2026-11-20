#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/trade-lifecycle-baseline.sql

migrations=(
  20261116050030_atomic_shipment_lifecycle.sql
  20261116050040_capture_payment_lifecycle_events.sql
  20261116050050_atomic_prospect_lifecycle.sql
  20261116050060_atomic_prospect_contact_enrichment.sql
  20261116050070_capture_quote_order_created_events.sql
  20261116050080_enforce_formal_lead_prospect_gate.sql
  20261116050090_finalize_prospect_contact_conversion.sql
  20261116050100_capture_opportunity_created_event.sql
  20261116050110_capture_quote_issue_lifecycle_event.sql
)

for migration in "${migrations[@]}"; do
  psql -v ON_ERROR_STOP=1 -f "supabase/migrations/${migration}"
done

psql -v ON_ERROR_STOP=1 -f supabase/tests/trade-lifecycle-migrations.test.sql
echo "Trade lifecycle migration integration tests passed."
