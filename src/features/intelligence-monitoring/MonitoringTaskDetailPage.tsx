import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PageHeader, Button, Tag, Tile, Grid, Column, InlineNotification, TpDataTable, Select, SelectItem, TextInput, semanticIcons,
} from '@/design-system';
import type { TpTableColumn } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/intelligence-monitoring.scss';

type MonitoringTask = {
  id: string; task_code: string; name: string; status: string; cadence_minutes: number;
  started_at: string | null; last_run_at: string | null; next_run_at: string | null;
  last_run_status: string | null; last_result_count: number; last_error: string | null;
  created_at: string; config: Record<string, unknown> | null;
} & Record<string, unknown>;
type MonitoringItem = {
  id: string; task_id: string; object_id: string; run_id: string; platform: string;
  external_id: string; content_type: string; author_name: string | null;
  author_profile_url: string | null; content_text: string; source_url: string | null;
  published_at: string | null; captured_at: string;
} & Record<string, unknown>;
type DetailResult = MonitoringItem & {
  channel_name: string; grade: string; score: number; intent_type: string; rationale: string;
};
type RelatedObject = { id: string; platform: string; label: string; source_url: string; object_type: string };
type RunRow = { id: string; status: string; current_stage: string | null; started_at: string | null; finished_at: string | null; heartbeat_at: string | null; discovered_count: number; new_count: number; analyzed_count: number; error_message: string | null; created_at: string };
type LogRow = { id: string; level: string; event: string; message: string; created_at: string };
const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';
const platformNames: Record<string, string> = { facebook:'Facebook', instagram:'Instagram', x:'X', tiktok:'TikTok', youtube:'YouTube', reddit:'Reddit', google_maps:'Google Maps', telegram:'Telegram', linkedin:'LinkedIn', forum:'行业论坛', pinterest:'Pinterest' };
const platformLabel = (value: string) => platformNames[value] ?? value;
const gradeTag = (grade: string) => <Tag type={grade === 'S' ? 'green' : grade === 'A' ? 'blue' : grade === 'B' ? 'purple' : 'cool-gray'}>{grade === 'unclassified' ? '待分析' : grade + ' 级'}</Tag>;
const statusLabel = (value: string) => ({ queued:'排队等待', running:'正在执行', succeeded:'执行成功', partial:'部分成功', failed:'执行失败', skipped:'已跳过', paused:'已暂停', draft:'草稿' }[value] ?? value);

export function MonitoringTaskDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<MonitoringTask | null>(null);
  const [objects, setObjects] = useState<RelatedObject[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [results, setResults] = useState<DetailResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [resultPage, setResultPage] = useState(1);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 20;

  const loadTask = useCallback(async () => {
    if (!id) { setError('缺少监听任务编号。'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: taskData, error: taskError } = await client.from('monitoring_tasks').select('*').eq('id', id).single();
      if (taskError) throw taskError;
      setTask(taskData as MonitoringTask);
      const [linksResult, runsResult, logsResult] = await Promise.all([
        client.from('monitoring_task_objects').select('object_id').eq('task_id', id),
        client.from('monitoring_runs').select('id,status,current_stage,started_at,finished_at,heartbeat_at,discovered_count,new_count,analyzed_count,error_message,created_at').eq('task_id', id).order('created_at', { ascending: false }).limit(30),
        client.from('monitoring_run_logs').select('id,level,event,message,created_at').eq('task_id', id).order('created_at', { ascending: false }).limit(30),
      ]);
      if (linksResult.error) throw linksResult.error;
      if (runsResult.error) throw runsResult.error;
      if (logsResult.error) throw logsResult.error;
      const objectIds = (linksResult.data ?? []).map(row => row.object_id);
      const objectResult = objectIds.length
        ? await client.from('monitoring_objects').select('id,platform,label,source_url,object_type').in('id', objectIds)
        : { data: [], error: null };
      if (objectResult.error) throw objectResult.error;
      setObjects((objectResult.data ?? []) as RelatedObject[]);
      setRuns((runsResult.data ?? []) as RunRow[]);
      setLogs((logsResult.data ?? []).reverse() as LogRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取任务详情失败。');
      setTask(null);
    } finally { setLoading(false); }
  }, [id]);

  const loadResults = useCallback(async () => {
    if (!id) return;
    setResultsLoading(true);
    try {
      const client = await getSupabaseClient();
      const from = (resultPage - 1) * pageSize;
      const { data: itemData, error: itemError, count } = await client.from('monitoring_items')
        .select('id,task_id,object_id,run_id,platform,external_id,content_type,author_name,author_profile_url,content_text,source_url,published_at,captured_at', { count: 'exact' })
        .eq('task_id', id).order('captured_at', { ascending: false }).range(from, from + pageSize - 1);
      if (itemError) throw itemError;
      const pageItems = (itemData ?? []) as MonitoringItem[];
      const itemIds = pageItems.map(item => item.id);
      const objectIds = [...new Set(pageItems.map(item => item.object_id))];
      const [analysesResult, objectsResult] = await Promise.all([
        itemIds.length ? client.from('monitoring_analyses').select('item_id,grade,score,intent_type,rationale').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
        objectIds.length ? client.from('monitoring_objects').select('id,label').in('id', objectIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (analysesResult.error) throw analysesResult.error;
      if (objectsResult.error) throw objectsResult.error;
      const analysisMap = new Map((analysesResult.data ?? []).map(row => [row.item_id, row]));
      const objectMap = new Map((objectsResult.data ?? []).map(row => [row.id, row.label]));
      setResults(pageItems.map(item => {
        const analysis = analysisMap.get(item.id);
        return { ...item, channel_name: objectMap.get(item.object_id) ?? '—', grade: analysis?.grade ?? 'unclassified',
          score: analysis?.score ?? 0, intent_type: analysis?.intent_type ?? '待分析',
          rationale: analysis?.rationale ?? '尚未生成 AI 判定' };
      }) as DetailResult[]);
      setResultCount(count ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取任务监听结果失败。');
      setResults([]); setResultCount(0);
    } finally { setResultsLoading(false); }
  }, [id, resultPage]);

  useEffect(() => { void loadTask(); }, [loadTask]);
  useEffect(() => { void loadResults(); }, [loadResults]);

  const filteredResults = useMemo(() => results.filter(row =>
    (platformFilter === 'all' || row.platform === platformFilter) &&
    (gradeFilter === 'all' || row.grade === gradeFilter) &&
    [row.content_text,row.author_name,row.intent_type,row.grade,row.channel_name,platformLabel(row.platform)].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [results, platformFilter, gradeFilter, search]);

  const resultColumns: TpTableColumn<DetailResult>[] = [
    { key:'platform', header:'平台', primary:true, required:true, minWidth:110, render:row=>platformLabel(row.platform) },
    { key:'channel_name', header:'监听对象', required:true, minWidth:160 },
    { key:'content_type', header:'内容类型', minWidth:100 },
    { key:'content_text', header:'监听内容', required:true, longText:true, minWidth:280, render:row=>row.content_text || '—', exportValue:row=>row.content_text },
    { key:'author_name', header:'发布者', minWidth:130 },
    { key:'grade', header:'AI 判定', required:true, render:row=>gradeTag(row.grade) },
    { key:'score', header:'意向评分', render:row=>row.grade === 'unclassified' ? '待分析' : row.score + ' / 100' },
    { key:'intent_type', header:'意向类型', minWidth:140 },
    { key:'rationale', header:'AI 判定理由', longText:true, defaultVisible:false },
    { key:'published_at', header:'原始发布时间', render:row=>formatDate(row.published_at) },
    { key:'captured_at', header:'采集时间', required:true, render:row=>formatDate(row.captured_at) },
    { key:'source_url', header:'来源链接', render:row=>row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">打开原文</a> : '—', exportValue:row=>row.source_url },
    { key:'external_id', header:'平台内容 ID', defaultVisible:false },
    { key:'run_id', header:'执行批次', defaultVisible:false },
  ];

  const config = task?.config ?? {};
  const latestRun = runs[0];
  const running = latestRun?.status === 'running' || latestRun?.status === 'queued';
  const summary = [
    { label:'任务编号', value:task?.task_code ?? '—' },
    { label:'调度状态', value:statusLabel(task?.status ?? '—') },
    { label:'执行频率', value:task?.cadence_minutes ? (task.cadence_minutes >= 1440 ? '每天一次' : '每 ' + task.cadence_minutes + ' 分钟') : '—' },
    { label:'结果总数', value:resultCount.toLocaleString('zh-CN') },
    { label:'最近执行', value:statusLabel(latestRun?.status ?? task?.last_run_status ?? '尚无执行记录') },
    { label:'最近心跳', value:formatDate(latestRun?.heartbeat_at) },
  ];

  return <main className="tp-intelligence-monitoring tp-intelligence-monitoring__detail">
    <PageHeader breadcrumb="全球情报 / 公开内容监听 / 监听任务列表" title={task?.name ?? '监听任务详情'} description={task?.task_code ? '任务编号 ' + task.task_code + ' · 查看任务配置、执行记录与全部监听结果。' : '查看该监听任务的配置、执行记录与监听结果。'} />
    <div className="tp-intelligence-monitoring__actions">
      <Button kind="tertiary" size="md" onClick={() => navigate('/intelligence-monitoring/tasks')}>返回任务列表</Button>
      <Button kind="tertiary" size="md" renderIcon={running ? semanticIcons.pause : semanticIcons.play} onClick={async () => {
        if (!task) return;
        const client = await getSupabaseClient();
        const stamp = new Date().toISOString();
        const { error: updateError } = await client.from('monitoring_tasks').update(
          task.status === 'running' ? { status:'paused', next_run_at:null } : { status:'running', started_at:task.started_at ?? stamp, next_run_at:stamp, last_error:null }
        ).eq('id', task.id);
        if (updateError) { setError(updateError.message); return; }
        await loadTask();
      }}>{task?.status === 'running' ? '暂停监听' : '恢复监听'}</Button>
      <Button kind="ghost" size="md" renderIcon={semanticIcons.activity} onClick={() => { void loadTask(); void loadResults(); }}>刷新详情</Button>
    </div>
    {error && <InlineNotification kind="error" lowContrast title="任务数据读取异常" subtitle={error} />}
    {loading ? <Tile className="tp-intelligence-monitoring__detail-loading">正在读取任务详情…</Tile> : !task ? <Tile className="tp-intelligence-monitoring__empty"><h4>未找到该监听任务</h4><p>任务可能已删除，或当前账号无权访问。</p></Tile> : <>
      <div className="tp-intelligence-monitoring__detail-summary">
        {summary.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
      </div>
      <section className="tp-intelligence-monitoring__section">
        <div className="tp-intelligence-monitoring__section-heading"><semanticIcons.task size={20} /><div><h2>任务配置</h2><p>监听对象、采集策略和 AI 分析规则。</p></div></div>
        <Grid fullWidth className="tp-intelligence-monitoring__detail-grid">
          <Column sm={4} md={4} lg={8}><div><span>任务名称</span><strong>{task.name}</strong></div></Column>
          <Column sm={4} md={4} lg={8}><div><span>创建时间</span><strong>{formatDate(task.created_at)}</strong></div></Column>
          <Column sm={4} md={4} lg={8}><div><span>监听开始时间</span><strong>{formatDate(task.started_at)}</strong></div></Column>
          <Column sm={4} md={4} lg={8}><div><span>最近采集时间</span><strong>{formatDate(task.last_run_at)}</strong></div></Column>
          <Column sm={4} md={4} lg={8}><div><span>下次执行时间</span><strong>{formatDate(task.next_run_at)}</strong></div></Column>
          <Column sm={4} md={4} lg={8}><div><span>最近新增结果</span><strong>{Number(task.last_result_count ?? 0).toLocaleString('zh-CN')}</strong></div></Column>
          <Column sm={4} md={8} lg={16}><div><span>最近异常</span><strong>{task.last_error || '无'}</strong></div></Column>
        </Grid>
        <div className="tp-intelligence-monitoring__detail-subsection"><h3>监听对象</h3>{objects.length ? objects.map(object => <div className="tp-intelligence-monitoring__object-row" key={object.id}><div><strong>{object.label}</strong><span>{platformLabel(object.platform)} · {object.object_type}</span></div><a href={object.source_url} target="_blank" rel="noreferrer">打开来源</a></div>) : <p>尚未关联监听对象。</p>}</div>
        <div className="tp-intelligence-monitoring__detail-subsection"><h3>采集与 AI 规则</h3><div className="tp-intelligence-monitoring__config-list">
          <div><span>首次采集范围</span><strong>{String(config.initialMode ?? '—') === 'last_24_hours' ? '最近 24 小时' : String(config.initialMode ?? '—')}</strong></div>
          <div><span>采集帖子 / 评论 / 回复</span><strong>{[config.collectPosts,config.collectComments,config.collectReplies].map(value=>value ? '是' : '否').join(' / ')}</strong></div>
          <div><span>单帖评论与回复上限</span><strong>{String(config.perPostCommentReplyLimit ?? '—')}</strong></div>
          <div><span>最低 AI 等级</span><strong>{String(config.minimumGrade ?? '—')}</strong></div>
          <div><span>识别意向</span><strong>{Array.isArray(config.intents) ? config.intents.join('、') : '—'}</strong></div>
          <div><span>数据范围</span><strong>{String(config.scope ?? 'public_only') === 'public_only' ? '仅公开内容' : String(config.scope ?? '—')}</strong></div>
        </div></div>
      </section>
      <section className="tp-intelligence-monitoring__section">
        <div className="tp-intelligence-monitoring__section-heading"><semanticIcons.analytics size={20} /><div><h2>执行记录</h2><p>查看最近 30 次运行、当前阶段与采集计数。</p></div></div>
        <TpDataTable<RunRow> ariaLabel="监听任务执行记录" columns={[
          {key:'created_at',header:'创建时间',render:row=>formatDate(row.created_at)},
          {key:'status',header:'执行状态',render:row=><Tag type={row.status==='succeeded'?'green':row.status==='failed'?'red':row.status==='running'?'blue':'cool-gray'}>{statusLabel(row.status)}</Tag>},
          {key:'current_stage',header:'执行阶段',render:row=>row.current_stage || '—'},
          {key:'discovered_count',header:'发现数',type:'number'},
          {key:'new_count',header:'新增数',type:'number'},
          {key:'analyzed_count',header:'已分析',type:'number'},
          {key:'heartbeat_at',header:'最近心跳',render:row=>formatDate(row.heartbeat_at)},
          {key:'error_message',header:'异常信息',longText:true},
        ]} rows={runs} rowKey="id" emptyState="该任务尚无执行记录。" columnSettingsKey="monitoring-task-runs" />
        {task.last_error && <InlineNotification kind="error" lowContrast title="最近一次任务异常" subtitle={task.last_error} />}
      </section>
      <section className="tp-intelligence-monitoring__section">
        <div className="tp-intelligence-monitoring__section-heading"><semanticIcons.activity size={20} /><div><h2>执行日志</h2><p>最近 30 条任务级日志事件。</p></div></div>
        <div className="tp-intelligence-monitoring__first-run-events">{logs.length ? logs.map(entry=><div className="tp-intelligence-monitoring__first-run-event" key={entry.id}><span className={'tp-intelligence-monitoring__log-dot tp-intelligence-monitoring__log-dot--'+entry.level}/><div><strong>{entry.message}</strong><small>{formatDate(entry.created_at)} · {entry.event}</small></div></div>) : <div className="tp-intelligence-monitoring__first-run-empty">暂无执行日志。</div>}</div>
      </section>
      <section className="tp-intelligence-monitoring__section">
        <div className="tp-intelligence-monitoring__section-heading"><semanticIcons.analytics size={20} /><div><h2>监听结果</h2><p>只显示当前任务采集的数据，分页读取数据库中的全部记录。</p></div></div>
        <div className="tp-intelligence-monitoring__filter-bar tp-intelligence-monitoring__filter-bar--wide">
          <Select id="task-detail-platform" labelText="平台" size="sm" value={platformFilter} onChange={event=>{setPlatformFilter(event.currentTarget.value);setResultPage(1);}}><SelectItem value="all" text="全部平台" />{objects.map(object=><SelectItem key={object.id} value={object.platform} text={platformLabel(object.platform)} />)}</Select>
          <Select id="task-detail-grade" labelText="AI 判定" size="sm" value={gradeFilter} onChange={event=>{setGradeFilter(event.currentTarget.value);setResultPage(1);}}><SelectItem value="all" text="全部等级" /><SelectItem value="S" text="S 级" /><SelectItem value="A" text="A 级" /><SelectItem value="B" text="B 级" /><SelectItem value="C" text="C 级" /><SelectItem value="unclassified" text="待分析" /></Select>
          <TextInput id="task-detail-search" labelText="搜索当前页" size="sm" value={search} onChange={event=>setSearch(event.currentTarget.value)} placeholder="内容、发布者、意向…" />
          <span>共 {resultCount.toLocaleString('zh-CN')} 条</span>
        </div>
        <TpDataTable<DetailResult> ariaLabel="当前监听任务的全部采集结果" columns={resultColumns} rows={filteredResults} rowKey="id" loading={resultsLoading} emptyState="该任务尚未采集到结果。" columnSettingsKey="monitoring-task-detail-results" pagination={{page:resultPage,pageSize:20,totalItems:resultCount,serverSide:true,onChange:nextPage=>setResultPage(nextPage)}} />
      </section>
    </>}
  </main>;
}
