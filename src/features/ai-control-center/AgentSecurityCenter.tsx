import { useEffect, useState } from 'react';
import { Button, ContainedList, ContainedListItem, TPSkeleton, InlineNotification, Tag, TextArea } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Approval={id:string;run_id:string;action_type:string;status:string;operation_snapshot:unknown;decision_note:string|null;decided_at:string|null;expires_at:string;created_at:string};
async function approvalRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const client=await getSupabaseClient();const {data}=await client.auth.getSession();
 if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const response=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const payload=await response.json() as {data?:T;error?:{message?:string}};
 if(!response.ok||!('data'in payload))throw new Error(payload.error?.message||'审批请求失败。');
 return payload.data as T;
}
const actionLabels:Record<string,string>={send_email:'发送邮件',bulk_import:'批量导入',bulk_update:'批量更新',delete_records:'删除记录',merge_records:'合并记录'};
function approvalStatus(status:string){const type=status==='pending'?'warm-gray':status==='executed'?'green':status==='rejected'?'red':'cool-gray';return <Tag type={type}>{status==='pending'?'待审批':status==='executed'?'已执行':status==='rejected'?'已拒绝':status}</Tag>;}

export function AgentSecurityCenter(){
 const [items,setItems]=useState<Approval[]>([]);const [notes,setNotes]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);const [busyId,setBusyId]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setItems(await approvalRequest<Approval[]>('/api/v1/agent/approvals'));}catch(cause){setError(cause instanceof Error?cause.message:'读取审批记录失败。');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const decide=async(item:Approval,decision:'approve'|'reject')=>{
  setBusyId(item.id);setError('');setNotice('');
  try{
   const result=await approvalRequest<{status:string}>('/api/v1/agent/approvals/'+item.id+'/decision',{method:'POST',body:JSON.stringify({decision,note:notes[item.id]||''})});
   setNotice(decision==='approve'?'审批已通过，系统已执行对应操作。':'已拒绝该操作，关联任务已取消。');
   setItems(rows=>rows.map(row=>row.id===item.id?{...row,status:result.status,decision_note:notes[item.id]||null,decided_at:new Date().toISOString()}:row));
  }catch(cause){setError(cause instanceof Error?cause.message:'审批操作失败。');}
  finally{setBusyId('');}
 };
 const pending=items.filter(item=>item.status==='pending');
 return <div className="tp-settings-agent">
  {error&&<InlineNotification kind="error" title="安全操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="审批处理完成" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <section className="tp-settings__editor">
   <div><h4>人工审批队列 <Tag type="cool-gray">{pending.length} 待处理</Tag></h4><p>高风险外部工具调用必须经过人工审批。审批时会校验操作快照，连接或工具定义发生变化时将阻止执行。</p></div>
   <Button kind="tertiary" size="md" onClick={()=>void load()} disabled={loading}>刷新审批</Button>
   {loading?<TPSkeleton variant="table" rows={5}/>:!items.length?<p>暂无审批记录。</p>:<ContainedList kind="on-page" label="Agent 操作审批" size="md">
    {items.map(item=><ContainedListItem key={item.id}>
     <div>
      <strong>{actionLabels[item.action_type]||item.action_type}</strong> {approvalStatus(item.status)}
      <p>任务编号：{item.run_id}</p>
      <p>提交时间：{new Date(item.created_at).toLocaleString()} · 到期时间：{new Date(item.expires_at).toLocaleString()}</p>
      <pre>{JSON.stringify(item.operation_snapshot,null,2)}</pre>
      {item.status==='pending'?<>
       <TextArea id={'approval-note-'+item.id} labelText="审批备注（可选）" rows={2} value={notes[item.id]||''} onChange={event=>setNotes(rows=>({...rows,[item.id]:event.currentTarget.value}))}/>
       <Button kind="primary" size="sm" disabled={busyId===item.id} onClick={()=>void decide(item,'approve')}>{busyId===item.id?'处理中…':'批准并执行'}</Button>
       <Button kind="tertiary" size="sm" disabled={busyId===item.id} onClick={()=>void decide(item,'reject')}>拒绝</Button>
      </>:item.decision_note&&<p>处理备注：{item.decision_note}</p>}
     </div>
    </ContainedListItem>)}
   </ContainedList>}
  </section>
 </div>;
}
