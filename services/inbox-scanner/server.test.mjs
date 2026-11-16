import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyRequest } from "./server.mjs";

test("accepts a correctly signed scan request", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, body, "test-secret"), true);
});

test("rejects a modified body", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, Buffer.from("changed bytes"), "test-secret"), false);
});

test("rejects stale signed requests", () => {
  const body = Buffer.from("safe test bytes");
  const timestamp = String(Math.floor(Date.now() / 1000) - 600);
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", "test-secret").update(timestamp + "." + digest).digest("hex");
  assert.equal(verifyRequest({
    "x-scan-timestamp": timestamp,
    "x-scan-sha256": digest,
    "x-scan-signature": signature,
  }, body, "test-secret"), false);
});
