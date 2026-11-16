import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, ProgressIndicator, ProgressStep,
  Tile,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/documents.scss';

type Order = { id: string; order_number: string; title: string | null; order_type: string; status: string; currency_code: string; locked_at: string | null; confirmed_at: string | null; crm_account?: { account_name?: string } | null };
type Shipment = { id: string; shipment_no: string; status: string; planned_ship_date: string | null; actual_ship_date: string | null };
type Template = { id: string; name: string; document_type: string; locale: string; is_default: boolean; is_active: boolean };
type Doc = { id: string; document_number: string; title: string; document_type: string; status: string; locale: string; currency_code: string; created_at: string; order_id: string; shipment_id?: string | null; current_version?: number };
type Step = 1 | 2 | 3 | 4;

type DocumentOption = { id: string; label: string; detail: string; shipment: boolean };
type DocumentGroup = { id: string; title: string; description: string; items: DocumentOption[] };

const documentGroups: DocumentGroup[] = [
  { id: 'sales', title: '销售与成交', description: '根据已确认的销售订单生成对客文件', items: [
    { id: 'proforma_invoice', label: '形式发票（PI）', detail: '用于预付款、开证及正式发货前确认', shipment: false },
    { id: 'sales_contract', label: '销售合同', detail: '锁定买卖双方、价格和贸易条款', shipment: false },
    { id: 'sales_confirmation', label: '订单确认书', detail: '向买方确认订单内容和交付安排', shipment: false },
  ] },
  { id: 'shipping', title: '发运与出口', description: '根据订单和本次实际发运数量生成', items: [
    { id: 'commercial_invoice', label: '商业发票', detail: '按本次发运批次数量形成发票草稿', shipment: true },
    { id: 'packing_list', label: '装箱单', detail: '使用本次发运的包装、箱数、重量和货品明细', shipment: true },
    { id: 'shipping_instructions', label: '装运指示', detail: '整理本次发运的收发货人与运输信息', shipment: true },
  ] },
];
const typeLabel = (type: string) => documentGroups.flatMap(g => g.items).find(x => x.id === type)?.label ?? type;
const statusLabel = (status: string) => (({ draft: '草稿', review: '待审核', approved: '已批准', issued: '已签发', sent: '已发送', void: '已作废', voided: '已作废', archived: '已归档' } as Record<string, string>)[status] ?? status);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '—';
const unwrap = <T,>(payload: any): T => (payload?.data ?? payload?.result ?? payload) as T;

export function DocumentsCenterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialOrderId = searchParams.get('order_id') || '';
  const initialShipmentId = searchParams.get('shipment_id') || '';
  const initialDocumentType = searchParams.get('document_type') || 'proforma_invoice';
  const initialCategory = searchParams.get('category') || (['commercial_invoice', 'packing_list', 'shipping_instructions'].includes(initialDocumentType) ? 'shipping' : 'sales');
  const initialNeedsShipment = Boolean(documentGroups.flatMap(group => group.items).find(item => item.id === initialDocumentType)?.shipment);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState<Step>(initialOrderId ? (initialNeedsShipment && !initialShipmentId ? 3 : 4) : 1);
  const [category, setCategory] = useState(initialCategory);
  const [documentType, setDocumentType] = useState(initialDocumentType);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [shipmentId, setShipmentId] = useState(initialShipmentId);
  const [templateId, setTemplateId] = useState('');
  const [locale, setLocale] = useState('en');
  const [currency, setCurrency] = useState('USD');
  const [created, setCreated] = useState<Doc | null>(null);

  const selectedType = useMemo(() => documentGroups.flatMap(g => g.items).find(x => x.id === documentType), [documentType]);
  const selectedOrder = useMemo(() => orders.find(x => x.id === orderId), [orders, orderId]);
  const selectedShipment = useMemo(() => shipments.find(x => x.id === shipmentId), [shipments, shipmentId]);
  const activeTemplates = useMemo(() => templates.filter(x => x.document_type === documentType && x.is_active), [templates, documentType]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const client = await getSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
    const response = await fetch('/api/v1/trade/' + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? '单据服务请求失败。');
    return unwrap<any>(payload);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const [orderResult, templateResult] = await Promise.all([
        client.from('trade_orders').select('id,order_number,title,order_type,status,currency_code,locked_at,confirmed_at,crm_account:crm_accounts(account_name)') .eq('order_type', 'sales').not('locked_at', 'is', null).order('updated_at', { ascending: false }).limit(100),
        request('templates'),
      ]);
      if (orderResult.error) throw orderResult.error;
      setOrders((orderResult.data ?? []) as unknown as Order[]);
      setTemplates(Array.isArray(templateResult) ? templateResult : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据中心加载失败。'); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedOrder?.currency_code) setCurrency(selectedOrder.currency_code); }, [selectedOrder?.currency_code]);

  useEffect(() => {
    if (templateId && !activeTemplates.some(template => template.id === templateId)) setTemplateId('');
  }, [activeTemplates, templateId]);

  useEffect(() => {
    if (!selectedType?.shipment || !orderId) { setShipments([]); return; }
    let alive = true;
    void (async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error: queryError } = await client.from('trade_shipments')
          .select('id,shipment_no,status,planned_ship_date,actual_ship_date')
          .eq('order_id', orderId).order('created_at', { ascending: false });
        if (queryError) throw queryError;
        if (alive) setShipments((data ?? []) as Shipment[]);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : '发运批次读取失败。'); }
    })();
    return () => { alive = false; };
  }, [orderId, selectedType?.shipment]);

  const chooseCategory = (value: string) => {
    setShipmentId('');
    setCategory(value);
    const group = documentGroups.find(g => g.id === value);
    if (group) setDocumentType(group.items[0].id);
    setStep(2);
  };

  const createDocument = async () => {
    if (!orderId || !selectedType) return;
    if (selectedType.shipment && !shipmentId) { setError('该单据必须选择本次实际发运批次。'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await request('documents', { method: 'POST', body: JSON.stringify({
        order_id: orderId, shipment_id: shipmentId || undefined, document_type: documentType,
        title: typeLabel(documentType), template_id: templateId || undefined, locale, currency_code: currency,
      }) });
      setCreated(result as Doc);
      setNotice('单据草稿已创建，已关联对应订单' + (shipmentId ? '及发运批次' : '') + '。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据创建失败。'); }
    finally { setSaving(false); }
  };

  return <main className="tp-documents">
    <header className="tp-documents__header">
      <div><p className="tp-documents__eyebrow">TRADE OPERATIONS / DOCUMENTS</p><h1>单据中心</h1><p>从报价、销售订单和实际发运数据生成外贸单据，避免重复录入。</p></div>
      <div className="tp-documents__actions"><Button kind="primary" onClick={() => { setCreated(null); setStep(1); setError(''); setNotice(''); }}>新建单据</Button><Button kind="secondary" onClick={() => navigate('/documents/generated')}>已生成单据</Button></div>
    </header>

    {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {notice && <InlineNotification kind="success" lowContrast title="已完成" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

    {created && <section className="tp-documents__created" aria-live="polite">
      <div><Tag type="green">草稿已创建</Tag><h2>{created.document_number}</h2><p>{typeLabel(created.document_type)} · {created.title}</p></div>
      <div className="tp-documents__actions"><Button kind="secondary" onClick={() => navigate('/documents/generated')}>查看已生成单据</Button><Button kind="primary" onClick={() => navigate(`/documents/${created.id}`)}>打开单据预览</Button></div>
    </section>}

    {step > 0 && <section className="tp-documents__wizard" aria-label="单据创建流程">
      <div className="tp-documents__progress-wrap"><ProgressIndicator currentIndex={step - 1} spaceEqually>
        <ProgressStep label="单据分类" description="选择业务场景" />
        <ProgressStep label="选择单据" description="确定单据类型" />
        <ProgressStep label="业务来源" description="关联订单或发运" />
        <ProgressStep label="模板与生成" description="设置语言并创建草稿" />
      </ProgressIndicator><p className="tp-documents__mobile-step-label">第 {step} 步 / 4 · {['单据分类','选择单据','业务来源','模板与生成'][step - 1]}</p></div>
      {step === 1 && <div className="tp-documents__step-content"><h2>选择单据分类</h2><p>先确定业务场景，系统会据此筛选可用单据。</p><div className="tp-documents__category-grid">
        {documentGroups.map(group => <Tile key={group.id} className="tp-documents__category"><h3>{group.title}</h3><p>{group.description}</p><Button kind="tertiary" onClick={() => chooseCategory(group.id)}>选择分类</Button></Tile>)}
      </div></div>}
      {step === 2 && <div className="tp-documents__step-content"><h2>选择具体单据</h2><p>不同单据会读取不同的业务数据。</p><div className="tp-documents__form-grid"><div><Select id="tp-doc-type" labelText="单据类型" value={documentType} onChange={e => { const nextType = e.currentTarget.value; setDocumentType(nextType); if (!documentGroups.flatMap(group => group.items).find(item => item.id === nextType)?.shipment) setShipmentId(''); }}>{documentGroups.find(g => g.id === category)?.items.map(item => <SelectItem key={item.id} value={item.id} text={item.label} />)}</Select></div><div className="tp-documents__type-description"><strong>{selectedType?.label}</strong><span>{selectedType?.detail}</span><small>{selectedType?.shipment ? '需要选择具体发运批次' : '从已锁定的订单成交快照读取'}</small></div></div><div className="tp-documents__wizard-actions"><Button kind="tertiary" onClick={() => setStep(1)}>上一步</Button><Button kind="primary" onClick={() => setStep(3)}>下一步</Button></div></div>}
      {step === 3 && <div className="tp-documents__step-content"><h2>选择业务来源</h2><p>只显示销售订单。单据会从订单及其关联档案读取客户、企业、产品和成交条款。</p>
        <div className="tp-documents__form-grid"><div><Select id="tp-doc-order" labelText="销售订单" value={orderId} onChange={e => { setOrderId(e.currentTarget.value); setShipmentId(''); setCurrency(orders.find(o => o.id === e.currentTarget.value)?.currency_code || 'USD'); }}><SelectItem value="" text="请选择销售订单" />{orders.map(o => <SelectItem key={o.id} value={o.id} text={(o.order_number || o.title || o.id) + ' · ' + (o.crm_account?.account_name || '未关联客户')} />)}</Select></div>
        {selectedType?.shipment && <div><Select id="tp-doc-shipment" labelText="本次发运批次" value={shipmentId} onChange={e => setShipmentId(e.currentTarget.value)} disabled={!orderId}><SelectItem value="" text={orderId ? '请选择发运批次' : '请先选择销售订单'} />{shipments.map(s => <SelectItem key={s.id} value={s.id} text={s.shipment_no + ' · ' + s.status + ' · ' + dateLabel(s.actual_ship_date || s.planned_ship_date)} />)}</Select></div>}</div>
        {selectedOrder && <div className="tp-documents__source-summary"><strong>{selectedOrder.order_number || selectedOrder.title}</strong><span>{selectedOrder.crm_account?.account_name || '未关联客户'}</span><span>{selectedOrder.currency_code || 'USD'}</span><Tag type={selectedOrder.locked_at ? 'green' : 'warm-gray'}>{selectedOrder.locked_at ? '成交快照已锁定' : '尚未锁定成交快照'}</Tag></div>}
        {selectedType?.shipment && orderId && shipments.length === 0 && <InlineNotification kind="warning" lowContrast title="暂无发运批次" subtitle="请先在发运管理中创建该订单的实际发运批次，再生成商业发票或装箱单。" />}
        <div className="tp-documents__wizard-actions"><Button kind="tertiary" onClick={() => setStep(2)}>上一步</Button><Button kind="primary" disabled={!orderId || (Boolean(selectedType?.shipment) && !shipmentId)} onClick={() => setStep(4)}>下一步</Button></div>
      </div>}
      {step === 4 && <div className="tp-documents__step-content"><h2>模板与生成</h2><p>模板负责版式，业务字段由订单和发运数据自动填充。草稿创建后仍可继续校对。</p>
        <div className="tp-documents__form-grid"><div><Select id="tp-doc-template" labelText="单据模板" value={templateId} onChange={e => setTemplateId(e.currentTarget.value)}><SelectItem value="" text="使用系统默认版式" />{activeTemplates.map(t => <SelectItem key={t.id} value={t.id} text={t.name + (t.is_default ? ' · 默认' : '')} />)}</Select></div>
        <div><Select id="tp-doc-locale" labelText="单据语言" value={locale} onChange={e => setLocale(e.currentTarget.value)}><SelectItem value="en" text="English" /><SelectItem value="zh-CN" text="简体中文" /><SelectItem value="zh-TW" text="繁體中文" /><SelectItem value="es" text="Español" /><SelectItem value="fr" text="Français" /><SelectItem value="de" text="Deutsch" /></Select></div>
        <div className="tp-documents__currency-summary"><span>订单成交币种</span><strong>{selectedOrder?.currency_code || currency}</strong><small>沿用已确认订单币种，避免金额与成交币种不一致</small></div></div>
        <div className="tp-documents__review"><strong>生成内容</strong><span>{typeLabel(documentType)}</span><span>{selectedOrder?.order_number || selectedOrder?.title}</span>{selectedShipment && <span>{selectedShipment.shipment_no}</span>}<span>{locale} · {currency}</span></div>
        {documentType === 'commercial_invoice' && <InlineNotification kind="warning" lowContrast title="部分发运金额需要复核" subtitle="系统按本次发运数量分摊产品折扣和税额；订单级运费、保险及其他费用不会自动计入本次发票总额，请在正式签发前核对。" />}
        <div className="tp-documents__wizard-actions"><Button kind="tertiary" onClick={() => setStep(3)}>上一步</Button><Button kind="primary" disabled={saving || !orderId || !currency.trim()} onClick={() => void createDocument()}>{saving ? '正在创建…' : '生成单据草稿'}</Button></div>
        {saving && <InlineLoading description="正在读取业务数据并创建版本快照…" />}
      </div>}
    </section>}

  </main>;
}
