#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/trade-lifecycle-baseline.sql

migrations=(
  20261121043400_create_global_activity_audit_system.sql
  20261121044356_harden_activity_foreign_key_indexes.sql
  20261121050347_restore_atomic_shipment_lifecycle.sql
  20261121052119_harden_trade_document_number_rpc.sql
  20261121052901_capture_payment_lifecycle_events.sql
  20261121053148_restore_atomic_prospect_lifecycle.sql
  20261121053151_restore_prospect_contact_enrichment.sql
  20261121053155_restore_final_prospect_contact_conversion.sql
  20261121053304_restore_trade_document_lifecycle_events.sql
  20261121053416_enforce_formal_lead_prospect_gate.sql
  20261121053617_restore_atomic_quote_lifecycle.sql
  20261121053701_restore_atomic_customer_contact_lifecycle.sql
  20261121053734_restore_atomic_sales_order_lifecycle.sql
  20261121064642_revoke_public_execute_from_trigger_only_definer_functions.sql
)

for migration in "${migrations[@]}"; do
  psql -v ON_ERROR_STOP=1 -f "supabase/migrations/${migration}"
done

psql -v ON_ERROR_STOP=1 -f supabase/tests/trade-lifecycle-migrations.test.sql
echo "Trade lifecycle migration integration tests passed."
