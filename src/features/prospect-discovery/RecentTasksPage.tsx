import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProspectDiscoveryHeader } from './ProspectDiscoveryHeader';
import type { Session } from '@supabase/supabase-js';
import {
  Button, InlineLoading, InlineNotification, Tag, Table, TableBody, TableCell,
  TableContainer, TableHead, TableHeader, TableRow,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { getDiscoveryRuns, getContactEnrichmentJobs, retryDiscoveryRun, type DiscoveryRun, type ContactEnrichmentJob } from './api';
import '@/design-system/patterns/prospect-discovery.scss';

const hiddenTasksKey = 'tradepilot.recent-tasks.excluded';
const labels: Record<string,string> = {
  queued:'排队中', running:'执行中', completed:'已完成', partial:'部分完成',
  failed:'失败', cancelled:'已取消', planned:'待执行',
};
const channelLabels: Record<string,string> = {
  map_local_businesses:'Google Maps', map:'Google Maps',
  facebook:'Facebook', instagram:'Instagram',
};
const isTerminal = (status:string) => ['completed','partial','failed','cancelled'].includes(status);

function readExcluded(): string[] {
  try { return JSON.parse(localStorage.getItem(hiddenTasksKey) ?? '[]') as string[]; }
  catch { return []; }
}

export function RecentTasksPage() {
  const navigate = useNavigate();
  const [session,setSession] = useState<Session|null>(null);
  const [runs,setRuns] = useState<DiscoveryRun[]>([]);
  const [contactJobs,setContactJobs] = useState<ContactEnrichmentJob[]>([]);
  const [excluded,setExcluded] = useState<string[]>([]);
  const [loading,setLoading] = useState(true);
  const [busyId,setBusyId] = useState<string|null>(null);
  const [error,setError] = useState('');

  useEffect(() => {
    let alive = true;
    setExcluded(readExcluded());
    getSupabaseClient().then(async client => {
      const {data} = await client.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      if (data.session) {
        const [dataRuns,dataContactJobs] = await Promise.all([getDiscoveryRuns(data.session.access_token),getContactEnrichmentJobs(data.session.access_token)]);
        if (alive) { setRuns(dataRuns); setContactJobs(dataContactJobs); }
      }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '无法读取最近任务'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  },[]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    try { const [dataRuns,dataContactJobs]=await Promise.all([getDiscoveryRuns(session.access_token),getContactEnrichmentJobs(session.access_token)]);setRuns(dataRuns);setContactJobs(dataContactJobs); }
    catch (e) { setError(e instanceof Error ? e.message : '刷新任务列表失败'); }
    finally { setLoading(false); }
  },[session]);

  const visibleRuns = useMemo(() => runs.filter(run => !excluded.includes(run.id)),[runs,excluded]);

  const openTask = (run:DiscoveryRun) => {
    navigate('/prospect-discovery?runId='+encodeURIComponent(run.id));
  };

  const retry = async (run:DiscoveryRun) => {
    if (!session) return;
    setBusyId(run.id); setError('');
    try {
      const created = await retryDiscoveryRun(session.access_token,run);
      setRuns(previous => [created,...previous.filter(item => item.id !== created.id)]);
      navigate('/prospect-discovery?runId='+encodeURIComponent(created.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务重试失败');
    } finally { setBusyId(null); }
  };

  const exclude = (run:DiscoveryRun) => {
    const next = [...new Set([...excluded,run.id])];
    setExcluded(next);
    localStorage.setItem(hiddenTasksKey,JSON.stringify(next));
  };

  if (loading && !session) return <main className="tp-discovery"><InlineLoading description="正在读取最近任务…"/></main>;

  return <main className="tp-discovery tp-recent-tasks">
    <ProspectDiscoveryHeader title="最近任务" description="查看历史发现任务，打开执行详情、重试任务，或将任务从此列表排除。" showRecentTasks={false}>
      <Button kind="secondary" onClick={()=>navigate('/prospect-discovery')}>返回潜客发现</Button>
      <Button kind="ghost" onClick={()=>void refresh()} disabled={loading}>刷新</Button>
    </ProspectDiscoveryHeader>
    {error&&<InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>任务列表</h2><p>任务详情包含执行状态、进度、日志及该任务发现的结果。</p></div><Tag type="gray">{visibleRuns.length} 个任务</Tag></div>
      {loading?<InlineLoading description="正在刷新任务列表…"/>:visibleRuns.length?<div className="tp-discovery__table-scroll">
        <TableContainer><Table size="lg"><TableHead><TableRow>
          <TableHeader>任务编号</TableHeader><TableHeader>发现渠道</TableHeader><TableHeader>搜索关键词</TableHeader><TableHeader>状态</TableHeader><TableHeader>发现数量</TableHeader><TableHeader>创建时间</TableHeader><TableHeader>操作</TableHeader>
        </TableRow></TableHead><TableBody>{visibleRuns.map(run=><TableRow key={run.id}>
          <TableCell className="tp-discovery__nowrap-cell"><span title={run.taskCode}>{run.taskCode}</span></TableCell>
          <TableCell className="tp-discovery__nowrap-cell"><span title={channelLabels[run.channel]??run.channel}>{channelLabels[run.channel]??run.channel}</span></TableCell>
          <TableCell className="tp-discovery__nowrap-cell"><span title={run.query}>{run.query}</span></TableCell>
          <TableCell><Tag type={run.status==='failed'?'red':isTerminal(run.status)?'green':'blue'}>{labels[run.status]??run.status}</Tag></TableCell>
          <TableCell>{run.discoveredCount}</TableCell>
          <TableCell className="tp-discovery__nowrap-cell"><span title={new Date(run.createdAt).toLocaleString()}>{new Date(run.createdAt).toLocaleString()}</span></TableCell>
          <TableCell className="tp-discovery__row-actions">
            <Button kind="ghost" size="sm" onClick={()=>openTask(run)}>打开详情</Button>
            <Button kind="ghost" size="sm" disabled={busyId!==null||!isTerminal(run.status)} onClick={()=>void retry(run)}>{busyId===run.id?'正在重试…':'重试'}</Button>
            <Button kind="ghost" size="sm" disabled={busyId!==null} onClick={()=>exclude(run)}>排除</Button>
          </TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
      </div>:<p className="tp-discovery__empty">暂无最近任务。完成一次潜客发现后，任务会自动出现在这里。</p>}
    </section>
    <section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>联系人补全任务</h2><p>与企业发现任务共用此任务执行中心，显示 Apollo、ZoomInfo 及官网联系方式补全进度。</p></div><Tag type="gray">{contactJobs.length} 个任务</Tag></div>
      {contactJobs.length?<div className="tp-discovery__table-scroll"><TableContainer><Table size="lg"><TableHead><TableRow>
        <TableHeader>任务编号</TableHeader><TableHeader>状态</TableHeader><TableHeader>进度</TableHeader><TableHeader>完成 / 失败</TableHeader><TableHeader>任务信息</TableHeader><TableHeader>创建时间</TableHeader>
      </TableRow></TableHead><TableBody>{contactJobs.map(job=><TableRow key={job.id}>
        <TableCell className="tp-discovery__nowrap-cell"><span title={job.id}>{job.id.slice(0,8)}</span></TableCell>
        <TableCell><Tag type={job.status==='failed'?'red':isTerminal(job.status)?'green':'blue'}>{labels[job.status]??job.status}</Tag></TableCell>
        <TableCell>{Number(job.progress??0)}%</TableCell>
        <TableCell>{job.completedCount} / {job.failedCount}</TableCell>
        <TableCell>{job.message}</TableCell>
        <TableCell className="tp-discovery__nowrap-cell"><span title={new Date(job.createdAt).toLocaleString()}>{new Date(job.createdAt).toLocaleString()}</span></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer></div>:<p className="tp-discovery__empty">暂无联系人补全任务。</p>}
    </section>
    <p className="tp-discovery__muted">“排除”仅将任务从当前最近任务列表隐藏，不会删除后台任务记录或发现结果。</p>
  </main>;
}
