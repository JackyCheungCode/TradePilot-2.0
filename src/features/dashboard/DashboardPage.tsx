import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, DonutChart, TreemapChart } from '@carbon/charts-react';
import { Button, InlineLoading, InlineNotification, Tile, Tag, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@carbon/charts/styles.css';
import '@/design-system/patterns/dashboard.scss';

type AccountRow = { id: string; country_code: string | null; created_at: string; status: string | null };
type ActivityRow = { id: string; goal: string | null; status: string | null; created_at: string };
type DashboardState = {
  accounts: AccountRow[];
  totalAccounts: number;
  totalLeads: number;
  totalOpportunities: number;
  runningAgents: number;
  failedAgents: number;
  activities: ActivityRow[];
  updatedAt: string;
};

const countryLabel = (code: string) => {
  if (!code || code === 'unknown') return '未设置国家';
  try { return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
};
const number = (value: number) => value.toLocaleString('zh-CN');
const dateKey = (date: Date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const chartTheme = () => document.documentElement.dataset.carbonTheme === 'g100' ? 'g100' : 'white';

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const db = await getSupabaseClient();
      const [accountsResult, leadsResult, opportunitiesResult, runningResult, failedResult, activityResult] = await Promise.all([
        db.from('crm_accounts').select('id,country_code,created_at,status', { count: 'exact' }).eq('is_archived', false).order('created_at', { ascending: false }).range(0, 49999),
        db.from('leads').select('id', { count: 'exact', head: true }),
        db.from('crm_opportunities').select('id', { count: 'exact', head: true }).eq('is_archived', false),
        db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
        db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        db.from('agent_runs').select('id,goal,status,created_at').order('created_at', { ascending: false }).limit(6),
      ]);
      const failed = [accountsResult, leadsResult, opportunitiesResult, runningResult, failedResult, activityResult].find(result => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      setData({
        accounts: (accountsResult.data || []) as AccountRow[],
        totalAccounts: accountsResult.count ?? accountsResult.data?.length ?? 0,
        totalLeads: leadsResult.count ?? 0,
        totalOpportunities: opportunitiesResult.count ?? 0,
        runningAgents: runningResult.count ?? 0,
        failedAgents: failedResult.count ?? 0,
        activities: (activityResult.data || []) as ActivityRow[],
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '工作台数据读取失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.accounts || []).forEach(account => {
      const code = account.country_code?.trim().toUpperCase() || 'unknown';
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    return [...counts.entries()].map(([code, value]) => ({
      code,
      name: countryLabel(code),
      value,
      share: total ? value / total * 100 : 0,
    })).sort((a, b) => b.value - a.value);
  }, [data?.accounts]);

  const trend = useMemo(() => {
    const today = new Date();
    const counts = new Map<string, number>();
    for (let offset = 29; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - offset);
      counts.set(dateKey(day), 0);
    }
    (data?.accounts || []).forEach(account => {
      const key = account.created_at.slice(0, 10);
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([date, value]) => ({
      group: '新增客户',
      date: new Date(date + 'T00:00:00'),
      value,
    }));
  }, [data?.accounts]);

  const statusData = useMemo(() => {
    const counts = new Map<string, number>([['活跃', 0], ['非活跃', 0], ['其他', 0]]);
    (data?.accounts || []).forEach(account => {
      const status = account.status === 'active' ? '活跃' : account.status === 'inactive' ? '非活跃' : '其他';
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return [...counts.entries()].filter(([, value]) => value > 0).map(([group, value]) => ({ group, value }));
  }, [data?.accounts]);

  const theme = chartTheme();
  const treemapOptions = useMemo(() => ({
    title: '国家客户数量与占比',
    height: '360px',
    theme,
    legend: { enabled: false },
    tooltip: { enabled: true, valueFormatter: (value: number) => number(value) + ' 家客户' },
    color: { scale: { '未设置国家': '#8d8d8d' } },
  }), [theme]);
  const trendOptions = useMemo(() => ({
    title: '近 30 天新增客户',
    height: '280px',
    theme,
    axes: {
      bottom: { title: '日期', mapsTo: 'date', scaleType: 'time' },
      left: { title: '新增客户', mapsTo: 'value', scaleType: 'linear' },
    },
    curve: 'curveMonotoneX',
    points: { enabled: false },
    legend: { enabled: false },
    toolbar: { enabled: false },
  }), [theme]);
  const statusOptions = useMemo(() => ({
    title: '客户状态结构',
    height: '280px',
    theme,
    donut: { center: { label: '客户状态' } },
    legend: { position: 'bottom' },
    toolbar: { enabled: false },
  }), [theme]);

  const metrics = [
    { label: '全球客户', value: data?.totalAccounts ?? 0, detail: '已归档客户不计入', icon: CarbonIcons.Building, href: '/accounts' },
    { label: '潜在客户线索', value: data?.totalLeads ?? 0, detail: '全部线索记录', icon: CarbonIcons.UserFollow, href: '/leads' },
    { label: '销售商机', value: data?.totalOpportunities ?? 0, detail: '未归档商机', icon: CarbonIcons.ChartLine, href: '/opportunities' },
    { label: '运行中 Agent', value: data?.runningAgents ?? 0, detail: (data?.failedAgents ?? 0) + ' 项失败任务', icon: CarbonIcons.Bot, href: '/agent' },
  ];

  return <main className="tp-workbench">
    <header className="tp-workbench__header">
      <div>
        <p className="tp-workbench__eyebrow">TRADEPILOT / GLOBAL BUSINESS INTELLIGENCE</p>
        <h1>全球业务工作台</h1>
        <p>客户资产、市场覆盖与业务执行情况，一屏掌握。</p>
      </div>
      <div className="tp-workbench__actions">
        <span className="tp-workbench__updated">{data ? '更新于 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '等待数据'}</span>
        <Button kind="tertiary" size="md" disabled={loading || refreshing} onClick={() => { setRefreshing(true); void load(); }}>
          <CarbonIcons.Renew size={16}/> 刷新数据
        </Button>
      </div>
    </header>

    {error && <InlineNotification kind="error" title="工作台数据读取失败" subtitle={error} lowContrast/>}

    {loading && !data ? <div className="tp-workbench__loading"><InlineLoading description="正在汇聚全球业务数据…"/></div> : <>
      <section className="tp-workbench__metrics" aria-label="核心业务指标">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return <button type="button" key={metric.label} className={'tp-workbench__metric tp-workbench__metric--' + index} onClick={() => navigate(metric.href)}>
            <span className="tp-workbench__metric-icon"><Icon size={20}/></span>
            <span className="tp-workbench__metric-label">{metric.label}</span>
            <strong>{number(metric.value)}</strong>
            <small>{metric.detail}</small>
            <span className="tp-workbench__metric-link">查看详情 <CarbonIcons.ArrowRight size={14}/></span>
          </button>;
        })}
      </section>

      <section className="tp-workbench__primary-grid">
        <Tile className="tp-workbench__panel tp-workbench__country-panel">
          <div className="tp-workbench__panel-heading">
            <div><p className="tp-workbench__kicker">GLOBAL CUSTOMER FOOTPRINT</p><h2>全球客户分布</h2><p>矩形面积表示客户数量，国家占比按当前客户总量计算。</p></div>
            <Tag type="blue">{countries.length} 个国家 / 地区</Tag>
          </div>
          {countries.length ? <TreemapChart data={countries.map(item => ({ group: item.name, value: item.value }))} options={treemapOptions as any}/> : <div className="tp-workbench__empty">暂无国家 / 地区数据。完善客户档案中的国家代码后，这里会自动生成分布图。</div>}
          {countries.length > 0 && <div className="tp-workbench__country-list">
            {countries.slice(0, 8).map((country, index) => <button type="button" key={country.code} onClick={() => navigate('/accounts')}>
              <span className="tp-workbench__country-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="tp-workbench__country-name">{country.name}</span>
              <strong>{number(country.value)}</strong>
              <span className="tp-workbench__country-share">{country.share.toFixed(1)}%</span>
            </button>)}
          </div>}
          {(data?.accounts.length || 0) >= 50000 && <p className="tp-workbench__data-note">国家分布基于最近读取的 50,000 条客户档案；总客户指标使用数据库精确计数。</p>}
        </Tile>

        <div className="tp-workbench__side-column">
          <Tile className="tp-workbench__panel">
            <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">CUSTOMER COMPOSITION</p><h2>客户结构</h2><p>按客户当前状态分类</p></div></div>
            {statusData.length ? <DonutChart data={statusData} options={statusOptions as any}/> : <div className="tp-workbench__empty">暂无客户状态数据</div>}
          </Tile>
          <Tile className="tp-workbench__panel tp-workbench__quick-panel">
            <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">WORK QUEUE</p><h2>工作队列</h2><p>需要关注的自动化任务</p></div></div>
            <button type="button" onClick={() => navigate('/agent')}><span className="tp-workbench__queue-icon is-running"><CarbonIcons.InProgress size={18}/></span><span>运行中任务</span><strong>{number(data?.runningAgents ?? 0)}</strong><CarbonIcons.ChevronRight size={16}/></button>
            <button type="button" onClick={() => navigate('/agent')}><span className="tp-workbench__queue-icon is-failed"><CarbonIcons.WarningAlt size={18}/></span><span>失败任务</span><strong>{number(data?.failedAgents ?? 0)}</strong><CarbonIcons.ChevronRight size={16}/></button>
          </Tile>
        </div>
      </section>

      <section className="tp-workbench__secondary-grid">
        <Tile className="tp-workbench__panel">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">CUSTOMER ACQUISITION</p><h2>客户增长趋势</h2><p>根据客户档案创建时间统计，最近 30 天</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/accounts')}>客户管理 <CarbonIcons.ArrowRight size={16}/></Button></div>
          <AreaChart data={trend} options={trendOptions as any}/>
        </Tile>
        <Tile className="tp-workbench__panel">
          <div className="tp-workbench__panel-heading"><div><p className="tp-workbench__kicker">RECENT AGENT ACTIVITY</p><h2>最近任务活动</h2><p>最近更新的 Agent 执行记录</p></div><Button kind="ghost" size="sm" onClick={() => navigate('/agent')}>任务中心 <CarbonIcons.ArrowRight size={16}/></Button></div>
          <div className="tp-workbench__activity-list">
            {(data?.activities || []).map(activity => <button type="button" key={activity.id} onClick={() => navigate('/agent')}>
              <span className="tp-workbench__activity-status"><i className={'is-' + (activity.status || 'unknown')}/></span>
              <span className="tp-workbench__activity-copy"><strong>{activity.goal || '未命名 Agent 任务'}</strong><small>{activity.status || '状态未知'}</small></span>
              <time>{new Date(activity.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
              <CarbonIcons.ChevronRight size={16}/>
            </button>)}
            {!data?.activities.length && <p className="tp-workbench__empty">暂无任务活动</p>}
          </div>
        </Tile>
      </section>
    </>}
    <footer className="tp-workbench__footer"><span>TRADEPILOT · GLOBAL BUSINESS INTELLIGENCE</span><span>数据来自当前账户可访问的业务记录</span></footer>
  </main>;
}
