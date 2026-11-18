import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Link, ClickableTile, InlineLoading, InlineNotification, Tag, Tile, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/documents.scss';

type RecentDocument = { id:string; document_number:string; title:string; document_type:string; status:string; created_at:string };
const groups = [
  { id:'transaction', title:'交易单据', description:'报价、成交确认与合同文件', icon:CarbonIcons.Document, items:[
    {type:'quotation',label:'报价单',detail:'商业报价与有效期'},
    {type:'proforma_invoice',label:'形式发票（PI）',detail:'预付款与开证依据'},
    {type:'sales_contract',label:'销售合同',detail:'交易条款与双方义务'},
  ]},
  { id:'commercial', title:'商业单据', description:'结算、报关与货物明细文件', icon:CarbonIcons.DocumentTasks, items:[
    {type:'commercial_invoice',label:'商业发票',detail:'按实际发运数量计价'},
    {type:'packing_list',label:'装箱单',detail:'包装、件数、重量与体积'},
  ]},
  { id:'logistics', title:'物流单据', description:'发运安排与承运操作文件', icon:CarbonIcons.Delivery, items:[
    {type:'shipping_instructions',label:'装运指示',detail:'收发货与运输指示'},
    {type:'bill_of_lading',label:'提单资料',detail:'即将开放',disabled:true},
    {type:'certificate_of_origin',label:'原产地证明',detail:'即将开放',disabled:true},
  ]},
  { id:'other', title:'其他外贸单据', description:'按贸易场景持续扩展', icon:CarbonIcons.Folder, items:[
    {type:'purchase_order',label:'采购订单（PO）',detail:'即将开放',disabled:true},
    {type:'origin_declaration',label:'原产地声明',detail:'即将开放',disabled:true},
    {type:'inspection_certificate',label:'检验证书',detail:'即将开放',disabled:true},
  ]},
];
const typeNames:Record<string,string> = {quotation:'报价单',proforma_invoice:'形式发票（PI）',sales_contract:'销售合同',commercial_invoice:'商业发票',packing_list:'装箱单',shipping_instructions:'装运指示'};
export function DocumentsCenterPage(){
 const navigate=useNavigate();
 const [recent,setRecent]=useState<RecentDocument[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;void(async()=>{try{const db=await getSupabaseClient();const {data:{session}}=await db.auth.getSession();if(!session?.user.id)throw new Error('登录状态已失效，请重新登录。');const {data,error:queryError}=await db.from('trade_documents').select('id,document_number,title,document_type,status,created_at').eq('owner_id',session.user.id).order('created_at',{ascending:false}).limit(6);if(queryError)throw queryError;if(active)setRecent((data??[]) as RecentDocument[]);}catch(cause){if(active)setError(cause instanceof Error?cause.message:'最近单据读取失败。');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[]);
 const openStudio=(type?:string,mode?:string)=>navigate('/documents/studio'+(type?'?document_type='+encodeURIComponent(type)+(mode?'&mode='+mode:''):mode?'?mode='+mode:''));
 return <main className="tp-documents tp-document-home">
  <header className="tp-documents__header"><div><p className="tp-documents__eyebrow">TRADE OPERATIONS / DOCUMENT STUDIO</p><h1>外贸单据智能制作中心</h1><p>Trade Document Studio · 从业务数据生成专业外贸单据，并自由设计、管理和复用模板。</p></div><div className="tp-documents__actions"><Link href="/documents/studio?mode=instant" renderIcon={CarbonIcons.Add}>即时单据</Link><Link href="/documents/templates" renderIcon={CarbonIcons.Template}>模板中心</Link></div></header>
  {error&&<InlineNotification kind="warning" lowContrast title="部分内容未能加载" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  <section className="tp-document-home__quick">
   <Tile className="tp-document-home__quick-tile"><div className="tp-document-home__quick-icon"><CarbonIcons.Edit size={24}/></div><div><h2>自由设计制作</h2><p>从业务订单或发运批次载入数据，进入自由画布编辑器。</p></div><Link href="/documents/studio" renderIcon={CarbonIcons.ArrowRight}>进入工作台</Link></Tile>
   <Tile className="tp-document-home__quick-tile"><div className="tp-document-home__quick-icon"><CarbonIcons.Template size={24}/></div><div><h2>模板中心</h2><p>管理官方预设、个人模板、企业品牌版式和模板版本。</p></div><Link href="/documents/templates" renderIcon={CarbonIcons.ArrowRight}>管理模板</Link></Tile>
   <Tile className="tp-document-home__quick-tile"><div className="tp-document-home__quick-icon"><CarbonIcons.Building size={24}/></div><div><h2>企业信息配置</h2><p>读取设置中的企业主档和收款账户，支持修改并供单据自动调用。</p></div><Link href="/documents/company-profile" renderIcon={CarbonIcons.ArrowRight}>配置企业信息</Link></Tile>
   <Tile className="tp-document-home__quick-tile"><div className="tp-document-home__quick-icon"><CarbonIcons.DocumentMultiple_01 size={24}/></div><div><h2>已生成单据</h2><p>查看草稿、已签发文件及历史版本。</p></div><Link href="/documents/generated" renderIcon={CarbonIcons.ArrowRight}>查看单据</Link></Tile>
  </section>
  <section className="tp-document-home__section"><div className="tp-document-home__section-head"><div><h2>按单据类型制作</h2><p>选择目标单据，随后选择业务来源，系统会自动载入对应业务数据。</p></div><Tag type="blue">6 种首期单据</Tag></div>
   <div className="tp-document-home__groups">{groups.map(group=><section className="tp-document-home__group" key={group.id}><div className="tp-document-home__group-head"><group.icon size={20}/><div><h3>{group.title}</h3><p>{group.description}</p></div></div><div className="tp-document-home__entries">{group.items.map(item=><ClickableTile key={item.type} className="tp-document-home__entry" disabled={Boolean(item.disabled)} onClick={()=>openStudio(item.type)}><span><strong>{item.label}</strong><small>{item.detail}</small></span>{item.disabled?<Tag type="cool-gray">即将开放</Tag>:<CarbonIcons.ArrowRight size={16}/>}</ClickableTile>)}</div></section>)}</div>
  </section>
  <section className="tp-document-home__section"><div className="tp-document-home__section-head"><div><h2>最近使用</h2><p>继续处理最近创建或编辑的单据。</p></div><Link href="/documents/generated">查看全部</Link></div>
   {loading?<InlineLoading description="正在读取最近单据…"/>:recent.length?<div className="tp-document-home__recent">{recent.map(doc=><ClickableTile className="tp-document-home__recent-row" key={doc.id} onClick={()=>navigate('/documents/'+doc.id)}><CarbonIcons.Document size={20}/><span><strong>{doc.document_number}</strong><small>{typeNames[doc.document_type]??doc.document_type} · {doc.title}</small></span><Tag type={doc.status==='issued'?'green':'blue'}>{doc.status}</Tag><span className="tp-document-home__date">{new Date(doc.created_at).toLocaleDateString()}</span><CarbonIcons.ChevronRight size={16}/></ClickableTile>)}</div>:<div className="tp-documents__empty"><p>暂无已制作单据。选择上方单据类型，或从即时单据开始。</p><Link href="/documents/studio?mode=instant" renderIcon={CarbonIcons.ArrowRight}>创建第一份单据</Link></div>}
  </section>
 </main>;
}
