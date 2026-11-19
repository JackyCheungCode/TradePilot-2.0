import { errorResponse, successResponse } from "../lib/http";

type Env = { SUPABASE_URL:string; SUPABASE_ANON_KEY:string; SUPABASE_SERVICE_ROLE_KEY:string };
type SkillConfig = Record<string, unknown>;
const STARTER_SKILLS = [
  ["market-intel","全球市场情报","市场规模、趋势、竞品与价格研究"],
  ["trade-lead-screening","贸易线索筛选","买家线索评分、去重与优先级筛选"],
  ["trade-customer-intel","贸易客户情报","企业背景调查、客户画像与采购能力分析"],
  ["trade-outreach-email","贸易开发邮件","开发信、跟进邮件与多语言沟通内容"],
  ["laifaxin-outreach","来发信触达","通过来发信平台执行邮件触达"],
  ["tradehot","热门产品趋势","热门产品、热销信号与趋势发现"],
  ["rfq-to-quotation","询盘转报价","解析 RFQ、匹配产品并生成报价草案"],
  ["trade-pipeline-run","外贸流程编排","协调外贸业务阶段与任务执行"],
  ["verify-docs","贸易单证核验","贸易单证字段、逻辑与一致性检查"],
  ["seo-audit","SEO 审核","网站技术 SEO、内容与搜索表现审计"],
] as const;

async function ownerFromRequest(request:Request,env:Env):Promise<string|null>{
 const token=request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return null;
 const response=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)});
 if(!response.ok)return null;
 const user=await response.json() as {id?:string};return user.id??null;
}
async function db<T>(env:Env,path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,signal:init.signal??AbortSignal.timeout(12000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...init.headers}});
 const raw=await response.text();if(!response.ok)throw new Error("DATABASE_"+response.status+": "+raw.slice(0,180));
 return raw?JSON.parse(raw) as T:undefined as T;
}
function parseSource(input:string,branch:string,skillPath:string):{owner:string;repo:string;ref:string;path:string}{
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error("请输入有效的 GitHub 仓库或目录 URL。");}
 if(url.protocol!=="https:"||url.hostname.toLowerCase()!=="github.com")throw new Error("仅支持 github.com HTTPS 仓库地址。");
 const parts=url.pathname.split("/").filter(Boolean);
 if(parts.length<2)throw new Error("GitHub 地址必须包含 owner/repository。");
 const owner=parts[0],repo=parts[1].replace(/\.git$/,"");
 let ref=branch.trim()||"main";let path=skillPath.trim().replace(/^\/+|\/+$/g,"");
 if(parts[2]==="tree"&&parts.length>=4){ref=decodeURIComponent(parts[3]);path=parts.slice(4).join("/")||path;}
 if(parts[2]==="blob"&&parts.length>=5){ref=decodeURIComponent(parts[3]);path=parts.slice(4,-1).join("/")||path;}
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||! /^[A-Za-z0-9_.-]{1,100}$/.test(repo)||!ref||ref.length>200||path.split("/").some(p=>p===".."||p==="."))throw new Error("GitHub 仓库、分支或目录格式无效。");
 return {owner,repo,ref,path};
}
function parseFrontmatter(markdown:string):Record<string,string>{
 const match=markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(!match)throw new Error("SKILL.md 缺少 YAML frontmatter。");
 const result:Record<string,string>={};
 for(const line of match[1].split(/\r?\n/)){
  const item=line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
  if(item)result[item[1]]=item[2].replace(/^(['"])(.*)\1$/,"$2");
 }
 if(!result.name||!result.description)throw new Error("SKILL.md frontmatter 必须包含 name 和 description。");
 if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(result.name))throw new Error("Skill name 必须是 2-80 位小写字母、数字或连字符，且以字母或数字开头。");
 return result;
}
async function fetchSkill(source:{owner:string;repo:string;ref:string;path:string}){
 const filePath=[source.path,"SKILL.md"].filter(Boolean).join("/");
 const rawUrl="https://raw.githubusercontent.com/"+encodeURIComponent(source.owner)+"/"+encodeURIComponent(source.repo)+"/"+source.ref.split("/").map(encodeURIComponent).join("/")+"/"+filePath.split("/").map(encodeURIComponent).join("/");
 const response=await fetch(rawUrl,{headers:{Accept:"text/plain","User-Agent":"TradePilot-Skill-Registry"},redirect:"manual",signal:AbortSignal.timeout(15000)});
 if(response.status>=300&&response.status<400)throw new Error("GITHUB_REDIRECT_BLOCKED：已阻止非预期跳转。");
 if(!response.ok)throw new Error("无法读取 SKILL.md（HTTP "+response.status+"）。请检查公开仓库、分支和目录。");
 const markdown=await response.text();if(markdown.length>100000)throw new Error("SKILL.md 超过 100 KB 限制。");
 return {markdown,manifest:parseFrontmatter(markdown),filePath};
}
function stateOf(config:SkillConfig):"pending"|"configured"|"synced"{
 return typeof config.syncedAt==="string"?"synced":typeof config.repositoryUrl==="string"&&config.repositoryUrl?"configured":"pending";
}
export async function handleSkillRegistry(request:Request,env:Env):Promise<Response>{
 const ownerId=await ownerFromRequest(request,env);
 if(!ownerId)return errorResponse(request,"UNAUTHENTICATED","请先登录 TradePilot。",401);
 const url=new URL(request.url);const base="/api/v1/agent/skills";
 try{
  if(url.pathname===base&&request.method==="GET"){
   const rows=await db<Array<{agent_key:string;enabled:boolean;config:SkillConfig;updated_at:string}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=like.skill%3A*&select=agent_key,enabled,config,updated_at&order=agent_key.asc");
   const byKey=new Map(rows.map(row=>[row.agent_key,row]));
   const presets=STARTER_SKILLS.map(([id,label,description])=>{
    const row=byKey.get("skill:"+id);const config=row?.config??{};
    return {id,label,description,sourceType:"starter",state:stateOf(config),enabled:row?.enabled??false,config};
   });
   const custom=rows.filter(row=>!STARTER_SKILLS.some(item=>"skill:"+item[0]===row.agent_key)).map(row=>{
    const id=row.agent_key.slice(6),config=row.config??{},manifest=(config.manifest??{}) as Record<string,string>;
    return {id,label:manifest.display_name||manifest.name||id,description:manifest.description||"从 GitHub 导入的 Skill",sourceType:"custom",state:stateOf(config),enabled:row.enabled,config};
   });
   return successResponse(request,[...presets,...custom]);
  }
  if(url.pathname===base&&request.method==="POST"){
   const body=await request.json() as {repositoryUrl?:string;branch?:string;skillPath?:string};
   if(typeof body.repositoryUrl!=="string"||body.repositoryUrl.length>500)return errorResponse(request,"INVALID_REPOSITORY_URL","请填写有效的 GitHub 仓库地址。",400);
   const source=parseSource(body.repositoryUrl,body.branch??"",body.skillPath??"");
   const imported=await fetchSkill(source);const id=imported.manifest.name;const agentKey="skill:"+id;
   const config={repositoryUrl:body.repositoryUrl.trim(),branch:source.ref,skillPath:source.path,manifest:imported.manifest,skillMarkdown:imported.markdown,syncedAt:new Date().toISOString(),syncStatus:"synced",source:{owner:source.owner,repo:source.repo,ref:source.ref,path:imported.filePath}};
   await db(env,"agent_profiles?on_conflict=owner_id,agent_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:ownerId,agent_key:agentKey,enabled:false,config,updated_at:new Date().toISOString()})});
   return successResponse(request,{id,label:imported.manifest.display_name||id,state:"synced",manifest:imported.manifest,source:config.source});
  }
  const match=url.pathname.match(/^\/api\/v1\/agent\/skills\/([a-z0-9-]+)(\/sync)?$/);
  if(!match)return errorResponse(request,"NOT_FOUND","Skill 接口不存在。",404);
  const skillId=match[1],agentKey="skill:"+skillId;
  if(request.method==="PUT"&&!match[2]){
   const body=await request.json() as {repositoryUrl?:string;branch?:string;skillPath?:string};
   if(typeof body.repositoryUrl!=="string"||body.repositoryUrl.length>500)return errorResponse(request,"INVALID_REPOSITORY_URL","请填写有效的 GitHub 仓库地址。",400);
   const source=parseSource(body.repositoryUrl,body.branch??"",body.skillPath??"");
   const config={repositoryUrl:body.repositoryUrl.trim(),branch:source.ref,skillPath:source.path,syncStatus:"configured"};
   await db(env,"agent_profiles?on_conflict=owner_id,agent_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:ownerId,agent_key:agentKey,enabled:false,config,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:"configured",config});
  }
  if(request.method==="POST"&&match[2]==="/sync"){
   const rows=await db<Array<{config:SkillConfig}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey)+"&select=config&limit=1");
   const config=rows[0]?.config??{},repositoryUrl=String(config.repositoryUrl??"");
   if(!repositoryUrl)return errorResponse(request,"SKILL_SOURCE_REQUIRED","请先填写 GitHub 仓库地址并保存。",400);
   const source=parseSource(repositoryUrl,String(config.branch??""),String(config.skillPath??""));
   const imported=await fetchSkill(source);
   if(imported.manifest.name!==skillId)return errorResponse(request,"SKILL_ID_MISMATCH","SKILL.md 的 name 与当前 Skill 标识不一致。",422);
   const next={...config,manifest:imported.manifest,skillMarkdown:imported.markdown,syncedAt:new Date().toISOString(),syncStatus:"synced",source:{owner:source.owner,repo:source.repo,ref:source.ref,path:imported.filePath}};
   await db(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({config:next,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:"synced",manifest:imported.manifest,syncedAt:next.syncedAt,source:next.source});
  }
  return errorResponse(request,"METHOD_NOT_ALLOWED","不支持的 Skill 操作。",405);
 }catch(error){return errorResponse(request,"SKILL_REGISTRY_FAILED",error instanceof Error?error.message:"Skill 配置失败。",502);}
}
