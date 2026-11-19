import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Link, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, TextArea,
  Tabs, TabList, Tab, TabPanels, TabPanel, TpDataTable, TpDetailPanel,
  ComposedModal, ModalHeader, ModalBody, ModalFooter, Checkbox, RadioButtonGroup, RadioButton,
  semanticIcons, BusinessLifecycle, WorldMapChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { DonutChart, SimpleBarChart } from '@carbon/charts-react';
import '@carbon/charts/styles.css';
import { useBusinessTransitionEvents } from '@/lib/useBusinessTransitionEvents';
import '@/design-system/patterns/opportunities.scss';
import '@/design-system/patterns/responsive-actions.scss';

type AccountOption = { id: string; account_name: string; country_code?: string | null };
type ContactOption = { id: string; account_id: string; full_name: string | null; first_name: string; last_name: string | null };
type Opportunity = {
  id: string; owner_id: string; opportunity_number: string; account_id: string; primary_contact_id: string | null;
  name: string; stage: string; status: string; amount: number; currency_code: string; probability: number;
  expected_close_date: string | null; source: string | null; competitor: string | null; next_step: string | null;
  description: string | null; lost_reason: string | null; sales_team: string | null; sales_person: string | null;
  campaign: string | null; lead_source_detail: string | null; next_activity_date: string | null;
  forecast_category: string | null; is_archived: boolean; forecast_probability: number | null;
  opportunity_type: string; qualification_status: string; priority: string; actual_amount: number | null;
  expected_quantity: number | null; expected_margin: number | null; expected_margin_rate: number | null;
  competitors: unknown[]; competitive_product: string | null; competitive_advantages: string | null;
  competitive_disadvantages: string | null; lost_notes: string | null; product_items: unknown[];
  tags: string[]; first_contact_date: string | null; last_contact_at: string | null;
  next_activity_at: string | null; next_activity_type: string | null; won_at: string | null; closed_at: string | null;
  follow_up_summary: string | null; internal_notes: string | null; custom_fields: Record<string, unknown> | null;
  created_at: string; updated_at: string;
};
const stages: Array<[string,string]> = [
  ['prospecting','新商机'],['qualification','资格评估'],['needs_analysis','需求分析'],
  ['proposal','方案 / 报价'],['negotiation','商务谈判'],['won','已赢单'],['lost','已输单'],
];
const stageLabel = (stage: string) => stages.find(([key]) => key === stage)?.[1] ?? stage;
const typeOptions: Array<[string,string]> = [['new_business','新客户'],['existing_customer','现有客户'],['repeat','复购'],['channel_partner','渠道合作']];
const priorityOptions: Array<[string,string]> = [['low','低'],['normal','普通'],['high','高'],['urgent','紧急']];
const qualificationOptions: Array<[string,string]> = [['pending','待评估'],['qualified','合格'],['disqualified','不合格']];
type OpportunitySetting = { id:string; setting_type:string; name:string; code:string|null; config:Record<string,unknown>; sequence:number; is_active:boolean };
const asOptions = (items:OpportunitySetting[], fallback:Array<[string,string]>) => { const merged=new Map(fallback); items.forEach(x=>{const key=x.code||x.name;if(x.is_active)merged.set(key,x.name);else merged.delete(key)}); return [...merged.entries()]; };

const sourceOptions: Array<[string,string]> = [['prospect_conversion','全网情报 / 线索转换'],['website','官网询盘'],['search','搜索引擎'],['social','社交媒体'],['exhibition','展会'],['referral','客户推荐'],['manual','手动录入'],['other','其他']];
const label = (id: string, title: string, value: string, onChange: (value: string) => void, placeholder = '') =>
  <div className="tp-opportunities__field"><TextInput id={id} labelText={title} value={value} placeholder={placeholder} onChange={e => onChange(e.currentTarget.value)} /></div>;
const area = (id: string, title: string, value: string, onChange: (value: string) => void) =>
  <div className="tp-opportunities__field tp-opportunities__field--wide"><TextArea id={id} labelText={title} value={value} rows={3} onChange={e => onChange(e.currentTarget.value)} /></div>;
const select = (id: string, title: string, value: string, onChange: (value: string) => void, options: Array<[string,string]>) =>
  <div className="tp-opportunities__field"><Select id={id} labelText={title} value={value} onChange={e => onChange(e.currentTarget.value)}>{options.map(([v,t]) => <SelectItem key={v} value={v} text={t} />)}</Select></div>;
function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <section className="tp-opportunities__metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></section>;
}
function contactName(c?: ContactOption) { return c ? (c.full_name || [c.first_name,c.last_name].filter(Boolean).join(' ')) : ''; }

export function OpportunityConsolePage() {
  
  const [rows,setRows] = useState<Opportunity[]>([]);
  const [accounts,setAccounts] = useState<AccountOption[]>([]);
  const [contacts,setContacts] = useState<ContactOption[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [query,setQuery] = useState('');
  const [stage,setStage] = useState('all');
  const [marketCountry,setMarketCountry] = useState('all');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState<10 | 20 | 50 | 100>(20);
  const [activeOpportunity,setActiveOpportunity] = useState<Opportunity | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const [o,a,c] = await Promise.all([
        db.from('crm_opportunities').select('*').eq('is_archived',false).order('created_at',{ascending:false}).range(0,1999),
        db.from('crm_accounts').select('id,account_name,country_code').eq('is_archived',false).order('account_name'),
        db.from('crm_contacts').select('id,account_id,full_name,first_name,last_name').eq('is_archived',false).eq('is_active',true).order('first_name'),
      ]);
      if(o.error) throw o.error; if(a.error) throw a.error; if(c.error) throw c.error;
      setRows((o.data||[]) as Opportunity[]); setAccounts((a.data||[]) as AccountOption[]); setContacts((c.data||[]) as ContactOption[]);
    } catch(e) { setError(e instanceof Error ? e.message : '读取商机失败'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load()},[load]);

  const accountCountries = useMemo(()=>new Map(accounts.map(account=>[account.id,String(account.country_code||'').toUpperCase()])),[accounts]);
  const opportunityMarketData = useMemo(()=>{const counts=new Map<string,number>();rows.forEach(row=>{const code=accountCountries.get(row.account_id)||'';if(code)counts.set(code,(counts.get(code)||0)+1)});return [...counts.entries()].map(([code,value])=>{let label=code;try{label=new Intl.DisplayNames(['zh-TW'],{type:'region'}).of(code)||code}catch{}return {code,label,value}}).sort((a,b)=>b.value-a.value)},[rows,accountCountries]);
  const stageData = useMemo(()=>stages.map(([key,label])=>({group:label,value:rows.filter(row=>row.stage===key).length})).filter(item=>item.value>0),[rows]);
  const sourceData = useMemo(()=>{const counts=new Map<string,number>();rows.forEach(row=>{const key=row.source||'未标记来源';counts.set(key,(counts.get(key)||0)+1)});return [...counts.entries()].map(([group,value])=>({group,value})).sort((a,b)=>b.value-a.value).slice(0,8)},[rows]);
  const filtered = useMemo(()=>rows.filter(r=>(stage==='all'||r.stage===stage)&&(marketCountry==='all'||accountCountries.get(r.account_id)===marketCountry)&&[r.name,r.opportunity_number,r.source,r.sales_person,r.sales_team].join(' ').toLowerCase().includes(query.trim().toLowerCase())),[rows,stage,marketCountry,accountCountries,query]);
  useEffect(()=>setPage(1),[query,stage,marketCountry]);
  const open = rows.filter(r=>r.status==='open');
  const currencyTotals = (items: Opportunity[], weightedAmount = false) => {
    const totals = new Map<string,number>();
    items.forEach(item => totals.set(item.currency_code || 'USD',(totals.get(item.currency_code || 'USD') || 0) + Number(item.amount || 0) * (weightedAmount ? Number(item.probability || 0) / 100 : 1)));
    return [...totals.entries()].map(([currency,value])=>currency+' '+value.toLocaleString(undefined,{maximumFractionDigits:2})).join(' · ') || '—';
  };
  const pipeline = currencyTotals(open);
  const weighted = currencyTotals(open,true);
  const accountMap = new Map(accounts.map(a=>[a.id,a.account_name] as [string,string]));
  const contactMap = new Map(contacts.map(c=>[c.id,contactName(c)]));
  return <main className="tp-opportunities">
    <PageHeader className="tp-opportunities__header"><div><p className="tp-opportunities__eyebrow">TRADEPILOT / CRM</p><h1>商机（Opportunity）</h1><p>管理销售机会、阶段、预测金额、客户关系与跟进计划。</p></div>
      <div className="tp-opportunities__actions"><Button kind="tertiary" onClick={()=>void load()} disabled={loading}><semanticIcons.refresh size={16}/>刷新</Button><Link href="/opportunities/new" renderIcon={semanticIcons.add}>新建商机</Link></div>
    </PageHeader>
    {error&&<InlineNotification kind="error" title="商机数据读取失败" subtitle={error}/>}
    <div className="tp-opportunities__metrics"><Metric title="全部商机" value={String(rows.length)} detail="当前可见商机"/><Metric title="进行中" value={String(open.length)} detail="尚未关闭"/><Metric title="预计管道金额" value={pipeline} detail="按商机金额汇总"/><Metric title="加权预测金额" value={weighted} detail="金额 × 赢率"/></div>
    <section className="tp-opportunities__panel tp-opportunities__analytics">
      <div className="tp-opportunities__panel-head"><div><h2>商机多维分析</h2><p>按销售阶段、来源和客户所在国家 / 地区查看机会分布；地图可联动筛选列表。</p></div></div>
      <div className="tp-opportunities__analytics-grid">
        <div className="tp-opportunities__chart"><h3>销售阶段构成</h3>{stageData.length?<DonutChart data={stageData} options={{theme:document.documentElement.dataset.carbonTheme==='g100'?'g100':'white',height:'280px',donut:{center:{label:'商机'}},legend:{position:'bottom'},toolbar:{enabled:false}} as any}/>:<p className="tp-opportunities__empty">暂无阶段数据</p>}</div>
        <div className="tp-opportunities__chart"><h3>商机来源</h3>{sourceData.length?<SimpleBarChart data={sourceData} options={{theme:document.documentElement.dataset.carbonTheme==='g100'?'g100':'white',height:'280px',color:{pairing:{numberOfVariants:14,option:1}},axes:{bottom:{mapsTo:'group',scaleType:'labels'},left:{mapsTo:'value',scaleType:'linear'}},legend:{enabled:false},toolbar:{enabled:false}} as any}/>:<p className="tp-opportunities__empty">暂无来源数据</p>}</div>
      </div>
      <div className="tp-opportunities__chart"><h3>全球商机市场分布</h3>{opportunityMarketData.length?<WorldMapChart data={opportunityMarketData} unitLabel="个商机" selectedCode={marketCountry==='all'?undefined:marketCountry} onCountrySelect={code=>setMarketCountry(current=>current===code?'all':code)}/>:<p className="tp-opportunities__empty">客户资料尚未提供可识别的国家 / 地区信息。</p>}</div>
    </section>
    <section className="tp-opportunities__panel">
      <div className="tp-opportunities__panel-head"><div><h2>商机列表</h2><p>可按商机名称、编号、阶段和负责人检索；支持排序、分页和侧边详情；每页默认 20 条。</p></div><Tag type="blue">{filtered.length} 条记录</Tag></div>
      <div className="tp-opportunities__filters"><TextInput id="opportunity-search" labelText="搜索商机" placeholder="名称、编号、来源或负责人" value={query} onChange={e=>setQuery(e.currentTarget.value)}/><Select id="opportunity-stage-filter" labelText="销售阶段" value={stage} onChange={e=>setStage(e.currentTarget.value)}><SelectItem value="all" text="全部阶段"/>{stages.map(([v,t])=><SelectItem key={v} value={v} text={t}/>)}</Select></div>
      <TpDataTable
        ariaLabel="商机列表"
        columnSettingsKey="opportunities"
        selectable
        selectionRows={filtered}
        columns={[
          { key: 'name', header: '商机名称', primary: true, required: true, sortable: true, minWidth: 220, render: row => <span><Link href={`/opportunities/${row.id}`} className="tp-opportunities__row-link">{row.name}</Link><span className="tp-opportunities__secondary">{row.opportunity_number}</span></span> },
          { key: 'account', header: '所属客户', minWidth: 180, sortable: true, render: row => accountMap.get(row.account_id) || '—' },
          { key: 'contact', header: '主要联系人', minWidth: 150, render: row => row.primary_contact_id ? contactMap.get(row.primary_contact_id) || '—' : '—' },
          { key: 'stage', header: '销售阶段', minWidth: 120, render: row => <Tag type={row.stage === 'won' ? 'green' : row.stage === 'lost' ? 'red' : 'blue'}>{stageLabel(row.stage)}</Tag> },
          { key: 'amount', header: '预计金额', type: 'currency', align: 'end', minWidth: 150, render: row => `${row.currency_code} ${Number(row.amount || 0).toLocaleString()}` },
          { key: 'probability', header: '赢率', type: 'percent', align: 'end', minWidth: 90, render: row => `${row.probability}%` },
          { key: 'expected_close_date', header: '预计成交日期', type: 'datetime', minWidth: 160, render: row => row.expected_close_date || '—' },
          { key: 'sales_person', header: '负责人', minWidth: 130, render: row => row.sales_person || '—' },
        ]}
        rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
        rowKey="id"
        onRowOpen={setActiveOpportunity}
        activeRowId={activeOpportunity?.id}
        loading={loading}
        refreshing={false}
        pagination={{ page, pageSize, totalItems: filtered.length, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); } }}
        emptyState="没有符合条件的商机。"
      />
      <TpDetailPanel
        open={Boolean(activeOpportunity)}
        title={activeOpportunity?.name || '商机详情'}
        subtitle={activeOpportunity?.opportunity_number}
        onRequestClose={() => setActiveOpportunity(null)}
        size="lg"
        className="tp-opportunities__detail-panel"
      >
        {activeOpportunity && (
          <div className="tp-opportunities__detail-content">
            <div className="tp-opportunities__detail-summary">
              <Tag type={activeOpportunity.stage === 'won' ? 'green' : activeOpportunity.stage === 'lost' ? 'red' : 'blue'}>{stageLabel(activeOpportunity.stage)}</Tag>
              <strong>{activeOpportunity.currency_code} {Number(activeOpportunity.amount || 0).toLocaleString()}</strong>
              <span>赢率 {activeOpportunity.probability}%</span>
            </div>
            <dl>
              <div><dt>所属客户</dt><dd>{accountMap.get(activeOpportunity.account_id) || '—'}</dd></div>
              <div><dt>主要联系人</dt><dd>{activeOpportunity.primary_contact_id ? contactMap.get(activeOpportunity.primary_contact_id) || '—' : '—'}</dd></div>
              <div><dt>预计成交日期</dt><dd>{activeOpportunity.expected_close_date || '—'}</dd></div>
              <div><dt>负责人</dt><dd>{activeOpportunity.sales_person || '—'}</dd></div>
              <div><dt>下一步计划</dt><dd>{activeOpportunity.next_step || '—'}</dd></div>
              <div><dt>跟进摘要</dt><dd>{activeOpportunity.follow_up_summary || '—'}</dd></div>
            </dl>
            <Link href={`/opportunities/${activeOpportunity.id}`}>打开完整商机资料</Link>
          </div>
        )}
      </TpDetailPanel>
    </section>
  </main>;
}

export function OpportunityFormPage() {
  const nav=useNavigate(); const {id}=useParams(); const editing=Boolean(id);
  const [accounts,setAccounts]=useState<AccountOption[]>([]); const [contacts,setContacts]=useState<ContactOption[]>([]); const [settings,setSettings]=useState<OpportunitySetting[]>([]);
  const [loading,setLoading]=useState(editing); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const [data,setData]=useState<Record<string,string>>({name:'',account_id:'',primary_contact_id:'',description:'',opportunity_type:'new_business',stage:'prospecting',status:'open',probability:'10',priority:'normal',qualification_status:'pending',amount:'0',currency_code:'USD',actual_amount:'',expected_quantity:'',expected_margin:'',expected_margin_rate:'',source:'manual',campaign:'',sales_team:'',sales_person:'',expected_close_date:'',first_contact_date:'',next_activity_date:'',next_activity_at:'',next_activity_type:'',next_step:'',competitor:'',competitive_product:'',competitive_advantages:'',competitive_disadvantages:'',lost_reason:'',lost_notes:'',lead_source_detail:'',follow_up_summary:'',internal_notes:'',tags:'',products:'',win_reason:''});
  const set=(key:string,value:string)=>setData(d=>({...d,[key]:value}));
  useEffect(()=>{(async()=>{try{const db=await getSupabaseClient();const [a,c,s]=await Promise.all([db.from('crm_accounts').select('id,account_name').eq('is_archived',false).order('account_name'),db.from('crm_contacts').select('id,account_id,full_name,first_name,last_name').eq('is_archived',false).eq('is_active',true),db.from('crm_opportunity_setting_items').select('id,setting_type,name,code,config,sequence,is_active').order('sequence').order('name')]);if(a.error)throw a.error;if(c.error)throw c.error;if(s.error)throw s.error;setAccounts((a.data||[]) as AccountOption[]);setContacts((c.data||[]) as ContactOption[]);setSettings((s.data||[]) as OpportunitySetting[]);if(id){const r=await db.from('crm_opportunities').select('*').eq('id',id).single();if(r.error)throw r.error;const o=r.data as Opportunity;setData(d=>({...d,...Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v==null?'':Array.isArray(v)?v.join(', '):String(v)])),win_reason:String(o.custom_fields?.win_reason||''),tags:(o.tags||[]).join(', '),products:(o.product_items||[]).map(x=>typeof x==='string'?x:JSON.stringify(x)).join(', ')}))}}catch(e){setError(e instanceof Error?e.message:'读取商机资料失败')}finally{setLoading(false)}})()},[id]);
  const availableContacts=contacts.filter(c=>c.account_id===data.account_id);
  const settingRows=(type:string)=>settings.filter(x=>x.setting_type===type);
  const configured=(type:string)=>settingRows(type).filter(x=>x.is_active);
  const stageItems=configured('stages'), teamItems=configured('teams');
  const stageOptions=asOptions(settingRows('stages'),stages), opportunityTypes=asOptions(settingRows('types'),typeOptions), priorities=asOptions(settingRows('priorities'),priorityOptions), sources=asOptions(settingRows('sources'),sourceOptions), qualifications=asOptions(settingRows('qualification'),qualificationOptions), activities=asOptions(settingRows('activities'),[['call','电话'],['email','邮件'],['whatsapp','WhatsApp'],['meeting','会议'],['video','视频会议'],['visit','客户拜访'],['task','任务']]);
  const teams=asOptions(teamItems,[]);
  const lostReasons: Array<[string,string]>=asOptions(settingRows('win-loss-reasons').filter(x=>x.config?.result==='lost'),[['price','价格'],['competitor','竞争对手'],['timing','时机不合适'],['no_budget','预算不足'],['no_response','客户无回应'],['other','其他']]);
  const wonReasons: Array<[string,string]>=asOptions(settingRows('win-loss-reasons').filter(x=>x.config?.result==='won'),[['relationship','客户关系与服务'],['product_value','产品价值与匹配'],['delivery','交付能力'],['price_win','价格优势']]);
  const managementRules=configured('rules')[0]?.config||{require_loss_reason:true,require_win_reason:false,probability_from_stage:true};
  const onStageChange=(value:string)=>{set('stage',value);const item=stageItems.find(x=>(x.code||x.name)===value);const fallbackProbability:Record<string,number>={prospecting:10,qualification:20,needs_analysis:35,proposal:55,negotiation:80,won:100,lost:0};if(managementRules.probability_from_stage!==false&&managementRules.probability_from_stage!=='false')set('probability',String(item?.config?.probability??fallbackProbability[value]??data.probability));};

  const save=async()=>{if(!data.name.trim()||!data.account_id){setError('商机名称和所属客户为必填项。');return}if(data.primary_contact_id&&!availableContacts.some(c=>c.id===data.primary_contact_id)){setError('主要联系人必须属于当前所属客户。');return}if(data.stage==='lost'&&(managementRules.require_loss_reason===true||managementRules.require_loss_reason==='true')&&!data.lost_reason){setError('当前商机规则要求选择输单原因。');return}if(data.stage==='won'&&(managementRules.require_win_reason===true||managementRules.require_win_reason==='true')&&!data.win_reason){setError('当前商机规则要求选择赢单原因。');return}if((managementRules.require_expected_close===true||managementRules.require_expected_close==='true')&&!data.expected_close_date){setError('当前商机规则要求填写预计成交日期。');return}
    setSaving(true);setError('');try{const db=await getSupabaseClient();const {data:s}=await db.auth.getSession();if(!s.session)throw new Error('登录状态已失效，请重新登录。');
      const stage=data.stage;const stageConfig=stageItems.find(x=>(x.code||x.name)===stage)?.config||{};const terminalStatus=String(stageConfig.terminal_status||'');const status=stage==='won'||terminalStatus==='won'?'won':stage==='lost'||terminalStatus==='lost'?'lost':'open';
      const payload={owner_id:s.session.user.id,name:data.name.trim(),account_id:data.account_id,primary_contact_id:data.primary_contact_id||null,description:data.description||null,stage,status,amount:Number(data.amount||0),currency_code:data.currency_code||'USD',probability:Math.max(0,Math.min(100,Math.round(Number(data.probability||0)))),expected_close_date:data.expected_close_date||null,source:data.source||null,competitor:data.competitor||null,next_step:data.next_step||null,lost_reason:data.lost_reason||null,sales_team:data.sales_team||null,sales_person:data.sales_person||null,campaign:data.campaign||null,lead_source_detail:data.lead_source_detail||null,next_activity_date:data.next_activity_date||null,forecast_category:String(stageConfig.forecast_category||(status==='won'?'won':status==='lost'?'lost':'pipeline')),forecast_probability:Number(data.probability||0),opportunity_type:data.opportunity_type,qualification_status:data.qualification_status,priority:data.priority,actual_amount:data.actual_amount?Number(data.actual_amount):null,expected_quantity:data.expected_quantity?Number(data.expected_quantity):null,expected_margin:data.expected_margin?Number(data.expected_margin):null,expected_margin_rate:data.expected_margin_rate?Number(data.expected_margin_rate):null,competitors:data.competitor?data.competitor.split(',').map(x=>x.trim()).filter(Boolean):[],competitive_product:data.competitive_product||null,competitive_advantages:data.competitive_advantages||null,competitive_disadvantages:data.competitive_disadvantages||null,lost_notes:data.lost_notes||null,product_items:data.products.split(',').map(x=>x.trim()).filter(Boolean),tags:data.tags.split(',').map(x=>x.trim()).filter(Boolean),first_contact_date:data.first_contact_date||null,next_activity_at:data.next_activity_at||null,next_activity_type:data.next_activity_type||null,follow_up_summary:data.follow_up_summary||null,internal_notes:data.internal_notes||null,custom_fields:{win_reason:data.win_reason||null}};
      const result=editing?await db.from('crm_opportunities').update(payload).eq('id',id).select('id').single():await db.from('crm_opportunities').insert(payload).select('id').single();
      if(result.error)throw result.error;nav('/opportunities/'+result.data.id,{replace:true});
    }catch(e){setError(e instanceof Error?e.message:'保存商机失败')}finally{setSaving(false)}
  };
  if(loading)return <main className="tp-opportunities"><InlineLoading description="正在读取商机资料…"/></main>;
  return <main className="tp-opportunities"><PageHeader className="tp-opportunities__header"><div><p className="tp-opportunities__eyebrow">TRADEPILOT / CRM / OPPORTUNITY</p><h1>{editing?'编辑商机':'新建商机'}</h1><p>按业务分组维护商机信息；客户与联系人保持独立关联。</p></div><div className="tp-opportunities__actions"><Link href="/opportunities">返回列表</Link><Button kind="primary" disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'保存商机'}</Button></div></PageHeader>
    {error&&<InlineNotification kind="error" title="商机保存失败" subtitle={error}/>}
    <section className="tp-opportunities__primary"><div className="tp-opportunities__grid"><div className="tp-opportunities__field tp-opportunities__field--wide"><TextInput id="opp-name" labelText="商机名称 *" value={data.name} onChange={e=>set('name',e.currentTarget.value)} placeholder="例如：欧洲市场智能音箱采购项目"/></div><div className="tp-opportunities__field tp-opportunities__number-note"><span>商机编号</span><p>{editing?'保存时保留系统编号':'保存后自动生成'}</p></div>{select('opp-account','所属客户 *',data.account_id,v=>{set('account_id',v);set('primary_contact_id','')},accounts.map(a=>[a.id,a.account_name]))}{select('opp-contact','主要联系人',data.primary_contact_id,v=>set('primary_contact_id',v),[['','请选择联系人'],...availableContacts.map(c=>[c.id,contactName(c)] as [string,string])])}</div></section>
    <section className="tp-opportunities__tabs"><Tabs><TabList aria-label="商机字段分组" contained>{['商机信息','销售阶段','商业金额','销售管理','时间计划','竞争情况','跟进记录'].map(t=><Tab key={t}>{t}</Tab>)}</TabList><TabPanels>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>商机信息</h2><div className="tp-opportunities__grid">{select('opp-type','商机类型',data.opportunity_type,v=>set('opportunity_type',v),opportunityTypes)}{label('opp-tags','商机标签',data.tags,v=>set('tags',v),'多个标签以逗号分隔')}{area('opp-description','商机描述',data.description,v=>set('description',v))}</div></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>销售阶段</h2><div className="tp-opportunities__grid">{editing?<TextInput id="opp-stage" labelText="销售阶段" value={stageLabel(data.stage)} readOnly/>:select('opp-stage','销售阶段',data.stage,onStageChange,stageOptions)}{select('opp-priority','商机优先级',data.priority,v=>set('priority',v),priorities)}{select('opp-qualification','资格评估',data.qualification_status,v=>set('qualification_status',v),qualifications)}{label('opp-probability','赢率（%）',data.probability,v=>set('probability',v))}{select('opp-lost-reason','输单原因',data.lost_reason||'',v=>set('lost_reason',v),[['','不适用'],...lostReasons])}{select('opp-win-reason','赢单原因',data.win_reason||'',v=>set('win_reason',v),[['','不适用'],...wonReasons])}{area('opp-lost-notes','输单备注',data.lost_notes,v=>set('lost_notes',v))}</div></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>商业金额</h2><div className="tp-opportunities__grid">{label('opp-amount','预计金额',data.amount,v=>set('amount',v))}{select('opp-currency','币种',data.currency_code,v=>set('currency_code',v),[['USD','USD'],['EUR','EUR'],['GBP','GBP'],['CNY','CNY'],['TWD','TWD'],['JPY','JPY']])}{label('opp-actual','实际成交金额',data.actual_amount,v=>set('actual_amount',v))}{label('opp-quantity','预计采购数量',data.expected_quantity,v=>set('expected_quantity',v))}{label('opp-margin','预计毛利',data.expected_margin,v=>set('expected_margin',v))}{label('opp-margin-rate','预计毛利率（%）',data.expected_margin_rate,v=>set('expected_margin_rate',v))}{label('opp-products','产品 / 服务',data.products,v=>set('products',v),'多个产品以逗号分隔')}</div><p className="tp-opportunities__hint">加权预测金额由预计金额 × 赢率计算；实际成交金额应在订单实体接入后由订单汇总。</p></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>销售管理</h2><div className="tp-opportunities__grid">{label('opp-sales-person','商机负责人',data.sales_person,v=>set('sales_person',v))}{(teams.length?select('opp-sales-team','销售团队',data.sales_team,v=>set('sales_team',v),[['','请选择销售团队'],...teams]):label('opp-sales-team','销售团队',data.sales_team,v=>set('sales_team',v)))}{select('opp-source','商机来源',data.source,v=>set('source',v),sources)}{label('opp-campaign','营销活动',data.campaign,v=>set('campaign',v))}{label('opp-lead-source','来源线索编号 / ID',data.lead_source_detail,v=>set('lead_source_detail',v))}</div></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>时间计划</h2><div className="tp-opportunities__grid">{label('opp-expected-close','预计成交日期',data.expected_close_date,v=>set('expected_close_date',v),'YYYY-MM-DD')}{label('opp-first-contact','首次联系日期',data.first_contact_date,v=>set('first_contact_date',v),'YYYY-MM-DD')}{label('opp-next-activity-date','下次活动日期',data.next_activity_date,v=>set('next_activity_date',v),'YYYY-MM-DD')}{label('opp-next-activity-at','下次活动时间',data.next_activity_at,v=>set('next_activity_at',v),'ISO 日期时间')}{select('opp-next-activity-type','活动类型',data.next_activity_type,v=>set('next_activity_type',v),activities)}{area('opp-next-step','下一步行动',data.next_step,v=>set('next_step',v))}</div></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>竞争情况</h2><div className="tp-opportunities__grid">{label('opp-competitor','竞争对手',data.competitor,v=>set('competitor',v),'多个竞争对手以逗号分隔')}{label('opp-competitive-product','竞争产品',data.competitive_product,v=>set('competitive_product',v))}{area('opp-competitive-advantages','我方竞争优势',data.competitive_advantages,v=>set('competitive_advantages',v))}{area('opp-competitive-disadvantages','我方竞争劣势',data.competitive_disadvantages,v=>set('competitive_disadvantages',v))}</div></div></TabPanel>
      <TabPanel><div className="tp-opportunities__tab-content"><h2>跟进记录</h2><div className="tp-opportunities__grid">{area('opp-follow-up-summary','最近跟进结果',data.follow_up_summary,v=>set('follow_up_summary',v))}{area('opp-internal-notes','内部备注',data.internal_notes,v=>set('internal_notes',v))}</div><p className="tp-opportunities__hint">活动中心尚未建立独立活动实体；当前保存下一步行动与跟进摘要，不虚构活动记录。</p></div></TabPanel>
    </TabPanels></Tabs></section>
    <footer className="tp-opportunities__footer"><span>商机名称、所属客户为必填项；主要联系人只能选择该客户下的联系人。</span><div><Link href="/opportunities">取消</Link><Button kind="primary" disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'保存商机'}</Button></div></footer>
  </main>;
}

export function OpportunityDetailPage() {
 const nav=useNavigate(); const {id}=useParams(); const lifecycleEvents=useBusinessTransitionEvents('opportunity',id);
 const [row,setRow]=useState<Opportunity|null>(null); const [account,setAccount]=useState(''); const [contact,setContact]=useState('');
 const [relations,setRelations]=useState<Array<{id:string;source_record_type:string;source_record_id:string;target_record_type:string;target_record_id:string;relation_type:string;created_at:string}>>([]);
 const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
 const [lifecycleOpen,setLifecycleOpen]=useState(false); const [nextStage,setNextStage]=useState(''); const [transitionNote,setTransitionNote]=useState('');
 const [quoteModalOpen,setQuoteModalOpen]=useState(false); const [quoteMode,setQuoteMode]=useState('single'); const [quoteConfirmed,setQuoteConfirmed]=useState(false);
 const [confirmed,setConfirmed]=useState(false); const [saving,setSaving]=useState(false); const [transitionError,setTransitionError]=useState('');
 const load=useCallback(async()=>{
   setLoading(true);setError('');
   try{
     const db=await getSupabaseClient();
     const r=await db.from('crm_opportunities').select('*').eq('id',id).single();if(r.error)throw r.error;
     const o=r.data as Opportunity;setRow(o);
     const [a,c,sourceRelations,targetRelations]=await Promise.all([
       db.from('crm_accounts').select('account_name').eq('id',o.account_id).maybeSingle(),
       o.primary_contact_id?db.from('crm_contacts').select('full_name,first_name,last_name').eq('id',o.primary_contact_id).maybeSingle():Promise.resolve({data:null,error:null}),
       db.from('business_record_relations').select('id,source_record_type,source_record_id,target_record_type,target_record_id,relation_type,created_at').eq('source_record_type','opportunity').eq('source_record_id',id).order('created_at',{ascending:false}),
       db.from('business_record_relations').select('id,source_record_type,source_record_id,target_record_type,target_record_id,relation_type,created_at').eq('target_record_type','opportunity').eq('target_record_id',id).order('created_at',{ascending:false})
     ]);
     if(a.error)throw a.error;if(c.error)throw c.error;
     if(sourceRelations.error)throw sourceRelations.error;if(targetRelations.error)throw targetRelations.error;
     setAccount(a.data?.account_name||'—');
     setContact(c.data?(c.data.full_name||[c.data.first_name,c.data.last_name].filter(Boolean).join(' ')):'—');
     setRelations([...(sourceRelations.data||[]),...(targetRelations.data||[])]);
   }catch(e){setError(e instanceof Error?e.message:'读取商机详情失败')}
   finally{setLoading(false)}
 },[id]);
 useEffect(()=>{void load()},[load]); const lifecycleStages=stages.filter(([key])=>key!=='won'&&key!=='lost');
 const terminal=row?.stage==='won'||row?.stage==='lost';
 const nextOptions=(()=>{if(!row||terminal)return[];const idx=lifecycleStages.findIndex(([key])=>key===row.stage);const next=idx>=0?lifecycleStages[idx+1]:lifecycleStages[0];return [...(next?[[next[0],next[1]] as [string,string]]:[]),['won','已赢单'],['lost','已输单'] as [string,string]]})();
 const openLifecycle=()=>{setNextStage(nextOptions[0]?.[0]||'');setTransitionNote('');setConfirmed(false);setTransitionError('');setLifecycleOpen(true)};
 const submitTransition=async()=>{
   if(!row||!id||!nextStage)return;
   if(!confirmed){setTransitionError('请先确认本次阶段变更及业务资料。');return}
   if(nextStage==='lost'&&!transitionNote.trim()){setTransitionError('输单时必须填写原因或备注。');return}
   setSaving(true);setTransitionError('');
   try{
     const db=await getSupabaseClient();const {data:sessionData}=await db.auth.getSession();const user=sessionData.session?.user;
     if(!user)throw new Error('登录状态已失效，请重新登录。');
     const transition=await db.rpc('confirm_opportunity_stage_transition',{
       p_opportunity_id:row.id,p_expected_stage:row.stage,p_target_stage:nextStage,p_note:transitionNote.trim()||null
     });
     if(transition.error)throw transition.error;
     setLifecycleOpen(false);await load();
   }catch(e){setTransitionError(e instanceof Error?e.message:'阶段变更失败')}
   finally{setSaving(false)}
 };
 if(loading)return <main className="tp-opportunities"><InlineLoading description="正在读取商机详情…"/></main>;
 if(error||!row)return <main className="tp-opportunities"><InlineNotification kind="error" title="无法打开商机" subtitle={error||'商机不存在'}/><Link href="/opportunities">返回列表</Link></main>;
 return <main className="tp-opportunities">
   <PageHeader className="tp-opportunities__header"><div><p className="tp-opportunities__eyebrow">TRADEPILOT / CRM / OPPORTUNITY</p><h1>{row.name}</h1><p>{row.opportunity_number} · {account} · {stageLabel(row.stage)}</p></div>
     <div className="tp-opportunities__actions tp-responsive-header-actions"><Link className="tp-opportunities__primary-action tp-responsive-header-actions__primary" href={'/opportunities/'+row.id+'/edit'} renderIcon={semanticIcons.edit}>编辑商机</Link><div className="tp-opportunities__secondary-actions tp-responsive-header-actions__secondary"><Link href="/opportunities">返回列表</Link><Link href={'/quotes/new?opportunity='+row.id} renderIcon={semanticIcons.document}>创建报价单</Link><Button kind="tertiary" disabled={terminal} onClick={openLifecycle}>管理生命周期</Button></div></div>
   </PageHeader>
   <BusinessLifecycle title="商机生命周期" steps={lifecycleStages.map(([value,label])=>({value,label}))} current={row.stage} terminal={terminal} terminalKind={row.stage==='won'?'success':'warning'} terminalTitle={row.stage==='won'?'商机已赢单':'商机已输单'} description={terminal?'商机已进入终止阶段':`当前阶段：${stageLabel(row.stage)}`} events={lifecycleEvents}>
     <div className="tp-opportunities__lifecycle-foot"><span>阶段变更需要人工确认；报价、订单等下游记录的生成不会仅凭阶段按钮自动发生。</span>{!terminal&&<Button kind="tertiary" size="sm" onClick={openLifecycle}>确认下一阶段</Button>}</div>
   </BusinessLifecycle>
   <section className="tp-opportunities__primary"><div className="tp-opportunities__detail-grid">{[['所属客户',account],['主要联系人',contact],['销售阶段',stageLabel(row.stage)],['商机状态',row.status],['预计金额',row.currency_code+' '+Number(row.amount||0).toLocaleString()],['赢率',row.probability+'%'],['加权预测金额',row.currency_code+' '+(Number(row.amount||0)*Number(row.probability||0)/100).toLocaleString()],['预计成交日期',row.expected_close_date||'—'],['负责人',row.sales_person||'—'],['销售团队',row.sales_team||'—'],['来源',row.source||'—'],['优先级',row.priority||'普通']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{row.description&&<p>{row.description}</p>}</section>
   <section className="tp-opportunities__panel"><div className="tp-opportunities__panel-head"><div><h2>关联业务</h2><p>显示以本商机为来源或目标的业务记录。</p></div><Tag type="blue">{relations.length} 条关联</Tag></div>
     {relations.length?<div className="tp-opportunities__relations">{relations.map(rel=><div className="tp-opportunities__relation" key={rel.id}><div><strong>{rel.source_record_type==='opportunity'?'本商机':rel.source_record_type} → {rel.target_record_type==='opportunity'?'本商机':rel.target_record_type}</strong><small>{rel.relation_type} · {new Date(rel.created_at).toLocaleString()}</small></div><code>{rel.source_record_id===row.id?rel.target_record_id:rel.source_record_id}</code></div>)}</div>:<p className="tp-opportunities__empty">暂无已登记的业务关联。后续转换成功后会自动显示来源与目标记录。</p>}
   </section>
   
   <ComposedModal open={quoteModalOpen} onClose={()=>setQuoteModalOpen(false)}>
     <ModalHeader title="从商机创建报价" label={row.opportunity_number}/>
     <ModalBody hasForm>
       <p className="tp-opportunities__modal-intro">选择报价生成方式。客户、联系人、产品和商机信息将在下一步自动带入报价表单；价格、数量分配、有效期及商务条款仍需补全或确认。</p>
       <RadioButtonGroup legendText="报价生成方式" name="opportunity-quote-mode" value={quoteMode} onChange={value=>setQuoteMode(String(value))}>
         <RadioButton id="opportunity-quote-single" value="single" labelText="一个综合报价"/>
         <RadioButton id="opportunity-quote-split" value="split" labelText="拆分为多个报价方案"/>
       </RadioButtonGroup>
       <div className="tp-opportunities__conversion-inherit">
         <strong>将从当前商机继承</strong>
         <span>客户：{account}</span><span>联系人：{contact}</span>
         <span>预计金额：{row.currency_code} {Number(row.amount||0).toLocaleString()}</span>
         <span>产品明细：{Array.isArray(row.product_items)?row.product_items.length:0} 项</span>
       </div>
       <Checkbox id="opportunity-quote-confirm" labelText="我已确认来源商机及报价生成方式，继续补全报价资料。" checked={quoteConfirmed} onChange={(_,data)=>setQuoteConfirmed(Boolean(data.checked))}/>
     </ModalBody>
     <ModalFooter>
       <Button kind="secondary" onClick={()=>setQuoteModalOpen(false)}>取消</Button>
       <Button kind="primary" disabled={!quoteConfirmed} onClick={()=>nav('/quotes/new?opportunity='+row.id+'&conversion='+quoteMode)}>继续补全报价</Button>
     </ModalFooter>
   </ComposedModal>
   <ComposedModal open={lifecycleOpen} onClose={()=>{if(!saving)setLifecycleOpen(false)}}>
     <ModalHeader title="确认商机生命周期变更" label={row.opportunity_number}/>
     <ModalBody hasForm>
       <div className="tp-opportunities__transition-summary"><span>当前阶段</span><strong>{stageLabel(row.stage)}</strong><semanticIcons.next size={16}/><span>目标阶段</span><strong>{stageLabel(nextStage)||'请选择'}</strong></div>
       <div className="tp-opportunities__field"><Select id="opportunity-next-stage" labelText="目标阶段" value={nextStage} onChange={e=>setNextStage(e.currentTarget.value)}>{nextOptions.map(([value,title])=><SelectItem key={value} value={value} text={title}/>)}</Select></div>
       <div className="tp-opportunities__field"><TextArea id="opportunity-transition-note" labelText={nextStage==='lost'?'输单原因 / 备注 *':'确认说明'} value={transitionNote} rows={3} onChange={e=>setTransitionNote(e.currentTarget.value)} placeholder="说明本次阶段变更的业务依据"/></div>
       <Checkbox id="opportunity-transition-confirm" labelText="我已核实商机信息，并确认进入所选阶段。" checked={confirmed} onChange={(_,data)=>setConfirmed(Boolean(data.checked))}/>
       {transitionError&&<InlineNotification kind="error" title="无法提交" subtitle={transitionError}/>}
     </ModalBody>
     <ModalFooter>
       <Button kind="secondary" disabled={saving} onClick={()=>setLifecycleOpen(false)}>取消</Button>
       <Button kind="primary" disabled={saving||!confirmed||!nextStage||(nextStage==='lost'&&!transitionNote.trim())} onClick={()=>void submitTransition()}>{saving?'提交中…':'确认并更新'}</Button>
     </ModalFooter>
   </ComposedModal>
 </main>;
}
