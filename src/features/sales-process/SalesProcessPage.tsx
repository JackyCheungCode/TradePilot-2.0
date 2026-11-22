import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, ClickableTile, InlineNotification, Select, SelectItem, Tag, TextInput, TPSkeleton, semanticIcons,
} from '@/design-system';
import { PageHeader } from '@/design-system';
import '@/design-system/patterns/sales-process.scss';
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
const paymentLabels: Record<string, string> = { draft: '草稿', pending_confirmation: '待确认', confirmed: '已确认', partially_reconciled: '部分核销', reconciled: '已核销', returned: '已退回', voided: '已作废' };
const shipmentLabels: Record<string, string> = { draft: '草稿', pending_booking: '待订舱', booked: '已订舱', loaded: '已装柜', customs_cleared: '已报关', departed: '已开船', in_transit: '运输中', arrived: '已到港', import_cleared: '已清关', delivered: '已签收', cancelled: '已取消' };
const opportunityLabels: Record<string, string> = {
  prospecting: '初步接洽', qualification: '资格确认', needs_analysis: '需求分析',
  proposal: '方案提议', negotiation: '商务谈判', won: '已赢单', lost: '已输单',
};

function RecordCard({ card }: { card: BoardCard }) {
  const navigate = useNavigate();
  return (
    <ClickableTile className="tp-sales-process__record" onClick={() => navigate(card.href)}>
      <div className="tp-sales-process__record-heading">
        <strong>{card.title || '未命名记录'}</strong>
        <Tag type={card.warning ? 'red' : 'blue'}>{card.status}</Tag>
      </div>
      <p className="tp-sales-process__record-subtitle">{card.subtitle}</p>
      {card.amount && <strong className="tp-sales-process__record-amount">{card.amount}</strong>}
      {card.details.length > 0 && <ul>{card.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
    </ClickableTile>
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
  const [selectedStage, setSelectedStage] = useState('线索');

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
        db.from('trade_payments').select('id,payment_no,payment_type,status,account_id,payer_name,amount,currency,net_received,unallocated_amount,created_at').order('created_at', { ascending: false }).range(0, 4999),
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
    const orderNumberById = new Map(data.orders.map(row => [String(row.id), row.order_number]));
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
    const payments = data.payments.filter(row => (country === 'all' || data.accounts.some(account => String(account.id) === String(row.account_id) && String(account.country_code || '').toUpperCase() === country)) && (!q || [row.payment_no, row.payer_name].some(value => String(value || '').toLocaleLowerCase().includes(q))));
    const shipments = data.shipments.filter(row => orderIds.has(String(row.order_id)) || (q && String(row.shipment_no || '').toLocaleLowerCase().includes(q)));
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
    return { leads, accounts, contacts, opportunities, quotes, orders, payments, shipments, orderStats, contactCountByAccount, orderNumberById };
  }, [data, search, country]);

  const columns = useMemo(() => {
    if (!scoped) return [];
    const leadCards: BoardCard[] = scoped.leads.map(row => ({
      id: row.id, title: row.name, subtitle: row.lead_number + ' · ' + (row.country_code || '地区未设置'),
      status: row.is_formal ? '正式线索' : row.status === 'qualified' ? '待转化' : row.status === 'review' ? '待审核' : row.status === 'rejected' ? '已拒绝' : '草稿',
      href: '/leads', details: ['来源线索 · ' + (row.status || '未知'), '更新于 ' + dateLabel(row.updated_at)], closed: row.status === 'rejected',
    }));
    const contactCards: BoardCard[] = scoped.contacts.map(row => {
      const account = data?.accounts.find(item => String(item.id) === String(row.account_id));
      const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || '未命名联系人';
      return {
        id: row.id, title: name, subtitle: account?.account_name || '所属客户未设置',
        status: row.is_primary ? '主要联系人' : row.is_active ? '有效联系人' : '未激活',
        href: row.account_id ? '/accounts/' + row.account_id : '/accounts',
        details: [row.email || '邮箱未设置', row.phone || '电话未设置'],
      };
    });
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
    const paymentCards: BoardCard[] = scoped.payments.map(row => ({
      id: row.id, title: row.payment_no || '收款记录', subtitle: (row.payer_name || '付款方未设置') + ' · ' + (row.payment_type === 'refund' ? '退款' : '收款'),
      status: paymentLabels[String(row.status)] || String(row.status || '未知'), amount: money(row.net_received ?? row.amount, row.currency || 'USD'), href: '/payments/' + row.id,
      details: ['未分配金额 ' + money(row.unallocated_amount, row.currency || 'USD'), '到账日期 ' + dateLabel(row.received_date || row.payment_date)],
      warning: Number(row.unallocated_amount || 0) > 0 || row.status === 'pending_confirmation', closed: ['voided', 'returned'].includes(String(row.status)),
    }));
    const shipmentCards: BoardCard[] = scoped.shipments.map(row => ({
      id: row.id, title: row.shipment_no || '发运单', subtitle: '订单 ' + (scoped.orderNumberById.get(String(row.order_id)) || '未关联'),
      status: shipmentLabels[String(row.status)] || String(row.status || '未知'), amount: money(row.shipment_value, row.currency_code || 'USD'), href: '/shipments/' + row.id,
      details: ['计划发运 ' + dateLabel(row.planned_ship_date), '实际发运 ' + dateLabel(row.actual_ship_date)], warning: Boolean(row.exception_flag), closed: row.status === 'cancelled',
    }));
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
      { title: '联系人', hint: '关键联系人与联系方式', cards: contactCards, empty: '暂无联系人记录' },
      { title: '客户', hint: '客户主体与商业关系', cards: accountCards, empty: '暂无客户档案' },
      { title: '销售商机', hint: '商机阶段与预计金额', cards: opportunityCards, empty: '暂无销售商机' },
      { title: '报价单', hint: '报价状态与有效期', cards: quoteCards, empty: '暂无报价单' },
      { title: '销售订单', hint: '确认、取消与订单金额', cards: orderCards, empty: '暂无销售订单' },
      { title: '订单履约', hint: '收款与发运并行推进', cards: executionCards, empty: '暂无待履约订单' },
      { title: '收款记录', hint: '到账、核销与退款', cards: paymentCards, empty: '暂无收款记录' },
      { title: '发运记录', hint: '分批发运与签收状态', cards: shipmentCards, empty: '暂无发运记录' },
    ].map(column => ({ ...column, count: column.cards.length }));
  }, [scoped]);

  const summary = useMemo(() => {
    if (!scoped) return [];
    return [
      { label: '线索', value: scoped.leads.length, href: '/leads', icon: semanticIcons.userFollow, detail: '待审核与待转化' },
      { label: '客户', value: scoped.accounts.length, href: '/accounts', icon: semanticIcons.building, detail: scoped.contacts.length + ' 位联系人' },
      { label: '活跃商机', value: scoped.opportunities.filter(row => !['won', 'lost'].includes(String(row.stage))).length, href: '/opportunities', icon: semanticIcons.chart, detail: '持续推进中的销售机会' },
      { label: '销售订单', value: scoped.orders.length, href: '/sales-orders', icon: semanticIcons.shoppingCart, detail: scoped.payments.length + ' 笔收款 · ' + scoped.shipments.length + ' 票发运' },
    ];
  }, [scoped]);

  const visibleColumns = useMemo(() => view === 'all' ? columns : columns.map(column => ({ ...column, cards: column.cards.filter(card => !card.closed) })), [columns, view]);

  const processColumns = columns.slice(0, 7);
  const selectedColumn = columns.find(column => column.title === selectedStage) || processColumns[0];
  const parallelColumns = columns.slice(7, 9);

  return (
    <main className="tp-sales-process">
      <PageHeader className="tp-sales-process__header">
        <div>
          <p className="tp-sales-process__eyebrow">TRADEPILOT / SALES OPERATIONS</p>
          <h1>销售流程</h1>
          <p>沿着业务推进路径，集中查看线索转化、商机推进、报价成交及订单履约。</p>
        </div>
        <div className="tp-sales-process__actions">
          <Button kind="tertiary" renderIcon={semanticIcons.refresh} disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}>刷新数据</Button>
          <Button kind="primary" renderIcon={semanticIcons.add} onClick={() => navigate('/leads/new')}>创建线索</Button>
        </div>
      </PageHeader>

      {error && <InlineNotification kind="error" title="流程数据读取失败" subtitle={error} lowContrast/>}

      <section className="tp-sales-process__metrics" aria-label="销售经营概览">
        {loading && !data ? <TPSkeleton variant="card" rows={1}/> : summary.map(item => {
          const Icon = item.icon;
          return (
            <ClickableTile key={item.label} className="tp-sales-process__metric" onClick={() => navigate(item.href)}>
              <div className="tp-sales-process__metric-top"><span>{item.label}</span><Icon size={20}/></div>
              <strong>{item.value.toLocaleString('zh-CN')}</strong>
              <small>{item.detail}</small>
            </ClickableTile>
          );
        })}
      </section>

      <section className="tp-sales-process__workspace" aria-label="销售流程看板">
        <div className="tp-sales-process__section-heading">
          <div><h2>业务推进路径</h2><p>选择任一阶段，查看当前阶段的业务记录与下一步动作。</p></div>
          <div className="tp-sales-process__view-actions">
            <Button kind={view === 'board' ? 'secondary' : 'ghost'} size="md" renderIcon={semanticIcons.dashboard} onClick={() => setView('board')}>流程视图</Button>
            <Button kind={view === 'all' ? 'secondary' : 'ghost'} size="md" renderIcon={semanticIcons.view} onClick={() => setView('all')}>全部阶段</Button>
          </div>
        </div>

        <div className="tp-sales-process__filters">
          <TextInput id="sales-process-search" labelText="搜索业务记录" placeholder="企业名称、编号、商机或订单" value={search} onChange={event => setSearch(event.currentTarget.value)}/>
          <Select id="sales-process-country" labelText="目标市场" value={country} onChange={event => setCountry(event.currentTarget.value)}>
            <SelectItem value="all" text="全部市场"/>{countryOptions.map(code => <SelectItem key={code} value={code} text={code}/>)}
          </Select>
        </div>

        {loading && !data ? <TPSkeleton variant="table" rows={5}/> : view === 'board' ? (
          <>
            <div className="tp-sales-process__flow" aria-label="销售阶段">
              {processColumns.map((column, index) => (
                <ClickableTile
                  key={column.title}
                  className={'tp-sales-process__step' + (selectedColumn?.title === column.title ? ' is-selected' : '')}
                  onClick={() => setSelectedStage(column.title)}
                  aria-current={selectedColumn?.title === column.title ? 'step' : undefined}
                >
                  <span className="tp-sales-process__step-index">{index + 1}</span>
                  <span className="tp-sales-process__step-copy"><strong>{column.title}</strong><small>{column.hint}</small></span>
                  <span className="tp-sales-process__step-count">{column.count}</span>
                </ClickableTile>
              ))}
            </div>

            <section className="tp-sales-process__stage-panel" aria-label={selectedColumn?.title || '当前阶段'}>
              <div className="tp-sales-process__section-heading">
                <div><h2>{selectedColumn?.title}</h2><p>{selectedColumn?.hint} · {selectedColumn?.count || 0} 条记录</p></div>
                <Tag type="blue">{selectedColumn?.count || 0} 条</Tag>
              </div>
              {selectedColumn?.cards.length ? (
                <div className="tp-sales-process__records">
                  {selectedColumn.cards.map(card => <RecordCard key={card.id} card={card}/>)}
                </div>
              ) : <p className="tp-sales-process__empty">{selectedColumn?.empty || '当前阶段暂无记录'}</p>}
            </section>

            <section className="tp-sales-process__parallel" aria-label="订单并行履约">
              <div className="tp-sales-process__section-heading">
                <div><h2>订单并行履约</h2><p>订单确认后，收款与分批发运可以并行推进，不强制要求先后顺序。</p></div>
              </div>
              <div className="tp-sales-process__parallel-grid">
                {parallelColumns.map(column => (
                  <div className="tp-sales-process__parallel-lane" key={column.title}>
                    <div className="tp-sales-process__lane-heading"><div><h3>{column.title}</h3><p>{column.hint}</p></div><Tag type="cool-gray">{column.count}</Tag></div>
                    {column.cards.length ? <div className="tp-sales-process__records">{column.cards.slice(0, 4).map(card => <RecordCard key={card.id} card={card}/>)}</div> : <p className="tp-sales-process__empty">{column.empty}</p>}
                    {column.cards.length > 4 && <p className="tp-sales-process__more">另有 {column.cards.length - 4} 条记录，请使用全部阶段查看。</p>}
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="tp-sales-process__all-stages">
            {visibleColumns.map(column => (
              <section className="tp-sales-process__stage-panel" key={column.title}>
                <div className="tp-sales-process__section-heading"><div><h2>{column.title}</h2><p>{column.hint}</p></div><Tag type="cool-gray">{column.cards.length}</Tag></div>
                {column.cards.length ? <div className="tp-sales-process__records">{column.cards.map(card => <RecordCard key={card.id} card={card}/>)}</div> : <p className="tp-sales-process__empty">{column.empty}</p>}
              </section>
            ))}
          </div>
        )}
      </section>

      {data && <footer className="tp-sales-process__footer"><span>基于现有业务记录汇总 · 不改变原有业务状态</span><span>更新于 {new Date(data.updatedAt).toLocaleString('zh-CN')}</span></footer>}
    </main>
  );}
