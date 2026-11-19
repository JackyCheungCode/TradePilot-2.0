import { errorResponse, successResponse } from "../lib/http.ts";

type Env = { SUPABASE_URL:string; SUPABASE_ANON_KEY:string; SUPABASE_SERVICE_ROLE_KEY:string };
type SkillConfig = Record<string, unknown>;
type Source = { owner:string; repo:string; ref:string; path:string };
type BundleFile = { path:string; size:number; encoding:"utf-8"|"base64"; content:string; sha:string };
type ReviewFinding = { severity:"high"|"medium"|"low"; code:string; message:string; file?:string };
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
const MAX_FILES = 60;
const MAX_FILE_BYTES = 256_000;
const MAX_BUNDLE_BYTES = 768_000;
const TEXT_EXTENSIONS = new Set([".md",".mdx",".txt",".json",".yaml",".yml",".toml",".js",".mjs",".cjs",".ts",".tsx",".jsx",".py",".sh",".bash",".ps1",".html",".css",".scss",".xml",".csv",".sql",".graphql",".go",".rs",".java",".rb",".php",".ini",".cfg",".conf",".example",".gitignore",".dockerignore"]);
const BLOCKED_FILE = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_rsa|id_ed25519|[^/]+\.(?:pem|key|p12|pfx|keystore|jks|token))$/i;
const BLOCKED_BINARY = /\.(?:exe|dll|so|dylib|bin|class|jar|wasm|o|a|dmg|apk|ipa)$/i;

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
function parseSource(input:string,branch:string,skillPath:string):Source{
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error("请输入有效的 GitHub 仓库或目录 URL。");}
 if(url.protocol!=="https:"||url.hostname.toLowerCase()!=="github.com"||url.username||url.password)throw new Error("仅支持 github.com HTTPS 仓库地址。");
 const parts=url.pathname.split("/").filter(Boolean);
 if(parts.length<2)throw new Error("GitHub 地址必须包含 owner/repository。");
 const owner=parts[0],repo=parts[1].replace(/\.git$/,"");
 let ref=branch.trim()||"main";let path=skillPath.trim().replace(/^\/+|\/+$/g,"");
 if(parts[2]==="tree"&&parts.length>=4){ref=decodeURIComponent(parts[3]);path=parts.slice(4).join("/")||path;}
 if(parts[2]==="blob"&&parts.length>=5){ref=decodeURIComponent(parts[3]);path=parts.slice(4,-1).join("/")||path;}
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||! /^[A-Za-z0-9_.-]{1,100}$/.test(repo)||!ref||ref.length>200||ref.startsWith("/")||ref.endsWith("/")||ref.split("/").some(part=>!part||part==="."||part===".."||part.startsWith(".")||part.endsWith(".")||part.endsWith(".lock")||/[~^:?*\\\\[\\s]/.test(part))||ref.includes("@{")||path.split("/").some(p=>p===".."||p==="."))throw new Error("GitHub 仓库、分支或目录格式无效。");
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
async function githubJson(url:string):Promise<Record<string,unknown>>{
 const response=await fetch(url,{headers:{Accept:"application/vnd.github+json","User-Agent":"TradePilot-Skill-Registry","X-GitHub-Api-Version":"2022-11-28"},redirect:"manual",signal:AbortSignal.timeout(15000)});
 if(response.status>=300&&response.status<400)throw new Error("GITHUB_REDIRECT_BLOCKED：已阻止非预期跳转。");
 if(response.status===403||response.status===429)throw new Error("GITHUB_RATE_LIMIT：GitHub 暂时限制了请求，请稍后重试。");
 if(!response.ok)throw new Error("GITHUB_API_"+response.status+"：无法读取仓库目录。");
 return await response.json() as Record<string,unknown>;
}
function safeRelativePath(path:string,root:string):boolean{
 if(!path||path.startsWith("/")||path.includes("\\")||path.split("/").some(part=>!part||part==="."||part===".."))return false;
 if(root&&!path.startsWith(root+"/"))return false;
 const relative=root?path.slice(root.length+1):path;
 if(!relative||relative.split("/").some(part=>part.startsWith("." )&&part!==".well-known"))return false;
 if(BLOCKED_FILE.test(relative)||BLOCKED_BINARY.test(relative))return false;
 return true;
}
function base64(bytes:Uint8Array):string{
 let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
}
function extension(path:string):string{return path.slice(path.lastIndexOf("/")+1).match(/\.[^.]+$/)?.[0].toLowerCase()??"";}
function staticReview(files:BundleFile[],manifest:Record<string,string>){
 const findings:ReviewFinding[]=[];
 const dependencies=new Set<string>(),domains=new Set<string>();
 const suspicious=[
  {pattern:/\b(?:eval\s*\(|new\s+Function\s*\()/g,code:"DYNAMIC_CODE_EXECUTION",severity:"high" as const,message:"发现动态代码执行模式，需要人工检查。"},
  {pattern:/\b(?:child_process|subprocess|os\.system|execSync|spawnSync)\b/g,code:"PROCESS_EXECUTION",severity:"high" as const,message:"发现系统进程或命令执行能力，需要人工检查。"},
  {pattern:/\b(?:readFile|writeFile|unlink|rmdir|open)\s*\(/g,code:"FILE_SYSTEM_ACCESS",severity:"medium" as const,message:"发现文件系统访问调用，需要核对文件访问范围。"},
  {pattern:/\b(?:fetch|axios|requests\.|urllib\.)/g,code:"NETWORK_ACCESS",severity:"medium" as const,message:"发现网络访问调用，需要核对目标域名与数据外发风险。"},
  {pattern:/\b(?:process\.env|Deno\.env|os\.environ)\b/g,code:"ENVIRONMENT_SECRET_ACCESS",severity:"high" as const,message:"发现环境变量访问，需要检查是否读取密钥或凭据。"},
 ];
 for(const file of files){
  if(file.encoding!=="utf-8")continue;
  const source=file.content;
  for(const item of suspicious){item.pattern.lastIndex=0;if(item.pattern.test(source))findings.push({severity:item.severity,code:item.code,message:item.message,file:file.path});}
  for(const match of source.matchAll(/https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?/g))domains.add(match[1].toLowerCase());
  if(file.path.endsWith("package.json")){
   try{const parsed=JSON.parse(source) as Record<string,unknown>;for(const key of ["dependencies","devDependencies","optionalDependencies"]){const values=parsed[key];if(values&&typeof values==="object")for(const name of Object.keys(values as Record<string,unknown>))dependencies.add(name);}}catch{findings.push({severity:"medium",code:"INVALID_PACKAGE_JSON",message:"package.json 无法解析。",file:file.path});}
  }
  if(file.path.endsWith("requirements.txt"))for(const line of source.split(/\r?\n/)){const name=line.trim().match(/^([A-Za-z0-9_.-]+)/)?.[1];if(name)dependencies.add(name);}
  if(file.path.endsWith("pyproject.toml"))for(const match of source.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*[=<>~!]/gm))dependencies.add(match[1]);
 }
 if(domains.size)findings.push({severity:"low",code:"EXTERNAL_DOMAINS_DECLARED",message:"包内声明或引用了外部域名，启用前应逐一审核。"});
 const high=findings.some(item=>item.severity==="high"),medium=findings.some(item=>item.severity==="medium");
 return {status:"pending_human_review",riskLevel:high?"high":medium?"medium":findings.length?"low":"unclassified",requiresHumanReview:true,automatedChecks:"heuristic_only",findings,dependencies:[...dependencies].sort(),networkDomains:[...domains].sort(),limitations:["静态规则扫描不是沙箱，也不能证明代码安全。","尚未执行依赖安装、脚本或任何 Skill 代码。","未声明的动态网络目标、混淆代码和运行时行为无法由本次扫描完整识别。"],manifestName:manifest.name};
}
async function fetchSkillBundle(source:Source){
 const repository="https://api.github.com/repos/"+encodeURIComponent(source.owner)+"/"+encodeURIComponent(source.repo);
 const commit=await githubJson(repository+"/commits/"+encodeURIComponent(source.ref));
 const commitSha=String(commit.sha??"");
 if(!/^[a-f0-9]{40}$/i.test(commitSha))throw new Error("GITHUB_COMMIT_INVALID：无法固定 Skill 来源提交。");
 const tree=await githubJson(repository+"/git/trees/"+commitSha+"?recursive=1");
 if(tree.truncated===true)throw new Error("SKILL_TREE_TRUNCATED：仓库目录过大或 GitHub 返回不完整目录，拒绝导入不完整 Skill。");
 const entries=Array.isArray(tree.tree)?tree.tree as Array<Record<string,unknown>>:[];
 const root=source.path.replace(/^\/+|\/+$/g,"");
 const candidates=entries.filter(entry=>entry.type==="blob"&&typeof entry.path==="string"&&safeRelativePath(entry.path,root));
 const skillEntry=candidates.find(entry=>entry.path===(root?[root,"SKILL.md"].join("/"):"SKILL.md"));
 if(!skillEntry)throw new Error("SKILL_MD_NOT_FOUND：指定目录中没有 SKILL.md。");
 if(candidates.length>MAX_FILES)throw new Error("SKILL_PACKAGE_TOO_MANY_FILES：Skill 包最多允许 "+MAX_FILES+" 个文件。");
 let declaredBytes=0;
 for(const entry of candidates){const size=Number(entry.size??0);if(!Number.isFinite(size)||size<0||size>MAX_FILE_BYTES)throw new Error("SKILL_FILE_TOO_LARGE："+String(entry.path));declaredBytes+=size;}
 if(declaredBytes>MAX_BUNDLE_BYTES)throw new Error("SKILL_PACKAGE_TOO_LARGE：Skill 包原始文件总量超过 "+MAX_BUNDLE_BYTES+" 字节。");
 const files:BundleFile[]=[];let actualBytes=0;
 for(const entry of candidates){
  const path=String(entry.path),rawUrl="https://raw.githubusercontent.com/"+encodeURIComponent(source.owner)+"/"+encodeURIComponent(source.repo)+"/"+commitSha+"/"+path.split("/").map(encodeURIComponent).join("/");
  const response=await fetch(rawUrl,{headers:{"User-Agent":"TradePilot-Skill-Registry"},redirect:"manual",signal:AbortSignal.timeout(15000)});
  if(response.status>=300&&response.status<400)throw new Error("GITHUB_REDIRECT_BLOCKED：已阻止非预期跳转。");
  if(!response.ok)throw new Error("SKILL_FILE_FETCH_FAILED："+path+"（HTTP "+response.status+"）。");
  const bytes=new Uint8Array(await response.arrayBuffer());actualBytes+=bytes.byteLength;
  if(bytes.byteLength>MAX_FILE_BYTES||actualBytes>MAX_BUNDLE_BYTES)throw new Error("SKILL_PACKAGE_SIZE_LIMIT：下载内容超过安全限制。");
  const ext=extension(path),isText=TEXT_EXTENSIONS.has(ext)||!ext||path.endsWith(".gitignore")||path.endsWith(".dockerignore");
  let content:string,encoding:"utf-8"|"base64";
  if(isText){try{content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);encoding="utf-8";}catch{content=base64(bytes);encoding="base64";}}
  else{content=base64(bytes);encoding="base64";}
  files.push({path:root?path.slice(root.length+1):path,size:bytes.byteLength,encoding,content,sha:String(entry.sha??"")});
 }
 const skillFile=files.find(file=>file.path==="SKILL.md");
 if(!skillFile||skillFile.encoding!=="utf-8")throw new Error("SKILL_MD_INVALID：SKILL.md 必须是 UTF-8 文本。");
 if(skillFile.size>100000)throw new Error("SKILL.md 超过 100 KB 限制。");
 const manifest=parseFrontmatter(skillFile.content);
 const review=staticReview(files,manifest);
 return {manifest,files,package:{fileCount:files.length,totalBytes:actualBytes,limits:{maxFiles:MAX_FILES,maxFileBytes:MAX_FILE_BYTES,maxTotalBytes:MAX_BUNDLE_BYTES},syncedAt:new Date().toISOString(),sourceRef:source.ref,commitSha},review};
}
function publicConfig(config:SkillConfig):SkillConfig{
 const bundle=config.bundle&&typeof config.bundle==="object"?config.bundle as Record<string,unknown>:{};
 return {repositoryUrl:config.repositoryUrl,branch:config.branch,skillPath:config.skillPath,manifest:config.manifest,syncedAt:config.syncedAt,syncStatus:config.syncStatus,activationStatus:config.activationStatus,bundle:Object.keys(bundle).length?{fileCount:bundle.fileCount,totalBytes:bundle.totalBytes,syncedAt:bundle.syncedAt,sourceRef:bundle.sourceRef}:undefined,securityReview:config.securityReview};
}
function stateOf(config:SkillConfig):"pending"|"configured"|"synced"{
 return typeof config.syncedAt==="string"?"synced":typeof config.repositoryUrl==="string"&&config.repositoryUrl?"configured":"pending";
}
function skillConfig(source:Source,repositoryUrl:string,imported:Awaited<ReturnType<typeof fetchSkillBundle>>){
 return {repositoryUrl:repositoryUrl.trim(),branch:source.ref,skillPath:source.path,manifest:imported.manifest,bundle:{...imported.package,files:imported.files},securityReview:imported.review,syncedAt:imported.package.syncedAt,syncStatus:"package_synced",activationStatus:"disabled_pending_review"};
}
export async function handleSkillRegistry(request:Request,env:Env):Promise<Response>{
 const ownerId=await ownerFromRequest(request,env);
 if(!ownerId)return errorResponse(request,"UNAUTHENTICATED","请先登录 TradePilot。",401);
 const url=new URL(request.url);const base="/api/v1/agent/skills";
 try{
  if(url.pathname===base&&request.method==="GET"){
   const rows=await db<Array<{agent_key:string;enabled:boolean;config:SkillConfig;updated_at:string}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=like.skill%3A*&select=agent_key,enabled,config,updated_at&order=agent_key.asc");
   const byKey=new Map(rows.map(row=>[row.agent_key,row]));
   const presets=STARTER_SKILLS.map(([id,label,description])=>{const row=byKey.get("skill:"+id);const config=publicConfig(row?.config??{});return {id,label,description,sourceType:"starter",state:stateOf(config),enabled:row?.enabled??false,config};});
   const custom=rows.filter(row=>!STARTER_SKILLS.some(item=>"skill:"+item[0]===row.agent_key)).map(row=>{const id=row.agent_key.slice(6),config=publicConfig(row.config??{}),manifest=(config.manifest??{}) as Record<string,string>;return {id,label:manifest.display_name||manifest.name||id,description:manifest.description||"从 GitHub 导入的 Skill",sourceType:"custom",state:stateOf(config),enabled:row.enabled,config};});
   return successResponse(request,[...presets,...custom]);
  }
  if(url.pathname===base&&request.method==="POST"){
   const body=await request.json() as {repositoryUrl?:string;branch?:string;skillPath?:string};
   if(typeof body.repositoryUrl!=="string"||body.repositoryUrl.length>500)return errorResponse(request,"INVALID_REPOSITORY_URL","请填写有效的 GitHub 仓库地址。",400);
   const source=parseSource(body.repositoryUrl,body.branch??"",body.skillPath??"");
   const imported=await fetchSkillBundle(source);const id=imported.manifest.name;const agentKey="skill:"+id;
   const config=skillConfig(source,body.repositoryUrl,imported);
   await db(env,"agent_profiles?on_conflict=owner_id,agent_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:ownerId,agent_key:agentKey,enabled:false,config,updated_at:new Date().toISOString()})});
   return successResponse(request,{id,label:imported.manifest.display_name||id,state:"package_synced",manifest:imported.manifest,package:imported.package,securityReview:imported.review,activationStatus:"disabled_pending_review"});
  }
  const match=url.pathname.match(/^\/api\/v1\/agent\/skills\/([a-z0-9-]+)(\/sync)?$/);
  if(!match)return errorResponse(request,"NOT_FOUND","Skill 接口不存在。",404);
  const skillId=match[1],agentKey="skill:"+skillId;
  if(request.method==="PUT"&&!match[2]){
   const body=await request.json() as {repositoryUrl?:string;branch?:string;skillPath?:string};
   if(typeof body.repositoryUrl!=="string"||body.repositoryUrl.length>500)return errorResponse(request,"INVALID_REPOSITORY_URL","请填写有效的 GitHub 仓库地址。",400);
   const source=parseSource(body.repositoryUrl,body.branch??"",body.skillPath??"");
   const existing=await db<Array<{config:SkillConfig}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey)+"&select=config&limit=1");
   const previous=existing[0]?.config??{};
   const repositoryUrl=body.repositoryUrl.trim();
   const unchanged=String(previous.repositoryUrl??"")===repositoryUrl&&String(previous.branch??"main")===source.ref&&String(previous.skillPath??"")===source.path;
   const config:SkillConfig=unchanged?{...previous,activationStatus:"disabled_pending_review"}:{repositoryUrl,branch:source.ref,skillPath:source.path,syncStatus:"configured",activationStatus:"disabled_pending_review"};
   await db(env,"agent_profiles?on_conflict=owner_id,agent_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:ownerId,agent_key:agentKey,enabled:false,config,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:stateOf(config),config:publicConfig(config)});
  }
  if(request.method==="POST"&&match[2]==="/sync"){
   const rows=await db<Array<{config:SkillConfig}>>(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey)+"&select=config&limit=1");
   const config=rows[0]?.config??{},repositoryUrl=String(config.repositoryUrl??"");
   if(!repositoryUrl)return errorResponse(request,"SKILL_SOURCE_REQUIRED","请先填写 GitHub 仓库地址并保存。",400);
   const source=parseSource(repositoryUrl,String(config.branch??""),String(config.skillPath??""));
   const imported=await fetchSkillBundle(source);
   if(imported.manifest.name!==skillId)return errorResponse(request,"SKILL_ID_MISMATCH","SKILL.md 的 name 与当前 Skill 标识不一致。",422);
   const next={...skillConfig(source,repositoryUrl,imported),createdFrom:config.createdFrom??"github_import"};
   await db(env,"agent_profiles?owner_id=eq."+ownerId+"&agent_key=eq."+encodeURIComponent(agentKey),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({enabled:false,config:next,updated_at:new Date().toISOString()})});
   return successResponse(request,{id:skillId,state:"package_synced",manifest:imported.manifest,package:imported.package,securityReview:imported.review,activationStatus:"disabled_pending_review"});
  }
  return errorResponse(request,"METHOD_NOT_ALLOWED","不支持的 Skill 操作。",405);
 }catch(error){return errorResponse(request,"SKILL_REGISTRY_FAILED",error instanceof Error?error.message:"Skill 配置失败。",502);}
}
