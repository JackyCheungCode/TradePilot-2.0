import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button, Link, InlineLoading, InlineNotification, TextInput, TextArea, Table, TableHead, TableRow,
  TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/document-preview.scss';

type Json = Record<string, any>;
type Version = { id: string; version_number: number; created_at: string; locale: string; template_snapshot?: Json; pdf_storage_path?: string | null; pdf_file_name?: string | null; pdf_generated_at?: string | null; pdf_file_size?: number | null };
type DocumentRecord = {
  id: string; document_number: string; title: string; document_type: string; status: string;
  locale: string; currency_code: string; created_at: string; current_version: number;
  order_id?: string | null; shipment_id?: string | null; content: Json; totals: Json; trade_document_versions?: Version[];
};

const labels: Record<string, string> = {
  proforma_invoice: '形式发票（Proforma Invoice）', sales_contract: '销售合同（Sales Contract）',
  sales_confirmation: '订单确认书（Sales Confirmation）', purchase_order: '采购订单（Purchase Order）',
  purchase_confirmation: '采购订单确认书', supplier_invoice: '供应商发票', commercial_invoice: '商业发票（Commercial Invoice）',
  packing_list: '装箱单（Packing List）', shipping_instructions: '装运指示（Shipping Instructions）',
};
const statusLabel = (value: string) => ({ draft: '草稿', review: '待审核', approved: '已批准', issued: '已签发', void: '已作废', archived: '已归档' } as Record<string, string>)[value] ?? value;
const money = (value: unknown, currency: string) => currency + ' ' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const text = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
const address = (value: unknown) => {
  if (typeof value === 'string') return value || '—';
  if (!value || typeof value !== 'object') return '—';
  const item = value as Json;
  if (typeof item.text === 'string' && item.text.trim()) return item.text;
  return [item.name, item.street, item.street2, item.city, item.state, item.postal_code, item.country_code, item.country]
    .filter(Boolean).join(', ') || '—';
};
const unwrap = (payload: any) => payload?.data ?? payload?.result ?? payload;

export function DocumentPreviewPage() {
  const { id = '' } = useParams();
  
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [draftContent, setDraftContent] = useState<Json | null>(null);
  const [draftItemsText, setDraftItemsText] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/trade/documents/' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || '单据读取失败。');
      setDoc(unwrap(payload) as DocumentRecord);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据读取失败。'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const beginEdit = () => { if (doc?.status === 'draft') { const next = JSON.parse(JSON.stringify(doc.content || {})) as Json; setDraftContent(next); setDraftItemsText((Array.isArray(next.items) ? next.items : []).map((item: Json) => [item.product_name || item.name || '', item.sku || '', item.quantity ?? '', item.unit || '', item.unit_price ?? '', item.hs_code || ''].join(' | ')).join('\n')); setEditing(true); } };
  const setDraftField = (key: string, value: string) => setDraftContent(current => current ? { ...current, [key]: value } : current);
  const saveDraft = async () => {
    if (!doc || !draftContent) return;
    const manualItems = draftItemsText.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [product_name, sku, quantity, unit, unit_price, hs_code] = line.split('|').map(part => part.trim()); return { product_name, sku, quantity: Number(quantity || 0), unit, unit_price: Number(unit_price || 0), hs_code, amount: Number(quantity || 0) * Number(unit_price || 0) }; });
    if (!doc.order_id && manualItems.some(item => !item.product_name || item.quantity <= 0 || item.unit_price < 0)) { setError('货物明细格式有误：每行按“品名 | SKU | 数量 | 单位 | 单价 | HS Code”填写，数量必须大于 0。'); return; }
    const nextContent = doc.order_id ? draftContent : { ...draftContent, items: manualItems };
    const subtotal = manualItems.reduce((sum, item) => sum + item.amount, 0);
    const nextTotals = doc.order_id ? (doc.totals || {}) : { product_subtotal: subtotal, line_discount_total: 0, order_discount: 0, charge_subtotal: 0, tax_total: 0, grand_total: subtotal };
    setSaving(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/trade/documents/' + encodeURIComponent(doc.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ content: nextContent, totals: nextTotals, locale: doc.locale, currency_code: doc.currency_code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || '草稿保存失败。');
      setEditing(false); setDraftContent(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '草稿保存失败。'); }
    finally { setSaving(false); }
  };

  const generateAndDownloadPdf = async (force = false) => {
    if (!doc) return;
    setPdfBusy(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const headers = { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' };
      const generated = await fetch('/api/v1/trade/documents/' + encodeURIComponent(doc.id) + '/pdf', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      const generatedPayload = await generated.json().catch(() => ({}));
      if (!generated.ok) throw new Error(generatedPayload?.error?.message || 'PDF 生成失败。');
      const file = await fetch('/api/v1/trade/documents/' + encodeURIComponent(doc.id) + '/pdf', { headers: { Authorization: headers.Authorization } });
      if (!file.ok) {
        const payload = await file.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'PDF 下载失败。');
      }
      const blob = await file.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const downloadLink = window.document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = String(generatedPayload?.data?.file_name || generatedPayload?.result?.file_name || doc.document_number + '-v' + doc.current_version + '.pdf');
      window.document.body.appendChild(downloadLink); downloadLink.click(); downloadLink.remove();
      window.URL.revokeObjectURL(objectUrl);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PDF 生成或下载失败。'); }
    finally { setPdfBusy(false); }
  };

  const runDocumentAction = async (action: 'confirm' | 'approve') => {
    if (!doc) return;
    setSaving(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/trade/documents/' + encodeURIComponent(doc.id) + '/' + action, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || (action === 'approve' ? '审核操作失败。' : '正式确认失败。'));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据状态更新失败。'); }
    finally { setSaving(false); }
  };

  const content = doc?.content ?? {};
  const items = useMemo(() => Array.isArray(content.items) ? content.items as Json[] : [], [content.items]);
  const versions = doc?.trade_document_versions ?? [];
  const currentPdfVersion = versions.find(version => version.version_number === doc?.current_version);
  const hasArchivedPdf = Boolean(currentPdfVersion?.pdf_storage_path);
  const shipment = content.shipment ?? {};
  const systemSnapshot = (content._system ?? {}) as Json;
  const sourceSnapshot = (systemSnapshot.source_snapshot ?? {}) as Json;
  const policySnapshot = (systemSnapshot.document_policy_snapshot ?? {}) as Json;
  const sourceLabels: Record<string, string> = { blank: '空白创建', sales_order: '销售订单', purchase_order: '采购订单', shipment: '发运记录' };
  const sourceSummary = sourceLabels[String(sourceSnapshot.source ?? '')] ?? '历史来源';
  const policySummary = [
    '允许来源：' + (Array.isArray(policySnapshot.allowedSources) ? policySnapshot.allowedSources.map(value => sourceLabels[String(value)] ?? String(value)).join('、') : '未记录'),
    '空白草稿：' + (policySnapshot.allowBlankCreation === true ? '允许' : '不允许'),
    '独立正式确认：' + (policySnapshot.allowStandaloneConfirmation === true ? '允许' : '不允许'),
    '订单锁定：' + (policySnapshot.requireLockedOrderWhenOrderLinked === true ? '要求' : '不要求'),
    '发运批次：' + (policySnapshot.requireShipmentWhenOrderLinked === true ? '要求' : '不要求'),
    '审核：' + (policySnapshot.requireReview === true ? '需要' : '不需要'),
  ].join(' · ');
  const bank = content.default_bank_account ?? {};
  const currentTemplateSnapshot = versions.find(version => version.version_number === doc?.current_version)?.template_snapshot ?? {};
  const templateConfig = (currentTemplateSnapshot.template_config ?? {}) as Json;
  const showLogo = templateConfig.showLogo !== false;
  const showBankDetails = templateConfig.showBankDetails !== false;
  const showHsCode = templateConfig.showHsCode !== false;
  const showOrigin = templateConfig.showOrigin !== false;
  const showNotes = templateConfig.showNotes !== false;
  const pageOrientation = String(templateConfig.orientation ?? 'portrait');
  const pageSize = String(templateConfig.pageSize ?? 'A4').toLowerCase();
  const configuredEditableFields = Array.isArray(policySnapshot.editableFields) ? policySnapshot.editableFields.map(String) : ['seller_name','seller_address','buyer_name','buyer_address','buyer_shipping_address','contact_name','contact_email','contact_phone','notes','customer_reference','items'];
  const canEditField = (key: string) => configuredEditableFields.includes(key) && (key !== 'items' || !doc?.order_id);
  const totals = doc?.totals ?? {};
  const isPackingList = doc?.document_type === 'packing_list';
  const showPricing = templateConfig.showPrices !== false && ['quotation','request_for_quotation','commercial_invoice','proforma_invoice','sales_contract','sales_confirmation','purchase_order','purchase_confirmation','tax_invoice','credit_note','debit_note','bill_of_exchange'].includes(doc?.document_type || '');

  if (loading) return <main className="tp-document-preview"><div className="tp-document-preview__loading"><InlineLoading description="正在读取单据与版本快照…" /></div></main>;
  if (!doc) return <main className="tp-document-preview"><InlineNotification kind="error" title="无法打开单据" subtitle={error || '单据不存在。'} /><Link href="/documents">返回单据中心</Link></main>;

  return <main className="tp-document-preview">
    <PageHeader className="tp-document-preview__toolbar">
      <div><p className="tp-document-preview__eyebrow">TRADEPILOT / DOCUMENTS / PREVIEW</p><h1>{doc.document_number}</h1><p>{labels[doc.document_type] || doc.document_type} · V{doc.current_version} · {statusLabel(doc.status)}</p></div>
      <div className="tp-document-preview__actions"><Link href="/documents">返回单据中心</Link>{doc.status === 'draft' && !editing && <><Button kind="tertiary" onClick={beginEdit}>编辑草稿</Button><Button kind="primary" disabled={saving} onClick={() => void runDocumentAction('confirm')}>提交审核 / 正式确认</Button></>}{doc.status === 'review' && <Button kind="primary" disabled={saving} onClick={() => void runDocumentAction('approve')}>审核通过</Button>}{doc.status === 'approved' && <Button kind="primary" disabled={saving} onClick={() => void runDocumentAction('confirm')}>正式确认</Button>}<Button kind="ghost" onClick={() => void load()}>刷新</Button><Button kind="tertiary" disabled={pdfBusy} onClick={() => void generateAndDownloadPdf()}>{pdfBusy ? 'PDF 处理中…' : hasArchivedPdf ? '下载归档 PDF' : '生成并下载 PDF'}</Button>{hasArchivedPdf && <Button kind="tertiary" disabled={pdfBusy} onClick={() => void generateAndDownloadPdf(true)}>重新生成 PDF</Button>}<Button kind="tertiary" onClick={() => window.print()}>打印预览</Button></div>
    </PageHeader>

    {Object.keys(sourceSnapshot).length > 0 && <section className="tp-document-preview__policy-snapshot"><div><h2>来源与规则快照</h2><p>本单据创建时保存的配置，不会随设置中心后续修改而变化。</p></div><dl><div><dt>数据来源</dt><dd>{sourceSummary}</dd></div><div><dt>关联订单</dt><dd>{sourceSnapshot.order_id ? '已关联' : '未关联'}</dd></div><div><dt>发运批次</dt><dd>{sourceSnapshot.shipment_id ? '已关联' : '未关联'}</dd></div><div><dt>设置更新时间</dt><dd>{systemSnapshot.document_settings_updated_at ? new Date(String(systemSnapshot.document_settings_updated_at)).toLocaleString() : '系统默认规则'}</dd></div></dl><p>{policySummary}</p></section>}
    {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {editing && draftContent && <section className="tp-document-preview__editor"><div><h2>编辑单据草稿</h2><p>{doc.order_id ? '可校对主体名称、地址、联系人和单据备注；订单商品与成交条款仍以订单数据为准。' : '这是独立空白单据，可填写主体资料、条款和货物明细。草稿允许不完整，后续可继续补充。'}</p></div><div className="tp-document-preview__editor-grid">
      {canEditField('seller_name') && (<TextInput id="doc-edit-seller" labelText="卖方名称" value={String(draftContent.seller_name || '')} onChange={e => setDraftField('seller_name', e.currentTarget.value)} />)}
      {canEditField('buyer_name') && (<TextInput id="doc-edit-buyer" labelText="买方名称" value={String(draftContent.buyer_name || '')} onChange={e => setDraftField('buyer_name', e.currentTarget.value)} />)}
      {canEditField('seller_address') && (<TextArea id="doc-edit-seller-address" labelText="卖方地址" rows={3} value={typeof draftContent.seller_address === 'string' ? draftContent.seller_address : address(draftContent.seller_address) === '—' ? '' : address(draftContent.seller_address)} onChange={e => setDraftField('seller_address', e.currentTarget.value)} />)}
      {canEditField('buyer_address') && (<TextArea id="doc-edit-buyer-address" labelText="买方开票地址" rows={3} value={typeof draftContent.buyer_address === 'string' ? draftContent.buyer_address : address(draftContent.buyer_address) === '—' ? '' : address(draftContent.buyer_address)} onChange={e => setDraftField('buyer_address', e.currentTarget.value)} />)}
      {canEditField('buyer_shipping_address') && (<TextArea id="doc-edit-shipping-address" labelText="收货地址" rows={3} value={typeof draftContent.buyer_shipping_address === 'string' ? draftContent.buyer_shipping_address : address(draftContent.buyer_shipping_address) === '—' ? '' : address(draftContent.buyer_shipping_address)} onChange={e => setDraftField('buyer_shipping_address', e.currentTarget.value)} />)}
      {canEditField('contact_name') && (<TextInput id="doc-edit-contact" labelText="联系人" value={String(draftContent.contact_name || '')} onChange={e => setDraftField('contact_name', e.currentTarget.value)} />)}
      {canEditField('contact_email') && (<TextInput id="doc-edit-contact-email" labelText="联系人邮箱" value={String(draftContent.contact_email || '')} onChange={e => setDraftField('contact_email', e.currentTarget.value)} />)}
      {canEditField('customer_reference') && <TextInput id="doc-edit-customer-reference" labelText="客户参考号" value={String(draftContent.customer_reference || '')} onChange={e => setDraftField('customer_reference', e.currentTarget.value)} />}
      {canEditField('payment_terms') && <TextInput id="doc-edit-payment-terms" labelText="付款条件" value={String(draftContent.payment_terms || '')} onChange={e => setDraftField('payment_terms', e.currentTarget.value)} />}
      {canEditField('incoterms_code') && <TextInput id="doc-edit-incoterms" labelText="贸易术语" value={String(draftContent.incoterms_code || '')} onChange={e => setDraftField('incoterms_code', e.currentTarget.value)} />}
      {canEditField('named_place') && <TextInput id="doc-edit-named-place" labelText="指定地点" value={String(draftContent.named_place || '')} onChange={e => setDraftField('named_place', e.currentTarget.value)} />}
      {canEditField('delivery_date') && <TextInput id="doc-edit-delivery-date" labelText="交付日期" value={String(draftContent.delivery_date || '')} onChange={e => setDraftField('delivery_date', e.currentTarget.value)} />}
      {canEditField('contact_phone') && (<TextInput id="doc-edit-contact-phone" labelText="联系人电话" value={String(draftContent.contact_phone || '')} onChange={e => setDraftField('contact_phone', e.currentTarget.value)} />)}
      {canEditField('notes') && (<TextArea id="doc-edit-notes" labelText="单据备注" rows={3} value={String(draftContent.notes || '')} onChange={e => setDraftField('notes', e.currentTarget.value)} />)}\n      {canEditField('items') && !doc.order_id && <TextArea id="doc-edit-items" labelText="货物明细（每行：品名 | SKU | 数量 | 单位 | 单价 | HS Code）" helperText="例如：Wireless Mouse | WM-01 | 100 | pcs | 8.5 | 847160" rows={6} value={draftItemsText} onChange={e => setDraftItemsText(e.currentTarget.value)} />}
    </div><div className="tp-document-preview__editor-actions"><Button kind="tertiary" disabled={saving} onClick={() => { setEditing(false); setDraftContent(null); }}>取消</Button><Button kind="primary" disabled={saving} onClick={() => void saveDraft()}>{saving ? '保存中…' : '保存并创建新版本'}</Button></div></section>}
    <article className={"tp-document-preview__sheet tp-document-preview__sheet--" + pageOrientation + " tp-document-preview__sheet--" + pageSize}>
      <header className="tp-document-preview__paper-header">
        <div className="tp-document-preview__brand">{templateConfig.headerText && <small>{text(templateConfig.headerText)}</small>}
          {showLogo && (content.seller_logo_url || content.company_logo_url) && <img src={content.seller_logo_url || content.company_logo_url} alt="Seller logo" />}
          <div><strong>{text(content.seller_name)}</strong><span>{text(content.seller_website)}</span></div>
        </div>
        <div className="tp-document-preview__paper-title"><h2>{labels[doc.document_type] || doc.title}</h2><strong>{doc.document_number}</strong><span>{text(content.order_date || dateOnly(doc.created_at))}</span></div>
      </header>

      <section className="tp-document-preview__parties">
        <div><h3>卖方 / Seller</h3><strong>{text(content.seller_name)}</strong><p>{address(content.seller_address)}</p><p>{[content.seller_email || content.company_email, content.seller_phone || content.company_phone].filter(Boolean).join(' · ') || '—'}</p><p>Registration: {text(content.seller_registration_number)} · Tax: {text(content.seller_tax_number || content.seller_vat_number)}</p></div>
        <div><h3>买方 / Buyer</h3><strong>{text(content.buyer_name)}</strong><p>{address(content.buyer_address)}</p><p>{[content.buyer_email, content.buyer_phone].filter(Boolean).join(' · ') || '—'}</p><p>Registration: {text(content.buyer_registration_number)} · Tax: {text(content.buyer_tax_number)}</p></div>
      </section>

      <section className="tp-document-preview__metadata">
        <div><span>订单编号</span><strong>{text(content.order_number)}</strong></div>
        <div><span>客户参考号</span><strong>{text(content.customer_reference)}</strong></div>
        <div><span>币种</span><strong>{doc.currency_code}</strong></div>
        <div><span>付款条件</span><strong>{text(content.payment_terms)}</strong></div>
        <div><span>贸易术语</span><strong>{[content.incoterms_code, content.incoterms_version, content.named_place].filter(Boolean).join(' · ') || '—'}</strong></div>
        <div><span>交付日期</span><strong>{text(content.delivery_date)}</strong></div>
        {doc.shipment_id && <div><span>发运批次</span><strong>{text(shipment.shipment_no)}</strong></div>}
        {doc.shipment_id && <div><span>实际发运日期</span><strong>{text(shipment.actual_ship_date || shipment.planned_ship_date)}</strong></div>}
      </section>

      {doc.shipment_id && <section className="tp-document-preview__shipment"><h3>本次发运 / Shipment</h3><div><span>包装件数</span><strong>{text(shipment.total_packages)}</strong><span>净重</span><strong>{text(shipment.total_net_weight)} kg</strong><span>毛重</span><strong>{text(shipment.total_gross_weight)} kg</strong><span>体积</span><strong>{text(shipment.total_volume)} CBM</strong></div><p>收货地址：{address(shipment.ship_to_address || content.buyer_shipping_address)}</p></section>}

      <section className="tp-document-preview__items"><h3>货物明细 / Goods Description</h3>
        <Table size="sm"><TableHead><TableRow><TableHeader>序号</TableHeader><TableHeader>SKU / 产品名称</TableHeader>{showHsCode && <TableHeader>HS Code</TableHeader>}{showOrigin && <TableHeader>原产国</TableHeader>}<TableHeader>数量</TableHeader><TableHeader>单位</TableHeader>{showPricing && <><TableHeader>单价</TableHeader><TableHeader>折扣</TableHeader><TableHeader>税率</TableHeader><TableHeader>金额</TableHeader></>}</TableRow></TableHead><TableBody>
          {items.map((item, index) => {
            const amount = item.amount ?? Math.max(0, Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_amount || 0));
            return <TableRow key={String(item.order_line_id || item.id || index)}><TableCell>{index + 1}</TableCell><TableCell>{text(item.product_name || item.name)}<small>{text(item.sku)}</small></TableCell>{showHsCode && <TableCell>{text(item.hs_code)}</TableCell>}{showOrigin && <TableCell>{text(item.origin_country_code || item.origin_country)}</TableCell>}<TableCell>{text(item.quantity)}</TableCell><TableCell>{text(item.unit)}</TableCell>{showPricing && <><TableCell>{money(item.unit_price, doc.currency_code)}</TableCell><TableCell>{money(item.discount_amount, doc.currency_code)}</TableCell><TableCell>{text(item.tax_rate)}%</TableCell><TableCell>{money(amount, doc.currency_code)}</TableCell></>}</TableRow>;
          })}
        </TableBody></Table>
      </section>

      {showPricing && Array.isArray(content.charges) && content.charges.length > 0 && <section className="tp-document-preview__extra"><h3>费用明细 / Charges</h3><Table size="sm"><TableHead><TableRow><TableHeader>费用项目</TableHeader><TableHeader>金额</TableHeader><TableHeader>计税</TableHeader><TableHeader>税率</TableHeader></TableRow></TableHead><TableBody>{content.charges.map((charge: Json, index: number) => <TableRow key={index}><TableCell>{text(charge.name)}</TableCell><TableCell>{money(charge.amount, doc.currency_code)}</TableCell><TableCell>{charge.taxable ? '是' : '否'}</TableCell><TableCell>{text(charge.taxRate)}%</TableCell></TableRow>)}</TableBody></Table></section>}
      {showPricing && <section className="tp-document-preview__totals"><h3>金额汇总 / Totals</h3><div><span>产品小计</span><strong>{money(totals.product_subtotal, doc.currency_code)}</strong></div><div><span>产品折扣</span><strong>{money(totals.line_discount_total, doc.currency_code)}</strong></div><div><span>整单折扣</span><strong>{money(totals.order_discount, doc.currency_code)}</strong></div><div><span>费用</span><strong>{money(totals.charge_subtotal, doc.currency_code)}</strong></div><div><span>税额</span><strong>{money(totals.tax_total, doc.currency_code)}</strong></div><div className="is-grand"><span>总计</span><strong>{money(totals.grand_total, doc.currency_code)}</strong></div></section>}
      {isPackingList && <section className="tp-document-preview__totals"><h3>包装汇总 / Package Summary</h3><div><span>包装件数</span><strong>{text(totals.total_packages)}</strong></div><div><span>净重</span><strong>{text(totals.total_net_weight)} kg</strong></div><div><span>毛重</span><strong>{text(totals.total_gross_weight)} kg</strong></div><div><span>总体积</span><strong>{text(totals.total_volume)} CBM</strong></div><div><span>柜数</span><strong>{text(totals.container_qty)}</strong></div></section>}

      {!doc.shipment_id && Array.isArray(content.payment_schedule) && content.payment_schedule.length > 0 && <section className="tp-document-preview__extra"><h3>付款计划 / Payment Schedule</h3><Table size="sm"><TableHead><TableRow><TableHeader>付款节点</TableHeader><TableHeader>比例</TableHeader><TableHeader>金额</TableHeader><TableHeader>到期条件</TableHeader></TableRow></TableHead><TableBody>{content.payment_schedule.map((item: Json, index: number) => <TableRow key={index}><TableCell>{text(item.milestone)}</TableCell><TableCell>{text(item.ratio)}%</TableCell><TableCell>{money(item.amount, doc.currency_code)}</TableCell><TableCell>{text(item.trigger || item.due_date)}</TableCell></TableRow>)}</TableBody></Table></section>}

      {showBankDetails && !doc.shipment_id && Object.keys(bank).length > 0 && <section className="tp-document-preview__extra"><h3>收款账户 / Beneficiary Bank</h3><div className="tp-document-preview__bank-grid">{[['银行名称',bank.bank_name],['分行',bank.bank_branch],['账户名称',bank.account_name],['账号',bank.account_number],['IBAN',bank.iban],['SWIFT / BIC',bank.swift_bic],['银行地址',address(bank.bank_address)]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{text(value)}</strong></div>)}</div></section>}

      {showNotes && content.notes && <section className="tp-document-preview__extra"><h3>单据备注 / Notes</h3><p>{text(content.notes)}</p></section>}
      <footer className="tp-document-preview__footer"><p>{text(templateConfig.footerText || content.footer_text || 'Thank you for your business.')}</p><span>{text(content.seller_name)} · {doc.document_number}</span></footer>
    </article>

    <section className="tp-document-preview__history"><h2>版本记录</h2>{versions.length ? <Table size="sm"><TableHead><TableRow><TableHeader>版本</TableHeader><TableHeader>语言</TableHeader><TableHeader>生成时间</TableHeader><TableHeader>模板</TableHeader><TableHeader>PDF 归档</TableHeader></TableRow></TableHead><TableBody>{versions.slice().sort((a,b)=>b.version_number-a.version_number).map(version => <TableRow key={version.id}><TableCell>V{version.version_number}</TableCell><TableCell>{version.locale}</TableCell><TableCell>{new Date(version.created_at).toLocaleString()}</TableCell><TableCell>{text(version.template_snapshot?.name)}</TableCell><TableCell>{version.pdf_storage_path ? '已归档 · ' + new Date(version.pdf_generated_at || version.created_at).toLocaleString() : '未生成'}</TableCell></TableRow>)}</TableBody></Table> : <p>暂无版本记录。</p>}</section>
  </main>;
}

function dateOnly(value: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : '—';
}
