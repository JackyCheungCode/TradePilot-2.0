import { readIntegrationSecrets } from "./settings";

interface MediaWorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type Row = Record<string, unknown>;
interface MediaJob extends Row {
  id: string;
  owner_id: string;
  message_id: string;
  channel_connection_id: string | null;
  channel_type: "whatsapp" | "line" | "messenger" | "telegram";
  external_media_id: string;
  provider_url: string | null;
  mime_type_hint: string | null;
  original_file_name: string | null;
  size_bytes_hint: number | null;
  provider_metadata: Record<string, unknown>;
  attempts: number;
}
interface DownloadedMedia {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav",
  "video/mp4", "video/webm", "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const SECRET_KEYS = [
  "tradepilot_channel_whatsapp_access_token",
  "tradepilot_channel_line_access_token",
  "tradepilot_channel_messenger_page_access_token",
  "tradepilot_channel_telegram_bot_token",
];

async function db<T>(env: MediaWorkerEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("MEDIA_DB_" + response.status);
  return (raw ? JSON.parse(raw) : []) as T;
}

function allowedProviderUrl(raw: string, hosts: string[]): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !hosts.some(domain => host === domain || host.endsWith("." + domain))) {
    throw new Error("MEDIA_PROVIDER_URL_REJECTED");
  }
  return url;
}

function safeFileName(value: unknown): string {
  const raw = typeof value === "string" ? value.normalize("NFKC") : "attachment";
  const cleaned = raw.replace(/[\\/\\u0000-\\u001f\\u007f]/g, "_").replace(/^\\.+/, "").trim();
  return (cleaned || "attachment").slice(0, 255);
}

async function readBinary(response: Response): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error("MEDIA_PROVIDER_DOWNLOAD_FAILED");
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BYTES) throw new Error("MEDIA_TOO_LARGE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("MEDIA_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("MEDIA_EMPTY");
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function starts(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function sniffMime(bytes: Uint8Array, hint: string | null, fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts(bytes, [0x49, 0x44, 0x33]) || starts(bytes, [0xff, 0xfb]) || starts(bytes, [0xff, 0xf3])) return "audio/mpeg";
  if (starts(bytes, [0x4f, 0x67, 0x67, 0x53])) return "audio/ogg";
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE") return "audio/wav";
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    return hint === "audio/mp4" ? "audio/mp4" : "video/mp4";
  }
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    if (lower.endsWith(".docx") && hint === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return hint;
    if (lower.endsWith(".xlsx") && hint === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return hint;
    if (hint === "application/zip" || lower.endsWith(".zip")) return "application/zip";
    return null;
  }
  if (hint === "text/plain" && !bytes.slice(0, Math.min(bytes.length, 8192)).includes(0)) {
    return "text/plain";
  }
  return null;
}

async function providerDownload(job: MediaJob, secrets: Record<string, string>): Promise<{ response: Response; fileName: string; mimeHint: string | null }> {
  if (job.channel_type === "whatsapp") {
    const token = secrets.tradepilot_channel_whatsapp_access_token;
    if (!token) throw new Error("MEDIA_CHANNEL_TOKEN_MISSING");
    const metaUrl = new URL("https://graph.facebook.com/v26.0/" + encodeURIComponent(job.external_media_id));
    const metaResponse = await fetch(metaUrl, {
      headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(15000),
    });
    if (!metaResponse.ok) throw new Error("MEDIA_PROVIDER_METADATA_FAILED");
    const meta = await metaResponse.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) throw new Error("MEDIA_PROVIDER_METADATA_INVALID");
    const mediaUrl = allowedProviderUrl(meta.url, ["fbcdn.net", "fbsbx.com"]);
    const response = await fetch(mediaUrl, {
      headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(30000),
    });
    return { response, fileName: job.original_file_name || "whatsapp-attachment", mimeHint: meta.mime_type || job.mime_type_hint };
  }
  if (job.channel_type === "line") {
    const token = secrets.tradepilot_channel_line_access_token;
    if (!token) throw new Error("MEDIA_CHANNEL_TOKEN_MISSING");
    const url = new URL("https://api-data.line.me/v2/bot/message/" + encodeURIComponent(job.external_media_id) + "/content");
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(30000),
    });
    return { response, fileName: job.original_file_name || "line-attachment", mimeHint: job.mime_type_hint };
  }
  if (job.channel_type === "messenger") {
    if (!job.provider_url) throw new Error("MEDIA_PROVIDER_URL_MISSING");
    const url = allowedProviderUrl(job.provider_url, ["fbcdn.net", "fbsbx.com"]);
    const token = secrets.tradepilot_channel_messenger_page_access_token;
    const response = await fetch(url, {
      headers: token ? { Authorization: "Bearer " + token } : {},
      signal: AbortSignal.timeout(30000),
    });
    return { response, fileName: job.original_file_name || "messenger-attachment", mimeHint: job.mime_type_hint };
  }
  const token = secrets.tradepilot_channel_telegram_bot_token;
  if (!token) throw new Error("MEDIA_CHANNEL_TOKEN_MISSING");
  const getFileUrl = new URL("https://api.telegram.org/bot" + token + "/getFile");
  getFileUrl.searchParams.set("file_id", job.external_media_id);
  const metaResponse = await fetch(getFileUrl, { signal: AbortSignal.timeout(15000) });
  if (!metaResponse.ok) throw new Error("MEDIA_PROVIDER_METADATA_FAILED");
  const meta = await metaResponse.json() as { ok?: boolean; result?: { file_path?: string } };
  const filePath = meta.result?.file_path;
  if (meta.ok !== true || !filePath || filePath.startsWith("/") || filePath.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("MEDIA_PROVIDER_METADATA_INVALID");
  }
  const url = allowedProviderUrl("https://api.telegram.org/file/bot" + token + "/" + filePath, ["api.telegram.org"]);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const providerMeta = job.provider_metadata ?? {};
  return {
    response,
    fileName: job.original_file_name || (typeof providerMeta.file_name === "string" ? providerMeta.file_name : "telegram-attachment"),
    mimeHint: job.mime_type_hint,
  };
}

async function uploadObject(env: MediaWorkerEnv, path: string, media: DownloadedMedia): Promise<void> {
  const endpoint = new URL("/storage/v1/object/inbox-attachments/" + path.split("/").map(encodeURIComponent).join("/"), env.SUPABASE_URL);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": media.mimeType,
      "x-upsert": "true",
    },
    body: new Blob([media.bytes]),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("MEDIA_STORAGE_UPLOAD_FAILED");
}

async function deleteObject(env: MediaWorkerEnv, path: string): Promise<void> {
  const endpoint = new URL("/storage/v1/object/inbox-attachments/" + path.split("/").map(encodeURIComponent).join("/"), env.SUPABASE_URL);
  await fetch(endpoint, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY },
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);
}

async function processJob(env: MediaWorkerEnv, job: MediaJob, secrets: Record<string, string>): Promise<void> {
  let objectPath: string | null = null;
  let metadataSaved = false;
  try {
    const provider = await providerDownload(job, secrets);
    const bytes = await readBinary(provider.response);
    const fileName = safeFileName(provider.fileName || job.original_file_name);
    const mimeType = sniffMime(bytes, provider.mimeHint || job.mime_type_hint, fileName);
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) throw new Error("MEDIA_MIME_REJECTED");
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    objectPath = job.owner_id + "/" + job.message_id + "/" + job.id + "/" + fileName;
    const media: DownloadedMedia = { bytes, mimeType, fileName };
    await uploadObject(env, objectPath, media);
    const inserted = await db<Row[]>(env, "inbox_attachments?on_conflict=storage_bucket,storage_path", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        owner_id: job.owner_id,
        message_id: job.message_id,
        channel_connection_id: job.channel_connection_id,
        storage_bucket: "inbox-attachments",
        storage_path: objectPath,
        original_file_name: fileName,
        content_type: mimeType,
        file_size_bytes: bytes.byteLength,
        sha256_hex: sha256,
        scan_status: "pending",
        metadata: { channel_type: job.channel_type, media_job_id: job.id, scanner: "not_configured" },
      }),
    });
    if (!inserted.length) throw new Error("MEDIA_METADATA_SAVE_FAILED");
    metadataSaved = true;
    await db<Row[]>(env, "inbox_media_jobs?id=eq." + encodeURIComponent(job.id), {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", locked_until: null, last_error_code: null, updated_at: new Date().toISOString() }),
    });
  } catch (error) {
    if (objectPath && !metadataSaved) await deleteObject(env, objectPath);
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "MEDIA_PROCESSING_FAILED";
    const terminal = job.attempts >= 5 || ["MEDIA_TOO_LARGE","MEDIA_MIME_REJECTED","MEDIA_PROVIDER_URL_REJECTED"].includes(code);
    await db<Row[]>(env, "inbox_media_jobs?id=eq." + encodeURIComponent(job.id), {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: terminal ? "failed" : "queued",
        available_at: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000).toISOString(),
        locked_until: null,
        last_error_code: code,
        updated_at: new Date().toISOString(),
      }),
    });
  }
}

export async function processInboxMediaJobs(env: MediaWorkerEnv): Promise<void> {
  const secrets = await readIntegrationSecrets(SECRET_KEYS, env);
  const jobs = await db<MediaJob[]>(env, "rpc/inbox_claim_media_jobs", {
    method: "POST",
    body: JSON.stringify({ p_limit: 5 }),
  });
  for (const job of jobs) await processJob(env, job, secrets);
}
