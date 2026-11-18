import { PageSkeleton, pageSkeletonHeader, pageSkeletonPanel } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Link, ContentSwitcher, Switch, FileUploaderButton, InlineLoading, InlineNotification, MultiSelect, Select, SelectItem, Tag, TextInput, TextArea, DateField,
  Tabs, TabList, Tab, TabPanels, TabPanel, Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
  Tile, LineChart, SimpleBarChart, ScaleTypes, CarbonIcons, BusinessLifecycle, WorldMapChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/payments.scss';
import { useBusinessTransitionEvents } from '@/lib/useBusinessTransitionEvents';
import '@/design-system/patterns/responsive-actions.scss';

type AnyRow = Record<string, any>;
const CURRENCIES = ['USD','EUR','GBP','CNY','TWD','JPY','HKD','AUD','CAD'];
const METHODS = ['T/T','L/C','D/P','D/A','PayPal','Western Union','现金','支票','其他'];
const PAYMENT_STATES = [['draft','草稿'],['pending_confirmation','待确认'],['confirmed','已确认'],['partially_reconciled','部分核销'],['reconciled','已核销'],['returned','已退回'],['voided','已作废']];
const ALLOCATION_TYPES = ['定金','尾款','全款','预收','其他'];
const PAYMENT_TAGS = ['定金','尾款','预收款','L/C','第三方付款','银行手续费','部分收款','逾期','争议','退款'];
const statusLabel = (v:string) => PAYMENT_STATES.find(x=>x[0]===v)?.[1] || v || '—';
const money = (v:number,c:string) => c+' '+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const dateToday = () => new Date().toISOString().slice(0,10);
const datePlusDays=(date:string,days:number)=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)};
const emptyAllocation = () => ({order_id:'',schedule_node_id:'',allocation_type:'定金',allocated_amount:'',allocated_amount_in_payment:'',allocation_date:dateToday()});
const scheduleOf = (o?:AnyRow):AnyRow[] => Array.isArray(o?.metadata?.sales_order?.payment_schedule) ? o.metadata.sales_order.payment_schedule as AnyRow[] : [];
const isAllocatableOrder = (o:AnyRow) => Boolean(o&&(o.status==='active'||o.status==='completed'||['confirmed','preparing','partially_shipped','shipped','completed'].includes(o.metadata?.sales_order?.order_status)));

function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:React.ElementType}) {
  return <Tile className="tp-payments__metric"><div className="tp-payments__metric-head"><span>{label}</span><Icon size={20}/></div><strong>{value}</strong><small>{detail}</small></Tile>;
}
function Field({id,label,value,onChange,type='text',disabled=false,placeholder=''}:{id:string;label:string;value:any;onChange:(v:string)=>void;type?:string;disabled?:boolean;placeholder?:string}) {
  if (type === 'date') return <DateField id={id} label={label} value={String(value??'')} disabled={disabled} onChange={onChange}/>;
  return <TextInput id={id} labelText={label} type={type} value={String(value??'')} disabled={disabled} placeholder={placeholder} onChange={e=>onChange(e.currentTarget.value)}/>;
}
function Pick({id,label,value,onChange,options,disabled=false}:{id:string;label:string;value:any;onChange:(v:string)=>void;options:Array<string|{value:string;label:string}>;disabled?:boolean}) {
  return <Select id={id} labelText={label} value={String(value??'')} disabled={disabled} onChange={e=>onChange(e.currentTarget.value)}><SelectItem value="" text="请选择"/>{options.map(x=>{const option=typeof x==='string'?{value:x,label:x}:x;return <SelectItem key={option.value} value={option.value} text={option.label}/>;})}</Select>;
}

export function PaymentConsolePage() {
  
  const [rows,setRows]=useState<AnyRow[]>([]);
  const [allocations,setAllocations]=useState<AnyRow[]>([]);
  const [accounts,setAccounts]=useState<AnyRow[]>([]);
  const [orders,setOrders]=useState<AnyRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [currency,setCurrency]=useState('USD');
  const [marketCountry,setMarketCountry]=useState('all');
  const [view,setView]=useState<'payments'|'receivables'>('payments');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const db=await getSupabaseClient();
      const [p,a,o,al,ep]=await Promise.all([
        db.from('trade_payments').select('*').order('created_at',{ascending:false}).range(0,2999),
        db.from('crm_accounts').select('id,account_name,country_code').eq('is_archived',false).order('account_name'),
        db.from('trade_orders').select('*').eq('order_type','sales').order('created_at',{ascending:false}).range(0,2999),
        db.from('trade_payment_allocations').select('*').range(0,9999),
        db.from('enterprise_profiles').select('default_currency').eq('is_default',true).eq('is_archived',false).maybeSingle(),
      ]);
      if(p.error)throw p.error;if(a.error)throw a.error;if(o.error)throw o.error;if(al.error)throw al.error;if(ep.error)throw ep.error;
      const base=ep.data?.default_currency||'USD';setCurrency(base);
      setRows(p.data||[]);setAccounts(a.data||[]);setOrders(o.data||[]);setAllocations(al.data||[]);
    } catch(e) { setError(e instanceof Error?e.message:'读取收款数据失败'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load()},[load]);

  const accountMap=useMemo(()=>new Map(accounts.map(a=>[a.id,a.account_name])),[accounts]);
  const accountCountryMap=useMemo(()=>new Map(accounts.map(a=>[a.id,String(a.country_code||'').toUpperCase()])),[accounts]);
  const paymentMarketData=useMemo(()=>{const counts=new Map<string,number>();rows.filter(row=>row.payment_type==='receipt').forEach(row=>{const code=accountCountryMap.get(row.account_id)||'';if(code)counts.set(code,(counts.get(code)||0)+1)});return [...counts.entries()].map(([code,value])=>{let label=code;try{label=new Intl.DisplayNames(['zh-TW'],{type:'region'}).of(code)||code}catch{}return {code,label,value}}).sort((a,b)=>b.value-a.value)},[rows,accountCountryMap]);
  const filtered=useMemo(()=>rows.filter(r=>(status==='all'||r.status===status)&&r.currency===currency&&(marketCountry==='all'||accountCountryMap.get(r.account_id)===marketCountry)&&[r.payment_no,accountMap.get(r.account_id)||'',r.payer_name,r.bank_reference,r.remittance_info].join(' ').toLowerCase().includes(query.trim().toLowerCase())),[rows,status,currency,query,accountMap,accountCountryMap,marketCountry]);
  const confirmed=rows.filter(r=>['confirmed','partially_reconciled','reconciled'].includes(r.status));
  const currencyRows=rows.filter(r=>r.currency===currency);
  const grossReceived=currencyRows.filter(r=>r.payment_type==='receipt'&&['confirmed','partially_reconciled','reconciled','returned'].includes(r.status)).reduce((s,r)=>s+Number(r.net_received||0),0);
  const refunds=currencyRows.filter(r=>r.payment_type==='refund'&&r.status==='returned').reduce((s,r)=>s+Number(r.refund_amount||0),0);
  const totalReceived=Math.max(0,grossReceived-refunds);
  const unallocated=currencyRows.filter(r=>r.payment_type==='receipt'&&['confirmed','partially_reconciled','reconciled'].includes(r.status)).reduce((s,r)=>s+Number(r.unallocated_amount||0),0);
  const pending=rows.filter(r=>r.status==='pending_confirmation'||r.status==='draft').length;
  const thirdParty=rows.filter(r=>r.is_third_party&&r.status!=='voided').length;

  const receivables=useMemo(()=>{
    const out:AnyRow[]=[];
    const paidAllocations=allocations.filter(a=>confirmed.some(p=>p.id===a.payment_id));
    for(const order of orders){
      if(!isAllocatableOrder(order))continue;
      const so=order.metadata?.sales_order||{};
      const customer=accountMap.get(order.crm_account_id)||so.account_snapshot?.account_name||'—';
      for(const node of scheduleOf(order)){
        const allocationReceived=paidAllocations.filter(a=>a.order_id===order.id&&a.schedule_node_id===String(node.id)).reduce((s,a)=>s+Number(a.allocated_amount||0),0);
        const received=Number(node.paid_amount??allocationReceived);
        const amount=Number(node.amount||0);
        const writtenOff=Number(node.writeoff_amount||0);
        const outstanding=Math.max(0,amount-received-writtenOff);
        const due=node.due_date||null;
        const overdue=due&&outstanding>0?Math.max(0,Math.floor((new Date(dateToday()+'T00:00:00').getTime()-new Date(due+'T00:00:00').getTime())/86400000)):0;
        const bucket=overdue===0?'未到期':overdue<=30?'1–30':overdue<=60?'31–60':overdue<=90?'61–90':'90+';
        const waitingTrigger=!due&&/提单|信用证议付|验货/i.test(String(node.trigger||''));
        const nodeStatus=outstanding<=0.005?(writtenOff>0?'已核销差异':'已收齐'):waitingTrigger?'待触发':overdue>0?'逾期':received>0?'部分收':'未收';
        out.push({id:String(node.id),order_id:order.id,order_number:order.order_number,account_id:order.crm_account_id,customer,node_name:node.milestone||node.node_name||'收款节点',trigger:node.trigger||'',currency:order.currency_code,amount,received,outstanding,due_date:due,overdue_days:overdue,aging_bucket:bucket,node_status:nodeStatus,reminder_level:Number(node.reminder_level||0),last_reminder_at:node.last_reminder_at,next_followup_date:node.next_followup_date,followup_note:node.followup_note,promised_date:node.promised_date,dispute_flag:Boolean(node.dispute_flag),dispute_reason:node.dispute_reason});
      }
    }
    return out;
  },[orders,allocations,confirmed,accountMap]);
  const receivableFiltered=receivables.filter(r=>r.currency===currency&&(marketCountry==='all'||accountCountryMap.get(r.account_id)===marketCountry)&&(status==='all'||(status==='overdue'?r.node_status==='逾期':status===r.node_status))&&[r.order_number,r.customer,r.node_name].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const outstandingTotal=receivables.filter(r=>r.currency===currency).reduce((s,r)=>s+r.outstanding,0);
  const overdueTotal=receivables.filter(r=>r.currency===currency&&r.overdue_days>0).reduce((s,r)=>s+r.outstanding,0);

  const days=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return {key,label:(d.getMonth()+1)+'/'+d.getDate()};});
  const trend=days.map(day=>{const received=currencyRows.filter(r=>r.payment_type==='receipt'&&['confirmed','partially_reconciled','reconciled','returned'].includes(r.status)&&r.received_date===day.key).reduce((s,r)=>s+Number(r.net_received||0),0);const refunded=currencyRows.filter(r=>r.payment_type==='refund'&&r.status==='returned'&&r.refund_date===day.key).reduce((s,r)=>s+Number(r.refund_amount||0),0);return {group:day.label,key:'净回款',value:received-refunded};});
  const statusData=PAYMENT_STATES.map(([k,v])=>({group:v,key:'收款笔数',value:currencyRows.filter(r=>r.status===k).length})).filter(x=>x.value);
  const methodData=METHODS.map(m=>({group:m,key:'收款笔数',value:currencyRows.filter(r=>r.payment_method===m).length})).filter(x=>x.value);
  const agingData=['未到期','1–30','31–60','61–90','90+'].map(k=>({group:k,key:'未收金额',value:receivables.filter(r=>r.currency===currency&&r.aging_bucket===k).reduce((s,r)=>s+r.outstanding,0)})).filter(x=>x.value>0);
  const chartOpts={theme:document.documentElement.dataset.carbonTheme==='g100'?'g100':'white',height:'240px',color:{pairing:{numberOfVariants:14,option:1}},legend:{enabled:false},toolbar:{enabled:false},axes:{bottom:{mapsTo:'group',scaleType:ScaleTypes.LABELS},left:{mapsTo:'value',scaleType:ScaleTypes.LINEAR}}};

  if (loading) return <PageSkeleton className="tp-payments" layout={[
  { type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: 'tp-payments__header', children: [
    { type: 'group', direction: 'column', gap: 'var(--cds-spacing-03)', children: [{ type: 'text', width: '12rem' }, { type: 'text', heading: true, width: '12rem' }, { type: 'text', width: '28rem' }] },
    { type: 'group', direction: 'row', gap: 'var(--cds-spacing-03)', className: 'tp-payments__actions', children: [{ type: 'placeholder', width: '5rem', height: '2.5rem' }, { type: 'placeholder', width: '8rem', height: '2.5rem' }] },
  ] },
  { type: 'group', direction: 'grid', columns: 3, gap: 'var(--cds-spacing-04)', className: 'tp-payments__metrics', children: Array.from({ length: 6 }, () => ({ type: 'placeholder' as const, minHeight: '8rem' })) },
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-payments__panel', children: [
    { type: 'text', heading: true, width: '14rem' },
    { type: 'placeholder', width: '10rem', height: '3rem' },
    { type: 'group', direction: 'grid', columns: 2, gap: 'var(--cds-spacing-04)', className: 'tp-payments__charts', children: Array.from({ length: 4 }, () => ({ type: 'placeholder' as const, minHeight: '16rem', className: 'tp-payments__chart' })) },
  ] },
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-payments__panel tp-payments__market-panel', children: [{ type: 'text', heading: true, width: '14rem' }, { type: 'placeholder', minHeight: '20rem' }] },
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-payments__panel', children: [
    { type: 'placeholder', width: '18rem', height: '2.5rem', className: 'tp-payments__view-switch' },
    { type: 'group', direction: 'grid', columns: 2, gap: 'var(--cds-spacing-04)', className: 'tp-payments__filters', children: [{ type: 'placeholder', height: '2.5rem' }, { type: 'placeholder', height: '2.5rem' }] },
    { type: 'table', columns: 9, rows: 6, className: 'tp-payments__table-wrap' },
  ] },
]} />;
  return <main className="tp-payments">
    <header className="tp-payments__header"><div><p className="tp-payments__eyebrow">TRADEPILOT / FINANCE / ACCOUNTS RECEIVABLE</p><h1>收款（Payment）</h1><p>管理到账、预收款、订单核销、银行对账与应收催款。</p></div><div className="tp-payments__actions"><Button kind="tertiary" onClick={()=>void load()} disabled={loading}><CarbonIcons.Renew size={16}/>刷新</Button><Link href="/payments/new" renderIcon={CarbonIcons.Add}>创建收款</Link></div></header>
    {error&&<InlineNotification kind="error" title="收款数据读取失败" subtitle={error}/>}
    <section className="tp-payments__metrics">
      <Metric label="累计到账" value={money(totalReceived,currency)} detail={currency+' · 已确认收款'} icon={CarbonIcons.Currency}/>
      <Metric label="未分配预收" value={money(unallocated,currency)} detail="可继续分配到后续订单" icon={CarbonIcons.Wallet}/>
      <Metric label="应收未收" value={money(outstandingTotal,currency)} detail={currency+' · 订单收款计划'} icon={CarbonIcons.Document}/>
      <Metric label="逾期应收" value={money(overdueTotal,currency)} detail="按到账确认后的未收余额计算" icon={CarbonIcons.WarningAlt}/>
      <Metric label="待确认记录" value={String(pending)} detail="草稿或待确认" icon={CarbonIcons.Time}/>
      <Metric label="第三方付款" value={String(thirdParty)} detail="需关注付款关系及水单" icon={CarbonIcons.UserMultiple}/>
    </section>
    <section className="tp-payments__panel">
      <div className="tp-payments__panel-head"><div><h2>收款与应收分析</h2><p>按币种、收款状态、方式、到账趋势和应收账龄分析。</p></div><Pick id="payment-currency" label="统计币种" value={currency} onChange={setCurrency} options={CURRENCIES}/></div>
      <div className="tp-payments__charts">
        <div className="tp-payments__chart"><h3>近 30 日到账趋势 <span>{currency}</span></h3><LineChart data={trend} options={{...chartOpts,axes:{...chartOpts.axes,left:{title:currency,mapsTo:'value',scaleType:ScaleTypes.LINEAR}}}}/></div>
        <div className="tp-payments__chart"><h3>收款状态分布</h3>{statusData.length?<SimpleBarChart data={statusData} options={chartOpts}/>:<p>暂无收款数据</p>}</div>
        <div className="tp-payments__chart"><h3>收款方式分布</h3>{methodData.length?<SimpleBarChart data={methodData} options={chartOpts}/>:<p>暂无收款数据</p>}</div>
        <div className="tp-payments__chart"><h3>应收账龄分布</h3>{agingData.length?<SimpleBarChart data={agingData} options={chartOpts}/>:<p>暂无未收应收</p>}</div>
      </div>
    </section>
    <section className="tp-payments__panel tp-payments__market-panel">
      <div className="tp-payments__panel-head"><div><h2>全球回款客户分布</h2><p>按收款客户所在国家 / 地区统计收款笔数；点击地图或排名可筛选收款与应收记录。</p></div></div>
      {paymentMarketData.length?<WorldMapChart data={paymentMarketData} unitLabel="笔收款" selectedCode={marketCountry==='all'?undefined:marketCountry} onCountrySelect={code=>setMarketCountry(current=>current===code?'all':code)}/>:<p className="tp-payments__empty">暂无可按客户国家统计的收款记录。</p>}
    </section>
    <section className="tp-payments__panel">
      <div className="tp-payments__view-switch"><ContentSwitcher size="sm" selectedIndex={view==='payments'?0:1} onChange={({name})=>{if(name){setView(String(name) as 'payments'|'receivables');setStatus('all')}}}><Switch name="payments" text="收款记录"/><Switch name="receivables" text="应收计划（账龄与催款）"/></ContentSwitcher><Tag type="blue">{view==='payments'?filtered.length:receivableFiltered.length} 条记录</Tag></div>
      <div className="tp-payments__filters"><TextInput id="payment-search" labelText="搜索" placeholder={view==='payments'?'收款编号、客户、付款人、流水号':'订单号、客户、收款节点'} value={query} onChange={e=>setQuery(e.currentTarget.value)}/><Select id="payment-status" labelText={view==='payments'?'收款状态':'应收状态'} value={status} onChange={e=>setStatus(e.currentTarget.value)}><SelectItem value="all" text="全部状态"/>{view==='payments'?PAYMENT_STATES.map(([k,v])=><SelectItem key={k} value={k} text={v}/>):['待触发','未收','部分收','已收齐','逾期','已核销差异'].map(k=><SelectItem key={k} value={k} text={k}/>)}</Select></div>
      {loading?<InlineLoading description="正在读取收款与应收数据…"/>:view==='payments'?<div className="tp-payments__table-wrap"><Table><TableHead><TableRow><TableHeader>收款编号</TableHeader><TableHeader>状态</TableHeader><TableHeader>客户</TableHeader><TableHeader>到账日期</TableHeader><TableHeader>付款方式</TableHeader><TableHeader>汇款金额</TableHeader><TableHeader>实际入账</TableHeader><TableHeader>已分配</TableHeader><TableHeader>未分配</TableHeader></TableRow></TableHead><TableBody>{filtered.map(r=><TableRow key={r.id}><TableCell><Link href={'/payments/'+r.id} className="tp-payments__link">{r.payment_no}</Link>{r.is_third_party&&<Tag type="warm-gray">第三方</Tag>}</TableCell><TableCell><Tag type={r.status==='reconciled'?'green':r.status==='voided'?'red':r.status==='draft'?'cool-gray':'blue'}>{statusLabel(r.status)}</Tag></TableCell><TableCell>{accountMap.get(r.account_id)||'—'}</TableCell><TableCell>{r.received_date||'—'}</TableCell><TableCell>{r.payment_method}</TableCell><TableCell>{money(r.amount,r.currency)}</TableCell><TableCell>{money(r.net_received,r.currency)}</TableCell><TableCell>{money(r.allocated_total,r.currency)}</TableCell><TableCell>{money(r.unallocated_amount,r.currency)}</TableCell></TableRow>)}</TableBody></Table>{!filtered.length&&<p className="tp-payments__empty">没有符合条件的收款记录。</p>}</div>:<div className="tp-payments__table-wrap"><Table><TableHead><TableRow><TableHeader>订单</TableHeader><TableHeader>客户</TableHeader><TableHeader>收款节点</TableHeader><TableHeader>触发条件</TableHeader><TableHeader>应收金额</TableHeader><TableHeader>已收金额</TableHeader><TableHeader>未收金额</TableHeader><TableHeader>到期日</TableHeader><TableHeader>逾期天数</TableHeader><TableHeader>账龄</TableHeader><TableHeader>状态</TableHeader><TableHeader>催款级别</TableHeader><TableHeader>最近催款</TableHeader><TableHeader>下次跟进</TableHeader><TableHeader>跟进记录</TableHeader><TableHeader>承诺付款日</TableHeader><TableHeader>争议 / 原因</TableHeader></TableRow></TableHead><TableBody>{receivableFiltered.map(r=><TableRow key={r.order_id+'-'+r.id}><TableCell>{r.order_number}</TableCell><TableCell>{r.customer}</TableCell><TableCell>{r.node_name}</TableCell><TableCell>{r.trigger||'—'}</TableCell><TableCell>{money(r.amount,r.currency)}</TableCell><TableCell>{money(r.received,r.currency)}</TableCell><TableCell>{money(r.outstanding,r.currency)}</TableCell><TableCell>{r.due_date||'—'}</TableCell><TableCell>{r.overdue_days}</TableCell><TableCell>{r.aging_bucket}</TableCell><TableCell><Tag type={['已收齐','已核销差异'].includes(r.node_status)?'green':r.node_status==='逾期'?'red':'blue'}>{r.node_status}</Tag></TableCell><TableCell>{r.reminder_level}</TableCell><TableCell>{r.last_reminder_at?new Date(r.last_reminder_at).toLocaleDateString():'—'}</TableCell><TableCell>{r.next_followup_date||'—'}</TableCell><TableCell>{r.followup_note||'—'}</TableCell><TableCell>{r.promised_date||'—'}</TableCell><TableCell>{r.dispute_flag?<><Tag type="red">有争议</Tag><small>{r.dispute_reason||''}</small></>:'—'}</TableCell></TableRow>)}</TableBody></Table>{!receivableFiltered.length&&<p className="tp-payments__empty">当前币种没有应收计划记录。</p>}</div>}
    </section>
  </main>;
}

export function PaymentFormPage({readOnly=false}:{readOnly?:boolean}) {
  const nav=useNavigate();const {id}=useParams();const lifecycleEvents=useBusinessTransitionEvents('payment',id);const editing=Boolean(id);const [accounts,setAccounts]=useState<AnyRow[]>([]);const [contacts,setContacts]=useState<AnyRow[]>([]);const [orders,setOrders]=useState<AnyRow[]>([]);const [banks,setBanks]=useState<AnyRow[]>([]);const [payments,setPayments]=useState<AnyRow[]>([]);const [baseCurrency,setBaseCurrency]=useState('USD');
  const [shippedRefundOrders,setShippedRefundOrders]=useState<string[]>([]);
  const [payment,setPayment]=useState<AnyRow>({payment_type:'receipt',status:'draft',payment_date:dateToday(),received_date:dateToday(),owner_name:'',account_id:'',contact_id:'',payer_name:'',is_third_party:false,currency:'USD',amount:'',bank_fee:'0',intermediary_fee:'0',net_received:'',fee_bearer:'SHA',payment_method:'T/T',bank_account_id:'',bank_reference:'',uetr:'',remittance_info:'',exchange_rate:'',rate_date:'',payer_relation:'',payer_country:'',payer_bank:'',payer_swift:'',tags:[],lc_no:'',lc_issuing_bank:'',lc_advising_bank:'',lc_amount:'',lc_type:'即期',usance_days:'',presentation_date:'',acceptance_date:'',maturity_date:'',discrepancy:'',discrepancy_status:'无',diff_amount:'0',diff_type:'无',diff_reason:'',diff_handling:'',diff_note:'',original_payment_id:'',refund_reason:'',refund_amount:'',refund_date:'',refund_bank_ref:'',refund_shipped_confirmed:false,bank_reconciled:false,statement_date:'',statement_ref:'',void_reason:'',remarks_internal:'',bank_slip:'',receipt_sent:false,tags_text:'',source:'manual'});
  const [allocations,setAllocations]=useState<AnyRow[]>([]);
  const [activeTab,setActiveTab]=useState(0);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [paymentNo,setPaymentNo]=useState('新建收款');
  const locked=readOnly||['confirmed','partially_reconciled','reconciled','returned','voided'].includes(payment.status);
  const set=(key:string,value:any)=>setPayment((p:AnyRow)=>({...p,[key]:value}));
  const accountOrders=orders.filter(o=>o.crm_account_id===payment.account_id&&isAllocatableOrder(o));
  const allocatedBankIds=allocations.map(a=>orders.find(o=>o.id===a.order_id)?.metadata?.sales_order?.form?.bank_account_id).filter(Boolean);
  const bankOptions=banks.filter(b=>b.is_active!==false&&!b.is_archived&&(!allocatedBankIds.length||(new Set(allocatedBankIds).size===1&&allocatedBankIds[0]===b.id)));
  const grossFees=Number(payment.bank_fee||0)+Number(payment.intermediary_fee||0);
  const suggestedNet=Math.max(0,Number(payment.amount||0)-grossFees);
  const netMismatch=Boolean(payment.amount)&&Math.abs(Number(payment.net_received||suggestedNet)-suggestedNet)>0.005;
  const paymentEquivalent=(a:AnyRow)=>{const order=orders.find(o=>o.id===a.order_id);const orderRate=Number(order?.metadata?.sales_order?.form?.exchange_rate||1);const paymentRate=Number(payment.exchange_rate||1);return paymentRate>0?Number(a.allocated_amount||0)*orderRate/paymentRate:0};
  const allocatedSum=allocations.reduce((sum,a)=>{const order=orders.find(o=>o.id===a.order_id);const node=scheduleOf(order).find((n:AnyRow)=>String(n.id)===String(a.schedule_node_id));const outstanding=Math.max(0,Number(node?.amount||0)-Number(node?.paid_amount||0));const requested=Number(a.allocated_amount||0);const ratio=requested>0?Math.min(1,outstanding/requested):0;return sum+paymentEquivalent(a)*ratio},0);
  const remaining=Math.max(0,Number(payment.net_received||suggestedNet)-allocatedSum);
  const selectedAccount=accounts.find(a=>a.id===payment.account_id);
  const originalPayment=payments.find(p=>p.id===payment.original_payment_id);
  const refundedBefore=payments.filter(p=>p.original_payment_id===payment.original_payment_id&&['confirmed','partially_reconciled','reconciled','returned'].includes(p.status)).reduce((sum,p)=>sum+Number(p.refund_amount||0),0);
  const refundAvailable=Math.max(0,Number(originalPayment?.net_received||0)-refundedBefore);
  const similarDuplicate=payments.some(p=>p.id!==id&&p.payment_type==='receipt'&&p.account_id===payment.account_id&&p.currency===payment.currency&&p.status!=='voided'&&Math.abs(Number(p.net_received||0)-Number(payment.net_received||suggestedNet))<0.005&&p.received_date&&payment.received_date&&Math.abs(new Date(p.received_date).getTime()-new Date(payment.received_date).getTime())<=3*86400000);
  useEffect(()=>{let active=true;const loadShippedRefundOrders=async()=>{if(payment.payment_type!=='refund'||!payment.original_payment_id){setShippedRefundOrders([]);return;}try{const db=await getSupabaseClient();const {data:allocs,error:aError}=await db.from('trade_payment_allocations').select('order_id').eq('payment_id',payment.original_payment_id);if(aError)throw aError;const ids=[...new Set((allocs||[]).map((a:any)=>a.order_id))];if(!ids.length){if(active)setShippedRefundOrders([]);return;}const {data:shipments,error:sError}=await db.from('trade_shipments').select('order_id,status').in('order_id',ids).in('status',['loaded','departed','in_transit','arrived','import_cleared','delivered']);if(sError)throw sError;if(active)setShippedRefundOrders([...new Set((shipments||[]).map((s:any)=>s.order_id))]);}catch(e){if(active)setError(e instanceof Error?e.message:'检查订单发运状态失败');}};void loadShippedRefundOrders();return()=>{active=false}},[payment.payment_type,payment.original_payment_id]);
  const computedDiff=allocations.reduce((sum,a)=>{const order=orders.find(o=>o.id===a.order_id);const node=scheduleOf(order).find(n=>String(n.id)===String(a.schedule_node_id));const outstanding=Math.max(0,Number(node?.amount||0)-Number(node?.paid_amount||0));return sum+outstanding-Number(a.allocated_amount||0)},0);
  const computedDiffType=computedDiff>0.005?'短收':computedDiff< -0.005?'多收':'无';

  useEffect(()=>{(async()=>{
    try {
      const db=await getSupabaseClient();
      const [a,c,o,b,payRows,ep]=await Promise.all([
        db.from('crm_accounts').select('id,account_name,legal_name,country_code,currency_code').eq('is_archived',false).order('account_name'),
        db.from('crm_contacts').select('id,account_id,first_name,last_name,full_name').eq('is_archived',false).order('first_name'),
        db.from('trade_orders').select('*').eq('order_type','sales').order('created_at',{ascending:false}).range(0,2999),
        db.from('enterprise_bank_accounts').select('*').eq('is_archived',false).order('bank_name'),
        db.from('trade_payments').select('id,payment_no,payment_type,account_id,status,net_received,currency,original_payment_id,refund_amount,received_date').order('created_at',{ascending:false}).range(0,1999),
        db.from('enterprise_profiles').select('default_currency').eq('is_default',true).eq('is_archived',false).maybeSingle(),
      ]);
      if(a.error)throw a.error;if(c.error)throw c.error;if(o.error)throw o.error;if(b.error)throw b.error;if(payRows.error)throw payRows.error;if(ep.error)throw ep.error;
      const base=ep.data?.default_currency||'USD';setBaseCurrency(base);
      setAccounts(a.data||[]);setContacts(c.data||[]);setOrders(o.data||[]);setBanks(b.data||[]);setPayments(payRows.data||[]);
      if(!editing)setPayment((prev:AnyRow)=>({...prev,currency:base,exchange_rate:'1'}));
      if(editing&&id){
        const [p,al]=await Promise.all([db.from('trade_payments').select('*').eq('id',id).single(),db.from('trade_payment_allocations').select('*').eq('payment_id',id).order('created_at')]);
        if(p.error)throw p.error;if(al.error)throw al.error;
        const r=p.data;setPayment((old:AnyRow)=>({...old,...r,tags:r.tags||[]}));setPaymentNo(r.payment_no);setAllocations(al.data||[]);
      } else {
        const {data:s}=await db.auth.getSession();
        if(s.session?.user?.email)setPayment((p:AnyRow)=>({...p,owner_name:s.session.user.email}));
      }
    } catch(e) { setError(e instanceof Error?e.message:'初始化收款表单失败'); }
    finally { setLoading(false); }
  })()},[id,editing]);

  useEffect(()=>{if(!payment.payer_name&&selectedAccount?.account_name)set('payer_name',selectedAccount.legal_name||selectedAccount.account_name)},[selectedAccount?.id]);
  useEffect(()=>{if(!selectedAccount||!payment.payer_name)return;const expected=String(selectedAccount.legal_name||selectedAccount.account_name||'').trim().toLowerCase();const actual=String(payment.payer_name||'').trim().toLowerCase();const thirdParty=Boolean(actual&&expected&&actual!==expected);if(payment.is_third_party!==thirdParty)set('is_third_party',thirdParty)},[selectedAccount?.id,selectedAccount?.legal_name,selectedAccount?.account_name,payment.payer_name]);
  const setAllocation=(index:number,key:string,value:string)=>setAllocations(prev=>prev.map((a,i)=>i===index?{...a,[key]:value,...(key==='order_id'?{schedule_node_id:''}:{})}:a));
  const addAllocation=()=>setAllocations(p=>[...p,emptyAllocation()]);
  const removeAllocation=(i:number)=>setAllocations(p=>p.filter((_,n)=>n!==i));
  const nodesFor=(orderId:string):AnyRow[]=>scheduleOf(orders.find(o=>o.id===orderId));
  const validate=()=>{
    if(!payment.account_id||!payment.payer_name?.trim()||!payment.owner_name?.trim())return '客户、实际付款人和负责人为必填。';
    if(!payment.payment_date||!payment.received_date)return '付款日期和到账日期为必填。';
    if(payment.received_date>dateToday())return '到账日期不得晚于今天。';
    if(!(Number(payment.amount)>0))return '汇款金额必须大于 0。';
    if(Number(payment.net_received||suggestedNet)<=0||Number(payment.net_received||suggestedNet)>Number(payment.amount))return '实际入账金额必须大于 0，且不得超过汇款金额。';
    if(!payment.bank_account_id||!payment.payment_method||!payment.currency)return '收款币种、收款方式和我方收款账户为必填。';
    if(allocatedBankIds.length&&new Set(allocatedBankIds).size>1)return '本次分配订单使用了不同的收款账户，不能合并到同一笔收款记录。';
    if(allocatedBankIds.length&&allocatedBankIds[0]!==payment.bank_account_id)return '我方收款账户必须与所分配订单上的收款账户一致。';
    if(payment.currency!==baseCurrency&&(!(Number(payment.exchange_rate)>0)))return '收款币种不同于本位币 '+baseCurrency+'，必须填写大于 0 的汇率。';
    if(payment.is_third_party&&(!payment.payer_relation||!payment.bank_slip))return '第三方付款必须填写付款关系并提供银行水单。';
    if(payment.payer_swift&&!/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(payment.payer_swift))return '付款行 SWIFT 必须为 8 或 11 位。';
    if(payment.uetr&&payment.uetr.length!==36)return 'UETR 必须为 36 位。';
    if(payment.payment_method==='L/C'&&!payment.lc_no?.trim())return 'L/C 收款必须填写信用证号。';
    if(payment.lc_type==='远期'&&(!payment.usance_days||!payment.acceptance_date))return '远期 L/C 必须填写远期天数和承兑日期。';
    if(payment.discrepancy_status==='已提出'&&allocations.length)return 'L/C 不符点已提出，暂不能分配核销。';
    if(Math.abs(allocatedSum)>Number(payment.net_received||suggestedNet)+0.000001)return '已分配金额不能超过实际入账金额。';
    if(Math.abs(computedDiff)>0.005&&(!payment.diff_reason||!payment.diff_handling))return '存在短收或多收差异时，必须选择差异原因和处理方式。';
    if(computedDiff < -0.005&&!['转预收','退款'].includes(payment.diff_handling))return '发生多收时，差额必须转为预收或退款。';
    if(payment.diff_handling==='坏账核销'&&!payment.diff_note?.trim())return '坏账核销必须填写差异说明。';
    if(payment.payment_type==='refund'&&(!payment.original_payment_id||!(Number(payment.refund_amount)>0)))return '退款必须关联原收款并填写退款金额。';
    if(payment.payment_type==='refund'&&(!payment.refund_reason||!payment.refund_date))return '退款原因和退款日期为必填。';
    if(payment.payment_type==='refund'&&shippedRefundOrders.length>0&&!payment.refund_shipped_confirmed)return '原收款关联订单已有发运记录，请先完成退款二次确认。';
    if(payment.payment_type==='refund'&&Number(payment.refund_amount)>refundAvailable+0.000001)return '退款金额超过原收款可退余额：'+money(refundAvailable,payment.currency);
    if(payment.payment_type==='refund'&&Math.abs(Number(payment.refund_amount)-Number(payment.amount))>0.000001)return '退款记录的汇款金额应与退款金额一致。';
    const duplicate=new Set<string>();
    for(const a of allocations){
      if(!a.order_id||!a.schedule_node_id||!(Number(a.allocated_amount)>0)||!(paymentEquivalent(a)>0))return '每条分配记录必须选择订单、收款节点并填写有效分配金额。';
      if(!accountOrders.some(o=>o.id===a.order_id))return '分配订单必须属于当前客户，且订单处于已确认及之后状态。';
      const key=a.order_id+'|'+a.schedule_node_id;if(duplicate.has(key))return '同一收款记录不能重复分配到同一收款节点。';duplicate.add(key);
    }
    return '';
  };
  const save=async()=>{
    setError('');const issue=validate();if(issue){setError(issue);return;}
    setSaving(true);
    try {
      const db=await getSupabaseClient();const {data:s}=await db.auth.getSession();const user=s.session?.user;if(!user)throw new Error('登录状态已失效');
      const net=Number(payment.net_received||suggestedNet);
      const nullable=(value:any)=>String(value??'').trim()||null;
      const {tags,...paymentFields}=payment;
      const payload={...paymentFields,owner_id:user.id,account_id:payment.account_id,contact_id:payment.contact_id||null,payment_date:payment.payment_date,received_date:payment.received_date||null,currency:payment.currency,amount:Number(payment.amount),bank_fee:Number(payment.bank_fee||0),intermediary_fee:Number(payment.intermediary_fee||0),net_received:net,bank_reference:nullable(payment.bank_reference),uetr:nullable(payment.uetr),payer_swift:nullable(payment.payer_swift),payer_relation:nullable(payment.payer_relation),fee_bearer:nullable(payment.fee_bearer),exchange_rate:payment.exchange_rate?Number(payment.exchange_rate):null,rate_date:nullable(payment.rate_date),amount_base:payment.exchange_rate?net*Number(payment.exchange_rate):null,lc_no:nullable(payment.lc_no),lc_issuing_bank:nullable(payment.lc_issuing_bank),lc_advising_bank:nullable(payment.lc_advising_bank),lc_amount:payment.lc_amount?Number(payment.lc_amount):null,lc_type:nullable(payment.lc_type),usance_days:payment.usance_days?Number(payment.usance_days):null,presentation_date:nullable(payment.presentation_date),acceptance_date:nullable(payment.acceptance_date),maturity_date:nullable(payment.maturity_date),discrepancy:nullable(payment.discrepancy),discrepancy_status:nullable(payment.discrepancy_status),bank_slip:nullable(payment.bank_slip),allocated_total:allocatedSum,unallocated_amount:Math.max(0,net-allocatedSum),diff_amount:Math.abs(computedDiff),diff_type:computedDiffType,diff_reason:nullable(payment.diff_reason),diff_handling:nullable(payment.diff_handling),diff_note:nullable(payment.diff_note),original_payment_id:payment.original_payment_id||null,refund_reason:nullable(payment.refund_reason),refund_amount:payment.refund_amount?Number(payment.refund_amount):null,refund_date:nullable(payment.refund_date),refund_bank_ref:nullable(payment.refund_bank_ref),statement_date:nullable(payment.statement_date),statement_ref:nullable(payment.statement_ref),void_reason:nullable(payment.void_reason),tags:Array.isArray(tags)?tags:[],created_by:user.id,updated_by:user.id};
      let paymentId=id;
      if(editing&&id){const editablePayload={...payload};delete (editablePayload as any).status;delete (editablePayload as any).reconcile_status;const {error:e}=await db.from('trade_payments').update({...editablePayload,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',user.id);if(e)throw e;}
      else {const {data,error:e}=await db.from('trade_payments').insert(payload).select('id,payment_no').single();if(e)throw e;paymentId=data.id;setPaymentNo(data.payment_no);}
      if(!paymentId)throw new Error('收款记录编号未返回。');
      const {error:delError}=await db.from('trade_payment_allocations').delete().eq('payment_id',paymentId);if(delError)throw delError;
      const allocationRows=allocations.map(a=>{const orderRow=orders.find(o=>o.id===a.order_id);const node=scheduleOf(orderRow).find((n:AnyRow)=>String(n.id)===String(a.schedule_node_id));const outstanding=Math.max(0,Number(node?.amount||0)-Number(node?.paid_amount||0));const requested=Number(a.allocated_amount||0);const effective=Math.min(requested,outstanding);const ratio=requested>0?effective/requested:0;return {owner_id:user.id,payment_id:paymentId,order_id:a.order_id,schedule_node_id:a.schedule_node_id,allocation_type:a.allocation_type,allocated_amount:effective,allocated_amount_in_payment:paymentEquivalent(a)*ratio,allocation_date:a.allocation_date||dateToday()};}).filter(a=>a.allocated_amount>0&&a.allocated_amount_in_payment>0);
      if(allocationRows.length){const {error:e}=await db.from('trade_payment_allocations').insert(allocationRows);if(e)throw e;}
      nav('/payments/'+paymentId,{replace:true});
    } catch(e) { setError(e instanceof Error?e.message:'保存收款失败'); }
    finally { setSaving(false); }
  };
  const saveReconciliation=async()=>{
    if(!id)return;setError('');setSaving(true);
    try{const db=await getSupabaseClient();const {data:s}=await db.auth.getSession();const user=s.session?.user;if(!user)throw new Error('登录状态已失效');const {error:e}=await db.from('trade_payments').update({bank_reconciled:Boolean(payment.bank_reconciled),statement_date:payment.statement_date||null,statement_ref:payment.statement_ref||null,bank_slip:payment.bank_slip||null,attachments:payment.attachments||[],receipt_sent:Boolean(payment.receipt_sent),receipt_sent_at:payment.receipt_sent?payment.receipt_sent_at||new Date().toISOString():null,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',user.id);if(e)throw e;nav('/payments/'+id,{replace:true});}
    catch(e){setError(e instanceof Error?e.message:'保存对账信息失败');}
    finally{setSaving(false);}
  };
  const confirm=async()=>{
    if(!id)return;setError('');setSaving(true);
    try{const db=await getSupabaseClient();const {error:e}=await db.rpc('confirm_trade_payment',{p_payment_id:id});if(e)throw e;nav('/payments',{replace:true});}
    catch(e){setError(e instanceof Error?e.message:'确认收款失败');}
    finally{setSaving(false);}
  };
  const voidPayment=async()=>{
    if(!id)return;setError('');
    if(!String(payment.void_reason||'').trim()){setError('作废前请在“对账与确认”填写作废原因。');setActiveTab(2);return;}
    setSaving(true);
    try{const db=await getSupabaseClient();const {error:e}=await db.rpc('void_trade_payment',{p_payment_id:id,p_reason:payment.void_reason});if(e)throw e;nav('/payments',{replace:true});}
    catch(e){setError(e instanceof Error?e.message:'作废收款失败');}
    finally{setSaving(false);}
  };
  const uploadFiles=async(event:React.ChangeEvent<HTMLInputElement>,target:'bank_slip'|'attachments')=>{
    const input=event.currentTarget;const files=Array.from(input.files||[]);input.value='';
    if(!files.length)return;
    setError('');
    try{
      const db=await getSupabaseClient();const {data:s}=await db.auth.getSession();const user=s.session?.user;if(!user)throw new Error('登录状态已失效');
      for(const file of files){
        if(file.size>15*1024*1024)throw new Error('单个附件不能超过 15 MB。');
        if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('仅支持 PDF、JPG、PNG、WEBP 文件。');
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
        const path=user.id+'/'+(id||'draft')+'/'+crypto.randomUUID()+'-'+safeName;
        const {error:e}=await db.storage.from('payment-documents').upload(path,file,{upsert:false,contentType:file.type});
        if(e)throw e;
        if(target==='bank_slip')set('bank_slip',path);
        else setPayment((prev:AnyRow)=>({...prev,attachments:[...(prev.attachments||[]),path]}));
      }
    }catch(e){setError(e instanceof Error?e.message:'上传附件失败');}
  };
  const openStoredFile=async(path:string)=>{
    try{const db=await getSupabaseClient();const {data,error:e}=await db.storage.from('payment-documents').createSignedUrl(path,3600);if(e)throw e;window.open(data.signedUrl,'_blank','noopener,noreferrer');}
    catch(e){setError(e instanceof Error?e.message:'无法打开附件');}
  };

  const statusText=statusLabel(payment.status);
  if (loading) return <PageSkeleton className="tp-payments" layout={[
  pageSkeletonHeader('tp-payments__header', 'tp-responsive-header-actions', 3),
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-payments__basic', children: [
    { type: 'group', direction: 'row', gap: 'var(--cds-spacing-03)', children: [{ type: 'placeholder', width: '7rem', height: '2rem' }, { type: 'text', width: '10rem' }] },
    { type: 'group', direction: 'grid', columns: 2, gap: 'var(--cds-spacing-05)', className: 'tp-payments__form-grid', children: Array.from({ length: 8 }, () => ({ type: 'group' as const, direction: 'column' as const, gap: 'var(--cds-spacing-02)' as const, children: [{ type: 'text' as const, width: '6rem' }, { type: 'placeholder' as const, height: '2.5rem' }] })) },
  ] },
  pageSkeletonPanel('tp-payments__panel', '12rem', '12rem'),
  pageSkeletonPanel('tp-payments__panel', '10rem', '12rem'),
]} />;
  return <main className="tp-payments">
    <header className="tp-payments__header"><div><p className="tp-payments__eyebrow">TRADEPILOT / FINANCE / PAYMENT</p><h1>{editing?paymentNo:'创建收款（Payment）'}</h1><p>{editing?'维护收款资料、分配与核销记录。':'录入真实到账，可分配多个订单节点，也可保留为预收款。'}</p></div><div className="tp-responsive-header-actions">
      {readOnly&&['draft','pending_confirmation'].includes(payment.status)&&<Button className="tp-responsive-header-actions__primary" kind="primary" disabled={saving} onClick={()=>void confirm()}>{payment.payment_type==='refund'?'确认退款 / 红冲':'确认收款并核销'}</Button>}
      {readOnly&&['confirmed','partially_reconciled'].includes(payment.status)&&Number(payment.unallocated_amount)>0.005&&<Link className="tp-responsive-header-actions__primary" href={'/payments/'+id+'/allocate'}>分配预收余额</Link>}
      {editing&&!readOnly&&['confirmed','partially_reconciled','reconciled'].includes(payment.status)&&<Button className="tp-responsive-header-actions__primary" kind="primary" disabled={saving} onClick={()=>void saveReconciliation()}>保存对账信息</Button>}
      <div className="tp-responsive-header-actions__secondary">
        <Link href="/payments">返回收款列表</Link>
        {readOnly&&payment.status==='draft'&&<Link href={'/payments/'+id+'/edit'}>编辑草稿</Link>}
        {readOnly&&['confirmed','partially_reconciled','reconciled'].includes(payment.status)&&!payment.bank_reconciled&&<Link href={'/payments/'+id+'/edit'}>登记银行对账</Link>}
        {editing&&!readOnly&&payment.status==='draft'&&<Button kind="danger--tertiary" disabled={saving} onClick={()=>void voidPayment()}>作废</Button>}
      </div>
    </div></header>
    {error&&<InlineNotification kind="error" title="收款操作未完成" subtitle={error}/>}
    {similarDuplicate&&<InlineNotification kind="warning" title="发现疑似重复收款" subtitle="同一客户在 3 天内存在相同币种和相同实际入账金额的收款记录，请核对银行流水号与水单。此提示不会阻止保存。"/>}
    {netMismatch&&<InlineNotification kind="warning" title="实际入账金额与费用计算不一致" subtitle={'汇款金额减银行手续费和中间行费用为 '+money(suggestedNet,payment.currency)+'，当前实际入账为 '+money(Number(payment.net_received),payment.currency)+'。请确认扣款差异。'}/>} 
    {readOnly&&<BusinessLifecycle title={payment.payment_type==='refund'?'退款生命周期':'收款生命周期'} steps={[{value:'draft',label:'草稿'},{value:'pending_confirmation',label:'待确认'},{value:'confirmed',label:'已确认'},{value:'partially_reconciled',label:'部分核销'},{value:'reconciled',label:'已核销'}]} current={payment.status} terminal={['reconciled','returned','voided'].includes(payment.status)} terminalKind={payment.status==='reconciled'||payment.status==='returned'?'success':'warning'} terminalTitle={statusText} description="退款、退回与作废属于独立终止状态；收款核销状态不等同于订单应收状态。" events={lifecycleEvents}/>}
    <section className="tp-payments__basic">
      <div className="tp-payments__basic-head"><div><Tag type={payment.status==='reconciled'?'green':payment.status==='voided'?'red':'blue'}>{statusText}</Tag><span>{paymentNo}</span></div><Tag type="cool-gray">{payment.payment_type==='refund'?'退款':'收款'}</Tag></div>
      <div className="tp-payments__form-grid">
        <Pick id="pay-type" label="收款类型" value={payment.payment_type} onChange={v=>set('payment_type',v)} options={[{value:'receipt',label:'收款'},{value:'refund',label:'退款'}]} disabled={locked}/>
        <Field id="pay-date" label="付款日期" type="date" value={payment.payment_date} onChange={v=>set('payment_date',v)} disabled={locked}/>
        <Field id="pay-received-date" label="到账日期" type="date" value={payment.received_date} onChange={v=>set('received_date',v)} disabled={locked}/>
        <Field id="pay-owner" label="负责人" value={payment.owner_name} onChange={v=>set('owner_name',v)} disabled={locked}/>
        <Pick id="pay-account" label="客户" value={payment.account_id} onChange={v=>{set('account_id',v);set('contact_id','');const a=accounts.find(x=>x.id===v);set('payer_name',a?.legal_name||a?.account_name||'')}} options={accounts.map(a=>({value:a.id,label:a.account_name}))} disabled={locked}/>
        <Pick id="pay-contact" label="联系人" value={payment.contact_id} onChange={v=>set('contact_id',v)} options={contacts.filter(c=>c.account_id===payment.account_id).map(c=>({value:c.id,label:c.full_name||[c.first_name,c.last_name].filter(Boolean).join(' ')}))} disabled={locked}/>
        <Field id="pay-payer" label="实际付款人" value={payment.payer_name} onChange={v=>set('payer_name',v)} disabled={locked}/>
        <div className="tp-payments__field-wide"><MultiSelect id="pay-tags" titleText="标签" label="选择标签" items={PAYMENT_TAGS} itemToString={(item:string)=>item} selectedItems={payment.tags||[]} onChange={({selectedItems}:any)=>set('tags',selectedItems)} disabled={locked}/></div>
      </div>
      <div className="tp-payments__amount-strip"><div><span>汇款金额</span><strong>{money(Number(payment.amount||0),payment.currency)}</strong></div><div><span>实际入账</span><strong>{money(Number(payment.net_received||suggestedNet),payment.currency)}</strong></div><div><span>已分配</span><strong>{money(allocatedSum,payment.currency)}</strong></div><div><span>未分配余额</span><strong>{money(remaining,payment.currency)}</strong></div></div>
    </section>
    <section className="tp-payments__form-shell">
      <Tabs selectedIndex={activeTab} onChange={({selectedIndex})=>setActiveTab(selectedIndex)}><TabList aria-label="收款资料分组" contained><Tab>收款信息</Tab><Tab>分配与核销</Tab><Tab>对账与确认</Tab><Tab>备注与附件</Tab></TabList><TabPanels>
        <TabPanel><div className="tp-payments__tab-content">
          <h2>付款方与银行信息</h2><div className="tp-payments__form-grid">
            <Pick id="pay-third-party" label="第三方付款" value={payment.is_third_party?'是':'否'} onChange={v=>set('is_third_party',v==='是')} options={['否','是']} disabled={locked}/>
            {payment.is_third_party&&<Pick id="pay-relation" label="与客户关系（必填）" value={payment.payer_relation} onChange={v=>set('payer_relation',v)} options={['关联公司','代付公司','个人','其他']} disabled={locked}/>}
            <Field id="pay-country" label="付款方国家" value={payment.payer_country} onChange={v=>set('payer_country',v)} disabled={locked}/>
            <Field id="pay-payer-bank" label="付款银行" value={payment.payer_bank} onChange={v=>set('payer_bank',v)} disabled={locked}/>
            <Field id="pay-swift" label="付款行 SWIFT" value={payment.payer_swift} onChange={v=>set('payer_swift',v)} disabled={locked}/>
            <Field id="pay-bank-ref" label="银行流水号" value={payment.bank_reference} onChange={v=>set('bank_reference',v)} disabled={locked}/>
            <Field id="pay-uetr" label="SWIFT gpi UETR（36 位）" value={payment.uetr} onChange={v=>set('uetr',v)} disabled={locked}/>
            <Field id="pay-remittance" label="汇款附言" value={payment.remittance_info} onChange={v=>set('remittance_info',v)} disabled={locked}/>
          </div>
          <h2>金额与币种</h2><div className="tp-payments__form-grid">
            <Pick id="pay-currency" label="收款币种" value={payment.currency} onChange={v=>{set('currency',v);set('exchange_rate',v===baseCurrency?'1':'')}} options={CURRENCIES} disabled={locked}/>
            <Field id="pay-amount" label="汇款金额" type="number" value={payment.amount} onChange={v=>{set('amount',v);set('net_received',String(Math.max(0,Number(v)-grossFees)))}} disabled={locked}/>
            <Field id="pay-bank-fee" label="银行手续费" type="number" value={payment.bank_fee} onChange={v=>{set('bank_fee',v);set('net_received',String(Math.max(0,Number(payment.amount)-Number(v)-Number(payment.intermediary_fee||0))))}} disabled={locked}/>
            <Field id="pay-intermediary-fee" label="中间行费用" type="number" value={payment.intermediary_fee} onChange={v=>{set('intermediary_fee',v);set('net_received',String(Math.max(0,Number(payment.amount)-Number(v)-Number(payment.bank_fee||0))))}} disabled={locked}/>
            <Field id="pay-net" label="实际入账金额" type="number" value={payment.net_received||suggestedNet} onChange={v=>set('net_received',v)} disabled={locked}/>
            <Pick id="pay-fee-bearer" label="费用承担" value={payment.fee_bearer} onChange={v=>set('fee_bearer',v)} options={['OUR','SHA','BEN']} disabled={locked}/>
            <Field id="pay-exchange" label={'汇率（收款币种 → 本位币 '+baseCurrency+'）'} type="number" value={payment.exchange_rate} onChange={v=>set('exchange_rate',v)} disabled={locked}/>
            <Field id="pay-rate-date" label="汇率日期" type="date" value={payment.rate_date} onChange={v=>set('rate_date',v)} disabled={locked}/>
            <Field id="pay-amount-base" label={'本位币入账金额（'+baseCurrency+'，自动计算）'} value={payment.exchange_rate?Number(Number(payment.net_received||suggestedNet)*Number(payment.exchange_rate)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—'} onChange={()=>{}} disabled/>
            <Field id="pay-fx-gain-loss" label="汇兑损益（只读）" value={payment.fx_gain_loss??'确认核销后计算'} onChange={()=>{}} disabled/>
            <Field id="pay-order-currency" label="订单币种" value={[...new Set(accountOrders.map(o=>o.currency_code))].join(', ')||'分配订单后确定'} onChange={()=>{}} disabled/>
          </div>
          <h2>收款方式与我方账户</h2><div className="tp-payments__form-grid">
            <Pick id="pay-method" label="收款方式" value={payment.payment_method} onChange={v=>set('payment_method',v)} options={METHODS} disabled={locked}/>
            <Pick id="pay-bank-account" label="我方收款账户" value={payment.bank_account_id} onChange={v=>set('bank_account_id',v)} options={bankOptions.map(b=>({value:b.id,label:b.bank_name+' · '+b.account_name+' · '+(b.currency_code||'多币种')}))} disabled={locked}/>
            <div className="tp-payments__field-wide"><span className="tp-payments__upload-label">银行水单（PDF / JPG / PNG / WEBP，最大 15 MB）</span><div className="tp-payments__upload-row"><FileUploaderButton accept={['.pdf','.jpg','.jpeg','.png','.webp']} buttonKind="tertiary" labelText="上传银行水单" disabled={readOnly} onChange={e=>void uploadFiles(e,'bank_slip')}/>{payment.bank_slip&&<><Tag type="green">已上传</Tag><Button kind="ghost" size="sm" onClick={()=>void openStoredFile(payment.bank_slip)}>打开水单</Button></>}</div></div>
          </div>
          {payment.payment_method==='L/C'&&<><h2>L/C 信用证信息</h2><div className="tp-payments__form-grid">
            <Field id="pay-lc-no" label="信用证号（必填）" value={payment.lc_no} onChange={v=>set('lc_no',v)} disabled={locked}/>
            <Field id="pay-lc-issuing" label="开证行" value={payment.lc_issuing_bank} onChange={v=>set('lc_issuing_bank',v)} disabled={locked}/>
            <Field id="pay-lc-advising" label="通知行" value={payment.lc_advising_bank} onChange={v=>set('lc_advising_bank',v)} disabled={locked}/>
            <Field id="pay-lc-amount" label="信用证金额" type="number" value={payment.lc_amount} onChange={v=>set('lc_amount',v)} disabled={locked}/>
            <Pick id="pay-lc-type" label="信用证类型" value={payment.lc_type} onChange={v=>set('lc_type',v)} options={['即期','远期']} disabled={locked}/>
            {payment.lc_type==='远期'&&<Field id="pay-usance" label="远期天数（必填）" type="number" value={payment.usance_days} onChange={v=>{set('usance_days',v);if(payment.acceptance_date&&v!==''&&Number(v)>=0)set('maturity_date',datePlusDays(payment.acceptance_date,Number(v)));else set('maturity_date','')}} disabled={locked}/>}
            <Field id="pay-presentation" label="交单日期" type="date" value={payment.presentation_date} onChange={v=>set('presentation_date',v)} disabled={locked}/>
            <Field id="pay-acceptance" label="承兑日期" type="date" value={payment.acceptance_date} onChange={v=>{set('acceptance_date',v);if(v&&payment.usance_days)set('maturity_date',datePlusDays(v,Number(payment.usance_days)));else set('maturity_date','')}} disabled={locked}/>
            <Field id="pay-maturity" label="到期付款日（自动计算）" type="date" value={payment.maturity_date} onChange={()=>{}} disabled/>
            <Pick id="pay-discrepancy-status" label="不符点状态" value={payment.discrepancy_status} onChange={v=>set('discrepancy_status',v)} options={['无','已提出','已接受','已拒付']} disabled={locked}/>
            <div className="tp-payments__field-wide"><TextArea id="pay-discrepancy" labelText="不符点说明" rows={3} value={payment.discrepancy||''} disabled={locked} onChange={e=>set('discrepancy',e.currentTarget.value)}/></div>
          </div></>}
        </div></TabPanel>
        <TabPanel><div className="tp-payments__tab-content">
          <div className="tp-payments__panel-head"><div><h2>来源与分配</h2><p>一笔到账可分配给同一客户的多个已确认订单收款节点；未分配余额保留为预收款。</p></div><Button kind="tertiary" onClick={addAllocation} disabled={locked}><CarbonIcons.Add/>添加分配</Button></div>
          {allocations.map((a,i)=><div className="tp-payments__allocation" key={i}>
            <div className="tp-payments__allocation-head"><strong>分配 {i+1}</strong><Button kind="ghost" size="sm" disabled={locked} onClick={()=>removeAllocation(i)}>移除</Button></div>
            <div className="tp-payments__form-grid">
              <Pick id={'alloc-order-'+i} label="订单" value={a.order_id} onChange={v=>setAllocation(i,'order_id',v)} options={accountOrders.map(o=>({value:o.id,label:o.order_number+' · '+o.title}))} disabled={locked}/>
              <Pick id={'alloc-node-'+i} label="收款节点" value={a.schedule_node_id} onChange={v=>setAllocation(i,'schedule_node_id',v)} options={nodesFor(a.order_id).map(n=>({value:String(n.id),label:(n.milestone||'收款节点')+' · '+money(Number(n.amount||0),orders.find(o=>o.id===a.order_id)?.currency_code||'USD')}))} disabled={locked}/>
              <Pick id={'alloc-type-'+i} label="分配类型" value={a.allocation_type} onChange={v=>setAllocation(i,'allocation_type',v)} options={ALLOCATION_TYPES} disabled={locked}/>
              <Field id={'alloc-amount-'+i} label="分配金额（订单币种）" type="number" value={a.allocated_amount} onChange={v=>setAllocation(i,'allocated_amount',v)} disabled={locked}/>
              <Field id={'alloc-payment-amount-'+i} label="折合收款币种金额（自动计算）" value={paymentEquivalent(a).toFixed(2)} onChange={()=>{}} disabled/>
              <Field id={'alloc-date-'+i} label="分配日期" type="date" value={a.allocation_date||dateToday()} onChange={v=>setAllocation(i,'allocation_date',v)} disabled={locked}/>
            </div>
          </div>)}
          {!allocations.length&&<p className="tp-payments__empty">尚未添加分配。保存后可保留为未分配预收款。</p>}
          <div className="tp-payments__amount-strip"><div><span>已分配合计</span><strong>{money(allocatedSum,payment.currency)}</strong></div><div><span>未分配余额</span><strong>{money(remaining,payment.currency)}</strong></div><div><span>核销状态</span><strong>{allocatedSum<=0?'未核销':remaining>0?'部分核销':'已核销'}</strong></div></div>
          <h2>核销与差异处理</h2><div className="tp-payments__form-grid">
            <Field id="pay-diff-amount" label="差异金额（自动计算）" value={Math.abs(computedDiff).toFixed(2)} onChange={()=>{}} disabled/>
            <Field id="pay-diff-type" label="差异类型（自动计算）" value={computedDiffType} onChange={()=>{}} disabled/>
            <Pick id="pay-diff-reason" label="差异原因" value={payment.diff_reason} onChange={v=>set('diff_reason',v)} options={['银行手续费','汇率波动','客户扣款','议价折让','少付待补','多付待退','其他']} disabled={locked}/>
            <Pick id="pay-diff-handling" label="差异处理" value={payment.diff_handling} onChange={v=>set('diff_handling',v)} options={['计入手续费','计入汇兑损益','保留为应收待补','转预收','退款','折让冲销','坏账核销']} disabled={locked}/>
            <div className="tp-payments__field-wide"><TextArea id="pay-diff-note" labelText="差异说明" rows={3} value={payment.diff_note||''} onChange={e=>set('diff_note',e.currentTarget.value)} disabled={locked}/></div>
          </div>
        </div></TabPanel>
        <TabPanel><div className="tp-payments__tab-content">
          <h2>银行对账</h2><div className="tp-payments__form-grid">
            <Pick id="pay-bank-reconciled" label="已与银行对账" value={payment.bank_reconciled?'是':'否'} onChange={v=>set('bank_reconciled',v==='是')} options={['否','是']} disabled={readOnly||payment.bank_reconciled}/>
            <Field id="pay-statement-date" label="对账日期" type="date" value={payment.statement_date} onChange={v=>set('statement_date',v)} disabled={readOnly||payment.bank_reconciled}/>
            <Field id="pay-statement-ref" label="对账单据号" value={payment.statement_ref} onChange={v=>set('statement_ref',v)} disabled={readOnly||payment.bank_reconciled}/>
            <Field id="pay-void-reason" label="作废原因" value={payment.void_reason} onChange={v=>set('void_reason',v)} disabled={locked}/>
          </div>
          {payment.payment_type==='refund'&&<><h2>退款 / 红冲</h2><div className="tp-payments__form-grid">
            <Pick id="pay-original" label="原收款记录" value={payment.original_payment_id} onChange={v=>{set('original_payment_id',v);set('refund_shipped_confirmed',false)}} options={payments.filter(r=>r.payment_type==='receipt'&&r.account_id===payment.account_id&&!['voided','returned'].includes(r.status)).map(r=>({value:r.id,label:r.payment_no+' · '+money(r.net_received,r.currency)}))} disabled={locked}/>
            <Pick id="pay-refund-reason" label="退款原因" value={payment.refund_reason} onChange={v=>set('refund_reason',v)} options={['多付','订单取消','质量索赔','重复付款','其他']} disabled={locked}/>
            <Field id="pay-refund-amount" label={'退款金额（可退余额 '+money(refundAvailable,payment.currency)+'）'} type="number" value={payment.refund_amount} onChange={v=>{set('refund_amount',v);set('amount',v);set('net_received',v)}} disabled={locked}/>
            <Field id="pay-refund-date" label="退款日期" type="date" value={payment.refund_date} onChange={v=>set('refund_date',v)} disabled={locked}/>
            <Field id="pay-refund-bank-ref" label="退款流水号" value={payment.refund_bank_ref} onChange={v=>set('refund_bank_ref',v)} disabled={locked}/>
            {shippedRefundOrders.length>0&&<div className="tp-payments__field-wide"><InlineNotification kind="warning" title="退款涉及已发运订单" subtitle={'关联 '+shippedRefundOrders.length+' 个已发运订单。退款将回滚订单已收金额，并可能重新触发发货冻结。'}/><Pick id="pay-refund-shipped-confirm" label="我已完成二次确认" value={payment.refund_shipped_confirmed?'是':'否'} onChange={v=>set('refund_shipped_confirmed',v==='是')} options={['否','是']} disabled={locked}/></div>}
          </div></>}
          <h2>确认记录</h2><div className="tp-payments__status-grid"><div><span>确认人</span><strong>{payment.confirmed_by||'待确认'}</strong></div><div><span>确认时间</span><strong>{payment.confirmed_at?new Date(payment.confirmed_at).toLocaleString():'—'}</strong></div><div><span>来源</span><strong>{payment.source==='manual'?'手动录入':payment.source==='import'?'导入':'银行账单匹配'}</strong></div></div>
        </div></TabPanel>
        <TabPanel><div className="tp-payments__tab-content">
          <h2>备注与附件</h2><div className="tp-payments__form-grid">
            <div className="tp-payments__field-wide"><TextArea id="pay-remarks" labelText="内部备注（不会进入对客收款确认函）" rows={4} value={payment.remarks_internal||''} onChange={e=>set('remarks_internal',e.currentTarget.value)} disabled={locked}/></div>
            <div className="tp-payments__field-wide"><span className="tp-payments__upload-label">附件（L/C 副本、客户汇款通知等）</span><div className="tp-payments__upload-row"><FileUploaderButton accept={['.pdf','.jpg','.jpeg','.png','.webp']} buttonKind="tertiary" labelText="上传附件" multiple disabled={readOnly} onChange={e=>void uploadFiles(e,'attachments')}/>{(payment.attachments||[]).map((path:string,i:number)=><Button key={path} kind="ghost" size="sm" className="tp-payments__file-link" onClick={()=>void openStoredFile(path)}>附件 {i+1} · 打开</Button>)}</div></div>
            <Pick id="pay-receipt-sent" label="已发送收款确认给客户" value={payment.receipt_sent?'是':'否'} onChange={v=>set('receipt_sent',v==='是')} options={['否','是']} disabled={readOnly}/>
            <Field id="pay-receipt-sent-at" label="确认函发送时间" value={payment.receipt_sent_at||''} onChange={v=>set('receipt_sent_at',v)} disabled={readOnly}/>
          </div>
          <p className="tp-payments__hint">内部备注、汇兑损益与差异处理方式仅供内部使用，不会写入对客收款确认函。</p>
        </div></TabPanel>
      </TabPanels></Tabs>
      <div className="tp-payments__footer"><span>草稿可修改；确认后金额、币种、账户与日期锁定。已对账记录不可直接作废。</span><div><Button kind="ghost" onClick={()=>setActiveTab(Math.max(0,activeTab-1))} disabled={activeTab===0}>上一步</Button><Button kind="tertiary" onClick={()=>setActiveTab(Math.min(3,activeTab+1))} disabled={activeTab===3}>下一步</Button>{!readOnly&&!locked&&saving&&<InlineLoading status="active" description="正在保存收款记录…"/>}{!readOnly&&!locked&&<Button kind="primary" onClick={()=>void save()} disabled={saving}>保存草稿</Button>}</div></div>
    </section>
  </main>;
}


export function PaymentAllocationPage() {
  const nav=useNavigate();const {id}=useParams();
  const [payment,setPayment]=useState<AnyRow|null>(null);const [orders,setOrders]=useState<AnyRow[]>([]);
  const [allocations,setAllocations]=useState<AnyRow[]>([emptyAllocation()]);
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{(async()=>{try{const db=await getSupabaseClient();const [p,o]=await Promise.all([
    db.from('trade_payments').select('*').eq('id',id).single(),
    db.from('trade_orders').select('*').eq('order_type','sales').order('created_at',{ascending:false}).range(0,2999)
  ]);if(p.error)throw p.error;if(o.error)throw o.error;setPayment(p.data);setOrders(o.data||[]);}catch(e){setError(e instanceof Error?e.message:'加载预收款失败');}finally{setLoading(false);}})()},[id]);
  const eligibleOrders=orders.filter(o=>o.crm_account_id===payment?.account_id&&isAllocatableOrder(o)&&(!o.metadata?.sales_order?.form?.bank_account_id||o.metadata.sales_order.form.bank_account_id===payment?.bank_account_id));
  const equivalent=(a:AnyRow)=>{const order=orders.find(o=>o.id===a.order_id);const orderRate=Number(order?.metadata?.sales_order?.form?.exchange_rate||1);const paymentRate=Number(payment?.exchange_rate||1);return paymentRate>0?Number(a.allocated_amount||0)*orderRate/paymentRate:0;};
  const total=allocations.reduce((sum,a)=>sum+equivalent(a),0);
  const setRow=(index:number,key:string,value:string)=>setAllocations(prev=>prev.map((a,i)=>i===index?{...a,[key]:value,...(key==='order_id'?{schedule_node_id:''}:{})}:a));
  const addRow=()=>setAllocations(prev=>[...prev,emptyAllocation()]);
  const removeRow=(index:number)=>setAllocations(prev=>prev.filter((_,i)=>i!==index));
  const nodesFor=(orderId:string):AnyRow[]=>scheduleOf(orders.find(o=>o.id===orderId));
  const save=async()=>{
    setError('');
    if(!payment||!id)return;
    if(!allocations.length){setError('至少添加一条分配记录。');return;}
    const seen=new Set<string>();
    for(const a of allocations){
      if(!a.order_id||!a.schedule_node_id||!(Number(a.allocated_amount)>0)||!(equivalent(a)>0)){setError('每条分配必须选择订单、收款节点并填写有效金额。');return;}
      const order=orders.find(o=>o.id===a.order_id);const node=nodesFor(a.order_id).find((n:AnyRow)=>String(n.id)===String(a.schedule_node_id));
      if(!order||!isAllocatableOrder(order)){setError('只能分配给已确认及之后状态的订单。');return;}
      const outstanding=Math.max(0,Number(node?.amount||0)-Number(node?.paid_amount||0)-Number(node?.writeoff_amount||0));
      if(Number(a.allocated_amount)>outstanding+0.000001){setError('分配金额超过该收款节点未收余额。');return;}
      const key=a.order_id+'|'+a.schedule_node_id;if(seen.has(key)){setError('同一收款节点不能重复分配。');return;}seen.add(key);
    }
    if(total>Number(payment.unallocated_amount||0)+0.000001){setError('分配总额超过当前未分配余额。');return;}
    setSaving(true);
    try{
      const db=await getSupabaseClient();
      const payload=allocations.map(a=>({order_id:a.order_id,schedule_node_id:a.schedule_node_id,allocation_type:a.allocation_type,allocated_amount:Number(a.allocated_amount),allocated_amount_in_payment:equivalent(a),allocation_date:a.allocation_date||dateToday()}));
      const {error:e}=await db.rpc('allocate_confirmed_trade_payment',{p_payment_id:id,p_allocations:payload});
      if(e)throw e;nav('/payments/'+id,{replace:true});
    }catch(e){setError(e instanceof Error?e.message:'分配预收款失败');}
    finally{setSaving(false);}
  };
  if(!payment)return <main className="tp-payments"><InlineNotification kind="error" title="收款记录不存在" subtitle={error||'无法读取该收款记录。'}/></main>;
  if (loading) return <PageSkeleton className="tp-payments" layout={[
  pageSkeletonHeader('tp-payments__header', 'tp-responsive-header-actions'),
  pageSkeletonPanel('tp-payments__panel', '8rem', '12rem'),
  { type: 'group', direction: 'column', gap: 'var(--cds-spacing-04)', className: 'tp-payments__panel', children: [
    { type: 'text', heading: true, width: '12rem' },
    { type: 'group', direction: 'grid', columns: 3, gap: 'var(--cds-spacing-04)', children: Array.from({ length: 3 }, () => ({ type: 'placeholder' as const, height: '2.5rem' })) },
    { type: 'table', columns: 7, rows: 6 },
  ] },
]} />;
  return <main className="tp-payments">
    <header className="tp-payments__header"><div><p className="tp-payments__eyebrow">TRADEPILOT / FINANCE / PREPAYMENT ALLOCATION</p><h1>分配预收余额</h1><p>{payment.payment_no} · {payment.currency} · {payment.status==='confirmed'?'已确认':'部分核销'}</p></div><div className="tp-payments__actions"><Link href={'/payments/'+id}>返回收款记录</Link><Button kind="primary" onClick={()=>void save()} disabled={saving||total<=0||total>Number(payment.unallocated_amount||0)}>确认分配</Button></div></header>
    {error&&<InlineNotification kind="error" title="分配未完成" subtitle={error}/>}
    <section className="tp-payments__amount-strip"><div><span>客户</span><strong>{payment.payer_name}</strong></div><div><span>未分配余额</span><strong>{money(Number(payment.unallocated_amount||0),payment.currency)}</strong></div><div><span>本次分配</span><strong>{money(total,payment.currency)}</strong></div><div><span>分配后余额</span><strong>{money(Math.max(0,Number(payment.unallocated_amount||0)-total),payment.currency)}</strong></div></section>
    <section className="tp-payments__panel"><div className="tp-payments__panel-head"><div><h2>订单与收款节点</h2><p>仅可选择同一客户已确认及之后状态的订单；金额折算使用订单汇率与本次收款汇率。</p></div><Button kind="tertiary" onClick={addRow}><CarbonIcons.Add/>添加分配</Button></div>
      {allocations.map((a,i)=><div className="tp-payments__allocation" key={i}><div className="tp-payments__allocation-head"><strong>分配 {i+1}</strong><Button kind="ghost" size="sm" onClick={()=>removeRow(i)}>移除</Button></div><div className="tp-payments__form-grid">
        <Pick id={'prepay-order-'+i} label="订单" value={a.order_id} onChange={v=>setRow(i,'order_id',v)} options={eligibleOrders.map(o=>({value:o.id,label:o.order_number+' · '+o.title}))}/>
        <Pick id={'prepay-node-'+i} label="收款节点" value={a.schedule_node_id} onChange={v=>setRow(i,'schedule_node_id',v)} options={nodesFor(a.order_id).map((n:AnyRow)=>({value:String(n.id),label:(n.milestone||'收款节点')+' · '+money(Math.max(0,Number(n.amount||0)-Number(n.paid_amount||0)-Number(n.writeoff_amount||0)),orders.find(o=>o.id===a.order_id)?.currency_code||'USD')+' 待收'}))}/>
        <Pick id={'prepay-type-'+i} label="分配类型" value={a.allocation_type} onChange={v=>setRow(i,'allocation_type',v)} options={ALLOCATION_TYPES}/>
        <Field id={'prepay-amount-'+i} label="分配金额（订单币种）" type="number" value={a.allocated_amount} onChange={v=>setRow(i,'allocated_amount',v)}/>
        <Field id={'prepay-equivalent-'+i} label="折合收款币种金额（自动计算）" value={equivalent(a).toFixed(2)} onChange={()=>{}} disabled/>
        <Field id={'prepay-date-'+i} label="分配日期" type="date" value={a.allocation_date||dateToday()} onChange={v=>setRow(i,'allocation_date',v)}/>
      </div></div>)}
      <div className="tp-payments__footer"><span>确认后会回写订单收款计划；定金节点收齐时自动解除发货冻结。</span><div><Link href={'/payments/'+id}>取消</Link>{saving && <InlineLoading status="active" description="正在处理…" />}<Button kind="primary" onClick={()=>void save()} disabled={saving||total<=0||total>Number(payment.unallocated_amount||0)}>确认分配</Button></div></div>
    </section>
  </main>;
}

export function PaymentDetailPage() { return <PaymentFormPage readOnly/>; }
