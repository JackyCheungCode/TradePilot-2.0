import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, InlineNotification, TextArea, TextInput, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/activity.scss';

type Activity = { id:string; activity_type:'note'|'message'|'comment'; visibility:'internal'|'external'; body:string; created_by:string|null; created_at:string; edited_at:string|null };
type AuditEvent = { id:number; event_type:'created'|'updated'|'deleted'; actor_id:string|null; field_changes:Record<string,{old:unknown;new:unknown}>; created_at:string };
type ActivityTask = { id:string; title:string; description:string|null; activity_type:string; priority:string; status:'open'|'done'|'cancelled'; due_at:string|null; assigned_to:string|null; created_at:string };

const dateTime=(value:string)=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const valueText=(value:unknown)=>value===null?'（空）':typeof value==='object'?JSON.stringify(value):String(value);

export function RecordActivityPanel({recordType,recordId,recordLabel}:{recordType:string;recordId:string;recordLabel?:string}) {
  const [activities,setActivities]=useState<Activity[]>([]);
  const [audits,setAudits]=useState<AuditEvent[]>([]);
  const [tasks,setTasks]=useState<ActivityTask[]>([]);
  const [body,setBody]=useState('');
  const [taskTitle,setTaskTitle]=useState('');
  const [taskDue,setTaskDue]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [userId,setUserId]=useState('');
  const [following,setFollowing]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const db=await getSupabaseClient();
      const [{data:session},{data:a,error:ae},{data:h,error:he},{data:t,error:te}]=await Promise.all([
        db.auth.getSession(),
        db.from('record_activities').select('id,activity_type,visibility,body,created_by,created_at,edited_at').eq('record_type',recordType).eq('record_id',recordId).order('created_at',{ascending:false}).limit(100),
        db.from('record_audit_events').select('id,event_type,actor_id,field_changes,created_at').eq('record_type',recordType).eq('record_id',recordId).order('created_at',{ascending:false}).limit(100),
        db.from('record_activity_tasks').select('id,title,description,activity_type,priority,status,due_at,assigned_to,created_at').eq('record_type',recordType).eq('record_id',recordId).order('created_at',{ascending:false}).limit(100),
      ]);
      if(ae)throw ae;if(he)throw he;if(te)throw te;
      const currentUser=session.session?.user.id||'';
      setUserId(currentUser);setActivities((a||[]) as Activity[]);setAudits((h||[]) as AuditEvent[]);setTasks((t||[]) as ActivityTask[]);
      if(currentUser){const {data:f,error:fe}=await db.from('record_followers').select('user_id').eq('record_type',recordType).eq('record_id',recordId).eq('user_id',currentUser).maybeSingle();if(fe)throw fe;setFollowing(Boolean(f));}
    } catch(e) { setError(e instanceof Error?e.message:'读取活动记录失败'); }
    finally { setLoading(false); }
  },[recordType,recordId]);

  useEffect(()=>{void load()},[load]);
  const timeline=useMemo(()=>[
    ...activities.map(item=>({kind:'activity' as const,id:item.id,at:item.created_at,item})),
    ...audits.map(item=>({kind:'audit' as const,id:String(item.id),at:item.created_at,item})),
  ].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()),[activities,audits]);

  const addNote=async(event:FormEvent)=>{
    event.preventDefault();if(!body.trim()||saving||!userId)return;
    setSaving(true);setError('');setNotice('');
    try {const db=await getSupabaseClient();const {error:e}=await db.from('record_activities').insert({owner_id:userId,record_type:recordType,record_id:recordId,activity_type:'note',visibility:'internal',body:body.trim(),created_by:userId});if(e)throw e;setBody('');setNotice('备注已添加。');await load();}
    catch(e){setError(e instanceof Error?e.message:'添加备注失败');}
    finally{setSaving(false);}
  };
  const addTask=async(event:FormEvent)=>{
    event.preventDefault();if(!taskTitle.trim()||saving||!userId)return;
    setSaving(true);setError('');setNotice('');
    try {const db=await getSupabaseClient();const {error:e}=await db.from('record_activity_tasks').insert({owner_id:userId,record_type:recordType,record_id:recordId,title:taskTitle.trim(),activity_type:'todo',due_at:taskDue?new Date(taskDue).toISOString():null,created_by:userId});if(e)throw e;setTaskTitle('');setTaskDue('');setNotice('待办已建立。');await load();}
    catch(e){setError(e instanceof Error?e.message:'建立待办失败');}
    finally{setSaving(false);}
  };
  const completeTask=async(task:ActivityTask)=>{
    const db=await getSupabaseClient();const {error:e}=await db.from('record_activity_tasks').update({status:'done',completed_at:new Date().toISOString(),completed_by:userId,updated_at:new Date().toISOString()}).eq('id',task.id);if(e){setError(e.message);return;}await load();
  };
  const toggleFollowing=async()=>{
    if(!userId)return;const db=await getSupabaseClient();setError('');
    const result=following
      ? await db.from('record_followers').delete().eq('owner_id',userId).eq('record_type',recordType).eq('record_id',recordId).eq('user_id',userId)
      : await db.from('record_followers').insert({owner_id:userId,record_type:recordType,record_id:recordId,user_id:userId});
    if(result.error){setError(result.error.message);return;}setFollowing(!following);
  };

  return <section className="tp-activity" aria-label="活动与修改历史">
    <div className="tp-activity__header"><div><p className="tp-activity__eyebrow">ACTIVITY & AUDIT</p><h2>活动与修改记录</h2><p>{recordLabel||recordType} · 完整操作历史</p></div><div className="tp-activity__header-actions"><Button kind="ghost" size="sm" renderIcon={semanticIcons.notification} onClick={()=>void toggleFollowing()}>{following?'已关注':'关注记录'}</Button><Button kind="ghost" size="sm" renderIcon={semanticIcons.refresh} onClick={()=>void load()} disabled={loading}>刷新</Button></div></div>
    {error&&<InlineNotification kind="error" lowContrast title="操作失败" subtitle={error}/>}
    {notice&&<InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={()=>setNotice('')}/>}
    <div className="tp-activity__compose">
      <form onSubmit={addNote}><TextArea id={'activity-note-'+recordId} labelText="内部备注" placeholder="记录沟通内容、客户反馈或内部说明…" value={body} onChange={e=>setBody(e.currentTarget.value)} rows={3}/><div className="tp-activity__form-actions"><span>仅内部可见</span><Button type="submit" disabled={!body.trim()||saving} size="sm" renderIcon={semanticIcons.send}>发布备注</Button></div></form>
      <form onSubmit={addTask} className="tp-activity__task-form"><TextInput id={'activity-task-'+recordId} labelText="新建待办" value={taskTitle} onChange={e=>setTaskTitle(e.currentTarget.value)} placeholder="例如：联系客户确认报价"/><TextInput id={'activity-due-'+recordId} labelText="截止时间" type="datetime-local" value={taskDue} onChange={e=>setTaskDue(e.currentTarget.value)}/><Button type="submit" kind="tertiary" disabled={!taskTitle.trim()||saving} size="sm" renderIcon={semanticIcons.calendar}>安排活动</Button></form>
    </div>
    <div className="tp-activity__columns">
      <div className="tp-activity__timeline"><h3>时间线</h3>{loading?<p>正在读取记录…</p>:timeline.length===0?<p className="tp-activity__empty">暂无活动或修改记录。</p>:timeline.map(entry=>entry.kind==='activity'?<article className="tp-activity__item" key={'a-'+entry.id}><span className="tp-activity__dot tp-activity__dot--note"/><div><div className="tp-activity__meta"><strong>{entry.item.activity_type==='note'?'内部备注':entry.item.activity_type==='message'?'消息':'评论'}</strong><time>{dateTime(entry.at)}</time></div><p className="tp-activity__body">{entry.item.body}</p>{entry.item.edited_at&&<small>已编辑 · {dateTime(entry.item.edited_at)}</small>}</div></article>:<article className="tp-activity__item" key={'h-'+entry.id}><span className="tp-activity__dot tp-activity__dot--audit"/><div><div className="tp-activity__meta"><strong>{entry.item.event_type==='created'?'创建记录':entry.item.event_type==='deleted'?'删除记录':'修改记录'}</strong><time>{dateTime(entry.at)}</time></div>{Object.entries(entry.item.field_changes||{}).map(([field,change])=><div className="tp-activity__change" key={field}><strong>{field}</strong><span>{valueText(change.old)} → {valueText(change.new)}</span></div>)}</div></article>)}</div>
      <aside className="tp-activity__tasks"><h3>计划活动</h3>{tasks.length===0?<p className="tp-activity__empty">暂无待办活动。</p>:tasks.map(task=><article className="tp-activity__task" key={task.id}><div><strong>{task.title}</strong><small>{task.due_at?dateTime(task.due_at):'未设置截止时间'} · {task.status==='done'?'已完成':task.status==='cancelled'?'已取消':'待处理'}</small></div>{task.status==='open'&&<Button kind="ghost" size="sm" onClick={()=>void completeTask(task)}>完成</Button>}</article>)}</aside>
    </div>
  </section>;
}
