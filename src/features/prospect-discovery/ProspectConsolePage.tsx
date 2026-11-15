import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, CarbonIcons,
  Tabs, TabList, Tab, TextInput, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { ProspectDiscoveryHeader } from './ProspectDiscoveryHeader';
import '@/design-system/patterns/prospect-console.scss';

interface ProspectRow {
  id: string; name: string; type: string; country: string; address: string;
  phone: string; email: string; website: string; latitude: number | null; longitude: number | null;
  status: 'converted' | 'pending'; leadId: string | null; discoveredAt: string;
  platforms: Array<{ key: string; label: string }>;
}
interface ConsoleStats {
  metrics: { platformCount: number; prospectCount: number; convertedCount: number; pendingCount: number };
  platforms: Array<{ key: string; label: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  prospects: ProspectRow[];
  timezone: string;
}
const periods = [
  { value: 'all', label: '全部历史数据' }, { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' }, { value: '90', label: '最近 90 天' },
  { value: '365', label: '最近 365 天' },
];
function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <section className="tp-console__metric"><div className="tp-console__metric-head"><span>{label}</span>{icon}</div><strong>{value.toLocaleString()}</strong></section>;
}
function PlatformChart({ items }: { items: ConsoleStats['platforms'] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无平台发现数据。</p>;
  return <div className="tp-console__bar-chart" role="img" aria-label="各发现平台潜客数量横向柱状图">
    {items.map(item => <div className="tp-console__bar-row" key={item.key}>
      <div className="tp-console__bar-label" title={item.label}>{item.label}</div>
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
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
  const clusters = new Map<string, { x: number; y: number; rows: ProspectRow[] }>();
  located.forEach(row => {
    const x=(Number(row.longitude)+180)/360*1000, y=(90-Number(row.latitude))/180*440;
    const key=Math.round(x)+':'+Math.round(y);
    const cluster=clusters.get(key)??{x,y,rows:[]};
    cluster.rows.push(row); clusters.set(key,cluster);
  });
  return <div className="tp-console__map" aria-label="全球潜客主要地址分布图">
    <svg viewBox="0 0 1000 440" role="img" aria-label={`地图上有 ${located.length} 家具有有效坐标的企业`}>
      <defs><pattern id="tp-map-grid" width="100" height="55" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 55" fill="none" className="tp-console__map-grid"/></pattern></defs>
      <rect x="0" y="0" width="1000" height="440" fill="url(#tp-map-grid)"/>
      <g className="tp-console__landmasses" aria-hidden="true">
        <path d="M70 95 L110 60 170 48 215 67 245 100 230 130 205 142 192 177 160 192 142 230 115 215 103 180 80 155 62 120 Z"/>
        <path d="M205 230 L238 242 254 275 245 320 225 370 208 340 195 295 185 260 Z"/>
        <path d="M430 95 L460 78 495 85 510 110 490 130 455 128 Z"/>
        <path d="M455 145 L500 140 535 170 530 225 510 270 485 290 465 250 450 205 Z"/>
        <path d="M520 90 L570 62 650 55 730 78 790 112 830 150 800 180 745 170 700 190 650 165 600 175 560 145 Z"/>
        <path d="M770 275 L810 265 850 285 855 315 825 335 785 320 Z"/>
        <path d="M865 205 L900 195 925 210 915 235 880 238 Z"/>
      </g>
      {[0,1,2,3,4,5,6,7].map(i=><line key={i} x1={0} x2={1000} y1={55*i} y2={55*i} className="tp-console__map-latitude"/>)}
      {[...clusters.values()].map(cluster=>{
        const row=cluster.rows[0], count=cluster.rows.length;
        return <g key={row.id} className="tp-console__map-marker" role="button" tabIndex={0} aria-label={count>1?`${count} 家企业，选择查看 ${row.name}`:row.name} onClick={()=>onSelect(row)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(row);}}}>
          <circle cx={cluster.x} cy={cluster.y} r={count>1?12:9} className="tp-console__map-halo"/><circle cx={cluster.x} cy={cluster.y} r={count>1?7:4} className="tp-console__map-dot"><title>{count>1?`${count} 家企业聚合`:row.name+' · '+row.country}</title></circle>
          {count>1&&<text x={cluster.x} y={cluster.y+3} textAnchor="middle" className="tp-console__cluster-count">{count}</text>}
        </g>;
      })}
    </svg>
    <div className="tp-console__map-legend"><span><i/>企业主要地址</span><span>{located.length} / {rows.length} 家有坐标</span></div>
    {!located.length&&<p className="tp-console__map-empty">当前筛选结果没有可用坐标的企业；未确认地址不会被虚构到地图上。</p>}
  </div>;
}
export function ProspectConsolePage() {
  const [stats,setStats] = useState<ConsoleStats|null>(null);
  const [period,setPeriod] = useState('all');
  const [platformKey,setPlatformKey] = useState('all');
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('all');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const [selected,setSelected] = useState<ProspectRow|null>(null);
  const load = useCallback(async(nextPeriod:string)=>{
    setError('');
    try{
      const client=await getSupabaseClient();
      const {data}=await client.auth.getSession();
      const token=data.session?.access_token;
      if(!token)throw new Error('登录状态已失效，请重新登录。');
      let query='';
      if(nextPeriod!=='all'){
        const end=new Date(),start=new Date(end);
        start.setDate(start.getDate()-Number(nextPeriod)+1);
        query='?from='+dateKey(start)+'&to='+dateKey(end);
      }
      const response=await fetch('/api/v1/prospect-console'+query,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
      const payload=await response.json() as {data?:ConsoleStats;error?:{message?:string}};
      if(!response.ok)throw new Error(payload.error?.message??'读取潜客数据失败。');
      setStats(payload.data??payload as unknown as ConsoleStats);
    }catch(cause){setError(cause instanceof Error?cause.message:'读取潜客数据失败。');}
    finally{setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{void load(period);},[load,period]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return (stats?.prospects??[]).filter(row=>
      (platformKey==='all'||row.platforms.some(item=>item.key===platformKey)) &&
      (status==='all'||row.status===status) &&
      (!q||[row.name,row.country,row.address,row.website,row.phone,row.email].join(' ').toLocaleLowerCase().includes(q))
    );
  },[stats,platformKey,status,search]);
  const maxDaily=Math.max(0,...(stats?.daily??[]).map(item=>item.count));
  const tabs=[{key:'all',label:'全部平台',count:stats?.metrics.prospectCount??0},...(stats?.platforms??[]).map(item=>({key:item.key,label:item.label,count:item.count}))];
  return <main className="tp-console">
    <ProspectDiscoveryHeader title="潜客控制台" description="汇总各发现渠道的潜客资产，查看全球分布、平台贡献与每日发现趋势。" showRecentTasks={false}/>
    {error&&<InlineNotification kind="error" title="数据读取失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <div className="tp-console__toolbar">
      <div><span className="tp-console__toolbar-label">统计时间范围</span><Select id="prospect-console-period" labelText="统计时间范围" hideLabel value={period} onChange={event=>setPeriod(event.currentTarget.value)}>{periods.map(item=><SelectItem key={item.value} value={item.value} text={item.label}/>)}</Select></div>
      <Button kind="tertiary" size="md" onClick={()=>{setRefreshing(true);void load(period);}} disabled={loading||refreshing}><CarbonIcons.Renew size={16} aria-hidden="true"/>刷新数据</Button>
    </div>
    {loading?<div className="tp-console__loading"><InlineLoading description="正在汇总潜客数据…"/></div>:stats&&<>
      <div className="tp-console__metrics">
        <Metric label="有潜客数据的平台" value={stats.metrics.platformCount} icon={<CarbonIcons.Apps size={20}/>}/>
        <Metric label="潜在客户总数" value={stats.metrics.prospectCount} icon={<CarbonIcons.UserMultiple size={20}/>}/>
        <Metric label="已转化线索" value={stats.metrics.convertedCount} icon={<CarbonIcons.CheckmarkFilled size={20}/>}/>
        <Metric label="待处理潜客" value={stats.metrics.pendingCount} icon={<CarbonIcons.Time size={20}/>}/>
      </div>
      <div className="tp-console__analytics-grid">
        <section className="tp-console__panel"><div className="tp-console__panel-heading"><div><h2>各平台潜客数量</h2><p>按发现渠道统计去重企业主体；同一企业可分别计入多个来源。</p></div></div><PlatformChart items={stats.platforms}/></section>
        <section className="tp-console__panel"><div className="tp-console__panel-heading"><div><h2>每日潜客获取趋势</h2><p>同一企业同一天跨平台重复发现只计一次。</p></div></div><DailyChart items={stats.daily}/><div className="tp-console__chart-footnote">统计时区：{stats.timezone} · 日均 {stats.daily.length?Math.round(stats.daily.reduce((sum,item)=>sum+item.count,0)/stats.daily.length):0} 家 · 峰值 {maxDaily} 家</div></section>
      </div>
      <section className="tp-console__panel tp-console__map-panel">
        <div className="tp-console__panel-heading"><div><h2>全球潜客分布</h2><p>每家企业仅展示一个主要地址；无可靠坐标的企业仍保留在下方列表。</p></div><Tag type="green">地图与列表联动</Tag></div>
        <ProspectMap rows={filtered} onSelect={setSelected}/>
      </section>
      <section className="tp-console__panel tp-console__records-panel">
        <div className="tp-console__panel-heading"><div><h2>潜客资产</h2><p>按发现渠道查看聚合企业；平台来源标签来自实际发现记录。</p></div><Tag type="blue">{filtered.length.toLocaleString()} 家</Tag></div>
        <div className="tp-console__platform-tabs"><Tabs selectedIndex={Math.max(0,tabs.findIndex(item=>item.key===platformKey))} onChange={({selectedIndex})=>setPlatformKey(tabs[selectedIndex]?.key??'all')}><TabList aria-label="潜客发现平台">{tabs.map(item=><Tab key={item.key}>{item.label} <span className="tp-console__tab-count">{item.count}</span></Tab>)}</TabList></Tabs></div>
        <div className="tp-console__filters">
          <TextInput id="prospect-console-search" labelText="搜索潜客" placeholder="企业名称、国家、地址、网站或联系方式" value={search} onChange={event=>setSearch(event.currentTarget.value)} />
          <Select id="prospect-console-status" labelText="线索状态" value={status} onChange={event=>setStatus(event.currentTarget.value)}><SelectItem value="all" text="全部状态"/><SelectItem value="pending" text="待处理"/><SelectItem value="converted" text="已转化"/></Select>
        </div>
        <div className="tp-console__table-scroll"><TableContainer><Table size="lg"><TableHead><TableRow><TableHeader>企业 / 客户</TableHeader><TableHeader>国家 / 地区</TableHeader><TableHeader>网站</TableHeader><TableHeader>联系方式</TableHeader><TableHeader>发现来源</TableHeader><TableHeader>最近发现</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
          <TableBody>{filtered.map(row=><TableRow key={row.id}><TableCell><strong>{row.name}</strong><span className="tp-console__cell-secondary">{row.type}</span></TableCell><TableCell>{row.country}<span className="tp-console__cell-secondary">{row.address}</span></TableCell><TableCell>{row.website?<a href={row.website} target="_blank" rel="noreferrer">{row.website}</a>:'—'}</TableCell><TableCell>{[row.phone,row.email].filter(Boolean).join(' · ')||'—'}</TableCell><TableCell><div className="tp-console__source-tags">{row.platforms.map(item=><Tag key={item.key} type="cool-gray">{item.label}</Tag>)}</div></TableCell><TableCell>{new Date(row.discoveredAt).toLocaleDateString('zh-TW')}</TableCell><TableCell><Tag type={row.status==='converted'?'green':'blue'}>{row.status==='converted'?'已转化':'待处理'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>setSelected(row)}>查看详情</Button></TableCell></TableRow>)}</TableBody>
        </Table></TableContainer></div>
        {!filtered.length&&<p className="tp-console__empty">没有符合当前筛选条件的潜客。</p>}
      </section>
      {selected&&<section className="tp-console__detail" aria-live="polite"><div className="tp-console__detail-head"><h3>{selected.name}</h3><Button kind="ghost" size="sm" onClick={()=>setSelected(null)}>关闭详情</Button></div><div className="tp-console__detail-grid"><div><span>国家 / 地区</span><strong>{selected.country}</strong></div><div><span>主要地址</span><strong>{selected.address}</strong></div><div><span>电话</span><strong>{selected.phone||'—'}</strong></div><div><span>邮箱</span><strong>{selected.email||'—'}</strong></div><div><span>网站</span><strong>{selected.website||'—'}</strong></div><div><span>发现渠道</span><strong>{selected.platforms.map(item=>item.label).join('、')}</strong></div></div></section>}
    </>}
  </main>;
}
