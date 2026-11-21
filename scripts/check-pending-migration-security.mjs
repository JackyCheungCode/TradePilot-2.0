import fs from "node:fs";
import path from "node:path";

const migrations = [
  "20261116050030_atomic_shipment_lifecycle.sql",
  "20261116050040_capture_payment_lifecycle_events.sql",
  "20261116050050_atomic_prospect_lifecycle.sql",
  "20261116050060_atomic_prospect_contact_enrichment.sql",
  "20261116050070_capture_quote_order_created_events.sql",
  "20261116050080_enforce_formal_lead_prospect_gate.sql",
  "20261116050090_finalize_prospect_contact_conversion.sql",
  "20261116050100_capture_opportunity_created_event.sql",
  "20261116050110_capture_quote_issue_lifecycle_event.sql",
  "20261121043400_create_global_activity_audit_system.sql",
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
  if (!/set\s+search_path\s*=\s*''/i.test(sql)) {
    console.error(`${file}: expected an explicit empty search_path.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Pending lifecycle migration security checks passed.");
