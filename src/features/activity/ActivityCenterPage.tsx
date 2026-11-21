import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader, Button, InlineNotification, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Task={id:string;record_type:string;record_id:string;title:string;activity_type:string;priority:string;status:string;due_at:string|null;created_at:string};
type Activity={id:string;record_type:string;record_id:string;activity_type:string;body:string;created_at:string};
const routes:Record<string,string>={crm_accounts:'accounts',crm_contacts:'contacts',crm_opportunities:'opportunities',trade_documents:'quotes',trade_orders:'sales-orders',trade_shipments:'shipments',trade_payments:'payments',trade_products:'products'};

export function ActivityCenterPage(){
 const [tasks,setTasks]=useState<Task[]>([]);const [activities,setActivities]=useState<Activity[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{const db=await getSupabaseClient();const [t,a]=await Promise.all([db.from('record_activity_tasks').select('id,record_type,record_id,title,activity_type,priority,status,due_at,created_at').order('due_at',{ascending:true}).limit(200),db.from('record_activities').select('id,record_type,record_id,activity_type,body,created_at').order('created_at',{ascending:false}).limit(100)]);if(t.error)throw t.error;if(a.error)throw a.error;if(active){setTasks((t.data||[]) as Task[]);setActivities((a.data||[]) as Activity[]);}}catch(e){if(active)setError(e instanceof Error?e.message:'读取跟进中心失败')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 const routeFor=(type:string,id:string)=>routes[type]?'/'+routes[type]+'/'+id:null;
 return <main className="tp-activity-center"><PageHeader><div><p className="tp-activity__eyebrow">TRADEPILOT / WORK MANAGEMENT</p><h1>跟进与活动中心</h1><p>集中查看跨业务记录的待办、沟通和最近动态。</p></div><Button kind="tertiary" renderIcon={semanticIcons.refresh} onClick={()=>window.location.reload()}>刷新</Button></PageHeader>
 {error&&<InlineNotification kind="error" title="读取失败" subtitle={error}/>}
 <div className="tp-activity-center__metrics"><article><span>待处理活动</span><strong>{tasks.filter(t=>t.status==='open').length}</strong></article><article><span>已逾期待办</span><strong>{tasks.filter(t=>t.status==='open'&&t.due_at&&new Date(t.due_at).getTime()<Date.now()).length}</strong></article><article><span>近期动态</span><strong>{activities.length}</strong></article></div>
 <section className="tp-activity-center__section"><h2>我的待办与全部活动</h2>{loading?<p>正在读取…</p>:tasks.length===0?<p>目前没有待办任务。</p>:tasks.map(task=><RouterLink className="tp-activity-center__row" key={task.id} to={routeFor(task.record_type,task.record_id)||'/activities'}><span><strong>{task.title}</strong><small>{task.record_type} · {task.due_at?new Date(task.due_at).toLocaleString():'无截止时间'}</small></span><span>{task.status==='open'?'待处理':task.status==='done'?'已完成':'已取消'}</span></RouterLink>)}</section>
 <section className="tp-activity-center__section"><h2>最近活动</h2>{activities.map(item=><RouterLink className="tp-activity-center__row" key={item.id} to={routeFor(item.record_type,item.record_id)||'/activities'}><span><strong>{item.activity_type==='note'?'内部备注':'消息'} · {item.body.slice(0,120)}</strong><small>{item.record_type} · {new Date(item.created_at).toLocaleString()}</small></span><span>查看记录</span></RouterLink>)}</section>
 </main>
}
