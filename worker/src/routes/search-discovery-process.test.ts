import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMerchantDomain, searchResultIdentity, searchResultExclusionTarget } from "./search-result-normalization.ts";
import { getSerpKiteAvailableCredits } from "./search-discovery-process.ts";

test("normalizes a merchant hostname", () => {
  assert.equal(normalizeMerchantDomain("Amazon.com"), "amazon.com");
  assert.equal(normalizeMerchantDomain("www.example.co.uk"), "example.co.uk");
});

test("rejects non-domain merchant labels", () => {
  assert.equal(normalizeMerchantDomain("Amazon Official Store"), "");
  assert.equal(normalizeMerchantDomain(""), "");
  assert.equal(normalizeMerchantDomain("https://example.com"), "");
});

test("shopping results dedupe by merchant and product rather than the Google result host", () => {
  const amazon = { url: "https://www.google.com/shopping/item/1", type: "shopping", title: "USB Hub", raw: { source: "Amazon.com", product_id: "sku-1" } };
  const ebay = { url: "https://www.google.com/shopping/item/2", type: "shopping", title: "USB Hub", raw: { source: "eBay.com", product_id: "sku-1" } };
  const sameAmazonProduct = { ...amazon, url: "https://www.google.com/shopping/item/3" };
  assert.notEqual(searchResultIdentity(amazon), searchResultIdentity(ebay));
  assert.equal(searchResultIdentity(amazon), searchResultIdentity(sameAmazonProduct));
});

test("shopping exclusion rules target the merchant website when known", () => {
  assert.equal(
    searchResultExclusionTarget({ url: "https://www.google.com/shopping/item/1", type: "shopping", raw: { merchant: "www.example.com" } }),
    "https://example.com",
  );
});

test("SerpKite free account accepts the provider's default monthly balance without a custom key cap", () => {
  assert.equal(getSerpKiteAvailableCredits({ plan: "free", balance: 850, key: { credits_used_month: 150 } }), 850);
});

test("SerpKite free account respects a configured key cap and account balance", () => {
  assert.equal(getSerpKiteAvailableCredits({ plan: "free", balance: 500, key: { credit_limit: 1000, credits_used_month: 250 } }), 500);
  assert.equal(getSerpKiteAvailableCredits({ plan: "free", balance: 900, key: { credit_limit: 1000, credits_used_month: 250 } }), 750);
});

test("SerpKite rejects unverifiable or non-free accounts", () => {
  assert.equal(getSerpKiteAvailableCredits({ plan: "paid", balance: 850, key: { credits_used_month: 150 } }), null);
  assert.equal(getSerpKiteAvailableCredits({ plan: "free", balance: 850, key: {} }), null);
  assert.equal(getSerpKiteAvailableCredits({ plan: "free", balance: -1, key: { credits_used_month: 0 } }), null);
});
