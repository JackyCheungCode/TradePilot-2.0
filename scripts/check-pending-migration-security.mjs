import fs from "node:fs";
import path from "node:path";

const migrations = [
  "20261121043400_create_global_activity_audit_system.sql",
  "20261121044356_harden_activity_foreign_key_indexes.sql",
  "20261121050347_restore_atomic_shipment_lifecycle.sql",
  "20261121052119_harden_trade_document_number_rpc.sql",
  "20261121052901_capture_payment_lifecycle_events.sql",
  "20261121053148_restore_atomic_prospect_lifecycle.sql",
  "20261121053151_restore_prospect_contact_enrichment.sql",
  "20261121053155_restore_final_prospect_contact_conversion.sql",
  "20261121053304_restore_trade_document_lifecycle_events.sql",
  "20261121053416_enforce_formal_lead_prospect_gate.sql",
  "20261121053617_restore_atomic_quote_lifecycle.sql",
  "20261121053701_restore_atomic_customer_contact_lifecycle.sql",
  "20261121053734_restore_atomic_sales_order_lifecycle.sql",
];

let failed = false;
for (const file of migrations) {
  const fullPath = path.join(process.cwd(), "supabase", "migrations", file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required lifecycle migration: ${file}`);
    failed = true;
    continue;
  }
  const sql = fs.readFileSync(fullPath, "utf8");
  const definerCount = (sql.match(/\bsecurity\s+definer\b/gi) ?? []).length;
  const hardenedCount = (sql.match(/\bsecurity\s+definer\s+set\s+search_path\s*=\s*''/gi) ?? []).length;
  if (definerCount !== hardenedCount) {
    console.error(`${file}: every SECURITY DEFINER function must pin an empty search_path (${hardenedCount}/${definerCount}).`);
    failed = true;
  }
  if (/\bauth\.role\s*\(/i.test(sql)) {
    console.error(`${file}: auth.role() is deprecated; use a signed JWT role claim check.`);
    failed = true;
  }
  if (definerCount > 0 && !/set\s+search_path\s*=\s*''/i.test(sql)) {
    console.error(`${file}: expected an explicit empty search_path.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Pending lifecycle migration security checks passed.");
