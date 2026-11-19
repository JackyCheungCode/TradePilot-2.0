import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link, InlineLoading, InlineNotification, TextInput, Tag, TpDataTable,
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
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState<10|20|50|100>(20);
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
  return <main className="tp-documents">
    <PageHeader className="tp-documents__header">
      <div><p className="tp-documents__eyebrow">TRADE OPERATIONS / DOCUMENTS</p><h1>已生成单据</h1><p>集中查看单据状态、版本和业务来源，打开单据可继续校对或查看历史版本。</p></div>
      <div className="tp-documents__actions"><Link href="/documents">返回单据中心</Link><Link href="/documents">新建单据</Link></div>
    </PageHeader>
    {error && <InlineNotification kind="error" lowContrast title="单据列表读取失败" subtitle={error} />}
    <section className="tp-documents__list">
      <div className="tp-documents__list-head"><div className="tp-documents__list-heading"><h2>单据记录</h2><p>按编号、名称或类型搜索；选择单据可查看内容和版本记录。</p></div><div className="tp-documents__search"><TextInput id="tp-generated-doc-search" labelText="搜索单据" hideLabel placeholder="单据编号、名称或类型" value={search} onChange={event => {setSearch(event.currentTarget.value);setPage(1);}} /></div></div>
      {loading ? <div className="tp-documents__loading"><InlineLoading description="正在加载单据…" /></div> : filtered.length ? <div className="tp-documents__table-wrap"><TpDataTable
        ariaLabel="已生成单据列表"
        columnSettingsKey="trade-generated-documents"
        rowKey="id"
        rows={filtered as (Doc & Record<string, unknown>)[]}
        pagination={{page,pageSize,totalItems:filtered.length,onChange:(nextPage,nextSize)=>{setPage(nextPage);setPageSize(nextSize);}}}
        columns={[
          {key:'document_number',header:'单据编号',primary:true,minWidth:220,render:doc=><div><strong>{doc.document_number}</strong><small className="tp-documents__cell-secondary">{doc.title}</small></div>},
          {key:'document_type',header:'单据类型',minWidth:180,render:doc=>labels[doc.document_type]||doc.document_type},
          {key:'currency_code',header:'币种',minWidth:90,render:doc=>doc.currency_code||'—'},
          {key:'locale',header:'语言',minWidth:90,render:doc=>doc.locale||'—'},
          {key:'current_version',header:'版本',minWidth:80,render:doc=>'v'+(doc.current_version||1)},
          {key:'status',header:'状态',minWidth:110,render:doc=><Tag type={doc.status==='issued'?'green':['void','voided'].includes(doc.status)?'red':'blue'}>{statusLabel(doc.status)}</Tag>},
          {key:'created_at',header:'创建时间',minWidth:130,render:doc=>dateLabel(doc.created_at)},
        ]}
        rowActions={[{key:'view',label:'查看',onClick:doc=>{window.location.assign('/documents/'+doc.id)}}]}
      /></div> : <div className="tp-documents__empty"><p>{docs.length ? '没有符合条件的单据。' : '还没有生成单据。创建单据后，记录会显示在这里。'}</p><Link href="/documents">新建单据</Link></div>}
    </section>
  </main>;
}
