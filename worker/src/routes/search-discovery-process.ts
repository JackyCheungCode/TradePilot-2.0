import type { DiscoveryEnv, DiscoveryRunInput } from "./discovery.ts";
import { DEFAULT_SEARCH_EXCLUSIONS } from "./search-exclusions.ts";
import { discoveryRunQuery } from "../lib/owner-scoped-query.ts";
import { readIntegrationSecret } from "../lib/integrations.ts";
import { evaluateGuardrails, getDuplicatePolicy } from "../lib/guardrails.ts";
import { normalizeMerchantDomain, searchResultIdentity, searchResultExclusionTarget } from "./search-result-normalization.ts";
type Engine="serper"|"serpapi"|"brightdata"|"quanticdata"|"serpkite"; type Vertical="web"|"shopping"|"images"|"news"|"videos"|"scholar"|"patents";
type Result={title:string;url:string;snippet:string;raw:Record<string,unknown>};
const serper:Record<Vertical,string>={web:"search",shopping:"shopping",images:"images",news:"news",videos:"videos",scholar:"scholar",patents:"patents"};
const serp:Record<Vertical,string>={web:"google",shopping:"google_shopping",images:"google_images",news:"google_news",videos:"google_videos",scholar:"google_scholar",patents:"google_patents"};
async function db<T>(env:DiscoveryEnv,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...init.headers}});const s=await r.text();if(!r.ok)throw new Error("DATABASE_"+r.status+": "+s.slice(0,300));return s?JSON.parse(s) as T:undefined as T;}
async function log(env:DiscoveryEnv,id:string,owner:string,level:string,message:string){await db(env,"discovery_run_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({run_id:id,owner_id:owner,level,message})});}
async function update(env:DiscoveryEnv,id:string,owner:string,patch:Record<string,unknown>){await db(env,discoveryRunQuery(id,owner),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});}
function pick(row:Record<string,unknown>):Result|null{const url=String(row.link??row.product_link??row.url??"");const title=String(row.title??row.name??row.product_title??"");if(!url||!title)return null;try{const u=new URL(url);if(u.protocol!=="http:"&&u.protocol!=="https:")return null;return{title,url:u.toString(),snippet:String(row.snippet??row.description??""),raw:row};}catch{return null;}}
export function getSerpKiteAvailableCredits(account:{plan?:unknown;balance?:unknown;key?:{credit_limit?:unknown;credits_used_month?:unknown}}):number|null{
 const cap=account.key?.credit_limit,used=account.key?.credits_used_month,balance=account.balance;
 if(String(account.plan??"").toLowerCase()!=="free"||typeof used!=="number"||typeof balance!=="number"||balance<0||(cap!==undefined&&cap!==null&&(typeof cap!=="number"||cap<=0)))return null;
 const keyRemaining=typeof cap==="number"?Math.max(0,cap-used):Number.POSITIVE_INFINITY;
 return Math.max(0,Math.min(keyRemaining,balance));
}
async function assertFreeQuota(engine:Engine,env:DiscoveryEnv,requestedResults=10):Promise<void>{
 if(engine==="serper")throw new Error("SERPER_ONE_TIME_CREDITS_NOT_ALLOWED_IN_MONTHLY_FREE_MODE");
 if(engine==="brightdata"){
  const key=await readIntegrationSecret(env,"tradepilot_api_brightdata");
  if(!key)throw new Error("BRIGHTDATA_API_KEY_NOT_CONFIGURED");
  const response=await fetch("https://api.brightdata.com/customer/balance",{headers:{Authorization:"Bearer "+key,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({})) as {balance?:number;pending_balance?:number};
  if(!response.ok||typeof body.balance!=="number")throw new Error("BRIGHTDATA_FREE_BALANCE_UNVERIFIED");
  if(body.balance>0.000001||(typeof body.pending_balance==="number"&&body.pending_balance>0.000001))throw new Error("BRIGHTDATA_PAID_BALANCE_PRESENT_FREE_ONLY_MODE_BLOCKED");
 }
 if(engine==="serpapi"){
  const key=await readIntegrationSecret(env,"tradepilot_api_serpapi");
  if(!key)throw new Error("SERPAPI_API_KEY_NOT_CONFIGURED");
  const url=new URL("https://serpapi.com/account.json");url.searchParams.set("api_key",key);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({})) as {plan_monthly_price?:number;plan_searches_left?:number};
  if(!response.ok||typeof body.plan_monthly_price!=="number"||typeof body.plan_searches_left!=="number")throw new Error("SERPAPI_FREE_QUOTA_UNVERIFIED");
  if(body.plan_monthly_price!==0)throw new Error("SERPAPI_FREE_PLAN_REQUIRED");
  if(body.plan_searches_left<1)throw new Error("SERPAPI_MONTHLY_FREE_QUOTA_EXHAUSTED");
 }
 if(engine==="quanticdata"){
  const key=await readIntegrationSecret(env,"tradepilot_api_quanticdata");
  if(!key)throw new Error("QUANTICDATA_API_KEY_NOT_CONFIGURED");
  const response=await fetch("https://api.quanticdata.io/v1/scraper/billing",{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({})) as {type?:string;payload?:{free_remaining_usd?:number;free_monthly_usd?:number}};
  if(!response.ok||body.type!=="response"||typeof body.payload?.free_remaining_usd!=="number")throw new Error("QUANTICDATA_FREE_QUOTA_UNVERIFIED");
  if(body.payload.free_remaining_usd<0.002)throw new Error("QUANTICDATA_MONTHLY_FREE_QUOTA_EXHAUSTED");
 }
 if(engine==="serpkite"){
  const key=await readIntegrationSecret(env,"tradepilot_api_serpkite");
  if(!key)throw new Error("SERPKITE_API_KEY_NOT_CONFIGURED");
  const response=await fetch("https://api.serpkite.com/v1/account",{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({})) as {plan?:string;key?:{credit_limit?:number;credits_used_month?:number};balance?:number};
  const available=getSerpKiteAvailableCredits(body);
  if(!response.ok||available===null)throw new Error("SERPKITE_FREE_ACCOUNT_BALANCE_UNVERIFIED");
  const requiredCredits=requestedResults>=100?7:Math.max(1,Math.ceil(requestedResults/10));
  if(available<requiredCredits)throw new Error("SERPKITE_MONTHLY_FREE_CREDITS_EXHAUSTED");
 }
}
async function search(engine:Engine,type:Vertical,q:string,country:string,hl:string,limit:number,location:string,env:DiscoveryEnv):Promise<Result[]>{
 const out:Result[]=[];let start=0;
 const secretNames:Record<Engine,string>={serper:"tradepilot_api_serper",serpapi:"tradepilot_api_serpapi",brightdata:"tradepilot_api_brightdata",quanticdata:"tradepilot_api_quanticdata",serpkite:"tradepilot_api_serpkite"};
 const engineKey=await readIntegrationSecret(env,secretNames[engine]);
 if(!engineKey)throw new Error(engine.toUpperCase()+"_API_KEY_NOT_CONFIGURED");
 const languageCode=hl.toLowerCase().split("-")[0];
 while(start<limit){
  const num=engine==="brightdata"?Math.min(10,limit-start):Math.min(100,limit-start);await assertFreeQuota(engine,env,num);let response:Response;let resultKey:string[];
  if(engine==="serper"){
   response=await fetch("https://google.serper.dev/"+serper[type],{method:"POST",headers:{"X-API-KEY":engineKey,"Content-Type":"application/json"},body:JSON.stringify({q,gl:country.toLowerCase(),hl:languageCode,num,page:Math.floor(start/num)+1,...(location?{location}:{})}),signal:AbortSignal.timeout(45000)});
   resultKey=[type==="web"||type==="scholar"||type==="patents"?"organic":serper[type]];
  }else if(engine==="serpapi"){
   const p=new URLSearchParams({engine:serp[type],q,gl:country.toLowerCase(),hl:languageCode,num:String(num),start:String(start),api_key:engineKey});if(location)p.set("location",location);
   response=await fetch("https://serpapi.com/search.json?"+p.toString(),{signal:AbortSignal.timeout(45000)});
   resultKey=type==="web"||type==="scholar"||type==="patents"?["organic_results","patents_results"]:({shopping:["shopping_results"],images:["images_results"],news:["news_results"],videos:["video_results"]} as Record<string,string[]>)[type];
  }else if(engine==="brightdata"){
   const zone=await readIntegrationSecret(env,"tradepilot_api_brightdata_zone");
   if(!zone)throw new Error("BRIGHTDATA_SERP_ZONE_NOT_CONFIGURED");
   const target=new URL("https://www.google.com/search");target.searchParams.set("q",q);target.searchParams.set("gl",country.toLowerCase());target.searchParams.set("hl",languageCode);target.searchParams.set("start",String(start));if(type==="shopping")target.searchParams.set("tbm","shop");else if(type==="images")target.searchParams.set("tbm","isch");else if(type==="news")target.searchParams.set("tbm","nws");else if(type==="videos")target.searchParams.set("tbm","vid");target.searchParams.set("brd_json","1");
   response=await fetch("https://api.brightdata.com/request",{method:"POST",headers:{Authorization:"Bearer "+engineKey,"Content-Type":"application/json"},body:JSON.stringify({zone,url:target.toString(),format:"raw"}),signal:AbortSignal.timeout(60000)});
   resultKey=["organic","shopping","images","news","videos"];
  }else if(engine==="quanticdata"){
   const searchType:Record<Vertical,string>={web:"search",shopping:"shopping",images:"images",news:"news",videos:"videos",scholar:"scholar",patents:"patents"};
   const body:Record<string,unknown>={query:q,engine:"google",search_type:searchType[type],country:country.toLowerCase(),lang:languageCode,num,page:Math.floor(start/num)+1,render:false};if(location)body.location=location;
   response=await fetch("https://api.quanticdata.io/v1/scraper/serp",{method:"POST",headers:{Authorization:"Bearer "+engineKey,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
   resultKey=["payload.organic","payload.organic_results","payload.shopping","payload.images","payload.news","payload.videos"];
  }else{
   const vertical:Record<Vertical,string>={web:"search",shopping:"shopping",images:"images",news:"news",videos:"videos",scholar:"scholar",patents:"patents"};
   const body:Record<string,unknown>={q,country:country.toLowerCase(),language:hl,num,page:Math.floor(start/num)+1,format:"json"};if(location)body.location=location;
   response=await fetch("https://api.serpkite.com/v1/"+vertical[type],{method:"POST",headers:{Authorization:"Bearer "+engineKey,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
   resultKey=["results"];
  }
  const responseText=await response.text();
  if(!response.ok)throw new Error(engine.toUpperCase()+"_HTTP_"+response.status+": "+responseText.slice(0,400));
  const body=JSON.parse(responseText) as Record<string,unknown>;
  if(body.error||body.type==="error")throw new Error(engine.toUpperCase()+"_API_ERROR: "+String((body.error as Record<string,unknown>|undefined)?.message??body.message).slice(0,300));
  let rows:Record<string,unknown>[]=[];
  for(const key of resultKey){const parts=key.split(".");let value:unknown=body;for(const part of parts)value=(value as Record<string,unknown>|undefined)?.[part];if(Array.isArray(value)){rows=value as Record<string,unknown>[];break;}}
  out.push(...rows.map(pick).filter((x):x is Result=>!!x));
  if(rows.length<num)break;start+=num;
 }
 return out.slice(0,limit);
}
function excluded(url:string,rules:string[]){try{const u=new URL(url),host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();return rules.some(rule=>{const [domain,...rest]=rule.toLowerCase().split("/");const prefix=rest.length?"/"+rest.join("/"):"";return(domain.startsWith(".")?host.endsWith(domain):(host===domain||host.endsWith("."+domain)))&&(!prefix||path.startsWith(prefix));});}catch{return true;}}
async function persist(env:DiscoveryEnv,owner:string,run:string,input:DiscoveryRunInput,engine:Engine,type:Vertical,item:Result){
 const parsed=new URL(item.url),shopping=type==="shopping",googleShoppingLink=parsed.hostname.toLowerCase().endsWith("google.com"),source=String(item.raw.source??item.raw.merchant??item.raw.seller??"").trim();
 const sourceDomain=normalizeMerchantDomain(source);
 const domain=googleShoppingLink?sourceDomain:parsed.hostname.replace(/^www\./,"").toLowerCase();
 const productKey=String(item.raw.product_id??item.title).toLowerCase();
 const key=domain?"search-domain:"+domain:shopping?"shopping-product:"+(source.toLowerCase()||"unknown")+":"+productKey:"search-domain:"+parsed.hostname.replace(/^www\\./,"").toLowerCase();
 const name=shopping?(source||item.title):item.title,website=shopping?(domain?"https://"+domain:null):item.url;
 const entities=await db<Array<{id:string}>>(env,"discovery_entities?on_conflict=owner_id,dedupe_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({owner_id:owner,entity_type:"business",display_name:name,dedupe_key:key,attributes:{country_code:null,target_country_code:input.countries[0],domain:domain||null,merchant:source||null}})});
 let entity=entities?.[0]?.id;if(!entity)entity=(await db<Array<{id:string}>>(env,"discovery_entities?owner_id=eq."+owner+"&dedupe_key=eq."+encodeURIComponent(key)+"&select=id"))[0]?.id;if(!entity)throw new Error("SEARCH_ENTITY_UPSERT_FAILED");
 const old=(await db<Array<Record<string,unknown>>>(env,"discovery_records?owner_id=eq."+owner+"&channel=eq.search_engine&dedupe_key=eq."+encodeURIComponent(key)+"&select=id,raw_data,name,business_type"))[0]??{};
 const duplicate=typeof old.id==="string",duplicatePolicy=getDuplicatePolicy(input.guardrailsSnapshot);
 const raw={...(old.raw_data&&typeof old.raw_data==="object"?old.raw_data as Record<string,unknown>:{}),search_target_country:input.countries[0],country_verification_status:"pending",guardrail_review_required:item.raw.guardrail_review_required===true,...(duplicate&&duplicatePolicy==="review"?{duplicate_review_required:true}:{}),last_search_result:{title:item.title,snippet:item.snippet,search_type:type,engine,url:item.url,merchant:source||null,product_id:item.raw.product_id??null,price:item.raw.price??null,raw:item.raw}};
 const rec=duplicate&&duplicatePolicy==="skip"?[]:await db<Array<{id:string}>>(env,"discovery_records?on_conflict=owner_id,channel,dedupe_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({owner_id:owner,channel:"search_engine",record_type:shopping&&!domain?"shopping_product":"website",entity_id:entity,name:old.name??name,country_code:(old.raw_data&&typeof old.raw_data==="object"&&(old.raw_data as Record<string,unknown>).website_analysis&&((old.raw_data as Record<string,unknown>).website_analysis as Record<string,unknown>).country_match===true)?old.country_code??null:null,website,business_type:input.businessTypes?.length?input.businessTypes.join(", "):old.business_type??null,dedupe_key:key,raw_data:raw})});
 let record=duplicate&&duplicatePolicy==="skip"?String(old.id):rec?.[0]?.id;if(!record)record=(await db<Array<{id:string}>>(env,"discovery_records?owner_id=eq."+owner+"&channel=eq.search_engine&dedupe_key=eq."+encodeURIComponent(key)+"&select=id"))[0]?.id;if(!record)throw new Error("SEARCH_RECORD_UPSERT_FAILED");
 await db(env,"discovery_record_occurrences?on_conflict=owner_id,run_id,provider,external_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:owner,record_id:record,run_id:run,provider:engine,keyword:input.query,external_id:type+":"+item.url,source_url:item.url,raw_data:{...item.raw,guardrail_review_required:item.raw.guardrail_review_required===true,duplicate_review_required:duplicate&&duplicatePolicy==="review",title:item.title,snippet:item.snippet,search_type:type,engine,advanced_query:input.advancedQuery}})});
}
export async function processSearchRun(env:DiscoveryEnv,run:string,owner:string,input:DiscoveryRunInput){
 const engines=input.searchEngines??[],types=input.searchTypes??["web"],country=input.countries[0],hl=input.searchLanguage??"en",location=[input.city,input.state].filter(Boolean).join(", ");
 const cats=await db<Array<{category_key:string;domains:string[];enabled:boolean}>>(env,"search_exclusion_rules?owner_id=eq."+owner+"&select=category_key,domains,enabled");
 const effective=DEFAULT_SEARCH_EXCLUSIONS.map(item=>{const saved=cats.find(row=>row.category_key===item.key);return{category_key:item.key,domains:saved?saved.domains:item.domains,enabled:saved?saved.enabled:true};});
 const selected=new Set(input.excludeCategories??effective.filter(x=>x.enabled).map(x=>x.category_key));
 const rules=[...new Set([...effective.filter(x=>x.enabled&&selected.has(x.category_key)).flatMap(x=>x.domains??[]),...(input.excludeDomains??[])])];
 const q=input.advancedQuery?.trim()||input.query;
 const jobs=engines.flatMap(engine=>types.map(type=>({engine,type})));let done=0,failed=0,raw=0;const all:Array<{engine:Engine;type:Vertical;item:Result}>=[];
 await update(env,run,owner,{status:"running",progress:1,message:"正在连接搜索引擎并执行查询"});
 await log(env,run,owner,"info","关键词："+input.query+"；实际搜索语法："+q+"；国家："+country+"；搜索类型："+types.join("、")+"；搜索引擎："+engines.join("、"));
 for(const job of jobs){try{const found=await search(job.engine,job.type,q,country,hl,input.limitPerCountry,location,env);raw+=found.length;all.push(...found.map(item=>({...job,item})));await log(env,run,owner,found.length?"success":"warning",job.engine+" · "+job.type+" 返回 "+found.length+" 条");}catch(e){failed++;await log(env,run,owner,"warning",job.engine+" · "+job.type+" 失败："+String(e).slice(0,180));}done++;await update(env,run,owner,{progress:Math.max(1,Math.round(done/jobs.length*85)),discovered_count:0,message:"搜索中 · "+done+"/"+jobs.length+" 个引擎/类型组合 · 已返回 "+raw+" 条原始结果"});}
 let excludedCount=0,duplicateCount=0;
 const unique=new Map<string,{engine:Engine;type:Vertical;item:Result}>();
 for(const row of all){
   if(excluded(searchResultExclusionTarget({url:row.item.url,type:row.type,raw:row.item.raw}),rules)){excludedCount++;continue;}
   const identity=searchResultIdentity({url:row.item.url,type:row.type,title:row.item.title,raw:row.item.raw});
   if(unique.has(identity)){duplicateCount++;continue;}
   unique.set(identity,row);
 }
 const uniqueRows=[...unique.values()];
 let guardrailBlocked=0;
 const allowed=uniqueRows.flatMap(row=>{
   const decision=evaluateGuardrails({
     name:row.item.title,country,address:location,website:row.item.url,
     businessType:row.type,description:row.item.snippet,content:row.item.title+" "+row.item.snippet,raw:row.item.raw,
   },input.guardrailsSnapshot);
   if(decision.blocked){guardrailBlocked++;return [];}
   return [{...row,item:{...row.item,raw:{...row.item.raw,guardrail_review_required:decision.review}}}];
 });
 const chosen=allowed.slice(0,input.limitPerCountry);
 let saved=0;
 for(const row of chosen){
   await persist(env,owner,run,input,row.engine,row.type,row.item);
   saved++;
   if(saved===chosen.length||saved%5===0)await update(env,run,owner,{progress:85+Math.round(saved/Math.max(1,chosen.length)*14),discovered_count:saved,message:"正在整理候选网站 · "+saved+"/"+chosen.length+" · 搜索引擎共返回 "+raw+" 条原始结果"});
 }
 if(guardrailBlocked)await log(env,run,owner,"info","护盾已拦截 "+guardrailBlocked+" 条搜索候选记录。");
 await log(env,run,owner,"info","结果过滤统计：原始结果 "+raw+" 条；类别/域名排除 "+excludedCount+" 条；重复合并 "+duplicateCount+" 条；质量护盾拦截 "+guardrailBlocked+" 条；符合条件 "+allowed.length+" 条；本次保存 "+chosen.length+" 条。");
 const status=failed===0?"completed":failed<jobs.length?"partial":"failed";const finalProgress=status==="failed"?Math.min(99,Math.max(1,Math.round(done/Math.max(1,jobs.length)*85))):100;await update(env,run,owner,{status,progress:finalProgress,discovered_count:chosen.length,created_lead_count:0,message:status==="failed"?"搜索失败 · 所有搜索引擎请求均未成功 · "+failed+"/"+jobs.length+" 个请求失败 · "+raw+" 条原始结果":status==="partial"?"搜索部分完成 · "+chosen.length+" 个候选网站 · "+failed+"/"+jobs.length+" 个请求失败 · "+raw+" 条原始结果":"搜索候选收集完成 · "+chosen.length+" 个候选网站 · 尚未访问网站或调用 Browser Run · 护盾拦截 "+guardrailBlocked+" 条 · "+raw+" 条原始结果"});
 await log(env,run,owner,status==="completed"?"success":"warning","任务结束；原始结果 "+raw+" 条，排除、护盾及去重后保存 "+chosen.length+" 个候选网站。未执行网站抓取或 Browser Run。");return{status,discovered:chosen.length,rawCount:raw,guardrailBlocked,failed,websiteChecks:0,browserRendered:0};
}
