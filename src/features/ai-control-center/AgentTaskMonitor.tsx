import { useEffect, useState } from 'react';
import { ComposedModal, ModalBody, ModalFooter, ModalHeader } from '@carbon/react';
import { Button, ContainedList, ContainedListItem, TPSkeleton, InlineNotification, Tag } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Run = { id:string; agent_key:string; goal:string; status:string; plan?:Record<string,unknown>; result?:Record<string,unknown>; error_message?:string; estimated_cost_usd?:number; actual_cost_usd?:number; created_at:string; updated_at:string };
type RunDetail = { run:Run; discoveryRun?:{status:string;progress:number;message:string;discovered_count:number}|null; events:Array<{id:string;event_type:string;message:string;created_at:string}>; logs:Array<{id:string;level:string;message:string;created_at:string}>; records:Array<Record<string,unknown>> };
async function taskRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  const client=await getSupabaseClient();const {data}=await client.auth.getSession();
  if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
  const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...init.headers}});
  const payload=await response.json() as {data?:T;error?:{message?:string}};
  if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'读取 Agent 任务失败。');
  return payload.data as T;
}
const statusText:Record<string,string>={queued:'排队中',planned:'待执行',running:'执行中',paused:'已暂停',awaiting_approval:'等待审批',succeeded:'已完成',completed:'已完成',failed:'失败',cancelled:'已取消'};
function runStatus(status:string){const kind=status==='succeeded'||status==='completed'?'green':status==='failed'?'red':status==='running'?'blue':'cool-gray';return <Tag type={kind}>{statusText[status]||status}</Tag>;}

export function AgentTaskMonitor(){
  const [runs,setRuns]=useState<Run[]>([]);const [detail,setDetail]=useState<RunDetail|null>(null);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [cancelConfirm,setCancelConfirm]=useState<Run|null>(null);
  const load=async()=>{setLoading(true);setError('');try{setRuns(await taskRequest<Run[]>('/api/v1/agent/runs'));}catch(cause){setError(cause instanceof Error?cause.message:'读取任务失败。');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const runAction=async(id:string,action:'pause'|'resume'|'cancel'|'retry')=>{
    setBusy(true);setError('');setNotice('');
    try{
      await taskRequest<{status:string}>(`/api/v1/agent/runs/${id}/${action}`,{method:'POST'});
      setNotice(action==='pause'?'工作流已暂停。':action==='resume'?'工作流已恢复。':action==='cancel'?'工作流已取消。':'工作流已从头重新启动。');
      await load();
      if(detail?.run.id===id)setDetail(await taskRequest<RunDetail>('/api/v1/agent/runs/'+id));
    }catch(cause){setError(cause instanceof Error?cause.message:'工作流操作失败。');}
    finally{setBusy(false);}
  };
  const openDetail=async(id:string)=>{setBusy(true);setError('');try{setDetail(await taskRequest<RunDetail>('/api/v1/agent/runs/'+id));}catch(cause){setError(cause instanceof Error?cause.message:'读取任务详情失败。');}finally{setBusy(false);}};
  return <div className="tp-settings-agent">
    {error&&<InlineNotification kind="error" title="任务操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}{notice&&<InlineNotification kind="success" title="操作已提交" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    <section className="tp-settings__editor">
      <div><h4>Agent 执行任务</h4><p>查看小雅与 Agent 的任务状态、执行事件、日志和结果。任务数据来自现有 Agent Runs 服务。</p></div>
      <Button kind="tertiary" size="md" onClick={()=>void load()} disabled={loading}>刷新任务</Button>
      {loading?<TPSkeleton variant="table" rows={5}/>:!runs.length?<p>暂无 Agent 执行任务。</p>:<ContainedList kind="on-page" label="最近执行任务" size="md">
        {runs.map(run=><ContainedListItem key={run.id}>
          <div>
            <strong>{run.goal}</strong>
            <p>{run.agent_key} · {new Date(run.created_at).toLocaleString()}</p>
            {runStatus(run.status)}
            <Button kind="tertiary" size="sm" disabled={busy} onClick={()=>void openDetail(run.id)}>查看执行详情</Button>
            {Boolean(run.plan?.workflowId)&&<div className="tp-ai-control__skill-actions">
              {run.status==='running'&&<Button kind="tertiary" size="sm" disabled={busy} onClick={()=>void runAction(run.id,'pause')}>暂停</Button>}
              {run.status==='paused'&&<Button kind="tertiary" size="sm" disabled={busy} onClick={()=>void runAction(run.id,'resume')}>恢复</Button>}
              {['queued','running','paused'].includes(run.status)&&<Button kind="danger--tertiary" size="sm" disabled={busy} onClick={()=>setCancelConfirm(run)}>取消任务</Button>}
              {run.status==='failed'&&<Button kind="tertiary" size="sm" disabled={busy} onClick={()=>void runAction(run.id,'retry')}>从头重试</Button>}
            </div>}
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
    <ComposedModal open={Boolean(cancelConfirm)} onClose={()=>setCancelConfirm(null)} size="sm">
      <ModalHeader title="取消 Agent 任务？" />
      <ModalBody>
        <p>确定取消以下任务吗？任务取消后，当前执行流程将终止。</p>
        <p><strong>{cancelConfirm?.goal}</strong></p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={()=>setCancelConfirm(null)}>继续执行</Button>
        <Button kind="danger" disabled={busy} onClick={()=>{const run=cancelConfirm;setCancelConfirm(null);if(run)void runAction(run.id,'cancel');}}>确认取消任务</Button>
      </ModalFooter>
    </ComposedModal>
  </div>;
}
