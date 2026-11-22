import { useEffect, useMemo, useState } from 'react';
import { Link, PageHeader, Tag, Tile, TpDataTable, InlineNotification, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Run = { id:string; task_code?:string; query?:string; countries?:string[]; state?:string|null; city?:string|null; status?:string; progress?:number; discovered_count?:number; created_lead_count?:number; message?:string; created_at?:string; providers?:string[]; channel?:string };
const statusLabel=(status?:string)=>({queued:'排队中',running:'执行中',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消'}[status||'']||status||'未知');
const statusType=(status?:string):'green'|'blue'|'red'|'gray'=>status==='completed'?'green':status==='failed'?'red':['queued','running'].includes(status||'')?'blue':'gray';
const formatTime=(value?:string)=>value?new Date(value).toLocaleString('zh-TW',{hour12:false}):'—';

export function GoogleMapsTaskCenterPage(){
 const [runs,setRuns]=useState<Run[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const db=await getSupabaseClient();
    const {data,error}=await db.from('discovery_runs').select('*').eq('channel','map_local_businesses').contains('providers',['google_maps']).order('created_at',{ascending:false}).limit(300);
    if(error)throw error;
    if(active)setRuns((data??[]) as Run[]);
   }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Google Maps 任务读取失败。');}
   finally{if(active)setLoading(false);}
  };
  void load();
  const timer=window.setInterval(()=>void load(),5000);
  return()=>{active=false;window.clearInterval(timer);};
 },[reload]);
 const active=runs.filter(run=>['queued','running','planned'].includes(run.status||'')).length;
 const completed=runs.filter(run=>run.status==='completed').length;
 const failed=runs.filter(run=>run.status==='failed').length;
 const columns=useMemo(()=>[
  {key:'task_code',header:'任务编号',primary:true,minWidth:160,render:(r:Run)=><strong>{r.task_code||r.id.slice(0,8)}</strong>},
  {key:'query',header:'搜索关键词',minWidth:180,render:(r:Run)=>r.query||'—'},
  {key:'market',header:'搜索地址',minWidth:200,render:(r:Run)=>[r.city,r.state,(r.countries||[]).join(', ')].filter(Boolean).join(' · ')||'—'},
  {key:'status',header:'任务状态',minWidth:110,render:(r:Run)=><Tag type={statusType(r.status)}>{statusLabel(r.status)}</Tag>},
  {key:'progress',header:'进度',minWidth:140,render:(r:Run)=><div className="tp-gmaps-task-center__progress"><b>{r.progress??0}%</b><span><i style={{width:Math.max(0,Math.min(100,r.progress??0))+'%'}}/></span></div>},
  {key:'discovered_count',header:'发现数量',minWidth:100,render:(r:Run)=>(r.discovered_count??0).toLocaleString()},
  {key:'created_at',header:'创建时间',minWidth:160,render:(r:Run)=>formatTime(r.created_at)}
 ],[]);
 return <main className="tp-gmaps-task-center">
  <PageHeader className="tp-gmaps-task-center__header"><div><p>TRADEPILOT / GOOGLE MAPS</p><h1>Google Maps 发现任务中心</h1><p>集中管理 Google Maps 搜索任务、执行进度与采集结果。</p></div><div><Link href="/prospect-discovery/google-maps" renderIcon={semanticIcons.add}>创建发现任务</Link>　<Link href="/prospect-discovery/google-maps/customers" renderIcon={semanticIcons.database}>发现客户</Link></div></PageHeader>
  {error&&<InlineNotification kind="error" lowContrast title="任务读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  <section className="tp-gmaps-task-center__cards">
   <div className="tp-gmaps-task-center__card"><span>Google Maps 任务总数</span><strong>{runs.length}</strong></div>
   <div className="tp-gmaps-task-center__card"><span>执行中 / 排队中</span><strong>{active}</strong></div>
   <div className="tp-gmaps-task-center__card"><span>已完成</span><strong>{completed}</strong></div>
   <div className="tp-gmaps-task-center__card"><span>失败</span><strong>{failed}</strong></div>
  </section>
  <Tile className="tp-gmaps-task-center__panel">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',marginBottom:'1rem'}}><div><h2>Google Maps 发现任务</h2><p>按创建时间倒序；点击任务进入详情和执行日志。</p></div><Tag type="blue">{runs.length} 条</Tag></div>
   <TpDataTable ariaLabel="Google Maps 发现任务列表" rowKey="id" rows={runs as (Run & Record<string,unknown>)[]} columns={columns as any} loading={loading} error={error||null} onRetry={()=>setReload(v=>v+1)} columnSettingsKey="google-maps-task-center" rowActions={[{key:'detail',label:'查看任务详情与日志',onClick:(run:Run)=>{window.location.assign('/prospect-history/'+run.id);}}]} emptyState={<p className="tp-gmaps-task-center__empty">暂无 Google Maps 发现任务。创建任务后会自动出现在这里。</p>}/>
  </Tile>
 </main>;
}
