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
    name?: string | null;
    record_type?: string | null;
    country_code?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    confidence_score?: number | null;
    raw_data?: Record<string, unknown> | null;
  } | null;
};
async function authenticate(request: Request, env: ConsoleEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  return (await response.json() as { id?: string }).id ?? null;
}
async function db<T>(env: ConsoleEnv, path: string): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("DATABASE_" + response.status + ": " + raw.slice(0, 300));
  return raw ? JSON.parse(raw) as T : [] as T;
}
function localDay(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
// Canonical identity fallback for legacy discovery records without entity_id.
function canonicalEntityKey(record: NonNullable<OccurrenceRow["record"]>): string {
  if (record.entity_id) return record.entity_id;
  const raw = record.raw_data ?? {};
  const facebook = raw.facebook && typeof raw.facebook === "object" ? raw.facebook as Record<string, unknown> : {};
  const facebookRaw = facebook.raw && typeof facebook.raw === "object" ? facebook.raw as Record<string, unknown> : {};
  const instagram = raw.instagram && typeof raw.instagram === "object" ? raw.instagram as Record<string, unknown> : {};
  const instagramRaw = instagram.raw && typeof instagram.raw === "object" ? instagram.raw as Record<string, unknown> : {};
  const facebookId = raw.facebookId ?? facebookRaw.id;
  if (facebookId) return "facebook:" + String(facebookId).trim().toLowerCase();
  const instagramId = raw.instagramId ?? instagramRaw.id ?? instagramRaw.username ?? raw.username;
  if (instagramId) return "instagram:" + String(instagramId).trim().toLowerCase();
  const lastSearch = raw.last_search_result && typeof raw.last_search_result === "object"
    ? raw.last_search_result as Record<string, unknown> : {};
  const sourceUrl = String(record.website ?? raw.website ?? raw.url ?? lastSearch.url ?? "");
  if (sourceUrl) {
    try { return "domain:" + new URL(sourceUrl.startsWith("http") ? sourceUrl : "https://" + sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); }
    catch { /* continue to stable phone/name fallback */ }
  }
  const phone = String(record.phone ?? "").replace(/\D/g, "");
  if (phone.length >= 8) return "phone:" + phone;
  const name = String(record.name ?? "").normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  if (name) return "name:" + String(record.country_code ?? "") + ":" + name + ":" + String(record.address ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  return "record:" + record.id;
}
function platformFor(channel: string, provider: string): { key: string; label: string } {
  if (channel === "map_local_businesses") return { key: "google_maps", label: "Google Maps" };
  if (channel === "facebook") return { key: "facebook", label: "Facebook Pages" };
  if (channel === "instagram") return { key: "instagram", label: "Instagram" };
  if (channel === "search_engine") return { key: "search_engine", label: "搜索引擎" };
  if (channel === "agent") return { key: "agent", label: "内置 Agent" };
  return { key: channel || provider, label: channel || provider };
}
function sourceDetails(channel: string, rawData?: Record<string, unknown> | null): { platform: string; fields: Array<{ label: string; value: string }> } | null {
  if (!rawData) return null;
  const nestedKey = channel === "facebook" ? "facebook" : channel === "instagram" ? "instagram" : channel === "search_engine" ? "last_search_result" : "";
  const nested = nestedKey ? rawData[nestedKey] as Record<string, unknown> | undefined : undefined;
  const source = nested && typeof nested === "object" && nested.raw && typeof nested.raw === "object"
    ? nested.raw as Record<string, unknown>
    : nested && typeof nested === "object" ? nested : rawData;
  const keys: Record<string, string[]> = {
    map_local_businesses: ["rating", "user_rating_count", "business_status", "types", "place_id", "formatted_address"],
    facebook: ["id", "url", "searchType", "isVerified", "description", "followers", "likes", "location", "category", "actorId"],
    instagram: ["username", "fullName", "followersCount", "followingCount", "postsCount", "biography", "externalUrl", "accountType", "engagementRatePct", "businessEmail", "businessPhone"],
    search_engine: ["title", "snippet", "url", "engine", "search_type", "merchant", "product_id", "price"],
  };
  const labels: Record<string, string> = {
    rating: "平台评分", user_rating_count: "评价数量", business_status: "营业状态", types: "业务类别",
    place_id: "地图地点 ID", formatted_address: "平台地址", id: "平台账号 ID", url: "来源页面",
    searchType: "搜索类型", isVerified: "平台认证", description: "平台简介", followers: "粉丝数",
    likes: "获赞数", location: "平台位置", category: "平台类别", actorId: "采集 Actor",
    username: "账号名称", fullName: "账号显示名称", followersCount: "粉丝数", followingCount: "关注数",
    postsCount: "帖子数量", biography: "账号简介", externalUrl: "外部链接", accountType: "账号类型",
    engagementRatePct: "互动率", businessEmail: "商业邮箱", businessPhone: "商业电话",
    title: "搜索标题", snippet: "搜索摘要", engine: "搜索引擎", search_type: "搜索类型",
    merchant: "商家", product_id: "商品 ID", price: "价格",
  };
  const fields = (keys[channel] ?? Object.keys(source)).flatMap(key => {
    const value = source[key];
    if (value === null || value === undefined || value === "") return [];
    const text = Array.isArray(value) ? value.map(item => String(item)).join("、")
      : typeof value === "object" ? "" : String(value);
    if (!text || text.length > 600) return [];
    return [{ label: labels[key] ?? key, value: text }];
  }).slice(0, 12);
  return fields.length ? { platform: channel, fields } : null;
}
export async function handleProspectConsole(request: Request, env: ConsoleEnv): Promise<Response> {
  const ownerId = await authenticate(request, env);
  if (!ownerId) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return errorResponse(request, "INVALID_DATE_RANGE", "日期范围格式无效。", 400);
  }
  try {
    const rows: OccurrenceRow[] = [];
    const select = "id,provider,captured_at,run:discovery_runs!discovery_record_occurrences_run_id_owner_id_fkey!inner(channel),record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey!inner(id,entity_id,status,latitude,longitude,lead_id,name,record_type,country_code,address,phone,email,website,confidence_score,raw_data)";
    // Read in bounded pages; do not silently treat a partial 50k sample as a complete total.
    for (let offset = 0; offset < 200000; offset += 1000) {
      const page = await db<OccurrenceRow[]>(env,
        "discovery_record_occurrences?owner_id=eq." + ownerId +
        "&is_removed=eq.false&select=" + encodeURIComponent(select) +
        "&record.status=not.in.(removed,discarded)&order=captured_at.asc&limit=1000&offset=" + offset);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
      if (offset === 199000) throw new Error("PROSPECT_CONSOLE_DATASET_TOO_LARGE: 请将统计聚合迁移到数据库端后再查询完整数据。");
    }
    const filtered = rows.filter(row => {
      if (!row.record || !row.run || !row.captured_at) return false;
      const day = localDay(row.captured_at);
      return (!from || day >= from) && (!to || day <= to);
    });
    const entities = new Set<string>();
    const converted = new Set<string>();
    const pending = new Set<string>();
    const platformEntities = new Map<string, { label: string; entities: Set<string> }>();
    const dailyEntities = new Map<string, Set<string>>();
    const prospects = new Map<string, {
      id: string; name: string; type: string; country: string; address: string;
      phone: string; email: string; website: string; latitude: number | null;
      longitude: number | null; status: string; leadId: string | null; locationScore: number;
      discoveredAt: string; platforms: Array<{ key: string; label: string }>; recordIds: string[];
      sourceDetails: Array<{ platform: string; fields: Array<{ label: string; value: string }> }>;
      contactIntelligence?: Record<string, unknown>;
    }>();
    for (const row of filtered) {
      const record = row.record!;
      const entityId = canonicalEntityKey(record);
      const day = localDay(row.captured_at);
      entities.add(entityId);
      if (record.status === "promoted" || record.lead_id) converted.add(entityId);
      else pending.add(entityId);
      const channel = row.run?.channel ?? "";
      const platform = platformFor(channel, row.provider);
      const validCoordinates = typeof record.latitude === "number" && Number.isFinite(record.latitude) && record.latitude >= -90 && record.latitude <= 90 && typeof record.longitude === "number" && Number.isFinite(record.longitude) && record.longitude >= -180 && record.longitude <= 180;
      const locationScore = (record.confidence_score ?? 0) + (channel === "map_local_businesses" ? 1000 : 0);
      const detail = sourceDetails(channel, record.raw_data);
      if (!platformEntities.has(platform.key)) platformEntities.set(platform.key, { label: platform.label, entities: new Set() });
      platformEntities.get(platform.key)!.entities.add(entityId);
      if (!dailyEntities.has(day)) dailyEntities.set(day, new Set());
      dailyEntities.get(day)!.add(entityId);
      const existing = prospects.get(entityId);
      if (!existing) {
        prospects.set(entityId, {
          id: entityId, name: record.name || "未命名企业", type: record.record_type || "—",
          country: record.country_code || "—", address: record.address || "—",
          phone: record.phone || "", email: record.email || "", website: record.website || "",
          latitude: validCoordinates ? record.latitude! : null,
          longitude: validCoordinates ? record.longitude! : null,
          status: record.status === "promoted" || record.lead_id ? "converted" : "pending",
          leadId: record.lead_id || null, locationScore, discoveredAt: row.captured_at, platforms: [platform], recordIds: [record.id], sourceDetails: detail ? [detail] : [],
          contactIntelligence: record.raw_data?.contact_intelligence && typeof record.raw_data.contact_intelligence === "object" ? record.raw_data.contact_intelligence as Record<string, unknown> : undefined,
        });
      } else {
        if (row.captured_at > existing.discoveredAt) existing.discoveredAt = row.captured_at;
        if (!existing.platforms.some(item => item.key === platform.key)) existing.platforms.push(platform);
        if (!existing.recordIds.includes(record.id)) existing.recordIds.push(record.id);
        if (detail && !existing.sourceDetails.some(item => item.platform === detail.platform)) existing.sourceDetails.push(detail);
        if (!existing.contactIntelligence && record.raw_data?.contact_intelligence && typeof record.raw_data.contact_intelligence === "object") existing.contactIntelligence = record.raw_data.contact_intelligence as Record<string, unknown>;
        if (locationScore > existing.locationScore && (record.address || validCoordinates)) {
          existing.locationScore = locationScore;
          if (record.address) existing.address = record.address;
          if (validCoordinates) { existing.latitude = record.latitude!; existing.longitude = record.longitude!; }
        } else if ((!existing.address || existing.address === "—") && record.address) existing.address = record.address;
        if (!existing.phone && record.phone) existing.phone = record.phone;
        if (!existing.email && record.email) existing.email = record.email;
        if (!existing.website && record.website) existing.website = record.website;
        if (record.status === "promoted" || record.lead_id) { existing.status = "converted"; existing.leadId = record.lead_id || existing.leadId; }
      }
    }
    const platforms = [...platformEntities.entries()]
      .map(([key, value]) => ({ key, label: value.label, count: value.entities.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const daily = [...dailyEntities.entries()]
      .map(([date, values]) => ({ date, count: values.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const prospectRows = [...prospects.values()].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
    return successResponse(request, {
      metrics: {
        platformCount: platforms.length, prospectCount: entities.size,
        convertedCount: converted.size, pendingCount: [...pending].filter(id => !converted.has(id)).length,
      },
      platforms, daily, prospects: prospectRows, timezone: "Asia/Taipei",
      range: { from: from || null, to: to || null },
    });
  } catch (error) {
    return errorResponse(request, "PROSPECT_CONSOLE_READ_FAILED",
      error instanceof Error ? error.message : "读取潜客统计失败。", 502);
  }
}
