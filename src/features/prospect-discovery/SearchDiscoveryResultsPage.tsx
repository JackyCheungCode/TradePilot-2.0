import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, InlineNotification, Link, Tag, TextInput, Select, SelectItem, TpDataTable } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/search-engine-discovery.scss';

type RecordRow = { id:string; name?:string|null; website?:string|null; country_code?:string|null; status?:string; raw_data?:Record<string,unknown>|null; updated_at?:string };
type Occurrence = { record_id:string; run_id:string; keyword?:string|null; source_url?:string|null };
type Run = { id:string; task_code?:string|null; query?:string|null; countries?:string[]|null };
type DisplayRow = RecordRow & { table_id:string; task_id:string; task_code:string; keyword:string; group_label:string; address:string; phone:string; email:string; contact_person:string; products:string; company_description:string; business_type:string; website_confidence:string; official_website_reason:string; evidence_count:string; analysis_status:string; source_url:string };
function analysisOf(row:RecordRow):Record<string,unknown>|null { const value=row.raw_data?.website_analysis; return value&&typeof value==='object'?value as Record<string,unknown>:null; }
const asText=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
export function SearchDiscoveryResultsPage(){
 const [rows,setRows]=useState<RecordRow[]>([]);
 const [occurrences,setOccurrences]=useState<Occurrence[]>([]);
 const [runs,setRuns]=useState<Run[]>([]);
 const [query,setQuery]=useState('');
 const [scope,setScope]=useState<'all'|'candidate'|'analyzed'>('all');
 const [groupBy,setGroupBy]=useState<'task'|'keyword'>('task');
 const [taskFilter,setTaskFilter]=useState('all');
 const [keywordFilter,setKeywordFilter]=useState('all');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [refreshKey,setRefreshKey]=useState(0);
 useEffect(()=>{let live=true;void (async()=>{
  const client=await getSupabaseClient();
  const allRecords:RecordRow[]=[];
  for(let offset=0;;offset+=1000){const{data,error}=await client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').order('updated_at',{ascending:false}).range(offset,offset+999);if(error)throw error;allRecords.push(...(data??[]) as RecordRow[]);if(!data||data.length<1000)break;}
  const allOccurrences:Occurrence[]=[];
  for(let offset=0;;offset+=1000){const{data,error}=await client.from('discovery_record_occurrences').select('record_id,run_id,keyword,source_url').order('created_at',{ascending:false}).range(offset,offset+999);if(error)throw error;allOccurrences.push(...(data??[]) as Occurrence[]);if(!data||data.length<1000)break;}
  const allRuns:Run[]=[];
  for(let offset=0;;offset+=1000){const{data,error}=await client.from('discovery_runs').select('id,task_code,query,countries').eq('channel','search_engine').order('created_at',{ascending:false}).range(offset,offset+999);if(error)throw error;allRuns.push(...(data??[]) as Run[]);if(!data||data.length<1000)break;}
  if(!live)return;setRows(allRecords);setOccurrences(allOccurrences);setRuns(allRuns);
 })().catch(e=>live&&setError(e instanceof Error?e.message:'结果读取失败')).finally(()=>live&&setLoading(false));return()=>{live=false}},[refreshKey]);
 const runById=useMemo(()=>new Map(runs.map(run=>[run.id,run])),[runs]);
 const tasks=useMemo(()=>[...new Map(runs.map(run=>[run.id,{value:run.id,label:(run.task_code||run.id.slice(0,8))+' · '+(run.query||'未命名关键词')}])).values()],[runs]);
 const keywords=useMemo(()=>[...new Set([...occurrences.map(item=>item.keyword),...runs.map(run=>run.query)].filter((value):value is string=>!!value))].sort(),[occurrences,runs]);
 const enriched=useMemo(()=>rows.flatMap(row=>{
  const matches=occurrences.filter(item=>item.record_id===row.id);
  const memberships=matches.length?matches:[{record_id:row.id,run_id:'unassigned',keyword:'未关联搜索词'} as Occurrence];
  return memberships.map((occurrence,index)=>{const run=runById.get(occurrence.run_id);const a=analysisOf(row)??{};const taskCode=run?.task_code||'未关联任务';const keyword=occurrence.keyword||run?.query||'未记录搜索词';const label=groupBy==='task'?taskCode+' · '+(run?.query||keyword):keyword;return {...row,table_id:row.id+'-'+occurrence.run_id+'-'+index,task_id:occurrence.run_id,task_code:taskCode,keyword,group_label:label,address:asText(a.address),phone:asText(a.phone),email:asText(a.email),contact_person:asText(a.contact_person),products:Array.isArray(a.products)?(a.products as string[]).join('、'):'—',company_description:asText(a.company_description),business_type:asText(a.business_type),website_confidence:a.website_confidence===undefined?'—':String(a.website_confidence)+'/100',official_website_reason:asText(a.official_website_reason),evidence_count:Array.isArray(a.evidence)?String(a.evidence.length):'0',analysis_status:a.status==='completed'?'已分析':'候选网站',source_url:occurrence.source_url||row.website||'—'} as DisplayRow;});
 }),[rows,occurrences,runById,groupBy]);
 const filtered=useMemo(()=>enriched.filter(row=>{const done=row.analysis_status==='已分析';if(scope==='analyzed'&&!done)return false;if(scope==='candidate'&&done)return false;if(taskFilter!=='all'&&row.task_id!==taskFilter)return false;if(keywordFilter!=='all'&&row.keyword!==keywordFilter)return false;return [row.name,row.website,row.country_code,row.task_code,row.keyword].join(' ').toLowerCase().includes(query.toLowerCase());}),[enriched,scope,taskFilter,keywordFilter,query,runById]);
 const groups=useMemo(()=>{const map=new Map<string,DisplayRow[]>();for(const row of filtered){const key=groupBy==='task'?row.group_label:row.keyword;if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);}return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));},[filtered,groupBy]);
 const exportCsv=()=>{const headers=['公司名称','官网','国家','地址','电话','邮箱','联系人','产品','企业简介','企业类型','官网可信度','判断理由','任务','搜索词','来源网页','证据数量','记录状态'];const lines=[headers,...filtered.map(row=>[row.name,row.website,row.country_code,row.address,row.phone,row.email,row.contact_person,row.products,row.company_description,row.business_type,row.website_confidence,row.official_website_reason,row.task_code,row.keyword,row.source_url,row.evidence_count,row.status])];const quote=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='tradepilot-search-customers.csv';anchor.click();URL.revokeObjectURL(url);};
 const columns=[
  {key:'name',header:'公司名称 / 候选网站',primary:true,minWidth:240,render:(row:DisplayRow)=><div><strong>{asText(row.name)}</strong><p>{asText(row.website)}</p></div>},
  {key:'country_code',header:'国家 / 地区',minWidth:110},
  {key:'address',header:'地址',minWidth:180},
  {key:'phone',header:'电话',minWidth:140},
  {key:'email',header:'邮箱',minWidth:180},
  {key:'contact_person',header:'联系人',minWidth:120},
  {key:'products',header:'产品',minWidth:180},
  {key:'company_description',header:'企业简介',minWidth:240},
  {key:'business_type',header:'企业类型',minWidth:140},
  {key:'website_confidence',header:'官网可信度',minWidth:120},
  {key:'analysis_status',header:'状态',minWidth:100,render:(row:DisplayRow)=><Tag type={row.analysis_status==='已分析'?'green':'cool-gray'}>{row.analysis_status}</Tag>},
  {key:'official_website_reason',header:'官网判断理由',minWidth:220},
  {key:'evidence_count',header:'证据数',minWidth:90},
  {key:'task_code',header:'搜索任务',minWidth:150},
  {key:'keyword',header:'搜索词',minWidth:180},
 ];
 return <main className="tp-search-customers">
  <PageHeader><div><p className="tp-search-discovery__eyebrow">SEARCH ENGINE DISCOVERY / CUSTOMER DIRECTORY</p><h1>搜索客户</h1><p>所有搜索发现的候选企业与已分析客户集中管理；按任务或搜索词分组。</p></div><div className="tp-search-discovery__page-actions"><Button kind="secondary" onClick={()=>setRefreshKey(value=>value+1)}>刷新</Button><Button kind="secondary" onClick={exportCsv} disabled={!filtered.length}>导出 CSV</Button></div></PageHeader>
  {error&&<InlineNotification kind="error" title="读取失败" subtitle={error}/>}
  <div className="tp-search-discovery__page-actions"><Link href="/prospect-discovery/search-engine">返回搜索客户流程</Link><Link href="/prospect-discovery/search-engine/tasks">历史任务</Link></div>
  <div className="tp-search-discovery__result-filters">
   <TextInput id="search-customers-filter" labelText="搜索客户" placeholder="公司、官网、国家、任务或搜索词" value={query} onChange={event=>setQuery(event.currentTarget.value)}/>
   <Select id="search-customer-group" labelText="分组方式" value={groupBy} onChange={event=>setGroupBy(event.currentTarget.value as 'task'|'keyword')}><SelectItem value="task" text="按搜索任务分组"/><SelectItem value="keyword" text="按搜索词分组"/></Select>
   <Select id="search-customer-task-filter" labelText="筛选任务" value={taskFilter} onChange={event=>setTaskFilter(event.currentTarget.value)}><SelectItem value="all" text="全部任务"/>{tasks.map(task=><SelectItem key={task.value} value={task.value} text={task.label}/>)}</Select>
   <Select id="search-customer-keyword-filter" labelText="筛选搜索词" value={keywordFilter} onChange={event=>setKeywordFilter(event.currentTarget.value)}><SelectItem value="all" text="全部搜索词"/>{keywords.map(keyword=><SelectItem key={keyword} value={keyword} text={keyword}/>)}</Select>
  </div>
  <div className="tp-search-discovery__result-filters"><div><Button kind={scope==='all'?'primary':'tertiary'} size="sm" onClick={()=>setScope('all')}>全部（{rows.length}）</Button><Button kind={scope==='candidate'?'primary':'tertiary'} size="sm" onClick={()=>setScope('candidate')}>候选网站</Button><Button kind={scope==='analyzed'?'primary':'tertiary'} size="sm" onClick={()=>setScope('analyzed')}>已分析客户</Button></div><Tag type="blue">{filtered.length} 条记录 · {groups.length} 个分组</Tag></div>
  {loading?<p>正在读取搜索客户…</p>:!groups.length?<p>没有符合条件的搜索客户。</p>:groups.map(([group,groupRows])=><section className="tp-search-discovery__customer-group" key={group}><div className="tp-search-discovery__section-heading"><div><h2>{group}</h2><p>{groupRows.length} 条记录</p></div></div><TpDataTable<DisplayRow> ariaLabel={'搜索客户：'+group} rows={groupRows} rowKey="table_id" columns={columns} loading={false} columnSettingsKey={'search-customers-'+groupBy}/></section>)}
 </main>;
}
