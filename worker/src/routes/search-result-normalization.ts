export function normalizeMerchantDomain(value: string): string {
 const candidate = value.trim().toLowerCase().replace(/^www\./, "");
 return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(candidate) ? candidate : "";
}
export function searchResultIdentity(row: { url: string; type: string; title: string; raw: Record<string, unknown> }): string {
 if (row.type === "shopping") {
  const source = String(row.raw.source ?? row.raw.merchant ?? row.raw.seller ?? "").trim();
  const merchant = normalizeMerchantDomain(source) || source.toLowerCase();
  const product = String(row.raw.product_id ?? row.title).trim().toLowerCase();
  return "shopping:" + merchant + ":" + product;
 }
 const host = new URL(row.url).hostname.replace(/^www\./, "").toLowerCase();
 return "website:" + host;
}
export function searchResultExclusionTarget(row: { url: string; type: string; raw: Record<string, unknown> }): string {
 if (row.type === "shopping") {
  const source = String(row.raw.source ?? row.raw.merchant ?? row.raw.seller ?? "").trim();
  const domain = normalizeMerchantDomain(source);
  if (domain) return "https://" + domain;
 }
 return row.url;
}
