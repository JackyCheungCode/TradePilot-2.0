import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, Tag, Tile, Table, TableHead,
  TableRow, TableHeader, TableBody, TableCell, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/prospect-hub.scss';

type Run = {
  id: string; task_code?: string | null; query?: string | null; countries?: string[] | null;
  channel?: string | null; providers?: string[] | null; status?: string | null;
  progress?: number | null; discovered_count?: number | null; created_lead_count?: number | null;
  message?: string | null; created_at?: string | null; updated_at?: string | null;
  search_config?: Record<string, unknown> | null;
};
type RunLog = { id: string; level?: string; message?: string; created_at?: string };

const statusLabel = (status?: string) => ({
  queued: '排队中', running: '执行中', completed: '已完成', partial: '部分完成',
  failed: '失败', cancelled: '已取消', paused: '已暂停',
}[status || ''] || status || '未知');
const statusType = (status?: string): 'green' | 'blue' | 'red' | 'gray' =>
  status === 'completed' ? 'green' : status === 'running' || status === 'queued' ? 'blue' : status === 'failed' ? 'red' : 'gray';
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';
const codeOf = (run: Run) => run.task_code || ('TPD-' + (run.created_at || '').replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + run.id.slice(0, 6).toUpperCase());

export function ProspectHistoryPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
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
  }, []);

  useEffect(() => {
    if (!runId) { setLogs([]); return; }
    let active = true;
    (async () => {
      setDetailLoading(true);
      try {
        const db = await getSupabaseClient();
        const { data, error: queryError } = await db.from('discovery_run_logs').select('*').eq('run_id', runId).order('created_at', { ascending: true }).limit(500);
        if (queryError) throw queryError;
        if (active) setLogs((data ?? []) as RunLog[]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '任务日志读取失败');
      } finally { if (active) setDetailLoading(false); }
    })();
    return () => { active = false; };
  }, [runId]);

  return (
    <main className="tp-prospect-hub">
      <header className="tp-prospect-hub__header">
        <div><p className="tp-prospect-hub__eyebrow">TRADEPILOT / CRM · PROSPECT INTELLIGENCE</p><h1>潜客发现 · 历史任务</h1><p>集中查看每次潜客发现任务的执行状态、搜索条件、采集数量与运行结果。</p></div>
        <Button kind="primary" renderIcon={CarbonIcons.Search} onClick={() => navigate('/prospect-discovery')}>创建潜客方案</Button>
      </header>
      {error && <InlineNotification kind="error" lowContrast title="读取失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      <Tile className="tp-prospect-hub__panel">
        <div className="tp-prospect-hub__section-heading"><div><h2>全部发现任务</h2><p>最近 200 条任务记录 · 点击任务查看详情与结果</p></div><Tag type="blue">{runs.length} 条任务</Tag></div>
        {loading ? <div className="tp-prospect-hub__loading"><InlineLoading description="正在读取历史任务…" /></div> : (
          <div className="tp-prospect-hub__table-wrap">
            <Table size="lg">
              <TableHead><TableRow>{['任务编码','搜索主题','目标市场','发现渠道','执行状态','捕获数量','创建时间',''].map(label => <TableHeader key={label}>{label}</TableHeader>)}</TableRow></TableHead>
              <TableBody>
                {runs.map(run => <TableRow key={run.id}>
                  <TableCell><strong className="tp-prospect-hub__code">{codeOf(run)}</strong></TableCell>
                  <TableCell>{run.query || '—'}</TableCell>
                  <TableCell>{(run.countries ?? []).join(', ') || '—'}</TableCell>
                  <TableCell>{run.channel || (run.providers ?? []).join(' / ') || '—'}</TableCell>
                  <TableCell><Tag type={statusType(run.status)}>{statusLabel(run.status)}</Tag></TableCell>
                  <TableCell>{(run.discovered_count ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{fmt(run.created_at)}</TableCell>
                  <TableCell><Button kind="ghost" size="sm" renderIcon={CarbonIcons.ArrowRight} onClick={() => navigate('/prospect-history/' + run.id)}>查看详情与结果</Button></TableCell>
                </TableRow>)}
                {!runs.length && <TableRow><TableCell colSpan={8}>暂无历史任务。创建并执行潜客方案后，任务记录会显示在这里。</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </Tile>
      {runId && (
        <Tile className="tp-prospect-hub__panel tp-prospect-hub__detail">
          <div className="tp-prospect-hub__section-heading"><div><p className="tp-prospect-hub__eyebrow">TASK DETAIL</p><h2>{selected ? codeOf(selected) : '任务详情'}</h2><p>{selected?.query || '未找到对应任务记录'}</p></div><Button kind="tertiary" renderIcon={CarbonIcons.ArrowLeft} onClick={() => navigate('/prospect-history')}>返回历史任务</Button></div>
          {selected && <div className="tp-prospect-hub__detail-grid">
            <div><span>执行状态</span><Tag type={statusType(selected.status)}>{statusLabel(selected.status)}</Tag></div>
            <div><span>目标市场</span><strong>{(selected.countries ?? []).join(', ') || '—'}</strong></div>
            <div><span>发现渠道</span><strong>{selected.channel || (selected.providers ?? []).join(' / ') || '—'}</strong></div>
            <div><span>捕获数量</span><strong>{(selected.discovered_count ?? 0).toLocaleString()}</strong></div>
            <div><span>已创建 CRM 线索</span><strong>{(selected.created_lead_count ?? 0).toLocaleString()}</strong></div>
            <div><span>进度</span><strong>{selected.progress ?? 0}%</strong></div>
            <div><span>开始时间</span><strong>{fmt(selected.created_at)}</strong></div>
            <div><span>最后更新</span><strong>{fmt(selected.updated_at)}</strong></div>
          </div>}
          {selected?.message && <p className="tp-prospect-hub__task-message">{selected.message}</p>}
          <div className="tp-prospect-hub__section-heading"><div><h3>执行日志</h3><p>任务的后台运行轨迹与结果反馈</p></div></div>
          {detailLoading ? <InlineLoading description="正在读取任务日志…" /> : <div className="tp-prospect-hub__logs">
            {logs.map(log => <div key={log.id}><time>{fmt(log.created_at)}</time><Tag type={log.level === 'error' ? 'red' : log.level === 'success' ? 'green' : 'gray'}>{log.level || 'info'}</Tag><span>{log.message || '—'}</span></div>)}
            {!logs.length && <p>暂无执行日志。该任务可能尚未开始，或没有记录日志。</p>}
          </div>}
        </Tile>
      )}
    </main>
  );
}
