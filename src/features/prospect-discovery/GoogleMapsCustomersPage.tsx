import { useEffect, useMemo, useState } from 'react';
import { Link, PageHeader, Tag, Tile, TpDataTable, InlineNotification, WorldMapChart, semanticIcons, Modal, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Occurrence={id:string;run_id:string;keyword?:string;provider?:string;source_url?:string;raw_data?:Record<string,unknown>;captured_at?:string;is_removed?:boolean;run?:{task_code?:string;query?:string;countries?:string[];state?:string;city?:string}|Array<{task_code?:string;query?:string;countries?:string[];state?:string;city?:string}>;record?:Record<string,any>|null};
const display=(value:unknown)=>value===null||value===undefined||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);
const formatTime=(value?:string)=>value?new Date(value).toLocaleString('zh-TW',{hour12:false}):'—';
const runOf=(value:Occurrence['run'])=>Array.isArray(value)?value[0]:value;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
 const client = await getSupabaseClient();
 const { data } = await client.auth.getSession();
 const token = data.session?.access_token;
 if (!token) throw new Error('登录状态已失效，请重新登录。');
 const response = await fetch(path, {
  ...init,
  headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
 });
 const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
 if (!response.ok) throw new Error(payload.error?.message || '请求失败（HTTP ' + response.status + '）');
 return (payload.data ?? payload) as T;
}

export function GoogleMapsCustomersPage(){
 const [items,setItems]=useState<Occurrence[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const [search,setSearch]=useState('');
 const [pendingEditRows,setPendingEditRows]=useState<Record<string,any>[]>([]);
 const [editOpen,setEditOpen]=useState(false);
 const [editBusy,setEditBusy]=useState(false);
 const [editDraft,setEditDraft]=useState({name:'',address:'',phone:'',website:''});
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  (async()=>{
   setLoading(true);
   try{
    const db=await getSupabaseClient();
    const {data,error}=await db.from('discovery_record_occurrences').select('id,run_id,keyword,provider,source_url,raw_data,captured_at,is_removed,run:discovery_runs!discovery_record_occurrences_run_id_owner_id_fkey(task_code,query,countries,state,city),record:discovery_records!discovery_record_occurrences_record_id_owner_id_fkey(*)').eq('provider','google_maps').eq('is_removed',false).order('captured_at',{ascending:false}).limit(2000);
    if(error)throw error;
    if(active)setItems((data??[]) as unknown as Occurrence[]);
   }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Google Maps 发现客户读取失败。');}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[reload]);
 const rows=useMemo<Record<string, any>[]>(()=>items.filter(item=>item.record&&item.record.status!=='removed'&&item.record.status!=='discarded').map(item=>{
  const run=runOf(item.run);const record=item.record||{};
  const raw={...(record.raw_data||{}),...(item.raw_data||{})};
  return {...record,occurrence_id:item.id,run_id:item.run_id,task_code:run?.task_code||item.run_id,search_keyword:item.keyword||run?.query||'—',search_address:[run?.city,run?.state,(run?.countries||[]).join(', ')].filter(Boolean).join(' · '),captured_at:item.captured_at,raw_data:raw};
 }),[items]);
 const filtered=useMemo(()=>{const query=search.trim().toLocaleLowerCase();return rows.filter(row=>!query||[row.name,row.address,row.task_code,row.search_keyword,row.search_address,row.phone,row.website].join(' ').toLocaleLowerCase().includes(query));},[rows,search]);
 const countries=useMemo(()=>{
  const counts=new Map<string,number>();
  rows.forEach(row=>{const code=String(row.country_code||'').toUpperCase();if(code&&code!=='ZZ')counts.set(code,(counts.get(code)||0)+1);});
  return [...counts.entries()].map(([code,value])=>{let label=code;try{label=new Intl.DisplayNames(['zh-TW'],{type:'region'}).of(code)||code;}catch{}return {code,label,value};}).sort((a,b)=>b.value-a.value);
 },[rows]);
 const uniqueCount=new Set(rows.map(row=>row.id)).size;
 const converted=rows.filter(row=>row.status==='promoted'||!!row.lead_id||row.raw_data?.lifecycle_stage==='converted').length;
 const dynamicKeys=[...new Set(rows.flatMap(row=>Object.keys((row.raw_data||{}) as Record<string,unknown>)))].filter(key=>!['place_id','formatted_address','phone','website','rating','user_rating_count','business_status','types','guardrail_review_required'].includes(key)).sort();
 const columns=[
  {key:'name',header:'企业名称',primary:true,minWidth:190,render:(row:any)=>row.name||'—'},
  {key:'task_code',header:'任务 ID',minWidth:160},
  {key:'search_address',header:'搜索地址',minWidth:200},
  {key:'search_keyword',header:'搜索关键字',minWidth:180},
  {key:'address',header:'Google Maps 地址',minWidth:240},
  {key:'phone',header:'电话',minWidth:140},
  {key:'website',header:'官网',minWidth:180,render:(row:any)=>row.website&&String(row.website).startsWith('http')?<a href={String(row.website)} target="_blank" rel="noreferrer">打开官网</a>:row.website||'—'},
  {key:'rating',header:'评分',minWidth:80,render:(row:any)=>display(row.raw_data?.rating)},
  {key:'country_code',header:'国家',minWidth:90},
  ...dynamicKeys.map(key=>({key:'raw_'+key,header:key,minWidth:160,render:(row:any)=>display(row.raw_data?.[key]),exportValue:(row:any)=>display(row.raw_data?.[key])})),
  {key:'captured_at',header:'发现时间',minWidth:160,render:(row:any)=>formatTime(row.captured_at)}
 ];
 return <main className="tp-gmaps-customers">
  <PageHeader className="tp-gmaps-customers__header"><div><p>TRADEPILOT / GOOGLE MAPS</p><h1>Google Maps 发现客户</h1><p>汇总全部 Google Maps 发现结果，保留 Google 返回字段，并追溯来源任务、搜索地址和关键词。</p></div><div className="tp-gmaps-customers__actions"><Link href="/prospect-discovery/google-maps" renderIcon={semanticIcons.search}>Google Maps 发现</Link><Link href="/prospect-discovery/google-maps/tasks" renderIcon={semanticIcons.time}>任务中心</Link></div></PageHeader>
  {error&&<InlineNotification kind="error" lowContrast title="客户数据读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  <section className="tp-gmaps-customers__cards">
   <div className="tp-gmaps-customers__card"><div className="tp-gmaps-customers__card-icon"><semanticIcons.database size={20}/></div><div><span>发现结果总数</span><strong>{rows.length.toLocaleString()}</strong></div></div>
   <div className="tp-gmaps-customers__card"><div className="tp-gmaps-customers__card-icon"><semanticIcons.building size={20}/></div><div><span>去重企业数</span><strong>{uniqueCount.toLocaleString()}</strong></div></div>
   <div className="tp-gmaps-customers__card"><div className="tp-gmaps-customers__card-icon"><semanticIcons.users size={20}/></div><div><span>已转为 CRM 客户</span><strong>{converted.toLocaleString()}</strong></div></div>
   <div className="tp-gmaps-customers__card"><div className="tp-gmaps-customers__card-icon"><semanticIcons.globe size={20}/></div><div><span>覆盖国家 / 地区</span><strong>{countries.length.toLocaleString()}</strong></div></div>
  </section>
  <section className="tp-gmaps-customers__analytics">
   <div className="tp-gmaps-customers__map"><h2>潜客全球分布</h2><p>按 Google Maps 返回的国家代码统计发现企业数量。</p>{countries.length?<WorldMapChart data={countries} unitLabel="家企业"/>:<p className="tp-gmaps-customers__empty">暂无可定位国家的潜客数据。</p>}</div>
   <div className="tp-gmaps-customers__map"><h2>国家分布统计</h2>{countries.slice(0,12).map(item=><div className="tp-gmaps-customers__country-row" key={item.code}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
  </section>
  <Tile className="tp-gmaps-customers__panel">
   <div className="tp-gmaps-customers__panel-heading"><div><h2>全部 Google Maps 发现客户</h2><p>每条记录保留来源任务与原始字段；同一企业在不同任务中的发现记录分别保留。</p></div><Tag type="blue">{filtered.length} 条</Tag></div>
   <TpDataTable
    ariaLabel="Google Maps 发现客户结果"
    rowKey="occurrence_id"
    rows={filtered as any[]}
    columns={columns as any}
    selectable
    batchActions={[
     {key:'edit-selected',label:'批量编辑',onClick:(selected:any[])=>{setPendingEditRows(selected);setEditDraft({name:'',address:'',phone:'',website:''});setEditOpen(true);}},
     {key:'delete-selected',label:'删除所选',confirmation:'确定删除选中的发现记录吗？这只会移除所选任务中的 Google Maps 发现记录，不会删除 CRM 客户。',onClick:async(selected:any[])=>{for(const row of selected){await api('/api/v1/discovery-records/'+row.id+'/action',{method:'POST',body:JSON.stringify({action:'remove',runId:row.run_id})});}setNotice('已删除 '+selected.length+' 条所选发现记录。');setReload(v=>v+1);}},
     {key:'push-selected',label:'推送到客户',onClick:async(selected:any[])=>{let pushed=0,queued=0,failed=0;for(const row of selected){try{if(row.status==='promoted'||row.lead_id)continue;const raw=row.raw_data||{};const stage=String(raw.lifecycle_stage||'discovered');if(stage!=='collected'){if(stage==='discovered')await api('/api/v1/discovery-records/'+row.id+'/action',{method:'POST',body:JSON.stringify({action:'review'})});await api('/api/v1/discovery-contact-enrichments',{method:'POST',body:JSON.stringify({recordIds:[row.id],providers:[row.website?'website':'apollo']})});queued++;continue;}const intel=raw.contact_intelligence&&typeof raw.contact_intelligence==='object'?raw.contact_intelligence:{};const candidates=Array.isArray(intel.candidates)?intel.candidates:[];const candidateKeys=candidates.filter((item:any)=>String(item.full_name||'').trim()).map((item:any)=>String(item.provider||'')+'：'+String(item.provider_person_id||item.email||item.linkedin_url||item.full_name));if(!candidateKeys.length)throw new Error('没有可转换的联系人');await api('/api/v1/discovery-contact-candidates/convert',{method:'POST',body:JSON.stringify({recordId:row.id,candidateKeys})});pushed++;}catch{failed++;}}setNotice('批量推送完成：成功 '+pushed+' 家；已启动联系人补全 '+queued+' 家；失败 '+failed+' 家。补全完成后可再次推送。');setReload(v=>v+1);}}
    ]}
    searchValue={search}
    onSearchChange={setSearch}
    loading={loading}
    error={error||null}
    onRetry={()=>setReload(v=>v+1)}
    columnSettingsKey="google-maps-discovered-customers"
    emptyState={<p className="tp-gmaps-customers__empty">暂无 Google Maps 发现客户。完成首次搜索后，所有结果会自动汇总到这里。</p>}
   />
  </Tile>
  {notice&&<InlineNotification kind="success" lowContrast title="操作结果" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <Modal open={editOpen} modalHeading={`批量编辑所选的 ${pendingEditRows.length} 条记录`} primaryButtonText={editBusy?'保存中…':'保存修改'} secondaryButtonText="取消" primaryButtonDisabled={editBusy||!Object.values(editDraft).some(value=>value.trim())} onRequestClose={()=>setEditOpen(false)} onRequestSubmit={()=>void (async()=>{setEditBusy(true);try{const patch=Object.fromEntries(Object.entries(editDraft).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]));for(const row of pendingEditRows)await api('/api/v1/discovery-records/'+row.id+'/action',{method:'POST',body:JSON.stringify({action:'update',patch})});setNotice('已批量更新 '+pendingEditRows.length+' 条发现记录。');setEditOpen(false);setReload(v=>v+1);}catch(cause){setError(cause instanceof Error?cause.message:'批量编辑失败。');}finally{setEditBusy(false);}})()}>
   <div className="tp-gmaps-customers__edit-fields">
    <p>留空的字段保持原值不变；输入的内容会应用到所有选中企业。</p>
    <TextInput id="gmaps-edit-name" labelText="企业名称" value={editDraft.name} onChange={event=>setEditDraft(value=>({...value,name:event.currentTarget.value}))}/>
    <TextInput id="gmaps-edit-address" labelText="地址" value={editDraft.address} onChange={event=>setEditDraft(value=>({...value,address:event.currentTarget.value}))}/>
    <TextInput id="gmaps-edit-phone" labelText="电话" value={editDraft.phone} onChange={event=>setEditDraft(value=>({...value,phone:event.currentTarget.value}))}/>
    <TextInput id="gmaps-edit-website" labelText="官网" value={editDraft.website} onChange={event=>setEditDraft(value=>({...value,website:event.currentTarget.value}))}/>
   </div>
  </Modal>
 </main>;
}
