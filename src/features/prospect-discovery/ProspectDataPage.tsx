import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AreaChart, DonutChart, SimpleBarChart } from '@carbon/charts-react';
import {
  Button, Link, InlineNotification, Select, SelectItem, Tag, TextInput, Tile,
  semanticIcons, TpDataTable,
  Tabs, TabList, Tab, TabPanels, TabPanel, WorldMapChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/prospect-hub.scss';

type RecordRow = {
  id: string; name?: string; status?: string; country_code?: string;
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
  score: number | null; capturedAt: string; taskCode: string; industry: string; companySize: string; businessType: string;
};
const channelLabel = (channel?: string, provider?: string) => ({
  map_local_businesses: 'Google Maps', search_engine: '搜索引擎', facebook: 'Facebook',
  instagram: 'Instagram', actor_discovery: '智能数据源', agent: '内置 Agent',
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
const textOf = (raw: Record<string, unknown> | null | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '未分类';
};
const fmt = (value: string) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—';
const chartTheme = () => document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white';
const countBy = (values: string[]) => {
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value || '未分类', (counts.get(value || '未分类') || 0) + 1));
  return [...counts.entries()].map(([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value);
};
const countryLabel = (code: string) => {
  if (!code || code === '—') return '未设置国家';
  try { return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};

export function ProspectDataPage() {
  
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [country, setCountry] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setError('');
    try {
      const db = await getSupabaseClient();
      const { data, error: queryError } = await db.from('discovery_record_occurrences')
        .select('id,is_removed,provider,captured_at,record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey(id,name,status,country_code,address,phone,email,website,confidence_score,lead_id,raw_data,created_at),run:discovery_runs!discovery_record_occurrences_run_id_owner_id_fkey(channel,task_code)')
        .order('captured_at', { ascending: false }).limit(10000);
      if (queryError) throw queryError;
      const occurrences = (data ?? []) as unknown as Occurrence[];
      const grouped = new Map<string, Prospect>();
      for (const occurrence of occurrences) {
        const record = Array.isArray(occurrence.record) ? occurrence.record[0] : occurrence.record;
        if (!record?.id) continue;
        const run = Array.isArray(occurrence.run) ? occurrence.run[0] : occurrence.run;
        const sourceLabel = channelLabel(run?.channel, occurrence.provider);
        const raw = record.raw_data || {};
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
          score: scoreOf(raw),
          capturedAt: occurrence.captured_at || record.created_at || '', taskCode: run?.task_code || '—',
          industry: textOf(raw, ['industry','industry_name','sector','category']),
          companySize: textOf(raw, ['company_size','employee_range','employees','size']),
          businessType: textOf(raw, ['business_type','business_model','company_type']),
        });
      }
      setRows([...grouped.values()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '潜客数据读取失败');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(() => [...new Set(rows.flatMap(row => row.sources))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map(row => row.country).filter(value => value !== '—'))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    return (!term || [row.name,row.website,row.email,row.country,row.industry].some(value => value.toLowerCase().includes(term)))
      && (source === 'all' || row.sources.includes(source))
      && (status === 'all' || row.status === status)
      && (country === 'all' || row.country === country);
  }), [rows, search, source, status, country]);
  const countriesCount = new Set(rows.map(row => row.country).filter(value => value !== '—')).size;

  const analytics = useMemo(() => {
    const active = rows.filter(row => row.status !== 'removed' && row.status !== 'discarded');
    const countryCounts = new Map<string, number>();
    active.forEach(row => { const code = row.country.trim().toUpperCase(); if (code && code !== '—') countryCounts.set(code, (countryCounts.get(code) || 0) + 1); });
    const countryMap = [...countryCounts.entries()].map(([code, value]) => ({ code, label: countryLabel(code), value })).sort((a, b) => b.value - a.value);
    const channelCounts = countBy(active.flatMap(row => row.sources));
    const statusCounts = countBy(rows.map(row => statusLabel(row.status)));
    const industryCounts = countBy(active.map(row => row.industry));
    const sizeCounts = countBy(active.map(row => row.companySize));
    const businessCounts = countBy(active.map(row => row.businessType));
    const scoreGroups = [
      { group: '高潜力 · 80+', value: active.filter(row => row.score !== null && row.score >= 80).length },
      { group: '中高 · 60–79', value: active.filter(row => row.score !== null && row.score >= 60 && row.score < 80).length },
      { group: '待培育 · 40–59', value: active.filter(row => row.score !== null && row.score >= 40 && row.score < 60).length },
      { group: '低分 · 0–39', value: active.filter(row => row.score !== null && row.score < 40).length },
      { group: '尚无评分', value: active.filter(row => row.score === null).length },
    ];
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setDate(1); date.setMonth(date.getMonth() - (11 - index));
      const key = date.toISOString().slice(0, 7);
      return { group: '新增潜客', date: new Date(date.getFullYear(), date.getMonth(), 1), value: active.filter(row => row.capturedAt && row.capturedAt.slice(0, 7) === key).length };
    });
    return { active, countryMap, channelCounts, statusCounts, industryCounts, sizeCounts, businessCounts, scoreGroups, monthly };
  }, [rows]);

  const theme = chartTheme();
  const baseOptions = { theme, toolbar: { enabled: false }, legend: { enabled: false } };
  const donutOptions = { ...baseOptions, height: '280px', donut: { center: { label: '潜客' } }, legend: { position: 'bottom' } };
  const barOptions = { ...baseOptions, height: '280px', color: { pairing: { numberOfVariants: 14, option: 1 } }, axes: { bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value', scaleType: 'linear' } } };
  const areaOptions = { ...baseOptions, height: '300px', axes: { bottom: { title: '月份', mapsTo: 'date', scaleType: 'time' }, left: { title: '新增数量', mapsTo: 'value', scaleType: 'linear' } }, curve: 'curveMonotoneX', points: { enabled: false } };

  return (
    <main className="tp-prospect-hub tp-prospect-data">
      <PageHeader className="tp-prospect-hub__header tp-prospect-data__header">
        <div><p className="tp-prospect-hub__eyebrow">TRADEPILOT / CRM · GLOBAL PROSPECT INTELLIGENCE</p><h1>潜客数据</h1><p>全球渠道统一汇聚 · 多维资产洞察 · 从发现到 CRM 转化</p></div>
        <div className="tp-prospect-data__actions">
          <Link href="/prospect-discovery" renderIcon={semanticIcons.search}>潜客发现</Link>
          <Link href="/prospect-history" renderIcon={semanticIcons.time}>历史任务</Link>
          <Button kind="ghost" renderIcon={semanticIcons.refresh} disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}>刷新数据</Button>
        </div>
      </PageHeader>

      {error && <InlineNotification kind="error" lowContrast title="数据读取失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      <section className="tp-prospect-data__overview">
        <Tile className="tp-prospect-data__panel tp-prospect-data__market">
          <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">GLOBAL REACH</p><h2>全球市场分布</h2><p>按有效潜客所在国家与地区展示资产覆盖情况</p></div><Tag type="blue">{countriesCount} 个市场</Tag></div>
          {analytics.countryMap.length ? <WorldMapChart data={analytics.countryMap} unitLabel="家潜客" selectedCode={country === 'all' ? undefined : country} onCountrySelect={code => { setCountry(current => current === code ? 'all' : code); setPage(1); }}/> : <div className="tp-prospect-data__empty">暂无国家 / 地区数据</div>}
        </Tile>
        <div className="tp-prospect-data__overview-side">
          <Tile className="tp-prospect-data__panel">
            <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">CHANNEL MIX</p><h2>发现渠道构成</h2><p>多渠道归因，同一企业可拥有多个来源</p></div></div>
            {analytics.channelCounts.length ? <DonutChart data={analytics.channelCounts} options={{ ...donutOptions, title: '来源平台' } as any} /> : <div className="tp-prospect-data__empty">暂无渠道数据</div>}
          </Tile>
          <Tile className="tp-prospect-data__panel">
            <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">LEAD QUALITY</p><h2>潜客质量分层</h2><p>基于已有评分字段；未评分记录单独呈现</p></div></div>
            <SimpleBarChart data={analytics.scoreGroups} options={{ ...barOptions, height: '230px' } as any} />
          </Tile>
        </div>
      </section>

      <section className="tp-prospect-data__panel tp-prospect-data__trend">
        <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">ACQUISITION MOMENTUM</p><h2>潜客增长趋势</h2><p>最近 12 个月有效潜客的采集时间分布</p></div><Tag type="teal">12 个月</Tag></div>
        <AreaChart data={analytics.monthly} options={areaOptions as any} />
      </section>

      <section className="tp-prospect-data__panel tp-prospect-data__dimensions">
        <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">MULTI-DIMENSIONAL INTELLIGENCE</p><h2>潜客多维分析</h2><p>按行业、企业规模、业务类型与处理状态切换观察维度；仅呈现数据源实际提供的字段。</p></div><Tag type="purple">多维洞察</Tag></div>
        <Tabs>
          <TabList aria-label="潜客分析维度">
            <Tab>行业结构</Tab><Tab>企业规模</Tab><Tab>业务类型</Tab><Tab>处理状态</Tab>
          </TabList>
          <TabPanels>
            <TabPanel><div className="tp-prospect-data__dimension-chart"><SimpleBarChart data={analytics.industryCounts.slice(0,12)} options={barOptions as any} />{!analytics.industryCounts.length && <p className="tp-prospect-data__empty">当前记录尚未提供可识别的行业字段。</p>}</div></TabPanel>
            <TabPanel><div className="tp-prospect-data__dimension-chart"><DonutChart data={analytics.sizeCounts} options={donutOptions as any} />{!analytics.sizeCounts.length && <p className="tp-prospect-data__empty">当前记录尚未提供企业规模字段。</p>}</div></TabPanel>
            <TabPanel><div className="tp-prospect-data__dimension-chart"><SimpleBarChart data={analytics.businessCounts.slice(0,12)} options={barOptions as any} />{!analytics.businessCounts.length && <p className="tp-prospect-data__empty">当前记录尚未提供业务类型字段。</p>}</div></TabPanel>
            <TabPanel><div className="tp-prospect-data__dimension-chart"><DonutChart data={analytics.statusCounts} options={donutOptions as any} /></div></TabPanel>
          </TabPanels>
        </Tabs>
      </section>

      <section className="tp-prospect-data__panel tp-prospect-data__all">
        <div className="tp-prospect-data__panel-heading"><div><p className="tp-prospect-data__kicker">PROSPECT MASTER DATA</p><h2>全部潜客</h2><p>统一资产表 · 可按来源、市场与处理状态筛选；保留全部发现记录及历史处理状态</p></div><Tag type="blue">{filtered.length.toLocaleString()} 条记录</Tag></div>
        <div className="tp-prospect-hub__filters tp-prospect-data__filters">
          <TextInput id="tp-prospect-data-search" labelText="搜索企业、网址、邮箱、行业" placeholder="输入企业名称或关键词" value={search} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} />
          <Select id="tp-prospect-data-source" labelText="获客来源" value={source} onChange={event => { setSource(event.currentTarget.value); setPage(1); }}><SelectItem value="all" text="全部来源" />{sources.map(item => <SelectItem key={item} value={item} text={item} />)}</Select>
          <Select id="tp-prospect-data-country" labelText="国家 / 地区" value={country} onChange={event => { setCountry(event.currentTarget.value); setPage(1); }}><SelectItem value="all" text="全部市场" />{countries.map(item => <SelectItem key={item} value={item} text={countryLabel(item)} />)}</Select>
          <Select id="tp-prospect-data-status" labelText="处理状态" value={status} onChange={event => { setStatus(event.currentTarget.value); setPage(1); }}><SelectItem value="all" text="全部状态" /><SelectItem value="pending" text="待处理" /><SelectItem value="crm" text="已送入 CRM" /><SelectItem value="removed" text="手动移除" /><SelectItem value="discarded" text="已废弃" /></Select>
        </div>
        <div className="tp-prospect-hub__table-wrap">
          <TpDataTable
        selectable
            ariaLabel="全部潜客列表"
            detailPanel
            selectionScopeKey={[search,source,status,country].join('|')}
            columnSettingsKey="prospect-master-data"
            rowKey="id"
            rows={filtered as (Prospect & Record<string, unknown>)[]}
            loading={loading}
            pagination={{page,pageSize:pageSize as 10|20|50|100,totalItems:filtered.length,onChange:(nextPage,nextSize)=>{setPage(nextPage);setPageSize(nextSize);}}}
            columns={[
              {key:'name',header:'企业名称',primary:true,minWidth:200,render:row=><div><strong>{row.name}</strong>{row.industry!=='未分类'&&<small>{row.industry}</small>}</div>},
              {key:'country',header:'国家 / 地区',minWidth:130,render:row=>countryLabel(row.country)},
              {key:'website',header:'官方网站 / 邮箱',minWidth:220,render:row=><div className="tp-prospect-hub__contact">{row.website?<a href={row.website.startsWith('http')?row.website:'https://'+row.website} target="_blank" rel="noreferrer">{row.website}</a>:'—'}<small>{row.email||row.phone||'暂无联系方式'}</small></div>},
              {key:'source',header:'获客来源',minWidth:180,render:row=><div className="tp-prospect-hub__source-tags">{row.sources.map(item=><Tag key={item} type="blue">{item}</Tag>)}</div>},
              {key:'score',header:'AI 评分',minWidth:90,render:row=>row.score===null?'—':<strong>{row.score} 分</strong>},
              {key:'status',header:'处理状态',minWidth:110,render:row=><Tag type={statusType(row.status)}>{statusLabel(row.status)}</Tag>},
              {key:'taskCode',header:'任务编码',minWidth:130,render:row=><span className="tp-prospect-hub__code">{row.taskCode}</span>},
              {key:'capturedAt',header:'抓取时间',minWidth:150,render:row=>fmt(row.capturedAt)},
            ]}
          />
        </div>
      </section>
      <footer className="tp-prospect-data__footer"><span>TRADEPILOT · GLOBAL PROSPECT DATABASE</span><span>真实发现记录 · 企业去重口径 · {loading ? '正在同步' : '已加载 ' + rows.length.toLocaleString() + ' 条企业资产'}</span></footer>
    </main>
  );
}
