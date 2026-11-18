import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link, InlineLoading, InlineNotification, TextInput, Tag, Table, TableHead, TableRow,
  TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/documents.scss';

type Doc = { id: string; document_number: string; title: string; document_type: string; status: string; locale: string; currency_code: string; created_at: string; current_version?: number };
const labels: Record<string, string> = {
  proforma_invoice: '形式发票（PI）', sales_contract: '销售合同', sales_confirmation: '订单确认书',
  commercial_invoice: '商业发票', packing_list: '装箱单', shipping_instructions: '装运指示',
  purchase_order: '采购订单（PO）', purchase_confirmation: '采购订单确认书', supplier_invoice: '供应商发票',
};
const statusLabel = (status: string) => (({ draft: '草稿', review: '待审核', approved: '已批准', issued: '已签发', sent: '已发送', void: '已作废', voided: '已作废', archived: '已归档' } as Record<string, string>)[status] ?? status);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '—';
const unwrap = (payload: any) => payload?.data ?? payload?.result ?? payload;

export function GeneratedDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/trade/documents', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? '单据列表读取失败。');
      const result = unwrap(payload);
      setDocs(Array.isArray(result) ? result : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '单据列表读取失败。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => docs.filter(doc => [doc.document_number, doc.title, labels[doc.document_type] || doc.document_type].some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase()))), [docs, search]);
  if (loading) return <PageSkeleton className="tp-documents" layout={[
  { type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: 'tp-documents__header', children: [
    { type: 'group', direction: 'column', gap: 'var(--cds-spacing-03)', children: [{ type: 'text', width: '14rem' }, { type: 'text', heading: true, width: '12rem' }, { type: 'text', width: '30rem' }] },
    { type: 'group', direction: 'row', gap: 'var(--cds-spacing-03)', className: 'tp-documents__actions', children: [{ type: 'placeholder', width: '7rem', height: '2.5rem' }, { type: 'placeholder', width: '7rem', height: '2.5rem' }] },
  ] },
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-documents__list', children: [
    { type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: 'tp-documents__list-head', children: [
      { type: 'group', direction: 'column', gap: 'var(--cds-spacing-02)', className: 'tp-documents__list-heading', children: [{ type: 'text', heading: true, width: '10rem' }, { type: 'text', width: '25rem' }] },
      { type: 'placeholder', width: 'min(22rem, 100%)', height: '2.5rem', className: 'tp-documents__search' },
    ] },
    { type: 'table', columns: 8, rows: 8, className: 'tp-documents__table-wrap' },
  ] },
]} />;
  return <main className="tp-documents">
    <header className="tp-documents__header">
      <div><p className="tp-documents__eyebrow">TRADE OPERATIONS / DOCUMENTS</p><h1>已生成单据</h1><p>集中查看单据状态、版本和业务来源，打开单据可继续校对或查看历史版本。</p></div>
      <div className="tp-documents__actions"><Link href="/documents">返回单据中心</Link><Link href="/documents">新建单据</Link></div>
    </header>
    {error && <InlineNotification kind="error" lowContrast title="单据列表读取失败" subtitle={error} />}
    <section className="tp-documents__list">
      <div className="tp-documents__list-head"><div className="tp-documents__list-heading"><h2>单据记录</h2><p>按编号、名称或类型搜索；选择单据可查看内容和版本记录。</p></div><div className="tp-documents__search"><TextInput id="tp-generated-doc-search" labelText="搜索单据" hideLabel placeholder="单据编号、名称或类型" value={search} onChange={event => setSearch(event.currentTarget.value)} /></div></div>
      {loading ? <div className="tp-documents__loading"><InlineLoading description="正在加载单据…" /></div> : filtered.length ? <div className="tp-documents__table-wrap"><Table size="lg"><TableHead><TableRow><TableHeader>单据编号</TableHeader><TableHeader>单据类型</TableHeader><TableHeader>币种</TableHeader><TableHeader>语言</TableHeader><TableHeader>版本</TableHeader><TableHeader>状态</TableHeader><TableHeader>创建时间</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead><TableBody>{filtered.map(doc => <TableRow key={doc.id}><TableCell><strong>{doc.document_number}</strong><small className="tp-documents__cell-secondary">{doc.title}</small></TableCell><TableCell>{labels[doc.document_type] || doc.document_type}</TableCell><TableCell>{doc.currency_code || '—'}</TableCell><TableCell>{doc.locale || '—'}</TableCell><TableCell>v{doc.current_version || 1}</TableCell><TableCell><Tag type={doc.status === 'issued' ? 'green' : ['void','voided'].includes(doc.status) ? 'red' : 'blue'}>{statusLabel(doc.status)}</Tag></TableCell><TableCell>{dateLabel(doc.created_at)}</TableCell><TableCell><Link href={'/documents/' + doc.id}>查看</Link></TableCell></TableRow>)}</TableBody></Table></div> : <div className="tp-documents__empty"><p>{docs.length ? '没有符合条件的单据。' : '还没有生成单据。创建单据后，记录会显示在这里。'}</p><Link href="/documents">新建单据</Link></div>}
    </section>
  </main>;
}
