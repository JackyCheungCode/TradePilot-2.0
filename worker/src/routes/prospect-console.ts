import { errorResponse, successResponse } from "../lib/http";

interface ConsoleEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type OccurrenceRow = {
  id: string;
  provider: string;
  captured_at: string;
  run?: { channel?: string } | null;
  record?: {
    id: string;
    entity_id?: string | null;
    status?: string;
    latitude?: number | null;
    longitude?: number | null;
    lead_id?: string | null;
  } | null;
};
async function authenticate(request: Request, env: ConsoleEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  return (await response.json() as { id?: string }).id ?? null;
}
async function db<T>(env: ConsoleEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("DATABASE_" + response.status + ": " + raw.slice(0, 300));
  return raw ? JSON.parse(raw) as T : [] as T;
}
function localDay(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}
function platformFor(channel: string, provider: string): { key: string; label: string } {
  if (channel === "map_local_businesses") {
    if (provider === "google_maps") return { key: "google_maps", label: "Google Maps" };
    if (provider === "openstreetmap") return { key: "openstreetmap", label: "OpenStreetMap" };
    return { key: "map:" + provider, label: "地图平台 · " + provider };
  }
  if (channel === "facebook") return { key: "facebook", label: "Facebook" };
  if (channel === "instagram") return { key: "instagram", label: "Instagram" };
  if (channel === "search_engine") return { key: "search:" + provider, label: "搜索引擎 · " + provider };
  if (channel === "agent") return { key: "agent", label: "内置 Agent" };
  return { key: channel || provider, label: channel || provider };
}
export async function handleProspectConsole(request: Request, env: ConsoleEnv): Promise<Response> {
  const ownerId = await authenticate(request, env);
  if (!ownerId) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !/^\\d{4}-\\d{2}-\\d{2}$/.test(from)) || (to && !/^\\d{4}-\\d{2}-\\d{2}$/.test(to))) {
    return errorResponse(request, "INVALID_DATE_RANGE", "日期范围格式无效。", 400);
  }
  try {
    const rows: OccurrenceRow[] = [];
    const select = "id,provider,captured_at,run:discovery_runs!discovery_record_occurrences_run_id_owner_id_fkey!inner(channel),record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey!inner(id,entity_id,status,latitude,longitude,lead_id)";
    for (let offset = 0; offset < 50000; offset += 1000) {
      const page = await db<OccurrenceRow[]>(env,
        "discovery_record_occurrences?owner_id=eq." + ownerId +
        "&is_removed=eq.false&select=" + encodeURIComponent(select) +
        "&record.status=not.in.(removed,discarded)&order=captured_at.asc&limit=1000&offset=" + offset);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const entities = new Set<string>();
    const converted = new Set<string>();
    const pending = new Set<string>();
    const platformEntities = new Map<string, { label: string; entities: Set<string> }>();
    const dailyEntities = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.record || !row.run || !row.captured_at) continue;
      const day = localDay(row.captured_at);
      if (from && day < from) continue;
      if (to && day > to) continue;
      const entityId = row.record.entity_id || row.record.id;
      entities.add(entityId);
      if (row.record.status === "promoted" || row.record.lead_id) converted.add(entityId);
      else pending.add(entityId);
      const platform = platformFor(row.run.channel ?? "", row.provider);
      if (!platformEntities.has(platform.key)) platformEntities.set(platform.key, { label: platform.label, entities: new Set() });
      platformEntities.get(platform.key)!.entities.add(entityId);
      if (!dailyEntities.has(day)) dailyEntities.set(day, new Set());
      dailyEntities.get(day)!.add(entityId);
    }
    const platforms = [...platformEntities.entries()]
      .map(([key, value]) => ({ key, label: value.label, count: value.entities.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const daily = [...dailyEntities.entries()]
      .map(([date, values]) => ({ date, count: values.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return successResponse(request, {
      metrics: {
        platformCount: platforms.length,
        prospectCount: entities.size,
        convertedCount: converted.size,
        pendingCount: [...pending].filter(id => !converted.has(id)).length,
      },
      platforms,
      daily,
      timezone: "Asia/Taipei",
      range: { from: from || null, to: to || null },
    });
  } catch (error) {
    return errorResponse(request, "PROSPECT_CONSOLE_READ_FAILED",
      error instanceof Error ? error.message : "读取潜客统计失败。", 502);
  }
}
