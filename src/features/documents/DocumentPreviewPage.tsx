import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, TextInput, TextArea, Table, TableHead, TableRow,
  TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/document-preview.scss';

type Json = Record<string, any>;
type Version = { id: string; version_number: number; created_at: string; locale: string; template_snapshot?: Json };
type DocumentRecord = {
  id: string; document_number: string; title: string; document_type: string; status: string;
  locale: string; currency_code: string; created_at: string; current_version: number;
  order_id: string; shipment_id?: string | null; content: Json; totals: Json; trade_document_versions?: Version[];
};

const labels: Record<string, string> = {
  proforma_invoice: '形式发票（Proforma Invoice）', sales_contract: '销售合同（Sales Contract）',
  sales_confirmation: '订单确认书（Sales Confirmation）', commercial_invoice: '商业发票（Commercial Invoice）',
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
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftContent, setDraftContent] = useState<Json | null>(null);
  const beginEdit = () => { if (doc?.status === 'draft') { setDraftContent(JSON.parse(JSON.stringify(doc.content || {})) as Json); setEditing(true); } };
  const setDraftField = (key: string, value: string) => setDraftContent(current => current ? { ...current, [key]: value } : current);
  const saveDraft = async () => {
    if (!doc || !draftContent) return;
    if (!String(draftContent.seller_name || '').trim() || !String(draftContent.buyer_name || '').trim()) { setError('卖方名称和买方名称为必填项。'); return; }
    if (address(draftContent.seller_address) === '—' || address(draftContent.buyer_address) === '—') { setError('卖方地址和买方开票地址为必填项。'); return; }
    setSaving(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/trade/documents/' + encodeURIComponent(doc.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ content: draftContent, totals: doc.totals || {}, locale: doc.locale, currency_code: doc.currency_code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || '草稿保存失败。');
      setEditing(false); setDraftContent(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '草稿保存失败。'); }
    finally { setSaving(false); }
  };

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

  const content = doc?.content ?? {};
  const items = useMemo(() => Array.isArray(content.items) ? content.items as Json[] : [], [content.items]);
  const versions = doc?.trade_document_versions ?? [];
  const shipment = content.shipment ?? {};
  const bank = content.default_bank_account ?? {};
  const totals = doc?.totals ?? {};
  const isPackingList = doc?.document_type === 'packing_list';
  const showPricing = ['commercial_invoice', 'proforma_invoice', 'sales_contract', 'sales_confirmation'].includes(doc?.document_type || '');

  if (loading) return <main className="tp-document-preview"><div className="tp-document-preview__loading"><InlineLoading description="正在读取单据与版本快照…" /></div></main>;
  if (!doc) return <main className="tp-document-preview"><InlineNotification kind="error" title="无法打开单据" subtitle={error || '单据不存在。'} /><Button kind="tertiary" onClick={() => navigate('/documents')}>返回单据中心</Button></main>;

  return <main className="tp-document-preview">
    <header className="tp-document-preview__toolbar">
      <div><p className="tp-document-preview__eyebrow">TRADEPILOT / DOCUMENTS / PREVIEW</p><h1>{doc.document_number}</h1><p>{labels[doc.document_type] || doc.document_type} · V{doc.current_version} · {statusLabel(doc.status)}</p></div>
      <div className="tp-document-preview__actions"><Button kind="tertiary" onClick={() => navigate('/documents')}>返回单据中心</Button>{doc.status === 'draft' && !editing && <Button kind="secondary" onClick={beginEdit}>编辑草稿</Button>}<Button kind="secondary" onClick={() => void load()}>刷新</Button><Button kind="primary" onClick={() => window.print()}>打印 / 导出 PDF</Button></div>
    </header>

    {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {editing && draftContent && <section className="tp-document-preview__editor"><div><h2>编辑单据草稿</h2><p>可校对主体名称、地址、联系人和单据备注。产品、数量、单价、付款条件、贸易术语和交付日期仍以已锁定订单成交快照为准。</p></div><div className="tp-document-preview__editor-grid">
      <TextInput id="doc-edit-seller" labelText="卖方名称" value={String(draftContent.seller_name || '')} onChange={e => setDraftField('seller_name', e.currentTarget.value)} />
      <TextInput id="doc-edit-buyer" labelText="买方名称" value={String(draftContent.buyer_name || '')} onChange={e => setDraftField('buyer_name', e.currentTarget.value)} />
      <TextArea id="doc-edit-seller-address" labelText="卖方地址" rows={3} value={typeof draftContent.seller_address === 'string' ? draftContent.seller_address : address(draftContent.seller_address) === '—' ? '' : address(draftContent.seller_address)} onChange={e => setDraftField('seller_address', e.currentTarget.value)} />
      <TextArea id="doc-edit-buyer-address" labelText="买方开票地址" rows={3} value={typeof draftContent.buyer_address === 'string' ? draftContent.buyer_address : address(draftContent.buyer_address) === '—' ? '' : address(draftContent.buyer_address)} onChange={e => setDraftField('buyer_address', e.currentTarget.value)} />
      <TextArea id="doc-edit-shipping-address" labelText="收货地址" rows={3} value={typeof draftContent.buyer_shipping_address === 'string' ? draftContent.buyer_shipping_address : address(draftContent.buyer_shipping_address) === '—' ? '' : address(draftContent.buyer_shipping_address)} onChange={e => setDraftField('buyer_shipping_address', e.currentTarget.value)} />
      <TextInput id="doc-edit-contact" labelText="联系人" value={String(draftContent.contact_name || '')} onChange={e => setDraftField('contact_name', e.currentTarget.value)} />
      <TextInput id="doc-edit-contact-email" labelText="联系人邮箱" value={String(draftContent.contact_email || '')} onChange={e => setDraftField('contact_email', e.currentTarget.value)} />
      <TextInput id="doc-edit-contact-phone" labelText="联系人电话" value={String(draftContent.contact_phone || '')} onChange={e => setDraftField('contact_phone', e.currentTarget.value)} />
      <TextArea id="doc-edit-notes" labelText="单据备注" rows={3} value={String(draftContent.notes || '')} onChange={e => setDraftField('notes', e.currentTarget.value)} />
    </div><div className="tp-document-preview__editor-actions"><Button kind="tertiary" disabled={saving} onClick={() => { setEditing(false); setDraftContent(null); }}>取消</Button><Button kind="primary" disabled={saving} onClick={() => void saveDraft()}>{saving ? '保存中…' : '保存并创建新版本'}</Button></div></section>}
    <article className="tp-document-preview__sheet">
      <header className="tp-document-preview__paper-header">
        <div className="tp-document-preview__brand">
          {(content.seller_logo_url || content.company_logo_url) && <img src={content.seller_logo_url || content.company_logo_url} alt="Seller logo" />}
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
        <Table size="sm"><TableHead><TableRow><TableHeader>序号</TableHeader><TableHeader>SKU / 产品名称</TableHeader><TableHeader>HS Code</TableHeader><TableHeader>数量</TableHeader><TableHeader>单位</TableHeader>{showPricing && <><TableHeader>单价</TableHeader><TableHeader>折扣</TableHeader><TableHeader>税率</TableHeader><TableHeader>金额</TableHeader></>}</TableRow></TableHead><TableBody>
          {items.map((item, index) => {
            const amount = item.amount ?? Math.max(0, Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_amount || 0));
            return <TableRow key={String(item.order_line_id || item.id || index)}><TableCell>{index + 1}</TableCell><TableCell>{text(item.product_name || item.name)}<small>{text(item.sku)}</small></TableCell><TableCell>{text(item.hs_code)}</TableCell><TableCell>{text(item.quantity)}</TableCell><TableCell>{text(item.unit)}</TableCell>{showPricing && <><TableCell>{money(item.unit_price, doc.currency_code)}</TableCell><TableCell>{money(item.discount_amount, doc.currency_code)}</TableCell><TableCell>{text(item.tax_rate)}%</TableCell><TableCell>{money(amount, doc.currency_code)}</TableCell></>}</TableRow>;
          })}
        </TableBody></Table>
      </section>

      {showPricing && Array.isArray(content.charges) && content.charges.length > 0 && <section className="tp-document-preview__extra"><h3>费用明细 / Charges</h3><Table size="sm"><TableHead><TableRow><TableHeader>费用项目</TableHeader><TableHeader>金额</TableHeader><TableHeader>计税</TableHeader><TableHeader>税率</TableHeader></TableRow></TableHead><TableBody>{content.charges.map((charge: Json, index: number) => <TableRow key={index}><TableCell>{text(charge.name)}</TableCell><TableCell>{money(charge.amount, doc.currency_code)}</TableCell><TableCell>{charge.taxable ? '是' : '否'}</TableCell><TableCell>{text(charge.taxRate)}%</TableCell></TableRow>)}</TableBody></Table></section>}
      {showPricing && <section className="tp-document-preview__totals"><h3>金额汇总 / Totals</h3><div><span>产品小计</span><strong>{money(totals.product_subtotal, doc.currency_code)}</strong></div><div><span>产品折扣</span><strong>{money(totals.line_discount_total, doc.currency_code)}</strong></div><div><span>整单折扣</span><strong>{money(totals.order_discount, doc.currency_code)}</strong></div><div><span>费用</span><strong>{money(totals.charge_subtotal, doc.currency_code)}</strong></div><div><span>税额</span><strong>{money(totals.tax_total, doc.currency_code)}</strong></div><div className="is-grand"><span>总计</span><strong>{money(totals.grand_total, doc.currency_code)}</strong></div></section>}
      {isPackingList && <section className="tp-document-preview__totals"><h3>包装汇总 / Package Summary</h3><div><span>包装件数</span><strong>{text(totals.total_packages)}</strong></div><div><span>净重</span><strong>{text(totals.total_net_weight)} kg</strong></div><div><span>毛重</span><strong>{text(totals.total_gross_weight)} kg</strong></div><div><span>总体积</span><strong>{text(totals.total_volume)} CBM</strong></div><div><span>柜数</span><strong>{text(totals.container_qty)}</strong></div></section>}

      {!doc.shipment_id && Array.isArray(content.payment_schedule) && content.payment_schedule.length > 0 && <section className="tp-document-preview__extra"><h3>付款计划 / Payment Schedule</h3><Table size="sm"><TableHead><TableRow><TableHeader>付款节点</TableHeader><TableHeader>比例</TableHeader><TableHeader>金额</TableHeader><TableHeader>到期条件</TableHeader></TableRow></TableHead><TableBody>{content.payment_schedule.map((item: Json, index: number) => <TableRow key={index}><TableCell>{text(item.milestone)}</TableCell><TableCell>{text(item.ratio)}%</TableCell><TableCell>{money(item.amount, doc.currency_code)}</TableCell><TableCell>{text(item.trigger || item.due_date)}</TableCell></TableRow>)}</TableBody></Table></section>}

      {!doc.shipment_id && Object.keys(bank).length > 0 && <section className="tp-document-preview__extra"><h3>收款账户 / Beneficiary Bank</h3><div className="tp-document-preview__bank-grid">{[['银行名称',bank.bank_name],['分行',bank.bank_branch],['账户名称',bank.account_name],['账号',bank.account_number],['IBAN',bank.iban],['SWIFT / BIC',bank.swift_bic],['银行地址',address(bank.bank_address)]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{text(value)}</strong></div>)}</div></section>}

      <footer className="tp-document-preview__footer"><p>{text(content.footer_text || 'Thank you for your business.')}</p><span>{text(content.seller_name)} · {doc.document_number}</span></footer>
    </article>

    <section className="tp-document-preview__history"><h2>版本记录</h2>{versions.length ? <Table size="sm"><TableHead><TableRow><TableHeader>版本</TableHeader><TableHeader>语言</TableHeader><TableHeader>生成时间</TableHeader><TableHeader>模板</TableHeader></TableRow></TableHead><TableBody>{versions.slice().sort((a,b)=>b.version_number-a.version_number).map(version => <TableRow key={version.id}><TableCell>V{version.version_number}</TableCell><TableCell>{version.locale}</TableCell><TableCell>{new Date(version.created_at).toLocaleString()}</TableCell><TableCell>{text(version.template_snapshot?.name)}</TableCell></TableRow>)}</TableBody></Table> : <p>暂无版本记录。</p>}</section>
  </main>;
}

function dateOnly(value: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : '—';
}
