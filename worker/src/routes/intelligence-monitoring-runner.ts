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
type ActorProgress={objectId:string;actorId:string;actorRunId:string;actorStatus:string;datasetId?:string;datasetOffset?:number;discoveredCount?:number;newCount?:number;analyzedCount?:number;failedItems?:number;completed?:boolean;error?:string};
type ActiveRun={id:string;owner_id:string;task_id:string;status:string;started_at:string|null;created_at:string;metadata:Record<string,unknown>};
type TaskRecord={id:string;owner_id:string;name:string;cadence_minutes:number;config:Record<string,unknown>};
type ObjectRecord={id:string;owner_id:string;platform:string;object_type:string;source_url:string;label:string;is_active:boolean};
function taskContext(run:ActiveRun,task:TaskRecord,o:ObjectRecord):ClaimedTask{return {run_id:run.id,task_id:task.id,owner_id:task.owner_id,task_name:task.name,cadence_minutes:task.cadence_minutes,config:object(task.config),object_id:o.id,platform:o.platform,object_type:o.object_type,source_url:o.source_url,object_label:o.label};}
async function launchActor(env:Env,t:ClaimedTask,token:string):Promise<ActorProgress>{
 const actorId=ACTORS[t.platform];if(!actorId)throw new Error("PLATFORM_ACTOR_NOT_CONFIGURED: "+t.platform+" 尚未通过可靠性验证并配置专用 Actor。");
 await patchRun(env,t,{current_stage:"读取采集器配置",heartbeat_at:now()});
 await log(env,t,"info","collector.config","正在读取采集器配置与输入 Schema。",{actorId,sourceUrl:t.source_url,initialMode:t.config.initialMode??"incremental"});
 const build=await apify<{data?:{actorDefinition?:{input?:Record<string,unknown>};inputSchema?:string}}>(token,"acts/"+encodeURIComponent(actorId)+"/builds/default");
 const buildData=object(build.data);const definition=object(buildData.actorDefinition);let schema=object(definition.input);
 if(!Object.keys(object(schema.properties)).length&&typeof buildData.inputSchema==="string"){try{schema=object(JSON.parse(buildData.inputSchema));}catch{}}
 if(!Object.keys(object(schema.properties)).length)throw new Error("ACTOR_SCHEMA_UNAVAILABLE: 无法读取 Actor 输入 Schema。");
 const input=makeActorInput(schema,t.source_url);
 await log(env,t,"info","collector.schema_ready","采集器 Schema 已读取，正在准备公开对象输入。",{actorId,inputKeys:Object.keys(input)});
 await patchRun(env,t,{current_stage:"启动平台采集器",heartbeat_at:now()});
 const started=await apify<{data?:{id?:string;status?:string}}>(token,"acts/"+encodeURIComponent(actorId)+"/runs?waitForFinish=0",{method:"POST",body:JSON.stringify(input)});
 const run=object(started.data),actorRunId=str(run.id);if(!actorRunId)throw new Error("ACTOR_RUN_ID_MISSING");
 const actorStatus=str(run.status).toUpperCase()||"READY";
 await log(env,t,"info","actor.launched","平台采集器已启动，运行编号已保存；后续调度将继续轮询。",{actorId,actorRunId,actorStatus});
 return {objectId:t.object_id,actorId,actorRunId,actorStatus,datasetOffset:0,discoveredCount:0,newCount:0,analyzedCount:0,failedItems:0,completed:false};
}
async function processDatasetBatch(env:Env,t:ClaimedTask,p:ActorProgress,token:string):Promise<ActorProgress>{
 const datasetId=str(p.datasetId);if(!datasetId)throw new Error("ACTOR_DATASET_MISSING");
 const offset=Number(p.datasetOffset??0);
 const rows=await apify<unknown>(token,"datasets/"+encodeURIComponent(datasetId)+"/items?clean=true&format=json&limit=10&offset="+offset);
 if(!Array.isArray(rows))throw new Error("ACTOR_DATASET_INVALID");
 let newCount=Number(p.newCount??0),analyzedCount=Number(p.analyzedCount??0),failedItems=Number(p.failedItems??0);
 for(let i=0;i<rows.length;i++){
  if(i>0&&i%5===0)await patchRun(env,t,{heartbeat_at:now(),current_stage:"分批处理采集结果"});
  try{
   const normalized=normalize(t.platform,object(rows[i]),offset+i);
   const saved=await db<Array<{id:string}>>(env,"monitoring_items?on_conflict=owner_id,platform,external_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({...normalized,owner_id:t.owner_id,task_id:t.task_id,object_id:t.object_id,run_id:t.run_id,platform:t.platform})});
   if(saved?.length){newCount++;const analysis=await analyze(env,t.platform,normalized.content_text,t.config);if(analysis){await db(env,"monitoring_analyses?on_conflict=item_id,owner_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({...analysis,owner_id:t.owner_id,item_id:saved[0].id})});analyzedCount++;}}
  }catch(error){failedItems++;await log(env,t,"warning","item.failed","单条结果处理失败："+String(error).slice(0,180),{index:offset+i});}
 }
 const discoveredCount=Number(p.discoveredCount??0)+rows.length,completed=rows.length<10;
 await log(env,t,"info","dataset.batch_processed",completed?"本对象数据集处理完成。":"本批数据已处理，下一调度周期继续读取。",{actorRunId:p.actorRunId,offset,processed:rows.length,discoveredCount,newCount,analyzedCount,failedItems,completed});
 return {...p,datasetOffset:offset+rows.length,discoveredCount,newCount,analyzedCount,failedItems,completed,actorStatus:"SUCCEEDED"};
}
async function resumeActiveRuns(env:Env,token:string){
 const active=await db<ActiveRun[]>(env,"monitoring_runs?status=eq.running&select=id,owner_id,task_id,status,started_at,created_at,metadata&order=created_at.asc&limit=30");
 for(const run of (active??[]).slice(0,10)){
  let ctx:ClaimedTask|undefined;
  try{
   const [tasks,links]=await Promise.all([
    db<TaskRecord[]>(env,"monitoring_tasks?id=eq."+run.task_id+"&owner_id=eq."+run.owner_id+"&select=id,owner_id,name,cadence_minutes,config"),
    db<Array<{object_id:string;owner_id:string}>>(env,"monitoring_task_objects?task_id=eq."+run.task_id+"&owner_id=eq."+run.owner_id+"&select=object_id,owner_id")
   ]);
   const task=tasks?.[0];if(!task)throw new Error("MONITORING_TASK_NOT_FOUND");
   const objectIds=(links??[]).map(x=>x.object_id);if(!objectIds.length)throw new Error("MONITORING_OBJECT_NOT_FOUND");
   const objects=await db<ObjectRecord[]>(env,"monitoring_objects?id=in.("+objectIds.join(",")+")&owner_id=eq."+run.owner_id+"&select=id,owner_id,platform,object_type,source_url,label,is_active");
   if(!objects?.length)throw new Error("MONITORING_OBJECT_NOT_FOUND");
   ctx=taskContext(run,task,objects[0]);
   let progress=Array.isArray(run.metadata.actorRuns)?run.metadata.actorRuns as ActorProgress[]:[];
   if(!progress.length&&run.metadata.actorRunId){
    progress=[{objectId:objects[0].id,actorId:str(run.metadata.actorId),actorRunId:str(run.metadata.actorRunId),actorStatus:str(run.metadata.actorStatus)||"RUNNING",datasetId:str(run.metadata.datasetId)||undefined,datasetOffset:0,discoveredCount:0,newCount:0,analyzedCount:0,failedItems:0,completed:false}];
   }
   if(!progress.length){
    const age=Date.now()-new Date(run.started_at??run.created_at).getTime();
    if(age>10*60*1000){
     await patchRun(env,ctx,{status:"failed",finished_at:now(),heartbeat_at:now(),current_stage:"执行中断",error_code:"ORPHANED_RUN_NO_ACTOR_ID",error_message:"执行器中断且未保存 Actor Run ID，已停止自动重试以避免重复启动采集。"});
     await patchTask(env,ctx,{last_run_status:"failed",last_error:"执行器中断且未保存 Actor Run ID，请检查日志。"});
     await log(env,ctx,"error","run.orphaned","执行器中断且没有可恢复的 Actor Run ID，已停止自动重试。");
    }
    continue;
   }
   for(let i=0;i<progress.length;i++){
    let p=progress[i];if(p.completed)continue;
    const o=objects.find(x=>x.id===p.objectId);if(!o){progress[i]={...p,completed:true,failedItems:Number(p.failedItems??0)+1,error:"MONITORING_OBJECT_NOT_FOUND"};continue;}
    const t=taskContext(run,task,o);
    await patchRun(env,t,{heartbeat_at:now(),current_stage:p.datasetId?"分批处理采集结果":"采集器执行中"});
    if(!p.datasetId){
     const polled=await apify<{data?:Record<string,unknown>}>(token,"actor-runs/"+encodeURIComponent(p.actorRunId));
     const actor=object(polled.data),status=str(actor.status).toUpperCase();p={...p,actorStatus:status};
     if(status==="READY"||status==="RUNNING"){
      await log(env,t,"info","actor.poll","Actor 仍在运行，心跳已续期，后续调度将继续检查。",{actorRunId:p.actorRunId,actorStatus:status});
      progress[i]=p;continue;
     }
     if(status!=="SUCCEEDED"){
      progress[i]={...p,completed:true,failedItems:Number(p.failedItems??0)+1,error:"ACTOR_RUN_"+(status||"UNKNOWN")};
      await log(env,t,"error","actor.failed","Apify Actor 执行未成功："+status,{actorRunId:p.actorRunId,actorStatus:status});continue;
     }
     const datasetId=str(actor.defaultDatasetId);if(!datasetId)throw new Error("ACTOR_DATASET_MISSING");
     p={...p,datasetId,actorStatus:status,datasetOffset:0};
     await log(env,t,"info","actor.succeeded","Apify Actor 已成功，开始分批读取数据集。",{actorRunId:p.actorRunId,datasetId});
    }
    progress[i]=await processDatasetBatch(env,t,p,token);
   }
   const discovered=progress.reduce((n,p)=>n+Number(p.discoveredCount??0),0);
   const added=progress.reduce((n,p)=>n+Number(p.newCount??0),0);
   const analyzed=progress.reduce((n,p)=>n+Number(p.analyzedCount??0),0);
   const failed=progress.reduce((n,p)=>n+Number(p.failedItems??0),0);
   const allDone=progress.every(p=>p.completed);
   const finalStatus=failed>0?(added>0?"partial":"failed"):"succeeded";
   await patchRun(env,ctx,{status:allDone?finalStatus:"running",finished_at:allDone?now():null,heartbeat_at:now(),current_stage:allDone?"执行完成":progress.some(p=>p.datasetId)?"分批处理采集结果":"采集器执行中",discovered_count:discovered,new_count:added,analyzed_count:analyzed,error_code:allDone&&failed>0?"OBJECTS_FAILED":null,error_message:allDone&&failed>0?failed+" 个内容或监听对象处理失败":null,metadata:{actorRuns:progress,objectCount:progress.length,failedItems:failed}});
   if(allDone){
    await patchTask(env,ctx,{last_run_status:finalStatus,last_result_count:added,last_error:failed?failed+" 个内容或监听对象处理失败":null});
    await log(env,ctx,finalStatus==="succeeded"?"info":finalStatus==="partial"?"warning":"error","run.finished","本次监听"+(finalStatus==="succeeded"?"成功":finalStatus==="partial"?"部分成功":"失败")+"：发现 "+discovered+" 条，新增 "+added+" 条，AI 分析 "+analyzed+" 条，失败 "+failed+" 项。",{discoveredCount:discovered,newCount:added,analyzedCount:analyzed,failedItems:failed});
   }
  }catch(error){
   const message=String(error instanceof Error?error.message:error).slice(0,700);
   if(ctx)await log(env,ctx,"error","run.resume_error","恢复 Actor 执行状态时发生错误："+message);
  }
 }
}
export async function runDueIntelligenceMonitoring(env:Env,limit=15){
 const token=await readIntegrationSecret(env,"tradepilot_api_apify")||env.APIFY_API_TOKEN||"";
 if(token)await resumeActiveRuns(env,token);
 let claimed:ClaimedTask[]=[];
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/tradepilot_monitoring_claim_due_tasks",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_limit:limit})});
 const raw=await response.text();if(!response.ok)throw new Error("MONITORING_CLAIM_FAILED_"+response.status+": "+raw.slice(0,240));
 claimed=raw?JSON.parse(raw) as ClaimedTask[]:[];
 const grouped=new Map<string,ClaimedTask[]>();for(const t of claimed){const group=grouped.get(t.run_id)??[];group.push(t);grouped.set(t.run_id,group);}
 for(const objects of grouped.values()){
  const t=objects[0];
  try{
   await patchRun(env,t,{status:"running",started_at:now(),heartbeat_at:now(),current_stage:"准备执行监听对象",metadata:{actorRuns:[],objectCount:objects.length}});
   await log(env,t,"info","run.started","定时监听开始执行。",{scheduled:true,objectCount:objects.length});
   if(!token)throw new Error("APIFY_NOT_CONFIGURED: 尚未配置 Apify API 凭证。");
   const progress:ActorProgress[]=[];
   for(const obj of objects){
    try{
     progress.push(await launchActor(env,obj,token));
     await patchRun(env,t,{status:"running",heartbeat_at:now(),current_stage:"采集器执行中",metadata:{actorRuns:[...progress],objectCount:objects.length}});
    }catch(error){
     const message=String(error instanceof Error?error.message:error).slice(0,400);
     progress.push({objectId:obj.object_id,actorId:ACTORS[obj.platform]??"",actorRunId:"",actorStatus:"FAILED",failedItems:1,completed:true,error:message});
     await patchRun(env,t,{status:"running",heartbeat_at:now(),metadata:{actorRuns:[...progress],objectCount:objects.length}});
     await log(env,obj,"error","object.failed","监听对象启动失败："+message,{sourceUrl:obj.source_url});
    }
   }
   const allDone=progress.every(p=>p.completed),failed=progress.reduce((n,p)=>n+Number(p.failedItems??0),0);
   if(allDone){
    await patchRun(env,t,{status:"failed",finished_at:now(),heartbeat_at:now(),current_stage:"执行失败",error_code:"OBJECTS_FAILED",error_message:failed+" 个监听对象启动失败",metadata:{actorRuns:progress,objectCount:objects.length,failedItems:failed}});
    await patchTask(env,t,{last_run_status:"failed",last_error:failed+" 个监听对象启动失败"});
   }else{
    await patchRun(env,t,{status:"running",heartbeat_at:now(),current_stage:"采集器执行中",metadata:{actorRuns:progress,objectCount:objects.length,failedItems:failed}});
    await log(env,t,"info","run.awaiting_actor","Actor 已启动并持久化；系统将在后续 Cron 周期继续轮询，不再占用单次 Worker 执行等待。",{actorRuns:progress.map(p=>({actorId:p.actorId,actorRunId:p.actorRunId,actorStatus:p.actorStatus}))});
   }
  }catch(error){
   const message=String(error instanceof Error?error.message:error).slice(0,1000);
   await patchRun(env,t,{status:"failed",finished_at:now(),heartbeat_at:now(),current_stage:"执行失败",error_code:message.split(":")[0].slice(0,80),error_message:message});
   await patchTask(env,t,{last_run_status:"failed",last_error:message});
   await log(env,t,"error","run.failed","本次监听失败："+message);
  }
 }
 return {claimed:claimed.length};
}
