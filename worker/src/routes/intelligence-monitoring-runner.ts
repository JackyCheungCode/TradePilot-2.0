import { readIntegrationSecret } from "../lib/integrations";

interface Env {
 SUPABASE_URL:string; SUPABASE_SERVICE_ROLE_KEY:string; APIFY_API_TOKEN?:string;
 AI?:{run(model:string,input:Record<string,unknown>):Promise<unknown>};
}
type ClaimedTask={run_id:string;task_id:string;owner_id:string;task_name:string;cadence_minutes:number;config:Record<string,unknown>;object_id:string;platform:string;object_type:string;source_url:string;object_label:string};
type ActorRecord=Record<string,unknown>;
const ACTORS:Record<string,string>={
 facebook:"apify~facebook-posts-scraper",
 instagram:"apify~instagram-scraper",
 tiktok:"clockworks~tiktok-scraper",
 google_maps:"compass~google-maps-reviews-scraper",
};
const now=()=>new Date().toISOString();
async function db<T>(env:Env,path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...init.headers},signal:AbortSignal.timeout(20000)});
 const raw=await response.text();if(!response.ok)throw new Error("DATABASE_"+response.status+": "+raw.slice(0,300));return raw?JSON.parse(raw) as T:undefined as T;
}
async function log(env:Env,t:ClaimedTask,level:"info"|"warning"|"error",event:string,message:string,details:Record<string,unknown>={}){
 await db(env,"monitoring_run_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({owner_id:t.owner_id,run_id:t.run_id,task_id:t.task_id,level,event,message,details})});
}
async function patchRun(env:Env,t:ClaimedTask,patch:Record<string,unknown>){
 await db(env,"monitoring_runs?id=eq."+t.run_id+"&owner_id=eq."+t.owner_id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
}
async function patchTask(env:Env,t:ClaimedTask,patch:Record<string,unknown>){
 await db(env,"monitoring_tasks?id=eq."+t.task_id+"&owner_id=eq."+t.owner_id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...patch,updated_at:now()})});
}
async function apify<T>(token:string,path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch("https://api.apify.com/v2/"+path.replace(/^\//,""),{...init,headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json",...init.headers},signal:AbortSignal.timeout(70000)});
 const raw=await response.text();let body:unknown={};try{body=raw?JSON.parse(raw):{};}catch{}
 if(!response.ok){const e=body as Record<string,unknown>;throw new Error("APIFY_HTTP_"+response.status+": "+String(e.message??"上游 Actor 请求失败").slice(0,220));}
 return body as T;
}
function object(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function str(...values:unknown[]):string{for(const v of values){if(typeof v==="string"&&v.trim())return v.trim();if(typeof v==="number")return String(v);}return "";}
function makeActorInput(schema:Record<string,unknown>,sourceUrl:string):Record<string,unknown>{
 const props=object(schema.properties),required=Array.isArray(schema.required)?schema.required.filter((x):x is string=>typeof x==="string"):[];
 const input:Record<string,unknown>={};
 for(const [key,value] of Object.entries(props)){const f=object(value);if(f.default!==undefined)input[key]=f.default;else if(Array.isArray(f.enum)&&f.enum.length)input[key]=f.enum[0];}
 const urlKey=Object.keys(props).find(k=>/^(startUrls|urls|url|profileUrls|postUrls|directUrls|placeUrls|start_urls)$/i.test(k));
 if(!urlKey)throw new Error("ACTOR_SCHEMA_UNSUPPORTED: Actor Schema 没有可识别的公开链接输入字段。");
 const field=object(props[urlKey]);
 input[urlKey]=field.type==="array"?[{url:sourceUrl}]:sourceUrl;
 for(const key of required){if(input[key]===undefined)throw new Error("ACTOR_SCHEMA_REQUIRED: 缺少无法自动生成的必填字段 "+key);}
 return input;
}
function normalize(platform:string,item:ActorRecord,index:number){
 const externalId=str(item.id,item.postId,item.post_id,item.videoId,item.video_id,item.reviewId,item.review_id,item.commentId,item.comment_id,item.shortCode,item.shortcode,item.url,item.permalink) || platform+":"+index+":"+str(item.text,item.caption,item.title).slice(0,80);
 const sourceUrl=str(item.url,item.permalink,item.postUrl,item.post_url,item.videoUrl,item.video_url,item.reviewUrl,item.review_url);
 const content=str(item.text,item.caption,item.description,item.comment,item.reviewText,item.review_text,item.title);
 const author=str(object(item.author).name,item.authorName,item.author_name,item.ownerUsername,item.username,item.channelName,item.channel_name);
 const type=platform==="google_maps"?"review":platform==="youtube"?"video":str(item.type,item.contentType).toLowerCase().includes("comment")?"comment":"post";
 const published=str(item.timestamp,item.createdAt,item.created_at,item.publishedAt,item.published_at,dateString(item));
 return {external_id:externalId,content_type:type,author_name:author||null,author_profile_url:str(item.authorUrl,item.author_url,item.profileUrl)||null,content_text:content,source_url:sourceUrl||null,published_at:validDate(published),raw_data:item};
}
function dateString(item:ActorRecord){return str(item.date,item.time);}
function validDate(v:string):string|null{if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}
async function analyze(env:Env,platform:string,content:string,config:Record<string,unknown>){
 if(!env.AI||!content.trim())return null;
 const prompt="你是公开商业情报分析器。判断内容是否表达采购、询价、寻找供应商、经销代理、产品规格或OEM/ODM需求。只输出JSON：{is_purchase_intent:boolean,grade:'S'|'A'|'B'|'C',score:0到100,intent_type:string,rationale:string,extracted_requirements:object}。没有明确商业需求时grade为C，禁止臆测。内容："+content.slice(0,5000)+"；平台："+platform+"；规则："+JSON.stringify(config.intents??[]);
 const raw=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"user",content:prompt}],max_tokens:500});
 const result=object(raw);const answer=str(result.response,result.output_text);
 const start=answer.indexOf("{"),end=answer.lastIndexOf("}");if(start<0||end<=start)throw new Error("AI_ANALYSIS_INVALID_JSON");
 const parsed=JSON.parse(answer.slice(start,end+1)) as Record<string,unknown>;
 const grade=["S","A","B","C"].includes(String(parsed.grade))?String(parsed.grade):"C";
 const score=Math.max(0,Math.min(100,Math.round(Number(parsed.score)||0)));
 return {is_purchase_intent:parsed.is_purchase_intent===true,grade,score,intent_type:str(parsed.intent_type)||"未分类",rationale:str(parsed.rationale)||"AI 未提供判定理由",extracted_requirements:object(parsed.extracted_requirements),model:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"};
}
async function execute(env:Env,t:ClaimedTask,token:string){
 const actorId=ACTORS[t.platform];if(!actorId)throw new Error("PLATFORM_ACTOR_NOT_CONFIGURED: "+t.platform+" 尚未通过可靠性验证并配置专用 Actor。");
 await log(env,t,"info","actor.start","开始执行公开对象采集。",{actorId,sourceUrl:t.source_url});
 const build=await apify<{data?:{actorDefinition?:{input?:Record<string,unknown>};inputSchema?:string}}>(token,"acts/"+encodeURIComponent(actorId)+"/builds/default");
 const buildData=object(build.data);const definition=object(buildData.actorDefinition);let schema=object(definition.input);
 if(!Object.keys(object(schema.properties)).length&&typeof buildData.inputSchema==="string"){try{schema=object(JSON.parse(buildData.inputSchema));}catch{}}
 if(!Object.keys(object(schema.properties)).length)throw new Error("ACTOR_SCHEMA_UNAVAILABLE: 无法读取 Actor 输入 Schema。");
 const input=makeActorInput(schema,t.source_url);
 const started=await apify<{data?:{id?:string;status?:string;defaultDatasetId?:string}}>(token,"acts/"+encodeURIComponent(actorId)+"/runs?waitForFinish=60",{method:"POST",body:JSON.stringify(input)});
 const run=object(started.data);if(!run.id)throw new Error("ACTOR_RUN_ID_MISSING");
 const status=str(run.status).toUpperCase();if(status!=="SUCCEEDED")throw new Error("ACTOR_RUN_"+(status||"UNKNOWN"));
 const datasetId=str(run.defaultDatasetId);if(!datasetId)throw new Error("ACTOR_DATASET_MISSING");
 const rows=await apify<unknown>(token,"datasets/"+encodeURIComponent(datasetId)+"/items?clean=true&format=json&limit=500");
 if(!Array.isArray(rows))throw new Error("ACTOR_DATASET_INVALID");
 let newCount=0,analyzedCount=0,failedItems=0;
 for(let i=0;i<rows.length;i++){
  try{
   const normalized=normalize(t.platform,object(rows[i]),i);
   const saved=await db<Array<{id:string}>>(env,"monitoring_items?on_conflict=owner_id,platform,external_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({...normalized,owner_id:t.owner_id,task_id:t.task_id,object_id:t.object_id,run_id:t.run_id,platform:t.platform})});
   if(saved?.length){newCount++;const analysis=await analyze(env,t.platform,normalized.content_text,t.config);if(analysis){await db(env,"monitoring_analyses?on_conflict=item_id,owner_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({...analysis,owner_id:t.owner_id,item_id:saved[0].id})});analyzedCount++;}}
  }catch(error){failedItems++;await log(env,t,"warning","item.failed","单条结果处理失败："+String(error).slice(0,180),{index:i});}
 }
 return {discoveredCount:rows.length,newCount,analyzedCount,failedItems,actorId};
}
export async function runDueIntelligenceMonitoring(env:Env,limit=15){
 const token=await readIntegrationSecret(env,"tradepilot_api_apify")||env.APIFY_API_TOKEN||"";
 let claimed:ClaimedTask[]=[];
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/tradepilot_monitoring_claim_due_tasks",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_limit:limit})});
 const raw=await response.text();if(!response.ok)throw new Error("MONITORING_CLAIM_FAILED_"+response.status+": "+raw.slice(0,240));
 claimed=raw?JSON.parse(raw) as ClaimedTask[]:[];
 for(const t of claimed){
  try{
   await patchRun(env,t,{status:"running",started_at:now()});
   await log(env,t,"info","run.started","定时监听开始执行。",{scheduled:true});
   if(!token)throw new Error("APIFY_NOT_CONFIGURED: 尚未配置 Apify API 凭证。");
   const result=await execute(env,t,token);
   const status=result.failedItems>0?(result.newCount>0?"partial":"failed"):"succeeded";
   await patchRun(env,t,{status,finished_at:now(),discovered_count:result.discoveredCount,new_count:result.newCount,analyzed_count:result.analyzedCount,error_code:status==="failed"?"ITEMS_FAILED":null,error_message:result.failedItems?result.failedItems+" 条内容处理失败":null,metadata:{actorId:result.actorId,failedItems:result.failedItems}});
   await patchTask(env,t,{last_run_status:status,last_result_count:result.newCount,last_error:result.failedItems?result.failedItems+" 条内容处理失败":null});
   await log(env,t,status==="succeeded"?"info":status==="partial"?"warning":"error","run.finished", "本次监听"+(status==="succeeded"?"成功":status==="partial"?"部分成功":"失败")+"：发现 "+result.discoveredCount+" 条，新增 "+result.newCount+" 条，AI 分析 "+result.analyzedCount+" 条，失败 "+result.failedItems+" 条。",result);
  }catch(error){
   const message=String(error instanceof Error?error.message:error).slice(0,1000);
   await patchRun(env,t,{status:"failed",finished_at:now(),error_code:message.split(":")[0].slice(0,80),error_message:message});
   await patchTask(env,t,{last_run_status:"failed",last_error:message});
   await log(env,t,"error","run.failed","本次监听失败："+message);
  }
 }
 return {claimed:claimed.length};
}
