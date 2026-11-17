import { useEffect, useMemo, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, Tile,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Pagination, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/prospect-hub.scss';

type RecordRow = {
  id: string; name?: string; status?: string; lifecycle_stage?: string; country_code?: string;
  address?: string; phone?: string; email?: string; website?: string; confidence_score?: number;
  lead_id?: string | null; raw_data?: Record<string, unknown> | null; created_at?: string;
};
type Occurrence = {
  id: string; is_removed?: boolean; provider?: string; captured_at?: string;
  record?: RecordRow | RecordRow[] | null;
  run?: { channel?: string; task_code?: string | null } | { channel?: string; task_code?: string | null }[] | null;
};
type Prospect = {
  id: string; name: string; country: string; website: string; email: string; phone: string;
  source: string; sources: string[]; status: 'removed' | 'crm' | 'pending' | 'discarded';
  score: number | null; capturedAt: string; taskCode: string;
};

const channelLabel = (channel?: string, provider?: string) => ({
  map_local_businesses: 'Google Maps', search_engine: '搜索引擎', facebook: 'Facebook Pages',
  instagram: 'Instagram', agent: '内置 Agent',
}[channel || ''] || channel || provider || '未知来源');
const statusLabel = (status: Prospect['status']) => ({ removed: '手动移除', discarded: '已废弃', crm: '已送入 CRM', pending: '待处理' }[status]);
const statusType = (status: Prospect['status']): 'red' | 'gray' | 'green' | 'blue' => status === 'removed' ? 'red' : status === 'discarded' ? 'gray' : status === 'crm' ? 'green' : 'blue';
const scoreOf = (raw?: Record<string, unknown> | null): number | null => {
  if (!raw) return null;
  const candidates = [raw.ai_score, raw.aiScore, raw.score, raw.scoring];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object') {
      const score = (value as Record<string, unknown>).score ?? (value as Record<string, unknown>).total;
      if (typeof score === 'number' && Number.isFinite(score)) return score;
    }
  }
  return null;
};
const fmt = (value: string) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';

export function ProspectDataPage() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const db = await getSupabaseClient();
        const { data, error: queryError } = await db.from('discovery_record_occurrences')
          .select('id,is_removed,provider,captured_at,record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey(id,name,status,lifecycle_stage,country_code,address,phone,email,website,confidence_score,lead_id,raw_data,created_at),run:discovery_runs!discovery_record_occurrences_run_id_owner_id_fkey(channel,task_code)')
          .order('captured_at', { ascending: false }).limit(10000);
        if (queryError) throw queryError;
        const occurrences = (data ?? []) as unknown as Occurrence[];
        const grouped = new Map<string, Prospect>();
        for (const occurrence of occurrences) {
          const record = Array.isArray(occurrence.record) ? occurrence.record[0] : occurrence.record;
          if (!record?.id) continue;
          const run = Array.isArray(occurrence.run) ? occurrence.run[0] : occurrence.run;
          const sourceLabel = channelLabel(run?.channel, occurrence.provider);
          const current = grouped.get(record.id);
          const isRemoved = occurrence.is_removed === true || record.status === 'removed';
          const isDiscarded = record.status === 'discarded';
          const nextStatus: Prospect['status'] = isRemoved ? 'removed' : isDiscarded ? 'discarded' : record.status === 'promoted' || !!record.lead_id ? 'crm' : 'pending';
          if (current) {
            if (!current.sources.includes(sourceLabel)) current.sources.push(sourceLabel);
            if (nextStatus === 'removed' || nextStatus === 'crm') current.status = nextStatus;
            continue;
          }
          grouped.set(record.id, {
            id: record.id, name: record.name || '未命名企业', country: record.country_code || '—',
            website: record.website || '', email: record.email || '', phone: record.phone || '',
            source: sourceLabel, sources: [sourceLabel], status: nextStatus,
            score: scoreOf(record.raw_data), capturedAt: occurrence.captured_at || record.created_at || '',
            taskCode: run?.task_code || '—',
          });
        }
        if (active) setRows([...grouped.values()]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '潜客数据读取失败');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const sources = useMemo(() => [...new Set(rows.flatMap(row => row.sources))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return (!term || [row.name,row.website,row.email,row.country].some(value => value.toLowerCase().includes(term)))
      && (source === 'all' || row.sources.includes(source)) && (status === 'all' || row.status === status);
  }), [rows, search, source, status]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const crmCount = rows.filter(row => row.status === 'crm').length;
  const removedCount = rows.filter(row => row.status === 'removed' || row.status === 'discarded').length;
  const scoredCount = rows.filter(row => row.score !== null).length;
  const sourceCounts = sources.map(label => ({ label, count: rows.filter(row => row.sources.includes(label)).length })).sort((a,b) => b.count-a.count);
  const maxSource = Math.max(1, ...sourceCounts.map(item => item.count));

  return (
    <main className="tp-prospect-hub">
      <header className="tp-prospect-hub__header">
        <div><p className="tp-prospect-hub__eyebrow">TRADEPILOT / CRM · GLOBAL PROSPECT DATABASE</p><h1>潜客数据</h1><p>汇聚所有渠道抓取的企业资产，追踪人工处理、AI 评分与 CRM 入库状态。</p></div>
        <Button kind="tertiary" renderIcon={CarbonIcons.Repeat} onClick={() => window.location.reload()}>刷新数据</Button>
      </header>
      {error && <InlineNotification kind="error" lowContrast title="数据读取失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      <div className="tp-prospect-hub__metrics">
        <Tile><span>抓取企业总量</span><strong>{rows.length.toLocaleString()}</strong><small>按企业记录去重</small></Tile>
        <Tile><span>已送入 CRM</span><strong>{crmCount.toLocaleString()}</strong><small>已关联正式线索</small></Tile>
        <Tile><span>人工移除 / 废弃</span><strong>{removedCount.toLocaleString()}</strong><small>保留历史状态便于审计</small></Tile>
        <Tile><span>已有 AI 评分</span><strong>{scoredCount.toLocaleString()}</strong><small>从现有记录评分字段读取</small></Tile>
      </div>
      <Tile className="tp-prospect-hub__panel">
        <div className="tp-prospect-hub__section-heading"><div><h2>获客来源分布</h2><p>按企业所关联的发现平台统计，可同时拥有多个来源。</p></div><Tag type="blue">{sources.length} 个来源平台</Tag></div>
        {loading ? <InlineLoading description="正在汇总来源平台…" /> : sourceCounts.length ? <div className="tp-prospect-hub__source-chart">
          {sourceCounts.map(item => <div key={item.label} className="tp-prospect-hub__source-row"><span>{item.label}</span><div><i style={{ width: (item.count / maxSource * 100) + '%' }} /></div><strong>{item.count.toLocaleString()}</strong></div>)}
        </div> : <p className="tp-prospect-hub__empty">暂无来源统计数据。</p>}
      </Tile>
      <Tile className="tp-prospect-hub__panel">
        <div className="tp-prospect-hub__section-heading"><div><h2>全部潜客记录</h2><p>包含抓取、移除、废弃及送入 CRM 的企业数据</p></div><Tag type="blue">{filtered.length.toLocaleString()} 条匹配</Tag></div>
        <div className="tp-prospect-hub__filters">
          <TextInput id="tp-prospect-data-search" labelText="搜索企业、网址、邮箱或国家" placeholder="搜索企业、网址、邮箱或国家" value={search} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} />
          <Select id="tp-prospect-data-source" labelText="获客来源" value={source} onChange={event => { setSource(event.currentTarget.value); setPage(1); }}>
            <SelectItem value="all" text="全部来源" />{sources.map(item => <SelectItem key={item} value={item} text={item} />)}
          </Select>
          <Select id="tp-prospect-data-status" labelText="处理状态" value={status} onChange={event => { setStatus(event.currentTarget.value); setPage(1); }}>
            <SelectItem value="all" text="全部状态" /><SelectItem value="pending" text="待处理" /><SelectItem value="crm" text="已送入 CRM" /><SelectItem value="removed" text="手动移除" /><SelectItem value="discarded" text="已废弃" />
          </Select>
        </div>
        <div className="tp-prospect-hub__table-wrap">
          {loading ? <div className="tp-prospect-hub__loading"><InlineLoading description="正在读取全部潜客数据…" /></div> : <Table size="lg">
            <TableHead><TableRow>{['企业名称','国家 / 地区','官方网站 / 邮箱','获客来源','AI 评分','处理状态','任务编码','抓取时间'].map(label => <TableHeader key={label}>{label}</TableHeader>)}</TableRow></TableHead>
            <TableBody>
              {visible.map(row => <TableRow key={row.id}>
                <TableCell><strong>{row.name}</strong></TableCell>
                <TableCell>{row.country}</TableCell>
                <TableCell><div className="tp-prospect-hub__contact">{row.website ? <a href={row.website.startsWith('http') ? row.website : 'https://' + row.website} target="_blank" rel="noreferrer">{row.website}</a> : '—'}<small>{row.email || row.phone || '暂无联系方式'}</small></div></TableCell>
                <TableCell><div className="tp-prospect-hub__source-tags">{row.sources.map(item => <Tag key={item} type="blue">{item}</Tag>)}</div></TableCell>
                <TableCell>{row.score === null ? '—' : <strong>{row.score} 分</strong>}</TableCell>
                <TableCell><Tag type={statusType(row.status)}>{statusLabel(row.status)}</Tag></TableCell>
                <TableCell><span className="tp-prospect-hub__code">{row.taskCode}</span></TableCell>
                <TableCell>{fmt(row.capturedAt)}</TableCell>
              </TableRow>)}
              {!visible.length && !loading && <TableRow><TableCell colSpan={8}>没有符合当前筛选条件的潜客记录。</TableCell></TableRow>}
            </TableBody>
          </Table>}
        </div>
        {!loading && <div className="tp-prospect-hub__pagination"><Pagination id="tp-prospect-data-pagination" page={page} pageSize={pageSize} pageSizes={[20,50,100]} totalItems={filtered.length} onChange={({page:nextPage,pageSize:nextSize})=>{setPage(nextPage);setPageSize(nextSize);}} /></div>}
      </Tile>
    </main>
  );
}
