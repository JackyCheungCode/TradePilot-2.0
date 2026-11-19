import { useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Skill = { id:string; label:string; description:string; state:'pending'|'configured'|'synced'; enabled:boolean; config:Record<string,unknown> };
type Draft = { repositoryUrl:string; branch:string; skillPath:string };
async function skillRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const client=await getSupabaseClient();const {data}=await client.auth.getSession();
 if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json() as {data?:T;error?:{message?:string}};
 if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'Skill 管理请求失败。');
 return payload.data as T;
}
const initialSkills=[
 ['market-intel','全球市场情报','市场规模、趋势、竞品与价格研究'],
 ['trade-lead-screening','贸易线索筛选','买家线索评分、去重与优先级筛选'],
 ['trade-customer-intel','贸易客户情报','企业背景调查、客户画像与采购能力分析'],
 ['trade-outreach-email','贸易开发邮件','开发信、跟进邮件与多语言沟通内容'],
 ['laifaxin-outreach','来发信触达','通过来发信平台执行邮件触达'],
 ['tradehot','热门产品趋势','热门产品、热销信号与趋势发现'],
 ['rfq-to-quotation','询盘转报价','解析 RFQ、匹配产品并生成报价草案'],
 ['trade-pipeline-run','外贸流程编排','协调外贸业务阶段与任务执行'],
 ['verify-docs','贸易单证核验','贸易单证字段、逻辑与一致性检查'],
 ['seo-audit','SEO 审核','网站技术 SEO、内容与搜索表现审计'],
] as const;
function stateTag(state:Skill['state']){
 if(state==='synced')return <Tag type="green">已同步配置</Tag>;
 if(state==='configured')return <Tag type="blue">已填写来源</Tag>;
 return <Tag type="cool-gray">待配置</Tag>;
}
export function SkillsRegistry(){
 const [skills,setSkills]=useState<Skill[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
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
   const result=await skillRequest<{manifest:{name:string;description:string;version?:string};source:{owner:string;repo:string;ref:string;path:string}}>('/api/v1/agent/skills/'+id+'/sync',{method:'POST',body:'{}'});
   setNotice(id+'：已从 GitHub 拉取并校验 SKILL.md（'+result.source.owner+'/'+result.source.repo+'）。');await load();
  }catch(cause){setError(cause instanceof Error?cause.message:'拉取 Skill 配置失败。');}
  finally{setBusy('');}
 };
 return <div className="tp-settings-agent">
  <InlineNotification kind="info" lowContrast title="预置 Skill 清单" subtitle="十个 Skill 已作为待配置条目保留。填写 GitHub 仓库或 Skill 目录地址后保存，再执行“拉取配置”；系统会读取 SKILL.md、校验 name 与预置标识并保存版本内容。未同步的 Skill 不会被 Agent 调用。" />
  {error&&<InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="操作完成" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  {loading?<InlineLoading description="正在读取 Skill 注册表…"/>:<div className="tp-settings__editor">
   <h4>Skills 注册表 <Tag type="cool-gray">{skills.length||initialSkills.length} 项</Tag></h4>
   <p>当前阶段支持公开 GitHub 仓库。仓库可填写根地址，也可填写指向具体 Skill 目录的 /tree/分支/目录 地址。</p>
   <div className="tp-settings__section-layout">
    {initialSkills.map(([id,label,description])=>{
     const skill=skills.find(row=>row.id===id);
     const draft=drafts[id]??{repositoryUrl:'',branch:'main',skillPath:''};
     return <section key={id} className="tp-settings__editor">
      <div className="tp-ai-control__skill-heading">
       <div><h4>{label}</h4><p><code>{id}</code> · {description}</p></div>
       {stateTag(skill?.state??'pending')}
      </div>
      <div className="tp-settings__editor-grid">
       <TextInput id={'skill-repo-'+id} labelText="GitHub 仓库 / Skill 目录 URL" placeholder="https://github.com/owner/repo/tree/main/skills/market-intel" value={draft.repositoryUrl} onChange={event=>change(id,'repositoryUrl',event.currentTarget.value)}/>
       <TextInput id={'skill-branch-'+id} labelText="分支（可选）" value={draft.branch} onChange={event=>change(id,'branch',event.currentTarget.value)} />
       <TextInput id={'skill-path-'+id} labelText="Skill 目录（可选）" placeholder="skills/market-intel" value={draft.skillPath} onChange={event=>change(id,'skillPath',event.currentTarget.value)}/>
      </div>
      {skill?.state==='synced'&&<p>已同步：{String(skill.config.syncedAt??'')} · {String((skill.config.manifest as Record<string,unknown>|undefined)?.description??'')}</p>}
      <div className="tp-ai-control__skill-actions">
       <Button kind="tertiary" size="sm" disabled={busy===id||!draft.repositoryUrl.trim()} onClick={()=>void save(id)}>{busy===id?'处理中…':'保存来源'}</Button>
       <Button kind="primary" size="sm" disabled={busy===id||!draft.repositoryUrl.trim()} onClick={()=>void sync(id)}>{busy===id?'正在拉取…':'拉取配置'}</Button>
      </div>
     </section>;
    })}
   </div>
  </div>}
 </div>;
}
