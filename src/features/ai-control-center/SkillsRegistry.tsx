import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button, FileUploader, TPSkeleton, InlineNotification, Tag, TextArea, TextInput, Modal, ModalBody, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Finding = { severity:'high'|'medium'|'low'; code:string; message:string; file?:string };
type Skill = { id:string; label:string; description:string; sourceType:string; state:'pending'|'configured'|'synced'; enabled:boolean; config:Record<string,unknown> };
type Draft = { repositoryUrl:string; branch:string; skillPath:string };
type SecurityReview = { status?:string; riskLevel?:string; requiresHumanReview?:boolean; findings?:Finding[]; dependencies?:string[]; networkDomains?:string[]; limitations?:string[] };
type SkillBundle = { fileCount:number; totalBytes:number; syncedAt:string };
type ContractSummary = { version?:string; runtime?:string; entrypoint?:string; requiredTools?:string[]; permissions?:{networkHosts?:string[];dataScopes?:string[];secrets?:string[];sideEffects?:string[]}; limits?:{timeoutSeconds?:number;memoryMb?:number;maxOutputBytes?:number} };
function contractOf(config:Record<string,unknown>):ContractSummary|null{
 return config.contractSummary&&typeof config.contractSummary==='object'?config.contractSummary as ContractSummary:null;
}
function contractTag(status:string){
 if(status==='valid')return <Tag type="green">契约有效</Tag>;
 if(status==='invalid')return <Tag type="red">契约无效</Tag>;
 return <Tag type="cool-gray">缺少 skill.json</Tag>;
}
async function skillRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const client=await getSupabaseClient();const {data}=await client.auth.getSession();
 if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json() as {data?:T;error?:{message?:string}};
 if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'Skill 管理请求失败。');
 return payload.data as T;
}
function stateTag(state:Skill['state']){
 if(state==='synced')return <Tag type="green">完整包已同步</Tag>;
 if(state==='configured')return <Tag type="blue">已填写来源</Tag>;
 return <Tag type="cool-gray">待配置</Tag>;
}
function riskTag(level:string){
 if(level==='high')return <Tag type="red">高风险信号</Tag>;
 if(level==='medium')return <Tag type="warm-gray">需重点复核</Tag>;
 if(level==='low')return <Tag type="blue">发现外部引用</Tag>;
 return <Tag type="cool-gray">尚无结论</Tag>;
}
function reviewOf(config:Record<string,unknown>):SecurityReview{
 return config.securityReview&&typeof config.securityReview==='object'?config.securityReview as SecurityReview:{};
}
function bundleOf(config:Record<string,unknown>):SkillBundle{
 const bundle=config.bundle&&typeof config.bundle==='object'?config.bundle as Record<string,unknown>:{};
 return {fileCount:Number(bundle.fileCount??0),totalBytes:Number(bundle.totalBytes??0),syncedAt:String(bundle.syncedAt??'')};
}
function formatBytes(value:number){
 if(value<1024)return value+' B';
 if(value<1024*1024)return (value/1024).toFixed(1)+' KB';
 return (value/1024/1024).toFixed(2)+' MB';
}
export function SkillsRegistry(){
 const [skills,setSkills]=useState<Skill[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [newSource,setNewSource]=useState<Draft>({repositoryUrl:'',branch:'main',skillPath:''});
 const [manualSkillMd,setManualSkillMd]=useState('');
 const [manualSkillJson,setManualSkillJson]=useState('');
 const [zipBase64,setZipBase64]=useState('');
 const [zipFileName,setZipFileName]=useState('');
 const [removeConfirm,setRemoveConfirm]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const rows=await skillRequest<Skill[]>('/api/v1/agent/skills');setSkills(rows);
   setDrafts(Object.fromEntries(rows.map(row=>[row.id,{repositoryUrl:String(row.config.repositoryUrl??''),branch:String(row.config.branch??'main'),skillPath:String(row.config.skillPath??'')}]))); 
  }catch(cause){setError(cause instanceof Error?cause.message:'读取 Skill 列表失败。');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[]);
 const change=(id:string,key:keyof Draft,value:string)=>setDrafts(current=>{const previous=current[id]??{repositoryUrl:'',branch:'main',skillPath:''};return {...current,[id]:{...previous,[key]:value}};});
 const save=async(id:string)=>{
  const draft=drafts[id];if(!draft?.repositoryUrl.trim())return;
  setBusy(id);setError('');setNotice('');
  try{
   await skillRequest('/api/v1/agent/skills/'+id,{method:'PUT',body:JSON.stringify(draft)});
   setNotice(id+'：GitHub 来源已保存。完整包尚未导入。');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'保存 GitHub 来源失败。');}
  finally{setBusy('');}
 };
 const sync=async(id:string)=>{
  setBusy(id);setError('');setNotice('');
  try{
   const result=await skillRequest<{manifest:{name:string;description:string};contractStatus:string;contractErrors:string[];package:{fileCount:number;totalBytes:number};securityReview:SecurityReview}>('/api/v1/agent/skills/'+id+'/sync',{method:'POST',body:'{}'});
   setNotice(id+'：已导入 '+result.package.fileCount+' 个文件（'+formatBytes(result.package.totalBytes)+'），契约状态：'+(result.contractStatus==='valid'?'有效':result.contractStatus==='invalid'?'无效':'缺失')+'；仍须人工安全审核。');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'导入 Skill 完整包失败。');}
  finally{setBusy('');}
 };
 const chooseZip=(event:SyntheticEvent<HTMLElement>,data?:unknown)=>{
  const first=(data as {addedFiles?:Array<{file?:File}>}|undefined)?.addedFiles?.[0];
  const file=first?.file??(event.target as HTMLInputElement).files?.[0];if(!file)return;
  if(!file.name.toLowerCase().endsWith('.zip')||file.size>900000){setError('请上传小于 900 KB 的 ZIP 文件。');return;}
  void file.arrayBuffer().then(buffer=>{
   const bytes=new Uint8Array(buffer);let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
   setZipBase64(btoa(binary));setZipFileName(file.name);setError('');
  }).catch(()=>setError('读取 ZIP 文件失败，请重试。'));
 };
 const addZip=async()=>{
  if(!zipBase64)return;
  setBusy('__zip__');setError('');setNotice('');
  try{
   const result=await skillRequest<{id:string;contractStatus:string;package:{fileCount:number;totalBytes:number}}>('/api/v1/agent/skills',{method:'POST',body:JSON.stringify({sourceType:'zip',zipBase64})});
   setNotice('已从 '+zipFileName+' 注册 '+result.id+'，导入 '+result.package.fileCount+' 个文件。契约状态：'+(result.contractStatus==='valid'?'有效':result.contractStatus==='invalid'?'无效':'缺失')+'；仍需人工审核。');
   setZipBase64('');setZipFileName('');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'ZIP Skill 导入失败。');}
  finally{setBusy('');}
 };
 const addManual=async()=>{
  if(!manualSkillMd.trim())return;
  setBusy('__manual__');setError('');setNotice('');
  try{
   const result=await skillRequest<{id:string;contractStatus:string;package:{fileCount:number;totalBytes:number}}>('/api/v1/agent/skills',{method:'POST',body:JSON.stringify({sourceType:'manual',skillMd:manualSkillMd,skillJson:manualSkillJson||undefined})});
   setNotice('已手动注册 '+result.id+'，契约状态：'+(result.contractStatus==='valid'?'有效':result.contractStatus==='invalid'?'无效':'缺失')+'。已保存到私有存储，仍需人工审核。');
   setManualSkillMd('');setManualSkillJson('');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'手动注册 Skill 失败。');}
  finally{setBusy('');}
 };
 const toggleInstructionUse=async(skill:Skill)=>{
  setBusy(skill.id);setError("");setNotice("");
  try{
   const result=await skillRequest<{enabled:boolean;activationStatus:string;executionMode:string}>("/api/v1/agent/skills/"+skill.id,{method:"PATCH",body:JSON.stringify({enabled:!skill.enabled})});
   setNotice(result.enabled?"已允许小雅使用 "+skill.label+" 的 SKILL.md 工作方法；不会执行包内脚本。":"已停用 "+skill.label+"，小雅不再加载其工作方法。");
   await load();
  }catch(cause){setError(cause instanceof Error?cause.message:"更新 Skill 使用权限失败。");}
  finally{setBusy("");}
 };
 const remove=async(id:string)=>{
  setBusy(id);setError('');setNotice('');
  try{
   await skillRequest('/api/v1/agent/skills/'+id,{method:'DELETE'});
   setNotice(id+' 已从当前账户注册表移除。内容寻址的共享存储对象不会被直接删除。');
   setRemoveConfirm('');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'移除 Skill 失败。');}
  finally{setBusy('');}
 };
 const add=async()=>{
  if(!newSource.repositoryUrl.trim())return;
  setBusy('__new__');setError('');setNotice('');
  try{
   const result=await skillRequest<{id:string;contractStatus:string;contractErrors:string[];package:{fileCount:number;totalBytes:number};securityReview:SecurityReview}>('/api/v1/agent/skills',{method:'POST',body:JSON.stringify(newSource)});
   setNotice('已新增 '+result.id+'：导入 '+result.package.fileCount+' 个文件（'+formatBytes(result.package.totalBytes)+'），契约状态：'+(result.contractStatus==='valid'?'有效':result.contractStatus==='invalid'?'无效':'缺失')+'。Skill 保持停用，等待人工审核。');
   setNewSource({repositoryUrl:'',branch:'main',skillPath:''});await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'新增 Skill 失败。');}
  finally{setBusy('');}
 };
 return <div className="tp-settings-agent">
  <InlineNotification kind="info" lowContrast title="开放式 Skills 注册中心" subtitle="Skill 数量不设固定上限，注册表只展示你实际添加的项目。支持公开 GitHub、ZIP 上传和手动创建三种注册方式；系统读取 SKILL.md、完整目录文件和可选的 skill.json 执行契约，并识别依赖、外部域名及部分高风险代码模式。所有导入项默认停用；契约有效和静态检查通过均不等于安全认证，也不会执行任何 Skill 代码。" />
  {error&&<InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="操作完成" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <div className="tp-settings__editor">
   <h3>从 GitHub 注册 Skill</h3>
   <p>支持公开仓库根目录或具体 Skill 目录。系统校验 SKILL.md，并在文件数量、单文件大小和总大小限制内导入文本及资源文件。</p>
   <div className="tp-settings__editor-grid">
    <TextInput id="new-skill-repository" labelText="GitHub 仓库 / Skill 目录 URL" placeholder="https://github.com/owner/repo/tree/main/skills/my-skill" value={newSource.repositoryUrl} onChange={event=>setNewSource(current=>({...current,repositoryUrl:event.currentTarget.value}))}/>
    <TextInput id="new-skill-branch" labelText="分支（可选）" value={newSource.branch} onChange={event=>setNewSource(current=>({...current,branch:event.currentTarget.value}))}/>
    <TextInput id="new-skill-path" labelText="Skill 目录（可选）" placeholder="skills/my-skill" value={newSource.skillPath} onChange={event=>setNewSource(current=>({...current,skillPath:event.currentTarget.value}))}/>
   </div>
   <Button kind="primary" renderIcon={semanticIcons.add} disabled={busy!==''||!newSource.repositoryUrl.trim()} onClick={()=>void add()}>{busy==='__new__'?'正在导入并检查…':'新增并导入完整包'}</Button>
  </div>
  <div className="tp-settings__editor">
   <h3>上传 ZIP Skill 包</h3>
   <p>上传包含一个 SKILL.md 的 ZIP 压缩包。系统会检查目录、文件数量、文件大小、敏感文件和执行契约，不会运行压缩包中的代码。</p>
   <FileUploader accept={['.zip']} buttonLabel="选择 ZIP 文件" filenameStatus="complete" labelTitle="Skill ZIP 包" labelDescription="最大 900 KB；解压后最多 60 个文件、总计 768 KB。" multiple={false} onChange={chooseZip}/>
   {zipFileName&&<p>已选择：{zipFileName}</p>}
   <Button kind="primary" renderIcon={semanticIcons.cloudUpload} disabled={busy!==''||!zipBase64} onClick={()=>void addZip()}>{busy==='__zip__'?'正在解压、检查并注册…':'上传并注册 ZIP Skill'}</Button>
  </div>
  <div className="tp-settings__editor">
   <h3>手动创建 Skill</h3>
   <p>粘贴 Skill 的说明文件；可选附加 skill.json 执行契约。名称和描述从 SKILL.md frontmatter 自动读取。手动创建的内容同样会进行结构与静态检查，并默认停用。</p>
   <TextArea id="manual-skill-markdown" labelText="SKILL.md 内容" rows={10} value={manualSkillMd} onChange={event=>setManualSkillMd(event.currentTarget.value)} placeholder={'---\nname: my-skill\ndescription: Describe what this Skill does\n---\n\n# Instructions\n...'} />
   <TextArea id="manual-skill-contract" labelText="skill.json（可选）" rows={8} value={manualSkillJson} onChange={event=>setManualSkillJson(event.currentTarget.value)} placeholder='{"schemaVersion":1,...}' />
   <Button kind="primary" renderIcon={semanticIcons.add} disabled={busy!==''||!manualSkillMd.trim()} onClick={()=>void addManual()}>{busy==='__manual__'?'正在注册并检查…':'注册手动 Skill'}</Button>
  </div>
  <div className="tp-settings__editor">
   <h3>Skills 注册表 <Tag type="cool-gray">{skills.length} 项</Tag></h3>
   {loading?<TPSkeleton variant="card" rows={3}/>:skills.length===0?<p>尚无 Skill 记录。可以从 GitHub 注册第一个 Skill。</p>:<div className="tp-settings__section-layout">
    {skills.map(skill=>{
     const draft=drafts[skill.id]??{repositoryUrl:'',branch:'main',skillPath:''};
     const review=reviewOf(skill.config),bundle=bundleOf(skill.config),findings=review.findings??[],contract=contractOf(skill.config),contractStatus=String(skill.config.contractStatus??"missing"),contractErrors=Array.isArray(skill.config.contractErrors)?skill.config.contractErrors as string[]:[];
     const dependencies=review.dependencies??[],domains=review.networkDomains??[];
     return <section key={skill.id} className="tp-settings__editor">
      <div className="tp-ai-control__skill-heading">
       <div><h4>{skill.label}</h4><p><code>{skill.id}</code> · {skill.description}</p></div>
       <div className="tp-ai-control__skill-actions">{stateTag(skill.state)}{<Tag type="purple">{skill.sourceType==='github'?'GitHub':skill.sourceType==='zip'?'ZIP':skill.sourceType==='manual'?'手动':'已注册'}</Tag>}{skill.enabled&&<Tag type="red">当前已启用</Tag>}</div>
      </div>
      <div className="tp-settings__editor-grid">
       <TextInput id={'skill-repo-'+skill.id} labelText="GitHub 仓库 / Skill 目录 URL" placeholder="https://github.com/owner/repo/tree/main/skills/name" value={draft.repositoryUrl} onChange={event=>change(skill.id,'repositoryUrl',event.currentTarget.value)}/>
       <TextInput id={'skill-branch-'+skill.id} labelText="分支（可选）" value={draft.branch} onChange={event=>change(skill.id,'branch',event.currentTarget.value)}/>
       <TextInput id={'skill-path-'+skill.id} labelText="Skill 目录（可选）" placeholder="skills/name" value={draft.skillPath} onChange={event=>change(skill.id,'skillPath',event.currentTarget.value)}/>
      </div>
      <div className="tp-ai-control__skill-actions">
       <Button kind="tertiary" size="sm" renderIcon={semanticIcons.save} disabled={busy!==''||!draft.repositoryUrl.trim()} onClick={()=>void save(skill.id)}>保存来源</Button>
       <Button kind="primary" size="sm" renderIcon={semanticIcons.refresh} disabled={busy!==''||!draft.repositoryUrl.trim()} onClick={()=>void sync(skill.id)}>{busy===skill.id?'正在导入完整包…':'重新导入完整包并检查'}</Button>
       <Button kind={skill.enabled?"tertiary":"primary"} size="sm" renderIcon={skill.enabled?semanticIcons.pause:semanticIcons.play} disabled={busy!==''||skill.state!=='synced'} onClick={()=>void toggleInstructionUse(skill)}>{busy===skill.id?"正在更新…":skill.enabled?"停止供小雅使用":"允许小雅使用方法"}</Button>
       <Button kind="danger--tertiary" size="sm" renderIcon={semanticIcons.delete} disabled={busy!==''} onClick={()=>setRemoveConfirm(skill.id)}>移除 Skill</Button>
      </div>
      {bundle.fileCount>0&&<div className="tp-settings__section-item"><span>已导入文件</span><strong>{bundle.fileCount} 个 · {formatBytes(bundle.totalBytes)}</strong></div>}
      {bundle.fileCount>0&&<div className="tp-settings__section-item"><span>执行契约</span><span>{contractTag(contractStatus)}</span></div>}
      {contract&&<div className="tp-settings__editor">
       <h5>契约摘要 · v{contract.version}</h5>
       <p>运行环境：{contract.runtime} · 入口：<code>{contract.entrypoint}</code></p>
       <p>声明工具：{contract.requiredTools?.length?contract.requiredTools.join('、'):'无'}</p>
       <p>网络主机：{contract.permissions?.networkHosts?.length?contract.permissions.networkHosts.join('、'):'无'}</p>
       <p>数据权限：{contract.permissions?.dataScopes?.length?contract.permissions.dataScopes.join('、'):'无'} · Secrets：{contract.permissions?.secrets?.length?contract.permissions.secrets.join('、'):'无'}</p>
       <p>副作用：{contract.permissions?.sideEffects?.length?contract.permissions.sideEffects.join('、'):'无'}</p>
       <p>资源上限：{contract.limits?.timeoutSeconds??'—'} 秒 · {contract.limits?.memoryMb??'—'} MB · {formatBytes(contract.limits?.maxOutputBytes??0)} 输出</p>
      </div>}
      {contractErrors.length>0&&<div className="tp-settings__editor">
       <h5>契约校验问题</h5>
       {contractErrors.map((item,index)=><p key={index}>{item}</p>)}
      </div>}
      {review.status&&<div className="tp-settings__section-item"><span>安全审核状态</span><span>{riskTag(review.riskLevel??'')} <Tag type="warm-gray">等待人工审核</Tag></span></div>}
      {findings.length>0&&<div className="tp-settings__editor">
       <h5>静态检查发现</h5>
       {findings.map((finding,index)=><div key={finding.code+'-'+index} className="tp-ai-control__status-row"><span>{finding.message}{finding.file&&<><br/><code>{finding.file}</code></>}</span><Tag type={finding.severity==='high'?'red':finding.severity==='medium'?'warm-gray':'blue'}>{finding.severity==='high'?'高':finding.severity==='medium'?'中':'低'} · {finding.code}</Tag></div>)}
      </div>}
      {(dependencies.length>0||domains.length>0)&&<div className="tp-settings__editor">
       <h5>运行依赖与外部访问线索</h5>
       {dependencies.length>0&&<p>依赖：{dependencies.join('、')}</p>}
       {domains.length>0&&<p>域名：{domains.join('、')}</p>}
      </div>}
      {bundle.fileCount===0&&<p>尚未导入完整 Skill 包。填写来源并点击“重新导入完整包并检查”。</p>}
      <InlineNotification kind="warning" lowContrast title="仅工作方法模式" subtitle="允许小雅使用只读的 SKILL.md 指引，不会安装依赖或运行脚本。Skill 内容始终视为不可信资料，不能覆盖系统规则或扩大工具权限。真正的脚本执行仍需独立隔离沙箱。"/>
     </section>;
    })}
   </div>}
  </div>
  <Modal open={Boolean(removeConfirm)} onRequestClose={()=>setRemoveConfirm('')} modalHeading="移除 Skill？" primaryButtonText="确认移除" secondaryButtonText="取消" danger onRequestSubmit={()=>{const id=removeConfirm;setRemoveConfirm('');if(id)void remove(id);}}>
   <ModalBody><p>确定从当前账户注册表中移除 <strong>{skills.find(skill=>skill.id===removeConfirm)?.label??removeConfirm}</strong>？共享内容寻址存储不会被直接删除，但该账户将无法继续使用此 Skill。</p></ModalBody>
  </Modal>
 </div>;
}
