import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const CLAMD_HOST = process.env.CLAMD_HOST || "clamav";
const CLAMD_PORT = Number(process.env.CLAMD_PORT || 3310);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 60;

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readLimitedBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { statusCode: 413 });
    chunks.push(bytes);
  }
  if (total === 0) throw Object.assign(new Error("BODY_EMPTY"), { statusCode: 400 });
  return Buffer.concat(chunks, total);
}

function verifySignature(headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32) return false;
  const timestamp = String(headers["x-scan-timestamp"] || "");
  const claimedHash = String(headers["x-scan-sha256"] || "").toLowerCase();
  const signature = String(headers["x-scan-signature"] || "").toLowerCase();
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(claimedHash) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + claimedHash).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function verifyRequest(headers, body, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!verifySignature(headers, secret, nowSeconds)) return false;
  const claimedHash = String(headers["x-scan-sha256"] || "").toLowerCase();
  const actualHash = createHash("sha256").update(body).digest("hex");
  return actualHash === claimedHash;
}

function scanWithClamd(bytes, host = CLAMD_HOST, port = CLAMD_PORT) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    socket.setTimeout(90_000, () => finish(new Error("CLAMD_TIMEOUT")));
    socket.on("error", () => finish(new Error("CLAMD_UNAVAILABLE")));
    socket.on("end", () => finish(new Error("CLAMD_EMPTY_RESPONSE")));
    socket.on("data", chunk => {
      response = Buffer.concat([response, chunk]);
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      const result = response.subarray(0, terminator).toString("utf8");
      if (result.endsWith(": OK")) finish(null, "clean");
      else if (result.includes(" FOUND")) finish(null, "infected");
      else finish(new Error("CLAMD_SCAN_FAILED"));
    });
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "binary"));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}

let activeScans = 0;
const MAX_CONCURRENT_SCANS = 2;

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") return json(response, 200, { ok: true });
  if (request.method !== "POST" || request.url !== "/scan") return json(response, 404, { error: "NOT_FOUND" });
  if (request.headers["content-type"] !== "application/octet-stream") return json(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE" });

  const secret = process.env.SCANNER_HMAC_SECRET || "";
  if (!verifySignature(request.headers, secret)) {
    response.setHeader("connection", "close");
    json(response, 401, { error: "UNAUTHORIZED" });
    request.resume();
    return;
  }
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    response.setHeader("retry-after", "15");
    return json(response, 503, { error: "SCANNER_BUSY" });
  }

  activeScans += 1;
  try {
    const body = await readLimitedBody(request);
    const claimedHash = String(request.headers["x-scan-sha256"] || "").toLowerCase();
    const actualHash = createHash("sha256").update(body).digest("hex");
    if (actualHash !== claimedHash) return json(response, 401, { error: "UNAUTHORIZED" });
    const status = await scanWithClamd(body);
    return json(response, 200, { status });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 503;
    const code = error?.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" :
      error?.message === "BODY_EMPTY" ? "BODY_EMPTY" : "SCANNER_UNAVAILABLE";
    return json(response, statusCode, { error: code });
  } finally {
    activeScans -= 1;
  }
});
server.requestTimeout = 100_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "0.0.0.0", () => {
    process.stdout.write("inbox-scanner listening on " + PORT + "\n");
  });
}

export { verifyRequest, verifySignature, scanWithClamd };
