import { errorResponse, successResponse } from "../lib/http";
import { readIntegrationSecret } from "../lib/integrations";
import { runConfiguredAI } from "./settings";

interface ActorRegistryEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ACTOR_GATEWAY_API_TOKEN?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}
type ActorRecord = { id: string; username?: string; name?: string; title?: string; description?: string; modifiedAt?: string; stats?: Record<string, unknown>; };

async function authenticate(request: Request, env: ActorRegistryEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}
async function db<T>(env: ActorRegistryEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...init.headers },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("DATABASE_" + response.status + ": " + raw.slice(0, 240));
  return raw ? JSON.parse(raw) as T : undefined as T;
}
async function gatewayFetch(path: string, token: string): Promise<Record<string, unknown>> {
  const host = "api." + String.fromCharCode(97, 112, 105, 102, 121) + ".com";
  const response = await fetch("https://" + host + "/v2/" + (path.startsWith("/") ? path.slice(1) : path), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* handled below */ }
  if (!response.ok) throw new Error("SOURCE_GATEWAY_HTTP_" + response.status);
  return body;
}
function actorKey(actor: ActorRecord): string { return actor.username ? actor.username + "~" + actor.name : actor.id; }
function safeText(value: unknown, max = 4000): string { return typeof value === "string" ? value.slice(0, max) : ""; }

async function translateSchema(actorId: string, schema: Record<string, unknown>, env: ActorRegistryEnv): Promise<Record<string, unknown>> {
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, unknown> : {};
  const entries = Object.entries(properties).slice(0, 120).map(([key, value]) => {
    const field = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { key, title: safeText(field.title, 160), description: safeText(field.description, 600), type: safeText(field.type, 40), required: Array.isArray(schema.required) && (schema.required as unknown[]).includes(key) };
  });
  if (!entries.length) return { ...schema, translatedProperties: {} };
  try {
    const prompt = [
      "你是 API 输入 Schema 本地化助手。只翻译字段标题和说明，不改变字段 key、类型、枚举值、默认值、必填状态或任何参数结构。",
      "请输出严格 JSON 对象，键为原始字段 key，值为 {titleZh, descriptionZh, usageZh}。无法可靠翻译时保留原文并标注待确认。",
      "Schema 字段：" + JSON.stringify(entries),
    ].join("\\n");
    const answer = await runConfiguredAI("actor_schema_translation", prompt, env);
    const start = answer.indexOf("{"), end = answer.lastIndexOf("}");
    if (start < 0 || end <= start) return { ...schema, translatedProperties: {} };
    const translated = JSON.parse(answer.slice(start, end + 1)) as Record<string, unknown>;
    const translatedProperties: Record<string, unknown> = {};
    for (const item of entries) {
      const result = translated[item.key];
      const row = result && typeof result === "object" ? result as Record<string, unknown> : {};
      translatedProperties[item.key] = {
        titleZh: safeText(row.titleZh, 160) || item.title || item.key,
        descriptionZh: safeText(row.descriptionZh, 600) || item.description || "原始 Schema 未提供字段说明",
        usageZh: safeText(row.usageZh, 600) || "请根据字段要求填写；不确定时保留默认值。",
        translationStatus: row.titleZh || row.descriptionZh ? "ai_suggested" : "needs_review",
      };
    }
    return { ...schema, translatedProperties };
  } catch {
    return { ...schema, translatedProperties: Object.fromEntries(entries.map(item => [item.key, {
      titleZh: item.title || item.key, descriptionZh: item.description || "原始 Schema 未提供字段说明",
      usageZh: "暂未取得可靠中文解释，请以原始字段说明为准。", translationStatus: "needs_review",
    }])) };
  }
}

export async function handleActorRegistry(request: Request, env: ActorRegistryEnv): Promise<Response> {
  const ownerId = await authenticate(request, env);
  if (!ownerId) return errorResponse(request, "UNAUTHORIZED", "请先登录后管理数据源。", 401);
  try {
    const token = await readIntegrationSecret(env, "tradepilot_api_" + String.fromCharCode(97, 112, 105, 102, 121), "ACTOR_GATEWAY_API_TOKEN");
    if (!token) return errorResponse(request, "ACTOR_GATEWAY_NOT_CONFIGURED", "请先在 AI 与 API 集成中配置数据采集平台访问令牌。", 400);
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (request.method === "GET" && parts.length === 3) {
      const rows = await db<Array<Record<string, unknown>>>(env, "actor_registry?owner_id=eq." + ownerId + "&select=id,actor_id,actor_name,title,description,platforms,capabilities,latest_version,quality_score,stability_score,status,last_tested_at&order=quality_score.desc.nullslast,actor_name.asc&limit=500");
      return successResponse(request, { items: rows ?? [] });
    }
    if (request.method === "POST" && parts[3] === "discover") {
      const body = await request.json().catch(() => ({})) as { platform?: string; query?: string };
      const search = safeText(body.query || body.platform, 120).trim();
      if (!search) return errorResponse(request, "SEARCH_REQUIRED", "请提供目标平台或能力关键词。", 400);
      const [owned, store] = await Promise.all([
        gatewayFetch("acts?my=1&limit=1000&offset=0&desc=true", token),
        gatewayFetch("store?search=" + encodeURIComponent(search) + "&limit=100&offset=0", token),
      ]);
      const ownedItems = ((owned.data as Record<string, unknown> | undefined)?.items ?? []) as ActorRecord[];
      const storeItems = ((store.data as Record<string, unknown> | undefined)?.items ?? []) as ActorRecord[];
      const merged = new Map<string, ActorRecord>();
      for (const actor of [...ownedItems, ...storeItems]) if (actor?.id) merged.set(actor.id, actor);
      const items = [...merged.values()].map(actor => ({
        owner_id: ownerId, actor_id: actorKey(actor), actor_name: safeText(actor.name, 160),
        title: safeText(actor.title || actor.name, 200), description: safeText(actor.description, 4000),
        platforms: body.platform ? [safeText(body.platform, 80)] : [], capabilities: [],
        latest_version: null, status: "discovered", source_metadata: { modifiedAt: actor.modifiedAt ?? null, stats: actor.stats ?? null },
      }));
      if (items.length) await db(env, "actor_registry?on_conflict=owner_id,actor_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(items),
      });
      return successResponse(request, { discovered: items.length, items });
    }
    if (request.method === "GET" && parts.length >= 4 && parts[3] === "schema") {
      const actorId = decodeURIComponent(parts.slice(4).join("/"));
      if (!actorId || actorId.length > 240) return errorResponse(request, "INVALID_ACTOR_ID", "数据源标识无效。", 400);
      const result = await gatewayFetch("acts/" + encodeURIComponent(actorId) + "/input-schema", token);
      const schema = (result.data && typeof result.data === "object" ? result.data : result) as Record<string, unknown>;
      const localized = await translateSchema(actorId, schema, env);
      const version = safeText((schema.version as string) || "latest", 80);
      await db(env, "actor_schema_versions?on_conflict=owner_id,actor_id,version", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ owner_id: ownerId, actor_id: actorId, version, input_schema: schema, localized_schema: localized, fetched_at: new Date().toISOString() }),
      });
      return successResponse(request, { actorId, version, schema: localized });
    }
    return errorResponse(request, "NOT_FOUND", "数据源管理接口不存在。", 404);
  } catch (error) {
    return errorResponse(request, "ACTOR_REGISTRY_FAILED", error instanceof Error ? error.message : "读取数据源目录失败", 502);
  }
}
