import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:net";
import { verifyRequest, scanWithClamd } from "./server.mjs";

async function mockClamd(reply) {
  const server = createServer(socket => {
    let buffer = Buffer.alloc(0);
    let commandReceived = false;
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!commandReceived) {
        const terminator = buffer.indexOf(0);
        if (terminator < 0) return;
        const command = buffer.subarray(0, terminator).toString("utf8");
        if (command !== "zINSTREAM") return socket.destroy();
        buffer = buffer.subarray(terminator + 1);
        commandReceived = true;
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (buffer.length < size + 4) return;
        buffer = buffer.subarray(size + 4);
        if (size === 0) {
          socket.end(Buffer.from("stream: " + reply + "\\0", "binary"));
          return;
        }
      }
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

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

test("streams file bytes to clamd and accepts a clean verdict", async t => {
  const mock = await mockClamd("OK");
  t.after(() => mock.server.close());
  assert.equal(await scanWithClamd(Buffer.from("safe"), "127.0.0.1", mock.port), "clean");
});

test("streams file bytes to clamd and detects infected verdicts", async t => {
  const mock = await mockClamd("Eicar-Test-Signature FOUND");
  t.after(() => mock.server.close());
  assert.equal(await scanWithClamd(Buffer.from("test signature"), "127.0.0.1", mock.port), "infected");
});

test("fails closed when clamd returns an error verdict", async t => {
  const mock = await mockClamd("INSTREAM size limit exceeded ERROR");
  t.after(() => mock.server.close());
  await assert.rejects(scanWithClamd(Buffer.from("oversize"), "127.0.0.1", mock.port));
});
