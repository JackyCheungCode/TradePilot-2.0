import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { ProspectDiscoveryHeader } from './ProspectDiscoveryHeader';
import './prospect-console.scss';

interface ConsoleStats {
  metrics: { platformCount: number; prospectCount: number; convertedCount: number; pendingCount: number };
  platforms: Array<{ key: string; label: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  timezone: string;
}
const periods = [{ value: 'all', label: '全部历史数据' }, { value: '7', label: '最近 7 天' }, { value: '30', label: '最近 30 天' }, { value: '90', label: '最近 90 天' }, { value: '365', label: '最近 365 天' }];
function dateKey(date: Date) { return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-'); }
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <section className="tp-console__metric"><div className="tp-console__metric-head"><span>{label}</span>{icon}</div><strong>{value.toLocaleString()}</strong></section>;
}
function PlatformChart({ items }: { items: ConsoleStats['platforms'] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无平台发现数据。</p>;
  return <div className="tp-console__bar-chart" role="img" aria-label="各发现平台潜客数量横向柱状图">
    {items.map(item => <div className="tp-console__bar-row" key={item.key}>
      <div className="tp-console__bar-label" title={item.label}>{item.label}</div>
      <div className="tp-console__bar-track"><div className="tp-console__bar-fill" style={{ width: (item.count / max * 100) + '%' }} /></div>
      <strong>{item.count.toLocaleString()}</strong>
    </div>)}
  </div>;
}
function DailyChart({ items }: { items: ConsoleStats['daily'] }) {
  if (!items.length) return <p className="tp-console__empty">当前时间范围内暂无每日发现数据。</p>;
  const width = Math.max(760, items.length * 30);
  const height = 220, left = 42, right = 18, top = 16, bottom = 42;
  const max = Math.max(1, ...items.map(item => item.count));
  const points = items.map((item, index) => {
    const x = left + (items.length === 1 ? 0 : index * (width-left-right) / (items.length-1));
    const y = top + (height-top-bottom) * (1 - item.count / max);
    return { x, y, ...item };
  });
  const polyline = points.map(point => point.x + ',' + point.y).join(' ');
  const labelStep = Math.max(1, Math.ceil(items.length / 12));
  return <div className="tp-console__line-scroll">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每日新增潜客总数趋势折线图">
      {[0, .5, 1].map((fraction) => {
        const y = top + (height-top-bottom) * fraction;
        return <g key={fraction}><line x1={left} x2={width-right} y1={y} y2={y} className="tp-console__grid-line" /><text x={left-8} y={y+4} textAnchor="end" className="tp-console__axis-label">{Math.round(max*(1-fraction))}</text></g>;
      })}
      <polyline points={polyline} className="tp-console__line" />
      {points.map((point,index) => <g key={point.date}><circle cx={point.x} cy={point.y} r="3.5" className="tp-console__point"><title>{point.date}: {point.count}</title></circle>{(index % labelStep === 0 || index === points.length-1) && <text x={point.x} y={height-12} textAnchor="middle" className="tp-console__axis-label">{point.date.slice(5)}</text>}</g>)}
    </svg>
  </div>;
}
export function ProspectConsolePage() {
  const [stats,setStats] = useState<ConsoleStats | null>(null);
  const [period,setPeriod] = useState('all');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const load = useCallback(async (nextPeriod: string) => {
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录。');
      let query = '';
      if (nextPeriod !== 'all') {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - Number(nextPeriod) + 1);
        query = '?from=' + dateKey(start) + '&to=' + dateKey(end);
      }
      const response = await fetch('/api/v1/prospect-console' + query, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      const payload = await response.json() as { data?: ConsoleStats; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? '读取潜客统计失败。');
      setStats(payload.data ?? payload as unknown as ConsoleStats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取潜客统计失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(period); }, [load,period]);
  const maxDaily = useMemo(() => Math.max(0,...(stats?.daily ?? []).map(item=>item.count)),[stats]);
  return <main className="tp-console">
    <ProspectDiscoveryHeader title="潜客控制台" description="汇总各发现渠道的潜客资产，查看平台贡献与每日发现趋势。" showRecentTasks={false} />
    {error && <InlineNotification kind="error" title="数据读取失败" subtitle={error} onCloseButtonClick={()=>setError('')} />}
    <div className="tp-console__toolbar">
      <div><span className="tp-console__toolbar-label">统计时间范围</span><Select id="prospect-console-period" labelText="统计时间范围" hideLabel value={period} onChange={event=>setPeriod(event.currentTarget.value)}>{periods.map(item=><SelectItem key={item.value} value={item.value} text={item.label}/>)}</Select></div>
      <Button kind="tertiary" size="md" onClick={()=>{setRefreshing(true);void load(period);}} disabled={loading||refreshing}><CarbonIcons.Renew size={16} aria-hidden="true"/>刷新数据</Button>
    </div>
    {loading ? <div className="tp-console__loading"><InlineLoading description="正在汇总潜客数据…" /></div> : stats && <>
      <div className="tp-console__metrics">
        <Metric label="有潜客数据的平台" value={stats.metrics.platformCount} icon={<CarbonIcons.Apps size={20}/>} />
        <Metric label="潜在客户总数" value={stats.metrics.prospectCount} icon={<CarbonIcons.UserMultiple size={20}/>} />
        <Metric label="已转化线索" value={stats.metrics.convertedCount} icon={<CarbonIcons.CheckmarkFilled size={20}/>} />
        <Metric label="待处理潜客" value={stats.metrics.pendingCount} icon={<CarbonIcons.Time size={20}/>} />
      </div>
      <section className="tp-console__panel">
        <div className="tp-console__panel-heading"><div><h2>各平台潜客数量</h2><p>按发现平台统计去重后的企业主体；同一企业可分别计入多个来源平台。</p></div><Tag type="blue">{stats.platforms.length} 个有数据平台</Tag></div>
        <PlatformChart items={stats.platforms}/>
      </section>
      <section className="tp-console__panel">
        <div className="tp-console__panel-heading"><div><h2>每日潜客获取趋势</h2><p>统计所有发现平台每天新增的去重企业主体；同一企业同一天跨平台重复发现只计一次。</p></div><Tag type="blue">每日总数</Tag></div>
        <DailyChart items={stats.daily}/>
        <div className="tp-console__chart-footnote">统计时区：{stats.timezone} · 当前范围内日均 {stats.daily.length ? Math.round(stats.daily.reduce((sum,item)=>sum+item.count,0)/stats.daily.length).toLocaleString() : '0'} 家 · 峰值 {maxDaily.toLocaleString()} 家</div>
      </section>
    </>}
  </main>;
}
