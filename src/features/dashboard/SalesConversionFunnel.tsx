import { useEffect, useState } from 'react';
import { Link, InlineLoading, InlineNotification, Tile } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Stage = { key: string; label: string; count: number; href: string };
export function SalesConversionFunnel({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true); setError('');
      try {
        const db = await getSupabaseClient();
        const leadsResult = await db.from('leads').select('id').eq('is_formal',true).gte('created_at', startDate).lte('created_at', endDate).limit(10000);
        if (leadsResult.error) throw new Error(leadsResult.error.message);
        const leadIds = (leadsResult.data || []).map((row: {id:string}) => row.id);
        const base: Stage[] = [
          {key:'leads',label:'线索',count:leadIds.length,href:'/leads'},
          {key:'customers',label:'客户',count:0,href:'/accounts'},
          {key:'quotes',label:'报价单',count:0,href:'/quotes'},
          {key:'orders',label:'订单',count:0,href:'/sales-orders'},
          {key:'payments',label:'收款',count:0,href:'/payments'},
          {key:'shipments',label:'发货',count:0,href:'/shipments'},
        ];
        if (!leadIds.length) { if(active)setStages(base); return; }
        const accountsResult = await db.from('crm_accounts').select('id,source_lead_id').in('source_lead_id',leadIds).eq('is_archived',false).limit(10000);
        if (accountsResult.error) throw new Error(accountsResult.error.message);
        const accounts = accountsResult.data || [];
        const accountToLead = new Map<string,string>(accounts.map((row:{id:string;source_lead_id:string})=>[row.id,row.source_lead_id]));
        const customerLeads = new Set<string>(accounts.map((row:{source_lead_id:string})=>row.source_lead_id));
        const accountIds = accounts.map((row:{id:string})=>row.id);
        let orders: Array<{id:string;crm_account_id:string;confirmed_from_document_id:string|null}> = [];
        if (accountIds.length) {
          const orderResult = await db.from('trade_orders').select('id,crm_account_id,confirmed_from_document_id').eq('order_type','sales').in('status',['active','completed']).in('crm_account_id',accountIds).limit(10000);
          if (orderResult.error) throw new Error(orderResult.error.message);
          orders = orderResult.data || [];
        }
        const orderToLead = new Map<string,string>();
        orders.forEach(row=>{const leadId=accountToLead.get(row.crm_account_id);if(leadId)orderToLead.set(row.id,leadId);});
        const orderIds = orders.map(row=>row.id);
        const quoteLeads = new Set<string>(), paidLeads = new Set<string>(), shippedLeads = new Set<string>();
        if (orderIds.length) {
          const quoteDocumentIds = [...new Set(orders.map(row=>row.confirmed_from_document_id).filter((id):id is string=>Boolean(id)))];
          const quoteResult = quoteDocumentIds.length ? await db.from('trade_documents').select('id').eq('document_type','quotation').in('status',['approved','issued']).in('id',quoteDocumentIds).limit(10000) : {data:[],error:null};
          if (quoteResult.error) throw new Error(quoteResult.error.message);
          (quoteResult.data||[]).forEach((row:{id:string})=>{const order=orders.find(item=>item.confirmed_from_document_id===row.id);const id=order?orderToLead.get(order.id):undefined;if(id)quoteLeads.add(id);});
          const allocationResult = await db.from('trade_payment_allocations').select('order_id,payment_id').in('order_id',orderIds).limit(20000);
          if (allocationResult.error) throw new Error(allocationResult.error.message);
          const allocations = allocationResult.data || [];
          const paymentIds = [...new Set(allocations.map((row:{payment_id:string})=>row.payment_id))];
          if (paymentIds.length) {
            const paymentResult = await db.from('trade_payments').select('id').eq('payment_type','receipt').in('status',['confirmed','partially_reconciled','reconciled']).in('id',paymentIds).limit(10000);
            if (paymentResult.error) throw new Error(paymentResult.error.message);
            const confirmed = new Set((paymentResult.data||[]).map((row:{id:string})=>row.id));
            allocations.forEach((row:{order_id:string;payment_id:string})=>{if(confirmed.has(row.payment_id)){const id=orderToLead.get(row.order_id);if(id)paidLeads.add(id);}});
          }
          const shipmentResult = await db.from('trade_shipments').select('order_id').in('status',['loaded','customs_cleared','departed','in_transit','arrived','import_cleared','delivered']).in('order_id',orderIds).limit(10000);
          if (shipmentResult.error) throw new Error(shipmentResult.error.message);
          (shipmentResult.data||[]).forEach((row:{order_id:string})=>{const id=orderToLead.get(row.order_id);if(id)shippedLeads.add(id);});
        }
        const next = [
          base[0], {...base[1],count:customerLeads.size}, {...base[2],count:quoteLeads.size},
          {...base[3],count:new Set(orderToLead.values()).size}, {...base[4],count:paidLeads.size}, {...base[5],count:shippedLeads.size},
        ];
        if(active)setStages(next);
      } catch (cause) { if(active)setError(cause instanceof Error?cause.message:'读取销售转化漏斗失败。'); }
      finally { if(active)setLoading(false); }
    };
    void run();
    return () => { active = false; };
  }, [startDate, endDate]);
  const max = Math.max(1, stages[0]?.count || 0);
  return <Tile className="tp-dashboard__funnel">
    <div className="tp-dashboard__section-heading"><div><h2>销售转化漏斗</h2><p>按所选期间新增线索建立 cohort，追踪这些线索后续达到的业务阶段</p></div></div>
    {error && <InlineNotification kind="warning" title="漏斗数据暂不可用" subtitle={error} lowContrast/>}
    {loading ? <InlineLoading description="正在计算销售转化路径…"/> : <div className="tp-dashboard__funnel-visual" role="group" aria-label="销售转化漏斗各阶段，选择阶段可打开对应业务列表">
      {stages.map((stage,index) => {
        const widthLevel = Math.max(0, Math.min(5, Math.round((stage.count / max) * 5)));
        const conversion = index > 0 && stages[index - 1]?.count
          ? ((stage.count / stages[index - 1].count) * 100).toFixed(1) + '% 转化'
          : index === 0 ? '起始阶段' : '—';
        return <Link
          href={stage.href}
          className={"tp-dashboard__funnel-stage tp-dashboard__funnel-stage--width-" + widthLevel}
          aria-label={stage.label + '，' + stage.count.toLocaleString() + ' 条，' + conversion + '，打开对应列表'}
          title={stage.label + ' · ' + stage.count.toLocaleString()}
        >
          <span className="tp-dashboard__funnel-stage-label">{stage.label}</span>
          <strong>{stage.count.toLocaleString()}</strong>
          <small>{conversion}</small>
        </Link>;
      })}
    </div>}
  </Tile>;
}
