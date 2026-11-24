import test from "node:test";
import assert from "node:assert/strict";
import { countryMatchesTarget, isPublicWebsiteUrl, isThirdPartyDirectoryHost, parseModelResult } from "./search-discovery-analysis.ts";

test("allows public HTTP and HTTPS websites only", () => {
  assert.equal(isPublicWebsiteUrl("https://example.com/about"), true);
  assert.equal(isPublicWebsiteUrl("http://example.org"), true);
  assert.equal(isPublicWebsiteUrl("ftp://example.com"), false);
  assert.equal(isPublicWebsiteUrl("https://user:pass@example.com"), false);
  assert.equal(isPublicWebsiteUrl("https://example.com:8443"), false);
});

test("blocks localhost, private, link-local and reserved IP destinations", () => {
  for (const url of ["http://localhost","http://127.0.0.1","http://10.1.2.3","http://172.16.0.1","http://192.168.1.1","http://169.254.169.254","http://100.64.0.1","http://[::1]","http://[fe80::1]"]) {
    assert.equal(isPublicWebsiteUrl(url), false, url);
  }
});

test("normalizes structured AI output and anchors evidence to the fetched page", () => {
  const result = parseModelResult(JSON.stringify({
    company_name: "Example Corp", official_website: "https://example.com", country: "Taiwan",
    products: ["USB-C Hub"], website_confidence: 93,
    evidence: [{ field: "company_name", value: "Example Corp", source_url: "https://attacker.invalid", excerpt: "Example Corp" }],
  }), "https://example.com/about");
  assert.equal(result.company_name, "Example Corp");
  assert.equal(result.website_confidence, 93);
  assert.equal(result.evidence[0].source_url, "https://example.com/about");
  assert.deepEqual(result.products, ["USB-C Hub"]);
});

test("rejects malformed AI JSON instead of persisting invented data", () => {
  assert.throws(() => parseModelResult("not-json", "https://example.com"));
});

test("matches target countries using ISO aliases and localized country names", () => {
  assert.equal(countryMatchesTarget("BR", "Brazil"), true);
  assert.equal(countryMatchesTarget("BR", "Brasil"), true);
  assert.equal(countryMatchesTarget("TW", "Taiwan"), true);
  assert.equal(countryMatchesTarget("DE", "Germany"), true);
});
test("rejects other-country results and keeps unknown countries unverified", () => {
  assert.equal(countryMatchesTarget("BR", "India"), false);
  assert.equal(countryMatchesTarget("BR", "China"), false);
  assert.equal(countryMatchesTarget("BR", null), null);
  assert.equal(countryMatchesTarget(null, "Brazil"), null);
});

test("detects third-party B2B directories without matching lookalike domains", () => {
  assert.equal(isThirdPartyDirectoryHost("www.indiamart.com"), true);
  assert.equal(isThirdPartyDirectoryHost("b2brazil.com"), true);
  assert.equal(isThirdPartyDirectoryHost("www.alibaba.com"), true);
  assert.equal(isThirdPartyDirectoryHost("15746-ar.all.biz"), true);
  assert.equal(isThirdPartyDirectoryHost("www.ec21.com"), true);
  assert.equal(isThirdPartyDirectoryHost("notindiamart.com"), false);
  assert.equal(isThirdPartyDirectoryHost("example.com"), false);
});

test("does not accept ambiguous continent or neighboring-country names as a match", () => {
  assert.equal(countryMatchesTarget("US", "South America"), false);
  assert.equal(countryMatchesTarget("KR", "North Korea"), false);
});
