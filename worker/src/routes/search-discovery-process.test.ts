import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMerchantDomain } from "./search-discovery-process.ts";

test("normalizes a merchant hostname", () => {
  assert.equal(normalizeMerchantDomain("Amazon.com"), "amazon.com");
  assert.equal(normalizeMerchantDomain("www.example.co.uk"), "example.co.uk");
});

test("rejects non-domain merchant labels", () => {
  assert.equal(normalizeMerchantDomain("Amazon Official Store"), "");
  assert.equal(normalizeMerchantDomain(""), "");
  assert.equal(normalizeMerchantDomain("https://example.com"), "");
});
