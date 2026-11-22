import { useCallback,useEffect,useMemo,useState } from 'react';
import { PageHeader,Button,Tag,InlineNotification,TpDataTable,Select,SelectItem } from '@/design-system';
import type { TpTableColumn } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/intelligence-monitoring.scss';

type LogRow={id:string;run_id:string;task_id:string;level:string;event:string;message:string;created_at:string;task_name?:string;run_status?:string};
const date=(v:string)=>new Date(v).toLocaleString('zh-TW',{hour12:false});
const levelLabel=(v:string)=>v==='error'?'错误':v==='warning'?'警告':v==='debug'?'调试':'信息';
export function MonitoringLogsPage(){
 const [rows,setRows]=useState<LogRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[level,setLevel]=useState('all');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const client=await getSupabaseClient();
   const {data:auth,error:authError}=await client.auth.getUser();if(authError)throw authError;if(!auth.user)throw new Error('请先登录。');
   const {data:logs,error:logsError}=await client.from('monitoring_run_logs').select('id,run_id,task_id,level,event,message,created_at').order('created_at',{ascending:false}).limit(500);
   if(logsError)throw logsError;
   const taskIds=[...new Set((logs??[]).map(x=>x.task_id))],runIds=[...new Set((logs??[]).map(x=>x.run_id))];
   const [tasks,runs]=await Promise.all([
    taskIds.length?client.from('monitoring_tasks').select('id,name').in('id',taskIds):Promise.resolve({data:[],error:null}),
    runIds.length?client.from('monitoring_runs').select('id,status').in('id',runIds):Promise.resolve({data:[],error:null})
   ]);
   if(tasks.error)throw tasks.error;if(runs.error)throw runs.error;
   const taskMap=new Map((tasks.data??[]).map(x=>[x.id,x.name])),runMap=new Map((runs.data??[]).map(x=>[x.id,x.status]));
   setRows((logs??[]).map(x=>({...x,task_name:taskMap.get(x.task_id)??'已删除任务',run_status:runMap.get(x.run_id)??'unknown'})));
  }catch(e){setError(e instanceof Error?e.message:'读取监听日志失败');setRows([]);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const filtered=useMemo(()=>rows.filter(x=>(level==='all'||x.level===level)&&[x.task_name,x.event,x.message,x.run_id,x.run_status].join(' ').toLowerCase().includes(search.toLowerCase())),[rows,level,search]);
 const columns:TpTableColumn<LogRow>[]=[
  {key:'created_at',header:'发生时间',required:true,minWidth:180,render:r=>date(r.created_at)},
  {key:'level',header:'级别',required:true,render:r=><Tag type={r.level==='error'?'red':r.level==='warning'?'warm-gray':r.level==='debug'?'cool-gray':'blue'}>{levelLabel(r.level)}</Tag>},
  {key:'task_name',header:'监听任务',required:true,minWidth:160},
  {key:'event',header:'事件',minWidth:150},
  {key:'message',header:'执行日志',required:true,longText:true,minWidth:320},
  {key:'run_status',header:'运行结果',render:r=><Tag type={r.run_status==='succeeded'?'green':r.run_status==='failed'?'red':r.run_status==='partial'?'warm-gray':'blue'}>{r.run_status==='succeeded'?'成功':r.run_status==='failed'?'失败':r.run_status==='partial'?'部分成功':r.run_status==='running'?'执行中':r.run_status}</Tag>},
  {key:'run_id',header:'运行编号',longText:true,defaultVisible:false}
 ];
 return <main className="tp-intelligence-monitoring">
  <PageHeader breadcrumb="全球情报 / 公开内容监听" title="监听日志控制台" description="实时追踪定时触发、Actor 执行、数据入库、AI 分析及每次运行的成功、部分成功或失败结果。"/>
  <nav className="tp-intelligence-monitoring__navigation" aria-label="情报监听导航">
   <Button kind="tertiary" href="/intelligence-monitoring">创建任务</Button><Button kind="tertiary" href="/intelligence-monitoring/tasks">任务列表</Button><Button kind="tertiary" href="/intelligence-monitoring/results">结果中心</Button><Button kind="primary" href="/intelligence-monitoring/logs">日志控制台</Button>
  </nav>
  {error&&<InlineNotification kind="error" lowContrast title="日志读取失败" subtitle={error} actions={<Button kind="tertiary" size="sm" onClick={()=>void load()}>重试</Button>}/>}
  <div className="tp-intelligence-monitoring__table-meta"><Tag type="blue">持久化执行日志</Tag><span>最近 500 条 · 自动记录每次定时运行结果</span><Button kind="tertiary" size="sm" onClick={()=>void load()}>刷新日志</Button></div>
  <TpDataTable<LogRow> ariaLabel="监听日志控制台" columns={columns} rows={filtered} rowKey="id" loading={loading} searchValue={search} onSearchChange={setSearch} onRetry={()=>void load()} emptyState="暂无执行日志。任务进入运行状态后，Cron 将按计划记录每次执行结果。" columnSettingsKey="intelligence-monitoring-logs" toolbarActions={<div className="tp-intelligence-monitoring__filters"><Select id="monitoring-log-level" labelText="日志级别" size="sm" value={level} onChange={e=>setLevel(e.currentTarget.value)}><SelectItem value="all" text="全部级别"/><SelectItem value="info" text="信息"/><SelectItem value="warning" text="警告"/><SelectItem value="error" text="错误"/><SelectItem value="debug" text="调试"/></Select></div>}/>
 </main>;
}
