import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, ClickableTile, Column, Grid, InlineNotification, Select, SelectItem, Tag, TextInput, Tile, TPSkeleton, semanticIcons,
} from '@/design-system';
import { PageHeader } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Row = Record<string, any>;
type BoardData = {
  leads: Row[];
  accounts: Row[];
  contacts: Row[];
  opportunities: Row[];
  quotes: Row[];
  orders: Row[];
  payments: Row[];
  allocations: Row[];
  shipments: Row[];
  updatedAt: string;
};
type BoardCard = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  details: string[];
  amount?: string;
  warning?: boolean;
  closed?: boolean;
};

const safeRows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const money = (amount: unknown, currency = 'USD') => {
  const value = Number(amount);
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(value)) return '金额待核实';
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString('zh-CN');
  }
};
const dateLabel = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('zh-CN') : '未设置';
const quoteState = (row: Row) => String(row.content?.quote_status || (
  row.status === 'draft' ? 'draft' : row.status === 'issued' ? 'sent' : row.status === 'approved' ? 'accepted' : row.status === 'void' ? 'cancelled' : row.status || 'unknown'
));
const orderState = (row: Row) => String(row.metadata?.sales_order?.order_status || (
  row.status === 'active' ? 'confirmed' : row.status || 'unknown'
));
const quoteLabels: Record<string, string> = {
  draft: '草稿', sent: '已发送', viewed: '已查看', accepted: '已接受',
  rejected: '已拒绝', expired: '已过期', cancelled: '已取消',
};
const orderLabels: Record<string, string> = {
  draft: '草稿', confirmed: '已确认', completed: '已完成', cancelled: '已取消',
};
const opportunityLabels: Record<string, string> = {
  prospecting: '初步接洽', qualification: '资格确认', needs_analysis: '需求分析',
  proposal: '方案提议', negotiation: '商务谈判', won: '已赢单', lost: '已输单',
};

function StageColumn({ title, count, hint, cards, empty }: {
  title: string; count: number; hint: string; cards: BoardCard[]; empty: string;
}) {
  const navigate = useNavigate();
  return (
    <Tile aria-label={title}>
      <header>
        <div><h2>{title}</h2><p>{hint}</p></div>
        <Tag type="cool-gray">{count}</Tag>
      </header>
      <div>
        {cards.length ? cards.map(card => (
          <ClickableTile key={card.id} onClick={() => navigate(card.href)}>
            <div>
              <strong>{card.title || '未命名记录'}</strong>
              <Tag type={card.warning ? 'red' : 'blue'}>{card.status}</Tag>
            </div>
            <p>{card.subtitle}</p>
            {card.amount && <strong>{card.amount}</strong>}
            {card.details.length > 0 && <ul>{card.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
          </ClickableTile>
        )) : <p>{empty}</p>}
      </div>
    </Tile>
  );
}

export function SalesProcessPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const [view, setView] = useState('board');

  const load = useCallback(async () => {
    setError('');
    try {
      const db = await getSupabaseClient();
      const [leads, accounts, contacts, opportunities, quotes, orders, payments, allocations, shipments] = await Promise.all([
        db.from('leads').select('id,lead_number,name,country_code,status,is_formal,created_at,updated_at').order('updated_at', { ascending: false }).range(0, 1999),
        db.from('crm_accounts').select('id,account_number,account_name,status,country_code,source_lead_id,created_at,updated_at,is_archived').eq('is_archived', false).order('updated_at', { ascending: false }).range(0, 1999),
        db.from('crm_contacts').select('id,account_id,full_name,first_name,last_name,is_primary,is_active,is_archived').eq('is_archived', false).range(0, 4999),
        db.from('crm_opportunities').select('id,opportunity_number,name,stage,status,amount,currency_code,account_id,primary_contact_id,expected_close_date,next_step,updated_at,is_archived').eq('is_archived', false).order('updated_at', { ascending: false }).range(0, 1999),
        db.from('trade_documents').select('id,document_number,title,status,currency_code,totals,content,created_at,updated_at').eq('document_type', 'quotation').order('updated_at', { ascending: false }).range(0, 1999),
        db.from('trade_orders').select('id,order_number,title,status,currency_code,crm_account_id,crm_contact_id,opportunity_id,metadata,confirmed_from_document_id,created_at,updated_at').eq('order_type', 'sales').order('updated_at', { ascending: false }).range(0, 1999),
        db.from('trade_payments').select('id,payment_no,payment_type,status,account_id,amount,currency,net_received,created_at').order('created_at', { ascending: false }).range(0, 4999),
        db.from('trade_payment_allocations').select('id,payment_id,order_id,allocated_amount').range(0, 9999),
        db.from('trade_shipments').select('id,shipment_no,status,order_id,planned_ship_date,actual_ship_date,shipment_value,currency_code,exception_flag,created_at').order('created_at', { ascending: false }).range(0, 4999),
      ]);
      const failed = [leads, accounts, contacts, opportunities, quotes, orders, payments, allocations, shipments].find(result => result.error);
      if (failed?.error) throw failed.error;
      setData({
        leads: safeRows(leads.data), accounts: safeRows(accounts.data), contacts: safeRows(contacts.data),
        opportunities: safeRows(opportunities.data), quotes: safeRows(quotes.data), orders: safeRows(orders.data),
        payments: safeRows(payments.data), allocations: safeRows(allocations.data), shipments: safeRows(shipments.data),
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '销售流程数据读取失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const countryOptions = useMemo(() => [...new Set([
    ...(data?.leads || []).map(row => String(row.country_code || '').toUpperCase()),
    ...(data?.accounts || []).map(row => String(row.country_code || '').toUpperCase()),
  ].filter(Boolean))].sort(), [data]);

  const scoped = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLocaleLowerCase();
    const matches = (row: Row, values: unknown[]) => {
      const countryMatch = country === 'all' || String(row.country_code || '').toUpperCase() === country;
      const searchMatch = !q || values.some(value => String(value || '').toLocaleLowerCase().includes(q));
      return countryMatch && searchMatch;
    };
    const accountMap = new Map(data.accounts.map(row => [String(row.id), row]));
    const leads = data.leads.filter(row => matches(row, [row.lead_number, row.name, row.email]));
    const accounts = data.accounts.filter(row => matches(row, [row.account_number, row.account_name, row.email, row.website]));
    const accountIds = new Set(accounts.map(row => String(row.id)));
    const contacts = data.contacts.filter(row => accountIds.has(String(row.account_id)) && (!q || [row.full_name, row.email, row.phone].some(value => String(value || '').toLocaleLowerCase().includes(q))));
    const opportunities = data.opportunities.filter(row => (country === 'all' || accountIds.has(String(row.account_id))) && matches({ country_code: accountMap.get(String(row.account_id))?.country_code }, [row.opportunity_number, row.name, row.next_step]));
    const quotes = data.quotes.filter(row => {
      const content = row.content || {};
      const account = accountMap.get(String(content.account_id));
      return (country === 'all' || accountIds.has(String(account?.id))) && (!q || [row.document_number, row.title, content.account_snapshot?.account_name].some(value => String(value || '').toLocaleLowerCase().includes(q)));
    });
    const orders = data.orders.filter(row => (country === 'all' || accountIds.has(String(row.crm_account_id))) && (!q || [row.order_number, row.title, accountMap.get(String(row.crm_account_id))?.account_name].some(value => String(value || '').toLocaleLowerCase().includes(q))));
    const orderIds = new Set(orders.map(row => String(row.id)));
    const allocations = data.allocations.filter(row => orderIds.has(String(row.order_id)));
    const paymentById = new Map(data.payments.map(row => [String(row.id), row]));
    const shipments = data.shipments.filter(row => orderIds.has(String(row.order_id)));
    const contactCountByAccount = new Map<string, number>();
    contacts.forEach(row => contactCountByAccount.set(String(row.account_id), (contactCountByAccount.get(String(row.account_id)) || 0) + 1));
    const orderStats = new Map<string, { paid: number; paymentCount: number; shipmentCount: number; delivered: number; exceptions: number }>();
    orders.forEach(order => orderStats.set(String(order.id), { paid: 0, paymentCount: 0, shipmentCount: 0, delivered: 0, exceptions: 0 }));
    allocations.forEach(allocation => {
      const payment = paymentById.get(String(allocation.payment_id));
      const stat = orderStats.get(String(allocation.order_id));
      if (!payment || !stat || payment.status === 'voided') return;
      const value = Number(allocation.allocated_amount || 0);
      if (payment.payment_type === 'receipt' && ['confirmed', 'partially_reconciled', 'reconciled'].includes(String(payment.status))) stat.paid += value;
      if (payment.payment_type === 'receipt') stat.paymentCount += 1;
      if (payment.payment_type === 'refund' && payment.status === 'returned') stat.paid -= value;
    });
    shipments.forEach(shipment => {
      const stat = orderStats.get(String(shipment.order_id));
      if (!stat) return;
      stat.shipmentCount += 1;
      if (shipment.status === 'delivered') stat.delivered += 1;
      if (shipment.exception_flag || ['exception', 'delayed', 'failed', 'damaged', 'lost'].includes(String(shipment.status))) stat.exceptions += 1;
    });
    return { leads, accounts, contacts, opportunities, quotes, orders, shipments, orderStats, contactCountByAccount };
  }, [data, search, country]);

  const columns = useMemo(() => {
    if (!scoped) return [];
    const leadCards: BoardCard[] = scoped.leads.map(row => ({
      id: row.id, title: row.name, subtitle: row.lead_number + ' · ' + (row.country_code || '地区未设置'),
      status: row.is_formal ? '正式线索' : row.status === 'qualified' ? '待转化' : row.status === 'review' ? '待审核' : row.status === 'rejected' ? '已拒绝' : '草稿',
      href: '/leads', details: ['来源线索 · ' + (row.status || '未知'), '更新于 ' + dateLabel(row.updated_at)],
    }));
    const accountCards: BoardCard[] = scoped.accounts.map(row => ({
      id: row.id, title: row.account_name, subtitle: row.account_number || row.country_code || '客户档案',
      status: row.status || '未设置', href: '/accounts/' + row.id,
      details: [((scoped.contactCountByAccount.get(String(row.id)) || 0) + ' 位联系人'), (scoped.contacts.filter(contact => String(contact.account_id) === String(row.id)).slice(0, 2).map(contact => contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ')).filter(Boolean).join('、') || '联系人待补充'), row.source_lead_id ? '由线索转化' : '直接建立'],
    }));
    const opportunityCards: BoardCard[] = scoped.opportunities.map(row => ({
      id: row.id, title: row.name, subtitle: row.opportunity_number || '销售商机',
      status: opportunityLabels[String(row.stage)] || String(row.stage || '未设置'),
      amount: money(row.amount, row.currency_code || 'USD'), href: '/opportunities/' + row.id,
      details: ['预计成交 ' + dateLabel(row.expected_close_date), row.next_step || '下一步行动未设置'],
      warning: row.stage === 'lost', closed: ['won', 'lost'].includes(String(row.stage)),
    }));
    const quoteCards: BoardCard[] = scoped.quotes.map(row => {
      const content = row.content || {};
      const state = quoteState(row);
      return {
        id: row.id, title: row.title || row.document_number, subtitle: row.document_number || '报价单',
        status: quoteLabels[state] || state, amount: money(row.totals?.grand_total, row.currency_code || 'USD'),
        href: '/quotes/' + row.id,
        details: [content.account_snapshot?.account_name || '客户未关联', '有效期 ' + dateLabel(content.quote?.valid_until)],
        warning: ['rejected', 'expired', 'cancelled'].includes(state), closed: ['rejected', 'expired', 'cancelled'].includes(state),
      };
    });
    const orderCards: BoardCard[] = scoped.orders.map(row => {
      const state = orderState(row);
      const stats = scoped.orderStats.get(String(row.id));
      return {
        id: row.id, title: row.title || row.order_number, subtitle: row.order_number,
        status: orderLabels[state] || state, amount: money(row.metadata?.sales_order?.totals?.grand_total, row.currency_code || 'USD'),
        href: '/sales-orders/' + row.id,
        details: ['收款 ' + money(stats?.paid || 0, row.currency_code || 'USD'), '发运 ' + (stats?.shipmentCount || 0) + ' 票 · 签收 ' + (stats?.delivered || 0) + ' 票'],
        warning: (stats?.exceptions || 0) > 0, closed: state === 'cancelled',
      };
    });
    const executionCards: BoardCard[] = scoped.orders.filter(row => ['confirmed', 'completed'].includes(orderState(row))).map(row => {
      const stats = scoped.orderStats.get(String(row.id));
      return {
        id: row.id + '-execution', title: row.order_number, subtitle: row.title || '订单履约',
        status: orderState(row) === 'completed' ? '订单已完成' : '履约进行中',
        href: '/sales-orders/' + row.id,
        details: [
          '收款 ' + money(stats?.paid || 0, row.currency_code || 'USD'),
          '发运 ' + (stats?.shipmentCount || 0) + ' 票 · 已签收 ' + (stats?.delivered || 0) + ' 票',
          (stats?.exceptions || 0) > 0 ? '存在发运异常' : '无已标记发运异常',
        ],
        warning: (stats?.exceptions || 0) > 0,
      };
    });
    return [
      { title: '线索', hint: '审核与转化', cards: leadCards, empty: '暂无线索记录' },
      { title: '客户与联系人', hint: '客户主体与关键联系人', cards: accountCards, empty: '暂无客户档案' },
      { title: '销售商机', hint: '商机阶段与预计金额', cards: opportunityCards, empty: '暂无销售商机' },
      { title: '报价单', hint: '报价状态与有效期', cards: quoteCards, empty: '暂无报价单' },
      { title: '销售订单', hint: '确认、取消与订单金额', cards: orderCards, empty: '暂无销售订单' },
      { title: '订单履约', hint: '收款与发运并行推进', cards: executionCards, empty: '暂无待履约订单' },
    ].map(column => ({ ...column, count: column.cards.length }));
  }, [scoped]);

  const summary = useMemo(() => {
    if (!scoped) return [];
    const activeOpportunities = scoped.opportunities.filter(row => !['won', 'lost'].includes(String(row.stage)));
    const openQuotes = scoped.quotes.filter(row => ['draft', 'sent', 'viewed'].includes(quoteState(row)));
    const activeOrders = scoped.orders.filter(row => ['confirmed', 'completed'].includes(orderState(row)));
    const unpaidOrders = activeOrders.filter(row => {
      const stats = scoped.orderStats.get(String(row.id));
      return Number(stats?.paid || 0) < Number(row.metadata?.sales_order?.totals?.grand_total || 0);
    });
    return [
      { label: '线索', value: scoped.leads.length, href: '/leads', icon: semanticIcons.userFollow },
      { label: '客户', value: scoped.accounts.length, href: '/accounts', icon: semanticIcons.building },
      { label: '活跃商机', value: activeOpportunities.length, href: '/opportunities', icon: semanticIcons.chart },
      { label: '待处理报价', value: openQuotes.length, href: '/quotes', icon: semanticIcons.document },
      { label: '销售订单', value: scoped.orders.length, href: '/sales-orders', icon: semanticIcons.shoppingCart },
      { label: '待收款订单', value: unpaidOrders.length, href: '/payments', icon: semanticIcons.money },
      { label: '发运单', value: scoped.shipments.length, href: '/shipments', icon: semanticIcons.delivery },
      { label: '发运异常', value: scoped.shipments.filter(row => row.exception_flag).length, href: '/shipments', icon: semanticIcons.warning },
    ];
  }, [scoped]);

  const visibleColumns = useMemo(() => view === 'all' ? columns : columns.map(column => ({ ...column, cards: column.cards.filter(card => !card.closed) })), [columns, view]);

  return (
    <main>
      <PageHeader>
        <div>
          <p className="tp-sales-process__eyebrow">TRADEPILOT / SALES PROCESS</p>
          <h1>销售流程</h1>
          <p>从线索转化、客户开发到报价、订单、收款与发运，统一追踪业务进展。</p>
        </div>
        <div>
          <Button kind="tertiary" renderIcon={semanticIcons.refresh} disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}>刷新数据</Button>
          <Button kind="primary" renderIcon={semanticIcons.add} onClick={() => navigate('/leads/new')}>创建线索</Button>
        </div>
      </PageHeader>

      {error && <InlineNotification kind="error" title="流程数据读取失败" subtitle={error} lowContrast/>}
      <section aria-label="销售流程指标">
        {loading && !data ? <TPSkeleton variant="card" rows={2}/> : <Grid fullWidth narrow>{summary.map(item => {
          const Icon = item.icon;
          return <Column key={item.label} sm={4} md={4} lg={4}><ClickableTile onClick={() => navigate(item.href)}>
            <Icon size={20}/><p>{item.label}</p><strong>{item.value.toLocaleString('zh-CN')}</strong>
          </ClickableTile></Column>;
        })}</Grid>}
      </section>

      <section aria-label="流程筛选">
        <Grid fullWidth narrow>
          <Column sm={4} md={4} lg={6}><TextInput id="sales-process-search" labelText="搜索业务记录" placeholder="搜索企业、编号、商机或订单" value={search} onChange={event => setSearch(event.currentTarget.value)}/></Column>
          <Column sm={4} md={4} lg={4}><Select id="sales-process-country" labelText="目标市场" value={country} onChange={event => setCountry(event.currentTarget.value)}>
            <SelectItem value="all" text="全部市场"/>{countryOptions.map(code => <SelectItem key={code} value={code} text={code}/>)}
          </Select></Column>
          <Column sm={4} md={8} lg={6}><div>
          <Button kind={view === 'board' ? 'secondary' : 'ghost'} size="md" onClick={() => setView('board')} renderIcon={semanticIcons.dashboard}>阶段看板</Button>
          <Button kind={view === 'all' ? 'secondary' : 'ghost'} size="md" onClick={() => setView('all')} renderIcon={semanticIcons.view}>全部阶段</Button>
          </div></Column>
        </Grid>
      </section>

      {loading && !data ? <TPSkeleton variant="table" rows={6}/> : (
        <section aria-label="销售业务阶段">
          <Grid fullWidth narrow>{visibleColumns.map(column => <Column key={column.title} sm={4} md={4} lg={8}><StageColumn {...column}/></Column>)}</Grid>
        </section>
      )}

      {data && <footer>
        <span>真实业务数据 · 当前登录账户可访问范围</span>
        <span>更新于 {new Date(data.updatedAt).toLocaleString('zh-CN')}</span>
      </footer>}
    </main>
  );
}
