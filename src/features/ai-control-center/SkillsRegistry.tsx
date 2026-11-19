import { useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Skill = { id:string; label:string; description:string; sourceType:'starter'|'custom'; state:'pending'|'configured'|'synced'; enabled:boolean; config:Record<string,unknown> };
type Draft = { repositoryUrl:string; branch:string; skillPath:string };
async function skillRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const client=await getSupabaseClient();const {data}=await client.auth.getSession();
 if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json() as {data?:T;error?:{message?:string}};
 if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'Skill 管理请求失败。');
 return payload.data as T;
}
function stateTag(state:Skill['state']){
 if(state==='synced')return <Tag type="green">已同步配置</Tag>;
 if(state==='configured')return <Tag type="blue">已填写来源</Tag>;
 return <Tag type="cool-gray">待配置</Tag>;
}
export function SkillsRegistry(){
 const [skills,setSkills]=useState<Skill[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [newSource,setNewSource]=useState<Draft>({repositoryUrl:'',branch:'main',skillPath:''});
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
 const change=(id:string,key:keyof Draft,value:string)=>setDrafts(current=>({...current,[id]:{repositoryUrl:'',branch:'main',skillPath:'',...current[id],[key]:value}}));
 const save=async(id:string)=>{
  const draft=drafts[id];if(!draft?.repositoryUrl.trim())return;
  setBusy(id);setError('');setNotice('');
  try{
   await skillRequest('/api/v1/agent/skills/'+id,{method:'PUT',body:JSON.stringify(draft)});
   setNotice(id+'：GitHub 来源已保存。');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'保存 GitHub 来源失败。');}
  finally{setBusy('');}
 };
 const sync=async(id:string)=>{
  setBusy(id);setError('');setNotice('');
  try{
   const result=await skillRequest<{manifest:{name:string;description:string};source:{owner:string;repo:string}}>('/api/v1/agent/skills/'+id+'/sync',{method:'POST',body:'{}'});
   setNotice(id+'：已从 GitHub 拉取并校验 SKILL.md（'+result.source.owner+'/'+result.source.repo+'）。');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'拉取 Skill 配置失败。');}
  finally{setBusy('');}
 };
 const add=async()=>{
  if(!newSource.repositoryUrl.trim())return;
  setBusy('__new__');setError('');setNotice('');
  try{
   const result=await skillRequest<{id:string;manifest:{description:string}}>('/api/v1/agent/skills',{method:'POST',body:JSON.stringify(newSource)});
   setNotice('已新增 Skill：'+result.id+'。配置已同步，当前保持停用状态。');
   setNewSource({repositoryUrl:'',branch:'main',skillPath:''});await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'新增 Skill 失败。');}
  finally{setBusy('');}
 };
 return <div className="tp-settings-agent">
  <InlineNotification kind="info" lowContrast title="可扩展 Skills 注册中心" subtitle="这里的十个条目只是初始建议，不是数量上限。你可以持续从 GitHub 新增 Skill；系统读取 SKILL.md 并登记名称、描述和来源。复杂 Skill 可先登记配置，经过依赖、权限与运行环境审核后再启用。" />
  {error&&<InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="操作完成" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <div className="tp-settings__editor">
   <h3>从 GitHub 新增 Skill</h3>
   <p>支持公开仓库根目录或具体 Skill 目录。系统会读取目录中的 SKILL.md，并以 frontmatter 的 name 作为唯一标识。</p>
   <div className="tp-settings__editor-grid">
    <TextInput id="new-skill-repository" labelText="GitHub 仓库 / Skill 目录 URL" placeholder="https://github.com/owner/repo/tree/main/skills/my-skill" value={newSource.repositoryUrl} onChange={event=>setNewSource(current=>({...current,repositoryUrl:event.currentTarget.value}))}/>
    <TextInput id="new-skill-branch" labelText="分支（可选）" value={newSource.branch} onChange={event=>setNewSource(current=>({...current,branch:event.currentTarget.value}))}/>
    <TextInput id="new-skill-path" labelText="Skill 目录（可选）" placeholder="skills/my-skill" value={newSource.skillPath} onChange={event=>setNewSource(current=>({...current,skillPath:event.currentTarget.value}))}/>
   </div>
   <Button kind="primary" disabled={busy!==''||!newSource.repositoryUrl.trim()} onClick={()=>void add()}>{busy==='__new__'?'正在拉取并登记…':'新增并拉取配置'}</Button>
  </div>
  <div className="tp-settings__editor">
   <h3>Skills 注册表 <Tag type="cool-gray">{skills.length} 项</Tag></h3>
   {loading?<InlineLoading description="正在读取 Skill 注册表…"/>:skills.length===0?<p>尚无 Skill 记录。可以从 GitHub 新增第一个 Skill。</p>:<div className="tp-settings__section-layout">
    {skills.map(skill=>{
     const draft=drafts[skill.id]??{repositoryUrl:'',branch:'main',skillPath:''};
     return <section key={skill.id} className="tp-settings__editor">
      <div className="tp-ai-control__skill-heading">
       <div><h4>{skill.label}</h4><p><code>{skill.id}</code> · {skill.description}</p></div>
       <div className="tp-ai-control__skill-actions">{stateTag(skill.state)}{skill.sourceType==='custom'?<Tag type="purple">自定义</Tag>:<Tag type="cool-gray">初始清单</Tag>}</div>
      </div>
      <div className="tp-settings__editor-grid">
       <TextInput id={'skill-repo-'+skill.id} labelText="GitHub 仓库 / Skill 目录 URL" placeholder="https://github.com/owner/repo/tree/main/skills/name" value={draft.repositoryUrl} onChange={event=>change(skill.id,'repositoryUrl',event.currentTarget.value)}/>
       <TextInput id={'skill-branch-'+skill.id} labelText="分支（可选）" value={draft.branch} onChange={event=>change(skill.id,'branch',event.currentTarget.value)}/>
       <TextInput id={'skill-path-'+skill.id} labelText="Skill 目录（可选）" placeholder="skills/name" value={draft.skillPath} onChange={event=>change(skill.id,'skillPath',event.currentTarget.value)}/>
      </div>
      {skill.state==='synced'&&<p>已同步：{String(skill.config.syncedAt??'')} · {String((skill.config.manifest as Record<string,unknown>|undefined)?.version??'未声明版本')}</p>}
      <div className="tp-ai-control__skill-actions">
       <Button kind="tertiary" size="sm" disabled={busy!==''||!draft.repositoryUrl.trim()} onClick={()=>void save(skill.id)}>保存来源</Button>
       <Button kind="primary" size="sm" disabled={busy!==''||!draft.repositoryUrl.trim()} onClick={()=>void sync(skill.id)}>{busy===skill.id?'正在拉取…':'重新拉取配置'}</Button>
      </div>
     </section>;
    })}
   </div>}
  </div>
 </div>;
}
