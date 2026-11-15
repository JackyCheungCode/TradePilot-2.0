import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
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
const countryCenters: Record<string, [number, number]> = {
  US: [-98, 39], CA: [-106, 57], MX: [-102, 23], BR: [-52, -10], AR: [-64, -34],
  GB: [-3, 55], IE: [-8, 53], FR: [2, 46], DE: [10, 51], ES: [-4, 40], IT: [12, 42],
  NL: [5, 52], SE: [15, 62], NO: [10, 62], PL: [19, 52], TR: [35, 39], AE: [54, 24],
  SA: [45, 24], ZA: [24, -29], EG: [30, 27], NG: [8, 9], IN: [79, 22], PK: [69, 30],
  BD: [90, 24], CN: [104, 35], TW: [121, 24], HK: [114, 22], JP: [138, 37], KR: [128, 36],
  SG: [104, 1], TH: [101, 15], VN: [108, 16], MY: [102, 4], ID: [118, -2], AU: [134, -25],
  NZ: [172, -41], RU: [90, 60], UA: [32, 49], CH: [8, 47], AT: [14, 47], BE: [4, 51],
};
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
  const max = Math.max(1, ...items.map(item => item.count));
  return <section className="tp-leads__panel">
    <div className="tp-leads__panel-heading"><div className="tp-leads__panel-title">{icon}<h2>{title}</h2></div><p>{description}</p></div>
    {items.length ? <div className="tp-leads__distribution">{items.slice(0, 8).map(item =>
      <div className="tp-leads__distribution-row" key={item.key}>
        <span title={item.label}>{item.label}</span>
        <div className="tp-leads__bar-track"><div className="tp-leads__bar-fill" style={{ width: (item.count / max * 100) + '%' }} /></div>
        <strong>{item.count.toLocaleString()}</strong>
      </div>)}</div> : <p className="tp-leads__empty">暂无可统计数据</p>}
  </section>;
}
function LeadMap({ rows }: { rows: LeadRow[] }) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const code = row.country_code?.trim().toUpperCase();
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  });
  const located = [...counts.entries()].flatMap(([code, count]) => {
    const center = countryCenters[code];
    if (!center) return [];
    const latitude = center[1] * Math.PI / 180;
    const x = (center[0] + 180) / 360 * 512;
    const y = (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * 256;
    return [{ code, count, x, y }];
  });
  const max = Math.max(1, ...located.map(item => item.count));
  const unlocated = [...counts.entries()].filter(([code]) => !countryCenters[code]);
  return <section className="tp-leads__panel tp-leads__map-panel">
    <div className="tp-leads__panel-heading">
      <div className="tp-leads__panel-title"><CarbonIcons.Globe size={20} /><h2>线索国家 / 地区分布</h2></div>
      <p>按线索国家代码汇总；地图标记为国家 / 地区中心点示意，不代表企业的精确地址。</p>
    </div>
    <div className="tp-leads__map">
      <svg viewBox="0 0 512 256" role="img" aria-label={'地图显示 ' + counts.size + ' 个国家或地区的线索分布'}>
        <g aria-hidden="true">
          {[0, 1].map(x => [0, 1].map(y => <image key={x + '-' + y} href={'https://tile.openstreetmap.org/1/' + x + '/' + y + '.png'} x={x * 256} y={y * 256} width="256" height="256" />))}
        </g>
        {located.map(item => <g key={item.code}>
          <circle cx={item.x} cy={item.y} r={7 + Math.sqrt(item.count / max) * 9} className="tp-leads__map-halo" />
          <circle cx={item.x} cy={item.y} r={4 + Math.sqrt(item.count / max) * 4} className="tp-leads__map-dot">
            <title>{countryName(item.code)}：{item.count} 条线索</title>
          </circle>
        </g>)}
      </svg>
    </div>
    <div className="tp-leads__map-legend"><span><i /> 国家 / 地区线索量</span><span>圆点大小表示数量</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>
    <div className="tp-leads__country-list">{[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) =>
      <div key={code}><span>{countryName(code)}</span><strong>{count}</strong></div>)}</div>
    {unlocated.length > 0 && <p className="tp-leads__map-note">{unlocated.length} 个国家 / 地区未配置地图中心点，仍计入国家分布统计。</p>}
    {counts.size === 0 && <p className="tp-leads__empty">目前没有填写国家 / 地区的线索。</p>}
  </section>;
}
export function LeadConsolePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
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
      const matchesQuery = !query || [row.name, row.lead_number, row.country_code, row.address, row.phone, row.email, row.website]
        .join(' ').toLocaleLowerCase().includes(query);
      return matchesStatus && matchesSource && matchesQuery;
    });
  }, [rows, search, statusFilter, sourceFilter]);
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
  const sourceLabel = (row: LeadRow) => {
    const key = valueOf(row.profile, 'source') || 'unknown';
    return sourceNames[key] ?? (key === 'unknown' ? '未标记' : key);
  };
  return <main className="tp-leads">
    <header className="tp-leads__header">
      <div><p className="tp-leads__eyebrow">TRADEPILOT / CRM</p><h1>线索（Lead）</h1><p>集中管理已建立的正式线索，分析来源、状态、评级与国家 / 地区分布。</p></div>
      <div className="tp-leads__header-actions">
        <Button kind="tertiary" onClick={() => { setRefreshing(true); void load(); }} disabled={loading || refreshing}><CarbonIcons.Renew size={16} />刷新</Button>
        <Button kind="primary" onClick={() => navigate('/leads/new')}><CarbonIcons.Add size={16} />新建线索</Button>
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
        <Distribution title="线索来源" description="按正式线索资料中的来源字段统计。" items={sourceItems} icon={<CarbonIcons.DataVis4 size={20} />} />
        <Distribution title="线索状态" description="反映线索当前所处的业务阶段。" items={statusItems} icon={<CarbonIcons.TaskComplete size={20} />} />
        <Distribution title="线索评级" description="按热、温、冷及未评级统计。" items={ratingItems} icon={<CarbonIcons.Star size={20} />} />
      </div>
      <LeadMap rows={rows} />
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
            <TableHeader>来源</TableHeader><TableHeader>评级</TableHeader><TableHeader>状态</TableHeader><TableHeader>创建时间</TableHeader><TableHeader>操作</TableHeader>
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
              <TableCell><Button kind="ghost" size="sm" onClick={() => navigate('/leads/new?leadId=' + encodeURIComponent(row.id))}>查看资料</Button></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></TableContainer></div>
        {!filtered.length && <p className="tp-leads__empty">没有符合当前筛选条件的线索。</p>}
        <div className="tp-leads__table-footer">显示 {filtered.length.toLocaleString()} 条 / 共 {total.toLocaleString()} 条正式线索</div>
      </section>
    </>}
  </main>;
}
