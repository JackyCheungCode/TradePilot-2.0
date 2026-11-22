import { errorResponse, successResponse } from "../lib/http";
import { runConfiguredAI } from "./settings";

interface Env { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string; AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> }; }

async function authenticated(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return false;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(8000),
  });
  return response.ok;
}

export async function handleProspectProfiling(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(request, "METHOD_NOT_ALLOWED", "不支持的请求方法。", 405);
  if (!await authenticated(request, env)) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const hl = (url.searchParams.get("hl") ?? "en").trim().slice(0, 12);
  const gl = (url.searchParams.get("gl") ?? "us").trim().slice(0, 2).toLowerCase();
  if (query.length < 2) return successResponse(request, { suggestions: [] });
  try {
    const endpoint = new URL("https://suggestqueries.google.com/complete/search");
    endpoint.searchParams.set("client", "firefox");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("hl", hl);
    endpoint.searchParams.set("gl", gl);
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("GOOGLE_AUTOCOMPLETE_" + response.status);
    const payload = await response.json() as [string, string[]];
    const suggestions = Array.isArray(payload?.[1]) ? payload[1].filter((item): item is string => typeof item === "string").slice(0, 8) : [];
    return successResponse(request, { suggestions });
  } catch (error) {
    console.error("PROSPECT_AUTOCOMPLETE_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "AUTOCOMPLETE_UNAVAILABLE", "Google 搜索联想暂时不可用，请稍后重试。", 502);
  }
}


function cleanTerms(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 100)).filter(Boolean))].slice(0, limit);
}

export async function handleProspectStrategy(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return errorResponse(request, "METHOD_NOT_ALLOWED", "不支持的请求方法。", 405);
  if (!await authenticated(request, env)) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return errorResponse(request, "INVALID_JSON", "请求内容格式无效。", 400); }
  const product = typeof body.coreNoun === "string" ? body.coreNoun.trim().slice(0, 120) : "";
  if (!product) return errorResponse(request, "PRODUCT_REQUIRED", "请先填写核心产品名词。", 400);
  const profile = {
    product,
    buyers: cleanTerms(body.buyers, 8),
    country: typeof body.country === "string" ? body.country.slice(0, 80) : "",
    city: typeof body.city === "string" ? body.city.slice(0, 80) : "",
    materials: cleanTerms(body.materials, 12),
    specifications: typeof body.specifications === "string" ? body.specifications.slice(0, 160) : "",
    hsCode: typeof body.hsCode === "string" ? body.hsCode.slice(0, 20) : "",
    certifications: cleanTerms(body.certifications, 12),
    employeeScale: typeof body.employeeScale === "string" ? body.employeeScale.slice(0, 30) : "",
    activity: typeof body.activity === "string" ? body.activity.slice(0, 20) : "",
    competitors: cleanTerms(body.competitors, 3),
  };
  const prompt = [
    "You are a B2B export market research terminology specialist.",
    "Generate buyer-intent search vocabulary for the structured product profile below.",
    "Return only valid JSON with exactly these keys: synonyms (array of up to 10 English product synonyms and close commercial variants), localizedTerms (array of up to 10 relevant local-language product or buyer terms for the target market), buyerKeywords (array of up to 8 buyer-side commercial role and sourcing terms).",
    "Do not invent certifications, HS codes, companies, facts, or translations you are unsure about. Prefer precise procurement language over broad generic words. Keep each item short. If target market is blank, use globally understood English.",
    "Profile: " + JSON.stringify(profile),
  ].join("\n");
  try {
    const raw = await runConfiguredAI("prospect-profiling", prompt, env);
    const normalized = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 返回格式无法解析");
    const parsed = JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
    return successResponse(request, {
      synonyms: cleanTerms(parsed.synonyms),
      localizedTerms: cleanTerms(parsed.localizedTerms),
      buyerKeywords: cleanTerms(parsed.buyerKeywords, 8),
      generatedAt: new Date().toISOString(),
      modelTask: "prospect-profiling",
    });
  } catch (error) {
    console.error("PROSPECT_STRATEGY_AI_FAILED", String(error).slice(0, 300));
    return errorResponse(request, "AI_STRATEGY_UNAVAILABLE", error instanceof Error ? error.message.slice(0, 180) : "AI 获客策略生成失败，请检查模型配置。", 502);
  }
}


export async function handleProspectCountries(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(request, "METHOD_NOT_ALLOWED", "不支持的请求方法。", 405);
  if (!await authenticated(request, env)) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const normalize = (rows: Array<{ cca2?: string; id?: string; name?: { common?: string } | string; region?: string | { value?: string } }>) =>
    rows.flatMap(item => {
      const code = String(item.cca2 ?? item.id ?? "").trim().toUpperCase();
      const name = typeof item.name === "string" ? item.name : item.name?.common;
      const regionValue = typeof item.region === "string" ? item.region : item.region?.value ?? "";
      if (!/^[A-Z]{2}$/.test(code) || !name || regionValue === "Aggregates") return [];
      const continent = /America/i.test(regionValue) ? "Americas" : /Europe/i.test(regionValue) ? "Europe" : /Africa|Middle East/i.test(regionValue) ? "Africa" : /Asia/i.test(regionValue) ? "Asia" : /Oceania/i.test(regionValue) ? "Oceania" : "Other";
      return [{ name: { common: name }, cca2: code, region: continent }];
    }).sort((x,y) => x.name.common.localeCompare(y.name.common));
  try {
    let countries: Array<{ name: { common: string }; cca2: string; region: string }> = [];
    let source = "";
    const worldBank = await fetch("https://api.worldbank.org/v2/country?format=json&per_page=400", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (worldBank.ok) {
      const payload = await worldBank.json() as [unknown, Array<{ id?: string; name?: string; region?: { value?: string } }>];
      countries = normalize(Array.isArray(payload?.[1]) ? payload[1] : []);
      if (countries.length) source = "World Bank country catalog";
    }
    if (!countries.length) {
      const fallback = await fetch("https://restcountries.com/v3.1/all?fields=cca2,name,region", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!fallback.ok) throw new Error("RESTCOUNTRIES_" + fallback.status);
      const rows = await fallback.json() as Array<{ cca2?: string; name?: { common?: string }; region?: string }>;
      countries = normalize(Array.isArray(rows) ? rows : []);
      source = "REST Countries fallback";
    }
    if (!countries.length) throw new Error("COUNTRY_CATALOG_EMPTY");
    return successResponse(request, { countries, source });
  } catch (error) {
    console.error("PROSPECT_COUNTRY_LOOKUP_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "COUNTRY_LOOKUP_UNAVAILABLE", "国家列表暂时不可用，请稍后重试。", 502);
  }
}

let prospectRegionCache = new Map<string, Array<{ id: string; name: string; geometry: unknown }>>();

export async function handleProspectRegions(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(request, "METHOD_NOT_ALLOWED", "不支持的请求方法。", 405);
  if (!await authenticated(request, env)) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const country = (new URL(request.url).searchParams.get("country") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return errorResponse(request, "INVALID_COUNTRY", "请选择有效国家或地区。", 400);
  const cached = prospectRegionCache.get(country);
  if (cached) return successResponse(request, { regions: cached, source: "geoBoundaries gbOpen ADM1" });
  try {
    const countryResponse = await fetch("https://restcountries.com/v3.1/alpha/" + country + "?fields=cca3", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!countryResponse.ok) throw new Error("COUNTRY_ISO3_" + countryResponse.status);
    const countryPayload = await countryResponse.json() as Array<{ cca3?: string }>;
    const iso3 = countryPayload?.[0]?.cca3;
    if (!iso3) throw new Error("COUNTRY_ISO3_MISSING");
    const metadataResponse = await fetch("https://www.geoboundaries.org/api/current/gbOpen/" + iso3 + "/ADM1/", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (metadataResponse.status === 404) return successResponse(request, { regions: [], source: "geoBoundaries gbOpen ADM1 · 当前国家无公开一级行政区边界" });
    if (!metadataResponse.ok) throw new Error("GEOboundaries_METADATA_" + metadataResponse.status);
    const metadata = await metadataResponse.json() as { gjDownloadURL?: string; simplifiedGeometryGeoJSON?: string };
    const geoUrl = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL;
    if (!geoUrl) throw new Error("GEOboundaries_GEOJSON_URL_MISSING");
    const geoResponse = await fetch(geoUrl, { headers: { Accept: "application/geo+json,application/json" }, signal: AbortSignal.timeout(25000) });
    if (!geoResponse.ok) throw new Error("GEOboundaries_GEOJSON_" + geoResponse.status);
    const geo = await geoResponse.json() as { features?: Array<{ id?: string | number; properties?: Record<string, unknown>; geometry?: unknown }> };
    const regions = (geo.features ?? []).flatMap((feature, index) => {
      const props = feature.properties ?? {};
      const name = String(props.shapeName ?? props.shapeName_en ?? props.NAME_1 ?? props.name ?? "").trim();
      if (!name || !feature.geometry) return [];
      return [{ id: String(props.shapeID ?? feature.id ?? index), name, geometry: feature.geometry }];
    }).sort((a, b) => a.name.localeCompare(b.name));
    prospectRegionCache.set(country, regions);
    return successResponse(request, { regions, source: "geoBoundaries gbOpen ADM1 · CC BY 4.0" });
  } catch (error) {
    console.error("PROSPECT_REGION_LOOKUP_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "REGION_LOOKUP_UNAVAILABLE", "州 / 省行政区数据暂时不可用，请稍后重试。", 502);
  }
}

export async function handleProspectCities(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(request, "METHOD_NOT_ALLOWED", "不支持的请求方法。", 405);
  if (!await authenticated(request, env)) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const country = (url.searchParams.get("country") ?? "").trim().slice(0, 2).toUpperCase();
  const language = (url.searchParams.get("language") ?? "en").trim().slice(0, 8);
  if (!/^[A-Z]{2}$/.test(country)) return successResponse(request, { cities: [] });
  try {
    if (query.length < 2) return successResponse(request, { cities: [] });
    const endpoint = new URL("https://geocoding-api.open-meteo.com/v1/search");
    endpoint.searchParams.set("name", query);
    endpoint.searchParams.set("count", "20");
    endpoint.searchParams.set("language", language);
    endpoint.searchParams.set("countryCode", country);
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("CITY_LOOKUP_" + response.status);
    const payload = await response.json() as { results?: Array<{ id?: number; name?: string; admin1?: string; admin2?: string; country_code?: string; latitude?: number; longitude?: number }> };
    const cityDetails = (payload.results ?? []).filter(item => typeof item.name === "string" && item.country_code?.toUpperCase() === country)
      .map(item => ({ id: item.id ?? null, name: item.name as string, admin1: item.admin1 ?? "", admin2: item.admin2 ?? "", latitude: item.latitude ?? null, longitude: item.longitude ?? null }))
      .filter((item, index, all) => all.findIndex(candidate => candidate.name === item.name && candidate.admin1 === item.admin1) === index).slice(0, 20);
    const cities = cityDetails.map(item => item.admin1 && item.admin1 !== item.name ? item.name + ", " + item.admin1 : item.name);
    return successResponse(request, { cities, cityDetails, source: "open-meteo" });
  } catch (error) {
    console.error("PROSPECT_CITY_LOOKUP_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "CITY_LOOKUP_UNAVAILABLE", "城市列表暂时不可用，请稍后重试。", 502);
  }
}
