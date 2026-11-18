import { PageSkeleton } from '@/design-system';
import { cloneElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion, AccordionItem, Button, Link, Checkbox, ComboBox, InlineLoading, InlineNotification, Modal, MultiSelect, DateField, DateTimeField,
  Select, SelectItem, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, TextArea, TextInput, Tile, FileUploader, LineChart, ScaleTypes,
  CarbonIcons, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, BusinessLifecycle, WorldMapChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { useCrmSettingOptions } from '../settings/CrmDomainSettings';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/contacts.scss';
import '@/design-system/patterns/responsive-actions.scss';

type Account = { id: string; account_name: string; country_code?: string | null; city?: string | null; timezone?: string | null; account_manager?: string | null };
type ContactMethod = { id?: string; method_type: string; platform: string; value: string; label: string; is_primary: boolean; is_verified: boolean };
type ContactRow = {
  id: string; account_id: string; first_name: string; last_name: string | null; full_name: string | null;
  job_title: string | null; department: string | null; email: string | null; phone: string | null;
  mobile: string | null; whatsapp: string | null; linkedin_url: string | null; preferred_language: string | null; timezone?: string | null; preferred_channel?: string | null;
  contact_type: string; decision_role: string | null; is_primary: boolean; is_active: boolean; notes: string | null;
  custom_fields: Record<string, any> | null; created_at: string; updated_at: string; do_not_contact?: boolean; phone_extension?: string | null; title?: string | null; contact_role?: string | null;
  crm_accounts?: { account_name: string; country_code?: string | null } | null;
};
type FormState = {
  salutation: string; firstName: string; lastName: string; displayName: string; avatarUrl: string; gender: string; status: string;
  accountId: string; isPrimary: boolean; roles: string[]; title: string; department: string; managerId: string;
  employmentStart: string; employmentEnd: string; email: string; mobile: string; phone: string; extension: string; whatsapp: string; fax: string;
  extraEmails: ContactMethod[]; extraPhones: ContactMethod[]; social: ContactMethod[];
  addressMode: string; country: string; state: string; city: string; street: string; postalCode: string;
  language: string; timezone: string; preferredChannel: string; bestTime: string; birthday: string; importantDays: string; communicationNotes: string;
  owner: string; source: string; sourceLeadId: string; firstContactAt: string; tags: string;
  doNotContact: boolean; marketingConsent: string; consentAt: string; consentMethod: string; dataSource: string; unsubscribedAt: string;
  activity: Record<string, string>; notes: string; internalNotes: string; customFields: string; createdMethod: string;
};
const emptyForm: FormState = {
  salutation:'', firstName:'', lastName:'', displayName:'', avatarUrl:'', gender:'', status:'active', accountId:'', isPrimary:false, roles:[],
  title:'', department:'', managerId:'', employmentStart:'', employmentEnd:'', email:'', mobile:'', phone:'', extension:'', whatsapp:'', fax:'',
  extraEmails:[], extraPhones:[], social:[], addressMode:'inherit', country:'', state:'', city:'', street:'', postalCode:'',
  language:'', timezone:'', preferredChannel:'email', bestTime:'', birthday:'', importantDays:'', communicationNotes:'',
  owner:'', source:'manual', sourceLeadId:'', firstContactAt:'', tags:'', doNotContact:false, marketingConsent:'unknown',
  consentAt:'', consentMethod:'', dataSource:'', unsubscribedAt:'',
  activity:{lastContactAt:'',lastReplyAt:'',contactCount:'0',opportunityCount:'0',orderCount:'0',lastEmailOpen:'',lastEmailClick:''},
  notes:'', internalNotes:'', customFields:'', createdMethod:'manual',
};
const methodKinds = [{id:'work',text:'工作'},{id:'personal',text:'个人'},{id:'other',text:'其他'}];
const field = (label:string, child:import('react').ReactElement<any>, required=false) => <div className="tp-contacts__field"><label className="tp-contacts__label" htmlFor={child.props.id}>{label}{required&&<span> *</span>}</label>{cloneElement(child,{hideLabel:true})}</div>;
const dateInput = (id:string,label:string,value:string,onChange:(v:string)=>void) => <DateField id={id} label={label} value={value} onChange={onChange} />;
const makeMethod = (method_type:string, platform=''):ContactMethod => ({method_type,platform,value:'',label:'work',is_primary:false,is_verified:false});
const asString = (value:unknown) => typeof value === 'string' ? value : '';
function fromRow(row:ContactRow, methods:ContactMethod[]):FormState {
  const c = row.custom_fields ?? {};
  const extraEmails = methods.filter(x=>x.method_type==='email');
  const extraPhones = methods.filter(x=>['phone','mobile','messaging'].includes(x.method_type));
  const social = methods.filter(x=>x.method_type==='social');
  return {
    ...emptyForm, salutation:asString(c.salutation), firstName:row.first_name??'', lastName:row.last_name??'',
    displayName:row.full_name??'', avatarUrl:asString(c.avatarUrl), gender:asString(c.gender), status:asString(c.status)||(row.is_active?'active':'inactive'),
    accountId:row.account_id, isPrimary:row.is_primary, roles:Array.isArray(c.roles)?c.roles:row.contact_role?[row.contact_role]:[],
    title:row.job_title??row.title??'', department:row.department??'', managerId:asString(c.managerId),
    employmentStart:asString(c.employmentStart), employmentEnd:asString(c.employmentEnd),
    email:row.email??'', mobile:row.mobile??'', phone:row.phone??'', extension:asString(row.phone_extension), whatsapp:row.whatsapp??'', fax:asString(c.fax),
    extraEmails,extraPhones,social,addressMode:asString(c.addressMode)||'inherit',country:asString(c.country),state:asString(c.state),city:asString(c.city),street:asString(c.street),postalCode:asString(c.postalCode),
    language:row.preferred_language??'',timezone:row.timezone??'',preferredChannel:row.preferred_channel??'email',bestTime:asString(c.bestTime),birthday:asString(c.birthday),importantDays:asString(c.importantDays),communicationNotes:asString(c.communicationNotes),
    owner:asString(c.owner),source:asString(c.source)||'manual',sourceLeadId:asString(c.sourceLeadId),firstContactAt:asString(c.firstContactAt),tags:Array.isArray(c.tags)?c.tags.join(', '):'',
    doNotContact:row.do_not_contact??false,marketingConsent:asString(c.marketingConsent)||'unknown',consentAt:asString(c.consentAt),consentMethod:asString(c.consentMethod),dataSource:asString(c.dataSource),unsubscribedAt:asString(c.unsubscribedAt),
    activity:{...emptyForm.activity,...(c.activity??{})},notes:row.notes??'',internalNotes:asString(c.internalNotes),customFields:JSON.stringify(c.customFields??{},null,2),createdMethod:asString(c.createdMethod)||'manual',
  };
}
function MethodRows({title,items,onChange,methodType}:{title:string;items:ContactMethod[];onChange:(v:ContactMethod[])=>void;methodType:string}) {
  return <div className="tp-contacts__repeat"><div className="tp-contacts__repeat-head"><h3>{title}</h3><Button kind="ghost" size="sm" onClick={()=>onChange([...items,makeMethod(methodType)])}><CarbonIcons.Add size={16}/>添加</Button></div>
    {items.map((item,index)=><div className="tp-contacts__repeat-row" key={item.id??index}>
      <TextInput id={title+'-'+index} labelText={title} hideLabel value={item.value} placeholder="输入内容" onChange={e=>onChange(items.map((x,i)=>i===index?{...x,value:e.currentTarget.value}:x))}/>
      <Select id={title+'-kind-'+index} labelText="类型" hideLabel value={item.label} onChange={e=>onChange(items.map((x,i)=>i===index?{...x,label:e.currentTarget.value}:x))}>{methodKinds.map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>
      <Checkbox id={title+'-primary-'+index} labelText="首选" checked={item.is_primary} onChange={(_,d)=>onChange(items.map((x,i)=>i===index?{...x,is_primary:d.checked}:x))}/>
      <Button kind="ghost" size="sm" onClick={()=>onChange(items.filter((_,i)=>i!==index))}>移除</Button>
    </div>)}
    {!items.length&&<p className="tp-contacts__muted">暂无附加记录。</p>}
  </div>;
}
function SocialRows({items,onChange,platforms}:{items:ContactMethod[];onChange:(v:ContactMethod[])=>void;platforms:string[]}) {
  return <div className="tp-contacts__repeat"><div className="tp-contacts__repeat-head"><h3>社交账号</h3><Button kind="ghost" size="sm" onClick={()=>onChange([...items,makeMethod('social',platforms[0]??'其他')])}><CarbonIcons.Add size={16}/>添加账号</Button></div>
    {items.map((item,index)=><div className="tp-contacts__social-row" key={item.id??index}>
      <Select id={'social-platform-'+index} labelText="平台" hideLabel value={item.platform} onChange={e=>onChange(items.map((x,i)=>i===index?{...x,platform:e.currentTarget.value}:x))}>{platforms.map(x=><SelectItem key={x} value={x} text={x}/>)}</Select>
      <TextInput id={'social-value-'+index} labelText="账号或链接" hideLabel value={item.value} placeholder="账号名称或 URL" onChange={e=>onChange(items.map((x,i)=>i===index?{...x,value:e.currentTarget.value}:x))}/>
      <Button kind="ghost" size="sm" onClick={()=>onChange(items.filter((_,i)=>i!==index))}>移除</Button>
    </div>)}
    {!items.length&&<p className="tp-contacts__muted">尚未添加社交账号。</p>}
  </div>;
}


const PAGE_SIZE = 15;
type CountryStat = { key: string; label: string; total: number; verified: number; active: number };
type DailyStat = { date: string; count: number };
const GROUP_FIELDS = [
  {id:'country',text:'国家 / 地区'},{id:'account',text:'所属客户'},{id:'status',text:'联系人状态'},
  {id:'role',text:'联系人角色'},{id:'source',text:'联系人来源'},{id:'owner',text:'负责人'},
  {id:'verified',text:'验证状态'},{id:'primary',text:'主联系人类型'},
];
function contactCountry(row:ContactRow) {
  const value = typeof row.custom_fields?.country === 'string' ? row.custom_fields.country.trim() : '';
  return value || row.crm_accounts?.country_code || 'unknown';
}
function countryLabel(value:string) {
  if(value==='unknown') return '未设置国家 / 地区';
  if(value.length===2) {
    try { return new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(value.toUpperCase()) || value; } catch { return value; }
  }
  return value;
}
function groupValue(row:ContactRow, fieldName:string, verifiedIds:Set<string>) {
  const cf=row.custom_fields??{};
  switch(fieldName) {
    case 'country': return countryLabel(contactCountry(row));
    case 'account': return row.crm_accounts?.account_name || '未关联客户';
    case 'status': return row.is_active ? '在职' : (cf.status==='departed'?'已离职':'无效 / 非在职');
    case 'role': return Array.isArray(cf.roles) && cf.roles.length ? cf.roles.join('、') : (row.decision_role || '未设置角色');
    case 'source': return typeof cf.source==='string' ? ({manual:'手动',lead_conversion:'线索转换',import:'导入',business_card:'名片识别',ai_crawl:'AI 抓取'} as Record<string,string>)[cf.source] || cf.source : '未标记来源';
    case 'owner': return typeof cf.owner==='string' && cf.owner ? cf.owner : '未分配负责人';
    case 'verified': return verifiedIds.has(row.id) ? '已验证' : '未验证';
    case 'primary': return row.is_primary ? '主要联系人' : '普通联系人';
    default: return '全部';
  }
}
export function ContactConsolePage() {
  const navigate=useNavigate();
    const [rows,setRows]=useState<ContactRow[]>([]);
  const [countryStats,setCountryStats]=useState<CountryStat[]>([]);
  const [dailyStats,setDailyStats]=useState<DailyStat[]>([]);
  const [verifiedIds,setVerifiedIds]=useState<Set<string>>(new Set());
  const [total,setTotal]=useState(0);
  const [stats,setStats]=useState({total:0,verified:0,new30:0,active:0});
  const [loading,setLoading]=useState(true);
  const [analyticsLoading,setAnalyticsLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const [sourceFilter,setSourceFilter]=useState('all');
  const [primaryFilter,setPrimaryFilter]=useState('all');
  const [page,setPage]=useState(1);
  const [groupBy,setGroupBy]=useState('country');
  const [thenBy,setThenBy]=useState('account');
  const [showGroups,setShowGroups]=useState(true);

  const loadAnalytics=useCallback(async()=>{
    setAnalyticsLoading(true);
    try {
      const client=await getSupabaseClient();
      const now=Date.now();
      const analyticsRows:ContactRow[]=[];
      for(let offset=0;;offset+=1000) {
        const {data,error:e}=await client.from('crm_contacts')
          .select('id,account_id,first_name,last_name,full_name,job_title,department,email,phone,mobile,whatsapp,contact_type,decision_role,is_primary,is_active,custom_fields,created_at,updated_at,crm_accounts(account_name,country_code)')
          .eq('is_archived',false).order('created_at',{ascending:false}).range(offset,offset+999);
        if(e) throw e;
        const batch=(data??[]) as unknown as ContactRow[];
        analyticsRows.push(...batch);
        if(batch.length<1000) break;
      }
      const verified=new Set<string>();
      for(let offset=0;;offset+=1000) {
        const {data,error:e}=await client.from('crm_contact_methods').select('contact_id')
          .eq('is_verified',true).range(offset,offset+999);
        if(e) throw e;
        const batch=data??[];
        batch.forEach((x:any)=>verified.add(x.contact_id));
        if(batch.length<1000) break;
      }
      const active=analyticsRows.filter(x=>x.is_active).length;
      const new30=analyticsRows.filter(x=>new Date(x.created_at).getTime()>=now-30*24*60*60*1000).length;
      setStats({total:analyticsRows.length,verified:analyticsRows.filter(x=>verified.has(x.id)).length,new30,active});
      const dayKey=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
      const dailyMap=new Map<string,number>();
      for(let i=29;i>=0;i--){const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()-i);dailyMap.set(dayKey(day),0);}
      analyticsRows.forEach(row=>{const date=new Date(row.created_at);if(!Number.isNaN(date.getTime())){const key=dayKey(date);if(dailyMap.has(key))dailyMap.set(key,(dailyMap.get(key)??0)+1);}});
      setDailyStats([...dailyMap.entries()].map(([date,count])=>({date,count})));
      setVerifiedIds(verified);
      const countryMap=new Map<string,CountryStat>();
      analyticsRows.forEach(row=>{
        const key=contactCountry(row);
        const current=countryMap.get(key)??{key,label:countryLabel(key),total:0,verified:0,active:0};
        current.total+=1;
        if(verified.has(row.id)) current.verified+=1;
        if(row.is_active) current.active+=1;
        countryMap.set(key,current);
      });
      setCountryStats([...countryMap.values()].sort((a,b)=>b.total-a.total));
    } catch(e) {
      setError(e instanceof Error?e.message:'汇总联系人统计失败');
    } finally { setAnalyticsLoading(false); }
  },[]);

  const loadRows=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const client=await getSupabaseClient();
      let listQuery=client.from('crm_contacts')
        .select('id,account_id,first_name,last_name,full_name,job_title,department,email,phone,mobile,whatsapp,contact_type,decision_role,is_primary,is_active,notes,custom_fields,created_at,updated_at,crm_accounts(account_name,country_code)',{count:'exact'})
        .eq('is_archived',false).order('updated_at',{ascending:false});
      if(statusFilter==='active') listQuery=listQuery.eq('is_active',true);
      if(statusFilter==='inactive') listQuery=listQuery.eq('is_active',false);
      if(primaryFilter==='yes') listQuery=listQuery.eq('is_primary',true);
      if(primaryFilter==='no') listQuery=listQuery.eq('is_primary',false);
      if(sourceFilter!=='all') listQuery=listQuery.eq('custom_fields->>source',sourceFilter);
      const q=query.trim().replace(/[^\p{L}\p{N}\s@+.-]/gu,' ').replace(/\s+/g,' ');
      if(q) listQuery=listQuery.or(['full_name','first_name','last_name','email','phone','mobile','job_title','department'].map(k=>k+'.ilike.%'+q+'%').join(','));
      const from=(page-1)*PAGE_SIZE;
      const {data,error:e,count}=await listQuery.range(from,from+PAGE_SIZE-1);
      if(e) throw e;
      setRows((data??[]) as unknown as ContactRow[]);
      setTotal(count??0);
    } catch(e) {
      setError(e instanceof Error?e.message:'读取联系人失败');
    } finally { setLoading(false); }
  },[page,query,statusFilter,sourceFilter,primaryFilter]);

  useEffect(()=>{void loadAnalytics();},[loadAnalytics]);
  useEffect(()=>{void loadRows();},[loadRows]);
  const grouped=useMemo(()=>{
    const parents=new Map<string,Map<string,ContactRow[]>>();
    rows.forEach(row=>{
      const parent=groupValue(row,groupBy,verifiedIds);
      const child=thenBy==='none'?'全部联系人':groupValue(row,thenBy,verifiedIds);
      if(!parents.has(parent)) parents.set(parent,new Map());
      const children=parents.get(parent)!;
      if(!children.has(child)) children.set(child,[]);
      children.get(child)!.push(row);
    });
    return [...parents.entries()].map(([label,children])=>({label,children:[...children.entries()].map(([childLabel,items])=>({label:childLabel,items}))}));
  },[rows,groupBy,thenBy,verifiedIds]);
  const renderTable=(items:ContactRow[])=><div className="tp-contacts__table-scroll"><Table><TableHead><TableRow><TableHeader>联系人</TableHeader><TableHeader>所属客户</TableHeader><TableHeader>职位 / 部门</TableHeader><TableHeader>主要联系方式</TableHeader><TableHeader>角色</TableHeader><TableHeader>状态</TableHeader><TableHeader>主联系人</TableHeader></TableRow></TableHead><TableBody>{items.map(r=><TableRow key={r.id} onClick={()=>navigate('/contacts/'+r.id)} className="tp-contacts__click-row"><TableCell><strong>{r.full_name||[r.first_name,r.last_name].filter(Boolean).join(' ')||'未命名'}</strong><small>{r.email||'—'}</small></TableCell><TableCell>{r.crm_accounts?.account_name||'—'}</TableCell><TableCell>{r.job_title||'—'}<small>{r.department||''}</small></TableCell><TableCell>{r.email||r.mobile||r.phone||r.whatsapp||'—'}</TableCell><TableCell>{r.decision_role||'—'}</TableCell><TableCell><Tag type={r.is_active?'green':'cool-gray'}>{r.is_active?'在职':'非在职'}</Tag></TableCell><TableCell>{r.is_primary?'是':'—'}</TableCell></TableRow>)}</TableBody></Table></div>;
  const countryMapData=countryStats.filter(item=>item.key!=='unknown').map(item=>({code:item.key,label:item.label,value:item.total,detail:'已验证 '+item.verified+' · 在职 '+item.active}));
  const dailyChartData=dailyStats.map(item=>({group:'每日新增',date:new Date(item.date+'T00:00:00'),value:item.count}));
  const dailyChartOptions={theme:document.documentElement.dataset.carbonTheme==='g100'?'g100':'white',title:'每日新增联系人',axes:{bottom:{title:'日期',mapsTo:'date',scaleType:ScaleTypes.TIME},left:{title:'新增联系人',mapsTo:'value',scaleType:ScaleTypes.LINEAR}},curve:'curveMonotoneX',points:{enabled:true},legend:{enabled:false},toolbar:{enabled:false},height:'280px'} as const;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const start=total===0?0:(page-1)*PAGE_SIZE+1;
  const end=Math.min(page*PAGE_SIZE,total);
  const refresh=()=>{void Promise.all([loadAnalytics(),loadRows()]);};
  if (loading) return <PageSkeleton variant="table" />;
  return <main className="tp-contacts">
    <header className="tp-contacts__header"><div><p className="tp-contacts__eyebrow">TRADEPILOT / CRM</p><h1>联系人（Contact）</h1><p>管理客户组织中的联系人及其关系、联系方式与沟通偏好。</p></div><div className="tp-contacts__actions"><Button kind="tertiary" onClick={refresh} disabled={loading||analyticsLoading}><CarbonIcons.Renew size={16}/>刷新</Button><Link href="/contacts/new" renderIcon={CarbonIcons.Add}>创建联系人</Link></div></header>
    {error&&<InlineNotification kind="error" title="联系人读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <section className="tp-contacts__stats">
      {[
        {label:'全部联系人',value:stats.total,description:'总记录',icon:<CarbonIcons.UserMultiple size={24}/>,tone:'all'},
        {label:'已验证联系人',value:stats.verified,description:'至少一项联系方式已验证',icon:<CarbonIcons.CheckmarkFilled size={24}/>,tone:'verified'},
        {label:'近 30 天新增',value:stats.new30,description:'按创建时间统计',icon:<CarbonIcons.Calendar size={24}/>,tone:'new'},
        {label:'在职联系人',value:stats.active,description:'当前在职',icon:<CarbonIcons.User size={24}/>,tone:'active'},
      ].map(card=><Tile key={card.label} className="tp-contacts__stat-tile"><div className="tp-contacts__stat-top"><span>{card.label}</span><span className="tp-contacts__stat-icon" aria-hidden="true">{card.icon}</span></div><strong>{card.value.toLocaleString()}</strong><small>{card.description}</small></Tile>)}
    </section>
    <section className="tp-contacts__country-panel">
        <div className="tp-contacts__section-head"><div><h2 className="tp-contacts__heading"><CarbonIcons.Globe size={20} aria-hidden="true"/><span>全球联系人分布</span></h2><p>按联系人国家 / 地区汇总；悬停地图可查看已验证联系方式和在职人数。</p></div></div>
        {analyticsLoading&&!countryStats.length?<InlineLoading description="正在汇总国家 / 地区…" />:countryMapData.length?<WorldMapChart data={countryMapData} unitLabel="位联系人"/>:<p className="tp-contacts__empty">暂无可用于统计的联系人国家 / 地区数据。</p>}
    </section>
    <section className="tp-contacts__daily-panel">
      <div className="tp-contacts__section-head"><div><h2 className="tp-contacts__heading"><CarbonIcons.ChartLine size={20} aria-hidden="true"/><span>每日新增</span></h2><p>按联系人创建时间统计最近 30 天每日新增数量。</p></div></div>
      {analyticsLoading&&!dailyStats.length?<InlineLoading description="正在汇总每日新增…" />:dailyStats.some(item=>item.count>0)?<LineChart data={dailyChartData} options={dailyChartOptions}/>:<p className="tp-contacts__empty">最近 30 天暂无新增联系人记录。</p>}
    </section>
    <section className="tp-contacts__list-panel">
      <div className="tp-contacts__list-head"><div><h2 className="tp-contacts__heading"><CarbonIcons.UserMultiple size={20} aria-hidden="true"/><span>联系人列表</span></h2><p>当前筛选共 {total.toLocaleString()} 条记录；每页最多 {PAGE_SIZE} 条。</p></div><div className="tp-contacts__search"><TextInput id="contacts-search" labelText="搜索联系人" placeholder="姓名、职位、邮箱或电话" value={query} onChange={e=>{setQuery(e.currentTarget.value);setPage(1);}}/></div></div>
      <div className="tp-contacts__filters">
        <Select id="contacts-status-filter" labelText="状态筛选" value={statusFilter} onChange={e=>{setStatusFilter(e.currentTarget.value);setPage(1);}}><SelectItem value="all" text="全部状态"/><SelectItem value="active" text="在职"/><SelectItem value="inactive" text="非在职"/></Select>
        <Select id="contacts-source-filter" labelText="来源筛选" value={sourceFilter} onChange={e=>{setSourceFilter(e.currentTarget.value);setPage(1);}}><SelectItem value="all" text="全部来源"/><SelectItem value="manual" text="手动"/><SelectItem value="lead_conversion" text="线索转换"/><SelectItem value="import" text="导入"/><SelectItem value="business_card" text="名片识别"/><SelectItem value="ai_crawl" text="AI 抓取"/></Select>
        <Select id="contacts-primary-filter" labelText="主联系人筛选" value={primaryFilter} onChange={e=>{setPrimaryFilter(e.currentTarget.value);setPage(1);}}><SelectItem value="all" text="全部联系人"/><SelectItem value="yes" text="主要联系人"/><SelectItem value="no" text="普通联系人"/></Select>
        <Select id="contacts-group-primary" labelText="一级分组" value={groupBy} onChange={e=>{const next=e.currentTarget.value;setGroupBy(next);if(next===thenBy)setThenBy('none');}}>{GROUP_FIELDS.map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>
        <Select id="contacts-group-secondary" labelText="二级分组" value={thenBy} onChange={e=>setThenBy(e.currentTarget.value)}><SelectItem value="none" text="不使用二级分组"/>{GROUP_FIELDS.filter(x=>x.id!==groupBy).map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>
      </div>
      <div className="tp-contacts__group-toolbar"><span>分组视图 · 一级：{GROUP_FIELDS.find(x=>x.id===groupBy)?.text} · 二级：{thenBy==='none'?'关闭':GROUP_FIELDS.find(x=>x.id===thenBy)?.text}</span><Button kind="ghost" size="sm" onClick={()=>setShowGroups(v=>!v)}>{showGroups?'切换为平铺列表':'恢复分组视图'}</Button></div>
      {loading?<InlineLoading description="正在读取联系人…" />:rows.length?showGroups?<Accordion>{grouped.map(group=><AccordionItem key={group.label} title={group.label+' · '+group.children.reduce((sum,x)=>sum+x.items.length,0)}>{thenBy==='none'?renderTable(group.children[0]?.items??[]):<Accordion>{group.children.map(child=><AccordionItem key={child.label} title={child.label+' · '+child.items.length}>{renderTable(child.items)}</AccordionItem>)}</Accordion>}</AccordionItem>)}</Accordion>:renderTable(rows):<p className="tp-contacts__empty">没有找到联系人记录。</p>}
      <div className="tp-contacts__pagination"><span>显示 {start}–{end} 条，共 {total.toLocaleString()} 条</span><div><Button kind="tertiary" size="sm" disabled={loading||page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><CarbonIcons.ChevronLeft size={16}/>上一页</Button><span>第 {page} / {pages} 页</span><Button kind="tertiary" size="sm" disabled={loading||page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>下一页<CarbonIcons.ChevronRight size={16}/></Button></div></div>
    </section>
  </main>;
}

export function ContactFormPage() {
  const navigate=useNavigate();const {id}=useParams();const editing=Boolean(id);
  const roleItems=useCrmSettingOptions('contacts','roles',['决策人','采购','财务','物流','技术质检','影响者','其他'].map(id=>({id,text:id})));
  const contactStatuses=useCrmSettingOptions('contacts','statuses',[{id:'active',text:'在职'},{id:'inactive',text:'休眠'},{id:'departed',text:'已离职'},{id:'invalid',text:'无效'}]);
  const contactSources=useCrmSettingOptions('contacts','sources',[{id:'lead_conversion',text:'线索转换'},{id:'manual',text:'手动'},{id:'import',text:'导入'},{id:'business_card',text:'名片识别'},{id:'ai_crawl',text:'AI 抓取'}]);
  const socialPlatforms=useCrmSettingOptions('contacts','social-platforms',['LinkedIn','Facebook','Instagram','X','微信','WhatsApp','Skype','YouTube','TikTok','其他'].map(id=>({id,text:id})));
  const salutations=useCrmSettingOptions('contacts','salutations',[{id:'Mr.',text:'Mr.'},{id:'Ms.',text:'Ms.'},{id:'Mrs.',text:'Mrs.'},{id:'Dr.',text:'Dr.'},{id:'Prof.',text:'Prof.'},{id:'Mx.',text:'Mx.'}]);
  const [form,setForm]=useState<FormState>(emptyForm);const [contactActive,setContactActive]=useState(true);const [accounts,setAccounts]=useState<Account[]>([]);const [contacts,setContacts]=useState<ContactRow[]>([]);
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [tab,setTab]=useState(0);const [avatarFile,setAvatarFile]=useState<File|null>(null);const [avatarPreview,setAvatarPreview]=useState('');
  const set=<K extends keyof FormState>(key:K,value:FormState[K])=>setForm(p=>({...p,[key]:value}));
  useEffect(()=>{if(!avatarFile){setAvatarPreview(form.avatarUrl);return;}const url=URL.createObjectURL(avatarFile);setAvatarPreview(url);return()=>URL.revokeObjectURL(url);},[avatarFile,form.avatarUrl]);
  useEffect(()=>{let alive=true;(async()=>{try{const client=await getSupabaseClient();const [{data:a,error:ae},{data:c,error:ce}]=await Promise.all([client.from('crm_accounts').select('id,account_name,country_code,city,timezone,account_manager').eq('is_archived',false).order('account_name'),client.from('crm_contacts').select('id,account_id,first_name,last_name,full_name,job_title,department,email,phone,mobile,whatsapp,linkedin_url,preferred_language,contact_type,decision_role,is_primary,is_active,notes,custom_fields,created_at,updated_at').eq('is_archived',false).order('full_name')]);if(ae)throw ae;if(ce)throw ce;if(!alive)return;setAccounts((a??[]) as Account[]);setContacts((c??[]) as ContactRow[]);if(id){const {data:r,error:re}=await client.from('crm_contacts').select('*').eq('id',id).single();if(re)throw re;const {data:m,error:me}=await client.from('crm_contact_methods').select('*').eq('contact_id',id).order('sort_order');if(me)throw me;if(alive){setForm(fromRow(r as ContactRow,(m??[]) as ContactMethod[]));setContactActive(Boolean(r.is_active));}}}catch(e){if(alive)setError(e instanceof Error?e.message:'读取联系人表单失败');}finally{if(alive)setLoading(false);}})();return()=>{alive=false};},[id]);
  const accountItems=useMemo(()=>accounts.map(a=>({id:a.id,text:a.account_name})),[accounts]);
  const managerItems=useMemo(()=>contacts.filter(c=>c.account_id===form.accountId&&c.id!==id).map(c=>({id:c.id,text:c.full_name||[c.first_name,c.last_name].filter(Boolean).join(' ')})),[contacts,form.accountId,id]);
  const displayName=[form.salutation,form.firstName,form.lastName].filter(Boolean).join(' ').trim();
  const selectedAccount=accounts.find(a=>a.id===form.accountId);
  const save=async()=>{if(!form.accountId){setError('请选择所属客户 Account。');setTab(0);return;}if(!form.firstName.trim()&&!form.lastName.trim()){setError('名或姓至少填写一项。');setTab(0);return;}setSaving(true);setError('');try{const client=await getSupabaseClient();const {data:sessionData}=await client.auth.getSession();const ownerId=sessionData.session?.user.id;if(!ownerId)throw new Error('登录状态已失效，请重新登录。');
    const custom={salutation:form.salutation,avatarUrl:form.avatarUrl,gender:form.gender,status:form.status,roles:form.roles,managerId:form.managerId,employmentStart:form.employmentStart,employmentEnd:form.employmentEnd,extension:form.extension,fax:form.fax,addressMode:form.addressMode,country:form.addressMode==='inherit'?(selectedAccount?.country_code??''):form.country,state:form.state,city:form.addressMode==='inherit'?(selectedAccount?.city??''):form.city,street:form.street,postalCode:form.postalCode,bestTime:form.bestTime,birthday:form.birthday,importantDays:form.importantDays,communicationNotes:form.communicationNotes,owner:form.owner,source:form.source,sourceLeadId:form.sourceLeadId,firstContactAt:form.firstContactAt,tags:form.tags.split(',').map(x=>x.trim()).filter(Boolean),marketingConsent:form.marketingConsent,consentAt:form.consentAt,consentMethod:form.consentMethod,dataSource:form.dataSource,unsubscribedAt:form.unsubscribedAt,activity:form.activity,internalNotes:form.internalNotes,customFields:form.customFields?JSON.parse(form.customFields):{},createdMethod:form.createdMethod};
    if(form.isPrimary){const {error:primaryError}=await client.from('crm_contacts').update({is_primary:false}).eq('account_id',form.accountId);if(primaryError)throw primaryError;}
    const payload={owner_id:ownerId,account_id:form.accountId,first_name:form.firstName.trim()||form.lastName.trim(),last_name:form.lastName.trim()||null,full_name:form.displayName.trim()||displayName,job_title:form.title.trim()||null,department:form.department.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,mobile:form.mobile.trim()||null,whatsapp:form.whatsapp.trim()||null,linkedin_url:form.social.find(x=>x.platform==='LinkedIn')?.value||null,preferred_language:form.language||null,contact_type:'business',decision_role:form.roles[0]||null,is_primary:form.isPrimary,is_active:editing?contactActive:form.status==='active',notes:form.notes||null,custom_fields:custom,salutation:form.salutation||null,title:form.title||null,contact_role:form.roles[0]||null,phone_extension:form.extension||null,preferred_channel:form.preferredChannel||null,timezone:form.timezone||selectedAccount?.timezone||null,do_not_contact:form.doNotContact};
    let contactId=id;if(editing){const {error:e}=await client.from('crm_contacts').update(payload).eq('id',id);if(e)throw e;}else{const {data,error:e}=await client.from('crm_contacts').insert(payload).select('id').single();if(e)throw e;contactId=data.id;}
    const methodRows=[...form.extraEmails.filter(x=>x.value.trim()).map(x=>({...x,method_type:'email'})),...form.extraPhones.filter(x=>x.value.trim()).map(x=>({...x})),...form.social.filter(x=>x.value.trim()).map(x=>({...x,method_type:'social'}))].map((x,index)=>({owner_id:ownerId,contact_id:contactId,method_type:x.method_type,platform:x.platform||'',value:x.value.trim(),label:x.label||null,is_primary:x.is_primary,is_verified:x.is_verified,sort_order:index}));
    if(editing){const {error:e}=await client.from('crm_contact_methods').delete().eq('contact_id',contactId);if(e)throw e;}
    if(methodRows.length){const {error:e}=await client.from('crm_contact_methods').insert(methodRows);if(e)throw e;}
    if(avatarFile) {
      const extension=(avatarFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      const objectPath=ownerId+'/contacts/'+contactId+'/avatar-'+crypto.randomUUID()+'.'+extension;
      const {error:uploadError}=await client.storage.from('crm-assets').upload(objectPath,avatarFile,{contentType:avatarFile.type,upsert:false});
      if(uploadError) throw uploadError;
      const {data:publicUrl}=client.storage.from('crm-assets').getPublicUrl(objectPath);
      custom.avatarUrl=publicUrl.publicUrl;
      const {error:updateAvatarError}=await client.from('crm_contacts').update({custom_fields:custom}).eq('id',contactId);
      if(updateAvatarError) throw updateAvatarError;
    } else if(!form.avatarUrl && editing) {
      custom.avatarUrl='';
      const {error:updateAvatarError}=await client.from('crm_contacts').update({custom_fields:custom}).eq('id',contactId);
      if(updateAvatarError) throw updateAvatarError;
    }
    navigate('/contacts/'+contactId,{replace:true});
  }catch(e){setError(e instanceof Error?e.message:'保存联系人失败；请检查必填项及数据库权限。');}finally{setSaving(false);}};
  if (loading) return <PageSkeleton variant="form" />;
  return <main className="tp-contacts tp-contacts--form"><header className="tp-contacts__header"><div><p className="tp-contacts__eyebrow">TRADEPILOT / CRM / CONTACT</p><h1>{editing?'编辑联系人':'创建联系人'}</h1><p>先维护主数据，扩展资料在下方标签页中维护。</p></div><div className="tp-contacts__actions"><Button kind="ghost" onClick={()=>navigate(-1)}>取消</Button><Button kind="primary" onClick={()=>void save()} disabled={saving}><CarbonIcons.Save size={16}/>{saving?'保存中…':'保存联系人'}</Button></div></header>
    {error&&<InlineNotification kind="error" title="无法保存联系人" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {accounts.length===0&&<InlineNotification kind="warning" title="尚无可选客户" subtitle="请先创建 Account，再创建联系人。所属客户为必填项。"/>}
    <section className="tp-contacts__primary"><div className="tp-contacts__section-head"><div><h2 className="tp-contacts__heading"><CarbonIcons.UserAvatar size={20} aria-hidden="true"/><span>主数据</span></h2><p>联系人身份、所属客户、组织关系及主要联系方式。</p></div><Tag type="blue">核心资料</Tag></div>
      <div className="tp-contacts__grid tp-contacts__grid--four">
        <div className="tp-contacts__avatar-field"><div className="tp-contacts__avatar-preview">{avatarPreview?<img src={avatarPreview} alt="联系人头像预览"/>:<CarbonIcons.UserAvatar size={48}/>}</div><div className="tp-contacts__avatar-uploader"><FileUploader accept={['.jpg','.jpeg','.png','.webp']} buttonLabel="选择图片" filenameStatus="edit" labelTitle="头像图片" labelDescription="支持 JPG、PNG、WEBP，最大 5 MB。" multiple={false} disabled={saving} onChange={(event:any)=>{const file=event.target.files?.[0] as File|undefined;if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('仅支持 JPG、PNG 或 WEBP 图片。');return;}if(file.size>5*1024*1024){setError('头像图片不能超过 5 MB。');return;}setError('');setAvatarFile(file);}}/>{(avatarPreview||form.avatarUrl)&&<Button kind="ghost" size="sm" onClick={()=>{setAvatarFile(null);set('avatarUrl','');setAvatarPreview('');}}>删除头像</Button>}</div></div>
        {field('联系人编号',<TextInput id="contact-number" labelText="联系人编号" value={editing?(id??'').slice(0,8).toUpperCase():'保存后自动生成'} readOnly/>)}
        {field('称谓',<Select id="contact-salutation" labelText="称谓" value={form.salutation} onChange={e=>setForm(p=>({...p,salutation:e.currentTarget.value,displayName:p.displayName===[p.salutation,p.firstName,p.lastName].filter(Boolean).join(' ').trim()?[e.currentTarget.value,p.firstName,p.lastName].filter(Boolean).join(' ').trim():p.displayName}))}><SelectItem value="" text="请选择"/>{salutations.map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>)}
        {field('名',<TextInput id="contact-first" labelText="名" value={form.firstName} onChange={e=>setForm(p=>({...p,firstName:e.currentTarget.value,displayName:p.displayName===[p.salutation,p.firstName,p.lastName].filter(Boolean).join(' ').trim()?[p.salutation,e.currentTarget.value,p.lastName].filter(Boolean).join(' ').trim():p.displayName}))}/>)}
        {field('姓',<TextInput id="contact-last" labelText="姓" value={form.lastName} onChange={e=>setForm(p=>({...p,lastName:e.currentTarget.value,displayName:p.displayName===[p.salutation,p.firstName,p.lastName].filter(Boolean).join(' ').trim()?[p.salutation,p.firstName,e.currentTarget.value].filter(Boolean).join(' ').trim():p.displayName}))}/>)}
        {field('显示名称',<TextInput id="contact-display" labelText="显示名称" value={form.displayName} onChange={e=>set('displayName',e.currentTarget.value)} />)}
        
        {field('性别',<Select id="contact-gender" labelText="性别" value={form.gender} onChange={e=>set('gender',e.currentTarget.value)}><SelectItem value="" text="不指定"/><SelectItem value="female" text="女"/><SelectItem value="male" text="男"/><SelectItem value="other" text="其他"/></Select>)}
        {field('状态',<Select id="contact-status" labelText="状态" value={form.status} onChange={e=>set('status',e.currentTarget.value)}>{contactStatuses.map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>)}
        {field('所属客户 Account',<ComboBox id="contact-account" placeholder="搜索并选择客户" items={accountItems} itemToString={x=>x?.text??''} selectedItem={accountItems.find(x=>x.id===form.accountId)??null} onChange={({selectedItem})=>{set('accountId',selectedItem?.id??'');const a=accounts.find(x=>x.id===selectedItem?.id);if(a){setForm(p=>({...p,accountId:a.id,timezone:p.timezone||a.timezone||'',owner:p.owner||a.account_manager||''}))}}}/>,true)}
        {field('联系人角色',<MultiSelect id="contact-roles" label="选择角色" items={roleItems} itemToString={x=>x?.text??''} selectedItems={roleItems.filter(x=>form.roles.includes(x.id))} onChange={({selectedItems})=>set('roles',(selectedItems??[]).map(x=>x.id))}/>)}
        {field('职位',<TextInput id="contact-title" labelText="职位" value={form.title} onChange={e=>set('title',e.currentTarget.value)}/>)}
        {field('部门',<TextInput id="contact-department" labelText="部门" value={form.department} onChange={e=>set('department',e.currentTarget.value)}/>)}
        {field('上级联系人',<ComboBox id="contact-manager" placeholder="选择同一客户的上级联系人" items={managerItems} itemToString={x=>x?.text??''} selectedItem={managerItems.find(x=>x.id===form.managerId)??null} onChange={({selectedItem})=>set('managerId',selectedItem?.id??'')}/>)}
      </div>
      <div className="tp-contacts__inline"><Checkbox id="contact-primary" labelText="设为该客户的主联系人" checked={form.isPrimary} onChange={(_,d)=>set('isPrimary',d.checked)}/><span className="tp-contacts__muted">同一客户原则上只应有一位主联系人；保存时会按数据库现有规则处理。</span></div>
      <div className="tp-contacts__grid tp-contacts__grid--four">
        {field('入职日期',dateInput('contact-employment-start','入职日期',form.employmentStart,v=>set('employmentStart',v)))}
        {field('离职日期',dateInput('contact-employment-end','离职日期',form.employmentEnd,v=>set('employmentEnd',v)))}
        {field('工作邮箱',<TextInput id="contact-email" labelText="工作邮箱" type="email" value={form.email} onChange={e=>set('email',e.currentTarget.value)}/>)}
        {field('手机',<TextInput id="contact-mobile" labelText="手机" value={form.mobile} onChange={e=>set('mobile',e.currentTarget.value)}/>)}
        {field('工作电话',<TextInput id="contact-phone" labelText="工作电话" value={form.phone} onChange={e=>set('phone',e.currentTarget.value)}/>)}
        {field('分机',<TextInput id="contact-extension" labelText="分机" value={form.extension} onChange={e=>set('extension',e.currentTarget.value)}/>)}
        {field('WhatsApp',<TextInput id="contact-whatsapp" labelText="WhatsApp" value={form.whatsapp} onChange={e=>set('whatsapp',e.currentTarget.value)}/>)}
        {field('负责人',<TextInput id="contact-owner" labelText="负责人" value={form.owner} onChange={e=>set('owner',e.currentTarget.value)} placeholder="默认继承客户负责人"/>)}
      </div>
    </section>
    <section className="tp-contacts__tabs"><Tabs selectedIndex={tab} onChange={({selectedIndex})=>setTab(selectedIndex)}><TabList aria-label="联系人其他数据" contained><Tab>联系方式</Tab><Tab>社交账号</Tab><Tab>地址</Tab><Tab>沟通偏好</Tab><Tab>归属与来源</Tab><Tab>合规与同意</Tab><Tab>活动统计</Tab><Tab>备注</Tab><Tab>自定义字段</Tab><Tab>系统信息</Tab></TabList><TabPanels>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Phone size={20} aria-hidden="true"/><span>附加联系方式</span></h2><p className="tp-contacts__muted">主要邮箱、电话和 WhatsApp 已放在主数据区；此处维护其他邮箱、电话及通讯工具。</p><MethodRows title="附加邮箱" items={form.extraEmails} onChange={v=>set('extraEmails',v)} methodType="email"/><MethodRows title="附加电话 / 通讯工具" items={form.extraPhones} onChange={v=>set('extraPhones',v)} methodType="phone"/><div className="tp-contacts__grid tp-contacts__grid--three">{field('邮箱状态',<TextInput id="contact-email-status" labelText="邮箱状态" value={form.email?'已填写，待验证':'未填写'} readOnly/>)}{field('邮箱验证结果',<TextInput id="contact-email-verify" labelText="邮箱验证结果" value="待接入验证服务" readOnly/>)}{field('最近退信时间',<TextInput id="contact-bounce" labelText="最近退信时间" value="—" readOnly/>)}</div></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Share size={20} aria-hidden="true"/><span>社交账号</span></h2><p className="tp-contacts__muted">每个平台支持多条记录，可填写账号名称或个人主页链接。</p><SocialRows items={form.social} onChange={v=>set('social',v)} platforms={socialPlatforms.map(x=>x.text)}/></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Location size={20} aria-hidden="true"/><span>联系地址</span></h2><div className="tp-contacts__inline"><Checkbox id="contact-address-override" labelText="使用联系人独立地址（不继承客户地址）" checked={form.addressMode==='override'} onChange={(_,d)=>set('addressMode',d.checked?'override':'inherit')}/></div>{form.addressMode==='inherit'?<InlineNotification kind="info" lowContrast title="继承客户地址" subtitle={selectedAccount?('默认继承客户国家 / 地区：'+(selectedAccount.country_code??'—')+'，城市：'+(selectedAccount.city??'—')):'选择客户后将继承其地址；联系人可随时切换为独立地址。'}/>:<div className="tp-contacts__grid tp-contacts__grid--three">{field('国家 / 地区',<TextInput id="contact-country" labelText="国家 / 地区" value={form.country} onChange={e=>set('country',e.currentTarget.value)}/>)}{field('省 / 州',<TextInput id="contact-state" labelText="省 / 州" value={form.state} onChange={e=>set('state',e.currentTarget.value)}/>)}{field('城市',<TextInput id="contact-city" labelText="城市" value={form.city} onChange={e=>set('city',e.currentTarget.value)}/>)}{field('详细地址',<TextInput id="contact-street" labelText="详细地址" value={form.street} onChange={e=>set('street',e.currentTarget.value)}/>)}{field('邮政编码',<TextInput id="contact-postal" labelText="邮政编码" value={form.postalCode} onChange={e=>set('postalCode',e.currentTarget.value)}/>)}</div>}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Chat size={20} aria-hidden="true"/><span>沟通偏好</span></h2><div className="tp-contacts__grid tp-contacts__grid--three">{field('沟通语言',<TextInput id="contact-language" labelText="沟通语言" value={form.language} onChange={e=>set('language',e.currentTarget.value)} placeholder="例如 English / 简体中文"/>)}{field('时区',<TextInput id="contact-timezone" labelText="时区" value={form.timezone} onChange={e=>set('timezone',e.currentTarget.value)} placeholder={selectedAccount?.timezone||'默认继承客户时区'}/>)}{field('首选联系方式',<Select id="contact-channel" labelText="首选联系方式" value={form.preferredChannel} onChange={e=>set('preferredChannel',e.currentTarget.value)}>{[['email','邮件'],['whatsapp','WhatsApp'],['phone','电话'],['other','其他']].map(([v,t])=><SelectItem key={v} value={v} text={t}/>)}</Select>)}{field('最佳联系时间',<TextInput id="contact-best-time" labelText="最佳联系时间" value={form.bestTime} onChange={e=>set('bestTime',e.currentTarget.value)} placeholder="例如工作日 09:00–12:00"/>)}{field('生日',dateInput('contact-birthday','生日',form.birthday,v=>set('birthday',v)))}{field('重要节日',<TextInput id="contact-important-days" labelText="重要节日" value={form.importantDays} onChange={e=>set('importantDays',e.currentTarget.value)} placeholder="例如春节、开斋节"/>)}</div>{field('沟通备注',<TextArea id="contact-communication-notes" labelText="沟通备注" value={form.communicationNotes} onChange={e=>set('communicationNotes',e.currentTarget.value)} rows={3} placeholder="例如只回复英文邮件。"/>)}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Network_4 size={20} aria-hidden="true"/><span>归属与来源</span></h2><div className="tp-contacts__grid tp-contacts__grid--three">{field('负责人',<TextInput id="contact-owner-tab" labelText="负责人" value={form.owner} onChange={e=>set('owner',e.currentTarget.value)}/>)}{field('联系人来源',<Select id="contact-source" labelText="联系人来源" value={form.source} onChange={e=>set('source',e.currentTarget.value)}>{contactSources.map(x=><SelectItem key={x.id} value={x.id} text={x.text}/>)}</Select>)}{field('来源线索 ID',<TextInput id="contact-source-lead" labelText="来源线索 ID" value={form.sourceLeadId} onChange={e=>set('sourceLeadId',e.currentTarget.value)} readOnly/>)}{field('首次接触时间',<DateTimeField id="contact-first-touch" label="首次接触时间" value={form.firstContactAt} onChange={value=>set('firstContactAt',value)}/>)}{field('标签',<TextInput id="contact-tags" labelText="标签" value={form.tags} onChange={e=>set('tags',e.currentTarget.value)} placeholder="用逗号分隔"/>)}</div></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Security size={20} aria-hidden="true"/><span>合规与同意</span></h2><div className="tp-contacts__inline"><Checkbox id="contact-dnc" labelText="拒绝联系（Do Not Contact）" checked={form.doNotContact} onChange={(_,d)=>set('doNotContact',d.checked)}/></div><div className="tp-contacts__grid tp-contacts__grid--three">{field('邮件营销同意',<Select id="contact-consent" labelText="邮件营销同意" value={form.marketingConsent} onChange={e=>set('marketingConsent',e.currentTarget.value)}><SelectItem value="yes" text="是"/><SelectItem value="no" text="否"/><SelectItem value="unknown" text="未知"/></Select>)}{field('同意时间',<DateTimeField id="contact-consent-at" label="同意时间" value={form.consentAt} onChange={value=>set('consentAt',value)}/>)}{field('同意方式',<Select id="contact-consent-method" labelText="同意方式" value={form.consentMethod} onChange={e=>set('consentMethod',e.currentTarget.value)}><SelectItem value="" text="请选择"/><SelectItem value="form" text="表单"/><SelectItem value="email" text="邮件"/><SelectItem value="verbal" text="口头"/></Select>)}{field('数据来源说明（GDPR）',<TextInput id="contact-data-source" labelText="数据来源说明" value={form.dataSource} onChange={e=>set('dataSource',e.currentTarget.value)}/>)}{field('退订时间',<DateTimeField id="contact-unsubscribed" label="退订时间" value={form.unsubscribedAt} onChange={value=>set('unsubscribedAt',value)}/>)}</div>{form.doNotContact&&<InlineNotification kind="warning" lowContrast title="已启用拒绝联系" subtitle="后续营销自动化应读取此标记并阻止联系。"/>}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Activity size={20} aria-hidden="true"/><span>活动统计</span></h2><p className="tp-contacts__muted">自动统计字段只读；邮件打开 / 点击数据需接入邮件系统后显示。</p><div className="tp-contacts__grid tp-contacts__grid--four">{[['lastContactAt','最近联系时间'],['lastReplyAt','最近回复时间'],['contactCount','联系次数'],['opportunityCount','关联商机数'],['orderCount','关联订单数'],['lastEmailOpen','最近邮件打开'],['lastEmailClick','最近邮件点击']].map(([k,label])=>field(label,<TextInput key={k} id={'activity-'+k} labelText={label} value={form.activity[k]??'—'} readOnly/>))}</div></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Notebook size={20} aria-hidden="true"/><span>备注</span></h2>{field('备注',<TextArea id="contact-notes" labelText="备注" value={form.notes} onChange={e=>set('notes',e.currentTarget.value)} rows={4}/>)}{field('内部关键信息',<TextArea id="contact-internal-notes" labelText="内部关键信息" value={form.internalNotes} onChange={e=>set('internalNotes',e.currentTarget.value)} rows={4} placeholder="仅内部使用的关系维护信息。"/>)}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.SettingsAdjust size={20} aria-hidden="true"/><span>自定义字段</span></h2><p className="tp-contacts__muted">自定义字段定义由系统设置维护，此处保存联系人自定义字段值（JSON）。</p>{field('自定义字段数据',<TextArea id="contact-custom-fields" labelText="自定义字段数据" value={form.customFields} onChange={e=>set('customFields',e.currentTarget.value)} rows={8} placeholder={'{\n  "字段名称": "字段值"\n}'}/>)}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Information size={20} aria-hidden="true"/><span>系统信息</span></h2><div className="tp-contacts__grid tp-contacts__grid--three">{field('创建时间',<TextInput id="contact-created" labelText="创建时间" value={editing?'由系统自动记录':'保存后自动记录'} readOnly/>)}{field('更新时间',<TextInput id="contact-updated" labelText="更新时间" value="由系统自动维护" readOnly/>)}{field('创建人',<TextInput id="contact-created-by" labelText="创建人" value="当前登录用户" readOnly/>)}{field('创建方式',<TextInput id="contact-created-method" labelText="创建方式" value={form.createdMethod==='manual'?'手动':form.createdMethod==='lead_conversion'?'线索转换':form.createdMethod==='import'?'导入':form.createdMethod==='business_card'?'名片识别':'AI 抓取'} readOnly/>)}</div></div></TabPanel>
    </TabPanels></Tabs></section>
    <footer className="tp-contacts__footer"><span>所属客户为必填项；名或姓至少填写一项。</span><div><Button kind="ghost" onClick={()=>navigate(-1)}>取消</Button><Button kind="primary" disabled={saving||accounts.length===0} onClick={()=>void save()}>{saving?'保存中…':'保存联系人'}</Button></div></footer>
  </main>;
}
export function ContactDetailPage() {
  const {id}=useParams();const [row,setRow]=useState<ContactRow|null>(null);const [methods,setMethods]=useState<ContactMethod[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [statusEvents,setStatusEvents]=useState<any[]>([]);const [statusModalOpen,setStatusModalOpen]=useState(false);const [nextActive,setNextActive]=useState('active');const [statusNote,setStatusNote]=useState('');const [statusSaving,setStatusSaving]=useState(false);const [statusError,setStatusError]=useState('');
  useEffect(()=>{let alive=true;(async()=>{try{const client=await getSupabaseClient();const {data,error:e}=await client.from('crm_contacts').select('*,crm_accounts(account_name)').eq('id',id).single();if(e)throw e;const {data:m,error:me}=await client.from('crm_contact_methods').select('*').eq('contact_id',id).order('sort_order');if(me)throw me;if(alive){setRow(data as unknown as ContactRow);setMethods((m??[]) as ContactMethod[]);const h=await client.from('business_transition_events').select('id,event_type,from_status,to_status,note,actor_id,created_at').eq('record_type','contact').eq('record_id',id).order('created_at',{ascending:false}).limit(20);setStatusEvents(h.data||[]);}}catch(e){if(alive)setError(e instanceof Error?e.message:'读取联系人详情失败');}finally{if(alive)setLoading(false);}})();return()=>{alive=false};},[id]);
  if(error||!row)return <main className="tp-contacts"><InlineNotification kind="error" title="无法打开联系人" subtitle={error||'联系人不存在。'}/><Link href="/contacts">返回联系人列表</Link></main>;
  const cf=row.custom_fields??{};const name=row.full_name||[row.first_name,row.last_name].filter(Boolean).join(' ');const employmentStatus=String(cf.status??'');const contactLifecycleStage=employmentStatus==='invalid'?'invalid':employmentStatus==='departed'?'departed':employmentStatus==='inactive'||!row.is_active?'inactive':'active';
const saveContactStatus=async()=>{if(!row||!statusNote.trim()){setStatusError('请填写状态变更原因。');return;}const targetActive=nextActive==='active';if(targetActive===row.is_active){setStatusError('请选择不同的联系人状态。');return;}setStatusSaving(true);setStatusError('');try{const db=await getSupabaseClient();const result=await db.rpc('confirm_contact_active_transition',{p_contact_id:row.id,p_expected_active:row.is_active,p_target_active:targetActive,p_note:statusNote.trim()});if(result.error)throw result.error;const refreshed=await db.from('crm_contacts').select('*,crm_accounts(account_name)').eq('id',row.id).single();if(refreshed.error)throw refreshed.error;setRow(refreshed.data as unknown as ContactRow);const h=await db.from('business_transition_events').select('id,event_type,from_status,to_status,note,actor_id,created_at').eq('record_type','contact').eq('record_id',row.id).order('created_at',{ascending:false}).limit(20);if(h.error)throw h.error;setStatusEvents(h.data||[]);setStatusModalOpen(false);setStatusNote('');}catch(e){setStatusError(e instanceof Error?e.message:'更新联系人状态失败');}finally{setStatusSaving(false)}};
  if (loading) return <PageSkeleton variant="detail" />;
  return <main className="tp-contacts"><header className="tp-contacts__header"><div><p className="tp-contacts__eyebrow">TRADEPILOT / CRM / CONTACT</p><h1>{name}</h1><p>{row.crm_accounts?.account_name??'所属客户'} · {row.job_title??'未填写职位'}</p></div><div className="tp-responsive-header-actions"><Link className="tp-responsive-header-actions__primary" href={'/contacts/'+row.id+'/edit'} renderIcon={CarbonIcons.Edit}>编辑联系人</Link><div className="tp-responsive-header-actions__secondary"><Link href="/contacts">返回列表</Link></div></div></header>
    <section className="tp-contacts__primary"><div className="tp-contacts__section-head"><h2 className="tp-contacts__heading"><CarbonIcons.UserAvatar size={20} aria-hidden="true"/><span>主数据</span></h2><Tag type={row.is_active?'green':'cool-gray'}>{cf.status==='departed'?'已离职':cf.status==='invalid'?'无效':'在职'}</Tag></div><div className="tp-contacts__detail-grid">{[['所属客户',row.crm_accounts?.account_name??'—'],['职位',row.job_title??'—'],['部门',row.department??'—'],['工作邮箱',row.email??'—'],['手机',row.mobile??'—'],['工作电话',row.phone??'—'],['WhatsApp',row.whatsapp??'—'],['联系人角色',Array.isArray(cf.roles)?cf.roles.join('、'):row.decision_role??'—'],['负责人',asString(cf.owner)||'—']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <BusinessLifecycle title="联系人生命周期" steps={[{value:'active',label:'有效'},{value:'inactive',label:'停用'},{value:'departed',label:'已离职'},{value:'invalid',label:'资料无效'}]} current={contactLifecycleStage} statusOnly terminalKind={contactLifecycleStage==='active'?'success':'warning'} terminalTitle={contactLifecycleStage==='active'?"联系人有效":contactLifecycleStage==='departed'?"联系人已离职":contactLifecycleStage==='inactive'?"联系人已停用":"联系人资料无效"} description="联系人有效状态、任职状态、联系方式验证、是否允许联系与归档是独立维度；验证失败不自动停用，拒绝联系也不等于删除。" events={statusEvents}><Button kind="tertiary" onClick={()=>{setNextActive(row.is_active?'active':'inactive');setStatusError('');setStatusModalOpen(true)}}>管理联系人状态</Button></BusinessLifecycle>
    
    <section className="tp-contacts__tabs"><Tabs><TabList aria-label="联系人详情资料" contained><Tab>联系方式</Tab><Tab>社交账号</Tab><Tab>地址</Tab><Tab>沟通偏好</Tab><Tab>归属与来源</Tab><Tab>合规与同意</Tab><Tab>活动统计</Tab><Tab>备注</Tab><Tab>关联记录</Tab><Tab>系统信息</Tab></TabList><TabPanels>
      <TabPanel><div className="tp-contacts__tab-content"><h2>联系方式</h2>{methods.filter(x=>x.method_type!=='social').map((m,i)=><p key={m.id??i}>{m.method_type} · {m.label||'其他'}：{m.value} {m.is_verified?'（已验证）':'（待验证）'}</p>)}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Share size={20} aria-hidden="true"/><span>社交账号</span></h2>{methods.filter(x=>x.method_type==='social').map((m,i)=><p key={m.id??i}>{m.platform}：{m.value}</p>)}</div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2>地址</h2><p>{cf.addressMode==='inherit'?'继承客户地址':'联系人独立地址'}</p><p>{[cf.country,cf.state,cf.city,cf.street,cf.postalCode].filter(Boolean).join(' ')||'未设置'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Chat size={20} aria-hidden="true"/><span>沟通偏好</span></h2><p>语言：{row.preferred_language||'—'} · 时区：{row.timezone||'继承客户'}</p><p>首选：{row.preferred_channel||'—'} · 最佳联系时间：{cf.bestTime||'—'}</p><p>{cf.communicationNotes||'暂无沟通备注'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Network_4 size={20} aria-hidden="true"/><span>归属与来源</span></h2><p>来源：{cf.source||'—'} · 首次接触：{cf.firstContactAt||'—'}</p><p>负责人：{cf.owner||'—'} · 标签：{Array.isArray(cf.tags)?cf.tags.join('、'):'—'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Security size={20} aria-hidden="true"/><span>合规与同意</span></h2><p>拒绝联系：{row.do_not_contact?'是':'否'} · 邮件营销同意：{cf.marketingConsent||'未知'}</p><p>同意时间：{cf.consentAt||'—'} · 同意方式：{cf.consentMethod||'—'} · 退订：{cf.unsubscribedAt||'—'}</p><p>{cf.dataSource||'未填写数据来源说明'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Activity size={20} aria-hidden="true"/><span>活动统计</span></h2><p>最近联系：{cf.activity?.lastContactAt||'—'} · 最近回复：{cf.activity?.lastReplyAt||'—'}</p><p>联系次数：{cf.activity?.contactCount||'0'} · 商机：{cf.activity?.opportunityCount||'0'} · 订单：{cf.activity?.orderCount||'0'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Notebook size={20} aria-hidden="true"/><span>备注</span></h2><p>{row.notes||'暂无备注'}</p><p>{cf.internalNotes||'暂无内部备注'}</p></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Link size={20} aria-hidden="true"/><span>关联记录</span></h2><p>商机、报价、订单、活动记录与文件将在对应业务模块接通后显示。</p><div className="tp-contacts__related">{['商机','报价','订单','活动记录','文件'].map(x=><div key={x}><strong>{x}</strong><span>尚无关联记录</span></div>)}</div></div></TabPanel>
      <TabPanel><div className="tp-contacts__tab-content"><h2 className="tp-contacts__heading"><CarbonIcons.Information size={20} aria-hidden="true"/><span>系统信息</span></h2><p>创建时间：{new Date(row.created_at).toLocaleString()}</p><p>更新时间：{new Date(row.updated_at).toLocaleString()}</p><p>创建方式：{cf.createdMethod||'—'}</p></div></TabPanel>
    </TabPanels></Tabs></section>
  <Modal open={statusModalOpen} modalHeading="管理联系人状态" primaryButtonText={statusSaving?'保存中…':'确认变更'} secondaryButtonText="取消" onRequestClose={()=>setStatusModalOpen(false)} onRequestSubmit={()=>void saveContactStatus()} primaryButtonDisabled={statusSaving||!statusNote.trim()}><Select id="contact-lifecycle-status" labelText="联系人状态" value={nextActive} onChange={e=>setNextActive(e.currentTarget.value)}><SelectItem value="active" text="有效 / 在职"/><SelectItem value="inactive" text="失效 / 已停用"/></Select><TextArea id="contact-lifecycle-note" labelText="变更原因" value={statusNote} onChange={e=>setStatusNote(e.currentTarget.value)} rows={3}/>{statusError&&<InlineNotification kind="error" title="状态变更失败" subtitle={statusError}/>}</Modal></main>;
}
