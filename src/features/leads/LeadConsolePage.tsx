import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AreaChart } from '@carbon/charts-react';
import {
  Button, Link, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer, CarbonIcons, WorldMapChart, SimpleBarChart,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/lead-console.scss';

type LeadProfile = Record<string, unknown>;
interface LeadRow {
  id: string;
  lead_number: string;
  name: string;
  country_code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  is_formal: boolean;
  created_at: string;
  profile: LeadProfile | null;
}
const sourceNames: Record<string, string> = {
  prospect_conversion: '全网情报', manual: '手动录入', website: '官网询盘',
  exhibition: '展会', social: '社交媒体', email: '邮件', referral: '客户推荐',
};
const statusNames: Record<string, string> = {
  new: '新建', contacting: '联系中', confirmed: '已确认', converted: '已转换',
  invalid: '已失效', draft: '草稿', review: '待审核', qualified: '已确认',
  rejected: '已失效',
};
function valueOf(profile: LeadProfile | null, key: string): string {
  const value = profile?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function countryName(code: string): string {
  if (!code) return '未填写';
  try { return new Intl.DisplayNames(['zh-TW'], { type: 'region' }).of(code.toUpperCase()) ?? code; }
  catch { return code; }
}
function normalizeStatus(row: LeadRow): string {
  return valueOf(row.profile, 'lead_status') || row.status || 'draft';
}
function statusLabel(status: string): string {
  return statusNames[status] ?? status;
}
function Metric({ label, value, icon, detail }: { label: string; value: number; icon: React.ReactNode; detail: string }) {
  return <section className="tp-leads__metric">
    <div className="tp-leads__metric-head"><span>{label}</span>{icon}</div>
    <strong>{value.toLocaleString()}</strong>
    <small>{detail}</small>
  </section>;
}
function Distribution({ title, description, items, icon }: {
  title: string; description: string; items: Array<{ key: string; label: string; count: number }>; icon: React.ReactNode;
}) {
  const data = items.slice(0, 10).map(item => ({ group: item.label, value: item.count }));
  const theme = document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white';
  const options = {
    theme, height: '260px', color: { pairing: { numberOfVariants: 14, option: 1 } }, toolbar: { enabled: false }, legend: { enabled: false },
    axes: {
      left: { mapsTo: 'group', scaleType: 'labels' },
      bottom: { mapsTo: 'value', scaleType: 'linear' },
    },
  };
  return <section className="tp-leads__panel">
    <div className="tp-leads__panel-heading"><div className="tp-leads__panel-title">{icon}<h2>{title}</h2></div><p>{description}</p></div>
    {data.length ? <SimpleBarChart data={data} options={options as any}/> : <p className="tp-leads__empty">暂无可统计数据</p>}
  </section>;
}
function LeadMap({ rows, selectedCode, onCountrySelect }: {
  rows: LeadRow[]; selectedCode: string; onCountrySelect: (code: string) => void;
}) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const code = row.country_code?.trim().toUpperCase();
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  });
  const data = [...counts.entries()].map(([code, value]) => ({
    code, label: countryName(code), value,
  })).sort((a, b) => b.value - a.value);
  return <section className="tp-leads__panel tp-leads__map-panel">
    <div className="tp-leads__panel-heading">
      <div className="tp-leads__panel-title"><CarbonIcons.Globe size={20} /><h2>全球线索分布</h2></div>
      <p>按线索国家 / 地区汇总；选择地图或排名可筛选线索列表，国家级位置不代表企业精确地址。</p>
    </div>
    <WorldMapChart data={data} unitLabel="条线索" selectedCode={selectedCode === 'all' ? undefined : selectedCode} onCountrySelect={onCountrySelect}/>
  </section>;
}
export function LeadConsolePage() {
  
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const load = useCallback(async () => {
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) throw new Error('登录状态已失效，请重新登录。');
      const { data, error: queryError } = await client.from('leads')
        .select('id,lead_number,name,country_code,address,phone,email,website,status,is_formal,created_at,profile')
        .eq('is_formal', true)
        .order('created_at', { ascending: false })
        .range(0, 999);
      if (queryError) throw queryError;
      setRows((data ?? []) as LeadRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取线索数据失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const sourceOptions = useMemo(() => [...new Set(rows.map(row => valueOf(row.profile, 'source') || 'unknown'))].sort(), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter(row => {
      const status = normalizeStatus(row);
      const source = valueOf(row.profile, 'source') || 'unknown';
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesSource = sourceFilter === 'all' || source === sourceFilter;
      const matchesCountry = countryFilter === 'all' || row.country_code?.toUpperCase() === countryFilter;
      const matchesQuery = !query || [row.name, row.lead_number, row.country_code, row.address, row.phone, row.email, row.website]
        .join(' ').toLocaleLowerCase().includes(query);
      return matchesStatus && matchesSource && matchesCountry && matchesQuery;
    });
  }, [rows, search, statusFilter, sourceFilter, countryFilter]);
  const total = rows.length;
  const followUp = rows.filter(row => ['new', 'contacting', 'draft', 'review'].includes(normalizeStatus(row))).length;
  const confirmed = rows.filter(row => ['confirmed', 'qualified', 'converted'].includes(normalizeStatus(row))).length;
  const invalid = rows.filter(row => ['invalid', 'rejected'].includes(normalizeStatus(row))).length;
  const sourceItems = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(row => {
      const source = valueOf(row.profile, 'source') || 'unknown';
      counts.set(source, (counts.get(source) ?? 0) + 1);
    });
    return [...counts.entries()].map(([key, count]) => ({
      key, label: sourceNames[key] ?? (key === 'unknown' ? '未标记来源' : key), count,
    })).sort((a, b) => b.count - a.count);
  }, [rows]);
  const statusItems = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(row => { const key = normalizeStatus(row); counts.set(key, (counts.get(key) ?? 0) + 1); });
    return [...counts.entries()].map(([key, count]) => ({ key, label: statusLabel(key), count })).sort((a, b) => b.count - a.count);
  }, [rows]);
  const ratingItems = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(row => {
      const rating = valueOf(row.profile, 'rating') || 'unknown';
      counts.set(rating, (counts.get(rating) ?? 0) + 1);
    });
    const labels: Record<string, string> = { hot: '热', warm: '温', cold: '冷', unknown: '未评级' };
    return [...counts.entries()].map(([key, count]) => ({ key, label: labels[key] ?? key, count })).sort((a, b) => b.count - a.count);
  }, [rows]);
  const trendData = useMemo(() => {
    const counts = new Map<string, number>();
    for (let offset = 29; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      counts.set(key, 0);
    }
    rows.forEach(row => {
      const date = new Date(row.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([key, value]) => ({ group: '新增线索', date: new Date(key + 'T00:00:00'), value }));
  }, [rows]);
  const trendOptions = {
    theme: document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white',
    height: '280px', toolbar: { enabled: false }, legend: { enabled: false },
    axes: { bottom: { mapsTo: 'date', scaleType: 'time' }, left: { mapsTo: 'value', scaleType: 'linear' } },
    curve: 'curveMonotoneX', points: { enabled: false },
  };
  const sourceLabel = (row: LeadRow) => {
    const key = valueOf(row.profile, 'source') || 'unknown';
    return sourceNames[key] ?? (key === 'unknown' ? '未标记' : key);
  };
  if (loading) return <PageSkeleton variant="table" />;
  return <main className="tp-leads">
    <header className="tp-leads__header">
      <div><p className="tp-leads__eyebrow">TRADEPILOT / CRM</p><h1>线索（Lead）</h1><p>集中管理已建立的正式线索，分析来源、状态、评级与国家 / 地区分布。</p></div>
      <div className="tp-leads__header-actions">
        <Button kind="tertiary" onClick={() => { setRefreshing(true); void load(); }} disabled={loading || refreshing}><CarbonIcons.Renew size={16} />刷新</Button>
        <Link href="/leads/new" renderIcon={CarbonIcons.Add}>新建线索</Link>
      </div>
    </header>
    {error && <InlineNotification kind="error" title="线索数据读取失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {loading ? <div className="tp-leads__loading"><InlineLoading description="正在读取线索数据…" /></div> : <>
      <div className="tp-leads__metrics">
        <Metric label="全部线索" value={total} icon={<CarbonIcons.UserMultiple size={20} />} detail="正式线索总数" />
        <Metric label="待跟进" value={followUp} icon={<CarbonIcons.Time size={20} />} detail="新建、联系中及待审核" />
        <Metric label="已确认" value={confirmed} icon={<CarbonIcons.CheckmarkFilled size={20} />} detail="已确认或已转换" />
        <Metric label="已失效" value={invalid} icon={<CarbonIcons.WarningAlt size={20} />} detail="已失效或审核拒绝" />
      </div>
      <div className="tp-leads__analytics">
        <Distribution title="线索来源" description="按正式线索资料中的来源字段统计。" items={sourceItems} icon={<CarbonIcons.DataVis_4 size={20} />} />
        <Distribution title="线索状态" description="反映线索当前所处的业务阶段。" items={statusItems} icon={<CarbonIcons.TaskComplete size={20} />} />
        <Distribution title="线索评级" description="按热、温、冷及未评级统计。" items={ratingItems} icon={<CarbonIcons.Star size={20} />} />
      </div>
      <LeadMap rows={rows} selectedCode={countryFilter} onCountrySelect={code => setCountryFilter(current => current === code ? 'all' : code)} />
      <section className="tp-leads__panel"><div className="tp-leads__panel-heading"><div className="tp-leads__panel-title"><CarbonIcons.ChartLine size={20}/><h2>线索新增趋势</h2></div><p>最近 30 天正式线索创建数量。</p></div><AreaChart data={trendData} options={trendOptions as any}/></section>
      <section className="tp-leads__panel tp-leads__records">
        <div className="tp-leads__panel-heading"><div className="tp-leads__panel-title"><CarbonIcons.UserMultiple size={20} /><h2>线索列表</h2></div><p>支持按名称、编号、国家及联系方式搜索，并按来源和状态筛选。</p></div>
        <div className="tp-leads__filters">
          <TextInput id="lead-console-search" labelText="搜索线索" placeholder="线索名称、编号、国家、邮箱或电话" value={search} onChange={event => setSearch(event.currentTarget.value)} />
          <Select id="lead-console-status" labelText="线索状态" value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}>
            <SelectItem value="all" text="全部状态" />
            {statusItems.map(item => <SelectItem key={item.key} value={item.key} text={item.label} />)}
          </Select>
          <Select id="lead-console-source" labelText="线索来源" value={sourceFilter} onChange={event => setSourceFilter(event.currentTarget.value)}>
            <SelectItem value="all" text="全部来源" />
            {sourceOptions.map(key => <SelectItem key={key} value={key} text={sourceNames[key] ?? (key === 'unknown' ? '未标记来源' : key)} />)}
          </Select>
        </div>
        <div className="tp-leads__table-wrap"><TableContainer><Table size="lg">
          <TableHead><TableRow>
            <TableHeader>线索编号</TableHeader><TableHeader>线索名称</TableHeader><TableHeader>国家 / 地区</TableHeader>
            <TableHeader>来源</TableHeader><TableHeader>评级</TableHeader><TableHeader>状态</TableHeader><TableHeader>创建时间</TableHeader>
          </TableRow></TableHead>
          <TableBody>{filtered.map(row => {
            const status = normalizeStatus(row);
            const rating = valueOf(row.profile, 'rating');
            return <TableRow key={row.id}>
              <TableCell>{row.lead_number || '—'}</TableCell>
              <TableCell><strong>{row.name || '未命名线索'}</strong><span className="tp-leads__cell-secondary">{row.website || row.email || row.phone || ''}</span></TableCell>
              <TableCell>{countryName(row.country_code)}</TableCell>
              <TableCell><Tag type="cool-gray">{sourceLabel(row)}</Tag></TableCell>
              <TableCell><Tag type={rating === 'hot' ? 'red' : rating === 'warm' ? 'warm-gray' : 'blue'}>{rating === 'hot' ? '热' : rating === 'warm' ? '温' : rating === 'cold' ? '冷' : '未评级'}</Tag></TableCell>
              <TableCell><Tag type={['invalid', 'rejected'].includes(status) ? 'red' : ['confirmed', 'qualified', 'converted'].includes(status) ? 'green' : 'blue'}>{statusLabel(status)}</Tag></TableCell>
              <TableCell>{new Date(row.created_at).toLocaleDateString('zh-TW')}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></TableContainer></div>
        {!filtered.length && <p className="tp-leads__empty">没有符合当前筛选条件的线索。</p>}
        <div className="tp-leads__table-footer">显示 {filtered.length.toLocaleString()} 条 / 共 {total.toLocaleString()} 条正式线索</div>
      </section>
    </>}
  </main>;
}
