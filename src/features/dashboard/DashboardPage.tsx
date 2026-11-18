import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, SimpleBarChart, WordCloudChart, BubbleChart,
} from '@carbon/charts-react';
import {
  Button, Link, ClickableTile, InlineLoading, InlineNotification, Tile, Tag, Select, SelectItem,
  Tabs, TabList, Tab, TabPanels, TabPanel, ContentSwitcher, Switch, CarbonIcons, WorldMapChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/dashboard.scss';

type Row = Record<string, any>;
type DashboardData = {
  accounts: Row[]; contacts: Row[]; leads: Row[]; opportunities: Row[]; documents: Row[];
  orders: Row[]; shipments: Row[]; payments: Row[]; products: Row[]; agentRuns: Row[];
  activities: Row[]; discovery: Row[]; discoveryRuns: Row[]; updatedAt: string;
};
const BASE_CURRENCY = 'USD';
const number = (value: number) => Number(value || 0).toLocaleString('zh-CN');
const money = (value: number) => BASE_CURRENCY + ' ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dateKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const countryLabelEnglish = (code: string) => {
  if (!code || code === 'unknown') return 'Unknown';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};
const countryLabel = (code: string) => {
  if (!code || code === 'unknown') return '未设置国家';
  try { return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};
const chartTheme = () => document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white';
const safeArray = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const amountFrom = (row: Row, amount: unknown): number | null => {
  const value = Number(amount || 0);
  const currency = String(row.currency_code || row.currency || BASE_CURRENCY).toUpperCase();
  if (currency === BASE_CURRENCY) return value;
  const base = row.amount_base ?? row.metadata?.sales_order?.totals?.grand_total_base ?? row.totals?.grand_total_base;
  return base !== null && base !== undefined && Number.isFinite(Number(base)) ? Number(base) : null;
};
const inPeriod = (row: Row, start: Date | null) => !start || !row.created_at || new Date(row.created_at) >= start;

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('30d');
  const [country, setCountry] = useState('all');
  const [marketMetric, setMarketMetric] = useState('prospects');

  const load = useCallback(async () => {
    setError('');
    try {
      const db = await getSupabaseClient();
      const queries = await Promise.all([
        db.from('crm_accounts').select('id,country_code,created_at,status,industry,account_name,source_lead_id').eq('is_archived', false).limit(5000),
        db.from('leads').select('id,country_code,status,created_at,is_formal').limit(5000),
        db.from('crm_opportunities').select('id,account_id,stage,status,amount,currency_code,probability,forecast_probability,created_at,expected_close_date,is_archived').eq('is_archived', false).limit(5000),
        db.from('trade_documents').select('id,order_id,document_type,status,currency_code,totals,created_at,issued_at').eq('document_type', 'quotation').limit(5000),
        db.from('trade_orders').select('id,order_number,status,currency_code,created_at,crm_account_id,metadata,order_type').eq('order_type', 'sales').limit(5000),
        db.from('trade_shipments').select('id,status,created_at,planned_ship_date,actual_ship_date,shipment_value,currency_code,exception_flag,account_id,order_id').limit(5000),
        db.from('trade_payments').select('id,payment_type,status,payment_date,received_date,currency,amount,net_received,amount_base,refund_amount,refund_date,created_at,account_id').limit(5000),
        db.from('agent_runs').select('id,goal,status,created_at,started_at,completed_at,error_message,actual_cost_usd').order('created_at', { ascending: false }).limit(5000),
        db.from('crm_activities').select('id,activity_type,summary,due_at,status,created_at,account_id,opportunity_id').order('created_at', { ascending: false }).limit(5000),
        db.from('discovery_records').select('id,channel,status,country_code,created_at,lead_id').limit(5000),
        db.from('crm_contacts').select('id,account_id,created_at,is_active,is_archived').eq('is_archived', false).limit(5000),
        db.from('trade_products').select('id,sku,name,category,brand,is_active,is_archived,created_at').eq('is_archived', false).limit(5000),
        db.from('discovery_runs').select('id,query,search_config,channel,created_at,countries').order('created_at', { ascending: false }).limit(5000),
      ]);
      const failed = queries.find(result => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      setData({
        accounts: safeArray(queries[0].data), contacts: safeArray(queries[10].data), leads: safeArray(queries[1].data),
        opportunities: safeArray(queries[2].data), documents: safeArray(queries[3].data),
        orders: safeArray(queries[4].data), shipments: safeArray(queries[5].data),
        payments: safeArray(queries[6].data), products: safeArray(queries[11].data), agentRuns: safeArray(queries[7].data),
        activities: safeArray(queries[8].data), discovery: safeArray(queries[9].data), discoveryRuns: safeArray(queries[12].data),
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '工作台数据读取失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startDate = useMemo(() => {
    if (period === 'all') return null;
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    if (period === 'year') { date.setDate(1); date.setMonth(date.getMonth() - 11); }
    else date.setDate(date.getDate() - (period === '90d' ? 89 : 29));
    return date;
  }, [period]);

  const scoped = useMemo(() => {
    const matchesCountry = (code: unknown) => country === 'all' || String(code || '').toUpperCase() === country;
    const accounts = (data?.accounts || []).filter(row => matchesCountry(row.country_code));
    const accountIds = new Set(accounts.map(row => row.id));
    const leads = (data?.leads || []).filter(row => matchesCountry(row.country_code));
    const opportunities = (data?.opportunities || []).filter(row => country === 'all' || accountIds.has(row.account_id));
    const orders = (data?.orders || []).filter(row => country === 'all' || accountIds.has(row.crm_account_id));
    const orderIds = new Set(orders.map(row => row.id));
    const documents = (data?.documents || []).filter(row => country === 'all' || orderIds.has(row.order_id));
    const shipments = (data?.shipments || []).filter(row => country === 'all' || accountIds.has(row.account_id) || orderIds.has(row.order_id));
    const payments = (data?.payments || []).filter(row => country === 'all' || accountIds.has(row.account_id));
    const contacts = (data?.contacts || []).filter(row => country === 'all' || accountIds.has(row.account_id));
    const activities = (data?.activities || []).filter(row => country === 'all' || accountIds.has(row.account_id));
    const discovery = (data?.discovery || []).filter(row => matchesCountry(row.country_code));
    const within = (rows: Row[]) => rows.filter(row => inPeriod(row, startDate));
    return {
      accounts, contacts, leads, opportunities, orders, documents, shipments, payments, products: data?.products || [], activities, discovery,
      newAccounts: within(accounts), newLeads: within(leads), newOpportunities: within(opportunities),
      newOrders: within(orders), newShipments: within(shipments), newDiscovery: within(discovery),
      agentRuns: data?.agentRuns || [],
    };
  }, [data, country, startDate]);

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.accounts || []).forEach(row => {
      const code = String(row.country_code || '').toUpperCase();
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    });
    (data?.leads || []).forEach(row => { const code = String(row.country_code || '').toUpperCase(); if (code) counts.set(code, (counts.get(code) || 0) + 1); });
    return [...counts.keys()].sort();
  }, [data?.accounts]);

  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    const distributionRows = marketMetric === 'leads' ? scoped.leads : marketMetric === 'converted' ? scoped.accounts.filter(row => Boolean(row.source_lead_id)) : scoped.accounts;
    distributionRows.forEach(row => {
      const code = String(row.country_code || 'unknown').toUpperCase();
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const countries = [...counts.entries()].map(([code, value]) => ({
      code, name: countryLabel(code), value, share: total ? value / total * 100 : 0,
    })).sort((a, b) => b.value - a.value);
    const status = new Map<string, number>();
    scoped.accounts.forEach(row => {
      const label = row.status === 'active' ? '活跃' : row.status === 'inactive' ? '非活跃' : '其他';
      status.set(label, (status.get(label) || 0) + 1);
    });
    const channels = new Map<string, number>();
    scoped.discovery.forEach(row => {
      const label = String(row.channel || '其他');
      channels.set(label, (channels.get(label) || 0) + 1);
    });
    const days = period === '90d' ? 30 : period === 'year' ? 12 : 30;
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      if (period === 'year') { date.setDate(1); date.setMonth(date.getMonth() - (days - index - 1)); }
      else date.setDate(date.getDate() - (period === '90d' ? 89 - index * 3 : days - index - 1));
      const next = new Date(date);
      if (period === 'year') next.setMonth(next.getMonth() + 1);
      else next.setDate(next.getDate() + (period === '90d' ? 3 : 1));
      const value = scoped.newAccounts.filter(row => {
        const created = new Date(row.created_at);
        return created >= date && created < next;
      }).length;
      return { group: '新增客户', date, value };
    });
    const stages = [
      ['潜客发现', scoped.discovery.length], ['潜在客户', scoped.leads.length],
      ['正式客户', scoped.accounts.length], ['销售商机', scoped.opportunities.length],
      ['报价单', scoped.documents.length], ['销售订单', scoped.orders.length],
    ].map(([group, value]) => ({ group: String(group), key: '记录数', value: Number(value) }));
    const shipmentStatuses = new Map<string, number>();
    scoped.shipments.forEach(row => shipmentStatuses.set(String(row.status || '未知'), (shipmentStatuses.get(String(row.status || '未知')) || 0) + 1));
    const agentStatuses = new Map<string, number>();
    scoped.agentRuns.forEach(row => agentStatuses.set(String(row.status || '未知'), (agentStatuses.get(String(row.status || '未知')) || 0) + 1));
    return {
      countries, status: [...status.entries()].map(([group, value]) => ({ group, value })),
      channels: [...channels.entries()].map(([group, value]) => ({ group, value })),
      daily, stages, shipments: [...shipmentStatuses.entries()].map(([group, value]) => ({ group, key: '发运单', value })),
      agents: [...agentStatuses.entries()].map(([group, value]) => ({ group, key: 'Agent 任务', value })),
    };
  }, [scoped, period, marketMetric]);


  const globalMapData = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (code: unknown) => {
      const normalized = String(code || '').trim().toUpperCase();
      if (!normalized || normalized === 'UNKNOWN') return;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    };
    if (marketMetric === 'prospects') scoped.discovery.filter(row => !row.lead_id && !['removed', 'discarded'].includes(String(row.status || '').toLowerCase())).forEach(row => add(row.country_code));
    if (marketMetric === 'leads') scoped.leads.forEach(row => add(row.country_code));
    if (marketMetric === 'customers') scoped.accounts.forEach(row => add(row.country_code));
    if (marketMetric === 'opportunities') {
      const accountCountries = new Map(scoped.accounts.map(row => [String(row.id), row.country_code]));
      scoped.opportunities.forEach(row => add(accountCountries.get(String(row.account_id))));
    }
    return [...counts.entries()].map(([code, value]) => ({
      code, name: countryLabelEnglish(code), label: countryLabel(code), value,
    })).sort((a, b) => b.value - a.value);
  }, [marketMetric, scoped]);

  const searchKeywords = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of data?.discoveryRuns || []) {
      const config = run.search_config && typeof run.search_config === 'object' ? run.search_config as Row : {};
      const keyword = String(config.originalQuery || run.query || config.translatedQuery || '').trim();
      if (!keyword || keyword.length > 100) continue;
      counts.set(keyword, (counts.get(keyword) || 0) + 1);
    }
    return [...counts.entries()].map(([word, count]) => ({ word, count, value: count, group: count >= 5 ? '高频关键词' : count >= 2 ? '中频关键词' : '低频关键词' })).sort((a, b) => b.count - a.count).slice(0, 80);
  }, [data?.discoveryRuns]);

  const marketBubbles = useMemo(() => {
    const prospects = new Map<string, number>();
    const leads = new Map<string, number>();
    const opportunities = new Map<string, number>();
    const accountCountries = new Map((data?.accounts || []).map(row => [String(row.id), String(row.country_code || '').toUpperCase()]));
    const add = (map: Map<string, number>, code: unknown) => {
      const normalized = String(code || '').trim().toUpperCase();
      if (normalized && normalized !== 'UNKNOWN') map.set(normalized, (map.get(normalized) || 0) + 1);
    };
    (data?.discovery || []).filter(row => !row.lead_id && !['removed', 'discarded'].includes(String(row.status || '').toLowerCase())).forEach(row => add(prospects, row.country_code));
    (data?.leads || []).forEach(row => add(leads, row.country_code));
    (data?.opportunities || []).forEach(row => add(opportunities, accountCountries.get(String(row.account_id))));
    return [...prospects.entries()].map(([code, prospectCount]) => {
      const leadCount = leads.get(code) || 0;
      const opportunityCount = opportunities.get(code) || 0;
      return {
        group: countryLabelEnglish(code), country: countryLabel(code), x: prospectCount,
        y: prospectCount ? Number((leadCount / prospectCount * 100).toFixed(1)) : 0,
        opportunityCount, bubbleSize: Math.max(1, opportunityCount),
      };
    }).filter(row => row.x > 0).sort((a, b) => b.x - a.x).slice(0, 40);
  }, [data?.accounts, data?.discovery, data?.leads, data?.opportunities]);

  const effectiveQuotes = scoped.documents.filter(row => ['sent', 'viewed', 'accepted'].includes(String(row.status || '').toLowerCase()));
  const quoteTotal = effectiveQuotes.reduce((sum, row) => {
    const total = amountFrom(row, row.totals?.grand_total);
    return total === null ? sum : sum + total;
  }, 0);
  const confirmedSalesOrders = scoped.orders.filter(row => row.status === 'active');
  const orderTotal = confirmedSalesOrders.reduce((sum, row) => {
    const total = amountFrom(row, row.metadata?.sales_order?.totals?.grand_total);
    return total === null ? sum : sum + total;
  }, 0);
  const opportunityTotal = scoped.opportunities.reduce((sum, row) => {
    const total = amountFrom(row, row.amount);
    return total === null ? sum : sum + total;
  }, 0);
  const weightedOpportunityTotal = scoped.opportunities.reduce((sum, row) => {
    const total = amountFrom(row, row.amount);
    const probability = row.forecast_probability ?? row.probability;
    if (total === null || probability === null || probability === undefined) return sum;
    const rate = Number(probability) > 1 ? Number(probability) / 100 : Number(probability);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? sum + total * rate : sum;
  }, 0);
  const collected = scoped.payments.filter(row => row.payment_type === 'receipt' && ['confirmed', 'partially_reconciled', 'reconciled', 'returned'].includes(String(row.status || '').toLowerCase()));
  const refunds = scoped.payments.filter(row => row.payment_type === 'refund' && row.status === 'returned');
  const receivedTotal = collected.reduce((sum, row) => {
    const total = amountFrom(row, row.net_received ?? row.amount);
    return total === null ? sum : sum + total;
  }, 0) - refunds.reduce((sum, row) => {
    const total = amountFrom(row, row.refund_amount ?? row.amount);
    return total === null ? sum : sum + total;
  }, 0);
  const unconverted = [
    ...scoped.opportunities.filter(row => amountFrom(row, row.amount) === null),
    ...scoped.documents.filter(row => amountFrom(row, row.totals?.grand_total) === null),
    ...scoped.orders.filter(row => amountFrom(row, row.metadata?.sales_order?.totals?.grand_total) === null),
    ...scoped.payments.filter(row => amountFrom(row, row.amount) === null),
  ].length;
  const overdueActivities = scoped.activities.filter(row => row.due_at && new Date(row.due_at) < new Date() && !['completed', 'done', 'cancelled'].includes(String(row.status || '').toLowerCase()));
  const overdueReceivables = scoped.orders.flatMap(row => safeArray(row.metadata?.sales_order?.payment_schedule).filter(step => step.due_date && step.due_date < dateKey(new Date()) && Number(step.paid_amount || 0) + 0.005 < Number(step.amount || 0)).map(step => ({ order: row.order_number, step })));
  const overdueReceivableCount = overdueReceivables.length;
  const shipmentExceptions = scoped.shipments.filter(row => row.exception_flag || ['exception', 'delayed', 'failed', 'damaged', 'lost'].includes(String(row.status || '').toLowerCase()));
  const failedAgents = scoped.agentRuns.filter(row => row.status === 'failed');
  const riskCount = overdueActivities.length + overdueReceivableCount + shipmentExceptions.length + failedAgents.length;
  const theme = chartTheme();
  const commonOptions = { theme, toolbar: { enabled: false }, legend: { enabled: false } };
  const metrics = [
    { label: '潜客资产', value: number(scoped.leads.length), detail: '本期新增 ' + number(scoped.newLeads.length), icon: CarbonIcons.UserFollow, href: '/leads' },
    { label: '正式客户', value: number(scoped.accounts.length), detail: '本期新增 ' + number(scoped.newAccounts.length), icon: CarbonIcons.Building, href: '/accounts' },
    { label: '销售商机', value: money(opportunityTotal), detail: number(scoped.opportunities.length) + ' 个有效商机', icon: CarbonIcons.ChartLine, href: '/opportunities' },
    { label: '有效报价金额', value: effectiveQuotes.length ? money(quoteTotal) : '暂无有效报价', detail: number(effectiveQuotes.length) + ' 份已发送 / 已查看 / 已接受报价', icon: CarbonIcons.Document, href: '/quotes' },
    { label: '销售订单', value: confirmedSalesOrders.length ? money(orderTotal) : '暂无有效订单', detail: number(confirmedSalesOrders.length) + ' 个已启用销售订单', icon: CarbonIcons.ShoppingCart, href: '/sales-orders' },
    { label: '发运履约', value: number(scoped.shipments.length), detail: number(shipmentExceptions.length) + ' 项异常', icon: CarbonIcons.Delivery, href: '/shipments' },
    { label: '实际回款', value: collected.length || refunds.length ? money(receivedTotal) : '暂无实际收款', detail: collected.length ? number(collected.length) + ' 笔已确认收款' : '尚无已确认收款记录', icon: CarbonIcons.CurrencyDollar, href: '/payments' },
    { label: '经营风险', value: number(riskCount), detail: '逾期跟进 ' + overdueActivities.length + ' · 逾期应收 ' + overdueReceivableCount + ' · 发运异常 ' + shipmentExceptions.length + ' · Agent 失败 ' + failedAgents.length, icon: CarbonIcons.WarningAlt, href: '/agent' },
  ];

  const areaOptions = {
    ...commonOptions, title: '客户新增趋势', height: '280px',
    axes: { bottom: { title: '日期', mapsTo: 'date', scaleType: 'time' }, left: { title: '新增客户', mapsTo: 'value', scaleType: 'linear' } },
    curve: 'curveMonotoneX', points: { enabled: false },
  };
  const wordCloudOptions = {
    ...commonOptions, height: '340px',
    wordCloud: { wordMapsTo: 'word', fontSizeMapsTo: 'count' },
    tooltip: { enabled: true, wordLabel: '搜索关键词', valueLabel: '使用次数' },
  };
  const bubbleOptions = {
    ...commonOptions, title: '全球市场开发潜力', height: '340px',
    axes: {
      bottom: { title: '潜客数量', mapsTo: 'x', scaleType: 'linear' },
      left: { title: '潜客转线索率 (%)', mapsTo: 'y', scaleType: 'linear' },
    },
    bubble: { radiusMapsTo: 'bubbleSize', radiusLabel: '商机数量' },
    tooltip: { enabled: true },
  };
  const barOptions = { ...commonOptions, height: '260px', axes: { bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value', scaleType: 'linear' } } };
  const agentOptions = { ...commonOptions, height: '260px', axes: { bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value', scaleType: 'linear' } } };

  return <main className="tp-workbench">
    <header className="tp-workbench__header">
      <div>
        <p className="tp-workbench__eyebrow">TRADEPILOT / GLOBAL BUSINESS COMMAND CENTER</p>
        <h1>全球贸易经营驾驶舱</h1>
        <p>从全球市场情报、客户开发到订单履约与资金回收，统一掌握经营全貌。</p>
      </div>
      <div className="tp-workbench__actions">
        <span className="tp-workbench__updated">{data ? '更新于 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '等待数据'}</span>
        <Button kind="tertiary" size="md" disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}><CarbonIcons.Renew size={16}/> 刷新数据</Button>
      </div>
    </header>

    <section className="tp-workbench__filters" aria-label="全局筛选">
      <Select id="workbench-period" labelText="统计周期" value={period} onChange={event => setPeriod(event.currentTarget.value)}>
        <SelectItem value="30d" text="最近 30 天"/><SelectItem value="90d" text="最近 90 天"/><SelectItem value="year" text="最近 12 个月"/><SelectItem value="all" text="全部时间"/>
      </Select>
      <Select id="workbench-country" labelText="目标市场" value={country} onChange={event => setCountry(event.currentTarget.value)}>
        <SelectItem value="all" text="全球市场"/>{countryOptions.map(code => <SelectItem key={code} value={code} text={countryLabel(code)}/>)}
      </Select>
      <Tag type="blue">总览币种：USD</Tag>
      <Button kind="ghost" size="sm" onClick={() => { setPeriod('30d'); setCountry('all'); setMarketMetric('prospects'); }}>重置筛选</Button>
      <span className="tp-workbench__filter-note">金额优先采用原币为 USD 或已有基础币快照；未配置汇率的外币不参与合计。</span>
    </section>

    {error && <InlineNotification kind="error" title="工作台数据读取失败" subtitle={error} lowContrast/>}
    {loading && !data ? <div className="tp-workbench__loading"><InlineLoading description="正在汇聚全球业务数据…"/></div> : <>
      <section className="tp-workbench__global-map tp-workbench__panel" aria-label="全球业务资产分布">
        <div className="tp-workbench__panel-heading">
          <div><p className="tp-workbench__kicker">GLOBAL BUSINESS GEOGRAPHY</p><h2>全球业务资产分布</h2><p>按国家 / 地区查看四类业务资产数量；切换指标后地图即时更新。</p></div>
          <Tag type="blue">{globalMapData.length} 个国家 / 地区</Tag>
        </div>
        <div className="tp-workbench__global-map-layout">
          <div className="tp-workbench__global-map-chart">
            <WorldMapChart data={globalMapData} unitLabel="条记录" showRanking={false} selectedCode={country === 'all' ? undefined : country} onCountrySelect={code => setCountry(current => current === code ? 'all' : code)}/>
          </div>
          <div className="tp-workbench__global-map-switch" aria-label="地图数据维度">
            <span>查看维度</span>
            <ContentSwitcher
              size="sm"
              selectedIndex={['prospects', 'leads', 'opportunities', 'customers'].indexOf(marketMetric)}
              onChange={(selection: { name?: string | number }) => {
                if (selection.name !== undefined) setMarketMetric(String(selection.name));
              }}
            >
              <Switch name="prospects" text="潜客" />
              <Switch name="leads" text="线索" />
              <Switch name="opportunities" text="商机" />
              <Switch name="customers" text="客户" />
            </ContentSwitcher>
            <p className="tp-workbench__global-map-switch-detail">
              {marketMetric === 'prospects' ? '发现记录' : marketMetric === 'leads' ? 'CRM 线索' : marketMetric === 'opportunities' ? '有效商机' : '正式客户'}
            </p>
          </div>
        </div>
        <div className="tp-workbench__global-map-ranking">{globalMapData.slice(0, 8).map((item, index) => <div key={item.code}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong><b>{number(item.value)}</b></div>)}</div>
      </section>

      <section className="tp-workbench__intelligence-grid" aria-label="市场情报分析">
        <Tile className="tp-workbench__panel tp-workbench__wordcloud">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">DISCOVERY SEARCH INTELLIGENCE</p><h2>潜客发现关键词</h2><p>按历史发现任务中的原始搜索关键词统计使用频次。</p></div><Tag type="purple">{searchKeywords.length} 个关键词</Tag></div>
          {searchKeywords.length ? <WordCloudChart data={searchKeywords} options={wordCloudOptions as any}/> : <div className="tp-workbench__empty">暂无可统计的搜索关键词。创建潜客发现任务后，这里会自动汇总关键词频次。</div>}
        </Tile>
        <Tile className="tp-workbench__panel tp-workbench__bubble">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">MARKET DEVELOPMENT OPPORTUNITY</p><h2>全球市场开发潜力</h2><p>横轴为潜客数量，纵轴为潜客转线索率，气泡大小代表商机数量。</p></div><Tag type="teal">{marketBubbles.length} 个市场</Tag></div>
          {marketBubbles.length ? <BubbleChart data={marketBubbles.map(row => ({ group: row.group, x: row.x, y: row.y, opportunityCount: row.opportunityCount, bubbleSize: row.bubbleSize }))} options={bubbleOptions as any}/> : <div className="tp-workbench__empty">需要有国家信息的潜客记录，才能计算各市场开发潜力。</div>}
          <div className="tp-workbench__bubble-legend"><span>气泡越大 = 商机越多</span><span>转化率 = 线索数 ÷ 潜客数</span></div>
        </Tile>
      </section>

      <section className="tp-workbench__metrics" aria-label="核心经营指标">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return <ClickableTile key={metric.label} className={'tp-workbench__metric tp-workbench__metric--' + index} onClick={() => navigate(metric.href)}>
            <span className="tp-workbench__metric-icon"><Icon size={20}/></span>
            <span className="tp-workbench__metric-label">{metric.label}</span>
            <strong>{metric.value}</strong><small>{metric.detail}</small>
            <span className="tp-workbench__metric-link">查看业务明细 <CarbonIcons.ArrowRight size={14}/></span>
          </ClickableTile>;
        })}
      </section>

      <section className="tp-workbench__panel tp-workbench__conversion">
        <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">BUSINESS PIPELINE</p><h2>业务链路规模</h2><p>各模块独立记录数，用于观察业务资产规模；不将不同对象数量直接解释为严格转化率。</p></div><Tag type="cool-gray">全链路概览</Tag></div>
        <SimpleBarChart data={chartData.stages} options={{ ...barOptions, title: '业务对象数量', height: '240px' } as any}/>
      </section>

      <section className="tp-workbench__panel tp-workbench__tabs-panel">
        <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">BUSINESS ANALYTICS</p><h2>业务分区分析</h2><p>主工作台保留核心数据，详细分析按业务分区展开。</p></div></div>
        <Tabs>
          <TabList aria-label="工作台业务分析分区">
            <Tab>销售与商机</Tab><Tab>报价与订单</Tab><Tab>发运与履约</Tab><Tab>财务与收款</Tab><Tab>Agent 与执行</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <div className="tp-workbench__tab-grid">
                <div className="tp-workbench__chart"><h3>商机阶段分布</h3>{scoped.opportunities.length ? <SimpleBarChart data={Object.entries(scoped.opportunities.reduce((acc: Record<string, number>, row) => { const key = String(row.stage || row.status || '未设置'); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([group, value]) => ({ group, value }))} options={barOptions as any}/> : <p className="tp-workbench__empty">暂无商机数据</p>}</div>
                <div className="tp-workbench__chart"><h3>商机金额（USD 可换算口径）</h3><strong className="tp-workbench__large-value">{money(opportunityTotal)}</strong><p>有效商机 {number(scoped.opportunities.length)} 个；按已填写的成交概率计算加权金额：{money(weightedOpportunityTotal)}。概率缺失的商机不参与加权。</p><Link href="/opportunities" renderIcon={CarbonIcons.ArrowRight}>进入商机管理</Link></div>
                <div className="tp-workbench__chart"><h3>客户新增趋势</h3><AreaChart data={chartData.daily} options={areaOptions as any}/></div>
                <div className="tp-workbench__chart"><h3>潜客发现与线索</h3><div className="tp-workbench__mini-metrics"><div><span>发现记录</span><strong>{number(scoped.discovery.length)}</strong></div><div><span>潜客记录</span><strong>{number(scoped.leads.length)}</strong></div><div><span>本期新增发现</span><strong>{number(scoped.newDiscovery.length)}</strong></div><div><span>客户联系人</span><strong>{number(scoped.contacts.length)}</strong></div></div><Link href="/prospect-data" renderIcon={CarbonIcons.ArrowRight}>查看发现结果</Link></div>
              </div>
            </TabPanel>
            <TabPanel>
              <div className="tp-workbench__tab-grid">
                <div className="tp-workbench__chart"><h3>报价单状态</h3>{scoped.documents.length ? <SimpleBarChart data={Object.entries(scoped.documents.reduce((acc: Record<string, number>, row) => { const key = String(row.status || '未知'); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([group, value]) => ({ group, value }))} options={barOptions as any}/> : <p className="tp-workbench__empty">暂无报价记录</p>}</div>
                <div className="tp-workbench__chart"><h3>有效报价总额（USD 可换算口径）</h3><strong className="tp-workbench__large-value">{effectiveQuotes.length ? money(quoteTotal) : '暂无有效报价'}</strong><p>金额只汇总已发送、已查看或已接受报价；草稿、拒绝和过期报价单独保留在状态分布中。</p><Link href="/quotes" renderIcon={CarbonIcons.ArrowRight}>进入报价管理</Link></div>
                <div className="tp-workbench__chart"><h3>订单状态</h3><SimpleBarChart data={Object.entries(scoped.orders.reduce((acc: Record<string, number>, row) => { const key = String(row.metadata?.sales_order?.order_status || row.status || '未知'); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([group, value]) => ({ group, value }))} options={barOptions as any}/></div>
                <div className="tp-workbench__chart"><h3>订单金额（USD 可换算口径）</h3><strong className="tp-workbench__large-value">{money(orderTotal)}</strong><p>仅统计销售订单；采购订单不计入销售额。草稿与有效订单分开展示。</p><Link href="/sales-orders" renderIcon={CarbonIcons.ArrowRight}>进入销售订单</Link></div>
                <div className="tp-workbench__chart"><h3>产品目录与品类</h3><div className="tp-workbench__mini-metrics"><div><span>有效产品</span><strong>{number(scoped.products.filter(row => row.is_active).length)}</strong></div><div><span>产品品类</span><strong>{number(new Set(scoped.products.map(row => row.category).filter(Boolean)).size)}</strong></div></div><Link href="/products" renderIcon={CarbonIcons.ArrowRight}>进入产品管理</Link></div>
              </div>
            </TabPanel>
            <TabPanel>
              <div className="tp-workbench__tab-grid">
                <div className="tp-workbench__chart"><h3>发运状态分布</h3>{scoped.shipments.length ? <SimpleBarChart data={chartData.shipments} options={barOptions as any}/> : <p className="tp-workbench__empty">暂无发运记录</p>}</div>
                <div className="tp-workbench__chart"><h3>履约关键指标</h3><div className="tp-workbench__mini-metrics"><div><span>全部发运</span><strong>{number(scoped.shipments.length)}</strong></div><div><span>运输中</span><strong>{number(scoped.shipments.filter(row => ['in_transit', 'departed'].includes(row.status)).length)}</strong></div><div><span>已签收</span><strong>{number(scoped.shipments.filter(row => row.status === 'delivered').length)}</strong></div><div><span>异常</span><strong>{number(shipmentExceptions.length)}</strong></div></div><Link href="/shipments" renderIcon={CarbonIcons.ArrowRight}>进入发运管理</Link></div>
              </div>
            </TabPanel>
            <TabPanel>
              <div className="tp-workbench__tab-grid">
                <div className="tp-workbench__chart"><h3>实际收款金额</h3><strong className="tp-workbench__large-value">{collected.length || refunds.length ? money(receivedTotal) : '暂无实际收款记录'}</strong><p>仅按收款模块的实际收款记录统计；订单收款计划不计入到账金额。</p><Link href="/payments" renderIcon={CarbonIcons.ArrowRight}>进入收款管理</Link></div>
                <div className="tp-workbench__chart"><h3>收款记录状态</h3>{scoped.payments.length ? <SimpleBarChart data={Object.entries(scoped.payments.reduce((acc: Record<string, number>, row) => { const key = String(row.status || '未知'); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([group, value]) => ({ group, value }))} options={barOptions as any}/> : <p className="tp-workbench__empty">数据库当前没有实际收款记录，到账、未收与逾期金额暂不生成汇总值。</p>}</div>
                <div className="tp-workbench__chart"><h3>币种换算完整性</h3><strong className="tp-workbench__large-value">{unconverted ? number(unconverted) + ' 条待换算' : '当前金额均可按 USD 汇总'}</strong><p>外币只有在记录中存在基础币金额快照时才计入统一总览。缺少汇率或快照的金额不会被估算。</p></div>
              </div>
            </TabPanel>
            <TabPanel>
              <div className="tp-workbench__tab-grid">
                <div className="tp-workbench__chart"><h3>Agent 任务状态</h3>{chartData.agents.length ? <SimpleBarChart data={chartData.agents} options={agentOptions as any}/> : <p className="tp-workbench__empty">暂无 Agent 任务</p>}</div>
                <div className="tp-workbench__chart"><h3>任务运行概况</h3><div className="tp-workbench__mini-metrics"><div><span>全部任务</span><strong>{number(scoped.agentRuns.length)}</strong></div><div><span>运行中</span><strong>{number(scoped.agentRuns.filter(row => row.status === 'running').length)}</strong></div><div><span>已成功</span><strong>{number(scoped.agentRuns.filter(row => ['succeeded', 'completed'].includes(row.status)).length)}</strong></div><div><span>失败</span><strong>{number(failedAgents.length)}</strong></div></div><Link href="/agent" renderIcon={CarbonIcons.ArrowRight}>进入 Agent 中心</Link></div>
                <div className="tp-workbench__chart"><h3>最近 Agent 活动</h3><div className="tp-workbench__activity-list">{scoped.agentRuns.slice(0, 6).map(row => <ClickableTile key={row.id} className="tp-workbench__activity-item" onClick={() => navigate('/agent')}><span className={'tp-workbench__activity-dot is-' + row.status}/><span><strong>{row.goal || '未命名任务'}</strong><small>{row.status || '状态未知'}</small></span><time>{row.created_at ? new Date(row.created_at).toLocaleDateString('zh-CN') : '—'}</time></ClickableTile>)}</div></div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </section>

      <section className="tp-workbench__bottom-grid">
        <Tile className="tp-workbench__panel">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">ACTION CENTER</p><h2>待处理与风险</h2><p>点击进入对应业务模块处理记录。</p></div><Tag type={riskCount ? 'red' : 'green'}>{riskCount ? number(riskCount) + ' 项关注' : '当前无风险项'}</Tag></div>
          <ClickableTile className="tp-workbench__risk-row" onClick={() => navigate('/accounts')}><span>逾期跟进活动</span><strong>{number(overdueActivities.length)}</strong><CarbonIcons.ChevronRight size={16}/></ClickableTile>
          <ClickableTile className="tp-workbench__risk-row" onClick={() => navigate('/payments')}><span>逾期应收节点</span><strong>{number(overdueReceivableCount)}</strong><CarbonIcons.ChevronRight size={16}/></ClickableTile>
          <ClickableTile className="tp-workbench__risk-row" onClick={() => navigate('/shipments')}><span>发运异常</span><strong>{number(shipmentExceptions.length)}</strong><CarbonIcons.ChevronRight size={16}/></ClickableTile>
          <ClickableTile className="tp-workbench__risk-row" onClick={() => navigate('/agent')}><span>Agent 失败任务</span><strong>{number(failedAgents.length)}</strong><CarbonIcons.ChevronRight size={16}/></ClickableTile>
        </Tile>
        <Tile className="tp-workbench__panel">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">RECENT BUSINESS ACTIVITY</p><h2>最近业务活动</h2><p>来自 CRM 活动和 Agent 执行记录。</p></div></div>
          <div className="tp-workbench__activity-list">{scoped.activities.slice(0, 5).map(row => <ClickableTile key={row.id} className="tp-workbench__activity-item" onClick={() => navigate(row.opportunity_id ? '/opportunities/' + row.opportunity_id : '/accounts')}><span className="tp-workbench__activity-dot"/><span><strong>{row.summary || row.activity_type || '业务活动'}</strong><small>{row.status || '状态未设置'}</small></span><time>{row.created_at ? new Date(row.created_at).toLocaleDateString('zh-CN') : '—'}</time></ClickableTile>)}{!scoped.activities.length && <p className="tp-workbench__empty">暂无 CRM 活动记录。</p>}</div>
        </Tile>
      </section>
      {unconverted > 0 && <InlineNotification kind="warning" title="部分外币金额未纳入统一汇总" subtitle={number(unconverted) + ' 条金额记录缺少可验证的 USD 基础币快照。请在财务汇率配置完善后再纳入总额。'}/>}
    </>}
    <footer className="tp-workbench__footer"><span>TRADEPILOT · GLOBAL BUSINESS COMMAND CENTER</span><span>真实业务数据 · 当前账户可访问范围 · {data ? '更新于 ' + new Date(data.updatedAt).toLocaleString('zh-CN') : '等待数据'}</span></footer>
  </main>;
}
