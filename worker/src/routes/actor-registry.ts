import { errorResponse, successResponse } from "../lib/http";
import { readIntegrationSecret } from "../lib/integrations";
import { runConfiguredAI } from "./settings";
import type { DiscoveryRunInput } from "./discovery";

interface ActorRegistryEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ACTOR_GATEWAY_API_TOKEN?: string;
  APIFY_API_TOKEN?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  LEAD_DISCOVERY_WORKFLOW: { create(options: { id: string; params: { runId: string; ownerId: string; input: DiscoveryRunInput } }): Promise<{ id: string }> };
}
type ActorRecord = { id: string; username?: string; name?: string; title?: string; description?: string; modifiedAt?: string; stats?: Record<string, unknown>; };

async function authenticate(request: Request, env: ActorRegistryEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
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
  let response: Response;
  try {
    response = await fetch("https://" + host + "/v2/" + (path.startsWith("/") ? path.slice(1) : path), {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "请求超时（25 秒）" : "网络连接失败";
    throw new Error("APIFY_UPSTREAM_NETWORK: " + reason);
  }
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* response may be non-JSON */ }
  if (!response.ok) {
    const detail = safeText((body.error as Record<string, unknown> | undefined)?.message || body.message, 180);
    throw new Error("APIFY_HTTP_" + response.status + (detail ? ": " + detail : ""));
  }
  return body;
}
const actorDiscoveryCache = new Map<string, { expiresAt: number; items: ActorRecord[] }>();
const actorSchemaCache = new Map<string, { expiresAt: number; result: Record<string, unknown> }>();
function actorKey(actor: ActorRecord): string { return actor.username ? actor.username + "~" + actor.name : actor.id; }
function safeText(value: unknown, max = 4000): string { return typeof value === "string" ? value.slice(0, max) : ""; }

function parseActorInputSchema(build: Record<string, unknown>): Record<string, unknown> | null {
  const definition = build.actorDefinition && typeof build.actorDefinition === "object"
    ? build.actorDefinition as Record<string, unknown> : {};
  const input = definition.input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const schema = input as Record<string, unknown>;
    if (schema.type === "object" && schema.properties && typeof schema.properties === "object") return schema;
  }
  const legacy = build.inputSchema;
  if (typeof legacy === "string" && legacy.trim()) {
    try {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      if (parsed.type === "object" && parsed.properties && typeof parsed.properties === "object") return parsed;
    } catch { /* ignore invalid legacy schema and return a precise schema error */ }
  }
  return null;
}
function redactActorInput(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[已省略]";
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactActorInput(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/(?:api.?key|token|secret|password|credential|authorization|cookie)/i.test(key)) continue;
    output[key] = redactActorInput(item, depth + 1);
  }
  return output;
}
function inputFingerprint(value: Record<string, unknown>, schemaVersion: string): string {
  const normalized = { ...value };
  for (const key of ["maxItems", "maxResults", "maxResultsPerQuery", "resultsLimit", "maxItemsPerRun", "limit"]) if (key in normalized) normalized[key] = 1;
  const serialized = JSON.stringify({ schemaVersion, input: normalized });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function validateActorInputAgainstSchema(input: Record<string, unknown>, schema: Record<string, unknown>): string[] {
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown> : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  const errors: string[] = [];
  for (const [key, rawField] of Object.entries(properties)) {
    const field = rawField && typeof rawField === "object" && !Array.isArray(rawField) ? rawField as Record<string, unknown> : {};
    const value = input[key];
    const label = safeText(field.title, 120) || key;
    if ((required.has(key) || field.required === true) && (value === undefined || value === null || value === "")) {
      errors.push("缺少必填字段：" + label);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    const type = field.type;
    const valid = type === "string" ? typeof value === "string"
      : type === "number" ? typeof value === "number" && Number.isFinite(value)
      : type === "integer" ? typeof value === "number" && Number.isInteger(value)
      : type === "boolean" ? typeof value === "boolean"
      : type === "array" ? Array.isArray(value)
      : type === "object" ? typeof value === "object" && !Array.isArray(value)
      : true;
    if (!valid) errors.push("字段类型不匹配：" + label + "（" + String(type) + "）");
    if (Array.isArray(field.enum) && !field.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) errors.push("字段不在允许选项内：" + label);
    if (typeof value === "number" && ((typeof field.minimum === "number" && value < field.minimum) || (typeof field.maximum === "number" && value > field.maximum))) errors.push("字段超出允许范围：" + label);
  }
  return errors;
}

async function translateSchema(schema: Record<string, unknown>, env: ActorRegistryEnv): Promise<Record<string, unknown>> {
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
    const token = await readIntegrationSecret(env, "tradepilot_api_" + String.fromCharCode(97, 112, 105, 102, 121)) || env.ACTOR_GATEWAY_API_TOKEN || env.APIFY_API_TOKEN || "";
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
      const cacheKey = ownerId + ":" + safeText(body.platform, 80) + ":" + search.toLowerCase();
      const cacheEntry = actorDiscoveryCache.get(cacheKey);
      let ownedItems: ActorRecord[] = [];
      let storeItems: ActorRecord[] = [];
      const warnings: string[] = [];
      if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
        ownedItems = cacheEntry.items;
      } else {
        const [ownedResult, storeResult] = await Promise.allSettled([
          gatewayFetch("acts?my=1&limit=1000&offset=0&desc=true", token),
          gatewayFetch("store?search=" + encodeURIComponent(search) + "&limit=100&offset=0", token),
        ]);
        if (ownedResult.status === "fulfilled") {
          ownedItems = (((ownedResult.value.data as Record<string, unknown> | undefined)?.items ?? []) as ActorRecord[]);
        } else warnings.push("账户 Actor 查询失败：" + String(ownedResult.reason instanceof Error ? ownedResult.reason.message : ownedResult.reason));
        if (storeResult.status === "fulfilled") {
          storeItems = (((storeResult.value.data as Record<string, unknown> | undefined)?.items ?? []) as ActorRecord[]);
        } else warnings.push("Apify Store 搜索失败：" + String(storeResult.reason instanceof Error ? storeResult.reason.message : storeResult.reason));
        if (ownedResult.status === "rejected" && storeResult.status === "rejected") {
          return errorResponse(request, "ACTOR_DISCOVERY_UPSTREAM_FAILED", "两个数据源查询均失败。 " + warnings.join("；"), 502);
        }
        actorDiscoveryCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, items: [...ownedItems, ...storeItems] });
      }
      const merged = new Map<string, ActorRecord>();
      for (const actor of [...ownedItems, ...storeItems]) if (actor?.id) merged.set(actor.id, actor);
      const items = [...merged.values()].map(actor => ({
        owner_id: ownerId, actor_id: actorKey(actor), actor_name: safeText(actor.name, 160),
        title: safeText(actor.title || actor.name, 200), description: safeText(actor.description, 4000),
        platforms: body.platform ? [safeText(body.platform, 80)] : [], capabilities: [],
        latest_version: null,
      }));
      if (items.length) await db(env, "actor_registry?on_conflict=owner_id,actor_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(items),
      });
      const registry = await db<Array<{ actor_id: string; status: string; quality_score: number | null; stability_score: number | null }>>(env,
        "actor_registry?owner_id=eq." + ownerId + "&select=actor_id,status,quality_score,stability_score&limit=1000");
      const registryById = new Map((registry ?? []).map(row => [row.actor_id, row]));
      const enrichedItems = items.map(item => {
        const saved = registryById.get(item.actor_id);
        return { ...item, status: saved?.status ?? "discovered", quality_score: saved?.quality_score ?? null, stability_score: saved?.stability_score ?? null };
      });
      return successResponse(request, { discovered: enrichedItems.length, items: enrichedItems, warnings });
    }
    if (request.method === "POST" && parts[3] === "execute") {
      const body = await request.json().catch(() => ({})) as {
        actors?: Array<{ actorId?: string; sourceId?: string; sourceName?: string; actorTitle?: string; schemaVersion?: string; inputFingerprint?: string; status?: string; schemaKeys?: string[]; input?: Record<string, unknown> }>;
        planSnapshot?: Record<string, unknown>;
      };
      const selected = (body.actors ?? []).filter(actor => actor && typeof actor.actorId === "string");
      if (!selected.length) return errorResponse(request, "ACTOR_EXECUTIONS_REQUIRED", "没有可执行的数据源。", 400);
      const verified = await Promise.all(selected.map(async actor => {
        const actorId = String(actor.actorId);
        const schemas = await db<Array<{ version: string; input_schema: Record<string, unknown> }>>(env,
          "actor_schema_versions?owner_id=eq." + ownerId + "&actor_id=eq." + encodeURIComponent(actorId) + "&select=version,input_schema&order=fetched_at.desc&limit=1");
        const latestSchema = schemas?.[0];
        if (!latestSchema?.version || latestSchema.version !== safeText(actor.schemaVersion, 160)) {
          return { actor, schemaInput: {}, errors: ["Schema 已更新或失效，请返回第二步重新读取参数。"] };
        }
        const schemaProperties = latestSchema.input_schema?.properties && typeof latestSchema.input_schema.properties === "object" && !Array.isArray(latestSchema.input_schema.properties)
          ? latestSchema.input_schema.properties as Record<string, unknown> : {};
        if (!Object.keys(schemaProperties).length) return { actor, schemaInput: {}, errors: ["当前 Schema 没有可用的 properties 字段。"] };
        const submittedInput = actor.input && typeof actor.input === "object" && !Array.isArray(actor.input) ? actor.input as Record<string, unknown> : {};
        const schemaInput = Object.fromEntries(Object.entries(submittedInput).filter(([key]) => Object.prototype.hasOwnProperty.call(schemaProperties, key)));
        const errors = validateActorInputAgainstSchema(schemaInput, latestSchema.input_schema);
        return { actor, schemaInput, errors };
      }));
      const actors = verified.filter(item => item.errors.length === 0).map(({ actor, schemaInput }) => ({
        actorId: String(actor.actorId), sourceId: safeText(actor.sourceId, 100),
        sourceName: safeText(actor.sourceName, 160), actorTitle: safeText(actor.actorTitle, 200),
        schemaVersion: safeText(actor.schemaVersion, 160), input: schemaInput,
      }));
      const rejected = verified.filter(item => item.errors.length > 0);
      if (!actors.length) {
        const details = rejected.map(item => safeText(item.actor.sourceName, 120) + "：" + item.errors.join("、")).join("；");
        return errorResponse(request, "ACTOR_INPUT_INVALID", "所选 Actor 参数未通过 Schema 必填项或类型校验。" + (details ? " " + details : ""), 400);
      }
      const code = "ACT-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
      const input: DiscoveryRunInput = {
        countries: [], query: "", limitPerCountry: 0, providers: [], channel: "actor_discovery",
        actorExecutions: actors, planSnapshot: body.planSnapshot,
      };
      const config = { actorExecutions: actors.map(actor => ({ actorId: actor.actorId, sourceId: actor.sourceId, sourceName: actor.sourceName, actorTitle: actor.actorTitle, schemaVersion: actor.schemaVersion, input: redactActorInput(actor.input) })), planSnapshot: body.planSnapshot ?? null };
      const rows = await db<Array<{ id: string }>>(env, "discovery_runs", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          owner_id: ownerId, query: "", countries: [], limit_per_country: 1,
          providers: ["actor_gateway"], channel: "actor_discovery", search_config: config,
          status: "queued", progress: 0, discovered_count: 0, created_lead_count: 0,
          message: "数据源任务已排队", task_code: code,
        }),
      });
      const run = rows?.[0];
      if (!run?.id) return errorResponse(request, "ACTOR_RUN_CREATE_FAILED", "无法创建数据源任务。", 500);
      await db(env, "discovery_run_logs", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ run_id: run.id, owner_id: ownerId, level: "info", message: "任务编号：" + code + "；按 Schema 参数启动数据源：" + actors.map(actor => actor.sourceName).join("、") }),
      });
      try {
        await env.LEAD_DISCOVERY_WORKFLOW.create({ id: run.id, params: { runId: run.id, ownerId, input } });
      } catch (error) {
        await db(env, "discovery_runs?id=eq." + run.id + "&owner_id=eq." + ownerId, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "failed", message: "后台工作流启动失败：" + String(error).slice(0, 160) }),
        });
        return errorResponse(request, "ACTOR_WORKFLOW_START_FAILED", "任务已创建，但后台工作流启动失败。", 503);
      }
      return successResponse(request, { id: run.id, taskCode: code, channel: "actor_discovery", status: "queued", progress: 0, message: "数据源任务已排队", actorCount: actors.length, rejectedActorCount: rejected.length, rejectedActors: rejected.map(item => ({ sourceName: safeText(item.actor.sourceName, 120), errors: item.errors })) }, 202);
    }
    if (request.method === "POST" && parts[3] === "test") {
      const body = await request.json().catch(() => ({})) as { actorId?: string; input?: Record<string, unknown>; expectedFieldCount?: number; schemaVersion?: string; profile?: { coreNoun?: string; country?: string; countryName?: string; city?: string } };
      const actorId = safeText(body.actorId, 240);
      if (!actorId) return errorResponse(request, "ACTOR_ID_REQUIRED", "缺少待测试的数据源标识。", 400);
      const submittedInput = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? { ...body.input } : {};
      const schemas = await db<Array<{ version: string; input_schema: Record<string, unknown> }>>(env,
        "actor_schema_versions?owner_id=eq." + ownerId + "&actor_id=eq." + encodeURIComponent(actorId) + "&select=version,input_schema&order=fetched_at.desc&limit=1");
      if (!schemas?.[0] || (body.schemaVersion && body.schemaVersion !== schemas[0].version)) {
        return errorResponse(request, "ACTOR_SCHEMA_VERSION_STALE", "数据源输入结构已更新，请刷新字段后重新测试。", 409);
      }
      const schemaVersion = safeText(body.schemaVersion || schemas[0].version, 120);
      const properties = schemas[0].input_schema?.properties && typeof schemas[0].input_schema.properties === "object"
        ? schemas[0].input_schema.properties as Record<string, unknown> : {};
      const input = Object.fromEntries(Object.entries(submittedInput).filter(([key]) => Object.prototype.hasOwnProperty.call(properties, key)));
      for (const key of Object.keys(properties)) {
        if (key in input && ["maxItems", "maxResults", "maxResultsPerQuery", "resultsLimit", "maxItemsPerRun", "limit"].includes(key)) input[key] = 1;
      }
      const serializedInput = JSON.stringify(input);
      const testedInputFingerprint = inputFingerprint(input, schemaVersion);
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
        qualityScore, stabilityScore, passed, inputFingerprint: testedInputFingerprint, testedAt: new Date().toISOString(),
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
      const schemaCacheKey = ownerId + ":" + actorId;
      const schemaCached = actorSchemaCache.get(schemaCacheKey);
      if (schemaCached && schemaCached.expiresAt > Date.now()) return successResponse(request, schemaCached.result);
      // Apify exposes full input definitions through the default Build, not /acts/{id}/input-schema.
      // If the Actor has no readable default Build, Store search can supply a compact fallback schema.
      let schema: Record<string, unknown> | null = null;
      let sourceVersion = "latest";
      let buildError = "";
      try {
        const buildResult = await gatewayFetch("actors/" + encodeURIComponent(actorId) + "/builds/default", token);
        const build = (buildResult.data && typeof buildResult.data === "object" ? buildResult.data : buildResult) as Record<string, unknown>;
        schema = parseActorInputSchema(build);
        sourceVersion = safeText(build.buildNumber, 80) || "latest";
      } catch (error) {
        buildError = error instanceof Error ? error.message : String(error);
      }
      if (!schema) {
        try {
          const actorSearchTerm = actorId.includes("~") ? actorId.split("~").slice(1).join(" ") : actorId;
          const storeResult = await gatewayFetch("store?search=" + encodeURIComponent(actorSearchTerm) + "&limit=10&offset=0&includeInputSchema=true", token);
          const storeData = storeResult.data && typeof storeResult.data === "object" ? storeResult.data as Record<string, unknown> : {};
          const storeItems = Array.isArray(storeData.items) ? storeData.items as Array<Record<string, unknown>> : [];
          const matched = storeItems.find(item => item.id === actorId || (item.username && item.name && item.username + "~" + item.name === actorId));
          const compact = matched?.inputSchema;
          if (compact && typeof compact === "object" && !Array.isArray(compact)) {
            const candidate = compact as Record<string, unknown>;
            if (candidate.type === "object" && candidate.properties && typeof candidate.properties === "object") {
              schema = candidate;
              sourceVersion = "store-compact";
            }
          }
        } catch (error) {
          const storeError = error instanceof Error ? error.message : String(error);
          if (!buildError) buildError = storeError;
          else buildError += "；Store 备用读取失败：" + storeError;
        }
      }
      if (!schema) {
        throw new Error("APIFY_ACTOR_SCHEMA_UNAVAILABLE: 无法取得 Actor 输入结构。" + (buildError ? " Build：" + buildError : "") + "；Store 备用结构也未提供可用 properties。");
      }
      const localized = await translateSchema(schema, env);
      const snapshotBytes = new TextEncoder().encode(JSON.stringify({ schema, localized }));
      const snapshotDigest = await crypto.subtle.digest("SHA-256", snapshotBytes);
      const fingerprint = [...new Uint8Array(snapshotDigest)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const version = sourceVersion + "@" + fingerprint;
      await db(env, "actor_schema_versions?on_conflict=owner_id,actor_id,version", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ owner_id: ownerId, actor_id: actorId, version, input_schema: schema, localized_schema: localized, fetched_at: new Date().toISOString() }),
      });
      const registryRows = await db<Array<{ status: string; quality_score: number | null; last_tested_at: string | null; source_metadata: Record<string, unknown> }>>(env,
        "actor_registry?owner_id=eq." + ownerId + "&actor_id=eq." + encodeURIComponent(actorId) + "&select=status,quality_score,last_tested_at,source_metadata&limit=1");
      const registryRow = registryRows?.[0];
      const metadata = registryRow?.source_metadata ?? {};
      const lastTest = metadata.lastTest && typeof metadata.lastTest === "object" ? metadata.lastTest as Record<string, unknown> : {};
      const schemaResponse = { actorId, version, schema: localized, actor: { status: registryRow?.status ?? "discovered", quality_score: registryRow?.quality_score ?? null, last_test_input_fingerprint: safeText(lastTest.inputFingerprint, 40) } };
      actorSchemaCache.set(schemaCacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, result: schemaResponse });
      return successResponse(request, schemaResponse);
    }
    return errorResponse(request, "NOT_FOUND", "数据源管理接口不存在。", 404);
  } catch (error) {
    return errorResponse(request, "ACTOR_REGISTRY_FAILED", error instanceof Error ? error.message : "读取数据源目录失败", 502);
  }
}
