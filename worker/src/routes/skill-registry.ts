import { errorResponse, successResponse } from "../lib/http";

type Env = { SUPABASE_URL:string; SUPABASE_ANON_KEY:string; SUPABASE_SERVICE_ROLE_KEY:string };
const SKILLS = [
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
 const token=request.headers.get("Authorization")?.match(/^Bearer\\s+(\\S+)$/i)?.[1];
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
 const owner=parts[0],repo=parts[1].replace(/\\.git$/,"");
 let ref=branch.trim()||"main";let path=skillPath.trim().replace(/^\\/+|\\/+$/g,"");
 if(parts[2]==="tree"&&parts.length>=4){ref=decodeURIComponent(parts[3]);path=parts.slice(4).join("/")||path;}
 if(parts[2]==="blob"&&parts.length>=5){ref=decodeURIComponent(parts[3]);path=parts.slice(4,-1).join("/")||path;}
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||! /^[A-Za-z0-9_.-]{1,100}$/.test(repo)||!ref||ref.length>200||path.split("/").some(p=>p===".."||p==="."))throw new Error("GitHub 仓库、分支或目录格式无效。");
 return {owner,repo,ref,path};
}
function parseFrontmatter(markdown:string):Record<string,string>{
 const match=markdown.match(/^---\\s*\\r?\\n([\\s\\S]*?)\\r?\\n---(?:\\r?\\n|$)/);
 if(!match)throw new Error("SKILL.md 缺少 YAML frontmatter。");
 const result:Record<string,string>={};
 for(const line of match[1].split(/\\r?\\n/)){
  const item=line.match(/^([A-Za-z][A-Za-z0-9_-]*):\\s*(.*?)\\s*$/);
  if(item)result[item[1]]=item[2].replace(/^(['"])(.*)\\1$/,"$2");
 }
 if(!result.name||!result.description)throw new Error("SKILL.md frontmatter 必须包含 name 和 description。");
 return result;
}
export async function handleSkillRegistry(request:Request,env:Env):Promise<Response>{
 const ownerId=await ownerFromRequest(request,env);
 if(!ownerId)return errorResponse(request,"UNAUTHENTICATED","请先登录 TradePilot。",401);
 const url=new URL(request.url);const base="/api/v1/agent/skills";
 try{
  if(url.pathname===base&&request.method==="GET"){
   const rows=await db<Array<{agent_key:string;enabled:boolean;config:Record<string,unknown>;updated_at:string}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=like.skill%3A*&select=agent_key,enabled,config,updated_at&order=agent_key.asc");
   const byKey=new Map(rows.map(row=>[row.agent_key,row]));
   return successResponse(request,SKILLS.map(([id,label,description])=>{
    const row=byKey.get("skill:"+id);const config=row?.config??{};
    const state=typeof config.syncedAt==="string"?"synced":typeof config.repositoryUrl==="string"&&config.repositoryUrl?"configured":"pending";
    return {id,label,description,state,enabled:row?.enabled??false,config};
   }));
  }
  const match=url.pathname.match(/^\\/api\\/v1\\/agent\\/skills\\/([a-z0-9-]+)(\\/sync)?$/);
  if(!match)return errorResponse(request,"NOT_FOUND","Skill 接口不存在。",404);
  const skillId=match[1];if(!SKILLS.some(item=>item[0]===skillId))return errorResponse(request,"SKILL_NOT_FOUND","预置 Skill 不存在。",404);
  const agentKey="skill:"+skillId;
  if(request.method==="PUT"&&!match[2]){
   const body=await request.json() as {repositoryUrl?:string;branch?:string;skillPath?:string};
   if(typeof body.repositoryUrl!=="string"||body.repositoryUrl.length>500)return errorResponse(request,"INVALID_REPOSITORY_URL","请填写有效的 GitHub 仓库地址。",400);
   const source=parseSource(body.repositoryUrl,body.branch??"",body.skillPath??"");
   const config={repositoryUrl:body.repositoryUrl.trim(),branch:source.ref,skillPath:source.path,syncStatus:"configured"};
   const rows=await db<Array<{agent_key:string;config:Record<string,unknown>;enabled:boolean}>>(env,"agent_profiles?on_conflict=owner_id,agent_key&select=agent_key,config,enabled",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({owner_id:ownerId,agent_key:agentKey,enabled:false,config,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:"configured",config:rows[0]?.config??config});
  }
  if(request.method==="POST"&&match[2]==="/sync"){
   const rows=await db<Array<{config:Record<string,unknown>}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey)+"&select=config&limit=1");
   const config=rows[0]?.config??{};const repositoryUrl=String(config.repositoryUrl??"");
   if(!repositoryUrl)return errorResponse(request,"SKILL_SOURCE_REQUIRED","请先填写 GitHub 仓库地址并保存。",400);
   const source=parseSource(repositoryUrl,String(config.branch??""),String(config.skillPath??""));
   const filePath=[source.path,"SKILL.md"].filter(Boolean).join("/");
   const rawUrl="https://raw.githubusercontent.com/"+encodeURIComponent(source.owner)+"/"+encodeURIComponent(source.repo)+"/"+source.ref.split("/").map(encodeURIComponent).join("/")+"/"+filePath.split("/").map(encodeURIComponent).join("/");
   const response=await fetch(rawUrl,{headers:{Accept:"text/plain","User-Agent":"TradePilot-Skill-Registry"},redirect:"manual",signal:AbortSignal.timeout(15000)});
   if(response.status>=300&&response.status<400)return errorResponse(request,"GITHUB_REDIRECT_BLOCKED","GitHub 返回重定向，已阻止非预期跳转。",502);
   if(!response.ok)return errorResponse(request,"GITHUB_FETCH_FAILED","无法读取 SKILL.md（HTTP "+response.status+"）。请检查仓库是否公开、分支和目录是否正确。",502);
   const markdown=await response.text();if(markdown.length>100000)return errorResponse(request,"SKILL_FILE_TOO_LARGE","SKILL.md 超过 100 KB 限制。",413);
   const manifest=parseFrontmatter(markdown);
   if(manifest.name!==skillId)return errorResponse(request,"SKILL_ID_MISMATCH","SKILL.md 的 name 必须与预置标识 "+skillId+" 一致。",422);
   const next={...config,manifest,skillMarkdown:markdown,syncedAt:new Date().toISOString(),syncStatus:"synced",source:{owner:source.owner,repo:source.repo,ref:source.ref,path:filePath}};
   await db(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({config:next,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:"synced",manifest,syncedAt:next.syncedAt,source:next.source});
  }
  return errorResponse(request,"METHOD_NOT_ALLOWED","不支持的 Skill 操作。",405);
 }catch(error){return errorResponse(request,"SKILL_REGISTRY_FAILED",error instanceof Error?error.message:"Skill 配置失败。",502);}
}
