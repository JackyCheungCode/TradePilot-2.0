import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PageHeader, Button, TextInput, Select, SelectItem, Tile, Tag, InlineNotification,
  Grid, Column, Checkbox, TpDataTable,
} from '@/design-system';
import type { TpTableColumn } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/intelligence-monitoring.scss';

type Platform = 'facebook' | 'instagram' | 'x' | 'tiktok' | 'youtube' | 'reddit' | 'google_maps' | 'telegram' | 'linkedin' | 'forum' | 'pinterest';
type TaskRow = {
  id: string; task_code: string; name: string; status: string; cadence_minutes: number;
  started_at: string | null; last_run_at: string | null; next_run_at: string | null;
  last_run_status: string | null; last_result_count: number; last_error: string | null; created_at: string;
} & Record<string, unknown>;
type ResultRow = {
  id: string; task_id: string; object_id: string; run_id: string; platform: string; external_id: string;
  content_type: string; author_name: string | null; author_profile_url?: string | null; content_text: string;
  source_url: string | null; published_at: string | null; captured_at: string;
  task_name: string; task_started_at: string | null; cadence_minutes: number; channel_name: string; grade: string; score: number; intent_type: string; rationale: string;
} & Record<string, unknown>;

const platformOptions: Array<{ value: Platform; label: string }> = [
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' }, { value: 'tiktok', label: 'TikTok' }, { value: 'youtube', label: 'YouTube' },
  { value: 'reddit', label: 'Reddit' }, { value: 'google_maps', label: 'Google Maps' },
  { value: 'telegram', label: 'Telegram' }, { value: 'linkedin', label: 'LinkedIn' },
  { value: 'forum', label: '行业论坛' }, { value: 'pinterest', label: 'Pinterest' },
];
const intentOptions = ['明确采购', '寻找供应商', '询价与报价', '寻找经销商 / 代理', '产品规格咨询', 'OEM / ODM 合作'];
const cadenceOptions = [{ value: '60', label: '每 1 小时' }, { value: '180', label: '每 3 小时' }, { value: '360', label: '每 6 小时' }, { value: '720', label: '每 12 小时' }, { value: '1440', label: '每天一次' }];
const platformLabel = (value: string) => platformOptions.find(item => item.value === value)?.label ?? value;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';
const gradeTag = (grade: string) => <Tag type={grade === 'S' ? 'green' : grade === 'A' ? 'blue' : grade === 'B' ? 'purple' : 'cool-gray'}>{grade === 'unclassified' ? '待分析' : grade + ' 级'}</Tag>;

function ModuleNavigation({ active }: { active: 'create' | 'tasks' | 'results' | 'logs' }) {
  const links = [
    { key: 'create', label: '创建监听任务', href: '/intelligence-monitoring' },
    { key: 'tasks', label: '监听任务列表', href: '/intelligence-monitoring/tasks' },
    { key: 'results', label: '监听结果中心', href: '/intelligence-monitoring/results' },
    { key: 'logs', label: '日志控制台', href: '/intelligence-monitoring/logs' },
  ] as const;
  return <nav className="tp-intelligence-monitoring__navigation" aria-label="情报监听模块导航">
    {links.map(link => <Button key={link.key} kind={active === link.key ? 'primary' : 'tertiary'} size="md" href={link.href}>{link.label}</Button>)}
  </nav>;
}

function useMonitoringData(mode: 'tasks' | 'results') {
  const [rows, setRows] = useState<Array<TaskRow | ResultRow>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: userData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) throw new Error('请先登录后查看监听数据。');
      if (mode === 'tasks') {
        const { data, error: queryError } = await client.from('monitoring_tasks')
          .select('id,task_code,name,status,cadence_minutes,started_at,last_run_at,next_run_at,last_run_status,last_result_count,last_error,created_at')
          .order('created_at', { ascending: false }).limit(500);
        if (queryError) throw queryError;
        setRows((data ?? []) as TaskRow[]);
      } else {
        const { data: items, error: itemError } = await client.from('monitoring_items')
          .select('id,task_id,object_id,run_id,platform,external_id,content_type,author_name,author_profile_url,content_text,source_url,published_at,captured_at')
          .order('captured_at', { ascending: false }).limit(500);
        if (itemError) throw itemError;
        const itemRows = items ?? [];
        const taskIds = [...new Set(itemRows.map(item => item.task_id))];
        const objectIds = [...new Set(itemRows.map(item => item.object_id))];
        const itemIds = itemRows.map(item => item.id);
        const [tasksResult, objectsResult, analysesResult] = await Promise.all([
          taskIds.length ? client.from('monitoring_tasks').select('id,name,started_at,cadence_minutes').in('id', taskIds) : Promise.resolve({ data: [], error: null }),
          objectIds.length ? client.from('monitoring_objects').select('id,label').in('id', objectIds) : Promise.resolve({ data: [], error: null }),
          itemIds.length ? client.from('monitoring_analyses').select('item_id,grade,score,intent_type,rationale').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (tasksResult.error) throw tasksResult.error;
        if (objectsResult.error) throw objectsResult.error;
        if (analysesResult.error) throw analysesResult.error;
        const taskMap = new Map((tasksResult.data ?? []).map(row => [row.id, row]));
        const objectMap = new Map((objectsResult.data ?? []).map(row => [row.id, row.label]));
        const analysisMap = new Map((analysesResult.data ?? []).map(row => [row.item_id, row]));
        setRows(itemRows.map(item => {
          const analysis = analysisMap.get(item.id);
          return {
            ...item, task_name: taskMap.get(item.task_id)?.name ?? '—', task_started_at: taskMap.get(item.task_id)?.started_at ?? null, cadence_minutes: taskMap.get(item.task_id)?.cadence_minutes ?? 0, channel_name: objectMap.get(item.object_id) ?? '—',
            grade: analysis?.grade ?? 'unclassified', score: analysis?.score ?? 0,
            intent_type: analysis?.intent_type ?? '待分析', rationale: analysis?.rationale ?? '尚未生成 AI 判定',
          };
        }) as ResultRow[]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取监听数据失败。');
      setRows([]);
    } finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  return { rows, loading, error, reload: load };
}

export function IntelligenceMonitoringPage() {
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [objectType, setObjectType] = useState('auto');
  const [url, setUrl] = useState('');
  const [taskName, setTaskName] = useState('公开内容监听');
  const [cadence, setCadence] = useState('60');
  const [intents, setIntents] = useState<string[]>(intentOptions);
  const [minimumGrade, setMinimumGrade] = useState('A');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; title: string; subtitle: string } | null>(null);
  const navigate = useNavigate();
  const canSave = /^https?:\/\//i.test(url.trim()) && taskName.trim().length > 0 && intents.length > 0;
  const saveTask = async () => {
    if (!canSave || busy) return;
    setBusy(true); setNotice(null);
    try {
      const client = await getSupabaseClient();
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      const ownerId = authData.user?.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只允许 HTTP 或 HTTPS 公开链接。');
      const normalizedUrl = parsed.toString().replace(/\/$/, '');
      const { data: object, error: objectError } = await client.from('monitoring_objects').upsert({
        owner_id: ownerId, platform, object_type: objectType, label: taskName.trim(),
        source_url: url.trim(), normalized_url: normalizedUrl, is_active: true,
      }, { onConflict: 'owner_id,platform,normalized_url' }).select('id').single();
      if (objectError) throw objectError;
      const taskCode = 'MON-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomUUID().slice(0, 6).toUpperCase();
      const { data: task, error: taskError } = await client.from('monitoring_tasks').insert({
        owner_id: ownerId, task_code: taskCode, name: taskName.trim(), status: 'draft',
        cadence_minutes: Number(cadence), config: { intents, minimumGrade, includeHistory, scope: 'public_only', providerPolicy: 'apify_primary_brightdata_fallback' },
      }).select('id').single();
      if (taskError) throw taskError;
      const { error: linkError } = await client.from('monitoring_task_objects').insert({
        owner_id: ownerId, task_id: task.id, object_id: object.id,
      });
      if (linkError) {
        await client.from('monitoring_tasks').delete().eq('id', task.id);
        throw linkError;
      }
      setNotice({ kind: 'success', title: '监听任务已保存', subtitle: '任务编号 ' + taskCode + '。已写入云端数据库，当前为草稿状态；采集调度与平台采集器启用后才能正式启动。' });
      setUrl('');
      window.setTimeout(() => navigate('/intelligence-monitoring/tasks'), 900);
    } catch (cause) {
      setNotice({ kind: 'error', title: '保存失败', subtitle: cause instanceof Error ? cause.message : '监听任务保存失败。' });
    } finally { setBusy(false); }
  };
  return <main className="tp-intelligence-monitoring">
    <PageHeader breadcrumb="全球情报 / 公开内容监听" title="创建监听任务" description="指定公开主页、账号、群组或频道，配置监听频率与 AI 购买意向识别规则。" />
    <ModuleNavigation active="create" />
    <div className="tp-intelligence-monitoring__meta"><Tag type="blue">PUBLIC DATA ONLY</Tag><Tag type="cool-gray">云端持久化</Tag></div>
    {notice && <InlineNotification kind={notice.kind} lowContrast title={notice.title} subtitle={notice.subtitle} onCloseButtonClick={() => setNotice(null)} />}
    <section className="tp-intelligence-monitoring__section">
      <div className="tp-intelligence-monitoring__section-heading"><span>01</span><div><h2>添加监听对象</h2><p>只接受公开可访问的来源，不访问私人消息、私密群组或受限内容。</p></div></div>
      <Grid fullWidth className="tp-intelligence-monitoring__form-grid">
        <Column sm={4} md={4} lg={8}><TextInput id="monitoring-task-name" labelText="任务名称" value={taskName} onChange={event => setTaskName(event.currentTarget.value)} /></Column>
        <Column sm={4} md={4} lg={8}><Select id="monitoring-platform" labelText="监听平台" value={platform} onChange={event => setPlatform(event.currentTarget.value as Platform)}>{platformOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}</Select></Column>
        <Column sm={4} md={4} lg={8}><Select id="monitoring-object-type" labelText="对象类型" value={objectType} onChange={event => setObjectType(event.currentTarget.value)}><SelectItem value="auto" text="自动识别" /><SelectItem value="page" text="企业主页 / 账号" /><SelectItem value="person" text="个人公开主页" /><SelectItem value="group" text="公开群组 / 社区" /><SelectItem value="channel" text="公开频道" /><SelectItem value="post" text="指定帖子 / 视频" /><SelectItem value="place" text="商家 / 地点页面" /><SelectItem value="forum" text="论坛主题 / 板块" /></Select></Column>
        <Column sm={4} md={8} lg={16}><TextInput id="monitoring-source-url" labelText="公开链接" placeholder="https://www.facebook.com/..." value={url} onChange={event => setUrl(event.currentTarget.value)} helperText="输入主页、账号、公开群组、频道、帖子或商家页面 URL。" /></Column>
      </Grid>
    </section>
    <section className="tp-intelligence-monitoring__section">
      <div className="tp-intelligence-monitoring__section-heading"><span>02</span><div><h2>设置监听规则</h2><p>确定增量采集频率与历史公开内容策略。</p></div></div>
      <Grid fullWidth className="tp-intelligence-monitoring__form-grid">
        <Column sm={4} md={4} lg={8}><Select id="monitoring-cadence" labelText="监听频率" value={cadence} onChange={event => setCadence(event.currentTarget.value)}>{cadenceOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}</Select></Column>
        <Column sm={4} md={4} lg={8}><Checkbox id="monitoring-history" checked={includeHistory} onChange={(_, data) => setIncludeHistory(data.checked)} labelText="首次运行时补采可访问的历史公开内容" /></Column>
      </Grid>
      <Tile className="tp-intelligence-monitoring__subpanel"><strong>默认采集类型</strong><p>新增帖子、评论、回复、公开评价；作者公开名称、内容链接、发布时间与采集时间（以平台和数据服务实际可返回字段为准）。</p></Tile>
    </section>
    <section className="tp-intelligence-monitoring__section">
      <div className="tp-intelligence-monitoring__section-heading"><span>03</span><div><h2>AI 分析与结果设置</h2><p>对新内容进行语义判断，提取真实采购信号和产品需求。</p></div></div>
      <Grid fullWidth className="tp-intelligence-monitoring__form-grid">
        <Column sm={4} md={8} lg={10}><Tile className="tp-intelligence-monitoring__subpanel"><strong>识别意向类型</strong>{intentOptions.map(item => <Checkbox key={item} id={'monitor-intent-' + item} labelText={item} checked={intents.includes(item)} onChange={(_, data) => setIntents(current => data.checked ? [...current, item] : current.filter(value => value !== item))} />)}</Tile></Column>
        <Column sm={4} md={8} lg={6}><Tile className="tp-intelligence-monitoring__subpanel"><strong>潜客候选最低等级</strong><Select id="monitoring-minimum-grade" labelText="最低 AI 意向等级" value={minimumGrade} onChange={event => setMinimumGrade(event.currentTarget.value)}><SelectItem value="S" text="仅 S 级" /><SelectItem value="A" text="S / A 级" /><SelectItem value="B" text="S / A / B 级" /><SelectItem value="C" text="全部等级" /></Select><p>S：明确采购；A：高购买意向；B：潜在需求；C：持续观察。</p></Tile></Column>
      </Grid>
    </section>
    <section className="tp-intelligence-monitoring__section">
      <div className="tp-intelligence-monitoring__section-heading"><span>04</span><div><h2>确认任务配置</h2><p>保存后任务、对象与规则将持久化到 TradePilot 云端数据库。</p></div></div>
      <Grid fullWidth className="tp-intelligence-monitoring__summary">
        <Column sm={4} md={4} lg={4}><div><span>平台</span><strong>{platformLabel(platform)}</strong></div></Column>
        <Column sm={4} md={4} lg={4}><div><span>监听频率</span><strong>{cadenceOptions.find(item => item.value === cadence)?.label}</strong></div></Column>
        <Column sm={4} md={4} lg={4}><div><span>AI 意向类别</span><strong>{intents.length} 类</strong></div></Column>
        <Column sm={4} md={4} lg={4}><div><span>最低等级</span><strong>{minimumGrade} 级</strong></div></Column>
      </Grid>
      <InlineNotification kind="warning" lowContrast title="当前执行状态" subtitle="本阶段已完成云端任务与数据结构接入。采集器适配、调度执行和 AI 结果写入尚未完成，因此任务会先以草稿保存，不会虚报为正在监听。" hideCloseButton />
      <div className="tp-intelligence-monitoring__actions"><Button kind="primary" disabled={!canSave || busy} onClick={() => void saveTask()}>{busy ? '正在保存…' : '保存监听任务'}</Button><Button kind="tertiary" href="/intelligence-monitoring/tasks">查看任务列表</Button></div>
    </section>
  </main>;
}

export function MonitoringTasksPage() {
  const { rows, loading, error, reload } = useMonitoringData('tasks');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => (rows as TaskRow[]).filter(row => (statusFilter === 'all' || row.status === statusFilter) && [row.name,row.task_code,row.status].join(' ').toLowerCase().includes(search.toLowerCase())), [rows,search,statusFilter]);
  useEffect(() => setPage(1), [search,statusFilter]);
  const columns: TpTableColumn<TaskRow>[] = [
    { key: 'task_code', header: '任务编号', primary: true, required: true, minWidth: 180 },
    { key: 'name', header: '监听任务', required: true, minWidth: 180 },
    { key: 'status', header: '任务状态', type: 'status', required: true, render: row => <Tag type={row.status === 'running' ? 'green' : row.status === 'paused' ? 'cool-gray' : 'blue'}>{row.status === 'draft' ? '草稿' : row.status === 'running' ? '运行中' : row.status === 'paused' ? '已暂停' : row.status}</Tag> },
    { key: 'cadence_minutes', header: '监听频率', type: 'number', render: row => row.cadence_minutes >= 1440 ? '每天一次' : '每 ' + row.cadence_minutes + ' 分钟' },
    { key: 'last_result_count', header: '最近新增', type: 'number' },
    { key: 'last_run_status', header: '最近运行结果', defaultVisible: true },
    { key: 'started_at', header: '监听开始时间', type: 'datetime', render: row => formatDate(row.started_at) },
    { key: 'last_run_at', header: '最近采集时间', type: 'datetime', render: row => formatDate(row.last_run_at) },
    { key: 'next_run_at', header: '下次执行时间', type: 'datetime', render: row => formatDate(row.next_run_at) },
    { key: 'last_error', header: '最近异常', longText: true, defaultVisible: false },
    { key: 'created_at', header: '创建时间', type: 'datetime', render: row => formatDate(row.created_at) },
    { key: 'actions', header: '操作', required: true, render: row => <Button kind="ghost" size="sm" onClick={async () => {
      const client = await getSupabaseClient();
      const isRunning = row.status === 'running';
      const stamp = new Date().toISOString();
      const { error: updateError } = await client.from('monitoring_tasks').update(
        isRunning ? { status: 'paused', next_run_at: null } : { status: 'running', started_at: row.started_at ?? stamp, next_run_at: stamp, last_error: null }
      ).eq('id', row.id);
      if (updateError) { window.alert('任务状态更新失败：' + updateError.message); return; }
      await reload();
    }}>{row.status === 'running' ? '暂停' : row.status === 'paused' ? '恢复' : '启动'}</Button> },
  ];
  return <main className="tp-intelligence-monitoring">
    <PageHeader breadcrumb="全球情报 / 公开内容监听" title="监听任务列表" description="统一查看任务配置、运行状态、采集频率与最近执行情况。" />
    <ModuleNavigation active="tasks" />
    {error && <InlineNotification kind="error" lowContrast title="读取任务失败" subtitle={error}  />}
    <TpDataTable<TaskRow> ariaLabel="监听任务列表" columns={columns} rows={filtered} rowKey="id" loading={loading} searchValue={search} onSearchChange={setSearch} onRetry={() => void reload()} emptyState="暂无监听任务。创建任务后会显示在这里。" columnSettingsKey="intelligence-monitoring-tasks" toolbarActions={<Select id="monitoring-task-status-filter" labelText="任务状态" size="sm" value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}><SelectItem value="all" text="全部状态" /><SelectItem value="draft" text="草稿" /><SelectItem value="running" text="运行中" /><SelectItem value="paused" text="已暂停" /><SelectItem value="error" text="异常" /></Select>} pagination={{ page, pageSize: 20, totalItems: filtered.length, onChange: nextPage => setPage(nextPage) }} />
  </main>;
}

export function MonitoringResultsPage() {
  const { rows, loading, error, reload } = useMonitoringData('results');
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => (rows as ResultRow[]).filter(row => (platformFilter === 'all' || row.platform === platformFilter) && (gradeFilter === 'all' || row.grade === gradeFilter) && [row.task_name,row.channel_name,row.author_name,row.content_text,row.intent_type,row.grade,platformLabel(row.platform)].join(' ').toLowerCase().includes(search.toLowerCase())), [rows,search,platformFilter,gradeFilter]);
  useEffect(() => setPage(1), [search,platformFilter,gradeFilter]);
  const columns: TpTableColumn<ResultRow>[] = [
    { key: 'platform', header: '监听平台', primary: true, required: true, minWidth: 120, render: row => platformLabel(row.platform) },
    { key: 'channel_name', header: '渠道 / 监听对象', required: true, minWidth: 180 },
    { key: 'task_name', header: '监听任务', minWidth: 160 },
    { key: 'task_started_at', header: '监听开始时间', type: 'datetime', render: row => formatDate(row.task_started_at) },
    { key: 'cadence_minutes', header: '监听频率', render: row => row.cadence_minutes ? (row.cadence_minutes >= 1440 ? '每天一次' : '每 ' + row.cadence_minutes + ' 分钟') : '尚未启动' },
    { key: 'content_type', header: '内容类型', minWidth: 100 },
    { key: 'content_text', header: '采集结果', longText: true, minWidth: 280, render: row => row.content_text || '—', exportValue: row => row.content_text },
    { key: 'author_name', header: '发布者', minWidth: 140 },
    { key: 'grade', header: 'AI 判定', required: true, render: row => gradeTag(row.grade) },
    { key: 'score', header: '意向评分', type: 'number', required: true, render: row => row.grade === 'unclassified' ? '待分析' : row.score + ' / 100' },
    { key: 'intent_type', header: '意向类型', minWidth: 150 },
    { key: 'rationale', header: 'AI 判定理由', longText: true, defaultVisible: false },
    { key: 'published_at', header: '原始发布时间', type: 'datetime', render: row => formatDate(row.published_at) },
    { key: 'captured_at', header: '发现时间', type: 'datetime', required: true, render: row => formatDate(row.captured_at) },
    { key: 'source_url', header: '原文链接', longText: true, defaultVisible: false, render: row => row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">打开原文</a> : '—', exportValue: row => row.source_url },
    { key: 'external_id', header: '平台内容 ID', longText: true, defaultVisible: false },
  ];
  return <main className="tp-intelligence-monitoring">
    <PageHeader breadcrumb="全球情报 / 公开内容监听" title="监听结果中心" description="按平台、渠道、任务与 AI 意向统一查看采集内容；支持搜索、列配置和 CSV 导出。" />
    <ModuleNavigation active="results" />
    {error && <InlineNotification kind="error" lowContrast title="读取结果失败" subtitle={error} actions={<Button kind="tertiary" size="sm" onClick={() => void reload()}>重试</Button>} />}
    <div className="tp-intelligence-monitoring__table-meta"><Tag type="blue">云端数据</Tag><span>最近 500 条采集记录 · AI 判定尚未完成时显示「待分析」</span><Button kind="tertiary" size="sm" onClick={() => void reload()}>刷新结果</Button></div>
    <TpDataTable<ResultRow> ariaLabel="监听结果中心" columns={columns} rows={filtered} rowKey="id" loading={loading} searchValue={search} onSearchChange={setSearch} onRetry={() => void reload()} emptyState="暂无采集结果。结果将在平台采集器正式启用并完成首次运行后进入此表格。" detailPanel detailTitle={row => row.task_name + ' · ' + row.channel_name} columnSettingsKey="intelligence-monitoring-results" toolbarActions={<div className="tp-intelligence-monitoring__filters"><Select id="monitoring-result-platform-filter" labelText="平台" size="sm" value={platformFilter} onChange={event => setPlatformFilter(event.currentTarget.value)}><SelectItem value="all" text="全部平台" />{platformOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}</Select><Select id="monitoring-result-grade-filter" labelText="AI 意向" size="sm" value={gradeFilter} onChange={event => setGradeFilter(event.currentTarget.value)}><SelectItem value="all" text="全部等级" /><SelectItem value="S" text="S 级" /><SelectItem value="A" text="A 级" /><SelectItem value="B" text="B 级" /><SelectItem value="C" text="C 级" /><SelectItem value="unclassified" text="待分析" /></Select></div>} pagination={{ page, pageSize: 20, totalItems: filtered.length, onChange: nextPage => setPage(nextPage) }} />
  </main>;
}

export function IntelligenceMonitoringRoute() {
  const location = useLocation();
  if (location.pathname.endsWith('/results')) return <MonitoringResultsPage />;
  if (location.pathname.endsWith('/tasks')) return <MonitoringTasksPage />;
  return <IntelligenceMonitoringPage />;
}
