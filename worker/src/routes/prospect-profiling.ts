import { errorResponse, successResponse } from "../lib/http";

interface Env { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; }

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
