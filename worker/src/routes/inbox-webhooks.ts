import { readIntegrationSecrets } from "./settings";

type Channel = "whatsapp" | "line" | "messenger" | "telegram";
type Row = Record<string, unknown>;
interface WebhookEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
interface Connection {
  id: string;
  owner_id: string;
  channel_type: Channel;
  external_account_id: string | null;
  connection_status: string;
}
interface NormalizedEvent {
  eventId: string;
  messageId: string;
  externalUserId: string;
  displayName: string | null;
  username: string | null;
  content: string;
  contentType: "text" | "image" | "file" | "audio" | "video";
  occurredAt: string;
  eventType: string;
  receiptStatus?: "sent" | "delivered" | "read" | "failed";
  errorCode?: string | null;
  metadata: Record<string, unknown>;
}

const secretNames = [
  "tradepilot_channel_whatsapp_app_secret",
  "tradepilot_channel_whatsapp_verify_token",
  "tradepilot_channel_messenger_app_secret",
  "tradepilot_channel_messenger_verify_token",
  "tradepilot_channel_line_secret",
  "tradepilot_channel_telegram_webhook_secret",
  "tradepilot_channel_telegram_bot_token",
];

async function db<T>(env: WebhookEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("INBOX_WEBHOOK_DB_" + response.status);
  return (raw ? JSON.parse(raw) : []) as T;
}

function equalConstantTime(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function hmac(secret: string, body: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readLimitedBody(request: Request, maxBytes = 1024 * 1024): Promise<Uint8Array | null> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > maxBytes) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function timestamp(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 1e12 ? numeric * 1000 : numeric).toISOString();
  return new Date().toISOString();
}

function contentType(value: unknown): NormalizedEvent["contentType"] {
  const type = String(value ?? "").toLowerCase();
  if (["image", "photo", "sticker"].includes(type)) return "image";
  if (["audio", "voice", "ptt"].includes(type)) return "audio";
  if (["video", "animation"].includes(type)) return "video";
  if (["document", "file"].includes(type)) return "file";
  return "text";
}

function parseWhatsApp(payload: Row, connection: Connection): NormalizedEvent[] {
  const result: NormalizedEvent[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry as Row[] : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes as Row[] : [];
    for (const change of changes) {
      const value = (change.value && typeof change.value === "object" ? change.value : {}) as Row;
      const metadata = (value.metadata && typeof value.metadata === "object" ? value.metadata : {}) as Row;
      if (String(metadata.phone_number_id ?? "") !== String(connection.external_account_id ?? "")) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts as Row[] : [];
      const names = new Map<string, string>();
      for (const contact of contacts) {
        const profile = (contact.profile && typeof contact.profile === "object" ? contact.profile : {}) as Row;
        if (typeof contact.wa_id === "string" && typeof profile.name === "string") names.set(contact.wa_id, profile.name);
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses as Row[] : [];
      for (const status of statuses) {
        const messageId = typeof status.id === "string" ? status.id : "";
        const state = String(status.status ?? "");
        if (!messageId || !["sent", "delivered", "read", "failed"].includes(state)) continue;
        const errors = Array.isArray(status.errors) ? status.errors as Row[] : [];
        const firstError = errors[0] ?? {};
        result.push({
          eventId: "status:" + messageId + ":" + state + ":" + String(status.timestamp ?? ""),
          messageId, externalUserId: typeof status.recipient_id === "string" ? status.recipient_id : "",
          displayName: null, username: null, content: "", contentType: "text",
          occurredAt: timestamp(status.timestamp), eventType: "status",
          receiptStatus: state as NormalizedEvent["receiptStatus"],
          errorCode: firstError.code == null ? null : String(firstError.code).slice(0, 100),
          metadata: { provider: "whatsapp", status: state },
        });
      }
      const messages = Array.isArray(value.messages) ? value.messages as Row[] : [];
      for (const message of messages) {
        if (typeof message.id !== "string" || typeof message.from !== "string") continue;
        const type = String(message.type ?? "text");
        const contentObj = (message[type] && typeof message[type] === "object" ? message[type] : {}) as Row;
        const textObj = (message.text && typeof message.text === "object" ? message.text : {}) as Row;
        const body = typeof textObj.body === "string" ? textObj.body : "[" + type + "]";
        result.push({
          eventId: message.id, messageId: message.id, externalUserId: message.from,
          displayName: names.get(message.from) ?? null, username: null,
          content: body.slice(0, 20000), contentType: contentType(type),
          occurredAt: timestamp(message.timestamp), eventType: "message",
          metadata: { provider: "whatsapp", message_type: type, media_id: typeof contentObj.id === "string" ? contentObj.id : null,
            mime_type: typeof contentObj.mime_type === "string" ? contentObj.mime_type : null },
        });
      }
    }
  }
  return result;
}

function parseMessenger(payload: Row, connection: Connection): NormalizedEvent[] {
  const result: NormalizedEvent[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry as Row[] : [];
  for (const entry of entries) {
    if (String(entry.id ?? "") !== String(connection.external_account_id ?? "")) continue;
    const messaging = Array.isArray(entry.messaging) ? entry.messaging as Row[] : [];
    for (const event of messaging) {
      const sender = (event.sender && typeof event.sender === "object" ? event.sender : {}) as Row;
      const message = (event.message && typeof event.message === "object" ? event.message : {}) as Row;
      if (message.is_echo === true || typeof sender.id !== "string" || typeof message.mid !== "string") continue;
      const attachments = Array.isArray(message.attachments) ? message.attachments as Row[] : [];
      const firstAttachment = attachments[0] ?? {};
      const type = String(firstAttachment.type ?? "text");
      const content = typeof message.text === "string" ? message.text :
        attachments.length ? "[" + type + "]" : "";
      if (!content) continue;
      result.push({
        eventId: message.mid, messageId: message.mid, externalUserId: sender.id,
        displayName: null, username: null, content: content.slice(0, 20000),
        contentType: contentType(type), occurredAt: timestamp(event.timestamp),
        eventType: "message",
        metadata: { provider: "messenger", attachment_type: attachments.length ? type : null },
      });
    }
  }
  return result;
}

function parseLine(payload: Row, connection: Connection): NormalizedEvent[] {
  if (String(payload.destination ?? "") !== String(connection.external_account_id ?? "")) return [];
  const events = Array.isArray(payload.events) ? payload.events as Row[] : [];
  const result: NormalizedEvent[] = [];
  for (const event of events) {
    if (event.type !== "message") continue;
    const message = (event.message && typeof event.message === "object" ? event.message : {}) as Row;
    const source = (event.source && typeof event.source === "object" ? event.source : {}) as Row;
    const externalUserId = source.userId ?? source.groupId ?? source.roomId;
    if (typeof message.id !== "string" || typeof externalUserId !== "string") continue;
    const type = String(message.type ?? "text");
    const text = typeof message.text === "string" ? message.text : "[" + type + "]";
    result.push({
      eventId: message.id, messageId: message.id, externalUserId,
      displayName: null, username: null, content: text.slice(0, 20000),
      contentType: contentType(type), occurredAt: timestamp(event.timestamp),
      eventType: "message",
      metadata: { provider: "line", message_type: type, source_type: source.type ?? null,
        reply_token_available: typeof event.replyToken === "string" },
    });
  }
  return result;
}

function parseTelegram(payload: Row): NormalizedEvent[] {
  const updateId = payload.update_id;
  if (updateId === undefined || updateId === null) return [];
  const message = (payload.message && typeof payload.message === "object" ? payload.message :
    payload.edited_message && typeof payload.edited_message === "object" ? payload.edited_message : {}) as Row;
  const chat = (message.chat && typeof message.chat === "object" ? message.chat : {}) as Row;
  const from = (message.from && typeof message.from === "object" ? message.from : {}) as Row;
  if (chat.id === undefined || message.message_id === undefined || from.is_bot === true) return [];
  const type = message.photo ? "photo" : message.video ? "video" :
    message.voice || message.audio ? "audio" : message.document ? "document" : "text";
  const text = typeof message.text === "string" ? message.text :
    typeof message.caption === "string" ? message.caption : "[" + type + "]";
  const displayName = [from.first_name, from.last_name].filter(value => typeof value === "string").join(" ") || null;
  return [{
    eventId: String(updateId), messageId: String(chat.id) + ":" + String(message.message_id),
    externalUserId: String(chat.id), displayName,
    username: typeof from.username === "string" ? from.username : null,
    content: text.slice(0, 20000), contentType: contentType(type),
    occurredAt: timestamp(message.date), eventType: "message",
    metadata: { provider: "telegram", chat_type: chat.type ?? null, sender_user_id: from.id ?? null,
      message_id: message.message_id },
  }];
}

async function getConnection(env: WebhookEnv, id: string, channel: Channel): Promise<Connection | null> {
  const rows = await db<Connection[]>(env,
    "inbox_channel_connections?select=id,owner_id,channel_type,external_account_id,connection_status&id=eq." +
    id + "&channel_type=eq." + channel + "&limit=1");
  return rows[0] ?? null;
}

async function markConnectionVerified(env: WebhookEnv, connection: Connection): Promise<void> {
  await db<Row[]>(env, "inbox_channel_connections?id=eq." + connection.id + "&owner_id=eq." + connection.owner_id, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ connection_status: "connected", last_verified_at: new Date().toISOString(), last_error: null }),
  });
}

async function handleVerification(request: Request, channel: Channel, secrets: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  if (channel !== "whatsapp" && channel !== "messenger") return new Response("Method Not Allowed", { status: 405 });
  const mode = url.searchParams.get("hub.mode") ?? url.searchParams.get("hub_mode");
  const token = url.searchParams.get("hub.verify_token") ?? url.searchParams.get("hub_verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? url.searchParams.get("hub_challenge");
  const expected = channel === "whatsapp" ? secrets.tradepilot_channel_whatsapp_verify_token :
    secrets.tradepilot_channel_messenger_verify_token;
  if (mode !== "subscribe" || !expected || !token || !equalConstantTime(token, expected) || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function verifyTelegramBot(connection: Connection, secrets: Record<string, string>): Promise<boolean> {
  const token = secrets.tradepilot_channel_telegram_bot_token;
  if (!token || !connection.external_account_id) return false;
  const response = await fetch("https://api.telegram.org/bot" + token + "/getMe", {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: { id?: number } };
  return payload.ok === true && String(payload.result?.id ?? "") === connection.external_account_id;
}

async function verifySignature(channel: Channel, request: Request, raw: Uint8Array, secrets: Record<string, string>): Promise<boolean> {
  if (channel === "whatsapp" || channel === "messenger") {
    const secret = channel === "whatsapp" ? secrets.tradepilot_channel_whatsapp_app_secret :
      secrets.tradepilot_channel_messenger_app_secret;
    const received = request.headers.get("X-Hub-Signature-256") ?? "";
    if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(received)) return false;
    return equalConstantTime("sha256=" + toHex(await hmac(secret, raw)), received.toLowerCase());
  }
  if (channel === "line") {
    const secret = secrets.tradepilot_channel_line_secret;
    const received = request.headers.get("X-Line-Signature") ?? "";
    if (!secret || !received) return false;
    return equalConstantTime(toBase64(await hmac(secret, raw)), received);
  }
  const secret = secrets.tradepilot_channel_telegram_webhook_secret;
  const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  return Boolean(secret && received && equalConstantTime(secret, received));
}

async function claimEvent(env: WebhookEnv, connection: Connection, event: NormalizedEvent): Promise<boolean> {
  const inserted = await db<Row[]>(env,
    "inbox_webhook_events?on_conflict=channel_connection_id,external_event_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        owner_id: connection.owner_id, channel_connection_id: connection.id,
        channel_type: connection.channel_type, external_event_id: event.eventId,
        event_type: event.eventType, status: "processing",
        payload: event,
      }),
    });
  if (inserted.length) return true;
  const existing = await db<Row[]>(env,
    "inbox_webhook_events?select=id,status&channel_connection_id=eq." + connection.id + "&external_event_id=eq." + encodeURIComponent(event.eventId) + "&limit=1");
  const row = existing[0];
  if (!row || row.status !== "failed") return false;
  const reclaimed = await db<Row[]>(env,
    "inbox_webhook_events?id=eq." + String(row.id) + "&status=eq.failed",
    {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "processing", payload: event, error_code: null }),
    });
  return reclaimed.length > 0;
}

async function patchEvent(env: WebhookEnv, connection: Connection, eventId: string, patch: Row): Promise<void> {
  await db<Row[]>(env,
    "inbox_webhook_events?channel_connection_id=eq." + connection.id +
    "&external_event_id=eq." + encodeURIComponent(eventId),
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
}

async function processEvent(env: WebhookEnv, connection: Connection, event: NormalizedEvent): Promise<void> {
  if (!event.eventId) return;
  const claimed = await claimEvent(env, connection, event);
  if (!claimed) return;

  try {
    if (event.eventType === "status" && event.receiptStatus) {
      await db<Row>(env, "rpc/inbox_process_webhook_status", {
        method: "POST",
        body: JSON.stringify({
          p_event_id: (await db<Row[]>(env,
            "inbox_webhook_events?select=id&channel_connection_id=eq." + connection.id +
            "&external_event_id=eq." + encodeURIComponent(event.eventId) + "&limit=1"))[0]?.id,
          p_owner_id: connection.owner_id,
          p_message_id: event.messageId,
          p_status: event.receiptStatus,
          p_occurred_at: event.occurredAt,
          p_error_code: event.errorCode ?? null,
        }),
      });
      return;
    }
    if (!event.externalUserId) {
      await patchEvent(env, connection, event.eventId, { status: "ignored", payload: {} });
      return;
    }
    const identities = await db<Row[]>(env,
      "inbox_customer_identities?select=id,contact_id,external_user_id&owner_id=eq." + connection.owner_id +
      "&channel_type=eq." + connection.channel_type + "&external_user_id=eq." +
      encodeURIComponent(event.externalUserId) + "&or=" +
      encodeURIComponent("(channel_connection_id.eq." + connection.id + ",channel_connection_id.is.null)") + "&limit=1");
    const identity = identities[0];
    if (!identity) {
      await patchEvent(env, connection, event.eventId, {
        status: "unmatched", payload: event, error_code: "CUSTOMER_IDENTITY_NOT_LINKED",
      });
      return;
    }

    await db<Row>(env, "rpc/inbox_process_webhook_event", {
      method: "POST",
      body: JSON.stringify({
        p_event_id: (await db<Row[]>(env,
          "inbox_webhook_events?select=id&channel_connection_id=eq." + connection.id +
          "&external_event_id=eq." + encodeURIComponent(event.eventId) + "&limit=1"))[0]?.id,
        p_owner_id: connection.owner_id,
        p_contact_id: identity.contact_id,
        p_identity_id: identity.id,
      }),
    });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "INBOX_WEBHOOK_PROCESS_FAILED";
    await patchEvent(env, connection, event.eventId, { status: "failed", error_code: code });
    throw error;
  }
}

export async function handleInboxWebhook(request: Request, env: WebhookEnv): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/v1\/inbox\/webhooks\/(whatsapp|line|messenger|telegram)\/([0-9a-f-]{36})$/i);
  if (!match) return new Response("Not Found", { status: 404 });
  const channel = match[1].toLowerCase() as Channel;
  const connectionId = match[2];
  try {
    const connection = await getConnection(env, connectionId, channel);
    if (!connection || !["pending", "connected"].includes(connection.connection_status)) {
      return new Response("Webhook connection not found", { status: 404 });
    }
    const secrets = await readIntegrationSecrets(secretNames, env);
    if (request.method === "GET") {
      const verification = await handleVerification(request, channel, secrets);
      if (verification.status === 200) await markConnectionVerified(env, connection);
      return verification;
    }
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const raw = await readLimitedBody(request);
    if (!raw) return new Response("Payload Too Large", { status: 413 });
    if (!await verifySignature(channel, request, raw, secrets)) return new Response("Unauthorized", { status: 401 });
    if (channel === "telegram" && !await verifyTelegramBot(connection, secrets)) return new Response("Webhook bot mismatch", { status: 403 });
    let payload: Row;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw)) as Row;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (channel === "whatsapp") {
      const entries = Array.isArray(payload.entry) ? payload.entry as Row[] : [];
      const matched = entries.some(entry => Array.isArray(entry.changes) &&
        (entry.changes as Row[]).some(change => {
          const value = change.value && typeof change.value === "object" ? change.value as Row : {};
          const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata as Row : {};
          return String(metadata.phone_number_id ?? "") === String(connection.external_account_id ?? "");
        }));
      if (!matched) return new Response("Webhook account mismatch", { status: 403 });
    }
    if (channel === "messenger") {
      const entries = Array.isArray(payload.entry) ? payload.entry as Row[] : [];
      if (!entries.some(entry => String(entry.id ?? "") === String(connection.external_account_id ?? ""))) {
        return new Response("Webhook account mismatch", { status: 403 });
      }
    }
    if (channel === "line" && String(payload.destination ?? "") !== String(connection.external_account_id ?? "")) {
      return new Response("Webhook account mismatch", { status: 403 });
    }
    await markConnectionVerified(env, connection);
    let events: NormalizedEvent[] = [];
    if (channel === "whatsapp") events = parseWhatsApp(payload, connection);
    if (channel === "messenger") events = parseMessenger(payload, connection);
    if (channel === "line") events = parseLine(payload, connection);
    if (channel === "telegram") events = parseTelegram(payload);
    for (const event of events) await processEvent(env, connection, event);
    return new Response(JSON.stringify({ received: true, processed: events.length }), {
      status: 200, headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response("Webhook processing failed", { status: 500 });
  }
}
