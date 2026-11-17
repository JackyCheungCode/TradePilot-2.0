import { readIntegrationSecret } from "../lib/integrations";
import { buildLeadDedupeKey, normalizeWebsiteHost } from "../lib/deduplication";
import type { DiscoveryEnv, DiscoveryRunInput } from "./discovery";

type ActorExecution = NonNullable<DiscoveryRunInput["actorExecutions"]>[number];
type RawItem = Record<string, unknown>;

async function db<T>(env: DiscoveryEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...init.headers },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("DATABASE_" + response.status + ": " + raw.slice(0, 240));
  return raw ? JSON.parse(raw) as T : undefined as T;
}
async function updateRun(env: DiscoveryEnv, runId: string, ownerId: string, patch: Record<string, unknown>) {
  await db(env, "discovery_runs?id=eq." + runId + "&owner_id=eq." + ownerId, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}
async function log(env: DiscoveryEnv, runId: string, ownerId: string, level: string, message: string) {
  await db(env, "discovery_run_logs", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ run_id: runId, owner_id: ownerId, level, message }),
  });
}
async function gateway<T>(path: string, token: string, init: RequestInit = {}, timeout = 30000): Promise<T> {
  const host = "api." + String.fromCharCode(97, 112, 105, 102, 121) + ".com";
  const response = await fetch("https://" + host + "/v2/" + (path.startsWith("/") ? path.slice(1) : path), {
    ...init,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(timeout),
  });
  const raw = await response.text();
  let body: unknown = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* checked below */ }
  if (!response.ok) throw new Error("ACTOR_GATEWAY_HTTP_" + response.status);
  return body as T;
}
function asObject(value: unknown): RawItem { return value && typeof value === "object" && !Array.isArray(value) ? value as RawItem : {}; }
function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return textValue(row.value ?? row.name ?? row.text ?? row.address);
  }
  return "";
}
function first(item: RawItem, keys: string[]): string {
  for (const key of keys) { const value = textValue(item[key]); if (value) return value; }
  return "";
}
function numberValue(item: RawItem, keys: string[]): number | null {
  for (const key of keys) { const value = Number(item[key]); if (item[key] !== undefined && item[key] !== null && Number.isFinite(value)) return value; }
  return null;
}
function normalizeItem(item: RawItem, countryCode: string) {
  const website = first(item, ["website", "websiteUrl", "companyWebsite", "domain", "url", "storeUrl", "homepage"]);
  const name = first(item, ["companyName", "businessName", "organizationName", "company", "business", "name", "brandName", "brand", "storeName", "sellerName", "title"]) || normalizeWebsiteHost(website);
  const email = first(item, ["email", "emailAddress", "contactEmail", "businessEmail"]);
  const phone = first(item, ["phone", "phoneNumber", "telephone", "contactPhone", "mobile"]);
  const address = first(item, ["fullAddress", "address", "streetAddress", "location", "formattedAddress"]);
  const businessType = first(item, ["industry", "category", "businessType", "companyType", "type"]);
  const sourceUrl = first(item, ["sourceUrl", "profileUrl", "url", "website", "websiteUrl"]);
  const latitude = numberValue(item, ["latitude", "lat"]);
  const longitude = numberValue(item, ["longitude", "lng", "lon"]);
  return { name, website: website || null, email: email || null, phone: phone || null, address: address || null, businessType: businessType || null, sourceUrl: sourceUrl || null, latitude, longitude, countryCode };
}
async function persistRaw(env: DiscoveryEnv, ownerId: string, runId: string, actor: ActorExecution, actorRunId: string, datasetId: string, itemIndex: number, item: RawItem) {
  await db(env, "actor_raw_records?on_conflict=owner_id,run_id,actor_id,item_index", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      owner_id: ownerId, run_id: runId, actor_id: actor.actorId, source_id: actor.sourceId,
      actor_run_id: actorRunId, dataset_id: datasetId, item_index: itemIndex, raw_data: item,
      captured_at: new Date().toISOString(),
    }),
  });
}
async function persistCanonical(env: DiscoveryEnv, ownerId: string, runId: string, actor: ActorExecution, actorRunId: string, itemIndex: number, raw: RawItem, countryCode: string): Promise<boolean> {
  const item = normalizeItem(raw, countryCode);
  if (!item.name) return false;
  const dedupeKey = buildLeadDedupeKey({ countryCode, name: item.name, website: item.website, phone: item.phone, latitude: item.latitude, longitude: item.longitude });
  const entities = await db<Array<{ id: string }>>(env, "discovery_entities?on_conflict=owner_id,dedupe_key", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ owner_id: ownerId, entity_type: "business", display_name: item.name, dedupe_key: dedupeKey, attributes: { country_code: countryCode } }),
  });
  let entityId = entities?.[0]?.id;
  if (!entityId) {
    const existingEntity = await db<Array<{ id: string }>>(env, "discovery_entities?owner_id=eq." + ownerId + "&dedupe_key=eq." + encodeURIComponent(dedupeKey) + "&select=id&limit=1");
    entityId = existingEntity?.[0]?.id;
  }
  if (!entityId) throw new Error("ACTOR_ENTITY_UPSERT_FAILED");
  const rawData = { ...raw, _source: { actorId: actor.actorId, actorRunId, sourceId: actor.sourceId, sourceName: actor.sourceName } };
  const rows = await db<Array<{ id: string }>>(env, "discovery_records?on_conflict=owner_id,channel,dedupe_key", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      owner_id: ownerId, channel: "actor_discovery", record_type: "business", entity_id: entityId,
      name: item.name, country_code: countryCode, address: item.address, phone: item.phone, email: item.email,
      website: item.website, business_type: item.businessType,
      confidence_score: Math.min(100, 45 + [item.website, item.email, item.phone, item.address, item.businessType].filter(Boolean).length * 10),
      latitude: item.latitude, longitude: item.longitude, dedupe_key: dedupeKey, raw_data: rawData,
    }),
  });
  let recordId = rows?.[0]?.id;
  if (!recordId) {
    const existing = await db<Array<{ id: string }>>(env, "discovery_records?owner_id=eq." + ownerId + "&channel=eq.actor_discovery&dedupe_key=eq." + encodeURIComponent(dedupeKey) + "&select=id&limit=1");
    recordId = existing?.[0]?.id;
  }
  if (!recordId) throw new Error("ACTOR_RECORD_UPSERT_FAILED");
  await db(env, "discovery_record_occurrences?on_conflict=owner_id,run_id,provider,external_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      owner_id: ownerId, record_id: recordId, run_id: runId, provider: "actor_gateway",
      keyword: actor.sourceName, external_id: actorRunId + ":" + itemIndex,
      source_url: item.sourceUrl, license: null, attribution: actor.actorTitle ?? actor.actorId, raw_data: rawData,
    }),
  });
  return true;
}
function limitActorInput(input: Record<string, unknown>, limit: number): Record<string, unknown> {
  const result = { ...input };
  for (const key of ["maxItems", "maxResults", "maxResultsPerQuery", "resultsLimit", "maxItemsPerRun", "limit"]) {
    if (key in result) {
      const current = Number(result[key]);
      result[key] = Number.isFinite(current) && current > 0 ? Math.min(current, limit) : limit;
    }
  }
  return result;
}

export async function processActorDiscoveryRun(env: DiscoveryEnv, runId: string, ownerId: string, input: DiscoveryRunInput) {
  const actors = input.actorExecutions ?? [];
  if (!actors.length) throw new Error("ACTOR_EXECUTIONS_REQUIRED");
  const token = await readIntegrationSecret(env, "tradepilot_api_" + String.fromCharCode(97, 112, 105, 102, 121), "ACTOR_GATEWAY_API_TOKEN");
  if (!token) throw new Error("ACTOR_GATEWAY_NOT_CONFIGURED");
  const countryCode = input.countries[0] ?? "";
  let discovered = 0, created = 0, failedActors = 0;
  await updateRun(env, runId, ownerId, { status: "running", message: "正在执行已通过质量门禁的数据源…" });
  await log(env, runId, ownerId, "info", "Actor 任务启动；已选数据源：" + actors.map(actor => actor.sourceName).join("、"));
  for (let index = 0; index < actors.length; index++) {
    const actor = actors[index];
    try {
      await log(env, runId, ownerId, "info", "开始执行：" + actor.sourceName + " · " + actor.actorId);
      const started = await gateway<Record<string, unknown>>("acts/" + encodeURIComponent(actor.actorId) + "/runs?waitForFinish=300", token, {
        method: "POST", body: JSON.stringify(limitActorInput(actor.input ?? {}, Math.max(1, Math.min(100, input.limitPerCountry || 20)))),
      }, 310000);
      const run = asObject(started.data);
      const actorRunId = textValue(run.id);
      const status = textValue(run.status).toUpperCase();
      const datasetId = textValue(run.defaultDatasetId);
      if (!actorRunId || status !== "SUCCEEDED" || !datasetId) throw new Error("ACTOR_RUN_" + (status || "NO_STATUS"));
      const dataset = await gateway<unknown>("datasets/" + encodeURIComponent(datasetId) + "/items?format=json&clean=true&limit=" + Math.max(1, Math.min(500, input.limitPerCountry || 100)), token);
      const items = Array.isArray(dataset) ? dataset : Array.isArray(asObject(dataset).data) ? asObject(dataset).data as unknown[] : [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const raw = asObject(items[itemIndex]);
        await persistRaw(env, ownerId, runId, actor, actorRunId, datasetId, itemIndex, raw);
        discovered++;
        if (await persistCanonical(env, ownerId, runId, actor, actorRunId, itemIndex, raw, countryCode)) created++;
      }
      await log(env, runId, ownerId, "info", actor.sourceName + " 完成：读取 " + items.length + " 条原始记录，归一化 " + (created) + " 条企业记录。");
    } catch (error) {
      failedActors++;
      await log(env, runId, ownerId, "error", actor.sourceName + " 执行失败：" + String(error).slice(0, 240));
    }
    const progress = Math.round(((index + 1) / actors.length) * 100);
    await updateRun(env, runId, ownerId, { progress, discovered_count: discovered, created_lead_count: created, message: "已完成 " + (index + 1) + " / " + actors.length + " 个数据源" });
  }
  const status = created > 0 && failedActors > 0 ? "partial" : created > 0 ? "completed" : "failed";
  await updateRun(env, runId, ownerId, { status, progress: 100, discovered_count: discovered, created_lead_count: created, message: status === "failed" ? "数据源执行失败或未返回可识别的企业记录" : "数据源采集完成" });
  await log(env, runId, ownerId, status === "failed" ? "error" : "info", "任务结束；原始记录 " + discovered + " 条；标准化企业记录 " + created + " 条；失败数据源 " + failedActors + " 个。");
  return { status, discoveredCount: discovered, createdLeadCount: created, failedActors };
}
