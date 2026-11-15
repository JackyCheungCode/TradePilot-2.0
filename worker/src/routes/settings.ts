import { errorResponse, successResponse } from "../lib/http";

interface SettingsEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  DEEPL_API_KEY?: string;
  DHL_API_KEY?: string;
  UPS_CLIENT_ID?: string;
  UPS_CLIENT_SECRET?: string;
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
  SERPER_API_KEY?: string;
  SERPAPI_API_KEY?: string;
  APIFY_API_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WORKER_NAME?: string;
  AI?: { run(model:string,input:Record<string,unknown>): Promise<unknown> };
}
type ServiceKey = "cloudflare" | "supabase" | "googleMaps" | "deepl" | "serper" | "serpapi" | "apify" | "dhl" | "upsClientId" | "upsClientSecret" | "fedexClientId" | "fedexClientSecret";
type CredentialBody = { cloudflareApiToken?: string; supabaseServiceRoleKey?: string; googleMapsApiKey?: string; deeplApiKey?: string; serperApiKey?: string; serpapiApiKey?: string; apifyApiToken?: string; dhlApiKey?: string; upsClientId?: string; upsClientSecret?: string; fedexClientId?: string; fedexClientSecret?: string };
const secretNames: Record<ServiceKey, string> = {
  cloudflare: "CLOUDFLARE_API_TOKEN",
  supabase: "SUPABASE_SERVICE_ROLE_KEY",
  googleMaps: "GOOGLE_MAPS_API_KEY",
  deepl: "DEEPL_API_KEY",
  serper: "SERPER_API_KEY",
  serpapi: "SERPAPI_API_KEY",
  apify: "APIFY_API_TOKEN",
  dhl: "DHL_API_KEY",
  upsClientId: "UPS_CLIENT_ID",
  upsClientSecret: "UPS_CLIENT_SECRET",
  fedexClientId: "FEDEX_CLIENT_ID",
  fedexClientSecret: "FEDEX_CLIENT_SECRET",
};
const bodyFields: Record<ServiceKey, keyof CredentialBody> = {
  cloudflare: "cloudflareApiToken",
  supabase: "supabaseServiceRoleKey",
  googleMaps: "googleMapsApiKey",
  deepl: "deeplApiKey",
  serper: "serperApiKey",
  serpapi: "serpapiApiKey",
  apify: "apifyApiToken",
  dhl: "dhlApiKey",
  upsClientId: "upsClientId",
  upsClientSecret: "upsClientSecret",
  fedexClientId: "fedexClientId",
  fedexClientSecret: "fedexClientSecret",
};

async function authenticated(request: Request, env: SettingsEnv): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);
  const token = bearerMatch?.[1];
  if (!token) return false;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  return response.ok;
}

function cloudflareHeaders(token: string) {
  return { Authorization: "Bearer " + token, "Content-Type": "application/json" };
}

async function cloudflareRequest(token: string, path: string, init?: RequestInit) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    ...init,
    headers: { ...cloudflareHeaders(token), ...init?.headers },
  });
  const raw = await response.text();
  let body: { success?: boolean; errors?: Array<{ code?: number; message?: string }> } = {};
  try { body = raw ? JSON.parse(raw) as typeof body : {}; } catch { /* Preserve non-JSON API diagnostics below. */ }
  if (!response.ok || body.success === false) {
    const details = body.errors?.map((item) => [item.code ? `[${item.code}]` : "", item.message ?? ""].filter(Boolean).join(" ")).filter(Boolean).join("; ");
    throw new Error(details || `Cloudflare API HTTP ${response.status}: ${raw.slice(0, 240) || "无响应内容"}`);
  }
  return body;
}

async function saveOneSecret(service: ServiceKey, value: string, env: SettingsEnv): Promise<string> {
  const cloudflareToken = service === "cloudflare" ? value : env.CLOUDFLARE_API_TOKEN;
  if (!cloudflareToken) throw new Error("请先单独保存 Cloudflare API Token，再配置其他服务。");
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "ea4e98dce9c478d7dd5c07f10e5c722d";
  const workerName = env.CLOUDFLARE_WORKER_NAME ?? "tradepilot";
  await cloudflareRequest(cloudflareToken, "/user/tokens/verify");
  // This endpoint saves exactly one binding and avoids the bulk-merge path for the
  // one-key-at-a-time settings UI. Cloudflare's single-secret API is additive.
  await cloudflareRequest(cloudflareToken, `/accounts/${accountId}/workers/scripts/${workerName}/secrets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: secretNames[service], type: "secret_text", text: value }),
  });
  return `${service === "cloudflare" ? "Cloudflare" : service === "supabase" ? "Supabase" : service === "googleMaps" ? "Google Maps" : service === "deepl" ? "DeepL" : service === "serper" ? "Serper" : service === "serpapi" ? "SerpApi" : service === "dhl" ? "DHL" : service.startsWith("ups") ? "UPS" : service.startsWith("fedex") ? "FedEx" : "Apify"} 密钥已单独保存至 Cloudflare Worker Secrets。`;
}

async function testOneService(service: ServiceKey, env: SettingsEnv) {
  if (service === "cloudflare") {
    if (!env.CLOUDFLARE_API_TOKEN) return { ok: false, message: "尚未配置" };
    try {
      await cloudflareRequest(env.CLOUDFLARE_API_TOKEN, "/user/tokens/verify");
      return { ok: true, message: "Cloudflare Token 有效" };
    } catch { return { ok: false, message: "Cloudflare Token 无效或权限不足" }; }
  }
  if (service === "supabase") {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, message: "尚未配置" };
    try {
      const response = await fetch(env.SUPABASE_URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY } });
      return { ok: response.ok, message: response.ok ? "Supabase 服务密钥可用" : "Supabase 请求失败，请检查服务密钥" };
    } catch { return { ok: false, message: "无法连接 Supabase" }; }
  }
  if (service === "serper") {
    if (!env.SERPER_API_KEY) return { ok: false, message: "尚未配置" };
    try {
      const response = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "X-API-KEY": env.SERPER_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ q: "TradePilot API connection test", gl: "us", hl: "en", num: 1 }) });
      if (!response.ok) return { ok: false, message: "Serper API 请求失败（HTTP " + response.status + "），请检查 Key 和账户额度" };
      const body = await response.json() as { organic?: unknown[] };
      return { ok: true, message: "Serper API 可用 · 已返回 " + (body.organic?.length ?? 0) + " 条测试结果（消耗 1 次搜索额度）" };
    } catch { return { ok: false, message: "无法连接 Serper API" }; }
  }
  if (service === "apify") {
    if (!env.APIFY_API_TOKEN) return { ok: false, message: "尚未配置" };
    try { const response = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: "Bearer " + env.APIFY_API_TOKEN.trim(), Accept: "application/json" } }); const raw = await response.text(); let body: { data?: { username?: string }; error?: { type?: string; message?: string } } = {}; try { body = raw ? JSON.parse(raw) as typeof body : {}; } catch { /* handled by status below */ } if (!response.ok) { const reason = body.error?.message || body.error?.type || "Apify 未接受此 Token"; return { ok: false, message: "Apify HTTP " + response.status + " · " + reason + (response.status === 401 ? "。请在 Apify Console 新建有效 API Token，并重新保存。" : "") }; } return { ok: true, message: "Apify API 可用" + (body.data?.username ? " · 账户 " + body.data.username : "") }; } catch { return { ok: false, message: "无法连接 Apify API，请检查网络后重试" }; }
  }
  if (service === "dhl") {
    if (!env.DHL_API_KEY) return { ok: false, message: "尚未配置" };
    try { const r = await fetch("https://api-eu.dhl.com/track/shipments?trackingNumber=00340434161094000000", { headers: { "DHL-API-Key": env.DHL_API_KEY, Accept: "application/json" } }); return { ok: r.ok || r.status === 404, message: r.ok || r.status === 404 ? "DHL API 凭证可用" : "DHL API 返回 HTTP " + r.status + "，请检查 API Key 与授权" }; } catch { return { ok: false, message: "无法连接 DHL API" }; }
  }
  if (service === "upsClientId" || service === "upsClientSecret") {
    if (!env.UPS_CLIENT_ID || !env.UPS_CLIENT_SECRET) return { ok: false, message: "请同时配置 UPS Client ID 和 Client Secret" };
    try { const auth = btoa(env.UPS_CLIENT_ID + ":" + env.UPS_CLIENT_SECRET); const r = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", { method: "POST", headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }); return { ok: r.ok, message: r.ok ? "UPS OAuth 凭证可用" : "UPS OAuth 认证失败（HTTP " + r.status + "）" }; } catch { return { ok: false, message: "无法连接 UPS API" }; }
  }
  if (service === "fedexClientId" || service === "fedexClientSecret") {
    if (!env.FEDEX_CLIENT_ID || !env.FEDEX_CLIENT_SECRET) return { ok: false, message: "请同时配置 FedEx API Key 和 Secret Key" };
    try { const r = await fetch("https://apis.fedex.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.FEDEX_CLIENT_ID, client_secret: env.FEDEX_CLIENT_SECRET }) }); return { ok: r.ok, message: r.ok ? "FedEx OAuth 凭证可用" : "FedEx OAuth 认证失败（HTTP " + r.status + "）" }; } catch { return { ok: false, message: "无法连接 FedEx API" }; }
  }
  if (service === "serpapi") {
    if (!env.SERPAPI_API_KEY) return { ok: false, message: "尚未配置" };
    try {
      const params = new URLSearchParams({ engine: "google", q: "TradePilot API connection test", gl: "us", hl: "en", num: "1", api_key: env.SERPAPI_API_KEY });
      const response = await fetch("https://serpapi.com/search.json?" + params.toString());
      if (!response.ok) return { ok: false, message: "SerpApi 请求失败（HTTP " + response.status + "），请检查 Key 和账户额度" };
      const body = await response.json() as { error?: string; organic_results?: unknown[] };
      if (body.error) return { ok: false, message: body.error.slice(0, 180) };
      return { ok: true, message: "SerpApi 可用 · 已返回 " + (body.organic_results?.length ?? 0) + " 条测试结果（消耗 1 次搜索额度）" };
    } catch { return { ok: false, message: "无法连接 SerpApi" }; }
  }
  if (service === "deepl") {
    if (!env.DEEPL_API_KEY) return { ok: false, message: "尚未配置" };
    try {
      const baseUrl = env.DEEPL_API_KEY.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
      const response = await fetch(baseUrl + "/v2/usage", { headers: { Authorization: "DeepL-Auth-Key " + env.DEEPL_API_KEY } });
      if (!response.ok) return { ok: false, message: response.status === 403 ? "DeepL API Key 无效或无权访问" : "DeepL API 请求失败（HTTP " + response.status + "）" };
      const usage = await response.json() as { character_count?: number; character_limit?: number };
      return { ok: true, message: typeof usage.character_count === "number" && typeof usage.character_limit === "number" ? "DeepL API 可用 · 已使用 " + usage.character_count.toLocaleString() + " / " + usage.character_limit.toLocaleString() + " 字符" : "DeepL API 可用" };
    } catch { return { ok: false, message: "无法连接 DeepL API" }; }
  }
  if (!env.GOOGLE_MAPS_API_KEY) return { ok: false, message: "尚未配置" };
  try {
    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geocodeUrl.searchParams.set("address", "Berlin, Germany");
    geocodeUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
    const geocodeResponse = await fetch(geocodeUrl);
    const geocode = await geocodeResponse.json() as { status?: string; results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }> };
    if (!geocodeResponse.ok || geocode.status !== "OK" || !geocode.results?.[0]?.geometry?.location) return { ok: false, message: "Google Geocoding API 不可用，请检查密钥与 API 启用状态" };
    const point = geocode.results[0].geometry.location;
    const timezoneUrl = new URL("https://maps.googleapis.com/maps/api/timezone/json");
    timezoneUrl.searchParams.set("location", point.lat + "," + point.lng);
    timezoneUrl.searchParams.set("timestamp", String(Math.floor(Date.now() / 1000)));
    timezoneUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
    const timezoneResponse = await fetch(timezoneUrl);
    const timezone = await timezoneResponse.json() as { status?: string; timeZoneId?: string };
    return { ok: timezoneResponse.ok && timezone.status === "OK" && Boolean(timezone.timeZoneId), message: timezoneResponse.ok && timezone.status === "OK" ? "Google Geocoding 与 Time Zone API 可用" : "Google Time Zone API 不可用，请确认已启用该 API" };
  } catch { return { ok: false, message: "无法连接 Google Maps API" }; }
}


type AIProtocol = "openai" | "anthropic" | "gemini" | "workers-ai";
type AIProviderConfig = {id:string;providerKey:string;name:string;protocol:AIProtocol;baseUrl:string;model:string;secretName?:string;configured:boolean;enabled?:boolean};
type AIConfig = {defaultModel:string;taskModels:Record<string,string>;providers:AIProviderConfig[]};
const defaultAIConfig:AIConfig={defaultModel:"@cf/google/gemma-4-26b-a4b-it",taskModels:{},providers:[{id:"workers-ai",providerKey:"cloudflare-workers-ai",name:"Cloudflare Workers AI",protocol:"workers-ai",baseUrl:"",model:"@cf/google/gemma-4-26b-a4b-it",configured:true}]};
const legacyAISecrets:Record<string,string>={openai:"AI_PROVIDER_OPENAI_API_KEY",anthropic:"AI_PROVIDER_ANTHROPIC_API_KEY",gemini:"AI_PROVIDER_GEMINI_API_KEY",deepseek:"AI_PROVIDER_DEEPSEEK_API_KEY",qwen:"AI_PROVIDER_QWEN_API_KEY",zhipu:"AI_PROVIDER_ZHIPU_API_KEY",kimi:"AI_PROVIDER_KIMI_API_KEY",minimax:"AI_PROVIDER_MINIMAX_API_KEY",openrouter:"AI_PROVIDER_OPENROUTER_API_KEY",siliconflow:"AI_PROVIDER_SILICONFLOW_API_KEY",custom:"AI_PROVIDER_CUSTOM_API_KEY"};
const apiSecretNames:Record<string,string>={apify:"tradepilot_api_apify",deepl:"tradepilot_api_deepl",googleMaps:"tradepilot_api_google_maps",dhl:"tradepilot_api_dhl",upsClientId:"tradepilot_api_ups_client_id",upsClientSecret:"tradepilot_api_ups_"+"client_secret",fedexClientId:"tradepilot_api_fedex_client_id",fedexClientSecret:"tradepilot_api_fedex_"+"client_secret",cloudflareApiToken:"tradepilot_api_cloudflare_token",cloudflareAccountId:"tradepilot_api_cloudflare_account_id",serper:"tradepilot_api_serper",serpapi:"tradepilot_api_serpapi"};
const legacyApiEnv:Record<string,string>={apify:"APIFY_API_TOKEN",deepl:"DEEPL_API_KEY",googleMaps:"GOOGLE_MAPS_API_KEY",dhl:"DHL_API_KEY",upsClientId:"UPS_CLIENT_ID",upsClientSecret:"UPS_CLIENT_SECRET",fedexClientId:"FEDEX_CLIENT_ID",fedexClientSecret:"FEDEX_CLIENT_SECRET",serper:"SERPER_API_KEY",serpapi:"SERPAPI_API_KEY"};
async function vaultRpc<T>(name:string,args:Record<string,unknown>,env:SettingsEnv):Promise<T>{
 const key=env.SUPABASE_SERVICE_ROLE_KEY??"";
 if(!key)throw new Error("服务端凭证存储未配置");
 const r=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(args)});
 if(!r.ok)throw new Error("安全凭证存储请求失败（HTTP "+r.status+"）");
 return await r.json() as T;
}
async function readVaultSecrets(names:string[],env:SettingsEnv):Promise<Record<string,string>>{
 if(!names.length)return {};
 const rows=await vaultRpc<Array<{name:string;secret:string}>>("tradepilot_secret_get",{p_names:names},env);
 return Object.fromEntries((rows??[]).map(row=>[row.name,row.secret]));
}
async function saveVaultSecret(name:string,value:string,description:string,env:SettingsEnv){
 await vaultRpc<string>("tradepilot_secret_upsert",{p_name:name,p_secret:value,p_description:description},env);
}
async function deleteVaultSecret(name:string,env:SettingsEnv){
 await vaultRpc<boolean>("tradepilot_secret_delete",{p_name:name},env);
}
function envSecret(env:SettingsEnv,name:string):string{
 return String((env as unknown as Record<string,unknown>)[name]??"");
}
function aiSecretName(id:string):string{
 const safe=id.toLowerCase().replace(/[^a-z0-9_-]/g,"").replace(/-/g,"_");
 if(!safe||safe.length>72)throw new Error("AI 配置 ID 无效");
 return "tradepilot_ai_"+safe;
}
async function readAIConfig(env:SettingsEnv):Promise<AIConfig>{
 const key=env.SUPABASE_SERVICE_ROLE_KEY??"";
 const r=await fetch(env.SUPABASE_URL+"/rest/v1/ai_provider_settings?id=eq.true&select=config",{headers:{apikey:key,Authorization:"Bearer "+key}});
 if(!r.ok)throw new Error("读取 AI 配置失败");
 const rows=await r.json() as Array<{config:AIConfig}>;
 const c=rows[0]?.config??defaultAIConfig;
 const providers=(c.providers??defaultAIConfig.providers).map(p=>({...p,providerKey:p.providerKey??(p.id==="workers-ai"?"cloudflare-workers-ai":p.id),secretName:p.secretName??(legacyAISecrets[p.id]?undefined:undefined)}));
 const secretNames=providers.map(p=>p.secretName).filter((x):x is string=>Boolean(x));
 const secrets=await readVaultSecrets(secretNames,env);
 return {...defaultAIConfig,...c,providers:providers.map(p=>({...p,configured:p.protocol==="workers-ai"?(Boolean(env.AI)||Boolean(secrets.tradepilot_api_cloudflare_token)||Boolean(env.CLOUDFLARE_API_TOKEN)):Boolean((p.secretName&&secrets[p.secretName])||(legacyAISecrets[p.providerKey]&&envSecret(env,legacyAISecrets[p.providerKey])))}))};
}
async function writeAIConfig(config:AIConfig,env:SettingsEnv){
 const key=env.SUPABASE_SERVICE_ROLE_KEY??"";
 const safe:AIConfig={defaultModel:String(config.defaultModel??defaultAIConfig.defaultModel).slice(0,200),taskModels:Object.fromEntries(Object.entries(config.taskModels??{}).slice(0,30).map(([k,v])=>[k,String(v).slice(0,200)])),providers:(config.providers??[]).slice(0,40).map(p=>({id:String(p.id).slice(0,80),providerKey:String(p.providerKey??p.id).slice(0,80),name:String(p.name).slice(0,100),protocol:p.protocol,baseUrl:String(p.baseUrl??"").slice(0,500),model:String(p.model??"").slice(0,200),secretName:p.secretName?String(p.secretName).slice(0,120):undefined,configured:Boolean(p.configured),enabled:p.enabled!==false}))};
 const r=await fetch(env.SUPABASE_URL+"/rest/v1/ai_provider_settings?on_conflict=id",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:true,config:safe,updated_at:new Date().toISOString()})});
 if(!r.ok)throw new Error("保存 AI 配置失败");
}
function safeAIBaseUrl(raw:string,fallback:string):string{
 const value=(raw||fallback).trim();
 let url:URL;try{url=new URL(value)}catch{throw new Error("模型 Base URL 格式无效")}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("模型接口只允许 HTTPS 公网地址");
 if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test")||host.endsWith(".invalid")||host.endsWith(".example")||/^\d{1,3}(\.\d{1,3}){3}$/.test(host))throw new Error("模型 Base URL 不允许使用本地地址或 IP 地址");
 return url.toString().replace(/\/$/,"");
}
function defaultAIBase(providerKey:string,protocol:AIProtocol):string{
 if(providerKey==="openrouter")return "https://openrouter.ai/api/v1";
 if(providerKey==="deepseek")return "https://api.deepseek.com/v1";
 if(providerKey==="qwen")return "https://dashscope.aliyuncs.com/compatible-mode/v1";
 if(providerKey==="zhipu")return "https://open.bigmodel.cn/api/paas/v4";
 if(providerKey==="kimi")return "https://api.moonshot.cn/v1";
 if(providerKey==="minimax")return "https://api.minimax.chat/v1";
 if(providerKey==="siliconflow")return "https://api.siliconflow.cn/v1";
 if(providerKey==="xai")return "https://api.x.ai/v1";
 if(providerKey==="groq")return "https://api.groq.com/openai/v1";
 if(providerKey==="baidu-qianfan")return "https://qianfan.baidubce.com/v2";
 if(providerKey==="tencent-hunyuan")return "https://api.hunyuan.cloud.tencent.com/v1";
 if(providerKey==="volcengine-ark")return "https://ark.cn-beijing.volces.com/api/v3";
 if(providerKey==="together")return "https://api.together.xyz/v1";
 if(protocol==="anthropic")return "https://api.anthropic.com/v1";
 if(protocol==="gemini")return "https://generativelanguage.googleapis.com/v1beta";
 return "https://api.openai.com/v1";
}
async function providerApiKey(providerKey:string,secretName:string|undefined,apiKey:string|undefined,env:SettingsEnv):Promise<string>{
 if(apiKey?.trim())return apiKey.trim();
 if(providerKey==="cloudflare-workers-ai"){
  const secrets=await readVaultSecrets([apiSecretNames.cloudflareApiToken],env);
  return secrets[apiSecretNames.cloudflareApiToken]||env.CLOUDFLARE_API_TOKEN||"";
 }
 if(secretName){const secrets=await readVaultSecrets([secretName],env);return secrets[secretName]||"";}
 const legacy=legacyAISecrets[providerKey];return legacy?envSecret(env,legacy):"";
}
async function listAIModels(providerKey:string,protocol:AIProtocol,baseUrl:string,apiKey:string|undefined,env:SettingsEnv):Promise<Array<{id:string;name:string}>>{
 const key=await providerApiKey(providerKey,undefined,apiKey,env);
 if(providerKey!=="cloudflare-workers-ai"&&!key)throw new Error("请填写 API Key 后获取模型");
 let response:Response;
 if(providerKey==="cloudflare-workers-ai"){
  const secrets=await readVaultSecrets([apiSecretNames.cloudflareAccountId],env);
  const account=secrets[apiSecretNames.cloudflareAccountId]||env.CLOUDFLARE_ACCOUNT_ID||"";
  if(!account||!key)throw new Error("请先在 API 集成的 Cloudflare 配置中填写 Account ID 和 Workers AI API Token");
  response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/ai/models/search?per_page=100&page=1&hide_experimental=true",{headers:{Authorization:"Bearer "+key}});
 }else{
  const base=safeAIBaseUrl(baseUrl,defaultAIBase(providerKey,protocol));
  const headers:Record<string,string>={Accept:"application/json"};
  let endpoint=base+"/models";
  if(protocol==="anthropic"){headers["x-api-key"]=key;headers["anthropic-version"]="2023-06-01";endpoint+="?limit=100";}
  else if(protocol==="gemini"){endpoint+="?pageSize=100&key="+encodeURIComponent(key);}
  else headers.Authorization="Bearer "+key;
  response=await fetch(endpoint,{headers,redirect:"manual"});
 }
 const raw=await response.text();let body:Record<string,unknown>={};try{body=raw?JSON.parse(raw) as Record<string,unknown>:{};}catch{/* response checked below */}
 if(!response.ok)return (()=>{throw new Error("获取模型失败（HTTP "+response.status+"）："+raw.slice(0,180));})();
 let items:unknown[]=[];
 if(providerKey==="cloudflare-workers-ai")items=Array.isArray(body.result)?body.result:[];
 else if(protocol==="gemini")items=Array.isArray(body.models)?body.models:[];
 else items=Array.isArray(body.data)?body.data:[];
 const models=items.map(item=>{
  const row=item as Record<string,unknown>;
  const id=String(row.id??row.name??"").replace(/^models\//,"");
  return id?{id,name:String(row.display_name??row.name??id)}:null;
 }).filter((item):item is {id:string;name:string}=>Boolean(item));
 if(!models.length)throw new Error("供应商接口已响应，但没有返回可用模型；请检查 API 权限或使用自定义模型 ID");
 return models.slice(0,500);
}
async function testAIProvider(providerKey:string,protocol:AIProtocol,baseUrl:string,model:string,apiKey:string|undefined,env:SettingsEnv,secretName?:string){
 if(!model)return {ok:false,message:"请先选择模型"};
 const key=await providerApiKey(providerKey,secretName,apiKey,env);
 try{
  if(providerKey==="cloudflare-workers-ai"){
   if(env.AI){await env.AI.run(model,{messages:[{role:"user",content:"Reply with OK"}]});return {ok:true,message:"Cloudflare Workers AI 连接成功"};}
   const secrets=await readVaultSecrets([apiSecretNames.cloudflareAccountId],env);
   const account=secrets[apiSecretNames.cloudflareAccountId]||env.CLOUDFLARE_ACCOUNT_ID||"";
   if(!account||!key)return {ok:false,message:"请先配置 Cloudflare Account ID 和 Workers AI API Token"};
   const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/ai/run/"+encodeURIComponent(model),{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:"Reply with OK"}]})});
   return {ok:r.ok,message:r.ok?"Cloudflare Workers AI 测试成功":"Workers AI 请求失败（HTTP "+r.status+"）"};
  }
  if(!key)return {ok:false,message:"请填写 API Key"};
  const base=safeAIBaseUrl(baseUrl,defaultAIBase(providerKey,protocol));
  let r:Response;
  if(protocol==="anthropic")r=await fetch(base+"/messages",{method:"POST",redirect:"manual",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model,max_tokens:12,messages:[{role:"user",content:"Reply with OK"}]})});
  else if(protocol==="gemini")r=await fetch(base+"/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",redirect:"manual",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:"Reply with OK"}]}],generationConfig:{maxOutputTokens:12}})});
  else r=await fetch(base+"/chat/completions",{method:"POST",redirect:"manual",headers:{Authorization:"Bearer "+key,"content-type":"application/json",...(providerKey==="openrouter"?{"HTTP-Referer":"https://tradepilot.xg-y.workers.dev","X-Title":"TradePilot"}:{})},body:JSON.stringify({model,messages:[{role:"user",content:"Reply with OK"}],max_tokens:12})});
  if(r.status>=300&&r.status<400)return {ok:false,message:"模型服务返回 HTTP "+r.status+" 重定向，请检查 Base URL"};
  if(!r.ok){const detail=(await r.text()).slice(0,180);return {ok:false,message:"模型接口返回 HTTP "+r.status+"："+detail};}
  return {ok:true,message:"模型服务连接成功，已收到测试响应"};
 }catch(error){return {ok:false,message:"模型连接异常："+(error instanceof Error?error.message:String(error)).slice(0,180)};}
}

export async function handleSettings(request: Request, env: SettingsEnv): Promise<Response> {
  if (!(await authenticated(request, env))) return errorResponse(request, "UNAUTHORIZED", "请先登录后再管理集成密钥。", 401);
  const url = new URL(request.url);
  const instagramDefaults={hashtagActor:"apify~instagram-hashtag-scraper",searchActor:"apify~instagram-search-scraper",profilePrimaryActor:"transparent_meteorite~instagram-public-profile-scraper",profileFallbackActor:"dami_studio~instagram-profile-scraper",discoveryCostPer1000:0,profileCostPer1000:0,actorVersion:"latest"};
  if(url.pathname==="/api/v1/settings/instagram-discovery"&&request.method==="GET"){try{const key=env.SUPABASE_SERVICE_ROLE_KEY??"";const r=await fetch(env.SUPABASE_URL+"/rest/v1/instagram_discovery_settings?id=eq.true&select=config",{headers:{apikey:key,Authorization:"Bearer "+key}});if(!r.ok)throw new Error("读取 Instagram 配置失败");const rows=await r.json() as Array<{config:Record<string,unknown>}>;return successResponse(request,{...instagramDefaults,...(rows[0]?.config??{})});}catch(e){return errorResponse(request,"INSTAGRAM_CONFIG_READ_FAILED",e instanceof Error?e.message:"读取 Instagram 配置失败",502);}}
  if(url.pathname==="/api/v1/settings/instagram-discovery"&&request.method==="PUT"){try{const body=await request.json() as Record<string,unknown>;const actorKeys=["hashtagActor","searchActor","profilePrimaryActor","profileFallbackActor"];const next:Record<string,unknown>={};for(const key of actorKeys){const value=String(body[key]??instagramDefaults[key as keyof typeof instagramDefaults]).trim();if(!/^[A-Za-z0-9_~-]{3,120}$/.test(value))return errorResponse(request,"INVALID_ACTOR_ID","Actor ID 格式无效："+key,400);next[key]=value;}for(const key of ["discoveryCostPer1000","profileCostPer1000"]){const value=Number(body[key]??0);if(!Number.isFinite(value)||value<0||value>10000)return errorResponse(request,"INVALID_ACTOR_COST","Actor 单价必须为 0 到 10,000 USD。",400);next[key]=value;}next.actorVersion=String(body.actorVersion??"latest").slice(0,80);const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY??"";const r=await fetch(env.SUPABASE_URL+"/rest/v1/instagram_discovery_settings?on_conflict=id",{method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:true,config:next,updated_at:new Date().toISOString()})});if(!r.ok)throw new Error("保存 Instagram Actor 配置失败");return successResponse(request,{saved:true});}catch(e){return errorResponse(request,"INSTAGRAM_CONFIG_SAVE_FAILED",e instanceof Error?e.message:"保存 Instagram 配置失败",502);}}

  if(url.pathname==="/api/v1/settings/ai-config"&&request.method==="GET"){
   try{return successResponse(request,await readAIConfig(env));}catch(error){return errorResponse(request,"AI_CONFIG_READ_FAILED",error instanceof Error?error.message:"读取 AI 配置失败",502);}
  }
  if(url.pathname==="/api/v1/settings/ai-config"&&request.method==="PUT"){
   try{const config=await request.json() as AIConfig;await writeAIConfig(config,env);return successResponse(request,{saved:true});}catch(error){return errorResponse(request,"AI_CONFIG_SAVE_FAILED",error instanceof Error?error.message:"保存 AI 配置失败",502);}
  }
  if(url.pathname==="/api/v1/settings/ai-providers/models"&&request.method==="POST"){
   try{const body=await request.json() as {providerKey?:string;protocol?:AIProtocol;baseUrl?:string;apiKey?:string};if(!body.providerKey||!body.protocol)return errorResponse(request,"INVALID_AI_PROVIDER","请选择 AI 供应商",400);const models=await listAIModels(body.providerKey,body.protocol,body.baseUrl??"",body.apiKey,env);return successResponse(request,{models});}catch(error){return errorResponse(request,"AI_MODELS_FETCH_FAILED",error instanceof Error?error.message:"获取 AI 模型失败",502);}
  }
  if(url.pathname==="/api/v1/settings/ai-providers/test"&&request.method==="POST"){
   try{const body=await request.json() as {providerKey?:string;protocol?:AIProtocol;baseUrl?:string;model?:string;apiKey?:string;secretName?:string};if(!body.providerKey||!body.protocol)return errorResponse(request,"INVALID_AI_PROVIDER","请选择服务商",400);return successResponse(request,await testAIProvider(body.providerKey,body.protocol,body.baseUrl??"",body.model??"",body.apiKey,env,body.secretName));}catch(error){return errorResponse(request,"AI_PROVIDER_TEST_FAILED",error instanceof Error?error.message:"AI 连接测试失败",502);}
  }
  if(url.pathname==="/api/v1/settings/ai-providers"&&request.method==="POST"){
   try{
    const body=await request.json() as {provider?:AIProviderConfig;apiKey?:string};
    const p=body.provider;if(!p?.id||!p.providerKey||!p.name||!p.protocol||!p.model)return errorResponse(request,"INVALID_AI_PROVIDER","供应商、模型和配置 ID 均为必填项",400);
    const config=await readAIConfig(env);
    const existing=config.providers.find(item=>item.id===p.id);
    const secretName=p.providerKey==="cloudflare-workers-ai"?undefined:(p.secretName||aiSecretName(p.id));
    if(p.providerKey!=="cloudflare-workers-ai"&&!body.apiKey?.trim()&&!existing?.configured)return errorResponse(request,"INVALID_AI_CREDENTIAL","请填写该 AI 配置的 API Key",400);
    if(p.providerKey!=="cloudflare-workers-ai"&&body.apiKey?.trim())await saveVaultSecret(secretName!,body.apiKey.trim(),"TradePilot AI · "+p.name,env);
    const next:AIProviderConfig={...p,secretName,configured:p.providerKey==="cloudflare-workers-ai"||Boolean(body.apiKey?.trim())||Boolean(existing?.configured),enabled:true};
    const providers=existing?config.providers.map(item=>item.id===p.id?next:item):[...config.providers,next];
    await writeAIConfig({...config,providers},env);
    return successResponse(request,{saved:true,provider:next});
   }catch(error){return errorResponse(request,"AI_PROVIDER_SAVE_FAILED",error instanceof Error?error.message:"保存 AI 配置失败",502);}
  }
  if(url.pathname.startsWith("/api/v1/settings/ai-providers/")&&request.method==="DELETE"){
   try{const id=decodeURIComponent(url.pathname.split("/").pop()||"");const config=await readAIConfig(env);const provider=config.providers.find(item=>item.id===id);if(!provider)return errorResponse(request,"AI_PROVIDER_NOT_FOUND","找不到该 AI 配置",404);if(provider.secretName)await deleteVaultSecret(provider.secretName,env);await writeAIConfig({...config,providers:config.providers.filter(item=>item.id!==id)},env);return successResponse(request,{deleted:true});}catch(error){return errorResponse(request,"AI_PROVIDER_DELETE_FAILED",error instanceof Error?error.message:"删除 AI 配置失败",502);}
  }

  if(request.method==="GET"&&url.pathname==="/api/v1/settings/integrations"){
   try{
    const names=Object.values(apiSecretNames);
    const secrets=await readVaultSecrets(names,env);
    const status:Record<string,boolean>={};
    for(const [key,name] of Object.entries(apiSecretNames))status[key]=Boolean(secrets[name]||(legacyApiEnv[key]&&envSecret(env,legacyApiEnv[key])));
    return successResponse(request,status);
   }catch(error){return errorResponse(request,"INTEGRATIONS_READ_FAILED",error instanceof Error?error.message:"读取集成状态失败",502);}
  }
  if(request.method==="POST"&&url.pathname==="/api/v1/settings/integrations"){
   try{
    const body=await request.json() as Record<string,unknown>;
    const allowed=Object.keys(apiSecretNames);
    const supplied=allowed.filter(key=>typeof body[key]==="string"&&Boolean(String(body[key]).trim()));
    if(!supplied.length)return errorResponse(request,"EMPTY_INTEGRATION_CREDENTIALS","请至少填写一项凭证",400);
    for(const field of supplied){const value=String(body[field]).trim();if(value.length>12000)return errorResponse(request,"INVALID_CREDENTIAL","凭证长度超出限制："+field,400);await saveVaultSecret(apiSecretNames[field],value,"TradePilot API · "+field,env);}
    return successResponse(request,{saved:true,fields:supplied});
   }catch(error){return errorResponse(request,"INTEGRATION_SAVE_FAILED",error instanceof Error?error.message:"保存 API 配置失败",502);}
  }
  if(request.method==="POST"&&url.pathname==="/api/v1/settings/integrations/test"){
   try{
    const body=await request.json() as {service?:string};
    const service=String(body.service||"");
    const names=Object.values(apiSecretNames);
    const secrets=await readVaultSecrets(names,env);
    const secret=(key:string)=>secrets[apiSecretNames[key]]||envSecret(env,legacyApiEnv[key]||"");
    if(service==="serper"){
      const key=secret("serper");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const r=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:"TradePilot integration test",gl:"us",hl:"en",num:1})});
      return successResponse(request,{ok:r.ok,message:r.ok?"Serper API 连接成功":"Serper API 返回 HTTP "+r.status});
    }
    if(service==="serpapi"){
      const key=secret("serpapi");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const p=new URLSearchParams({engine:"google",q:"TradePilot integration test",gl:"us",hl:"en",num:"1",api_key:key});
      const r=await fetch("https://serpapi.com/search.json?"+p.toString());
      return successResponse(request,{ok:r.ok,message:r.ok?"SerpApi 连接成功":"SerpApi 返回 HTTP "+r.status});
    }
    if(service==="apify"){
      const key=secret("apify");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const r=await fetch("https://api.apify.com/v2/users/me",{headers:{Authorization:"Bearer "+key,Accept:"application/json"}});
      return successResponse(request,{ok:r.ok,message:r.ok?"Apify API 连接成功": "Apify API 返回 HTTP "+r.status});
    }
    if(service==="deepl"){
      const key=secret("deepl");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const base=key.endsWith(":fx")?"https://api-free.deepl.com":"https://api.deepl.com";
      const r=await fetch(base+"/v2/usage",{headers:{Authorization:"DeepL-Auth-Key "+key}});
      if(!r.ok)return successResponse(request,{ok:false,message:"DeepL API 返回 HTTP "+r.status});
      const usage=await r.json() as {character_count?:number;character_limit?:number};
      return successResponse(request,{ok:true,message:typeof usage.character_count==="number"?"DeepL 可用 · 已使用 "+usage.character_count.toLocaleString()+" / "+(usage.character_limit??0).toLocaleString()+" 字符":"DeepL API 连接成功"});
    }
    if(service==="googleMaps"){
      const key=secret("googleMaps");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const u=new URL("https://maps.googleapis.com/maps/api/geocode/json");u.searchParams.set("address","Berlin, Germany");u.searchParams.set("key",key);
      const r=await fetch(u);const data=await r.json() as {status?:string;results?:unknown[]};
      if(!r.ok||data.status!=="OK"||!data.results?.length)return successResponse(request,{ok:false,message:"Google Geocoding API 返回 "+String(data.status||r.status)});
      const point=(data.results[0] as {geometry?:{location?:{lat:number;lng:number}}}).geometry?.location;
      if(!point)return successResponse(request,{ok:false,message:"Google Geocoding API 未返回坐标"});
      const tz=new URL("https://maps.googleapis.com/maps/api/timezone/json");tz.searchParams.set("location",point.lat+","+point.lng);tz.searchParams.set("timestamp",String(Math.floor(Date.now()/1000)));tz.searchParams.set("key",key);
      const tr=await fetch(tz);const td=await tr.json() as {status?:string;timeZoneId?:string};
      return successResponse(request,{ok:tr.ok&&td.status==="OK"&&Boolean(td.timeZoneId),message:tr.ok&&td.status==="OK"?"Google Geocoding 与 Time Zone API 均可用":"Google Time Zone API 返回 "+String(td.status||tr.status)});
    }
    if(service==="dhl"){
      const key=secret("dhl");if(!key)return successResponse(request,{ok:false,message:"尚未配置"});
      const r=await fetch("https://api-eu.dhl.com/track/shipments?trackingNumber=00340434161094000000",{headers:{"DHL-API-Key":key,Accept:"application/json"}});
      return successResponse(request,{ok:r.ok||r.status===404,message:r.ok||r.status===404?"DHL Tracking API 凭证可用":"DHL API 返回 HTTP "+r.status});
    }
    if(service==="ups"){
      const id=secret("upsClientId"),secretKey=secret("upsClientSecret");if(!id||!secretKey)return successResponse(request,{ok:false,message:"请同时填写 UPS Client ID 和 Client Secret"});
      const r=await fetch("https://onlinetools.ups.com/security/v1/oauth/token",{method:"POST",headers:{Authorization:"Basic "+btoa(id+":"+secretKey),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
      return successResponse(request,{ok:r.ok,message:r.ok?"UPS OAuth 认证成功":"UPS OAuth 认证失败（HTTP "+r.status+"）"});
    }
    if(service==="fedex"){
      const id=secret("fedexClientId"),secretKey=secret("fedexClientSecret");if(!id||!secretKey)return successResponse(request,{ok:false,message:"请同时填写 FedEx API Key 和 Secret Key"});
      const r=await fetch("https://apis.fedex.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secretKey})});
      return successResponse(request,{ok:r.ok,message:r.ok?"FedEx OAuth 认证成功":"FedEx OAuth 认证失败（HTTP "+r.status+"）"});
    }
    if(service==="cloudflare"){
      const token=secret("cloudflareApiToken");const account=secret("cloudflareAccountId")||env.CLOUDFLARE_ACCOUNT_ID||"";
      if(!token||!account)return successResponse(request,{ok:false,message:"请同时填写 Cloudflare Workers AI API Token 和 Account ID"});
      const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/ai/models/search?per_page=1",{headers:{Authorization:"Bearer "+token}});
      return successResponse(request,{ok:r.ok,message:r.ok?"Cloudflare Workers AI API Token 与 Account ID 可用":"Cloudflare API 返回 HTTP "+r.status+"；请确认 Workers AI Read 权限"});
    }
    return errorResponse(request,"INVALID_SERVICE","未知的 API 服务商",400);
   }catch(error){return errorResponse(request,"INTEGRATION_TEST_FAILED",error instanceof Error?error.message:"API 连接测试失败",502);}
  }
  if(request.method==="DELETE"&&url.pathname.startsWith("/api/v1/settings/integrations/")){
   try{const service=decodeURIComponent(url.pathname.split("/").pop()||"");const groups:Record<string,string[]>={apify:["apify"],deepl:["deepl"],googleMaps:["googleMaps"],dhl:["dhl"],ups:["upsClientId","upsClientSecret"],fedex:["fedexClientId","fedexClientSecret"],cloudflare:["cloudflareApiToken","cloudflareAccountId"],serper:["serper"],serpapi:["serpapi"]};const fields=groups[service];if(!fields)return errorResponse(request,"INVALID_SERVICE","未知的 API 服务商",400);for(const field of fields)await deleteVaultSecret(apiSecretNames[field],env);return successResponse(request,{deleted:true});}catch(error){return errorResponse(request,"INTEGRATION_DELETE_FAILED",error instanceof Error?error.message:"删除 API 配置失败",502);}
  }
  return errorResponse(request, "NOT_FOUND", "设置接口不存在。", 404);
}
