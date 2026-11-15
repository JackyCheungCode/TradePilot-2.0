import { errorResponse, successResponse } from "../lib/http";
import { readIntegrationSecrets } from "../lib/integrations";

interface TradeToolsEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOOGLE_MAPS_API_KEY?: string;
  DHL_API_KEY?: string;
  UPS_CLIENT_ID?: string;
  UPS_CLIENT_SECRET?: string;
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
  OMNIBOX_API_KEY?: string;
}

async function authenticated(request: Request, env: TradeToolsEnv): Promise<boolean> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  return response.ok;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
  catch { return { message: raw.slice(0, 300) }; }
}

async function upsToken(env: TradeToolsEnv): Promise<string> {
  if (!env.UPS_CLIENT_ID || !env.UPS_CLIENT_SECRET) throw new Error("请先在设置中心配置 UPS Client ID 和 Client Secret。");
  const auth = btoa(env.UPS_CLIENT_ID + ":" + env.UPS_CLIENT_SECRET);
  const response = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await readBody(response);
  if (!response.ok || typeof data.access_token !== "string") throw new Error("UPS OAuth 认证失败（HTTP " + response.status + "）。请检查正式环境应用凭证及权限。");
  return data.access_token;
}

async function fedexToken(env: TradeToolsEnv): Promise<string> {
  if (!env.FEDEX_CLIENT_ID || !env.FEDEX_CLIENT_SECRET) throw new Error("请先在设置中心配置 FedEx API Key 和 Secret Key。");
  const response = await fetch("https://apis.fedex.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.FEDEX_CLIENT_ID, client_secret: env.FEDEX_CLIENT_SECRET }),
  });
  const data = await readBody(response);
  if (!response.ok || typeof data.access_token !== "string") throw new Error("FedEx OAuth 认证失败（HTTP " + response.status + "）。请检查项目凭证和 Track API 权限。");
  return data.access_token;
}

async function geocodeAddress(request: Request, env: TradeToolsEnv): Promise<Response> {
  if (!env.GOOGLE_MAPS_API_KEY) return errorResponse(request, "GEOCODING_NOT_CONFIGURED", "请先在设置中心配置 Google Maps API Key，并启用 Geocoding API 与 Time Zone API。", 503);
  let body: { address?: string };
  try { body = await request.json() as typeof body; }
  catch { return errorResponse(request, "INVALID_JSON", "请求内容格式不正确。", 400); }
  const address = String(body.address || "").trim();
  if (!address || address.length > 500) return errorResponse(request, "VALIDATION_ERROR", "请输入有效客户地址（最多 500 字符）。", 400);
  try {
    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
    const geocodeResponse = await fetch(geocodeUrl);
    const geocode = await readBody(geocodeResponse);
    const result = (geocode.results as Array<Record<string, unknown>> | undefined)?.[0];
    if (!geocodeResponse.ok || geocode.status !== "OK" || !result) {
      throw new Error("Google Maps 无法解析该客户地址：" + String(geocode.status || geocodeResponse.status));
    }
    const geometry = result.geometry as { location?: { lat: number; lng: number } } | undefined;
    const coords = geometry?.location;
    if (!coords) throw new Error("地址解析结果缺少经纬度。");

    const timezoneUrl = new URL("https://maps.googleapis.com/maps/api/timezone/json");
    timezoneUrl.searchParams.set("location", coords.lat + "," + coords.lng);
    timezoneUrl.searchParams.set("timestamp", String(Math.floor(Date.now() / 1000)));
    timezoneUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
    const timezoneResponse = await fetch(timezoneUrl);
    const timezone = await readBody(timezoneResponse);
    if (!timezoneResponse.ok || timezone.status !== "OK" || typeof timezone.timeZoneId !== "string") {
      throw new Error("Google Maps Time Zone API 无法解析该地址的时区。");
    }

    const components = (result.address_components as Array<{ long_name?: string; short_name?: string; types?: string[] }> | undefined) || [];
    const component = (type: string) => components.find(item => item.types?.includes(type));
    const country = component("country");
    const admin = component("administrative_area_level_1");
    const city = component("locality") || component("postal_town") || component("administrative_area_level_2");
    return successResponse(request, {
      name: city?.long_name || String(result.formatted_address || address),
      country: country?.long_name || "",
      country_code: country?.short_name || "",
      admin1: admin?.long_name || "",
      latitude: coords.lat,
      longitude: coords.lng,
      timezone: timezone.timeZoneId,
      formatted_address: result.formatted_address,
    });
  } catch (error) {
    return errorResponse(request, "GEOCODING_FAILED", error instanceof Error ? error.message : "客户地址解析失败。", 502);
  }
}

async function trackShipment(request: Request, env: TradeToolsEnv): Promise<Response> {
  let body: { carrier?: string; trackingNumber?: string };
  try { body = await request.json() as typeof body; }
  catch { return errorResponse(request, "INVALID_JSON", "请求内容格式不正确。", 400); }
  const carrier = String(body.carrier || "").toLowerCase();
  const trackingNumber = String(body.trackingNumber || "").trim();
  if (!["dhl", "ups", "fedex"].includes(carrier) || !trackingNumber || trackingNumber.length > 80) {
    return errorResponse(request, "VALIDATION_ERROR", "请选择物流服务商并输入有效运单号。", 400);
  }
  try {
    let response: Response;
    if (carrier === "dhl") {
      if (!env.DHL_API_KEY) throw new Error("请先在设置中心配置 DHL Shipment Tracking API Key。");
      const query = new URLSearchParams({ trackingNumber });
      response = await fetch("https://api-eu.dhl.com/track/shipments?" + query.toString(), {
        headers: { "DHL-API-Key": env.DHL_API_KEY, Accept: "application/json" },
      });
    } else if (carrier === "ups") {
      const token = await upsToken(env);
      response = await fetch("https://onlinetools.ups.com/api/track/v1/details/" + encodeURIComponent(trackingNumber) + "?locale=en_US&returnSignature=false&returnMilestones=true&returnPOD=false", {
        headers: { Authorization: "Bearer " + token, transId: crypto.randomUUID(), transactionSrc: "TradePilot", Accept: "application/json" },
      });
    } else {
      const token = await fedexToken(env);
      response = await fetch("https://apis.fedex.com/track/v1/trackingnumbers", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ trackingInfo: [{ trackingNumberInfo: { trackingNumber } }], includeDetailedScans: true }),
      });
    }
    const data = await readBody(response);
    if (!response.ok) {
      return errorResponse(request, "CARRIER_REQUEST_FAILED", carrier.toUpperCase() + " 官方接口返回 HTTP " + response.status + "：" + String(data.message || data.errors || "请检查凭证、服务权限或运单号").slice(0, 220), 502);
    }
    return successResponse(request, { carrier: carrier.toUpperCase(), trackingNumber, data });
  } catch (error) {
    return errorResponse(request, "TRACKING_FAILED", error instanceof Error ? error.message : "物流查询失败。", 502);
  }
}

async function omniboxQuery(request: Request, apiKey: string): Promise<Response> {
  let body: { action?: string; payload?: Record<string, unknown> };
  try { body = await request.json() as typeof body; } catch { return errorResponse(request, "INVALID_JSON", "请求内容格式不正确。", 400); }
  const action = String(body.action || "");
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  let endpoint = "";
  let input: Record<string, unknown> = {};
  if (action === "classify") {
    const productDescription = String(payload.productDescription || "").trim();
    const originCountry = String(payload.originCountry || "").trim().toUpperCase();
    const value = payload.value === undefined || payload.value === null || payload.value === "" ? undefined : Number(payload.value);
    if (!productDescription || productDescription.length > 2000) return errorResponse(request, "VALIDATION_ERROR", "请输入商品描述（最多 2,000 字符）。", 400);
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return errorResponse(request, "VALIDATION_ERROR", "申报价值必须为非负数字。", 400);
    if (originCountry && !/^[A-Z]{2}$/.test(originCountry)) return errorResponse(request, "VALIDATION_ERROR", "原产国请使用 ISO 两位国家代码。", 400);
    endpoint = "/api/v1/compliance/classify";
    input = { productDescription, ...(originCountry ? { originCountry } : {}), ...(value !== undefined ? { value } : {}) };
  } else if (action === "screen") {
    const name = String(payload.name || "").trim();
    const fuzzy = payload.fuzzy_name !== false;
    const countries = String(payload.countries || "").trim().toUpperCase();
    if (!name || name.length > 300) return errorResponse(request, "VALIDATION_ERROR", "请输入待筛查企业或个人名称（最多 300 字符）。", 400);
    if (countries && !/^[A-Z,\\s]{2,200}$/.test(countries)) return errorResponse(request, "VALIDATION_ERROR", "国家过滤请使用逗号分隔的 ISO 两位国家代码。", 400);
    endpoint = "/api/v1/compliance/screen";
    input = { name, fuzzy_name: String(fuzzy), ...(countries ? { countries } : {}) };
  } else if (action === "rulings") {
    const keyword = String(payload.keyword || "").trim();
    const threshold = Number(payload.match_threshold ?? 0.65);
    if (!keyword || keyword.length > 1000) return errorResponse(request, "VALIDATION_ERROR", "请输入裁决检索关键词（最多 1,000 字符）。", 400);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return errorResponse(request, "VALIDATION_ERROR", "匹配阈值必须介于 0 到 1。", 400);
    endpoint = "/api/v1/compliance/rulings/search";
    input = { keyword, match_threshold: threshold };
  } else return errorResponse(request, "INVALID_OMNIBOX_ACTION", "不支持的 Omnibox 查询类型。", 400);
  try {
    const response = await fetch("https://omnibox.app" + endpoint, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": apiKey, Authorization: "Bearer " + apiKey }, body: JSON.stringify(input) });
    const data = await readBody(response);
    if (response.status >= 300 && response.status < 400) return errorResponse(request, "OMNIBOX_REDIRECT", "Omnibox API 返回重定向，暂无法安全转发请求。", 502);
    if (!response.ok) return errorResponse(request, "OMNIBOX_REQUEST_FAILED", "Omnibox API 返回 HTTP " + response.status + "：" + String(data.message || data.error || data.detail || "请检查 API Key、账户状态或请求参数。").slice(0, 300), 502);
    return successResponse(request, { action, data });
  } catch (error) { return errorResponse(request, "OMNIBOX_UNAVAILABLE", error instanceof Error ? error.message : "Omnibox 服务暂时不可用。", 502); }
}

export async function handleTradeTools(request: Request, env: TradeToolsEnv): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const allowed = ["/api/v1/trade-tools/track", "/api/v1/trade-tools/geocode", "/api/v1/trade-tools/omnibox"];
  if (request.method !== "POST" || !allowed.includes(pathname)) return errorResponse(request, "NOT_FOUND", "外贸工具接口不存在。", 404);
  if (!(await authenticated(request, env))) return errorResponse(request, "UNAUTHORIZED", "请先登录后使用外贸工具。", 401);
  const secretNames = ["tradepilot_api_google_maps", "tradepilot_api_dhl", "tradepilot_api_ups_client_id", "tradepilot_api_ups_client_secret", "tradepilot_api_fedex_client_id", "tradepilot_api_fedex_client_secret", ...(pathname === "/api/v1/trade-tools/omnibox" ? ["tradepilot_api_omnibox"] : [])];
  const secrets = await readIntegrationSecrets(env, secretNames);
  const configuredEnv: TradeToolsEnv = { ...env, GOOGLE_MAPS_API_KEY: secrets.tradepilot_api_google_maps || env.GOOGLE_MAPS_API_KEY, DHL_API_KEY: secrets.tradepilot_api_dhl || env.DHL_API_KEY, UPS_CLIENT_ID: secrets.tradepilot_api_ups_client_id || env.UPS_CLIENT_ID, UPS_CLIENT_SECRET: secrets.tradepilot_api_ups_client_secret || env.UPS_CLIENT_SECRET, FEDEX_CLIENT_ID: secrets.tradepilot_api_fedex_client_id || env.FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET: secrets.tradepilot_api_fedex_client_secret || env.FEDEX_CLIENT_SECRET, OMNIBOX_API_KEY: secrets.tradepilot_api_omnibox || env.OMNIBOX_API_KEY };
  if (pathname === "/api/v1/trade-tools/omnibox") {
    if (!configuredEnv.OMNIBOX_API_KEY) return errorResponse(request, "OMNIBOX_NOT_CONFIGURED", "请先在「设置中心 → API 集成」配置 Omnibox API Key。", 503);
    return omniboxQuery(request, configuredEnv.OMNIBOX_API_KEY);
  }
  return pathname === "/api/v1/trade-tools/geocode" ? geocodeAddress(request, configuredEnv) : trackShipment(request, configuredEnv);
}
