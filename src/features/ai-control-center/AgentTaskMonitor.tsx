import { useEffect, useState } from 'react';
import { Button, ContainedList, ContainedListItem, InlineLoading, InlineNotification, Tag } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Run = { id:string; agent_key:string; goal:string; status:string; plan?:Record<string,unknown>; result?:Record<string,unknown>; error_message?:string; estimated_cost_usd?:number; actual_cost_usd?:number; created_at:string; updated_at:string };
type RunDetail = { run:Run; discoveryRun?:{status:string;progress:number;message:string;discovered_count:number}|null; events:Array<{id:string;event_type:string;message:string;created_at:string}>; logs:Array<{id:string;level:string;message:string;created_at:string}>; records:Array<Record<string,unknown>> };
async function taskRequest<T>(path:string):Promise<T>{
  const client=await getSupabaseClient();const {data}=await client.auth.getSession();
  if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
  const response=await fetch(path,{headers:{Authorization:'Bearer '+data.session.access_token}});
  const payload=await response.json() as {data?:T;error?:{message?:string}};
  if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'读取 Agent 任务失败。');
  return payload.data as T;
}
const statusText:Record<string,string>={queued:'排队中',planned:'待执行',running:'执行中',awaiting_approval:'等待审批',succeeded:'已完成',completed:'已完成',failed:'失败',cancelled:'已取消'};
function runStatus(status:string){const kind=status==='succeeded'||status==='completed'?'green':status==='failed'?'red':status==='running'?'blue':'cool-gray';return <Tag type={kind}>{statusText[status]||status}</Tag>;}

export function AgentTaskMonitor(){
  const [runs,setRuns]=useState<Run[]>([]);const [detail,setDetail]=useState<RunDetail|null>(null);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const load=async()=>{setLoading(true);setError('');try{setRuns(await taskRequest<Run[]>('/api/v1/agent/runs'));}catch(cause){setError(cause instanceof Error?cause.message:'读取任务失败。');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const openDetail=async(id:string)=>{setBusy(true);setError('');try{setDetail(await taskRequest<RunDetail>('/api/v1/agent/runs/'+id));}catch(cause){setError(cause instanceof Error?cause.message:'读取任务详情失败。');}finally{setBusy(false);}};
  return <div className="tp-settings-agent">
    {error&&<InlineNotification kind="error" title="任务读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <section className="tp-settings__editor">
      <div><h4>Agent 执行任务</h4><p>查看小雅与 Agent 的任务状态、执行事件、日志和结果。任务数据来自现有 Agent Runs 服务。</p></div>
      <Button kind="tertiary" size="md" onClick={()=>void load()} disabled={loading}>刷新任务</Button>
      {loading?<InlineLoading description="正在读取任务记录…"/>:!runs.length?<p>暂无 Agent 执行任务。</p>:<ContainedList kind="on-page" label="最近执行任务" size="md">
        {runs.map(run=><ContainedListItem key={run.id}>
          <div>
            <strong>{run.goal}</strong>
            <p>{run.agent_key} · {new Date(run.created_at).toLocaleString()}</p>
            {runStatus(run.status)}
            <Button kind="tertiary" size="sm" disabled={busy} onClick={()=>void openDetail(run.id)}>查看执行详情</Button>
          </div>
        </ContainedListItem>)}
      </ContainedList>}
    </section>
    {detail&&<section className="tp-settings__editor">
      <div><h4>任务执行详情</h4><p>{detail.run.goal}</p>{runStatus(detail.run.status)}</div>
      {detail.discoveryRun&&<p>{detail.discoveryRun.message} · 进度 {detail.discoveryRun.progress}% · 已发现 {detail.discoveryRun.discovered_count} 条</p>}
      <h5>执行事件</h5>
      {!detail.events.length&&!detail.logs.length?<p>暂无执行事件和日志。</p>:<ContainedList kind="on-page" label="执行事件与日志" size="md">
        {[...detail.events.map(item=>({...item,source:'event'})),...detail.logs.map(item=>({...item,source:'log'}))].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(item=><ContainedListItem key={item.id}>
          <strong>{item.message}</strong><p>{item.source==='event'?'执行事件':'运行日志'} · {new Date(item.created_at).toLocaleString()}</p>
        </ContainedListItem>)}
      </ContainedList>}
      <Button kind="tertiary" size="sm" onClick={()=>setDetail(null)}>关闭详情</Button>
    </section>}
  </div>;
}
