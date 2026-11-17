import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, SimpleBarChart, ChoroplethChart, BubbleChart,
} from '@carbon/charts-react';
import {
  Button, InlineLoading, InlineNotification, Tile, Tag, Select, SelectItem,
  Tabs, TabList, Tab, TabPanels, TabPanel, MultiSelect, Search, DataTable,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer,
  CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import worldAtlas from 'world-atlas/countries-110m.json';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/global-trade-dashboard.scss';

type Row = Record<string, any>;
type DashboardData = {
  accounts: Row[]; contacts: Row[]; leads: Row[]; opportunities: Row[]; documents: Row[];
  orders: Row[]; shipments: Row[]; payments: Row[]; products: Row[]; activities: Row[];
  discovery: Row[]; discoveryRuns: Row[]; updatedAt: string;
};
type Metric = { label: string; value: string; detail: string; tone?: 'positive' | 'negative' | 'neutral'; href?: string };
const BASE_CURRENCY = 'USD';
const n = (value: number) => Number(value || 0).toLocaleString('zh-CN');
const money = (value: number, currency: string) => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(Number(value || 0));
const safeArray = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const dateKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const countryName = (code: string) => {
  if (!code || code === 'UNKNOWN') return '未设置国家';
  try { return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code) || code; }
  catch { return code; }
};
const countryEnglish = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; }
  catch { return code; }
};
const countryAliases: Record<string, string> = {
  US: 'United States of America', GB: 'United Kingdom', KR: 'South Korea', KP: 'North Korea',
  RU: 'Russia', CZ: 'Czechia', CD: 'Democratic Republic of the Congo', CG: 'Republic of the Congo',
  CI: 'Ivory Coast', BO: 'Bolivia', VE: 'Venezuela', TZ: 'Tanzania', SY: 'Syria',
  LA: 'Laos', MD: 'Moldova', VN: 'Vietnam', IR: 'Iran', PS: 'Palestine', BN: 'Brunei',
  TL: 'Timor-Leste', MK: 'North Macedonia', MM: 'Myanmar', SZ: 'Eswatini', TR: 'Turkey',
};
const worldGeoData = (() => {
  const source = worldAtlas as any;
  const countries = source?.objects?.countries;
  if (!countries?.geometries?.length) return source;
  return { ...source, objects: { ...source.objects, countries: {
    ...countries, geometries: countries.geometries.map((geometry: any) => ({
      ...geometry, properties: { ...(geometry.properties || {}), NAME: String(geometry.properties?.NAME || geometry.properties?.name || '') },
    })),
  } } };
})();
const geoName = (value: unknown) => String(value || '').trim().toLocaleLowerCase('en');
const amountIn = (row: Row, amount: unknown, currency: string): number | null => {
  const value = Number(amount || 0);
  const rowCurrency = String(row.currency_code || row.currency || BASE_CURRENCY).toUpperCase();
  if (rowCurrency === currency) return value;
  if (currency === BASE_CURRENCY) {
    const base = row.amount_base ?? row.metadata?.sales_order?.totals?.grand_total_base ?? row.totals?.grand_total_base;
    return base !== null && base !== undefined && Number.isFinite(Number(base)) ? Number(base) : null;
  }
  return null;
};
const countBy = (rows: Row[], key: (row: Row) => string) => {
  const counts = new Map<string, number>();
  rows.forEach(row => { const label = key(row) || '未设置'; counts.set(label, (counts.get(label) || 0) + 1); });
  return [...counts.entries()].map(([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value);
};
const periodStart = (period: string) => {
  const date = new Date(); date.setHours(0, 0, 0, 0);
  if (period === '7d') date.setDate(date.getDate() - 6);
  else if (period === '30d') date.setDate(date.getDate() - 29);
  else if (period === 'quarter') { date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1); }
  else if (period === 'year') date.setMonth(0, 1);
  return date;
};
const periodLabel: Record<string, string> = { '7d': '近 7 天', '30d': '近 30 天', quarter: '本季度', year: '本年' };
const chartBase = { theme: 'white', toolbar: { enabled: false }, legend: { enabled: true, position: 'bottom' } };
const barOptions = { ...chartBase, height: '250px', axes: {
  bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value', scaleType: 'linear' },
} };
const areaOptions = { ...chartBase, height: '300px', axes: {
  bottom: { mapsTo: 'date', scaleType: 'time' }, left: { mapsTo: 'value', scaleType: 'linear' },
}, curve: 'curveMonotoneX', points: { enabled: false } };
const currencyLabel: Record<string, string> = { USD: '美元', EUR: '欧元', CNY: '人民币' };

const TAB_LABELS = ['经营总览', '线索转化', '商机预测', '客户经营', '市场产品', '订单回款', '跟进风险'];

export function GlobalTradeDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('30d');
  const [countries, setCountries] = useState<string[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState(0);
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);

  const load = useCallback(async () => {
    setError('');
    try {
      const db = await getSupabaseClient();
      const results = await Promise.all([
        db.from('crm_accounts').select('id,country_code,created_at,status,industry,account_name,source_lead_id').eq('is_archived', false).limit(5000),
        db.from('leads').select('id,country_code,status,created_at,is_formal').limit(5000),
        db.from('crm_opportunities').select('id,account_id,stage,status,amount,currency_code,probability,forecast_probability,created_at,expected_close_date,is_archived').eq('is_archived', false).limit(5000),
        db.from('trade_documents').select('id,order_id,document_type,status,currency_code,totals,created_at,issued_at').eq('document_type', 'quotation').limit(5000),
        db.from('trade_orders').select('id,order_number,status,currency_code,created_at,crm_account_id,metadata,order_type').eq('order_type', 'sales').limit(5000),
        db.from('trade_shipments').select('id,status,created_at,planned_ship_date,actual_ship_date,shipment_value,currency_code,exception_flag,account_id,order_id').limit(5000),
        db.from('trade_payments').select('id,payment_type,status,payment_date,received_date,currency,amount,net_received,amount_base,refund_amount,refund_date,created_at,account_id').limit(5000),
        db.from('crm_activities').select('id,activity_type,summary,due_at,status,created_at,account_id,opportunity_id').order('created_at', { ascending: false }).limit(5000),
        db.from('discovery_records').select('id,channel,status,country_code,created_at,lead_id').limit(5000),
        db.from('crm_contacts').select('id,account_id,created_at,is_active,is_archived').eq('is_archived', false).limit(5000),
        db.from('trade_products').select('id,sku,name,category,brand,is_active,is_archived,created_at').eq('is_archived', false).limit(5000),
        db.from('discovery_runs').select('id,query,search_config,channel,created_at,countries').order('created_at', { ascending: false }).limit(5000),
      ]);
      const failed = results.find(result => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      setData({
        accounts: safeArray(results[0].data), leads: safeArray(results[1].data), opportunities: safeArray(results[2].data),
        documents: safeArray(results[3].data), orders: safeArray(results[4].data), shipments: safeArray(results[5].data),
        payments: safeArray(results[6].data), activities: safeArray(results[7].data), discovery: safeArray(results[8].data),
        contacts: safeArray(results[9].data), products: safeArray(results[10].data), discoveryRuns: safeArray(results[11].data),
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '经营数据读取失败。');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setTablePage(1); setTableSearch(''); }, [activeTab, period, countries, currency]);

  const start = useMemo(() => periodStart(period), [period]);
  const scoped = useMemo(() => {
    const matchesCountry = (row: Row) => !countries.length || countries.includes(String(row.country_code || '').toUpperCase());
    const accounts = (data?.accounts || []).filter(matchesCountry);
    const accountIds = new Set(accounts.map(row => String(row.id)));
    const leads = (data?.leads || []).filter(matchesCountry);
    const opportunities = (data?.opportunities || []).filter(row => !countries.length || accountIds.has(String(row.account_id)));
    const orders = (data?.orders || []).filter(row => !countries.length || accountIds.has(String(row.crm_account_id)));
    const orderIds = new Set(orders.map(row => String(row.id)));
    const within = (rows: Row[]) => rows.filter(row => !row.created_at || new Date(row.created_at) >= start);
    const discovery = (data?.discovery || []).filter(matchesCountry);
    return {
      accounts, leads, opportunities, orders, orderIds,
      documents: (data?.documents || []).filter(row => !countries.length || orderIds.has(String(row.order_id))),
      shipments: (data?.shipments || []).filter(row => !countries.length || accountIds.has(String(row.account_id)) || orderIds.has(String(row.order_id))),
      payments: (data?.payments || []).filter(row => !countries.length || accountIds.has(String(row.account_id))),
      activities: (data?.activities || []).filter(row => !countries.length || accountIds.has(String(row.account_id))),
      discovery, contacts: (data?.contacts || []).filter(row => !countries.length || accountIds.has(String(row.account_id))),
      products: data?.products || [], discoveryRuns: data?.discoveryRuns || [],
      newAccounts: within(accounts), newLeads: within(leads), newOpportunities: within(opportunities),
      newOrders: within(orders), newDiscovery: within(discovery),
    };
  }, [data, countries, start]);

  const countryOptions = useMemo(() => [...new Set([
    ...(data?.accounts || []).map(row => String(row.country_code || '').toUpperCase()),
    ...(data?.leads || []).map(row => String(row.country_code || '').toUpperCase()),
    ...(data?.discovery || []).map(row => String(row.country_code || '').toUpperCase()),
  ].filter(code => /^[A-Z]{2}$/.test(code)))].sort().map(code => ({ id: code, text: countryName(code) })), [data]);

  const effectiveQuotes = scoped.documents.filter(row => ['sent', 'viewed', 'accepted', 'approved', 'issued'].includes(String(row.status || '').toLowerCase()));
  const quoteAmount = effectiveQuotes.reduce((sum, row) => sum + (amountIn(row, row.totals?.grand_total, currency) ?? 0), 0);
  const activeOrders = scoped.orders.filter(row => ['active', 'completed'].includes(String(row.status || '').toLowerCase()));
  const orderAmount = activeOrders.reduce((sum, row) => sum + (amountIn(row, row.metadata?.sales_order?.totals?.grand_total, currency) ?? 0), 0);
  const opportunityAmount = scoped.opportunities.reduce((sum, row) => sum + (amountIn(row, row.amount, currency) ?? 0), 0);
  const weightedAmount = scoped.opportunities.reduce((sum, row) => {
    const amount = amountIn(row, row.amount, currency);
    const probability = row.forecast_probability ?? row.probability;
    if (amount === null || probability === null || probability === undefined) return sum;
    const rate = Number(probability) > 1 ? Number(probability) / 100 : Number(probability);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? sum + amount * rate : sum;
  }, 0);
  const receivedRows = scoped.payments.filter(row => row.payment_type === 'receipt' && ['confirmed', 'partially_reconciled', 'reconciled', 'returned'].includes(String(row.status || '').toLowerCase()));
  const refundRows = scoped.payments.filter(row => row.payment_type === 'refund' && row.status === 'returned');
  const receivedAmount = receivedRows.reduce((sum, row) => sum + (amountIn(row, row.net_received ?? row.amount, currency) ?? 0), 0)
    - refundRows.reduce((sum, row) => sum + (amountIn(row, row.refund_amount ?? row.amount, currency) ?? 0), 0);
  const overdueActivities = scoped.activities.filter(row => row.due_at && new Date(row.due_at) < new Date() && !['completed', 'done', 'cancelled'].includes(String(row.status || '').toLowerCase()));
  const overdueReceivables = scoped.orders.flatMap(row => safeArray(row.metadata?.sales_order?.payment_schedule).filter(step =>
    step.due_date && step.due_date < dateKey(new Date()) && Number(step.paid_amount || 0) + 0.005 < Number(step.amount || 0)));
  const shipmentRisks = scoped.shipments.filter(row => row.exception_flag || ['exception', 'delayed', 'failed', 'damaged', 'lost'].includes(String(row.status || '').toLowerCase()));
  const riskTotal = overdueActivities.length + overdueReceivables.length + shipmentRisks.length;
  const countryCounts = countBy([...scoped.accounts, ...scoped.leads], row => String(row.country_code || '未知').toUpperCase());
  const geoLookup = new Map<string, any>((worldGeoData?.objects?.countries?.geometries || []).map((geometry: any) => [geoName(geometry.properties?.NAME), geometry]));
  const marketMapData = countryCounts.flatMap(item => {
    const name = countryAliases[item.group] || countryEnglish(item.group);
    const geometry = geoLookup.get(geoName(name));
    return geometry ? [{ id: String(geometry.id), name, value: item.value }] : [];
  });
  const keywordRows = useMemo(() => {
    const counts = new Map<string, number>();
    scoped.discoveryRuns.forEach(run => {
      const config = run.search_config && typeof run.search_config === 'object' ? run.search_config as Row : {};
      const keyword = String(config.originalQuery || run.query || config.translatedQuery || '').trim();
      if (keyword) counts.set(keyword, (counts.get(keyword) || 0) + 1);
    });
    return [...counts.entries()].map(([word, count]) => ({ word, count, value: count, group: '搜索词' })).sort((a, b) => b.count - a.count).slice(0, 30);
  }, [scoped.discoveryRuns]);

  const themeOptions = { ...chartBase, theme: 'white' };
  const areaData = useMemo(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === 'quarter' ? 3 : 12;
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      if (period === 'year' || period === 'quarter') date.setMonth(date.getMonth() + index);
      else date.setDate(date.getDate() + index);
      const next = new Date(date);
      if (period === 'year' || period === 'quarter') next.setMonth(next.getMonth() + 1);
      else next.setDate(next.getDate() + 1);
      const value = scoped.newAccounts.filter(row => row.created_at && new Date(row.created_at) >= date && new Date(row.created_at) < next).length;
      return { group: '新增客户', date, value };
    });
  }, [period, scoped.newAccounts, start]);

  const metricsByTab: Metric[][] = [
    [
      { label: '潜在客户', value: n(scoped.leads.length), detail: '本期新增 ' + n(scoped.newLeads.length), href: '/leads' },
      { label: '正式客户', value: n(scoped.accounts.length), detail: '本期新增 ' + n(scoped.newAccounts.length), href: '/accounts' },
      { label: '商机管道', value: money(opportunityAmount, currency), detail: n(scoped.opportunities.length) + ' 个商机', href: '/opportunities' },
      { label: '实际回款', value: money(receivedAmount, currency), detail: n(receivedRows.length) + ' 笔已确认收款', href: '/payments' },
    ],
    [
      { label: '新增线索', value: n(scoped.newLeads.length), detail: periodLabel[period] },
      { label: '有效线索', value: n(scoped.leads.filter(row => row.is_formal || ['qualified', 'converted'].includes(String(row.status || '').toLowerCase())).length), detail: '按 CRM 当前状态字段统计' },
      { label: '线索转化率', value: scoped.leads.length ? (scoped.leads.filter(row => row.is_formal).length / scoped.leads.length * 100).toFixed(1) + '%' : '—', detail: '正式线索 / 全部线索' },
      { label: '发现记录', value: n(scoped.discovery.length), detail: '来自已接入发现渠道', href: '/prospect-data' },
    ],
    [
      { label: '商机总数', value: n(scoped.opportunities.length), detail: '当前筛选范围', href: '/opportunities' },
      { label: '管道金额', value: money(opportunityAmount, currency), detail: '仅汇总可按所选币种识别的金额' },
      { label: '加权预测', value: money(weightedAmount, currency), detail: '金额 × 成交概率' },
      { label: '报价金额', value: money(quoteAmount, currency), detail: n(effectiveQuotes.length) + ' 份有效报价', href: '/quotes' },
    ],
    [
      { label: '客户总数', value: n(scoped.accounts.length), detail: '正式客户', href: '/accounts' },
      { label: '新增客户', value: n(scoped.newAccounts.length), detail: periodLabel[period] },
      { label: '联系人', value: n(scoped.contacts.length), detail: '未归档联系人', href: '/contacts' },
      { label: '覆盖国家', value: n(new Set(scoped.accounts.map(row => row.country_code).filter(Boolean)).size), detail: '客户档案国家数' },
    ],
    [
      { label: '覆盖国家', value: n(new Set([...scoped.accounts, ...scoped.leads].map(row => row.country_code).filter(Boolean)).size), detail: '客户与线索国家' },
      { label: '产品数量', value: n(scoped.products.length), detail: '产品目录', href: '/products' },
      { label: '有效品类', value: n(new Set(scoped.products.map(row => row.category).filter(Boolean)).size), detail: '产品品类数' },
      { label: '有效报价', value: n(effectiveQuotes.length), detail: '已发送、查看或接受' },
    ],
    [
      { label: '销售订单', value: n(activeOrders.length), detail: '有效及已完成', href: '/sales-orders' },
      { label: '订单金额', value: money(orderAmount, currency), detail: '可识别币种金额' },
      { label: '实际回款', value: money(receivedAmount, currency), detail: n(receivedRows.length) + ' 笔收款', href: '/payments' },
      { label: '逾期应收项', value: n(overdueReceivables.length), detail: '来自订单收款计划', tone: overdueReceivables.length ? 'negative' : 'positive' },
    ],
    [
      { label: '本期跟进', value: n(scoped.activities.filter(row => row.created_at && new Date(row.created_at) >= start).length), detail: periodLabel[period] },
      { label: '逾期待办', value: n(overdueActivities.length), detail: '尚未完成的逾期活动', tone: overdueActivities.length ? 'negative' : 'positive' },
      { label: '风险发运', value: n(shipmentRisks.length), detail: '异常、延误或失败', tone: shipmentRisks.length ? 'negative' : 'positive', href: '/shipments' },
      { label: '风险事项', value: n(riskTotal), detail: '逾期跟进 + 逾期应收 + 发运异常', tone: riskTotal ? 'negative' : 'positive' },
    ],
  ];

  const tableRows = useMemo(() => {
    const iso = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('zh-CN') : '—';
    if (activeTab === 1) return scoped.leads.map(row => ({ id: row.id, name: row.company_name || row.name || row.id, status: row.status || (row.is_formal ? '正式线索' : '新建'), country: countryName(String(row.country_code || '')), date: iso(row.created_at) }));
    if (activeTab === 2) return scoped.opportunities.map(row => ({ id: row.id, name: row.name || row.title || row.id, status: row.stage || row.status || '未设置', country: '—', amount: amountIn(row, row.amount, currency) === null ? '—' : money(amountIn(row, row.amount, currency) || 0, currency), date: iso(row.expected_close_date || row.created_at) }));
    if (activeTab === 3) return scoped.accounts.map(row => ({ id: row.id, name: row.account_name || row.id, status: row.status || '未设置', country: countryName(String(row.country_code || '')), date: iso(row.created_at) }));
    if (activeTab === 4) return scoped.products.map(row => ({ id: row.id, name: row.name || row.sku || row.id, status: row.is_active ? '启用' : '停用', country: row.category || '未分类', date: iso(row.created_at) }));
    if (activeTab === 5) return scoped.orders.map(row => ({ id: row.id, name: row.order_number || row.id, status: row.status || '未设置', country: '—', amount: amountIn(row, row.metadata?.sales_order?.totals?.grand_total, currency) === null ? '—' : money(amountIn(row, row.metadata?.sales_order?.totals?.grand_total, currency) || 0, currency), date: iso(row.created_at) }));
    if (activeTab === 6) return [
      ...overdueActivities.map(row => ({ id: row.id, name: row.summary || '跟进待办', status: '逾期跟进', country: '—', date: iso(row.due_at) })),
      ...shipmentRisks.map(row => ({ id: row.id, name: row.shipment_no || '发运记录', status: row.status || '运输异常', country: '—', date: iso(row.created_at) })),
    ];
    return [
      ...scoped.opportunities.slice(0, 8).map(row => ({ id: row.id, name: row.name || row.title || '销售商机', status: row.stage || row.status || '商机', country: '商机', amount: amountIn(row, row.amount, currency) === null ? '—' : money(amountIn(row, row.amount, currency) || 0, currency), date: iso(row.expected_close_date || row.created_at) })),
      ...scoped.orders.slice(0, 8).map(row => ({ id: row.id, name: row.order_number || '销售订单', status: row.status || '订单', country: '订单', amount: amountIn(row, row.metadata?.sales_order?.totals?.grand_total, currency) === null ? '—' : money(amountIn(row, row.metadata?.sales_order?.totals?.grand_total, currency) || 0, currency), date: iso(row.created_at) })),
    ];
  }, [activeTab, scoped, currency, overdueActivities, shipmentRisks]);

  const visibleRows = useMemo(() => {
    const query = tableSearch.trim().toLocaleLowerCase();
    const filtered = tableRows.filter(row => !query || Object.values(row).some(value => String(value).toLocaleLowerCase().includes(query)));
    return [...filtered].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''), 'zh-CN', { numeric: true }));
  }, [tableRows, tableSearch]);
  const pageSize = 8;
  const pageRows = visibleRows.slice((tablePage - 1) * pageSize, tablePage * pageSize);
  const tableHeaders = [
    { key: 'name', header: '名称' }, { key: 'status', header: '状态' },
    { key: 'country', header: activeTab === 4 ? '品类' : '国家 / 分类' },
    { key: 'amount', header: '金额' }, { key: 'date', header: '日期' },
  ];

  const exportCsv = () => {
    const headers = ['名称', '状态', '国家 / 分类', '金额', '日期'];
    const rows = visibleRows.map(row => [row.name, row.status, row.country, row.amount || '', row.date]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'TradePilot-' + TAB_LABELS[activeTab] + '-' + dateKey(new Date()) + '.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const commonBar = (title: string, rows: { group: string; value: number }[]) => (
    rows.length ? <SimpleBarChart data={rows} options={{ ...barOptions, title, legend: { enabled: false } } as any}/> : <EmptyState message="当前筛选条件下暂无可用数据"/>
  );

  const metricSet = metricsByTab[activeTab] || metricsByTab[0];
  const chartThemeOptions = { ...themeOptions, theme: 'white' };

  return <main className="tp-global-dashboard">
    <div className="tp-gt-breadcrumb">首页 <CarbonIcons.ChevronRight size={12}/> 全球贸易经营驾驶舱</div>
    <header className="tp-gt-header">
      <div><h1>全球贸易经营驾驶舱</h1><p>从客户开发到订单回款，掌握全球贸易经营表现与关键风险。</p></div>
      <div className="tp-gt-header__actions">
        <span className="tp-gt-updated">{data ? '更新于 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '等待数据'}</span>
        <Button kind="tertiary" size="md" renderIcon={CarbonIcons.Renew} disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}>刷新</Button>
        <Button kind="primary" size="md" renderIcon={CarbonIcons.Download} onClick={exportCsv}>导出报表</Button>
      </div>
    </header>

    <section className="tp-gt-filters" aria-label="全局筛选">
      <Select id="gt-period" labelText="时间范围" size="md" value={period} onChange={event => setPeriod(event.currentTarget.value)}>
        <SelectItem value="7d" text="近 7 天"/><SelectItem value="30d" text="近 30 天"/><SelectItem value="quarter" text="本季度"/><SelectItem value="year" text="本年"/>
      </Select>
      <MultiSelect id="gt-countries" titleText="国家 / 地区" label="全部国家" items={countryOptions} itemToString={(item: any) => item?.text || ''} selectedItems={countryOptions.filter(item => countries.includes(item.id))} onChange={({ selectedItems }: any) => setCountries(selectedItems.map((item: any) => item.id))} />
      <Select id="gt-currency" labelText="币种" size="md" value={currency} onChange={event => setCurrency(event.currentTarget.value)}>
        <SelectItem value="USD" text="USD · 美元"/><SelectItem value="EUR" text="EUR · 欧元"/><SelectItem value="CNY" text="CNY · 人民币"/>
      </Select>
      <Button kind="ghost" size="sm" onClick={() => { setPeriod('30d'); setCountries([]); setCurrency('USD'); }}>重置</Button>
    </section>
    {countries.length > 0 && <div className="tp-gt-active-filters"><span>国家筛选：</span>{countries.map(code => <Tag key={code} type="blue" filter onClose={() => setCountries(current => current.filter(item => item !== code))}>{countryName(code)}</Tag>)}</div>}
    <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => { setActiveTab(selectedIndex); setTablePage(1); setTableSearch(''); }}>
      <TabList aria-label="经营分析视图" className="tp-gt-tabs">
        {TAB_LABELS.map(label => <Tab key={label}>{label}</Tab>)}
      </TabList>
      <TabPanels>
        {TAB_LABELS.map((label, index) => <TabPanel key={label}>
          {activeTab === index && <>
            {error && <InlineNotification kind="error" lowContrast title="数据读取失败" subtitle={error} />}
            {loading && !data ? <div className="tp-gt-loading"><InlineLoading description="正在汇聚经营数据…"/></div> : <>
              <section className="tp-gt-kpis" aria-label={label + '关键指标'}>
                {metricSet.map(metric => <button type="button" key={metric.label} className="tp-gt-kpi" onClick={() => metric.href && navigate(metric.href)} disabled={!metric.href}>
                  <span>{metric.label}</span><strong>{metric.value}</strong><small className={metric.tone === 'negative' ? 'is-negative' : metric.tone === 'positive' ? 'is-positive' : ''}>{metric.detail}</small>
                </button>)}
              </section>

              {index === 0 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>客户新增趋势</h3><Tag type="blue">{periodLabel[period]}</Tag></div>{areaData.length ? <AreaChart data={areaData} options={{ ...areaOptions, title: '客户新增趋势' } as any}/> : <EmptyState message="暂无客户新增趋势数据"/>}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>业务规模</h3><Tag type="cool-gray">当前累计</Tag></div><div className="tp-gt-summary-list"><div><span>潜客发现</span><strong>{n(scoped.discovery.length)}</strong></div><div><span>线索</span><strong>{n(scoped.leads.length)}</strong></div><div><span>正式客户</span><strong>{n(scoped.accounts.length)}</strong></div><div><span>商机</span><strong>{n(scoped.opportunities.length)}</strong></div><div><span>销售订单</span><strong>{n(scoped.orders.length)}</strong></div></div></Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>商机阶段</h3></div>{commonBar('商机阶段分布', countBy(scoped.opportunities, row => String(row.stage || row.status || '未设置')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>订单状态</h3></div>{commonBar('销售订单状态', countBy(scoped.orders, row => String(row.status || '未设置')))}</Tile>
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>全球市场分布</h3><Tag type="blue">{marketMapData.length} 个国家 / 地区</Tag></div>{marketMapData.length ? <ChoroplethChart data={marketMapData} options={{ ...chartThemeOptions, height: '320px', geoData: worldGeoData as any, thematic: { projection: 'geoNaturalEarth1' }, choropleth: { colorLegend: { title: '业务记录', type: 'linear' } } } as any}/> : <EmptyState message="补充客户或线索国家信息后，将显示全球市场分布"/>}</Tile>
              </div>}

              {index === 1 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>线索状态分布</h3></div>{commonBar('线索状态', countBy(scoped.leads, row => String(row.status || (row.is_formal ? '正式线索' : '新建'))))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>发现渠道</h3></div>{commonBar('来源渠道', countBy(scoped.discovery, row => String(row.channel || '其他')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>线索国家</h3></div>{commonBar('线索国家排名', countBy(scoped.leads, row => countryName(String(row.country_code || ''))).slice(0, 8))}</Tile>
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>线索转化链路</h3><Tag type="cool-gray">记录规模，不等同于队列转化率</Tag></div><div className="tp-gt-funnel">{[['潜客发现', scoped.discovery.length], ['线索', scoped.leads.length], ['正式客户', scoped.accounts.length], ['商机', scoped.opportunities.length], ['报价', scoped.documents.length], ['订单', scoped.orders.length]].map(([stage, value], i, all) => <div className="tp-gt-funnel__row" key={String(stage)}><span>{stage}</span><div><i className={'tp-gt-funnel__bar--' + Math.max(5, Math.round(Number(value) / Math.max(1, ...all.map(item => Number(item[1]))) * 20) * 5)}/></div><strong>{n(Number(value))}</strong></div>)}</div></Tile>
              </div>}

              {index === 2 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>商机阶段金额</h3></div>{commonBar('商机阶段数量', countBy(scoped.opportunities, row => String(row.stage || '未设置')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>预计成交月份</h3></div>{commonBar('预计成交月份', countBy(scoped.opportunities.filter(row => row.expected_close_date), row => String(row.expected_close_date).slice(0, 7)))}</Tile>
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>市场商机开发潜力</h3></div>{scoped.opportunities.length ? <BubbleChart data={scoped.opportunities.slice(0, 80).map(row => ({ group: String(row.name || row.id), x: Number(row.probability || row.forecast_probability || 0), y: Number(row.amount || 0), bubbleSize: Math.max(1, Number(row.amount || 1)) }))} options={{ ...chartThemeOptions, height: '300px', axes: { bottom: { title: '成交概率', mapsTo: 'x', scaleType: 'linear' }, left: { title: '商机金额', mapsTo: 'y', scaleType: 'linear' } }, bubble: { radiusMapsTo: 'bubbleSize' } } as any}/> : <EmptyState message="暂无商机数据"/>}</Tile>
              </div>}

              {index === 3 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>客户等级与状态</h3></div>{commonBar('客户状态', countBy(scoped.accounts, row => String(row.status || '未设置')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>客户行业</h3></div>{commonBar('客户行业分布', countBy(scoped.accounts, row => String(row.industry || '未设置')).slice(0, 8))}</Tile>
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>客户新增趋势</h3></div><AreaChart data={areaData} options={{ ...areaOptions, title: '客户新增趋势' } as any}/></Tile>
              </div>}

              {index === 4 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>国家 / 地区分布</h3></div>{commonBar('客户与线索国家排名', countryCounts.slice(0, 12).map(row => ({ group: countryName(row.group), value: row.value })))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>产品品类</h3></div>{commonBar('产品品类分布', countBy(scoped.products, row => String(row.category || '未分类')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>发现关键词</h3></div>{keywordRows.length ? <div className="tp-gt-keywords">{keywordRows.slice(0, 12).map(row => <div key={row.word}><span>{row.word}</span><Tag type="blue">{n(row.count)}</Tag></div>)}</div> : <EmptyState message="暂无搜索关键词记录"/>}</Tile>
              </div>}

              {index === 5 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>订单状态</h3></div>{commonBar('销售订单状态', countBy(scoped.orders, row => String(row.status || '未设置')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>收款状态</h3></div>{commonBar('收款记录状态', countBy(scoped.payments, row => String(row.status || '未设置')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>回款概况</h3><Tag type="cool-gray">{currency}</Tag></div><div className="tp-gt-large-value">{money(receivedAmount, currency)}</div><p>按所选币种及可用基础币快照汇总；未配置汇率的外币记录不参与合计。</p></Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>逾期应收</h3><Tag type={overdueReceivables.length ? 'red' : 'green'}>{overdueReceivables.length ? '需关注' : '正常'}</Tag></div><div className="tp-gt-large-value">{n(overdueReceivables.length)} 项</div><p>依据销售订单收款计划中的到期日与已付金额计算。</p></Tile>
              </div>}

              {index === 6 && <div className="tp-gt-grid">
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>跟进活动类型</h3></div>{commonBar('活动类型分布', countBy(scoped.activities, row => String(row.activity_type || '其他')))}</Tile>
                <Tile className="tp-gt-card"><div className="tp-gt-card__heading"><h3>风险构成</h3></div>{commonBar('风险事项分布', [{ group: '逾期跟进', value: overdueActivities.length }, { group: '逾期应收', value: overdueReceivables.length }, { group: '发运异常', value: shipmentRisks.length }].filter(row => row.value > 0))}</Tile>
                <Tile className="tp-gt-card tp-gt-card--wide"><div className="tp-gt-card__heading"><h3>风险摘要</h3><Tag type={riskTotal ? 'red' : 'green'}>{riskTotal ? n(riskTotal) + ' 项待处理' : '暂无风险'}</Tag></div><div className="tp-gt-risk-list"><button onClick={() => navigate('/accounts')}><span>逾期跟进活动</span><strong>{n(overdueActivities.length)}</strong><CarbonIcons.ChevronRight/></button><button onClick={() => navigate('/sales-orders')}><span>逾期应收款项</span><strong>{n(overdueReceivables.length)}</strong><CarbonIcons.ChevronRight/></button><button onClick={() => navigate('/shipments')}><span>发运异常记录</span><strong>{n(shipmentRisks.length)}</strong><CarbonIcons.ChevronRight/></button></div></Tile>
              </div>}

              <section className="tp-gt-table-section">
                <div className="tp-gt-table-heading"><div><h2>{index === 0 ? '重点业务记录' : label + '明细'}</h2><p>数据来自当前业务模块，筛选条件在视图切换时保持不变。</p></div><div className="tp-gt-table-actions"><Search size="md" labelText="搜索明细" placeholder="搜索名称、状态或国家" value={tableSearch} onChange={event => setTableSearch(event.currentTarget.value)}/><Button kind="tertiary" size="md" renderIcon={CarbonIcons.Download} onClick={exportCsv}>导出 CSV</Button></div></div>
                <DataTable rows={pageRows.map(row => ({ ...row, id: String(row.id) }))} headers={tableHeaders} isSortable>
                  {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => <TableContainer>
                    <Table {...getTableProps()} size="lg">
                      <TableHead><TableRow>{headers.map((header: any) => <TableHeader {...getHeaderProps({ header })} key={header.key}>{header.header}</TableHeader>)}</TableRow></TableHead>
                      <TableBody>{rows.map((row: any) => <TableRow {...getRowProps({ row })} key={row.id}>{row.cells.map((cell: any) => <TableCell key={cell.id}>{cell.value ?? '—'}</TableCell>)}</TableRow>)}</TableBody>
                    </Table>
                  </TableContainer>}
                </DataTable>
                <div className="tp-gt-pagination"><span>共 {n(visibleRows.length)} 条</span><Button kind="ghost" size="sm" disabled={tablePage <= 1} onClick={() => setTablePage(page => page - 1)}>上一页</Button><span>{tablePage} / {Math.max(1, Math.ceil(visibleRows.length / pageSize))}</span><Button kind="ghost" size="sm" disabled={tablePage >= Math.ceil(visibleRows.length / pageSize)} onClick={() => setTablePage(page => page + 1)}>下一页</Button></div>
              </section>
            </>}
          </>}
        </TabPanel>)}
      </TabPanels>
    </Tabs>
    <footer className="tp-gt-footnote">币种说明：金额按记录原币或已保存的基础币金额快照汇总，不进行未经配置汇率的币种换算。数据更新时间：{data ? new Date(data.updatedAt).toLocaleString('zh-CN') : '—'}。</footer>
  </main>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="tp-gt-empty"><CarbonIcons.ChartLine size={24}/><p>{message}</p></div>;
}
