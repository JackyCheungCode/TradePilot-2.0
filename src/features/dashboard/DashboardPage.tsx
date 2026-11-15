import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, TextInput, Tile, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/dashboard.scss';

type Row = { id: string; created_at: string; status?: string };
type Metric = { key: string; label: string; value: number; previous: number; daily: number[]; href: string; icon: string; polarity: 'positive' | 'negative'; unit?: string };
type Activity = { id: string; label: string; title: string; createdAt: string; href: string };
type PendingItem = { key: string; label: string; count: number; href: string; tone: 'warning' | 'error' | 'info' };
type DashboardData = { metrics: Metric[]; dailyLabels: string[]; updatedAt: string; activities: Activity[]; pending: PendingItem[] };
const DAY = 86400000;
const periodOptions = [
  { value: 'week', label: '最近一周' }, { value: 'month', label: '最近一个月' },
  { value: 'quarter', label: '最近一个季度' }, { value: 'year', label: '最近一年' },
  { value: 'custom', label: '自定义日期' },
];
const metricSources = [
  { key: 'discoveries', label: '全球发现', table: 'discovery_records', href: '/prospect-console', icon: 'Globe', polarity: 'positive' },
  { key: 'leads', label: '新增线索', table: 'leads', href: '/leads', icon: 'UserFollow', polarity: 'positive' },
  { key: 'accounts', label: '新增客户', table: 'crm_accounts', href: '/accounts', icon: 'Building', polarity: 'positive' },
  { key: 'contacts', label: '新增联系人', table: 'crm_contacts', href: '/contacts', icon: 'UserMultiple', polarity: 'positive' },
  { key: 'opportunities', label: '新增商机', table: 'crm_opportunities', href: '/opportunities', icon: 'ChartLine', polarity: 'positive' },
  { key: 'quotes', label: '新增报价单', table: 'trade_documents', filter: ['document_type', 'quotation'], href: '/quotes', icon: 'Document', polarity: 'positive' },
  { key: 'orders', label: '新增销售订单', table: 'trade_orders', filter: ['order_type', 'sales'], href: '/sales-orders', icon: 'DocumentTasks', polarity: 'positive' },
  { key: 'shipments', label: '新增发运', table: 'trade_shipments', href: '/shipments', icon: 'Delivery', polarity: 'positive' },
  { key: 'payments', label: '新增收款', table: 'trade_payments', href: '/payments', icon: 'Currency', polarity: 'positive', dateField: 'received_date' },
  { key: 'products', label: '新增产品', table: 'trade_products', href: '/products', icon: 'Product', polarity: 'positive' },
  { key: 'agents', label: 'Agent 任务', table: 'agent_runs', href: '/agent', icon: 'Bot', polarity: 'positive' },
  { key: 'failures', label: '失败任务', table: 'agent_runs', href: '/agent', icon: 'WarningAlt', polarity: 'negative', statusFilter: 'failed' },
] as const;
function dateKey(date: Date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
function getRange(period: string, from: string, to: string) {
  const end = period === 'custom' && to ? new Date(to + 'T23:59:59.999') : new Date();
  const start = period === 'custom' && from ? new Date(from + 'T00:00:00') : new Date(end);
  if (period !== 'custom') {
    const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - periodDays + 1);
  }
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const days = Math.min(366, Math.max(1, Math.round((endDay - startDay) / DAY) + 1));
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);
  const previousEnd = new Date(start.getTime() - 1);
  return { start, end, previousStart, previousEnd, days };
}
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length < 2 ? 2 : 2 + index * 116 / (values.length - 1);
    const y = 34 - (value - min) / range * 29;
    return x + ',' + y;
  }).join(' ');
  return <svg className="tp-dashboard__sparkline" viewBox="0 0 120 38" role="img" aria-label="所选周期内每日变化趋势">
    <polyline points={points} className={"tp-dashboard__sparkline-line " + tone} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function pct(value: number, previous: number) {
  if (previous === 0) return value === 0 ? '0%' : '新增长';
  const change = (value - previous) / previous * 100;
  return (change > 0 ? '+' : '') + change.toFixed(1) + '%';
}
export function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const range = useMemo(() => getRange(period, from, to), [period, from, to, refreshTick]);

  const load = useCallback(async () => {
    if (period === 'custom' && (!from || !to || from > to)) return;
    setError('');
    try {
      const db = await getSupabaseClient();
      const startIso = range.previousStart.toISOString();
      const endIso = range.end.toISOString();
      const previousEndIso = range.previousEnd.toISOString();
      const dateFieldFor = (source: typeof metricSources[number]) => 'dateField' in source ? source.dateField : 'created_at';
      const results = await Promise.all(metricSources.map(async source => {
        let query: any = db.from(source.table).select('id,' + dateFieldFor(source), { count: 'exact' });
        if ('filter' in source && source.filter) query = query.eq(source.filter[0], source.filter[1]);
        if ('statusFilter' in source && source.statusFilter) query = query.eq('status', source.statusFilter);
        const dateField = dateFieldFor(source);
        const currentFrom = dateField === 'received_date' ? dateKey(range.start) : range.start.toISOString();
        const currentTo = dateField === 'received_date' ? dateKey(range.end) : endIso;
        const previousFrom = dateField === 'received_date' ? dateKey(range.previousStart) : startIso;
        const previousTo = dateField === 'received_date' ? dateKey(range.previousEnd) : previousEndIso;
        if (['accounts', 'contacts', 'opportunities', 'products'].includes(source.key)) query = query.eq('is_archived', false);
        const [current, previous] = await Promise.all([
          query.gte(dateField, currentFrom).lte(dateField, currentTo).range(0, 9999),
          (async () => {
            let q: any = db.from(source.table).select('id', { count: 'exact', head: true });
            if ('filter' in source && source.filter) q = q.eq(source.filter[0], source.filter[1]);
            if ('statusFilter' in source && source.statusFilter) q = q.eq('status', source.statusFilter);
            if (['accounts', 'contacts', 'opportunities', 'products'].includes(source.key)) q = q.eq('is_archived', false);
            return q.gte(dateField, previousFrom).lte(dateField, previousTo).range(0, 9999);
          })(),
        ]);
        if (current.error) throw new Error(source.label + '数据读取失败：' + current.error.message);
        if (previous.error) throw new Error(source.label + '对比数据读取失败：' + previous.error.message);
        return { source, rows: (current.data || []) as unknown as Row[], value: current.count ?? current.data?.length ?? 0, previous: previous.count ?? previous.data?.length ?? 0 };
      }));
      const labels = Array.from({ length: range.days }, (_, index) => {
        const d = new Date(range.start); d.setDate(d.getDate() + index); return dateKey(d);
      });
      const metrics = results.map(({ source, rows, value, previous }) => {
        const counts = new Map(labels.map(label => [label, 0]));
        rows.forEach(row => {
          const raw = (row as unknown as Record<string, string>)[dateFieldFor(source)];
          if (!raw) return;
          const key = String(raw).slice(0, 10);
          if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
        });
        return {
          key: source.key, label: source.label, value, previous,
          daily: labels.map(label => counts.get(label) || 0), href: source.href,
          icon: source.icon, polarity: source.polarity,
        } as Metric;
      });
      // Discovery records are the common entity pool for Google, Facebook, Instagram and search channels.
      // A dedicated console endpoint owns canonical de-duplication; use its daily entity series for the global intelligence card.
      const client = await getSupabaseClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const params = new URLSearchParams({ from: dateKey(range.start), to: dateKey(range.end) });
        const previousParams = new URLSearchParams({ from: dateKey(range.previousStart), to: dateKey(range.previousEnd) });
        const [response, previousResponse] = await Promise.all([
          fetch('/api/v1/prospect-console?' + params.toString(), { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }),
          fetch('/api/v1/prospect-console?' + previousParams.toString(), { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }),
        ]);
        if (response.ok) {
          const payload = await response.json() as { data?: { metrics?: { prospectCount?: number }; daily?: Array<{ date: string; count: number }> } };
          const previousPayload = previousResponse.ok ? await previousResponse.json() as { data?: { metrics?: { prospectCount?: number } } } : null;
          if (payload.data) {
            const discovery = metrics.find(item => item.key === 'discoveries');
            if (discovery) {
              discovery.value = payload.data.metrics?.prospectCount ?? discovery.value;
              discovery.previous = previousPayload?.data?.metrics?.prospectCount ?? discovery.previous;
              const map = new Map((payload.data.daily || []).map(item => [item.date, item.count]));
              discovery.daily = labels.map(label => map.get(label) || 0);
            }
          }
        }
      }
      const activitySpecs = [
        { table: 'leads', field: 'name', label: '新增线索', href: '/leads' },
        { table: 'crm_accounts', field: 'account_name', label: '新增客户', href: '/accounts', archived: true },
        { table: 'crm_contacts', field: 'full_name', label: '新增联系人', href: '/contacts', archived: true },
        { table: 'crm_opportunities', field: 'name', label: '新增商机', href: '/opportunities', archived: true },
        { table: 'trade_documents', field: 'title', label: '报价单更新', href: '/quotes', filter: ['document_type', 'quotation'] },
        { table: 'trade_orders', field: 'order_number', label: '销售订单更新', href: '/sales-orders', filter: ['order_type', 'sales'] },
        { table: 'trade_shipments', field: 'shipment_no', label: '发运更新', href: '/shipments' },
        { table: 'trade_payments', field: 'payment_no', label: '收款更新', href: '/payments' },
        { table: 'agent_runs', field: 'goal', label: 'Agent 任务', href: '/agent' },
      ] as const;
      const activityResults = await Promise.all(activitySpecs.map(async spec => {
        let q: any = db.from(spec.table).select('id,created_at,' + spec.field);
        if ('filter' in spec && spec.filter) q = q.eq(spec.filter[0], spec.filter[1]);
        if ('archived' in spec && spec.archived) q = q.eq('is_archived', false);
        const result = await q.order('created_at', { ascending: false }).limit(5);
        if (result.error) throw new Error(spec.label + '活动读取失败：' + result.error.message);
        return (result.data || []).map((row: Record<string, string>) => ({
          id: spec.table + ':' + row.id, label: spec.label,
          title: row[spec.field] || '未命名记录', createdAt: row.created_at, href: spec.href,
        })) as Activity[];
      }));
      const activities = activityResults.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
      const pendingSpecs = [
        { key: 'new-discoveries', label: '待审核潜客', table: 'discovery_records', href: '/prospect-console', status: 'new', tone: 'warning' },
        { key: 'draft-quotes', label: '待处理报价单', table: 'trade_documents', href: '/quotes', status: 'draft', tone: 'warning', filter: ['document_type', 'quotation'] },
        { key: 'draft-orders', label: '待确认销售订单', table: 'trade_orders', href: '/sales-orders', status: 'draft', tone: 'warning', filter: ['order_type', 'sales'] },
        { key: 'running-agents', label: '正在运行的 Agent', table: 'agent_runs', href: '/agent', status: 'running', tone: 'info' },
        { key: 'failed-agents', label: '失败的 Agent 任务', table: 'agent_runs', href: '/agent', status: 'failed', tone: 'error' },
      ] as const;
      const pending = (await Promise.all(pendingSpecs.map(async spec => {
        let q: any = db.from(spec.table).select('id', { count: 'exact', head: true }).eq('status', spec.status);
        if ('filter' in spec && spec.filter) q = q.eq(spec.filter[0], spec.filter[1]);
        const result = await q;
        if (result.error) throw new Error(spec.label + '数量读取失败：' + result.error.message);
        return { key: spec.key, label: spec.label, count: result.count || 0, href: spec.href, tone: spec.tone };
      }))).filter(item => item.count > 0) as PendingItem[];
      setData({ metrics, dailyLabels: labels, updatedAt: new Date().toISOString(), activities, pending });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '工作台数据读取失败。');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [period, from, to, range.start.getTime(), range.end.getTime(), range.previousStart.getTime(), range.previousEnd.getTime(), range.days]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshTick(tick => tick + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = data?.metrics || [];
  const busy = loading || refreshing;

  return <main className="tp-dashboard">
    <header className="tp-dashboard__header">
      <div><p className="tp-dashboard__eyebrow">TRADEPILOT / OVERVIEW</p><h1>工作台</h1><p>全球市场情报、客户转化与贸易运营的统一业务视图</p></div>
      <div className="tp-dashboard__toolbar">
        <Select id="dashboard-period" labelText="统计周期" size="md" value={period} onChange={event => setPeriod(event.currentTarget.value)}>
          {periodOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}
        </Select>
        {period === 'custom' && <div className="tp-dashboard__date-range">
          <TextInput id="dashboard-from" type="date" labelText="开始日期" size="md" value={from} onChange={event => setFrom(event.currentTarget.value)} />
          <TextInput id="dashboard-to" type="date" labelText="结束日期" size="md" value={to} onChange={event => setTo(event.currentTarget.value)} />
        </div>}
        <Button kind="tertiary" size="md" disabled={busy} onClick={() => { setRefreshing(true); setRefreshTick(tick => tick + 1); }}><CarbonIcons.Renew size={16}/> 刷新</Button>
      </div>
    </header>
    {error && <InlineNotification kind="error" title="工作台数据加载失败" subtitle={error} lowContrast />}
    {period === 'custom' && (!from || !to || from > to) && <InlineNotification kind="warning" title="请选择有效日期范围" subtitle="开始日期和结束日期均需填写，且开始日期不能晚于结束日期。" lowContrast />}
    <section className="tp-dashboard__section-heading"><div><h2>业务指标</h2><p>各业务板块统一按所选日期范围统计，卡片趋势按日绘制</p></div><span>{periodOptions.find(item => item.value === period)?.label} · {data?.dailyLabels[0] || '—'} 至 {data?.dailyLabels.at(-1) || '—'}</span></section>
    {loading && !data ? <div className="tp-dashboard__loading"><InlineLoading description="正在汇聚各业务板块数据…" /></div> : <section className="tp-dashboard__metrics" aria-label="跨模块业务指标">
      {metrics.map((item, index) => {
        const Icon = (CarbonIcons as unknown as Record<string, ComponentType<{ size?: number }>>)[item.icon] || CarbonIcons.ChartLine;
        const change = item.value - item.previous;
        const favorable = item.polarity === 'negative' ? change <= 0 : change >= 0;
        const tone = change === 0 ? 'neutral' : favorable ? 'positive' : 'negative';
        return <Tile key={item.key} className={'tp-dashboard__metric tp-dashboard__metric--' + (index % 4)}>
          <button type="button" className={"tp-dashboard__metric-action tp-dashboard__metric-action--" + tone} onClick={() => navigate(item.href)} aria-label={'打开' + item.label}>
            <div className="tp-dashboard__metric-copy"><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong><small>{change > 0 ? '↑ ' : change < 0 ? '↓ ' : '— '}{pct(item.value, item.previous)} <span>对比上一周期</span></small></div>
            <div className="tp-dashboard__metric-visual"><Icon size={20}/><Sparkline values={item.daily} tone={tone}/></div>
          </button>
        </Tile>;
      })}
    </section>}
    <section className="tp-dashboard__lower-grid">
      <Tile className="tp-dashboard__panel tp-dashboard__intelligence">
        <div className="tp-dashboard__panel-head"><div><h2>全球情报与潜客发现</h2><p>Google、Facebook、Instagram 与搜索渠道统一去重后的发现趋势</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/prospect-console')}>查看全球情报 <CarbonIcons.ArrowRight size={16}/></Button></div>
        <div className="tp-dashboard__summary-number">{metrics.find(item => item.key === 'discoveries')?.value.toLocaleString() || '0'}<span> 条发现记录</span></div>
        <div className="tp-dashboard__daily-bars">{(() => { const values = metrics.find(item => item.key === 'discoveries')?.daily || []; const max = Math.max(1, ...values); return <svg viewBox="0 0 360 88" preserveAspectRatio="none" role="img" aria-label="每日全球情报发现数量柱状图">{values.map((value, index) => { const barWidth = Math.max(1, 360 / Math.max(1, values.length) - 2); const x = index * 360 / Math.max(1, values.length); const height = Math.max(2, value / max * 84); return <rect key={index} x={x} y={88-height} width={barWidth} height={height}><title>{data?.dailyLabels[index]} · {value}</title></rect>; })}</svg>; })()}</div>
      </Tile>
      <Tile className="tp-dashboard__panel tp-dashboard__pipeline">
        <div className="tp-dashboard__panel-head"><div><h2>客户与销售转化</h2><p>从潜在客户到商机、报价与订单</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/leads')}>查看线索 <CarbonIcons.ArrowRight size={16}/></Button></div>
        <div className="tp-dashboard__pipeline-list">{metrics.filter(item => ['leads','accounts','opportunities','quotes','orders'].includes(item.key)).map(item => <button key={item.key} type="button" onClick={() => navigate(item.href)}><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong><div><svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width={Math.max(3, item.value / Math.max(1, ...metrics.map(metric => metric.value)) * 100)} height="4" /></svg></div></button>)}</div>
      </Tile>
      <Tile className="tp-dashboard__panel tp-dashboard__agents">
        <div className="tp-dashboard__panel-head"><div><h2>Agent 与自动化</h2><p>任务运行情况与异常信号</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/agent')}>进入 Agent <CarbonIcons.ArrowRight size={16}/></Button></div>
        <div className="tp-dashboard__agent-stats"><div><span>任务总数</span><strong>{metrics.find(item => item.key === 'agents')?.value.toLocaleString() || '0'}</strong></div><div><span>失败任务</span><strong className="is-error">{metrics.find(item => item.key === 'failures')?.value.toLocaleString() || '0'}</strong></div></div>
      </Tile>
      <Tile className="tp-dashboard__panel tp-dashboard__operations">
        <div className="tp-dashboard__panel-head"><div><h2>贸易运营</h2><p>报价、订单、发运与收款的周期新增量</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/sales-orders')}>查看订单 <CarbonIcons.ArrowRight size={16}/></Button></div>
        <div className="tp-dashboard__trade-grid">{metrics.filter(item => ['quotes','orders','shipments','payments','products'].includes(item.key)).map(item => <button key={item.key} onClick={() => navigate(item.href)}><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></button>)}</div>
      </Tile>
    </section>
    <section className="tp-dashboard__bottom-grid">
      <Tile className="tp-dashboard__panel tp-dashboard__pending">
        <div className="tp-dashboard__panel-head"><div><h2>待处理事项</h2><p>需要关注或继续处理的业务记录</p></div><CarbonIcons.Task size={20}/></div>
        {data?.pending.length ? <div className="tp-dashboard__pending-list">{data.pending.map(item => <button key={item.key} type="button" onClick={() => navigate(item.href)}><span className={'tp-dashboard__pending-dot ' + item.tone}/><span>{item.label}</span><strong>{item.count.toLocaleString()}</strong><CarbonIcons.ChevronRight size={16}/></button>)}</div> : <p className="tp-dashboard__empty">当前没有待处理事项</p>}
      </Tile>
      <Tile className="tp-dashboard__panel tp-dashboard__activity">
        <div className="tp-dashboard__panel-head"><div><h2>最近业务活动</h2><p>跨模块最新创建的业务记录</p></div><CarbonIcons.Activity size={20}/></div>
        {data?.activities.length ? <div className="tp-dashboard__activity-list">{data.activities.map(item => <button key={item.id} type="button" onClick={() => navigate(item.href)}><span><strong>{item.label}</strong><small>{item.title}</small></span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></button>)}</div> : <p className="tp-dashboard__empty">暂无最近业务活动</p>}
      </Tile>
    </section>
    <footer className="tp-dashboard__footer"><span>数据来源：TradePilot 各业务模块数据库</span><span>{busy ? '正在同步…' : '最近同步：' + (lastUpdated || '—')} · 自动刷新间隔 60 秒</span></footer>
  </main>;
}
