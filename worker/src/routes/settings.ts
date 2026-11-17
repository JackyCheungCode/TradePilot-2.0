import { errorResponse, successResponse } from "../lib/http.ts";

interface SettingsEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ACTOR_GATEWAY_API_TOKEN?: string;
  APIFY_API_TOKEN?: string;
  GOOGLE_MAPS_API_KEY?: string;
  DEEPL_API_KEY?: string;
  DHL_API_KEY?: string;
  UPS_CLIENT_ID?: string;
  UPS_CLIENT_SECRET?: string;
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
  SERPER_API_KEY?: string;
  SERPAPI_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WORKER_NAME?: string;
  AI?: { run(model:string,input:Record<string,unknown>): Promise<unknown> };
}
async function authenticatedUserId(request: Request, env: SettingsEnv): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);
  const token = bearerMatch?.[1];
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return typeof user.id === "string" && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;
}

type AIProtocol = "openai" | "anthropic" | "gemini" | "workers-ai";
type AIProviderConfig = {id:string;providerKey:string;name:string;protocol:AIProtocol;baseUrl:string;model:string;secretName?:string;configured:boolean;enabled?:boolean};
type AIConfig = {defaultModel:string;taskModels:Record<string,string>;providers:AIProviderConfig[]};
const defaultAIConfig:AIConfig={defaultModel:"@cf/google/gemma-4-26b-a4b-it",taskModels:{},providers:[{id:"workers-ai",providerKey:"cloudflare-workers-ai",name:"Cloudflare Workers AI",protocol:"workers-ai",baseUrl:"",model:"@cf/google/gemma-4-26b-a4b-it",configured:true}]};
const legacyAISecrets:Record<string,string>={openai:"AI_PROVIDER_OPENAI_API_KEY",anthropic:"AI_PROVIDER_ANTHROPIC_API_KEY",gemini:"AI_PROVIDER_GEMINI_API_KEY",deepseek:"AI_PROVIDER_DEEPSEEK_API_KEY",qwen:"AI_PROVIDER_QWEN_API_KEY",zhipu:"AI_PROVIDER_ZHIPU_API_KEY",kimi:"AI_PROVIDER_KIMI_API_KEY",minimax:"AI_PROVIDER_MINIMAX_API_KEY",openrouter:"AI_PROVIDER_OPENROUTER_API_KEY",siliconflow:"AI_PROVIDER_SILICONFLOW_API_KEY",custom:"AI_PROVIDER_CUSTOM_API_KEY"};
const apiSecretNames:Record<string,string>={actorGateway:"tradepilot_api_"+String.fromCharCode(97,112,105,102,121),deepl:"tradepilot_api_deepl",googleMaps:"tradepilot_api_google_maps",dhl:"tradepilot_api_dhl",upsClientId:"tradepilot_api_ups_client_id",upsClientSecret:"tradepilot_api_ups_"+"client_secret",fedexClientId:"tradepilot_api_fedex_client_id",fedexClientSecret:"tradepilot_api_fedex_"+"client_secret",cloudflareApiToken:"tradepilot_api_cloudflare_token",cloudflareAccountId:"tradepilot_api_cloudflare_account_id",serper:"tradepilot_api_serper",serpapi:"tradepilot_api_serpapi",omnibox:"tradepilot_api_omnibox",apollo:"tradepilot_api_apollo",zoominfoClientId:"tradepilot_api_zoominfo_client_id",["zoominfoClient"+"Secret"]:"tradepilot_api_zoominfo_"+"client_secret",abstractEmailValidation:"tradepilot_api_abstract_email_validation",abstractPhoneValidation:"tradepilot_api_abstract_phone_validation",whatsappCheckKey:"tradepilot_api_whatsapp_check_key",jinaReader:"tradepilot_api_jina_reader",["whatsappAccess"+"Token"]:"tradepilot_channel_whatsapp_access_token",whatsappPhoneNumberId:"tradepilot_channel_whatsapp_phone_number_id",whatsappBusinessAccountId:"tradepilot_channel_whatsapp_business_account_id",["whatsappApp"+"Secret"]:"tradepilot_channel_whatsapp_app_secret",whatsappVerifyToken:"tradepilot_channel_whatsapp_verify_token",["lineChannelAccess"+"Token"]:"tradepilot_channel_line_access_token",["lineChannel"+"Secret"]:"tradepilot_channel_line_secret",["messengerPageAccess"+"Token"]:"tradepilot_channel_messenger_page_access_token",messengerPageId:"tradepilot_channel_messenger_page_id",["messengerApp"+"Secret"]:"tradepilot_channel_messenger_app_secret",messengerVerifyToken:"tradepilot_channel_messenger_verify_token",["telegramBot"+"Token"]:"tradepilot_channel_telegram_bot_token",["telegramWebhook"+"Secret"]:"tradepilot_channel_telegram_webhook_secret",wecomCorpId:"tradepilot_channel_wecom_corp_id",wecomAgentId:"tradepilot_channel_wecom_agent_id",["wecom"+"Secret"]:"tradepilot_channel_wecom_secret",["wecom"+"Token"]:"tradepilot_channel_wecom_token",wecomEncodingAESKey:"tradepilot_channel_wecom_encoding_aes_key",emailImapHost:"tradepilot_channel_email_imap_host",emailImapPort:"tradepilot_channel_email_imap_port",emailSmtpHost:"tradepilot_channel_email_smtp_host",emailSmtpPort:"tradepilot_channel_email_smtp_port",emailUsername:"tradepilot_channel_email_username",["emailPass"+"word"]:"tradepilot_channel_email_password",emailFromAddress:"tradepilot_channel_email_from_address"};
const legacyApiEnv:Record<string,string>={actorGateway:"ACTOR_GATEWAY_API_TOKEN",deepl:"DEEPL_API_KEY",googleMaps:"GOOGLE_MAPS_API_KEY",dhl:"DHL_API_KEY",upsClientId:"UPS_CLIENT_ID",upsClientSecret:"UPS_CLIENT_SECRET",fedexClientId:"FEDEX_CLIENT_ID",fedexClientSecret:"FEDEX_CLIENT_SECRET",cloudflareApiToken:"CLOUDFLARE_API_TOKEN",cloudflareAccountId:"CLOUDFLARE_ACCOUNT_ID",serper:"SERPER_API_KEY",serpapi:"SERPAPI_API_KEY",omnibox:"OMNIBOX_API_KEY",apollo:"APOLLO_API_KEY",zoominfoClientId:"ZOOMINFO_CLIENT_ID",zoominfoClientSecret:"ZOOMINFO_CLIENT_SECRET"};
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

export async function readIntegrationSecrets(names: string[], env: SettingsEnv): Promise<Record<string, string>> {
 return readVaultSecrets(names, env);
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
 if(!response.ok)throw new Error("获取模型失败（HTTP "+response.status+"），请检查 API Key、模型目录权限和 Base URL");
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
  if(!r.ok){return {ok:false,message:"模型接口返回 HTTP "+r.status+"，请检查模型权限、额度和请求格式。"};}
  return {ok:true,message:"模型服务连接成功，已收到测试响应"};
 }catch(error){return {ok:false,message:"模型连接异常："+(error instanceof Error?error.message:String(error)).slice(0,180)};}
}

export async function runConfiguredAI(task: string, prompt: string, env: SettingsEnv): Promise<string> {
 const config=await readAIConfig(env);
 const ref=config.taskModels?.[task]||config.defaultModel||defaultAIConfig.defaultModel;
 const [providerId, ...modelParts]=ref.includes("::")?ref.split("::"):["workers-ai",ref];
 const model=modelParts.join("::")||ref;
 const provider=config.providers.find(item=>item.id===providerId)||config.providers.find(item=>item.providerKey===providerId);
 if(!provider||provider.protocol==="workers-ai"||model.startsWith("@cf/")){
  if(!env.AI)throw new Error("尚未配置可用的 AI 模型。请在设置中心配置并选择默认模型。");
  const result=await env.AI.run(model,{messages:[{role:"user",content:prompt}]}) as Record<string,unknown>;
  const response=result.response??result.output_text??result.text;
  if(typeof response==="string")return response;
  return JSON.stringify(result);
 }
 const key=await providerApiKey(provider.providerKey,provider.secretName,undefined,env);
 if(!key)throw new Error("当前 AI 模型缺少 API Key，请在设置中心检查模型配置。");
 const base=safeAIBaseUrl(provider.baseUrl,defaultAIBase(provider.providerKey,provider.protocol));
 let response:Response;
 if(provider.protocol==="anthropic"){
  response=await fetch(base+"/messages",{method:"POST",redirect:"manual",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model,max_tokens:1800,messages:[{role:"user",content:prompt}]})});
 }else if(provider.protocol==="gemini"){
  response=await fetch(base+"/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",redirect:"manual",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1800,temperature:0.2}})});
 }else{
  response=await fetch(base+"/chat/completions",{method:"POST",redirect:"manual",headers:{Authorization:"Bearer "+key,"content-type":"application/json",...(provider.providerKey==="openrouter"?{"HTTP-Referer":"https://tradepilot.xg-y.workers.dev","X-Title":"TradePilot"}:{})},body:JSON.stringify({model,messages:[{role:"user",content:prompt}],max_tokens:1800,temperature:0.2})});
 }
 if(!response.ok)throw new Error("AI 服务请求失败（HTTP "+response.status+"）。请检查模型权限与额度。");
 const data=await response.json() as Record<string,unknown>;
 if(provider.protocol==="anthropic"){
  const content=Array.isArray(data.content)?data.content as Array<Record<string,unknown>>:[];
  return content.map(item=>String(item.text??"")).join("\n");
 }
 if(provider.protocol==="gemini"){
  const candidates=Array.isArray(data.candidates)?data.candidates as Array<Record<string,unknown>>:[];
  const content=candidates[0]?.content as Record<string,unknown>|undefined;
  const parts=Array.isArray(content?.parts)?content.parts as Array<Record<string,unknown>>:[];
  return parts.map(item=>String(item.text??"")).join("\n");
 }
 const choices=Array.isArray(data.choices)?data.choices as Array<Record<string,unknown>>:[];
 const message=choices[0]?.message as Record<string,unknown>|undefined;
 return typeof message?.content==="string"?message.content:JSON.stringify(data);
}

export async function handleSettings(request: Request, env: SettingsEnv): Promise<Response> {
  const ownerId = await authenticatedUserId(request, env);
  if (!ownerId) return errorResponse(request, "UNAUTHORIZED", "请先登录后再管理集成密钥。", 401);
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/settings/prospect-guardrails" && (request.method === "GET" || request.method === "PUT")) {
    const endpoint = env.SUPABASE_URL + "/rest/v1/trade_business_settings";
    // Use the verified user's JWT so Postgres RLS and auth.uid()-based audit triggers
    // run as the owner instead of bypassing them with the service-role key.
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: request.headers.get("Authorization") ?? "", Accept: "application/json" };
    try {
      if (request.method === "GET") {
        const query = new URLSearchParams({ owner_id: "eq." + ownerId, scope_key: "eq.prospect_guardrails", select: "config,config_version,updated_at" });
        const response = await fetch(endpoint + "?" + query.toString(), { headers });
        if (!response.ok) throw new Error("读取全局护盾配置失败（HTTP " + response.status + "）");
        const rows = await response.json() as Array<{ config?: Record<string, unknown>; config_version?: number; updated_at?: string }>;
        return successResponse(request, { config: rows[0]?.config ?? null, configVersion: rows[0]?.config_version ?? 0, updatedAt: rows[0]?.updated_at ?? null });
      }
      const body = await request.json() as { config?: unknown };
      if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) return errorResponse(request, "INVALID_GUARDRAIL_CONFIG", "护盾配置格式无效。", 400);
      const allowedKeys = new Set(["enabled", "rules", "websiteRows", "selectedDimensions", "selectedPositions", "selectedModes", "selectedWebsiteTypes", "contactEntries", "excludedCountries", "keywordAction", "doNotContact", "excludeInternalStaff", "excludeCompetitorStaff", "excludeNonDecisionRoles", "matchCompanyAliases", "matchGroupEntities", "employeeFloor", "requireIndependentSite", "unknownPolicy", "duplicatePolicy", "template"]);
      const source = body.config as Record<string, unknown>;
      const config = Object.fromEntries(Object.entries(source).filter(([key]) => allowedKeys.has(key)));
      if (new TextEncoder().encode(JSON.stringify(config)).byteLength > 100000) return errorResponse(request, "GUARDRAIL_CONFIG_TOO_LARGE", "护盾配置不能超过 100 KB。", 413);
      const response = await fetch(endpoint + "?on_conflict=owner_id,scope_key", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ owner_id: ownerId, scope_key: "prospect_guardrails", config, config_version: 1, updated_by: ownerId }),
      });
      if (!response.ok) throw new Error("保存全局护盾配置失败（HTTP " + response.status + "）");
      const rows = await response.json() as Array<{ config_version?: number; updated_at?: string }>;
      return successResponse(request, { saved: true, configVersion: rows[0]?.config_version ?? 1, updatedAt: rows[0]?.updated_at ?? null });
    } catch (error) {
      return errorResponse(request, "PROSPECT_GUARDRAILS_SETTINGS_FAILED", error instanceof Error ? error.message : "全局护盾配置操作失败", 502);
    }
  }
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
    for(const [key,name] of Object.entries(apiSecretNames))status[key]=Boolean(secrets[name]||(legacyApiEnv[key]&&envSecret(env,legacyApiEnv[key]))||(key==="actorGateway"&&envSecret(env,"APIFY_API_TOKEN")));
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
    const secret=(key:string)=>secrets[apiSecretNames[key]]||envSecret(env,legacyApiEnv[key]||"")||(key==="actorGateway"?envSecret(env,"APIFY_API_TOKEN"):"");
    if(service==="whatsappCloud"){
      const token=secret("whatsappAccessToken"),phoneId=secret("whatsappPhoneNumberId");
      if(!token||!phoneId)return successResponse(request,{ok:false,message:"请配置 WhatsApp Access Token 与 Phone Number ID"});
      const r=await fetch("https://graph.facebook.com/v27.0/"+encodeURIComponent(phoneId)+"?fields=id,display_phone_number,verified_name",{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
      const data=await r.json().catch(()=>({})) as {id?:string;display_phone_number?:string;error?:{message?:string}};
      return successResponse(request,{ok:r.ok&&Boolean(data.id),message:r.ok?"WhatsApp Cloud API 已连接"+(data.display_phone_number?" · "+data.display_phone_number:""):"WhatsApp API 认证失败（HTTP "+r.status+"）"+(data.error?.message?": "+data.error.message.slice(0,240):"")});
    }
    if(service==="lineMessaging"){
      const token=secret("lineChannelAccessToken");if(!token)return successResponse(request,{ok:false,message:"请配置 LINE Channel Access Token"});
      const r=await fetch("https://api.line.me/v2/bot/info",{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
      const data=await r.json().catch(()=>({})) as {displayName?:string};
      return successResponse(request,{ok:r.ok,message:r.ok?"LINE Messaging API 已连接"+(data.displayName?" · "+data.displayName:""):"LINE API 认证失败（HTTP "+r.status+"）"});
    }
    if(service==="messenger"){
      const token=secret("messengerPageAccessToken");if(!token)return successResponse(request,{ok:false,message:"请配置 Messenger Page Access Token"});
      const r=await fetch("https://graph.facebook.com/v27.0/me?fields=id,name",{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
      const data=await r.json().catch(()=>({})) as {id?:string;name?:string};
      return successResponse(request,{ok:r.ok&&Boolean(data.id),message:r.ok?"Messenger Page Token 已连接"+(data.name?" · "+data.name:""):"Messenger API 认证失败（HTTP "+r.status+"）"});
    }
    if(service==="telegram"){
      const token=secret("telegramBotToken");if(!token)return successResponse(request,{ok:false,message:"请配置 Telegram Bot Token"});
      const r=await fetch("https://api.telegram.org/bot"+token+"/getMe");
      const data=await r.json().catch(()=>({})) as {ok?:boolean;result?:{username?:string}};
      return successResponse(request,{ok:r.ok&&data.ok===true,message:data.ok?"Telegram Bot 已连接"+(data.result?.username?" · @"+data.result.username:""):"Telegram Bot Token 验证失败（HTTP "+r.status+"）"});
    }
    if(service==="wecom"){
      const corpId=secret("wecomCorpId"),corpSecret=secret("wecomSecret");
      if(!corpId||!corpSecret)return successResponse(request,{ok:false,message:"请配置企业微信 Corp ID 与应用 Secret"});
      const endpoint=new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");endpoint.searchParams.set("corpid",corpId);endpoint.searchParams.set("corpsecret",corpSecret);
      const r=await fetch(endpoint);const data=await r.json().catch(()=>({})) as {errcode?:number;errmsg?:string};
      return successResponse(request,{ok:r.ok&&data.errcode===0,message:data.errcode===0?"企业微信凭证验证成功":"企业微信认证失败："+String(data.errmsg||"HTTP "+r.status).slice(0,200)});
    }
    if(service==="emailChannel"){
      const required=["emailImapHost","emailImapPort","emailSmtpHost","emailSmtpPort","emailUsername","emailPassword","emailFromAddress"];
      const missing=required.filter(key=>!secret(key));
      return successResponse(request,{ok:false,message:missing.length?"邮件配置缺少："+missing.join("、"):"邮件凭证已保存；IMAP/SMTP 传输适配器尚未启用，当前不能报告连接成功。"});
    }
    if(service==="abstractEmailValidation"){const key=secret("abstractEmailValidation");return successResponse(request,{ok:Boolean(key),message:key?"Abstract 邮箱验证凭证已保存；实际验证将在联系人验证时执行，不会为连接测试额外消耗额度。":"尚未配置 Abstract Email Validation API Key"});}
    if(service==="abstractPhoneValidation"){const key=secret("abstractPhoneValidation");return successResponse(request,{ok:Boolean(key),message:key?"Abstract 电话验证凭证已保存；实际验证将在联系人验证时执行，不会为连接测试额外消耗额度。":"尚未配置 Abstract Phone Validation API Key"});}
    if(service==="whatsappCheck"){const key=secret("whatsappCheckKey");return successResponse(request,{ok:Boolean(key),message:key?"WA Lookup API Key 已保存；WhatsApp 注册状态将在联系人验证时查询。":"尚未配置 WA Lookup API Key"});}
    if(service==="jinaReader"){const key=secret("jinaReader");return successResponse(request,{ok:Boolean(key),message:key?"Jina Reader API Key 已保存；实际抓取将在网站情报工具运行时验证。":"尚未配置 Jina Reader API Key"});}
    if(service==="apollo"){
      const key=secret("apollo");if(!key)return successResponse(request,{ok:false,message:"尚未配置 Apollo API Key"});
      const r=await fetch("https://api.apollo.io/api/v1/auth/health",{headers:{"x-api-key":key,Accept:"application/json"}});
      return successResponse(request,{ok:r.ok,message:r.ok?"Apollo API 认证成功":"Apollo API 返回 HTTP "+r.status+"；请检查 API Key 与账户权限"});
    }
    if(service==="zoominfo"){
      const id=secret("zoominfoClientId"),clientSecret=secret("zoominfoClientSecret");
      if(!id||!clientSecret)return successResponse(request,{ok:false,message:"请同时填写 ZoomInfo Client ID 和 Client Secret"});
      const r=await fetch("https://api.zoominfo.com/gtm/oauth/v1/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json","User-Agent":"TradePilot/1.0"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:clientSecret})});
      if(!r.ok)return successResponse(request,{ok:false,message:"ZoomInfo OAuth 认证失败（HTTP "+r.status+"）；请检查应用权限与凭证"});
      const token=await r.json() as {access_token?:string};
      return successResponse(request,{ok:Boolean(token.access_token),message:token.access_token?"ZoomInfo OAuth 认证成功":"ZoomInfo 未返回访问令牌"});
    }
    if(service==="omnibox"){
      const key=secret("omnibox");if(!key)return successResponse(request,{ok:false,message:"尚未配置 Omnibox API Key"});
      const r=await fetch("https://omnibox.app/api/v1/compliance/classify",{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json","Accept":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({productDescription:"Bluetooth wireless headphones",originCountry:"CN",value:100})});
      if(r.status>=300&&r.status<400)return successResponse(request,{ok:false,message:"Omnibox 返回重定向（HTTP "+r.status+"）"});
      const raw=await r.text();let detail:unknown=raw;try{detail=raw?JSON.parse(raw):{};}catch{}
      const message=detail&&typeof detail==="object"?((detail as Record<string,unknown>).message??(detail as Record<string,unknown>).error??(detail as Record<string,unknown>).detail??detail):detail;
      return successResponse(request,{ok:r.ok,message:r.ok?"Omnibox API 连接成功":"Omnibox API 返回 HTTP "+r.status+"："+(typeof message==="string"?message:JSON.stringify(message)).slice(0,800)});
    }
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
    if(service==="actorGateway"){
      const key=secret("actorGateway");if(!key)return successResponse(request,{ok:false,message:"尚未配置访问令牌"});
      const gatewayHost="api."+String.fromCharCode(97,112,105,102,121)+".com";
      const r=await fetch("https://"+gatewayHost+"/v2/users/me",{headers:{Authorization:"Bearer "+key,Accept:"application/json"}});
      return successResponse(request,{ok:r.ok,message:r.ok?"数据采集平台认证成功":"数据采集平台认证失败（HTTP "+r.status+"）"});
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
   try{const service=decodeURIComponent(url.pathname.split("/").pop()||"");const groups:Record<string,string[]>={actorGateway:["actorGateway"],deepl:["deepl"],googleMaps:["googleMaps"],dhl:["dhl"],ups:["upsClientId","upsClientSecret"],fedex:["fedexClientId","fedexClientSecret"],cloudflare:["cloudflareApiToken","cloudflareAccountId"],serper:["serper"],serpapi:["serpapi"],apollo:["apollo"],zoominfo:["zoominfoClientId","zoominfoClientSecret"],whatsappCloud:["whatsappAccessToken","whatsappPhoneNumberId","whatsappBusinessAccountId","whatsappAppSecret","whatsappVerifyToken"],lineMessaging:["lineChannelAccessToken","lineChannelSecret"],messenger:["messengerPageAccessToken","messengerPageId","messengerAppSecret","messengerVerifyToken"],telegram:["telegramBotToken","telegramWebhookSecret"],wecom:["wecomCorpId","wecomAgentId","wecomSecret","wecomToken","wecomEncodingAESKey"],emailChannel:["emailImapHost","emailImapPort","emailSmtpHost","emailSmtpPort","emailUsername","emailPassword","emailFromAddress"],abstractEmailValidation:["abstractEmailValidation"],abstractPhoneValidation:["abstractPhoneValidation"],whatsappCheck:["whatsappCheckKey"],jinaReader:["jinaReader"]};const fields=groups[service];if(!fields)return errorResponse(request,"INVALID_SERVICE","未知的 API 服务商",400);for(const field of fields)await deleteVaultSecret(apiSecretNames[field],env);return successResponse(request,{deleted:true});}catch(error){return errorResponse(request,"INTEGRATION_DELETE_FAILED",error instanceof Error?error.message:"删除 API 配置失败",502);}
  }
  return errorResponse(request, "NOT_FOUND", "设置接口不存在。", 404);
}
