import { useEffect, useMemo, useState } from 'react';
import { Link, PageHeader, Tag, Tile, TpDataTable, InlineNotification, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Run = { id:string; task_code?:string; query?:string; countries?:string[]; state?:string|null; city?:string|null; status?:string; progress?:number; discovered_count?:number; created_lead_count?:number; message?:string; created_at?:string; providers?:string[]; channel?:string; hidden_at?:string|null };
const statusLabel=(status?:string)=>({queued:'排队中',running:'执行中',paused:'已暂停',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消'}[status||'']||status||'未知');
const statusType=(status?:string):'green'|'blue'|'red'|'gray'=>['completed','partial'].includes(status||'')?'green':status==='failed'?'red':['queued','running'].includes(status||'')?'blue':'gray';
const formatTime=(value?:string)=>value?new Date(value).toLocaleString('zh-TW',{hour12:false}):'—';

async function api(path:string,init:RequestInit={}){
 const client=await getSupabaseClient();
 const {data}=await client.auth.getSession();
 const token=data.session?.access_token;
 if(!token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json().catch(()=>({})) as {data?:unknown;error?:{message?:string}};
 if(!response.ok)throw new Error(payload.error?.message||'任务操作失败（HTTP '+response.status+'）');
 return payload.data??payload;
}

export function GoogleMapsTaskCenterPage(){
 const [runs,setRuns]=useState<Run[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const db=await getSupabaseClient();
    const {data,error}=await db.from('discovery_runs').select('*').eq('channel','map_local_businesses').contains('providers',['google_maps']).is('hidden_at',null).order('created_at',{ascending:false}).limit(300);
    if(error)throw error;
    if(active)setRuns((data??[]) as Run[]);
   }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Google Maps 任务读取失败。');}
   finally{if(active)setLoading(false);}
  };
  void load();
  const timer=window.setInterval(()=>void load(),5000);
  return()=>{active=false;window.clearInterval(timer);};
 },[reload]);
 const active=runs.filter(run=>['queued','running'].includes(run.status||'')).length;
 const paused=runs.filter(run=>run.status==='paused').length;
 const completed=runs.filter(run=>['completed','partial'].includes(run.status||'')).length;
 const failed=runs.filter(run=>run.status==='failed').length;
 const runAction=async(selected:Run[],action:'pause'|'resume'|'cancel'|'remove')=>{
  if(!selected.length||busy)return;
  const eligible=selected.filter(run=>action==='pause'?run.status==='running':action==='resume'?run.status==='paused':action==='cancel'?['queued','running','paused'].includes(run.status||''):true);
  if(!eligible.length){setNotice('所选任务没有符合该操作状态的记录。');return;}
  if(action==='cancel'&&!window.confirm('确定取消选中的 '+eligible.length+' 个任务？已采集结果会保留。'))return;
  if(action==='remove'&&!window.confirm('确定从任务中心移除选中的 '+eligible.length+' 个任务？只隐藏任务记录，不删除已发现客户。'))return;
  setBusy(true);let succeeded=0;const errors:string[]=[];
  for(const run of eligible){
   try{await api('/api/v1/discovery-runs/'+run.id+'/action',{method:'POST',body:JSON.stringify({action})});succeeded++;}
   catch(cause){errors.push((run.task_code||run.id.slice(0,8))+': '+(cause instanceof Error?cause.message:'操作失败'));}
  }
  setNotice(({'pause':'暂停','resume':'恢复','cancel':'取消','remove':'移除'} as const)[action]+'完成：成功 '+succeeded+' 项，失败 '+errors.length+' 项。'+(errors.length?' '+errors.slice(0,3).join('；'):''));
  setBusy(false);setReload(v=>v+1);
 };
 const columns=useMemo(()=>[
  {key:'task_code',header:'任务编号',primary:true,minWidth:160,render:(r:Run)=><strong>{r.task_code||r.id.slice(0,8)}</strong>},
  {key:'query',header:'搜索关键词',minWidth:180,render:(r:Run)=>r.query||'—'},
  {key:'market',header:'搜索地址',minWidth:200,render:(r:Run)=>[r.city,r.state,(r.countries||[]).join(', ')].filter(Boolean).join(' · ')||'—'},
  {key:'status',header:'任务状态',minWidth:110,render:(r:Run)=><Tag type={statusType(r.status)}>{statusLabel(r.status)}</Tag>},
  {key:'progress',header:'进度',minWidth:140,render:(r:Run)=><div className="tp-gmaps-task-center__progress"><b>{r.progress??0}%</b><progress max={100} value={Math.max(0,Math.min(100,r.progress??0))}/></div>},
  {key:'discovered_count',header:'发现数量',minWidth:100,render:(r:Run)=>(r.discovered_count??0).toLocaleString()},
  {key:'created_at',header:'创建时间',minWidth:160,render:(r:Run)=>formatTime(r.created_at)}
 ],[]);
 return <main className="tp-gmaps-task-center">
  <PageHeader className="tp-gmaps-task-center__header"><div><p>TRADEPILOT / GOOGLE MAPS</p><h1>Google Maps 任务中心</h1><p>集中管理 Google Maps 搜索任务、执行进度与采集结果。</p></div><div className="tp-gmaps-task-center__actions"><Link href="/prospect-discovery/google-maps" renderIcon={semanticIcons.add}>创建发现任务</Link><Link href="/prospect-discovery/google-maps/customers" renderIcon={semanticIcons.database}>发现客户</Link></div></PageHeader>
  {error&&<InlineNotification kind="error" lowContrast title="任务读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="info" lowContrast title="批量操作结果" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <section className="tp-gmaps-task-center__cards">
   <div className="tp-gmaps-task-center__card"><div className="tp-gmaps-task-center__card-icon"><semanticIcons.task size={20}/></div><div><span>任务总数</span><strong>{runs.length}</strong></div></div>
   <div className="tp-gmaps-task-center__card"><div className="tp-gmaps-task-center__card-icon"><semanticIcons.activity size={20}/></div><div><span>执行中 / 排队中</span><strong>{active}</strong></div></div>
   <div className="tp-gmaps-task-center__card"><div className="tp-gmaps-task-center__card-icon"><semanticIcons.pause size={20}/></div><div><span>已暂停</span><strong>{paused}</strong></div></div>
   <div className="tp-gmaps-task-center__card"><div className="tp-gmaps-task-center__card-icon"><semanticIcons.check size={20}/></div><div><span>已完成</span><strong>{completed}</strong></div></div>
  </section>
  <Tile className="tp-gmaps-task-center__panel">
   <div className="tp-gmaps-task-center__panel-heading"><div><h2>Google Maps 发现任务</h2><p>选择多条任务后，可批量暂停、恢复、取消或移除。</p></div><Tag type="blue">{runs.length} 条 · {failed} 项失败</Tag></div>
   <TpDataTable ariaLabel="Google Maps 发现任务列表" rowKey="id" rows={runs as (Run & Record<string,unknown>)[]} columns={columns as any} selectable batchActions={[
    {key:'pause-selected',label:'暂停所选',disabled:busy,onClick:(selected:Run[])=>void runAction(selected,'pause')},
    {key:'resume-selected',label:'恢复所选',disabled:busy,onClick:(selected:Run[])=>void runAction(selected,'resume')},
    {key:'cancel-selected',label:'取消所选',disabled:busy,onClick:(selected:Run[])=>void runAction(selected,'cancel')},
    {key:'remove-selected',label:'移除所选',disabled:busy,onClick:(selected:Run[])=>void runAction(selected,'remove')}
   ]} loading={loading||busy} error={error||null} onRetry={()=>setReload(v=>v+1)} columnSettingsKey="google-maps-task-center" rowActions={[
    {key:'pause',label:'暂停任务',onClick:(run:Run)=>void runAction([run],'pause')},
    {key:'resume',label:'恢复任务',onClick:(run:Run)=>void runAction([run],'resume')},
    {key:'cancel',label:'取消任务',confirmation:'确定取消此任务？已采集结果会保留。',onClick:(run:Run)=>void runAction([run],'cancel')},
    {key:'remove',label:'从任务中心移除',confirmation:'只隐藏任务，不删除客户数据。确定移除？',onClick:(run:Run)=>void runAction([run],'remove')},
    {key:'detail',label:'查看任务详情与日志',onClick:(run:Run)=>{window.location.assign('/prospect-history/'+run.id);}}
   ]} emptyState={<p className="tp-gmaps-task-center__empty">暂无 Google Maps 发现任务。创建任务后会自动出现在这里。</p>}/>
  </Tile>
 </main>;
}
