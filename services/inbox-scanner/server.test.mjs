import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyRequest } from "./server.mjs";

test("accepts a correctly signed scan request", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret-0123456789abcdef0123456789abcdef").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, body, "test-secret-0123456789abcdef0123456789abcdef"), true);
});

test("rejects a modified body", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret-0123456789abcdef0123456789abcdef").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, Buffer.from("changed bytes"), "test-secret-0123456789abcdef0123456789abcdef"), false);
});

test("rejects stale signed requests", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000) - 600);
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret-0123456789abcdef0123456789abcdef").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, body, "test-secret-0123456789abcdef0123456789abcdef"), false);
});

test("rejects weak scanner secrets", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "short").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, body, "short"), false);
});
