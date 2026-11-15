import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, CarbonIcons,
  Tabs, TabList, Tab, TextInput, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { ProspectDiscoveryHeader } from './ProspectDiscoveryHeader';
import { applyDiscoveryRecordAction } from './api';
import { consolePlatformCatalog } from './platform-catalog';
import '@/design-system/patterns/prospect-console.scss';

interface ProspectRow {
  id: string; name: string; type: string; country: string; address: string;
  phone: string; email: string; website: string; latitude: number | null; longitude: number | null;
  status: 'converted' | 'pending'; leadId: string | null; discoveredAt: string;
  platforms: Array<{ key: string; label: string }>;
  recordIds: string[];
  sourceDetails?: Array<{ platform: string; fields: Array<{ label: string; value: string }> }>;
}
interface ConsoleStats {
  metrics: { platformCount: number; prospectCount: number; convertedCount: number; pendingCount: number };
  platforms: Array<{ key: string; label: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  prospects: ProspectRow[];
  timezone: string;
}
const periods = [
  { value: 'all', label: '全部历史数据' }, { value: 'today', label: '今天' },
  { value: '7', label: '最近 7 天' }, { value: '30', label: '最近 30 天' },
  { value: '90', label: '最近 90 天' }, { value: 'custom', label: '自定义范围' },
];
function countryLabel(code: string) {
  try { return new Intl.DisplayNames(['zh-TW'], { type: 'region' }).of(code.toUpperCase()) ?? code; }
  catch { return code; }
}
function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}
function PlatformIcon({ platform }: { platform: string }) {
  const Icon = platform === 'google_maps' ? CarbonIcons.Map
    : platform === 'facebook' ? CarbonIcons.LogoFacebook
    : platform === 'instagram' ? CarbonIcons.LogoInstagram
    : platform === 'search_engine' ? CarbonIcons.Search
    : CarbonIcons.Apps;
  return <Icon size={16} aria-hidden="true"/>;
}
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <section className="tp-console__metric"><div className="tp-console__metric-head"><span>{label}</span>{icon}</div><strong>{value.toLocaleString()}</strong></section>;
}
function PlatformChart({ items }: { items: ConsoleStats['platforms'] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无平台发现数据。</p>;
  return <div className="tp-console__bar-chart" role="img" aria-label="各发现平台潜客数量横向柱状图">
    {items.map(item => <div className="tp-console__bar-row" key={item.key}>
      <div className="tp-console__bar-label" title={item.label}><PlatformIcon platform={item.key}/><span>{item.label}</span></div>
      <div className="tp-console__bar-track"><svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width={item.count / max * 100} height="16" /></svg></div>
      <strong>{item.count.toLocaleString()}</strong>
    </div>)}
  </div>;
}
function CountryChart({ rows }: { rows: ProspectRow[] }) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const country = row.country?.trim();
    if (country && country !== '—') counts.set(country, (counts.get(country) ?? 0) + 1);
  });
  const items = [...counts.entries()].map(([country, count]) => ({ country, label: countryLabel(country), count }))
    .sort((a,b) => b.count-a.count || a.label.localeCompare(b.label)).slice(0,10);
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无可识别国家 / 地区的潜客。</p>;
  return <div className="tp-console__bar-chart" role="img" aria-label="按国家或地区统计的潜客与线索数量">
    {items.map(item => <div className="tp-console__bar-row" key={item.country}>
      <div className="tp-console__bar-label" title={item.label}><CarbonIcons.Map size={16} aria-hidden="true"/><span>{item.label}</span></div>
      <div className="tp-console__bar-track"><svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width={item.count / max * 100} height="16" /></svg></div>
      <strong>{item.count.toLocaleString()}</strong>
    </div>)}
  </div>;
}
function DailyChart({ items }: { items: ConsoleStats['daily'] }) {
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无每日发现数据。</p>;
  const width = Math.max(760, items.length * 30), height = 220, left = 42, right = 18, top = 16, bottom = 42;
  const max = Math.max(1, ...items.map(item => item.count));
  const points = items.map((item, index) => ({
    x: left + (items.length === 1 ? 0 : index * (width-left-right) / (items.length-1)),
    y: top + (height-top-bottom) * (1 - item.count / max), ...item,
  }));
  const labelStep = Math.max(1, Math.ceil(items.length / 12));
  return <div className="tp-console__line-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每日新增潜客总数趋势折线图">
    {[0,.5,1].map(fraction => { const y=top+(height-top-bottom)*fraction; return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="tp-console__grid-line"/><text x={left-8} y={y+4} textAnchor="end" className="tp-console__axis-label">{Math.round(max*(1-fraction))}</text></g>; })}
    <polyline points={points.map(point=>point.x+','+point.y).join(' ')} className="tp-console__line"/>
    {points.map((point,index)=><g key={point.date}><circle cx={point.x} cy={point.y} r="3.5" className="tp-console__point"><title>{point.date}: {point.count}</title></circle>{(index%labelStep===0||index===points.length-1)&&<text x={point.x} y={height-12} textAnchor="middle" className="tp-console__axis-label">{point.date.slice(5)}</text>}</g>)}
  </svg></div>;
}
function ProspectMap({ rows, onSelect }: { rows: ProspectRow[]; onSelect: (row: ProspectRow) => void }) {
  const located = rows.filter(row => row.latitude !== null && row.longitude !== null &&
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude >= -85.0511 && row.latitude <= 85.0511 && row.longitude >= -180 && row.longitude <= 180);
  const clusters = new Map<string, { x: number; y: number; rows: ProspectRow[] }>();
  located.forEach(row => {
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude) * Math.PI / 180;
    const x = (longitude + 180) / 360 * 1024;
    const y = (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * 1024;
    const key = Math.round(x / 5) + ':' + Math.round(y / 5);
    const cluster = clusters.get(key) ?? { x, y, rows: [] };
    cluster.rows.push(row);
    clusters.set(key, cluster);
  });
  return <div className="tp-console__map-wrap">
    <div className="tp-console__map" aria-label="OpenStreetMap 全球潜客主要地址分布图">
      <svg viewBox="0 256 1024 512" role="img" aria-label={`OpenStreetMap 地图上有 ${located.length} 家具有有效坐标的企业`}>
        <g aria-hidden="true">
          {[0,1,2,3].map(x => <g key={x}>
            {[1,2].map(y => <image key={y} href={`https://tile.openstreetmap.org/2/${x}/${y}.png`} x={x*256} y={y*256} width="256" height="256" />)}
          </g>)}
        </g>
        {[...clusters.values()].map(cluster => {
          const row = cluster.rows[0], count = cluster.rows.length;
          const markerY = cluster.y - 256;
          return <g key={row.id} className="tp-console__map-marker" role="button" tabIndex={0}
            aria-label={count > 1 ? `${count} 家企业，选择查看 ${row.name}` : row.name}
            onClick={() => onSelect(row)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row); } }}>
            <circle cx={cluster.x} cy={markerY} r={count > 1 ? 12 : 9} className="tp-console__map-halo" />
            <circle cx={cluster.x} cy={markerY} r={count > 1 ? 7 : 4} className="tp-console__map-dot">
              <title>{count > 1 ? `${count} 家企业聚合` : row.name + ' · ' + row.country}</title>
            </circle>
            {count > 1 && <text x={cluster.x} y={markerY+3} textAnchor="middle" className="tp-console__cluster-count">{count}</text>}
          </g>;
        })}
      </svg>
    </div>
    <div className="tp-console__map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div>
    {!located.length && <p className="tp-console__map-empty">当前筛选结果没有可用坐标的企业；未确认地址不会被虚构到地图上。</p>}
  </div>;
}
export function ProspectConsolePage() {
  const [stats,setStats] = useState<ConsoleStats|null>(null);
  const [period,setPeriod] = useState('all');
  const [customFrom,setCustomFrom] = useState('');
  const [customTo,setCustomTo] = useState('');
  const [platformKey,setPlatformKey] = useState('all');
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('all');
  const [country,setCountry] = useState('all');
  const [sort,setSort] = useState('newest');
  const [page,setPage] = useState(1);
  const pageSize = 15;
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const [selected,setSelected] = useState<ProspectRow|null>(null);
  const [actionBusyId,setActionBusyId] = useState('');
  const [confirmRemoveId,setConfirmRemoveId] = useState('');
  const [selectedIds,setSelectedIds] = useState<string[]>([]);
  const [confirmBulkRemove,setConfirmBulkRemove] = useState(false);
  const load = useCallback(async(nextPeriod:string,fromDate?:string,toDate?:string)=>{
    setError('');
    try{
      const client=await getSupabaseClient();
      const {data}=await client.auth.getSession();
      const token=data.session?.access_token;
      if(!token)throw new Error('登录状态已失效，请重新登录。');
      let query='';
      if(nextPeriod==='today'){
        const today=dateKey(new Date());query='?from='+today+'&to='+today;
      } else if(nextPeriod==='custom'&&fromDate&&toDate){
        query='?from='+fromDate+'&to='+toDate;
      } else if(nextPeriod!=='all'&&nextPeriod!=='custom'){
        const today=dateKey(new Date());
        const end=new Date(today+'T00:00:00Z'),start=new Date(end);
        start.setUTCDate(start.getUTCDate()-Number(nextPeriod)+1);
        query='?from='+start.toISOString().slice(0,10)+'&to='+today;
      }
      const response=await fetch('/api/v1/prospect-console'+query,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
      const payload=await response.json() as {data?:ConsoleStats;error?:{message?:string}};
      if(!response.ok)throw new Error(payload.error?.message??'读取潜客数据失败。');
      setStats(payload.data??payload as unknown as ConsoleStats);
    }catch(cause){setError(cause instanceof Error?cause.message:'读取潜客数据失败。');}
    finally{setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{if(period==='custom'){if(!customFrom||!customTo)return;if(customFrom>customTo){setError('开始日期不能晚于结束日期。');return;}}void load(period,customFrom,customTo);},[load,period,customFrom,customTo]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return (stats?.prospects??[]).filter(row=>
      (platformKey==='all'||row.platforms.some(item=>item.key===platformKey)) &&
      (status==='all'||row.status===status) &&
      (country==='all'||row.country===country) &&
      (!q||[row.name,row.country,row.address,row.website,row.phone,row.email].join(' ').toLocaleLowerCase().includes(q))
    ).sort((a,b)=>sort==='newest'?b.discoveredAt.localeCompare(a.discoveredAt):a.discoveredAt.localeCompare(b.discoveredAt));
  },[stats,platformKey,status,country,sort,search]);
  const runBulkAction=async(action:'promote'|'discard'|'remove')=>{
    if(!stats||actionBusyId||!selectedIds.length)return;
    setActionBusyId('bulk');setError('');
    try{
      const client=await getSupabaseClient();
      const {data}=await client.auth.getSession();
      const token=data.session?.access_token;
      if(!token)throw new Error('登录状态已失效，请重新登录。');
      const selectedRows=filtered.filter(row=>selectedIds.includes(row.id)&&(action!=='promote'||row.status==='pending'));
      const targets=selectedRows.flatMap(row=>(action==='promote'?row.recordIds.slice(0,1):row.recordIds));
      const results=await Promise.allSettled(targets.map(id=>applyDiscoveryRecordAction(token,id,action)));
      const failed=results.filter(result=>result.status==='rejected').length;
      await load(period,customFrom,customTo);
      setSelectedIds([]);setConfirmBulkRemove(false);setSelected(null);
      if(failed)setError(failed+' 条来源记录操作失败，请刷新后核对结果。');
    }catch(cause){setError(cause instanceof Error?cause.message:'批量潜客操作失败。');}
    finally{setActionBusyId('');}
  };
  const toggleSelected=(id:string,checked:boolean)=>setSelectedIds(previous=>checked?[...new Set([...previous,id])]:previous.filter(value=>value!==id));
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,totalPages);
  const paginatedRows=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const allVisibleSelected=paginatedRows.length>0&&paginatedRows.every(row=>selectedIds.includes(row.id));
  useEffect(()=>{setPage(1);},[platformKey,status,country,sort,search,period,customFrom,customTo]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages);},[page,totalPages]);
  const runAction=async(row:ProspectRow,action:'promote'|'discard'|'remove')=>{
    if(!stats||actionBusyId)return;
    setActionBusyId(row.id);setError('');
    try{
      const client=await getSupabaseClient();
      const {data}=await client.auth.getSession();
      const token=data.session?.access_token;
      if(!token)throw new Error('登录状态已失效，请重新登录。');
      const targets=action==='promote'?row.recordIds.slice(0,1):row.recordIds;
      const results=await Promise.allSettled(targets.map(id=>applyDiscoveryRecordAction(token,id,action)));
      const failed=results.filter(result=>result.status==='rejected').length;
      await load(period);
      setSelected(null);setConfirmRemoveId('');
      if(failed)setError(failed+' 条来源记录操作失败，请刷新后核对结果。');
    }catch(cause){setError(cause instanceof Error?cause.message:'潜客操作失败。');}
    finally{setActionBusyId('');}
  };
  const countries=[...new Set((stats?.prospects??[]).map(row=>row.country).filter(value=>value&&value!=='—'))].sort();
  const displayPlatforms=useMemo(()=>{
    const configured=consolePlatformCatalog.filter(item=>item.enabled).map(item=>({
      key:item.key,label:item.label,count:stats?.platforms.find(platform=>platform.key===item.key)?.count??0,
    }));
    const additional=(stats?.platforms??[]).filter(platform=>!consolePlatformCatalog.some(item=>item.key===platform.key));
    return [...configured,...additional];
  },[stats]);
  const selectedPendingCount=filtered.filter(row=>selectedIds.includes(row.id)&&row.status==='pending').length;
  useEffect(()=>{setSelectedIds(previous=>previous.filter(id=>filtered.some(row=>row.id===id)));},[filtered]);
  const maxDaily=Math.max(0,...(stats?.daily??[]).map(item=>item.count));
  const tabs=[{key:'all',label:'全部平台',count:stats?.metrics.prospectCount??0},...displayPlatforms];
  return <main className="tp-console">
    <ProspectDiscoveryHeader title="潜客控制台" description="汇总各发现渠道的潜客资产，查看全球分布、平台贡献与每日发现趋势。" showRecentTasks={false}/>
    {error&&<InlineNotification kind="error" title="数据读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <div className="tp-console__toolbar">
      <div><span className="tp-console__toolbar-label">统计时间范围</span><Select id="prospect-console-period" labelText="统计时间范围" hideLabel value={period} onChange={event=>setPeriod(event.currentTarget.value)}>{periods.map(item=><SelectItem key={item.value} value={item.value} text={item.label}/>)}</Select>
      {period==='custom'&&<div className="tp-console__date-range"><TextInput id="prospect-console-from" type="date" labelText="开始日期" value={customFrom} onChange={event=>setCustomFrom(event.currentTarget.value)}/><TextInput id="prospect-console-to" type="date" labelText="结束日期" value={customTo} onChange={event=>setCustomTo(event.currentTarget.value)}/></div>}</div>
      <Button kind="tertiary" size="md" onClick={()=>{setRefreshing(true);void load(period,customFrom,customTo);}} disabled={loading||refreshing||(period==='custom'&&(!customFrom||!customTo))}><CarbonIcons.Renew size={16} aria-hidden="true"/>刷新数据</Button>
    </div>
    {loading?<div className="tp-console__loading"><InlineLoading description="正在汇总潜客数据…"/></div>:stats&&<>
      <div className="tp-console__metrics">
        <Metric label="已接入发现平台" value={displayPlatforms.length} icon={<CarbonIcons.Apps size={20}/>}/>
        <Metric label="潜在客户总数" value={stats.metrics.prospectCount} icon={<CarbonIcons.UserMultiple size={20}/>}/>
        <Metric label="已转化线索" value={stats.metrics.convertedCount} icon={<CarbonIcons.CheckmarkFilled size={20}/>}/>
        <Metric label="待处理潜客" value={stats.metrics.pendingCount} icon={<CarbonIcons.Time size={20}/>}/>
      </div>
      <div className="tp-console__analytics-grid">
        <section className="tp-console__panel"><div className="tp-console__panel-heading"><div><h2>各平台潜客数量</h2><p>按发现渠道统计去重企业主体；同一企业可分别计入多个来源。</p></div></div><PlatformChart items={displayPlatforms}/></section>
        <section className="tp-console__panel"><div className="tp-console__panel-heading"><div><h2>国家 / 地区潜客分布</h2><p>包含待处理潜客与已转化线索，按企业主体去重统计，不遗漏尚未转化的线索。</p></div></div><CountryChart rows={stats.prospects}/></section>
        <section className="tp-console__panel"><div className="tp-console__panel-heading"><div><h2>每日潜客获取趋势</h2><p>同一企业同一天跨平台重复发现只计一次。</p></div></div><DailyChart items={stats.daily}/><div className="tp-console__chart-footnote">统计时区：{stats.timezone} · 日均 {stats.daily.length?Math.round(stats.daily.reduce((sum,item)=>sum+item.count,0)/stats.daily.length):0} 家 · 峰值 {maxDaily} 家</div></section>
      </div>
      <section className="tp-console__panel tp-console__map-panel">
        <div className="tp-console__panel-heading"><div><h2>全球潜客分布</h2><p>每家企业仅展示一个主要地址；无可靠坐标的企业仍保留在下方列表。</p></div></div>
        <ProspectMap rows={filtered} onSelect={setSelected}/>
      </section>
      <section className="tp-console__panel tp-console__records-panel">
        <div className="tp-console__panel-heading"><div><h2>潜客资产</h2><p>按发现渠道查看聚合企业；平台来源标签来自实际发现记录。</p></div><Tag type="blue">{filtered.length.toLocaleString()} 家</Tag></div>
        <div className="tp-console__platform-tabs"><Tabs selectedIndex={Math.max(0,tabs.findIndex(item=>item.key===platformKey))} onChange={({selectedIndex})=>setPlatformKey(tabs[selectedIndex]?.key??'all')}><TabList aria-label="潜客发现平台">{tabs.map(item=><Tab key={item.key}><span className="tp-console__tab-label"><PlatformIcon platform={item.key}/>{item.label}</span><span className="tp-console__tab-count">{item.count}</span></Tab>)}</TabList></Tabs></div>
        {selectedIds.length>0&&<div className="tp-console__bulk-actions"><span>已选择 {selectedIds.length} 家企业</span><Button kind="secondary" size="sm" disabled={!!actionBusyId||selectedPendingCount===0} onClick={()=>void runBulkAction('promote')}>批量转为线索</Button><Button kind="danger--ghost" size="sm" disabled={!!actionBusyId} onClick={()=>void runBulkAction('discard')}>批量排除</Button><Button kind="danger--ghost" size="sm" disabled={!!actionBusyId} onClick={()=>{if(confirmBulkRemove)void runBulkAction('remove');else setConfirmBulkRemove(true);}}>{confirmBulkRemove?'再次点击确认删除':'批量删除'}</Button><Button kind="ghost" size="sm" onClick={()=>{setSelectedIds([]);setConfirmBulkRemove(false);}}>清除选择</Button></div>}
        <div className="tp-console__filters">
          <TextInput id="prospect-console-search" labelText="搜索潜客" placeholder="企业名称、国家、地址、网站或联系方式" value={search} onChange={event=>setSearch(event.currentTarget.value)} />
          <Select id="prospect-console-status" labelText="线索状态" value={status} onChange={event=>setStatus(event.currentTarget.value)}><SelectItem value="all" text="全部状态"/><SelectItem value="pending" text="待处理"/><SelectItem value="converted" text="已转化"/></Select>
          <Select id="prospect-console-country" labelText="国家 / 地区" value={country} onChange={event=>setCountry(event.currentTarget.value)}><SelectItem value="all" text="全部国家 / 地区"/>{countries.map(value=><SelectItem key={value} value={value} text={value}/>)}</Select>
          <Select id="prospect-console-sort" labelText="发现时间排序" value={sort} onChange={event=>setSort(event.currentTarget.value)}><SelectItem value="newest" text="最近发现优先"/><SelectItem value="oldest" text="最早发现优先"/></Select>
        </div>
        <div className="tp-console__table-scroll"><TableContainer><Table size="lg"><TableHead><TableRow><TableHeader><Checkbox id="prospect-console-select-all" labelText="全选当前结果" checked={allVisibleSelected} onChange={(_,data)=>setSelectedIds(data.checked?[...new Set([...selectedIds,...paginatedRows.map(row=>row.id)])]:selectedIds.filter(id=>!paginatedRows.some(row=>row.id===id)))}/></TableHeader><TableHeader>企业 / 客户</TableHeader><TableHeader>国家 / 地区</TableHeader><TableHeader>网站</TableHeader><TableHeader>联系方式</TableHeader><TableHeader>发现来源</TableHeader><TableHeader>最近发现</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
          <TableBody>{paginatedRows.map(row=><TableRow key={row.id}><TableCell><Checkbox id={'prospect-select-'+row.id} labelText={'选择 '+row.name} checked={selectedIds.includes(row.id)} onChange={(_,data)=>toggleSelected(row.id,data.checked)}/></TableCell><TableCell><strong>{row.name}</strong><span className="tp-console__cell-secondary">{row.type}</span></TableCell><TableCell>{countryLabel(row.country)}<span className="tp-console__cell-secondary">{row.address}</span></TableCell><TableCell>{row.website?<a href={row.website} target="_blank" rel="noreferrer">{row.website}</a>:'—'}</TableCell><TableCell>{[row.phone,row.email].filter(Boolean).join(' · ')||'—'}</TableCell><TableCell><div className="tp-console__source-tags">{row.platforms.map(item=><Tag key={item.key} type="cool-gray">{item.label}</Tag>)}</div></TableCell><TableCell>{new Date(row.discoveredAt).toLocaleDateString('zh-TW')}</TableCell><TableCell><Tag type={row.status==='converted'?'green':'blue'}>{row.status==='converted'?'已转化':'待处理'}</Tag></TableCell><TableCell><div className="tp-console__row-actions"><Button kind="ghost" size="sm" onClick={()=>setSelected(row)}>详情</Button>{row.status==='pending'&&<Button kind="ghost" size="sm" disabled={!!actionBusyId} onClick={()=>void runAction(row,'promote')}>转为线索</Button>}<Button kind="danger--ghost" size="sm" disabled={!!actionBusyId} onClick={()=>void runAction(row,'discard')}>排除</Button><Button kind="danger--ghost" size="sm" disabled={!!actionBusyId} onClick={()=>{if(confirmRemoveId===row.id)void runAction(row,'remove');else setConfirmRemoveId(row.id);}}>{confirmRemoveId===row.id?'再次点击确认删除':'删除'}</Button></div></TableCell></TableRow>)}</TableBody>
        </Table></TableContainer></div>
        {!filtered.length&&<p className="tp-console__empty">没有符合当前筛选条件的潜客。</p>}
        {filtered.length>0&&<div className="tp-console__pagination" aria-label="潜客资产分页"><span>显示 {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize,filtered.length)} 条，共 {filtered.length.toLocaleString()} 条</span><div><Button kind="ghost" size="sm" disabled={currentPage<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>上一页</Button><span className="tp-console__page-number">{currentPage} / {totalPages}</span><Button kind="ghost" size="sm" disabled={currentPage>=totalPages} onClick={()=>setPage(value=>Math.min(totalPages,value+1))}>下一页</Button></div></div>}
      </section>
      {selected&&<section className="tp-console__detail" aria-live="polite"><div className="tp-console__detail-head"><h3>{selected.name}</h3><Button kind="ghost" size="sm" onClick={()=>setSelected(null)}>关闭详情</Button></div><div className="tp-console__detail-grid"><div><span>国家 / 地区</span><strong>{countryLabel(selected.country)}</strong></div><div><span>主要地址</span><strong>{selected.address}</strong></div><div><span>电话</span><strong>{selected.phone||'—'}</strong></div><div><span>邮箱</span><strong>{selected.email||'—'}</strong></div><div><span>网站</span><strong>{selected.website||'—'}</strong></div><div><span>发现渠道</span><strong>{selected.platforms.map(item=>item.label).join('、')}</strong></div></div>
        {selected.sourceDetails?.map(detail=><section className="tp-console__source-detail" key={detail.platform}><h4>{detail.platform==='map_local_businesses'?'Google Maps':detail.platform==='facebook'?'Facebook Pages':detail.platform==='instagram'?'Instagram':detail.platform==='search_engine'?'搜索引擎':'内置 Agent'} 平台数据</h4><dl>{detail.fields.map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>)}
      </section>}
    </>}
  </main>;
}
