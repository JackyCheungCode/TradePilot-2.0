import { PageHeader } from '@/design-system';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Link, TPSkeleton, InlineNotification, Tag, Tile, semanticIcons, WorldMapChart, TpDataTable,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { DonutChart, SimpleBarChart } from '@carbon/charts-react';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/prospect-hub.scss';

type Run = {
  id: string; task_code?: string | null; query?: string | null; countries?: string[] | null;
  channel?: string | null; providers?: string[] | null; status?: string | null;
  progress?: number | null; discovered_count?: number | null; created_lead_count?: number | null;
  message?: string | null; created_at?: string | null; updated_at?: string | null;
  search_config?: Record<string, unknown> | null;
};
type RunLog = { id: string; level?: string; message?: string; created_at?: string };
type RunResult = { id: string; is_removed?: boolean; provider?: string; record?: { id?: string; name?: string; website?: string; country_code?: string; status?: string; confidence_score?: number; lead_id?: string | null; email?: string | null; phone?: string | null } | null };

const statusLabel = (status?: string | null) => ({
  queued: '排队中', running: '执行中', completed: '已完成', partial: '部分完成',
  failed: '失败', cancelled: '已取消', paused: '已暂停',
}[status || ''] || status || '未知');
const statusType = (status?: string | null): 'green' | 'blue' | 'red' | 'gray' =>
  status === 'completed' ? 'green' : status === 'running' || status === 'queued' ? 'blue' : status === 'failed' ? 'red' : 'gray';
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';
const channelLabel = (value?: string | null) => value === 'actor_discovery' ? '智能数据源' : value === 'map_local_businesses' ? '地图与本地商家' : value === 'search_engine' ? '搜索引擎' : value || '—';
const providerLabel = (value?: string) => value === 'actor_gateway' ? '智能数据源' : value || '—';
const codeOf = (run: Run) => run.task_code || ('TPD-' + (run.created_at || '').replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + run.id.slice(0, 6).toUpperCase());

export function ProspectHistoryPage() {
  const { runId } = useParams();
  
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [results, setResults] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [runPage,setRunPage]=useState(1);const [runPageSize,setRunPageSize]=useState<10|20|50|100>(20);
  const [resultPage,setResultPage]=useState(1);const [resultPageSize,setResultPageSize]=useState<10|20|50|100>(20);
  const selected = runs.find(run => run.id === runId) ?? null;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const db = await getSupabaseClient();
        const { data, error: queryError } = await db.from('discovery_runs').select('*').order('created_at', { ascending: false }).limit(200);
        if (queryError) throw queryError;
        if (active) setRuns((data ?? []) as Run[]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '历史任务读取失败');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!runId) { setLogs([]); return; }
    let active = true;
    (async () => {
      setDetailLoading(true); setError('');
      try {
        const db = await getSupabaseClient();
        const { data, error: queryError } = await db.from('discovery_run_logs').select('*').eq('run_id', runId).order('created_at', { ascending: true }).limit(500);
        if (queryError) throw queryError;
        if (active) setLogs((data ?? []) as RunLog[]);
        const { data: resultData, error: resultError } = await db.from('discovery_record_occurrences')
          .select('id,is_removed,provider,record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey(id,name,website,country_code,status,confidence_score,lead_id,email,phone)')
          .eq('run_id', runId).order('captured_at', { ascending: false }).limit(1000);
        if (resultError) throw resultError;
        if (active) setResults((resultData ?? []) as unknown as RunResult[]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '任务日志读取失败');
      } finally { if (active) setDetailLoading(false); }
    })();
    return () => { active = false; };
  }, [runId, reloadKey]);

  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    runs.forEach(run => { const key = statusLabel(run.status); counts.set(key, (counts.get(key) || 0) + 1); });
    return [...counts.entries()].map(([group, value]) => ({ group, value }));
  }, [runs]);
  const channelData = useMemo(() => {
    const counts = new Map<string, number>();
    runs.forEach(run => { const key = channelLabel(run.channel) !== '—' ? channelLabel(run.channel) : (run.providers || []).map(providerLabel).join(' / ') || '未标记渠道'; counts.set(key, (counts.get(key) || 0) + 1); });
    return [...counts.entries()].map(([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [runs]);
  const targetMarketData = useMemo(() => {
    const counts = new Map<string, number>();
    runs.forEach(run => (run.countries || []).forEach(country => { const code = String(country).trim().toUpperCase(); if (code) counts.set(code, (counts.get(code) || 0) + 1); }));
    return [...counts.entries()].map(([code, value]) => { let label = code; try { label = new Intl.DisplayNames(['zh-TW'], { type: 'region' }).of(code) || code; } catch {} return { code, label, value }; }).sort((a, b) => b.value - a.value);
  }, [runs]);
  const resultCountryData = useMemo(() => {
    const counts = new Map<string, number>();
    results.forEach(item => { const code = String(item.record?.country_code || '').trim().toUpperCase(); if (code && code !== 'UNKNOWN') counts.set(code, (counts.get(code) || 0) + 1); });
    return [...counts.entries()].map(([code, value]) => { let label = code; try { label = new Intl.DisplayNames(['zh-TW'], { type: 'region' }).of(code) || code; } catch {} return { code, label, value }; }).sort((a, b) => b.value - a.value);
  }, [results]);
  const donutOptions = { theme: document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white', height: '260px', donut: { center: { label: '任务' } }, legend: { position: 'bottom' }, toolbar: { enabled: false } };
  const barOptions = { theme: document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white', height: '260px', color: { pairing: { numberOfVariants: 14, option: 1 } }, axes: { bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value', scaleType: 'linear' } }, legend: { enabled: false }, toolbar: { enabled: false } };

  return (
    <main className="tp-prospect-hub">
      <PageHeader className="tp-prospect-hub__header">
        <div><p className="tp-prospect-hub__eyebrow">TRADEPILOT / CRM · PROSPECT INTELLIGENCE</p><h1>潜客发现 · 历史任务</h1><p>集中查看每次潜客发现任务的执行状态、搜索条件、采集数量与运行结果。</p></div>
        <Link href="/prospect-discovery" renderIcon={semanticIcons.search}>创建潜客方案</Link>
      </PageHeader>
      {error && <InlineNotification kind="error" lowContrast title="读取失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {!loading && runs.length > 0 && <section className="tp-prospect-history__analytics">
        <Tile className="tp-prospect-hub__panel"><div className="tp-prospect-hub__section-heading"><div><h2>任务执行状态</h2><p>最近 200 条历史任务。</p></div></div><DonutChart data={statusData} options={donutOptions as any}/></Tile>
        <Tile className="tp-prospect-hub__panel"><div className="tp-prospect-hub__section-heading"><div><h2>发现渠道分布</h2><p>按任务配置的发现渠道归类。</p></div></div><SimpleBarChart data={channelData} options={barOptions as any}/></Tile>
        <Tile className="tp-prospect-hub__panel tp-prospect-history__market"><div className="tp-prospect-hub__section-heading"><div><h2>目标市场覆盖</h2><p>按历史任务设置的目标国家 / 地区统计，不代表实际捕获量。</p></div></div><WorldMapChart data={targetMarketData} unitLabel="次任务" showRanking={false}/></Tile>
      </section>}
      <Tile className="tp-prospect-hub__panel">
        <div className="tp-prospect-hub__section-heading"><div><h2>全部发现任务</h2><p>最近 200 条任务记录 · 点击任务查看详情与结果</p></div><Tag type="blue">{runs.length} 条任务</Tag></div>
        {loading ? <div className="tp-prospect-hub__loading"><TPSkeleton variant="table" rows={6}/></div> : (
          <div className="tp-prospect-hub__table-wrap">
            <TpDataTable
        selectable
              ariaLabel="潜客发现历史任务"
              detailPanel
              error={error||null} onRetry={()=>setReloadKey(value=>value+1)}
              selectionScopeKey="prospect-history-runs"
              columnSettingsKey="prospect-history-runs"
              rowKey="id"
              rows={runs as (Run & Record<string,unknown>)[]}
              pagination={{page:runPage,pageSize:runPageSize,totalItems:runs.length,onChange:(nextPage,nextSize)=>{setRunPage(nextPage);setRunPageSize(nextSize);}}}
              columns={[
                {key:'task_code',header:'任务编码',primary:true,minWidth:140,render:run=><strong className="tp-prospect-hub__code">{codeOf(run)}</strong>},
                {key:'query',header:'搜索主题',minWidth:200,render:run=>run.query||'—'},
                {key:'countries',header:'目标市场',minWidth:150,render:run=>(run.countries??[]).join(', ')||'—'},
                {key:'channel',header:'发现渠道',minWidth:160,render:run=>channelLabel(run.channel)!=='—'?channelLabel(run.channel):(run.providers??[]).map(providerLabel).join(' / ')||'—'},
                {key:'status',header:'执行状态',minWidth:110,render:run=><Tag type={statusType(run.status)}>{statusLabel(run.status)}</Tag>},
                {key:'discovered_count',header:'捕获数量',minWidth:100,render:run=>(run.discovered_count??0).toLocaleString()},
                {key:'created_at',header:'创建时间',minWidth:150,render:run=>fmt(run.created_at)},
              ]}
              rowActions={[{key:'view',label:'查看详情与结果',onClick:run=>{window.location.assign('/prospect-history/'+run.id)}}]}
            />
            {!runs.length&&<p className="tp-prospect-hub__empty">暂无历史任务。创建并执行潜客方案后，任务记录会显示在这里。</p>}
          </div>
        )}
      </Tile>
      {runId && (
        <Tile className="tp-prospect-hub__panel tp-prospect-hub__detail">
          <div className="tp-prospect-hub__section-heading"><div><p className="tp-prospect-hub__eyebrow">TASK DETAIL</p><h2>{selected ? codeOf(selected) : '任务详情'}</h2><p>{selected?.query || '未找到对应任务记录'}</p></div><Link href="/prospect-history" renderIcon={semanticIcons.back}>返回历史任务</Link></div>
          {selected && <div className="tp-prospect-hub__detail-grid">
            <div><span>执行状态</span><Tag type={statusType(selected.status)}>{statusLabel(selected.status)}</Tag></div>
            <div><span>目标市场</span><strong>{(selected.countries ?? []).join(', ') || '—'}</strong></div>
            <div><span>发现渠道</span><strong>{channelLabel(selected.channel) !== '—' ? channelLabel(selected.channel) : (selected.providers ?? []).map(providerLabel).join(' / ') || '—'}</strong></div>
            <div><span>捕获数量</span><strong>{(selected.discovered_count ?? 0).toLocaleString()}</strong></div>
            <div><span>已创建 CRM 线索</span><strong>{(selected.created_lead_count ?? 0).toLocaleString()}</strong></div>
            <div><span>进度</span><strong>{selected.progress ?? 0}%</strong></div>
            <div><span>开始时间</span><strong>{fmt(selected.created_at)}</strong></div>
            <div><span>最后更新</span><strong>{fmt(selected.updated_at)}</strong></div>
          </div>}
          {selected?.message && <p className="tp-prospect-hub__task-message">{selected.message}</p>}
          <div className="tp-prospect-hub__section-heading"><div><h3>本次任务国家分布</h3><p>基于当前任务关联的实际发现记录。</p></div></div>
          {resultCountryData.length ? <WorldMapChart data={resultCountryData} unitLabel="条记录"/> : <p className="tp-prospect-hub__empty">当前任务的结果尚无可识别国家 / 地区数据。</p>}

          <div className="tp-prospect-hub__section-heading"><div><h3>执行日志</h3><p>任务的后台运行轨迹与结果反馈</p></div></div>
          <div className="tp-prospect-hub__section-heading"><div><h3>本次任务捕获结果</h3><p>仅显示关联到当前任务的企业记录</p></div><Tag type="blue">{results.length} 条结果</Tag></div>
          <div className="tp-prospect-hub__table-wrap">
            <TpDataTable
        selectable
              ariaLabel="本次任务捕获结果"
              detailPanel
              error={error||null} onRetry={()=>setReloadKey(value=>value+1)}
              selectionScopeKey="prospect-history-results"
              columnSettingsKey="prospect-history-results"
              rowKey="id"
              rows={results as (RunResult & Record<string,unknown>)[]}
              pagination={{page:resultPage,pageSize:resultPageSize,totalItems:results.length,onChange:(nextPage,nextSize)=>{setResultPage(nextPage);setResultPageSize(nextSize);}}}
              columns={[
                {key:'name',header:'企业名称',primary:true,minWidth:180,render:item=>item.record?.name||'未命名企业'},
                {key:'website',header:'官网',minWidth:180,render:item=>item.record?.website||'—'},
                {key:'country_code',header:'国家',minWidth:100,render:item=>item.record?.country_code||'—'},
                {key:'provider',header:'来源',minWidth:120,render:item=>providerLabel(item.provider)},
                {key:'confidence_score',header:'AI 置信度',minWidth:110,render:item=>item.record?.confidence_score??'—'},
                {key:'status',header:'处理状态',minWidth:120,render:item=>{const removed=item.is_removed||item.record?.status==='removed';const converted=item.record?.status==='promoted'||!!item.record?.lead_id;return <Tag type={removed?'red':converted?'green':'blue'}>{removed?'手动移除':converted?'已送入 CRM':'待处理'}</Tag>}},
              ]}
            />
            {!results.length&&<p className="tp-prospect-hub__empty">该任务暂未关联捕获结果。</p>}
          </div>
          {detailLoading ? <TPSkeleton variant="text" rows={5}/> : <div className="tp-prospect-hub__logs">
            {logs.map(log => <div key={log.id}><time>{fmt(log.created_at)}</time><Tag type={log.level === 'error' ? 'red' : log.level === 'success' ? 'green' : 'gray'}>{log.level || 'info'}</Tag><span>{log.message || '—'}</span></div>)}
            {!logs.length && <p>暂无执行日志。该任务可能尚未开始，或没有记录日志。</p>}
          </div>}
        </Tile>
      )}
    </main>
  );
}
