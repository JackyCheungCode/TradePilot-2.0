import { errorResponse, successResponse } from "../lib/http";
import { readIntegrationSecrets } from "../lib/integrations";

interface ValidationEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type CacheRow = { kind: string; value_hash: string; status: string; result: Record<string, unknown>; verified_at: string | null; expires_at: string | null };
async function authenticate(request: Request, env: ValidationEnv): Promise<boolean> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  return response.ok;
}
async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function cacheRequest<T>(env: ValidationEnv, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/contact_validation_cache" + path, {
    ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("验证缓存数据库请求失败（HTTP " + response.status + "）：" + raw.slice(0, 220));
  return (raw ? JSON.parse(raw) : []) as T;
}
async function readCache(env: ValidationEnv, kind: string, hash: string): Promise<CacheRow | null> {
  const rows = await cacheRequest<CacheRow[]>(env, "?kind=eq." + kind + "&value_hash=eq." + hash + "&select=kind,value_hash,status,result,verified_at,expires_at&limit=1");
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    await cacheRequest(env, "?kind=eq." + kind + "&value_hash=eq." + hash, { method: "DELETE" });
    return null;
  }
  return row;
}
async function claimCache(env: ValidationEnv, kind: string, hash: string): Promise<boolean> {
  const expires = new Date(Date.now() + 120000).toISOString();
  const rows = await cacheRequest<CacheRow[]>(env, "?on_conflict=kind,value_hash", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ kind, value_hash: hash, status: "pending", result: {}, expires_at: expires, updated_at: new Date().toISOString() }) });
  return rows.length > 0;
}
async function writeCache(env: ValidationEnv, kind: string, hash: string, status: string, result: Record<string, unknown>, ttlDays?: number): Promise<void> {
  const now = new Date().toISOString();
  const expires = ttlDays ? new Date(Date.now() + ttlDays * 86400000).toISOString() : null;
  await cacheRequest(env, "?on_conflict=kind,value_hash", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ kind, value_hash: hash, status, result, verified_at: now, expires_at: expires, updated_at: now }),
  });
}
function responsePayload(request: Request, kind: string, value: string, row: CacheRow | null) {
  return successResponse(request, { kind, value, status: row?.status ?? "unknown", result: row?.result ?? {}, verifiedAt: row?.verified_at ?? null, cached: Boolean(row) });
}
async function validateEmail(request: Request, env: ValidationEnv, email: string, secrets: Record<string, string>): Promise<Response> {
  const hash = await hashValue(email);
  const cached = await readCache(env, "email", hash);
  if (cached) return responsePayload(request, "email", email, cached);
  const key = secrets.tradepilot_api_abstract_email_validation;
  if (!key) return errorResponse(request, "EMAIL_VALIDATION_NOT_CONFIGURED", "请先在设置中心配置 Abstract Email Validation API Key。", 503);
  if (!(await claimCache(env, "email", hash))) return responsePayload(request, "email", email, await readCache(env, "email", hash));
  try {
    const url = new URL("https://emailvalidation.abstractapi.com/v1/");
    url.searchParams.set("api_key", key); url.searchParams.set("email", email);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error("Abstract Email Validation 返回 HTTP " + response.status);
    const deliverability = String(data.deliverability ?? "").toUpperCase();
    const smtp = (data.is_smtp_valid && typeof data.is_smtp_valid === "object" ? (data.is_smtp_valid as Record<string, unknown>).value : undefined);
    const format = (data.is_valid_format && typeof data.is_valid_format === "object" ? (data.is_valid_format as Record<string, unknown>).value : undefined);
    const disposable = (data.is_disposable_email && typeof data.is_disposable_email === "object" ? (data.is_disposable_email as Record<string, unknown>).value : undefined);
    const catchall = (data.is_catchall_email && typeof data.is_catchall_email === "object" ? (data.is_catchall_email as Record<string, unknown>).value : undefined);
    const status = deliverability === "DELIVERABLE" && smtp === true && format === true && disposable !== true
      ? "valid" : deliverability === "UNDELIVERABLE" || format === false || smtp === false ? "invalid"
      : catchall === true || deliverability === "RISKY" || disposable === true ? "risky" : "unknown";
    const result = { deliverability, smtpValid: smtp ?? null, formatValid: format ?? null, disposable: disposable ?? null, catchAll: catchall ?? null, qualityScore: data.quality_score ?? null };
    await writeCache(env, "email", hash, status, result);
    return responsePayload(request, "email", email, await readCache(env, "email", hash));
  } catch (error) { return errorResponse(request, "EMAIL_VALIDATION_FAILED", error instanceof Error ? error.message : "邮箱验证失败。", 502); }
}
async function validatePhone(request: Request, env: ValidationEnv, phone: string, kind: "phone" | "whatsapp", secrets: Record<string, string>, country?: string): Promise<Response> {
  const normalized = phone.replace(/[\s().-]/g, "");
  const hash = await hashValue(normalized);
  const cached = await readCache(env, kind, hash);
  if (cached) return responsePayload(request, kind, normalized, cached);
  if (kind === "phone") {
    const key = secrets.tradepilot_api_abstract_phone_validation;
    if (!key) return errorResponse(request, "PHONE_VALIDATION_NOT_CONFIGURED", "请先在设置中心配置 Abstract Phone Validation API Key。", 503);
    if (!(await claimCache(env, "phone", hash))) return responsePayload(request, "phone", normalized, await readCache(env, "phone", hash));
    try {
      const url = new URL("https://phonevalidation.abstractapi.com/v1/");
      url.searchParams.set("api_key", key); url.searchParams.set("phone", normalized);
      if (country && /^[A-Z]{2}$/.test(country)) url.searchParams.set("country", country);
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error("Abstract Phone Validation 返回 HTTP " + response.status);
      const valid = data.valid === true;
      const result = { valid, format: data.format ?? null, country: data.country ?? null, type: data.type ?? null, carrier: data.carrier ?? null, location: data.location ?? null };
      await writeCache(env, "phone", hash, valid ? "valid" : data.valid === false ? "invalid" : "unknown", result, 30);
      return responsePayload(request, "phone", normalized, await readCache(env, "phone", hash));
    } catch (error) { return errorResponse(request, "PHONE_VALIDATION_FAILED", error instanceof Error ? error.message : "电话号码验证失败。", 502); }
  }
  const endpoint = secrets.tradepilot_api_whatsapp_check_url;
  const apiKey = secrets.tradepilot_api_whatsapp_check_key;
  if (!endpoint || !apiKey) return errorResponse(request, "WHATSAPP_CHECK_NOT_CONFIGURED", "请先在设置中心配置 WhatsApp 注册检测 API 地址和密钥。", 503);
  if (!(await claimCache(env, "whatsapp", hash))) return responsePayload(request, "whatsapp", normalized, await readCache(env, "whatsapp", hash));
  try {
    const target = new URL(endpoint);
    if (target.protocol !== "https:") return errorResponse(request, "INVALID_WHATSAPP_PROVIDER_URL", "WhatsApp 检测服务必须使用 HTTPS 地址。", 400);
    const response = await fetch(target.toString(), { method: "POST", redirect: "manual", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ phone: normalized, number: normalized, country }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("WhatsApp 检测服务返回 HTTP " + response.status);
    const data = await response.json() as Record<string, unknown>;
    const value = data.registered ?? data.is_registered ?? data.is_whatsapp ?? data.whatsapp ?? data.exists;
    const status = value === true ? "registered" : value === false ? "not_registered" : "unknown";
    const result = { registered: value === true ? true : value === false ? false : null, providerStatus: data.status ?? data.message ?? null, waId: typeof data.wa_id === "string" ? data.wa_id : null };
    await writeCache(env, "whatsapp", hash, status, result, 14);
    return responsePayload(request, "whatsapp", normalized, await readCache(env, "whatsapp", hash));
  } catch (error) { return errorResponse(request, "WHATSAPP_CHECK_FAILED", error instanceof Error ? error.message : "WhatsApp 注册检测失败。", 502); }
}
export async function handleContactValidation(request: Request, env: ValidationEnv): Promise<Response> {
  if (request.method !== "POST") return errorResponse(request, "METHOD_NOT_ALLOWED", "仅支持 POST 请求。", 405);
  if (!(await authenticate(request, env))) return errorResponse(request, "UNAUTHORIZED", "请先登录 TradePilot。", 401);
  let body: { kind?: string; value?: string; country?: string };
  try { body = await request.json() as typeof body; } catch { return errorResponse(request, "INVALID_JSON", "请求内容格式不正确。", 400); }
  const kind = String(body.kind || "");
  const value = String(body.value || "").trim();
  if (!value || value.length > 320) return errorResponse(request, "INVALID_CONTACT_VALUE", "请输入有效联系方式。", 400);
  const secrets = await readIntegrationSecrets(env, ["tradepilot_api_abstract_email_validation", "tradepilot_api_abstract_phone_validation", "tradepilot_api_whatsapp_check_key"]);
  if (kind === "email") {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse(request, "INVALID_EMAIL", "邮箱格式无效。", 400);
    return validateEmail(request, env, email, secrets);
  }
  if (kind === "phone" || kind === "whatsapp") {
    const phone = value.replace(/[\s().-]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(phone)) return errorResponse(request, "INVALID_PHONE", "电话号码格式无效；请使用国际区号格式，例如 +14155552671。", 400);
    return validatePhone(request, env, phone, kind, secrets, String(body.country || "").toUpperCase());
  }
  return errorResponse(request, "INVALID_VALIDATION_KIND", "不支持的验证类型。", 400);
}
