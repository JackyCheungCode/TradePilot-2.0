import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { errorResponse, successResponse } from "../lib/http";

const RP_ID = "tradepilot.xg-y.workers.dev";
const ORIGIN = "https://tradepilot.xg-y.workers.dev";
const RP_NAME = "TradePilot";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const GRANT_TTL_MS = 12 * 60 * 60 * 1000;

interface WebAuthnEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  aal: string;
}
interface StoredCredential {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  friendly_name: string;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("INVALID_SESSION");
  const raw = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - part.length % 4) % 4));
  return JSON.parse(raw) as Record<string, unknown>;
}
async function authenticate(request: Request, env: WebAuthnEnv): Promise<AuthContext | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string; email?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  const claims = decodeJwtPayload(token);
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  const expiry = Number(claims.exp ?? 0);
  if (
    subject !== user.id ||
    !/^[0-9a-f-]{36}$/i.test(sessionId) ||
    issuer !== env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1" ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) return null;
  return { userId: user.id, sessionId, email: user.email ?? user.id, aal: String(claims.aal ?? "aal1") };
}
async function rpc<T>(env: WebAuthnEnv, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("WEBAUTHN_DATABASE_" + response.status + ": " + raw.slice(0, 180));
  if (!raw.trim()) return undefined as T;
  return JSON.parse(raw) as T;
}
function verifyOrigin(request: Request): boolean {
  return request.headers.get("Origin") === ORIGIN && new URL(request.url).origin === ORIGIN;
}
function fail(request: Request, code: string, message: string, status: number): Response {
  return errorResponse(request, code, message, status);
}
async function credentialsForUser(env: WebAuthnEnv, userId: string): Promise<StoredCredential[]> {
  return rpc<StoredCredential[]>(env, "tradepilot_webauthn_get_credentials", { p_user_id: userId });
}
async function storeChallenge(
  env: WebAuthnEnv, auth: AuthContext, purpose: "registration" | "authentication", challenge: string,
): Promise<string> {
  return rpc<string>(env, "tradepilot_webauthn_store_challenge", {
    p_user_id: auth.userId,
    p_session_id: auth.sessionId,
    p_purpose: purpose,
    p_challenge: challenge,
    p_expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
}
async function consumeChallenge(
  env: WebAuthnEnv, auth: AuthContext, id: string, purpose: "registration" | "authentication",
): Promise<string | null> {
  const rows = await rpc<Array<{ challenge: string }>>(env, "tradepilot_webauthn_consume_challenge", {
    p_id: id, p_user_id: auth.userId, p_session_id: auth.sessionId, p_purpose: purpose,
  });
  return rows?.[0]?.challenge ?? null;
}

export async function handleWebAuthn(request: Request, env: WebAuthnEnv): Promise<Response> {
  if (request.method !== "POST") return fail(request, "METHOD_NOT_ALLOWED", "仅支持 POST 请求。", 405);
  if (!verifyOrigin(request)) return fail(request, "WEBAUTHN_ORIGIN_MISMATCH", "请求来源与已登记的安全域名不匹配。", 403);
  const auth = await authenticate(request, env);
  if (!auth) return fail(request, "UNAUTHENTICATED", "登录会话无效或已过期。", 401);
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return fail(request, "INVALID_REQUEST", "请求内容格式无效。", 400);
  }

  try {
    if (path === "/api/v1/webauthn/status") {
      const enabled = await rpc<boolean>(env, "tradepilot_webauthn_is_enabled", { p_user_id: auth.userId });
      const credentials = await credentialsForUser(env, auth.userId);
      const granted = enabled
        ? await rpc<boolean>(env, "tradepilot_webauthn_has_grant", {
            p_user_id: auth.userId,
            p_session_id: auth.sessionId,
          })
        : false;
      return successResponse(request, {
        enabled: Boolean(enabled),
        granted: Boolean(granted),
        credentials: credentials.map((item) => ({
          id: item.credential_id,
          name: item.friendly_name,
        })),
      });
    }

    if (path === "/api/v1/webauthn/registration/options") {
      if (auth.aal !== "aal2") return fail(request, "STEP_UP_REQUIRED", "添加生物识别凭证前，请先完成 TOTP 二次验证。", 403);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: decodeBase64Url(encodeBase64Url(new TextEncoder().encode(auth.userId))),
        userName: auth.email,
        userDisplayName: auth.email,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
        timeout: CHALLENGE_TTL_MS,
        excludeCredentials: (await credentialsForUser(env, auth.userId)).map((item) => ({
          id: item.credential_id,
          transports: item.transports,
        })),
      });
      const challengeId = await storeChallenge(env, auth, "registration", options.challenge);
      return successResponse(request, { challengeId, options });
    }

    if (path === "/api/v1/webauthn/registration/verify") {
      const challengeId = String(body.challengeId ?? "");
      const response = body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"];
      if (!challengeId || !response || typeof response !== "object") return fail(request, "INVALID_REQUEST", "注册验证参数不完整。", 400);
      if (auth.aal !== "aal2") return fail(request, "STEP_UP_REQUIRED", "请先完成 TOTP 二次验证。", 403);
      const expectedChallenge = await consumeChallenge(env, auth, challengeId, "registration");
      if (!expectedChallenge) return fail(request, "CHALLENGE_INVALID", "注册挑战已过期、已使用或不属于当前会话。", 409);
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) return fail(request, "REGISTRATION_FAILED", "未能验证设备凭证。", 400);
      const info = verification.registrationInfo;
      const credentialId = info.credential.id;
      const transports = (response as { response?: { transports?: AuthenticatorTransportFuture[] } }).response?.transports ?? [];
      await rpc(env, "tradepilot_webauthn_save_credential", {
        p_user_id: auth.userId,
        p_credential_id: credentialId,
        p_public_key: encodeBase64Url(info.credential.publicKey),
        p_counter: info.credential.counter,
        p_transports: transports,
        p_device_type: info.credentialDeviceType,
        p_backed_up: info.credentialBackedUp,
        p_friendly_name: String(body.friendlyName ?? "TradePilot 生物识别设备").slice(0, 80),
      });
      return successResponse(request, { verified: true, credentialId });
    }

    if (path === "/api/v1/webauthn/enable") {
      const enabled = body.enabled === true;
      if (auth.aal !== "aal2") return fail(request, "STEP_UP_REQUIRED", "修改生物识别 MFA 状态前，请先完成 TOTP 二次验证。", 403);
      await rpc(env, "tradepilot_webauthn_set_enabled", { p_user_id: auth.userId, p_enabled: enabled });
      return successResponse(request, { enabled });
    }

    if (path === "/api/v1/webauthn/authentication/options") {
      const enabled = await rpc<boolean>(env, "tradepilot_webauthn_is_enabled", { p_user_id: auth.userId });
      if (!enabled) return fail(request, "WEBAUTHN_MFA_NOT_ENABLED", "账户尚未启用生物识别 MFA。", 409);
      const credentials = await credentialsForUser(env, auth.userId);
      if (!credentials.length) return fail(request, "NO_CREDENTIALS", "账户没有可用的生物识别凭证。", 409);
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        timeout: CHALLENGE_TTL_MS,
        userVerification: "required",
        allowCredentials: credentials.map((item) => ({
          id: item.credential_id,
          transports: item.transports,
        })),
      });
      const challengeId = await storeChallenge(env, auth, "authentication", options.challenge);
      return successResponse(request, { challengeId, options });
    }

    if (path === "/api/v1/webauthn/authentication/verify") {
      const challengeId = String(body.challengeId ?? "");
      const credentialId = String(body.credentialId ?? "");
      const response = body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"];
      if (!challengeId || !credentialId || !response || typeof response !== "object") return fail(request, "INVALID_REQUEST", "认证验证参数不完整。", 400);
      const expectedChallenge = await consumeChallenge(env, auth, challengeId, "authentication");
      if (!expectedChallenge) return fail(request, "CHALLENGE_INVALID", "认证挑战已过期、已使用或不属于当前会话。", 409);
      const credential = (await credentialsForUser(env, auth.userId)).find((item) => item.credential_id === credentialId);
      if (!credential) return fail(request, "CREDENTIAL_NOT_FOUND", "凭证不属于当前账户或已被撤销。", 403);
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: credential.credential_id,
          publicKey: decodeBase64Url(credential.public_key),
          counter: Number(credential.counter),
          transports: credential.transports,
        },
      });
      if (!verification.verified) return fail(request, "AUTHENTICATION_FAILED", "生物识别验证未通过。", 401);
      const updated = await rpc<boolean>(env, "tradepilot_webauthn_update_counter", {
        p_user_id: auth.userId,
        p_credential_id: credential.credential_id,
        p_counter: verification.authenticationInfo.newCounter,
      });
      if (!updated) return fail(request, "COUNTER_REPLAY", "凭证计数器检查失败，已拒绝本次认证。", 409);
      await rpc(env, "tradepilot_webauthn_grant_session", {
        p_user_id: auth.userId,
        p_session_id: auth.sessionId,
        p_credential_id: credential.credential_id,
        p_expires_at: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
      });
      return successResponse(request, { verified: true, expiresInSeconds: GRANT_TTL_MS / 1000 });
    }

    if (path === "/api/v1/webauthn/credential/revoke") {
      const credentialId = String(body.credentialId ?? "");
      if (!credentialId) return fail(request, "INVALID_REQUEST", "缺少凭证 ID。", 400);
      if (auth.aal !== "aal2") return fail(request, "STEP_UP_REQUIRED", "撤销凭证前，请先完成 TOTP 二次验证。", 403);
      const revoked = await rpc<boolean>(env, "tradepilot_webauthn_revoke_credential", {
        p_user_id: auth.userId, p_credential_id: credentialId,
      });
      return successResponse(request, { revoked });
    }

    return fail(request, "NOT_FOUND", "WebAuthn 接口不存在。", 404);
  } catch (error) {
    console.error("WEBAUTHN_OPERATION_FAILED", {
      path,
      error: error instanceof Error ? error.message.slice(0, 220) : "UNKNOWN",
    });
    return fail(request, "WEBAUTHN_OPERATION_FAILED", "生物识别认证服务暂时无法完成请求。", 500);
  }
}
