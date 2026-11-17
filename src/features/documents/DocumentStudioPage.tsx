import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/documents.scss';

type Json = Record<string, any>;
type DocType = 'quotation' | 'proforma_invoice' | 'sales_contract' | 'commercial_invoice' | 'packing_list' | 'shipping_instructions';
type SourceOrder = { id: string; order_number: string; title: string; order_type: string; status: string; currency_code: string; locked_at?: string | null };
type Shipment = { id: string; shipment_no: string; status: string; planned_ship_date?: string; actual_ship_date?: string };
type ElementKind = 'text' | 'field' | 'table' | 'image' | 'shape';
type StudioElement = { id: string; type: ElementKind; name: string; x: number; y: number; width: number; height: number; text?: string; binding?: string; fontSize?: number; fontWeight?: string; fontFamily?: string; color?: string; background?: string; align?: string; border?: string; imageUrl?: string; locked?: boolean };
type Template = { id: string; name: string; document_type: string; locale: string; template_config: Json; is_default: boolean; is_active: boolean };
type CreatedDoc = { id: string; document_number: string; document_type: string; content: Json; totals: Json; template_id?: string; current_version: number };

const DOC_TYPES: { value: DocType; label: string; source: 'order' | 'shipment'; detail: string }[] = [
  { value: 'quotation', label: '报价单', source: 'order', detail: '从销售订单与产品报价信息生成' },
  { value: 'proforma_invoice', label: '形式发票（PI）', source: 'order', detail: '读取已确认交易条件与订单成交快照' },
  { value: 'sales_contract', label: '销售合同', source: 'order', detail: '读取买卖双方、产品及成交条款' },
  { value: 'commercial_invoice', label: '商业发票', source: 'shipment', detail: '按本次实际发运数量计算发票金额' },
  { value: 'packing_list', label: '装箱单', source: 'shipment', detail: '读取本次发运的包装、箱数、重量和货品' },
  { value: 'shipping_instructions', label: '装运指示', source: 'shipment', detail: '读取发运批次和运输信息' },
];
const LOCALES = [{ value: 'en', label: 'English' }, { value: 'zh-CN', label: '简体中文' }, { value: 'zh-TW', label: '繁體中文' }, { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' }];
const FIELD_OPTIONS = [
  ['seller_name', '卖方名称'], ['seller_address', '卖方地址'], ['buyer_name', '买方名称'], ['buyer_address', '买方地址'],
  ['buyer_shipping_address', '收货地址'], ['order_number', '订单编号'], ['customer_reference', '客户参考号'],
  ['payment_terms', '付款条件'], ['incoterms_code', '贸易术语'], ['named_place', '指定地点'],
  ['delivery_date', '交付日期'], ['contact_name', '联系人'], ['contact_email', '联系人邮箱'],
  ['shipment.shipment_no', '发运批次号'], ['shipment.total_packages', '包装件数'],
  ['shipment.total_net_weight', '净重'], ['shipment.total_gross_weight', '毛重'], ['shipment.total_volume', '体积'],
  ['totals.grand_total', '总金额'], ['document.document_number', '单据编号'],
] as const;
const titleFor = (type: string) => DOC_TYPES.find(x => x.value === type)?.label ?? type;
const initialElements = (type: DocType): StudioElement[] => [
  { id: 'title', type: 'text', name: '单据标题', x: 25, y: 16, width: 160, height: 14, text: titleFor(type).toUpperCase(), fontSize: 20, fontWeight: '700', align: 'center', color: '#161616' },
  { id: 'seller-label', type: 'text', name: '卖方标签', x: 16, y: 42, width: 80, height: 7, text: 'SELLER', fontSize: 9, fontWeight: '700' },
  { id: 'seller', type: 'field', name: '卖方名称', x: 16, y: 50, width: 82, height: 12, binding: 'seller_name', fontSize: 10, fontWeight: '600' },
  { id: 'seller-address', type: 'field', name: '卖方地址', x: 16, y: 63, width: 82, height: 18, binding: 'seller_address', fontSize: 8 },
  { id: 'buyer-label', type: 'text', name: '买方标签', x: 112, y: 42, width: 80, height: 7, text: 'BUYER', fontSize: 9, fontWeight: '700' },
  { id: 'buyer', type: 'field', name: '买方名称', x: 112, y: 50, width: 82, height: 12, binding: 'buyer_name', fontSize: 10, fontWeight: '600' },
  { id: 'buyer-address', type: 'field', name: '买方地址', x: 112, y: 63, width: 82, height: 18, binding: 'buyer_address', fontSize: 8 },
  { id: 'order-no', type: 'field', name: '订单编号', x: 16, y: 92, width: 85, height: 8, binding: 'order_number', fontSize: 9 },
  { id: 'terms', type: 'field', name: '付款条件', x: 112, y: 92, width: 82, height: 8, binding: 'payment_terms', fontSize: 9 },
  { id: 'items', type: 'table', name: '产品明细表', x: 16, y: 112, width: 178, height: 72, fontSize: 8, border: '#a8a8a8' },
  { id: 'total-label', type: 'text', name: '总金额标签', x: 116, y: 198, width: 38, height: 9, text: 'TOTAL', fontSize: 10, fontWeight: '700', align: 'right' },
  { id: 'total', type: 'field', name: '总金额', x: 156, y: 198, width: 38, height: 9, binding: 'totals.grand_total', fontSize: 11, fontWeight: '700', align: 'right' },
  { id: 'footer', type: 'text', name: '页脚文字', x: 16, y: 270, width: 178, height: 8, text: 'AUTHORIZED SIGNATURE', fontSize: 8, color: '#525252', align: 'right' },
];
const readPath = (root: Json, path?: string) => (path || '').split('.').filter(Boolean).reduce<any>((value, key) => value?.[key], root);
const formatValue = (value: any) => value == null || value === '' ? '—' : typeof value === 'object' ? Object.values(value).filter(Boolean).join(', ') : String(value);

export function DocumentStudioPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const [documentType, setDocumentType] = useState<DocType>('quotation');
  const [locale, setLocale] = useState('en');
  const [orderId, setOrderId] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [orders, setOrders] = useState<SourceOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('我的外贸单据模板');
  const [elements, setElements] = useState<StudioElement[]>(() => initialElements('quotation'));
  const [selectedId, setSelectedId] = useState('title');
  const [previewContent, setPreviewContent] = useState<Json>({});
  const [previewTotals, setPreviewTotals] = useState<Json>({});
  const [createdDoc, setCreatedDoc] = useState<CreatedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = elements.find(item => item.id === selectedId) ?? elements[0];
  const selectedType = DOC_TYPES.find(item => item.value === documentType)!;
  const selectedOrder = orders.find(item => item.id === orderId);
  const isShipment = selectedType.source === 'shipment';
  const templateConfig = useMemo(() => ({ layoutEngine: 'free-canvas-v1', pageSize: 'A4', orientation: 'portrait', unit: 'mm', locale, elements }), [elements, locale]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const client = await getSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
    const response = await fetch('/api/v1/trade/' + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(init?.headers ?? {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? '单据服务请求失败。');
    return payload?.data ?? payload?.result ?? payload;
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user.id) throw new Error('登录状态已失效，请重新登录。');
      const [orderResult, templateResult] = await Promise.all([
        client.from('trade_orders').select('id,order_number,title,order_type,status,currency_code,locked_at').eq('owner_id', session.user.id).eq('order_type', 'sales').order('updated_at', { ascending: false }).limit(200),
        request('templates'),
      ]);
      if (orderResult.error) throw orderResult.error;
      setOrders((orderResult.data ?? []) as SourceOrder[]);
      setTemplates(Array.isArray(templateResult) ? templateResult as Template[] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据数据加载失败。'); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => {
    setElements(initialElements(documentType));
    setCreatedDoc(null); setPreviewContent({}); setPreviewTotals({}); setSelectedId('title');
    setTemplateId('');
  }, [documentType]);

  useEffect(() => {
    if (!isShipment || !orderId) { setShipments([]); setShipmentId(''); return; }
    let active = true;
    void (async () => {
      const client = await getSupabaseClient();
      const { data, error: queryError } = await client.from('trade_shipments').select('id,shipment_no,status,planned_ship_date,actual_ship_date').eq('order_id', orderId).order('created_at', { ascending: false });
      if (queryError) throw queryError;
      if (active) setShipments((data ?? []) as Shipment[]);
    })().catch(cause => setError(cause instanceof Error ? cause.message : '发运批次读取失败。'));
    return () => { active = false; };
  }, [isShipment, orderId]);

  useEffect(() => {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;
    const config = template.template_config ?? {};
    if (Array.isArray(config.elements)) setElements(config.elements as StudioElement[]);
  }, [templateId, templates]);

  const updateElement = (id: string, patch: Partial<StudioElement>) => setElements(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  const addElement = (type: ElementKind) => {
    const id = 'el-' + crypto.randomUUID().slice(0, 8);
    const item: StudioElement = { id, type, name: type === 'field' ? '数据字段' : type === 'table' ? '产品明细表' : type === 'image' ? '图片' : type === 'shape' ? '形状' : '文本', x: 32, y: 220, width: type === 'table' ? 170 : 70, height: type === 'table' ? 50 : 12, text: type === 'text' ? '双击属性修改文字' : undefined, binding: type === 'field' ? 'buyer_name' : undefined, fontSize: 9, color: '#161616', background: type === 'shape' ? '#e8f1ff' : 'transparent', align: 'left' };
    setElements(items => [...items, item]); setSelectedId(id);
  };
  const removeSelected = () => { if (!selected || selected.locked) return; setElements(items => items.filter(item => item.id !== selected.id)); setSelectedId(elements.find(item => item.id !== selected.id)?.id ?? ''); };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const scale = canvas.getBoundingClientRect().width / 210;
    const dx = (event.clientX - drag.startX) / scale; const dy = (event.clientY - drag.startY) / scale;
    updateElement(drag.id, { x: Math.max(0, Math.min(210, drag.x + dx)), y: Math.max(0, Math.min(297, drag.y + dy)) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const saveTemplate = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { name: templateName, document_type: documentType, locale, description: 'TradePilot 自由画布模板', is_default: false, is_active: true, template_config: templateConfig };
      if (templateId) await request('templates/' + encodeURIComponent(templateId), { method: 'PATCH', body: JSON.stringify(payload) });
      else {
        const created = await request('templates', { method: 'POST', body: JSON.stringify(payload) });
        setTemplateId(created.id);
        setTemplates(items => [...items, created as Template]);
      }
      setNotice('模板已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '模板保存失败。'); }
    finally { setSaving(false); }
  };

  const loadBusinessData = async () => {
    if (!orderId || (isShipment && !shipmentId)) { setError(isShipment ? '请选择订单和发运批次。' : '请选择销售订单。'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      let savedTemplateId = templateId;
      if (!savedTemplateId) {
        const createdTemplate = await request('templates', { method: 'POST', body: JSON.stringify({ name: templateName, document_type: documentType, locale, description: 'TradePilot 自由画布模板', is_default: false, is_active: true, template_config: templateConfig }) });
        savedTemplateId = createdTemplate.id; setTemplateId(savedTemplateId); setTemplates(items => [...items, createdTemplate as Template]);
      } else await request('templates/' + encodeURIComponent(savedTemplateId), { method: 'PATCH', body: JSON.stringify({ template_config: templateConfig, name: templateName, locale, document_type: documentType }) });
      const doc = await request('documents', { method: 'POST', body: JSON.stringify({ order_id: orderId, shipment_id: isShipment ? shipmentId : undefined, document_type: documentType, title: titleFor(documentType), template_id: savedTemplateId, locale, currency_code: selectedOrder?.currency_code || 'USD', totals: {} }) });
      setCreatedDoc(doc as CreatedDoc); setPreviewContent(doc.content ?? {}); setPreviewTotals(doc.totals ?? {});
      setNotice('业务数据已载入，单据草稿已创建。你现在可以在画布中调整每个元素。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '业务数据载入失败。'); }
    finally { setSaving(false); }
  };

  const saveDocumentLayout = async () => {
    if (!createdDoc) { await saveTemplate(); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      if (templateId) await request('templates/' + encodeURIComponent(templateId), { method: 'PATCH', body: JSON.stringify({ template_config: templateConfig, name: templateName, locale, document_type: documentType }) });
      await request('documents/' + encodeURIComponent(createdDoc.id), { method: 'PATCH', body: JSON.stringify({ content: previewContent, totals: previewTotals, locale, template_config: templateConfig }) });
      setNotice('模板与单据版式已保存，并创建新的单据版本。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据版式保存失败。'); }
    finally { setSaving(false); }
  };

  const addFromBinding = (value: string) => updateElement(selected.id, { binding: value, type: 'field' });
  const displayValue = (item: StudioElement) => item.type === 'text' ? item.text : item.type === 'field' ? formatValue(readPath({ ...previewContent, totals: previewTotals, document: createdDoc ?? {} }, item.binding)) : '';
  const labels: Record<string, string> = Object.fromEntries(FIELD_OPTIONS.map(([key, label]) => [key, label]));

  return <main className="tp-doc-studio">
    <header className="tp-doc-studio__header">
      <div><p className="tp-documents__eyebrow">TRADEPILOT / DOCUMENT STUDIO</p><h1>单据自由制作</h1><p>选择业务数据，自动填充内容，再自由调整模板上的每一个元素。</p></div>
      <div className="tp-documents__actions"><Button kind="tertiary" onClick={() => navigate('/documents')}>返回单据中心</Button><Button kind="secondary" onClick={() => void saveTemplate()} disabled={saving}>保存为模板</Button><Button kind="primary" onClick={() => void loadBusinessData()} disabled={saving || loading}>{saving ? '处理中…' : createdDoc ? '重新载入数据' : '载入业务数据'}</Button></div>
    </header>
    {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {notice && <InlineNotification kind="success" lowContrast title="已完成" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
    <section className="tp-doc-studio__source">
      <div><Select id="studio-type" labelText="制作单据" value={documentType} onChange={event => setDocumentType(event.currentTarget.value as DocType)}>{DOC_TYPES.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}</Select></div>
      <div><Select id="studio-source" labelText="数据来源" value={isShipment ? 'shipment' : 'sales_order'} disabled><SelectItem value="sales_order" text="销售订单" /><SelectItem value="shipment" text="发运批次" /></Select></div>
      <div><Select id="studio-order" labelText="选择销售订单" value={orderId} onChange={event => { setOrderId(event.currentTarget.value); setShipmentId(''); }}><SelectItem value="" text="请选择订单" />{orders.map(order => <SelectItem key={order.id} value={order.id} text={order.order_number + ' · ' + order.title + ' · ' + order.status} />)}</Select></div>
      {isShipment && <div><Select id="studio-shipment" labelText="选择发运批次" value={shipmentId} disabled={!orderId} onChange={event => setShipmentId(event.currentTarget.value)}><SelectItem value="" text="请选择本次实际发运批次" />{shipments.map(shipment => <SelectItem key={shipment.id} value={shipment.id} text={shipment.shipment_no + ' · ' + shipment.status} />)}</Select></div>}
      <div><Select id="studio-locale" labelText="单据语言" value={locale} onChange={event => setLocale(event.currentTarget.value)}>{LOCALES.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}</Select></div>
      <div><Select id="studio-template" labelText="模板" value={templateId} onChange={event => setTemplateId(event.currentTarget.value)}><SelectItem value="" text="新建模板" />{templates.filter(item => item.document_type === documentType && item.locale === locale).map(item => <SelectItem key={item.id} value={item.id} text={item.name + (item.is_default ? ' · 默认' : '')} />)}</Select></div>
      <div className="tp-doc-studio__template-name"><TextInput id="studio-template-name" labelText="模板名称" value={templateName} onChange={event => setTemplateName(event.currentTarget.value)} /></div>
      <div className="tp-doc-studio__source-detail">{selectedType.detail}{selectedOrder && <Tag type={selectedOrder.locked_at ? 'green' : 'blue'}>{selectedOrder.locked_at ? '成交快照已锁定' : '当前订单未锁定成交快照'}</Tag>}</div>
    </section>
    {loading && <InlineLoading description="正在加载订单与模板…" />}
    <section className="tp-doc-studio__workspace">
      <aside className="tp-doc-studio__tools">
        <h2>添加元素</h2>
        {(['text','field','table','image','shape'] as ElementKind[]).map(kind => <Button key={kind} kind="tertiary" size="sm" onClick={() => addElement(kind)}>{({text:'文本',field:'数据字段',table:'明细表',image:'图片',shape:'形状'} as Record<string,string>)[kind]}</Button>)}
        <div className="tp-doc-studio__tool-hint">选择画布元素后，可在右侧编辑属性。拖动元素可调整位置。</div>
      </aside>
      <div className="tp-doc-studio__canvas-area">
        <div className="tp-doc-studio__canvas-toolbar"><strong>A4 · 210 × 297 mm</strong><span>{createdDoc ? createdDoc.document_number : '模板设计预览'}</span><Tag type="blue">自由设计</Tag></div>
        <div className="tp-doc-studio__canvas-scroll">
          <div ref={canvasRef} className="tp-doc-studio__paper" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            {elements.map(item => <div key={item.id} className={'tp-doc-studio__element' + (selectedId === item.id ? ' is-selected' : '') + (item.locked ? ' is-locked' : '')} style={{ left: item.x + 'mm', top: item.y + 'mm', width: item.width + 'mm', minHeight: item.height + 'mm', fontSize: (item.fontSize ?? 9) + 'pt', fontWeight: item.fontWeight ?? '400', fontFamily: item.fontFamily ?? 'Arial', color: item.color ?? '#161616', background: item.background ?? 'transparent', textAlign: (item.align ?? 'left') as any, border: item.type === 'shape' ? '1px solid ' + (item.color ?? '#8d8d8d') : item.type === 'table' ? '1px solid ' + (item.border ?? '#a8a8a8') : undefined }} onPointerDown={event => { event.stopPropagation(); setSelectedId(item.id); if (!item.locked && canvasRef.current) { dragRef.current = { id: item.id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y }; (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId); } }}>
              {item.type === 'table' ? <div className="tp-doc-studio__table"><div>SKU / PRODUCT DESCRIPTION</div><div>QTY</div><div>UNIT PRICE</div><div>AMOUNT</div>{(Array.isArray(previewContent.items) ? previewContent.items : []).slice(0, 3).map((row: Json, index: number) => <React.Fragment key={index}><span>{row.product_name ?? row.name ?? 'Product ' + (index + 1)}</span><span>{row.quantity ?? '—'}</span><span>{row.unit_price ?? '—'}</span><span>{row.amount ?? '—'}</span></React.Fragment>)}{!previewContent.items?.length && <span className="tp-doc-studio__empty-row">载入业务数据后自动显示产品明细</span>}</div> : item.type === 'image' ? <div className="tp-doc-studio__image-placeholder">图片 / Logo</div> : item.type === 'shape' ? <div className="tp-doc-studio__shape" /> : item.type === 'field' ? <span className="tp-doc-studio__field">{displayValue(item)}{!createdDoc && <small>{labels[item.binding ?? ''] ?? item.binding}</small>}</span> : <span>{item.text}</span>}
            </div>)}
          </div>
        </div>
      </div>
      <aside className="tp-doc-studio__properties">
        <h2>元素属性</h2>
        {!selected && <p>选择画布中的元素进行编辑。</p>}
        {selected && <>
          <TextInput id="studio-element-name" labelText="元素名称" value={selected.name} onChange={event => updateElement(selected.id, { name: event.currentTarget.value })} />
          <div className="tp-doc-studio__property-grid">
            <TextInput id="studio-x" labelText="X (mm)" type="number" value={String(selected.x)} onChange={event => updateElement(selected.id, { x: Number(event.currentTarget.value) || 0 })} />
            <TextInput id="studio-y" labelText="Y (mm)" type="number" value={String(selected.y)} onChange={event => updateElement(selected.id, { y: Number(event.currentTarget.value) || 0 })} />
            <TextInput id="studio-width" labelText="宽度 (mm)" type="number" value={String(selected.width)} onChange={event => updateElement(selected.id, { width: Math.max(1, Number(event.currentTarget.value) || 1) })} />
            <TextInput id="studio-height" labelText="高度 (mm)" type="number" value={String(selected.height)} onChange={event => updateElement(selected.id, { height: Math.max(1, Number(event.currentTarget.value) || 1) })} />
          </div>
          {selected.type === 'text' && <TextInput id="studio-text" labelText="文本内容" value={selected.text ?? ''} onChange={event => updateElement(selected.id, { text: event.currentTarget.value })} />}
          {selected.type === 'field' && <Select id="studio-binding" labelText="绑定业务字段" value={selected.binding ?? ''} onChange={event => addFromBinding(event.currentTarget.value)}>{FIELD_OPTIONS.map(([key, label]) => <SelectItem key={key} value={key} text={label + ' · ' + key} />)}</Select>}{selected.type === 'image' && <TextInput id="studio-image-url" labelText="图片地址（企业 Logo / 图片资源）" value={selected.imageUrl ?? ''} onChange={event => updateElement(selected.id, { imageUrl: event.currentTarget.value })} />}
          <div className="tp-doc-studio__property-grid">
            <TextInput id="studio-font-size" labelText="字号 (pt)" type="number" value={String(selected.fontSize ?? 9)} onChange={event => updateElement(selected.id, { fontSize: Math.max(5, Number(event.currentTarget.value) || 9) })} />
            <TextInput id="studio-font-family" labelText="字体" value={selected.fontFamily ?? 'Arial'} onChange={event => updateElement(selected.id, { fontFamily: event.currentTarget.value })} />
            <TextInput id="studio-color" labelText="文字颜色" value={selected.color ?? '#161616'} onChange={event => updateElement(selected.id, { color: event.currentTarget.value })} />
            <TextInput id="studio-background" labelText="背景颜色" value={selected.background ?? 'transparent'} onChange={event => updateElement(selected.id, { background: event.currentTarget.value })} />
            <Select id="studio-align" labelText="对齐方式" value={selected.align ?? 'left'} onChange={event => updateElement(selected.id, { align: event.currentTarget.value })}><SelectItem value="left" text="左对齐" /><SelectItem value="center" text="居中" /><SelectItem value="right" text="右对齐" /></Select>
          </div>
          <Select id="studio-weight" labelText="字体样式" value={selected.fontWeight ?? '400'} onChange={event => updateElement(selected.id, { fontWeight: event.currentTarget.value })}><SelectItem value="400" text="常规" /><SelectItem value="600" text="半粗体" /><SelectItem value="700" text="粗体" /></Select>
          <div className="tp-doc-studio__property-actions"><Button kind="tertiary" size="sm" onClick={() => updateElement(selected.id, { locked: !selected.locked })}>{selected.locked ? '解锁元素' : '锁定元素'}</Button><Button kind="danger--tertiary" size="sm" onClick={removeSelected} disabled={selected.locked}>删除元素</Button></div>
        </>}
        <div className="tp-doc-studio__save"><Button kind="primary" onClick={() => void saveDocumentLayout()} disabled={saving}>{saving ? '保存中…' : createdDoc ? '保存模板与单据版本' : '保存模板设计'}</Button></div>
      </aside>
    </section>
    <footer className="tp-doc-studio__footer"><span>模板元素使用毫米坐标保存；正式 PDF 使用相同模板快照渲染。</span>{createdDoc && <Button kind="secondary" onClick={() => navigate('/documents/' + createdDoc.id)}>打开正式单据预览</Button>}</footer>
  </main>;
}
