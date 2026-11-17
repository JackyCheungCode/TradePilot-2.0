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
  try {
    const response = await fetch("https://api.worldbank.org/v2/country?format=json", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("WORLD_BANK_COUNTRIES_" + response.status);
    const payload = await response.json() as [unknown, Array<{ id?: string; name?: string; region?: { value?: string } }>];
    const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
    const countries = rows.filter(item => /^[A-Z]{2}$/.test(item.id ?? "") && item.name && item.region?.value && item.region.value !== "Aggregates")
      .map(item => {
        const region = item.region?.value ?? "";
        const continent = region.includes("America") ? "Americas" : region.includes("Europe") ? "Europe" : region.includes("Africa") || region.includes("Middle East") ? "Africa" : region.includes("East Asia") || region.includes("South Asia") || region.includes("Central Asia") ? "Asia" : "Oceania";
        return { name: { common: item.name as string }, cca2: item.id as string, region: continent };
      }).sort((a,b) => a.name.common.localeCompare(b.name.common));
    return successResponse(request, { countries, source: "World Bank country catalog" });
  } catch (error) {
    console.error("PROSPECT_COUNTRY_LOOKUP_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "COUNTRY_LOOKUP_UNAVAILABLE", "国家列表暂时不可用，请稍后重试。", 502);
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
    const payload = await response.json() as { results?: Array<{ name?: string; admin1?: string; country_code?: string }> };
    const cities = [...new Set((payload.results ?? [])
      .filter(item => typeof item.name === "string" && item.country_code?.toUpperCase() === country)
      .map(item => item.admin1 && item.admin1 !== item.name ? item.name + ", " + item.admin1 : item.name as string))].slice(0, 20);
    return successResponse(request, { cities, source: "open-meteo" });
  } catch (error) {
    console.error("PROSPECT_CITY_LOOKUP_FAILED", String(error).slice(0, 240));
    return errorResponse(request, "CITY_LOOKUP_UNAVAILABLE", "城市列表暂时不可用，请稍后重试。", 502);
  }
}
