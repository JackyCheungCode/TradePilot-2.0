import type { DiscoveryEnv, DiscoveryRunInput } from "./discovery";
import { DEFAULT_SEARCH_EXCLUSIONS } from "./search-exclusions";
import { discoveryRunQuery } from "../lib/owner-scoped-query";
import { readIntegrationSecret } from "../lib/integrations";
import { evaluateGuardrails, getDuplicatePolicy } from "../lib/guardrails";
import { normalizeMerchantDomain, searchResultIdentity, searchResultExclusionTarget } from "./search-result-normalization.ts";
type Engine="serper"|"serpapi"; type Vertical="web"|"shopping"|"images"|"news"|"videos"|"scholar"|"patents";
type Result={title:string;url:string;snippet:string;raw:Record<string,unknown>;websiteVerification?:Record<string,unknown>};
const serper:Record<Vertical,string>={web:"search",shopping:"shopping",images:"images",news:"news",videos:"videos",scholar:"scholar",patents:"patents"};
const serp:Record<Vertical,string>={web:"google",shopping:"google_shopping",images:"google_images",news:"google_news",videos:"google_videos",scholar:"google_scholar",patents:"google_patents"};
async function db<T>(env:DiscoveryEnv,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...init.headers}});const s=await r.text();if(!r.ok)throw new Error("DATABASE_"+r.status+": "+s.slice(0,300));return s?JSON.parse(s) as T:undefined as T;}
async function log(env:DiscoveryEnv,id:string,owner:string,level:string,message:string){await db(env,"discovery_run_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({run_id:id,owner_id:owner,level,message})});}
async function update(env:DiscoveryEnv,id:string,owner:string,patch:Record<string,unknown>){await db(env,discoveryRunQuery(id,owner),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});}
function pick(row:Record<string,unknown>):Result|null{const url=String(row.link??row.product_link??row.url??"");const title=String(row.title??row.name??row.product_title??"");if(!url||!title)return null;try{const u=new URL(url);if(u.protocol!=="http:"&&u.protocol!=="https:")return null;return{title,url:u.toString(),snippet:String(row.snippet??row.description??""),raw:row};}catch{return null;}}
async function search(engine:Engine,type:Vertical,q:string,country:string,hl:string,limit:number,location:string,env:DiscoveryEnv):Promise<Result[]>{
 const out:Result[]=[];let start=0;
 const engineKey=engine==="serper"?await readIntegrationSecret(env,"tradepilot_api_serper","SERPER_API_KEY"):await readIntegrationSecret(env,"tradepilot_api_serpapi","SERPAPI_API_KEY");
 if(!engineKey)throw new Error(engine==="serper"?"SERPER_API_KEY_NOT_CONFIGURED":"SERPAPI_API_KEY_NOT_CONFIGURED");
 while(start<limit){const num=Math.min(100,limit-start);let response:Response;
 if(engine==="serper"){response=await fetch("https://google.serper.dev/"+serper[type],{method:"POST",headers:{"X-API-KEY":engineKey,"Content-Type":"application/json"},body:JSON.stringify({q,gl:country.toLowerCase(),hl:hl.toLowerCase(),num,page:Math.floor(start/num)+1,...(location?{location}:{})}),signal:AbortSignal.timeout(45000)});}
 else{const p=new URLSearchParams({engine:serp[type],q,gl:country.toLowerCase(),hl:hl.toLowerCase(),num:String(num),start:String(start),api_key:engineKey});if(location)p.set("location",location);response=await fetch("https://serpapi.com/search.json?"+p.toString(),{signal:AbortSignal.timeout(45000)});}
 if(!response.ok)throw new Error(engine.toUpperCase()+"_HTTP_"+response.status);const body=await response.json() as Record<string,unknown>;if(body.error)throw new Error(String(body.error).slice(0,160));
 const keys:Record<Vertical,string[]>={web:engine==="serper"?["organic"]:["organic_results"],shopping:engine==="serper"?["shopping"]:["shopping_results"],images:engine==="serper"?["images"]:["images_results"],news:engine==="serper"?["news"]:["news_results"],videos:engine==="serper"?["videos"]:["video_results"],scholar:engine==="serper"?["organic"]:["organic_results"],patents:engine==="serper"?["organic"]:["patents_results","organic_results"]};
 let rows:Record<string,unknown>[]=[];for(const key of keys[type])if(Array.isArray(body[key])){rows=body[key] as Record<string,unknown>[];break;}out.push(...rows.map(pick).filter((x):x is Result=>!!x));if(rows.length<num)break;start+=num;
 }return out.slice(0,limit);
}
function excluded(url:string,rules:string[]){try{const u=new URL(url),host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();return rules.some(rule=>{const [domain,...rest]=rule.toLowerCase().split("/");const prefix=rest.length?"/"+rest.join("/"):"";return(host===domain||host.endsWith("."+domain))&&(!prefix||path.startsWith(prefix));});}catch{return true;}}
function safePublicWebsiteUrl(value:string):URL|null{
 try{const url=new URL(value);if(url.protocol!=="https:"&&url.protocol!=="http:")return null;const host=url.hostname.toLowerCase();if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host==="metadata.google.internal"||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||host.includes(":"))return null;return url;}catch{return null;}
}
async function inspectWebsite(item:Result,product:string):Promise<Result>{
 const initial=safePublicWebsiteUrl(item.url);if(!initial)return{...item,websiteVerification:{status:"blocked",score:0,reason:"非公开网站地址或不安全协议"}};
 try{
  let target=initial,response:Response|undefined;
  for(let hop=0;hop<3;hop++){
   response=await fetch(target.toString(),{method:"GET",redirect:"manual",headers:{"User-Agent":"TradePilot-WebsiteVerifier/1.0 (+public business website discovery)","Accept":"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(9000)});
   if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(!location)break;const next=safePublicWebsiteUrl(new URL(location,target).toString());if(!next)throw new Error("不安全的重定向目标");target=next;continue;}
   break;
  }
  if(!response)throw new Error("网站无响应");
  if(!response.ok)return{...item,websiteVerification:{status:"unavailable",httpStatus:response.status,score:0,reason:"首页返回 HTTP "+response.status,finalUrl:target.toString()}};
  const type=response.headers.get("content-type")??"";if(!type.includes("text/html")&&!type.includes("application/xhtml"))return{...item,websiteVerification:{status:"non_html",httpStatus:response.status,score:5,reason:"目标地址不是 HTML 网站",finalUrl:target.toString()}};
  const html=(await response.text()).slice(0,500000);
  const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,240);
  const description=(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]??"").slice(0,400);
  const text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\s+/g," ").slice(0,30000);
  const lower=(title+" "+description+" "+text).toLowerCase();
  const terms=product.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(word=>word.length>2).slice(0,8);
  const productMatches=terms.filter(term=>lower.includes(term));
  const hasCompanyTerms=/about us|about\s+the\s+company|our company|company profile|contact us|联系我们|关于我们|公司简介/i.test(lower);
  const hasContact=/mailto:|tel:|contact us|联系我们/i.test(html+" "+text);
  const hasOrganization=/schema.org\/(Organization|Corporation|LocalBusiness|Brand)/i.test(html);
  const hasProductCatalog=/products|product catalog|our products|产品中心|产品目录/i.test(lower);
  const score=Math.min(100,20+(productMatches.length?Math.min(25,productMatches.length*8):0)+(hasCompanyTerms?15:0)+(hasContact?10:0)+(hasOrganization?15:0)+(hasProductCatalog?15:0));
  const status=score>=65?"candidate_official":score>=40?"needs_review":"weak_match";
  return{...item,websiteVerification:{status,score,httpStatus:response.status,finalUrl:target.toString(),pageTitle:title,description,productMatches,signals:{companyInformation:hasCompanyTerms,contactInformation:hasContact,organizationSchema:hasOrganization,productCatalog:hasProductCatalog},checkedAt:new Date().toISOString()}};
 }catch(error){return{...item,websiteVerification:{status:"check_failed",score:0,reason:error instanceof Error?error.message:"网站核验失败"}};}
}
async function persist(env:DiscoveryEnv,owner:string,run:string,input:DiscoveryRunInput,engine:Engine,type:Vertical,item:Result){
 const parsed=new URL(item.url),shopping=type==="shopping",googleShoppingLink=parsed.hostname.toLowerCase().endsWith("google.com"),source=String(item.raw.source??item.raw.merchant??item.raw.seller??"").trim();
 const sourceDomain=normalizeMerchantDomain(source);
 const domain=googleShoppingLink?sourceDomain:parsed.hostname.replace(/^www\./,"").toLowerCase();
 const productKey=String(item.raw.product_id??item.title).toLowerCase();
 const key=domain?"search-domain:"+domain:shopping?"shopping-product:"+(source.toLowerCase()||"unknown")+":"+productKey:"search-domain:"+parsed.hostname.replace(/^www\\./,"").toLowerCase();
 const name=shopping?(source||item.title):item.title,website=domain?"https://"+domain:null;
 const entities=await db<Array<{id:string}>>(env,"discovery_entities?on_conflict=owner_id,dedupe_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({owner_id:owner,entity_type:"business",display_name:name,dedupe_key:key,attributes:{country_code:input.countries[0],domain:domain||null,merchant:source||null}})});
 let entity=entities?.[0]?.id;if(!entity)entity=(await db<Array<{id:string}>>(env,"discovery_entities?owner_id=eq."+owner+"&dedupe_key=eq."+encodeURIComponent(key)+"&select=id"))[0]?.id;if(!entity)throw new Error("SEARCH_ENTITY_UPSERT_FAILED");
 const old=(await db<Array<Record<string,unknown>>>(env,"discovery_records?owner_id=eq."+owner+"&channel=eq.search_engine&dedupe_key=eq."+encodeURIComponent(key)+"&select=id,raw_data,name,business_type"))[0]??{};
 const duplicate=typeof old.id==="string",duplicatePolicy=getDuplicatePolicy(input.guardrailsSnapshot);
 const raw={...(old.raw_data&&typeof old.raw_data==="object"?old.raw_data as Record<string,unknown>:{}),guardrail_review_required:item.raw.guardrail_review_required===true,...(duplicate&&duplicatePolicy==="review"?{duplicate_review_required:true}:{}),last_search_result:{title:item.title,snippet:item.snippet,search_type:type,engine,url:item.url,merchant:source||null,product_id:item.raw.product_id??null,price:item.raw.price??null,website_verification:item.websiteVerification??null,raw:item.raw}};
 const rec=duplicate&&duplicatePolicy==="skip"?[]:await db<Array<{id:string}>>(env,"discovery_records?on_conflict=owner_id,channel,dedupe_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({owner_id:owner,channel:"search_engine",record_type:shopping&&!domain?"shopping_product":"website",entity_id:entity,name:old.name??name,country_code:input.countries[0],website,business_type:input.businessTypes?.length?input.businessTypes.join(", "):old.business_type??null,dedupe_key:key,raw_data:raw})});
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
 for(const job of jobs){try{const found=await search(job.engine,job.type,q,country,hl,input.limitPerCountry,location,env);raw+=found.length;all.push(...found.map(item=>({...job,item})));await log(env,run,owner,found.length?"success":"warning",job.engine+" · "+job.type+" 返回 "+found.length+" 条");}catch(e){failed++;await log(env,run,owner,"warning",job.engine+" · "+job.type+" 失败："+String(e).slice(0,180));}done++;await update(env,run,owner,{progress:Math.max(1,Math.round(done/jobs.length*85)),message:"搜索中 · "+done+"/"+jobs.length+" 个引擎/类型组合"});}
 const unique=new Map<string,{engine:Engine;type:Vertical;item:Result}>();for(const row of all){if(excluded(searchResultExclusionTarget({url:row.item.url,type:row.type,raw:row.item.raw}),rules))continue;const identity=searchResultIdentity({url:row.item.url,type:row.type,title:row.item.title,raw:row.item.raw});if(!unique.has(identity))unique.set(identity,row);}
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
 const verified:Array<{engine:Engine;type:Vertical;item:Result}>=[];
 for(let offset=0;offset<chosen.length;offset+=8){const batch=chosen.slice(offset,offset+8);const inspected=await Promise.all(batch.map(async row=>({...row,item:await inspectWebsite(row.item,input.query)})));verified.push(...inspected);await update(env,run,owner,{progress:85+Math.round(Math.min(1,(offset+batch.length)/Math.max(1,chosen.length))*14),message:"官网核验中 · "+Math.min(offset+batch.length,chosen.length)+"/"+chosen.length});}
 for(const row of verified)await persist(env,owner,run,input,row.engine,row.type,row.item);
 if(guardrailBlocked)await log(env,run,owner,"info","护盾已拦截 "+guardrailBlocked+" 条搜索候选记录。");
 const status=failed===0?"completed":failed<jobs.length?"partial":"failed";await update(env,run,owner,{status,progress:100,discovered_count:verified.length,created_lead_count:0,message:"搜索与官网初步核验完成 · "+verified.length+" 个网站 · 护盾拦截 "+guardrailBlocked+" 条 · "+raw+" 条原始结果"});
 await log(env,run,owner,status==="completed"?"success":"warning","任务结束；原始结果 "+raw+" 条，排除、护盾及去重后保存 "+verified.length+" 个网站。");return{status,discovered:verified.length,rawCount:raw,guardrailBlocked,failed,websiteChecks:verified.length};
}
