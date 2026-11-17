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
    if (request.method === "POST" && parts[3] === "test") {
      const body = await request.json().catch(() => ({})) as { actorId?: string; input?: Record<string, unknown>; expectedFieldCount?: number };
      const actorId = safeText(body.actorId, 240);
      if (!actorId) return errorResponse(request, "ACTOR_ID_REQUIRED", "缺少待测试的数据源标识。", 400);
      const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
      const serializedInput = JSON.stringify(input);
      if (serializedInput.length > 20000) return errorResponse(request, "ACTOR_INPUT_TOO_LARGE", "测试参数超出大小限制。", 400);
      const existing = await db<Array<{ id: string; source_metadata: Record<string, unknown> }>>(env,
        "actor_registry?owner_id=eq." + ownerId + "&actor_id=eq." + encodeURIComponent(actorId) + "&select=id,source_metadata&limit=1");
      if (!existing?.[0]) return errorResponse(request, "ACTOR_NOT_REGISTERED", "该数据源尚未加入当前账户目录。", 404);
      const host = "api." + String.fromCharCode(97, 112, 105, 102, 121) + ".com";
      const started = await fetch("https://" + host + "/v2/acts/" + encodeURIComponent(actorId) + "/runs?waitForFinish=300", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, Accept: "application/json", "Content-Type": "application/json" },
        body: serializedInput,
        signal: AbortSignal.timeout(310000),
      });
      const startRaw = await started.text();
      let startBody: Record<string, unknown> = {};
      try { startBody = startRaw ? JSON.parse(startRaw) as Record<string, unknown> : {}; } catch { /* checked below */ }
      if (!started.ok) return errorResponse(request, "ACTOR_TEST_START_FAILED", "数据源最小化测试启动失败（HTTP " + started.status + "）。", 502);
      const run = (startBody.data && typeof startBody.data === "object" ? startBody.data : {}) as Record<string, unknown>;
      const runStatus = safeText(run.status, 40).toUpperCase();
      const datasetId = safeText(run.defaultDatasetId, 160);
      let samples: unknown[] = [];
      if (runStatus === "SUCCEEDED" && datasetId) {
        const dataset = await gatewayFetch("datasets/" + encodeURIComponent(datasetId) + "/items?format=json&clean=true&limit=5", token);
        samples = Array.isArray(dataset) ? dataset : Array.isArray(dataset.data) ? dataset.data as unknown[] : [];
      }
      const objects = samples.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
      const fieldNames = [...new Set(objects.flatMap(item => Object.keys(item)))];
      const completeness = objects.length ? objects.reduce((sum, item) => {
        const fields = Object.values(item);
        return sum + (fields.length ? fields.filter(value => value !== null && value !== undefined && value !== "").length / fields.length : 0);
      }, 0) / objects.length : 0;
      const stabilityScore = runStatus === "SUCCEEDED" ? 100 : 0;
      const schemaCoverage = Math.min(100, fieldNames.length / Math.max(3, Number(body.expectedFieldCount) || 3) * 100);
      const qualityScore = Math.round(stabilityScore * 0.35 + completeness * 100 * 0.45 + schemaCoverage * 0.2);
      const passed = runStatus === "SUCCEEDED" && objects.length > 0 && fieldNames.length >= 2 && completeness >= 0.25 && qualityScore >= 60;
      const summary = {
        runId: safeText(run.id, 160), runStatus, sampleCount: objects.length, fieldCount: fieldNames.length,
        completeness: Math.round(completeness * 100), schemaCoverage: Math.round(schemaCoverage),
        qualityScore, stabilityScore, passed, testedAt: new Date().toISOString(),
      };
      const previousMetadata = existing[0].source_metadata && typeof existing[0].source_metadata === "object" ? existing[0].source_metadata : {};
      await db(env, "actor_registry?owner_id=eq." + ownerId + "&actor_id=eq." + encodeURIComponent(actorId), {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: passed ? "enabled" : "failed", quality_score: qualityScore, stability_score: stabilityScore,
          last_tested_at: summary.testedAt, source_metadata: { ...previousMetadata, lastTest: summary },
        }),
      });
      return successResponse(request, { ...summary, message: passed ? "最小化测试通过，已自动启用该数据源。" : "最小化测试未通过质量门禁，数据源不会进入正式执行。" });
    }
    if (request.method === "GET" && parts.length >= 4 && parts[3] === "schema") {
      const actorId = decodeURIComponent(parts.slice(4).join("/"));
      if (!actorId || actorId.length > 240) return errorResponse(request, "INVALID_ACTOR_ID", "数据源标识无效。", 400);
      const result = await gatewayFetch("acts/" + encodeURIComponent(actorId) + "/input-schema", token);
      const schema = (result.data && typeof result.data === "object" ? result.data : result) as Record<string, unknown>;
      const localized = await translateSchema(actorId, schema, env);
      const sourceVersion = safeText((schema.version as string) || "latest", 80);
      const snapshotBytes = new TextEncoder().encode(JSON.stringify({ schema, localized }));
      const snapshotDigest = await crypto.subtle.digest("SHA-256", snapshotBytes);
      const fingerprint = [...new Uint8Array(snapshotDigest)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const version = sourceVersion + "@" + fingerprint;
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
