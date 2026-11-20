import { errorResponse, successResponse } from "./lib/http";
import { handleHealth } from "./routes/health";
import { handleWebAuthn } from "./routes/webauthn";
import { handleDiscovery, type DiscoveryRunInput } from "./routes/discovery";
import { handleSettings } from "./routes/settings";
import { handleTranslation } from "./routes/translation";
import { handleSearchExclusions } from "./routes/search-exclusions";
import { LeadDiscoveryWorkflow } from "./workflows/lead-discovery";
import { ContactEnrichmentWorkflow } from "./workflows/contact-enrichment";
import { FacebookDiscoveryWorkflow } from "./workflows/facebook-discovery";
import { handleFacebookDiscovery } from "./routes/facebook-discovery";
import { InstagramDiscoveryWorkflow } from "./workflows/instagram-discovery";
import { handleInstagramDiscovery } from "./routes/instagram-discovery";
import { handleAgentCenter } from "./routes/agent-center";
import { handleSkillRegistry, type SkillArtifactBucket } from "./routes/skill-registry";
import { handleTradeTools } from "./routes/trade-tools";
import { handleTradeDocuments } from "./routes/trade-documents";
import { handleMasterData } from "./routes/master-data";
import { handleProspectConsole } from "./routes/prospect-console";
import { handleProspectProfiling, handleProspectStrategy, handleProspectCities, handleProspectCountries } from "./routes/prospect-profiling";
import { handleContactValidation } from "./routes/contact-validation";
import { handleActorRegistry } from "./routes/actor-registry";
import { handleInbox } from "./routes/inbox";
import { handleInboxWebhook } from "./routes/inbox-webhooks";
import { handleInboxAttachment } from "./routes/inbox-attachments";
import { processInboxMediaJobs } from "./routes/inbox-media-worker";
import { AgentOrchestrationWorkflow } from "./workflows/agent-orchestration";

export interface WorkerEnv {
 BROWSER: { quickAction(action: 'pdf', input: Record<string, unknown>): Promise<Response> };
 ASSETS: { fetch(request: Request): Promise<Response> };
 SUPABASE_URL: string;
 SUPABASE_ANON_KEY: string;
 SUPABASE_SERVICE_ROLE_KEY: string;
 SKILL_ARTIFACTS: SkillArtifactBucket;
 ACTOR_GATEWAY_API_TOKEN?: string;
 INBOX_SCANNER_URL?: string;
 INBOX_SCANNER_HMAC_SECRET?: string;
 GOOGLE_MAPS_API_KEY?: string;
 DEEPL_API_KEY?: string;
 DHL_API_KEY?: string;
 UPS_CLIENT_ID?: string;
 UPS_CLIENT_SECRET?: string;
 FEDEX_CLIENT_ID?: string;
 FEDEX_CLIENT_SECRET?: string;
 SERPER_API_KEY?: string;
 SERPAPI_API_KEY?: string;
 CLOUDFLARE_WORKER_NAME?: string;
 AGENT_ENCRYPTION_KEY?: string;
 AI: { run(model:string,input:Record<string,unknown>): Promise<unknown> };
 OVERPASS_API_URL?: string;
 LEAD_DISCOVERY_WORKFLOW: { create(options: { id: string; params: { runId: string; ownerId: string; input: DiscoveryRunInput } }): Promise<{ id: string }> };
 CONTACT_ENRICHMENT_WORKFLOW: { create(options:{id:string;params:{jobId:string;ownerId:string;recordIds:string[];providers?:Array<"website"|"apollo"|"zoominfo">}}):Promise<{id:string}> };
 FACEBOOK_DISCOVERY_WORKFLOW: { create(options:{id:string;params:{runId:string;ownerId:string;input:import("./routes/facebook-discovery").FacebookInput}}):Promise<{id:string}> };
 INSTAGRAM_DISCOVERY_WORKFLOW: { create(options:{id:string;params:{runId:string;ownerId:string;input:import("./routes/instagram-discovery").InstagramInput}}):Promise<{id:string}> };
 AGENT_ORCHESTRATION_WORKFLOW: { create(options:{id:string;params:{runId:string;ownerId:string;input:DiscoveryRunInput;goal:string;specialists:Array<{agentKey:string;instruction:string}>}}):Promise<{id:string}>; get(id:string):{status():Promise<{status:string}>;pause():Promise<void>;resume():Promise<void>;restart():Promise<void>;terminate():Promise<void>} };
}

export { LeadDiscoveryWorkflow, ContactEnrichmentWorkflow, FacebookDiscoveryWorkflow, InstagramDiscoveryWorkflow, AgentOrchestrationWorkflow };

async function enforceWebAuthnSession(request: Request, env: WorkerEnv): Promise<Response | null> {
 const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if (!token) {
  const isSignedWebhook = new URL(request.url).pathname.startsWith("/api/v1/inbox/webhooks/");
  return isSignedWebhook ? null : errorResponse(request,"UNAUTHENTICATED","请先登录 TradePilot。",401);
 }
 try {
  const userResponse = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
   headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!userResponse.ok) return errorResponse(request,"UNAUTHENTICATED","登录会话无效或已过期。",401);
  const user = await userResponse.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return errorResponse(request,"UNAUTHENTICATED","登录会话无效。",401);
  const jwtPart = token.split(".")[1];
  if (!jwtPart) return errorResponse(request,"UNAUTHENTICATED","登录会话无效。",401);
  const normalized = jwtPart.replace(/-/g,"+").replace(/_/g,"/");
  const claims = JSON.parse(atob(normalized + "=".repeat((4-normalized.length%4)%4))) as Record<string,unknown>;
  if (claims.sub !== user.id || claims.role !== "authenticated" || claims.iss !== env.SUPABASE_URL.replace(/\/$/,"") + "/auth/v1") {
   return errorResponse(request,"UNAUTHENTICATED","登录会话无效。",401);
  }
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return errorResponse(request,"UNAUTHENTICATED","登录会话缺少有效标识。",401);
  const headers = {
   apikey: env.SUPABASE_SERVICE_ROLE_KEY,
   Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
   "Content-Type": "application/json",
  };
  const enabledResponse = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/tradepilot_webauthn_is_enabled", {
   method:"POST",headers,body:JSON.stringify({p_user_id:user.id}),
  });
  if (!enabledResponse.ok) return errorResponse(request,"MFA_POLICY_UNAVAILABLE","无法确认账户安全策略，已阻止访问。",503);
  const enabled = await enabledResponse.json() as boolean;
  if (!enabled) {
   const totpResponse = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/tradepilot_webauthn_has_verified_totp", {
    method:"POST",headers,body:JSON.stringify({p_user_id:user.id}),
   });
   if (!totpResponse.ok) return errorResponse(request,"MFA_POLICY_UNAVAILABLE","无法确认 TOTP 安全策略，已阻止访问。",503);
   const hasVerifiedTotp = await totpResponse.json() as boolean;
   if (hasVerifiedTotp && claims.aal !== "aal2") {
    return errorResponse(request,"TOTP_MFA_REQUIRED","此账户已启用 TOTP 多因子认证，请先完成二次验证。",403);
   }
   return null;
  }
  if (claims.aal === "aal2") return null;
  const grantResponse = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/tradepilot_webauthn_has_grant", {
   method:"POST",headers,body:JSON.stringify({p_user_id:user.id,p_session_id:sessionId}),
  });
  if (!grantResponse.ok) return errorResponse(request,"MFA_POLICY_UNAVAILABLE","无法确认会话安全状态，已阻止访问。",503);
  const granted = await grantResponse.json() as boolean;
  if (!granted) return errorResponse(request,"WEBAUTHN_MFA_REQUIRED","此账户已启用生物识别 MFA，请完成本次登录的设备验证。",403);
  return null;
 } catch {
  return errorResponse(request,"MFA_POLICY_UNAVAILABLE","无法确认会话安全状态，已阻止访问。",503);
 }
}


export default {
 async scheduled(_controller: { scheduledTime: number; cron: string }, env: WorkerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
  ctx.waitUntil(processInboxMediaJobs(env).catch(error => {
   console.error("INBOX_MEDIA_QUEUE_RUN_FAILED", { code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "MEDIA_QUEUE_FAILED" });
  }));
 },
 async fetch(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  try {
   if (url.pathname === "/api/v1/public-config" && request.method === "GET") return successResponse(request, { supabaseUrl: env.SUPABASE_URL, supabasePublishableKey: env.SUPABASE_ANON_KEY });
   if (url.pathname === "/api/v1/health" && request.method === "GET") return handleHealth(request);
   if (url.pathname.startsWith("/api/v1/webauthn/")) return await handleWebAuthn(request, env);
   if (url.pathname.startsWith("/api/") && url.pathname !== "/api/v1/public-config" && url.pathname !== "/api/v1/health") {
    const mfaFailure = await enforceWebAuthnSession(request, env);
    if (mfaFailure) return mfaFailure;
   }
   if (url.pathname.startsWith("/api/v1/actor-registry")) return await handleActorRegistry(request, env);
   if (url.pathname.startsWith("/api/v1/trade-tools/")) return await handleTradeTools(request, env);
   if (url.pathname.startsWith("/api/v1/agent/skills")) return await handleSkillRegistry(request, env);
   if (url.pathname.startsWith("/api/v1/agent/")) return await handleAgentCenter(request, env);
   if (url.pathname.startsWith("/api/v1/trade/")) return await handleTradeDocuments(request, env);
   if (url.pathname.startsWith("/api/v1/master-data/")) return await handleMasterData(request, env);
   if (url.pathname === "/api/v1/prospect-console" && request.method === "GET") return await handleProspectConsole(request, env);
   if (url.pathname === "/api/v1/prospect-profiling/autocomplete") return await handleProspectProfiling(request, env);
   if (url.pathname === "/api/v1/prospect-profiling/strategy") return await handleProspectStrategy(request, env);
   if (url.pathname === "/api/v1/prospect-profiling/cities") return await handleProspectCities(request, env);
   if (url.pathname === "/api/v1/prospect-profiling/countries") return await handleProspectCountries(request, env);
   if (url.pathname === "/api/v1/contact-validation") return await handleContactValidation(request, env);
   if (url.pathname.startsWith("/api/v1/actor-registry")) return await handleActorRegistry(request, env);
   if (url.pathname.startsWith("/api/v1/inbox/webhooks/")) return await handleInboxWebhook(request, env);
   if (url.pathname.startsWith("/api/v1/inbox/attachments/")) return await handleInboxAttachment(request, env);
   if (url.pathname.startsWith("/api/v1/inbox/")) return await handleInbox(request, env);
   if (url.pathname === "/api/v1/settings/search-exclusions") return await handleSearchExclusions(request, env);
   if (url.pathname.startsWith("/api/v1/settings/")) return await handleSettings(request, env);
   if (url.pathname.startsWith("/api/v1/discovery/translate") || url.pathname === "/api/v1/trade-tools/translate") return await handleTranslation(request, env);
   if (url.pathname === "/api/v1/facebook-discovery-runs" && request.method === "POST") return await handleFacebookDiscovery(request, env);
   if (url.pathname === "/api/v1/instagram-discovery-runs" && request.method === "POST") return await handleInstagramDiscovery(request, env);
   if (url.pathname === "/api/v1/search-discovery-runs" && request.method === "POST") { const { handleSearchDiscovery } = await import("./routes/search-discovery"); return await handleSearchDiscovery(request, env); }
   if (url.pathname.startsWith("/api/v1/discovery-runs") || url.pathname.startsWith("/api/v1/discovery-records") || url.pathname.startsWith("/api/v1/discovery-contact-enrichments") || url.pathname === "/api/v1/leads") return await handleDiscovery(request, env);
   if (url.pathname.startsWith("/api/")) return errorResponse(request,"NOT_FOUND","The requested API endpoint does not exist.",404);
   return env.ASSETS.fetch(request);
  } catch (error) {
   console.error("WORKER_API_UNHANDLED_ERROR", { path: url.pathname, error: String(error).slice(0, 500) });
   if (url.pathname.startsWith("/api/")) {
    return errorResponse(request, "INTERNAL_SERVER_ERROR", "服务暂时不可用，请稍后重试。", 500);
   }
   throw error;
  }
 },
};
