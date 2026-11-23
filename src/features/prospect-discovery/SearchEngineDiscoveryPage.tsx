import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, Checkbox, ComboBox, InlineNotification, Link, NumberInput, ProgressIndicator, ProgressStep, ProgressBar, WorldMapChart, Tag, TextArea, TextInput, Tile, Select, SelectItem, TpDataTable } from '@/design-system';
import { useNavigate } from 'react-router-dom';
import { Analytics, ArrowLeft, ArrowRight, Renew, Search, Time, UserFollow } from '@/design-system/icons';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/search-engine-discovery.scss';

type Country = { cca2: string; cca3?: string; name: { common: string } };
type ExclusionCategory = { key: string; label: string; domains: string[]; enabled: boolean };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type SearchRecord = { id: string; name?: string | null; website?: string | null; country_code?: string | null; address?: string | null; phone?: string | null; email?: string | null; status?: string; raw_data?: Record<string, unknown> | null; updated_at?: string };
type RunSnapshot = { id: string; task_code?: string | null; query?: string | null; status?: string | null; progress?: number | null; discovered_count?: number | null; message?: string | null };
const roles = [
  { id: 'manufacturer', label: '制造商 / 工厂', terms: 'manufacturer OR factory' },
  { id: 'brand', label: '品牌商', terms: 'brand OR brand owner' },
  { id: 'supplier', label: '供应商', terms: 'supplier OR supplier company' },
  { id: 'wholesaler', label: '批发商', terms: 'wholesaler OR wholesale' },
  { id: 'importer', label: '进口商', terms: 'importer OR importing company' },
  { id: 'distributor', label: '分销商', terms: 'distributor OR distributor company' },
  { id: 'oem', label: 'OEM / ODM', terms: 'OEM OR ODM' },
];
const categoryLabels: Record<string, string> = { ecommerce:'电商平台',social:'社交媒体',video:'视频平台',directories:'企业目录',news:'新闻媒体',forums:'论坛社区',search_engines:'搜索引擎',job_boards:'招聘网站',maps_reviews:'地图点评',government:'政府机构',education:'教育学术',software:'软件目录',hosting:'托管建站',classifieds:'分类信息',finance:'金融投资',travel:'旅游票务',aggregators:'价格聚合',nonprofit:'非营利组织',adult_gambling:'成人博彩' };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.error?.message || '请求失败（HTTP ' + response.status + '）');
  return (payload.data ?? payload) as T;
}
function countryLabel(country: Country) {
  const local = new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(country.cca2);
  return local && local !== country.cca2 ? local + ' / ' + country.name.common : country.name.common;
}
function flag(code: string) { return 'https://flagcdn.com/w40/' + code.toLowerCase() + '.png'; }
function websiteAnalysis(record: SearchRecord): Record<string, unknown> | null { const value = record.raw_data?.website_analysis; return value && typeof value === 'object' ? value as Record<string, unknown> : null; }

export function SearchEngineDiscoveryPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [product, setProduct] = useState('');
  const [rolesSelected, setRolesSelected] = useState<string[]>(['manufacturer','brand','supplier','wholesaler','importer','distributor','oem']);
  const [searchLanguage, setSearchLanguage] = useState('en');
  const navigate = useNavigate();
  const [engines, setEngines] = useState<string[]>([]);
  const [configuredEngines, setConfiguredEngines] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(100);
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [categories, setCategories] = useState<ExclusionCategory[]>([]);
  const [excludeDomains, setExcludeDomains] = useState('');
  const [verifiedRecords, setVerifiedRecords] = useState<SearchRecord[]>([]);
  const [activeSearchRunId, setActiveSearchRunId] = useState<string | null>(null);
  const [searchRun, setSearchRun] = useState<RunSnapshot | null>(null);
  const [searchPolling, setSearchPolling] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [candidateFilter, setCandidateFilter] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [analyzeSubmitting, setAnalyzeSubmitting] = useState(false);
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [analysisRun, setAnalysisRun] = useState<RunSnapshot | null>(null);
  const [analysisRecords, setAnalysisRecords] = useState<SearchRecord[]>([]);
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const [promotingIds, setPromotingIds] = useState<string[]>([]);
  const [promotedRecordIds, setPromotedRecordIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ countries: Country[] }>('/api/v1/prospect-profiling/countries'),
      api<ExclusionCategory[]>('/api/v1/settings/search-exclusions'),
      api<Record<string, boolean>>('/api/v1/settings/integrations'),
    ]).then(([countryData, exclusionData, integrations]) => {
      if (!active) return;
      setCountries(countryData.countries ?? []);
      setCategories(exclusionData ?? []);
      const available = { brightdata: Boolean(integrations.brightdata && integrations.brightdataZone), quanticdata: Boolean(integrations.quanticdata), serpkite: Boolean(integrations.serpkite), serpapi: Boolean(integrations.serpapi) };
      setConfiguredEngines(available);
      setEngines(Object.keys(available).filter(key => available[key]));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '页面数据读取失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const generatedQuery = useMemo(() => {
    const terms = roles.filter(role => rolesSelected.includes(role.id)).map(role => '(' + role.terms + ')');
    const base = '"' + product.trim().replace(/"/g, '') + '"';
    return [base, terms.length ? '(' + terms.join(' OR ') + ')' : '', country ? '(' + country.name.common + ' OR ' + country.cca2 + ')' : ''].filter(Boolean).join(' ');
  }, [product, rolesSelected, country]);
  const activeQuery = advancedQuery.trim() || generatedQuery;
  const visibleCandidates = useMemo(() => verifiedRecords.filter(record => record.status === 'new' && ((record.name || '').toLowerCase().includes(candidateFilter.toLowerCase()) || (record.website || '').toLowerCase().includes(candidateFilter.toLowerCase()))), [verifiedRecords, candidateFilter]);
  const mapCountries = useMemo(() => countries.map(item => ({ code: item.cca2, label: countryLabel(item), value: 1 })), [countries]);

  const toggleRole = (id: string, checked: boolean) => setRolesSelected(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleEngine = (id: string, checked: boolean) => setEngines(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleCategory = (key: string, checked: boolean) => setCategories(current => current.map(item => item.key === key ? { ...item, enabled: checked } : item));
  const fetchRunRecords = async (runId: string): Promise<SearchRecord[]> => {
    const client = await getSupabaseClient();
    const recordIds: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: occurrenceError } = await client.from('discovery_record_occurrences')
        .select('record_id').eq('run_id', runId).eq('is_removed', false).range(offset, offset + 999);
      if (occurrenceError) throw occurrenceError;
      recordIds.push(...(data ?? []).map(row => String(row.record_id)));
      if (!data || data.length < 1000) break;
    }
    const uniqueIds = [...new Set(recordIds)];
    const rows: SearchRecord[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 200) {
      const chunk = uniqueIds.slice(offset, offset + 200);
      const { data, error: recordError } = await client.from('discovery_records')
        .select('id,name,website,country_code,address,phone,email,status,raw_data,updated_at')
        .eq('channel', 'search_engine').in('id', chunk);
      if (recordError) throw recordError;
      rows.push(...(data ?? []) as SearchRecord[]);
    }
    return rows;
  };
  const refreshDiscoveryData = async () => {
    if (!activeSearchRunId) return;
    const rows = await fetchRunRecords(activeSearchRunId);
    setVerifiedRecords(rows);
    setAnalysisRecords(current => current.map(old => rows.find(row => row.id === old.id) ?? old));
  };
  useEffect(() => {
    if (!activeSearchRunId || !searchPolling) return;
    let live = true;
    const poll = async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error: runError } = await client.from('discovery_runs')
          .select('id,task_code,query,status,progress,discovered_count,message')
          .eq('id', activeSearchRunId).maybeSingle();
        if (runError) throw runError;
        if (!live) return;
        if (data) setSearchRun(data as RunSnapshot);
        await refreshDiscoveryData();
        if (['completed','partial','failed','cancelled'].includes(String(data?.status || ''))) setSearchPolling(false);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : '当前任务候选网站刷新失败');
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { live = false; window.clearInterval(timer); };
  }, [activeStep, activeSearchRunId, searchPolling]);
  useEffect(() => {
    if (activeStep < 2 || !analysisRunId || !analysisPolling) return;
    let live = true;
    const poll = async () => {
      try {
        const client = await getSupabaseClient();
        const { data, error: runError } = await client.from('discovery_runs')
          .select('id,task_code,query,status,progress,discovered_count,message')
          .eq('id', analysisRunId).maybeSingle();
        if (runError) throw runError;
        if (!live) return;
        if (data) setAnalysisRun(data as RunSnapshot);
        const refreshed: SearchRecord[] = [];
        for (let offset = 0; offset < selectedRecordIds.length; offset += 200) {
          const chunk = selectedRecordIds.slice(offset, offset + 200);
          const { data: rows, error: recordsError } = await client.from('discovery_records')
            .select('id,name,website,country_code,address,phone,email,status,raw_data,updated_at')
            .eq('channel', 'search_engine').in('id', chunk);
          if (recordsError) throw recordsError;
          refreshed.push(...(rows ?? []) as SearchRecord[]);
        }
        if (live) setAnalysisRecords(refreshed);
        if (['completed','partial','failed','cancelled'].includes(String(data?.status || ''))) setAnalysisPolling(false);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'AI 分析结果刷新失败');
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { live = false; window.clearInterval(timer); };
  }, [activeStep, analysisRunId, analysisPolling, selectedRecordIds.join(',')]);


  const promoteToLead = async (record: SearchRecord) => {
    if (promotingIds.includes(record.id) || promotedRecordIds.includes(record.id)) return;
    setPromotingIds(current => [...current, record.id]);
    setError('');
    try {
      const result = await api<{ leadId?: string; id?: string }>('/api/v1/discovery-records/' + record.id + '/action', {
        method: 'POST', body: JSON.stringify({ action: 'promote' }),
      });
      setPromotedRecordIds(current => [...current, record.id]);
      setNotice((record.name || '该企业') + ' 已加入线索。' + (result.leadId ? ' 线索编号：' + result.leadId : ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加入线索失败');
    } finally {
      setPromotingIds(current => current.filter(id => id !== record.id));
    }
  };
  const startAnalysis = async (forceReanalysis = false) => {
    const eligibleRecordIds = selectedRecordIds.filter(id => verifiedRecords.some(record => record.id === id && record.status === 'new' && !!record.website));
    if (!activeSearchRunId) { setError('当前没有可关联的搜索任务，请返回候选网站步骤重新选择。'); return; }
    if (!eligibleRecordIds.length) { setError('所选候选中没有可分析的官网地址，请选择带有官网 URL 的记录。'); return; }
    if (eligibleRecordIds.length > 500) { setError('单次最多分析 500 个候选网站，请分批选择。'); return; }
    setError(''); setNotice(''); setAnalyzeSubmitting(true);
    setAnalysisRecords(verifiedRecords.filter(record => eligibleRecordIds.includes(record.id)));
    setAnalysisRun(null); setAnalysisRunId(null); setAnalysisPolling(false);
    try {
      const result = await api<{ id: string; taskCode: string; selectedCount: number; batchSize: number }>('/api/v1/search-discovery-runs/analyze', {
        method: 'POST', body: JSON.stringify({ recordIds: eligibleRecordIds, sourceRunId: activeSearchRunId, batchSize, forceReanalysis, country: country?.cca2 }),
      });
      setAnalysisRunId(result.id);
      setAnalysisRun({ id: result.id, task_code: result.taskCode, query: product, status: 'queued', progress: 0, discovered_count: 0, message: '分析任务已排队' });
      setAnalysisPolling(true);
      setNotice('AI 分析已启动：' + result.taskCode + ' · ' + result.selectedCount + ' 个网站。完成结果会自动更新到下方表格。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '启动网站分析失败'); }
    finally { setAnalyzeSubmitting(false); }
  };

  const submit = async () => {
    setError(''); setNotice('');
    if (!product.trim()) { setError('请先输入产品名称。'); return; }
    if (!country) { setError('请选择一个目标国家或地区。'); return; }
    if (!engines.length) { setError('至少选择一个搜索引擎。'); return; }
    if (!rolesSelected.length) { setError('至少选择一种目标企业类型。'); return; }
    if (!activeQuery.trim()) { setError('搜索语法不能为空。'); return; }
    const domains = [...new Set(excludeDomains.split(/[\n,;\s]+/).map(value => value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'')).filter(Boolean))];
    if (domains.some(value => !/^[a-z0-9.-]+(?:\/[^\s]*)?$/.test(value) || !value.includes('.'))) { setError('排除清单包含无效域名，请检查后重试。'); return; }
    setSubmitting(true);
    try {
      const payload = await api<{ id?: string; taskCode?: string; message?: string }>('/api/v1/search-discovery-runs', {
        method: 'POST',
        body: JSON.stringify({
          country: country.cca2, query: product.trim(), advancedQuery: activeQuery,
          limitPerCountry: limit, searchEngines: engines, searchTypes: ['web'],
          searchLanguage, excludeCategories: categories.filter(item => item.enabled).map(item => item.key),
          excludeDomains: domains, businessTypes: rolesSelected,
        }),
      });
      if (!payload.id) throw new Error('搜索任务创建成功，但服务端没有返回任务编号。');
      setActiveSearchRunId(payload.id);
      setSearchRun({ id: payload.id, task_code: payload.taskCode, query: product.trim(), status: 'queued', progress: 0, discovered_count: 0, message: '搜索任务已排队，正在连接搜索引擎' });
      setSearchPolling(true);
      setVerifiedRecords([]);
      setSelectedRecordIds([]);
      setAnalysisRecords([]);
      setAnalysisRunId(null);
      setAnalysisRun(null);
      setAnalysisPolling(false);
      setPromotedRecordIds([]);
      setCandidateFilter('');
      setActiveStep(1);
      setNotice('搜索任务已创建：' + (payload.taskCode ?? '已进入队列') + '。第二步只显示本次任务的搜索结果。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建搜索任务失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <main>
      <PageHeader
        breadcrumb="GLOBAL PROSPECT DISCOVERY / SEARCH ENGINE"
        title="搜索引擎发现"
        description="从产品名称发现目标市场企业，先建立候选网站池，再按需启动 AI 深度分析。"
        actions={[
          { id: 'search-history', label: '历史任务', kind: 'secondary', icon: <Time size={20} />, onClick: () => navigate('/prospect-discovery/search-engine/tasks') },
          { id: 'search-customers', label: '搜索客户', kind: 'primary', icon: <Search size={20} />, onClick: () => navigate('/prospect-discovery/search-engine/results') },
        ]}
      />
      <section className="tp-search-discovery__steps-viewport" aria-label="搜索客户流程">
        <div className="tp-search-discovery__steps-track"><ProgressIndicator currentIndex={activeStep} spaceEqually><ProgressStep label="搜索条件" description="Search criteria" /><ProgressStep label="候选网站" description="Candidate websites" /><ProgressStep label="批量分析" description="Batch analysis" /><ProgressStep label="分析结果" description="Company results" /></ProgressIndicator></div>
      </section>

      {error && <InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="任务已提交" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      {activeStep === 0 && <>
      <Tile id="search-target" className="tp-search-discovery__tile">
        <h2>1. 搜索目标</h2>
        <p>输入产品并选择唯一目标国家。</p>
        <div className="tp-search-discovery__target-grid">
          <TextInput id="search-product" labelText="产品名称" placeholder="例如：Wireless Earbuds" value={product} onChange={event => setProduct(event.target.value)} />
          <ComboBox id="search-country" titleText="目标国家 / 地区" placeholder="搜索国家名称或代码" items={countries} itemToString={item => item ? countryLabel(item) + ' (' + item.cca2 + ')' : ''} selectedItem={country} onChange={({ selectedItem }) => setCountry(selectedItem ?? null)} />
        </div>
        {country && <p className="tp-search-discovery__market-meta"><img src={flag(country.cca2)} alt="" width="24" height="16" />　目标市场：{countryLabel(country)}（{country.cca2}） · 搜索语言：{searchLanguage}</p>}
        <div className="tp-search-discovery__language-select">
          <Select id="search-language" labelText="搜索结果语言 / Result language" value={searchLanguage} onChange={event => setSearchLanguage(event.currentTarget.value)}>
            <SelectItem value="en" text="英语 / English（推荐）" />
            <SelectItem value="de" text="德语 / Deutsch" />
            <SelectItem value="fr" text="法语 / Français" />
            <SelectItem value="es" text="西班牙语 / Español" />
            <SelectItem value="it" text="意大利语 / Italiano" />
            <SelectItem value="ja" text="日语 / 日本語" />
            <SelectItem value="ko" text="韩语 / 한국어" />
            <SelectItem value="pt" text="葡萄牙语 / Português" />
            <SelectItem value="nl" text="荷兰语 / Nederlands" />
            <SelectItem value="zh-cn" text="简体中文 / 简体中文" />
            <SelectItem value="zh-tw" text="繁体中文 / 繁體中文" />
          </Select>
          <p>选择搜索语言。</p>
        </div>
        <div className="tp-search-discovery__map"><h3>Carbon 全球市场地图</h3><p>选择目标国家。</p><WorldMapChart data={mapCountries} selectedCode={country?.cca2} onCountrySelect={code => setCountry(countries.find(item => item.cca2 === code) ?? null)} showRanking={false} unitLabel="个目标市场" /></div>
        <div className="tp-search-discovery__subsection">
          <h3>目标企业类型</h3>
          <div className="tp-search-discovery__options-grid">
            {roles.map(role => <Checkbox key={role.id} id={'role-' + role.id} labelText={role.label} checked={rolesSelected.includes(role.id)} onChange={(_, data) => toggleRole(role.id, data.checked)} />)}
          </div>
        </div>
      </Tile>

      <Tile className="tp-search-discovery__tile">
        <h2>2. 高级搜索语法</h2>
        <p>使用自动生成的查询，或编辑高级搜索语法。</p>
        <TextArea id="search-advanced-query" labelText="高级搜索表达式（留空则自动生成）" rows={4} value={advancedQuery} onChange={event => setAdvancedQuery(event.target.value)} placeholder={generatedQuery || '"wireless earbuds" manufacturer OR supplier -directory'} />
        <p className="tp-search-discovery__query-preview"><strong>当前预览：</strong>{activeQuery || '输入产品名称后自动生成'}</p>
      </Tile>

      <Tile className="tp-search-discovery__tile">
        <h2>3. 搜索来源与排除规则</h2><p>仅显示已在设置中配置的免费月度服务。</p>
        <div className="tp-search-discovery__options-grid tp-search-discovery__engine-grid">
          {(['brightdata','quanticdata','serpkite','serpapi'] as const).filter(engine => configuredEngines[engine]).map(engine => <Checkbox key={engine} id={'engine-' + engine} labelText={{brightdata:'Bright Data',quanticdata:'QuanticData',serpkite:'SerpKite',serpapi:'SerpApi'}[engine]} checked={engines.includes(engine)} onChange={(_, data) => toggleEngine(engine, data.checked)} />)}
          {!Object.values(configuredEngines).some(Boolean) && <InlineNotification kind="warning" title="尚未配置搜索服务" subtitle="请前往设置 → API 集成配置免费月度搜索服务。" />}
          {configuredEngines.brightdata && <span className="tp-search-discovery__helper">Bright Data · 5,000 次/月</span>}
          {configuredEngines.quanticdata && <span className="tp-search-discovery__helper">QuanticData · USD 2/月</span>}
          {configuredEngines.serpkite && <span className="tp-search-discovery__helper">SerpKite · 1,000 credits/月</span>}
          {configuredEngines.serpapi && <span className="tp-search-discovery__helper">SerpApi · 250 次/月</span>}
        </div>
        <NumberInput id="search-limit" label="每个搜索引擎最大候选数" min={10} max={500} step={10} value={limit} onChange={(_, data) => setLimit(Number(data.value) || 100)} />
        <h3 className="tp-search-discovery__section-label">网站类别排除</h3>
        <div className="tp-search-discovery__options-grid">
          {categories.map(item => <Checkbox key={item.key} id={'exclude-' + item.key} labelText={item.label || categoryLabels[item.key] || item.key} checked={item.enabled} onChange={(_, data) => toggleCategory(item.key, data.checked)} />)}
        </div>
        <TextArea id="search-exclude-domains" labelText="自定义排除域名（支持批量粘贴，每行一个，也可用逗号分隔）" rows={5} value={excludeDomains} onChange={event => setExcludeDomains(event.target.value)} placeholder={'amazon.com\nalibaba.com\nfacebook.com\nyellowpages.com'} />
      </Tile>

      <Tile id="search-submit" className="tp-search-discovery__tile tp-search-discovery__tile--last">
        <h2>搜索配置已就绪</h2>
        <p>确认后创建搜索任务。</p>
      </Tile>
      </>}

      {activeStep === 1 && <>
      <section id="candidate-pool" className="tp-search-discovery__section">
        <div className="tp-search-discovery__section-heading">
          <div><h2>候选网站</h2><p>仅显示当前任务的候选。</p></div>
          <Tag type="blue">{visibleCandidates.length} 个候选 · 已选 {selectedRecordIds.length}</Tag>
        </div>
        {searchRun && <section className="tp-search-discovery__run-progress" aria-live="polite">
          <div className="tp-search-discovery__run-progress-heading">
            <div><strong>{searchRun.task_code || '当前搜索任务'}</strong><p>{searchRun.query || product} · {searchRun.message || '正在收集候选网站'}</p></div>
            <Tag type={searchRun.status === 'completed' ? 'green' : searchRun.status === 'failed' ? 'red' : searchRun.status === 'partial' ? 'warm-gray' : 'blue'}>{({ queued: '排队中', running: '正在搜索', completed: '搜索完成', partial: '部分完成', failed: '搜索失败', cancelled: '已取消' } as Record<string, string>)[searchRun.status || ''] || searchRun.status || '准备中'}</Tag>
          </div>
          <ProgressBar value={Math.max(0, Math.min(100, Number(searchRun.progress) || 0))} max={100} label="搜索采集进度" helperText={(searchRun.progress ?? 0) + '% · 当前任务候选 ' + visibleCandidates.length + ' 个网站 · 已选择 ' + selectedRecordIds.length + ' 个'} />
        </section>}
        <div className="tp-search-discovery__candidate-toolbar">
          <Tag type="blue">{visibleCandidates.length} 个本次任务候选</Tag>
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => void refreshDiscoveryData()}>刷新本次结果</Button>
        </div>
        <TpDataTable<SearchRecord>
          ariaLabel="搜索候选网站"
          rows={visibleCandidates}
          rowKey="id"
          selectable
          loading={loading}
          searchValue={candidateFilter}
          onSearchChange={setCandidateFilter}
          columns={[
            { key: 'name', header: '候选企业 / 网站', primary: true, minWidth: 260, render: record => <div><strong>{record.name || '未命名候选网站'}</strong><p>{record.website || '未提供官网地址'}</p></div> },
            { key: 'country_code', header: '国家 / 地区', minWidth: 120 },
            { key: 'analysis_status', header: '分析状态', minWidth: 120, render: record => { const status = websiteAnalysis(record)?.status; return <Tag type={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'cool-gray'}>{status === 'completed' ? '已分析' : status === 'failed' ? '分析失败' : '待分析'}</Tag>; } },
            { key: 'website', header: '官网', minWidth: 220, render: record => record.website ? <Link href={record.website}>打开官网</Link> : '—' },
          ]}
          batchActions={[
            { key: 'select-analysis', label: '加入分析选择', onClick: records => { const ids = records.filter(record => record.website && record.status === 'new').map(record => record.id); setSelectedRecordIds(current => [...new Set([...current, ...ids])]); setAnalysisRecords(current => {
              const byId = new Map(current.map(record => [record.id, record] as const));
              records.filter(record => ids.includes(record.id)).forEach(record => byId.set(record.id, record));
              return [...byId.values()];
            }); } },
            { key: 'remove-candidates', label: '从本次任务移除', onClick: async records => { await Promise.all(records.map(record => api('/api/v1/discovery-records/' + record.id + '/action', { method: 'POST', body: JSON.stringify({ action: 'remove', runId: activeSearchRunId }) }))); setSelectedRecordIds(current => current.filter(id => !records.some(record => record.id === id))); await refreshDiscoveryData(); } },
          ]}
          emptyState={<p>暂无符合条件的候选网站。搜索任务完成后，结果会自动进入这里。</p>}
          columnSettingsKey="search-discovery-candidates"
        />
      </section>
      </>}

      {activeStep === 2 && <>
      <section id="analysis-workbench" className="tp-search-discovery__phase-panel">
        <p className="tp-search-discovery__eyebrow">WORKSTATION 03 / AI INTELLIGENCE</p>
        <h2>AI 深度分析工作站</h2>
        <p>分析所选网站，核验企业信息后加入线索。</p>
        <div className="tp-search-discovery__analysis-launch">
          <NumberInput id="analysis-batch-size" label="每批网站数量" min={1} max={20} step={1} value={batchSize} onChange={(_, data) => setBatchSize(Math.max(1, Math.min(20, Number(data.value) || 10)))} />
          <div className="tp-search-discovery__analysis-launch-actions">
            <Button kind="primary" renderIcon={Analytics} onClick={() => void startAnalysis(false)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '分析所选网站'}</Button>
            <Button kind="secondary" renderIcon={Renew} onClick={() => void startAnalysis(true)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '重新分析所选'}</Button>
          </div>
        </div>
        <section className="tp-search-discovery__analysis-progress" aria-live="polite">
          <div className="tp-search-discovery__run-progress-heading">
            <div><strong>{analysisRun?.task_code || '待启动 AI 分析'}</strong><p>{analysisRun?.message || '下方表格展示本次勾选的网站；启动分析后会实时刷新结果。'}</p></div>
            {analysisRun && <Tag type={analysisRun.status === 'completed' ? 'green' : analysisRun.status === 'failed' ? 'red' : analysisRun.status === 'partial' ? 'warm-gray' : 'blue'}>{({ queued: '排队中', running: 'AI 分析中', completed: '分析完成', partial: '部分完成', failed: '分析失败', paused: '已暂停', cancelled: '已取消' } as Record<string, string>)[analysisRun.status || ''] || analysisRun.status || '准备中'}</Tag>}
          </div>
          <ProgressBar value={Math.max(0, Math.min(100, Number(analysisRun?.progress) || 0))} max={100} label="AI 网站分析进度" helperText={(analysisRun?.progress ?? 0) + '% · 已完成 ' + analysisRecords.filter(record => websiteAnalysis(record)?.status === 'completed').length + ' · 失败 ' + analysisRecords.filter(record => websiteAnalysis(record)?.status === 'failed').length + ' · 总计 ' + selectedRecordIds.length} />
        </section>
        <div className="tp-search-discovery__section-heading"><div><h3>本次选中的网站与 AI 分析结果</h3><p>当前任务的分析结果。</p></div><Tag type="blue">{analysisRecords.length} 条</Tag></div>
        <TpDataTable<SearchRecord>
          ariaLabel="本次选择的网站及 AI 分析结果"
          rows={analysisRecords}
          rowKey="id"
          loading={false}
          columns={[
            { key: 'name', header: '公司名称 / 网站名称', primary: true, minWidth: 220, render: record => <div><strong>{record.name || '待识别企业'}</strong><p>{record.website || '—'}</p></div> },
            { key: 'country_code', header: '国家 / 地区', minWidth: 110 },
            { key: 'analysis_status', header: '分析状态', minWidth: 120, render: record => { const a = websiteAnalysis(record); return <Tag type={a?.status === 'completed' ? 'green' : a?.status === 'failed' ? 'red' : a?.status === 'analyzing' ? 'blue' : 'cool-gray'}>{a?.status === 'completed' ? '已完成' : a?.status === 'failed' ? '失败' : a?.status === 'analyzing' ? '分析中' : '等待分析'}</Tag>; } },
            { key: 'address', header: '公司地址', minWidth: 180, render: record => String(websiteAnalysis(record)?.address || record.address || '—') },
            { key: 'phone', header: '电话', minWidth: 140, render: record => String(websiteAnalysis(record)?.phone || record.phone || '—') },
            { key: 'email', header: '邮箱', minWidth: 180, render: record => String(websiteAnalysis(record)?.email || record.email || '—') },
            { key: 'products', header: '产品 / 服务', minWidth: 200, render: record => { const products = websiteAnalysis(record)?.products; return Array.isArray(products) ? products.join('、') : '—'; } },
            { key: 'confidence', header: '官网可信度', minWidth: 120, render: record => { const score = websiteAnalysis(record)?.website_confidence; return score === undefined ? '—' : String(score) + '/100'; } },
            { key: 'evidence', header: '证据', minWidth: 120, render: record => { const evidence = websiteAnalysis(record)?.evidence; return Array.isArray(evidence) && evidence.length ? <details><summary>{evidence.length} 条证据</summary>{(evidence as Array<Record<string, unknown>>).map((item, index) => <blockquote key={index}><strong>{String(item.field || '')}：</strong>{String(item.value || '')}<p>{String(item.excerpt || '')}</p></blockquote>)}</details> : '—'; } },
            { key: 'lead_action', header: '线索操作', minWidth: 140, render: record => websiteAnalysis(record)?.status === 'completed' ? <Button kind="tertiary" size="sm" renderIcon={UserFollow} disabled={promotingIds.includes(record.id) || promotedRecordIds.includes(record.id)} onClick={() => void promoteToLead(record)}>{promotedRecordIds.includes(record.id) ? '已加入线索' : promotingIds.includes(record.id) ? '提交中…' : '加入线索'}</Button> : '—' },
          ]}
          emptyState={<p>尚未选择网站。请返回候选网站步骤，勾选网站并加入分析选择。</p>}
          columnSettingsKey="search-discovery-analysis-results"
        />
      </section>


      </>}
      {activeStep === 3 && <>
        <section className="tp-search-discovery__result-shortcut">
          <h2>本次任务分析结果</h2>
          <p>本次任务已选择 {selectedRecordIds.length} 个网站，AI 已完成 {analysisRecords.filter(record => websiteAnalysis(record)?.status === 'completed').length} 个。确认后可逐条加入线索；全部任务的汇总结果可从 Header 的「搜索客户」查看。</p>
          {analysisRun && <ProgressBar value={Math.max(0, Math.min(100, Number(analysisRun.progress) || 0))} max={100} label="本次任务分析进度" helperText={analysisRun.message || '分析进行中'} />}
          <TpDataTable<SearchRecord> ariaLabel="本次任务分析结果" rows={analysisRecords} rowKey="id" loading={false} columns={[
            { key: 'name', header: '公司名称', primary: true, minWidth: 200 },
            { key: 'website', header: '官网', minWidth: 180, render: record => record.website ? <Link href={record.website}>打开官网</Link> : '—' },
            { key: 'phone', header: '电话', minWidth: 140, render: record => String(websiteAnalysis(record)?.phone || record.phone || '—') },
            { key: 'email', header: '邮箱', minWidth: 180, render: record => String(websiteAnalysis(record)?.email || record.email || '—') },
            { key: 'analysis_status', header: '状态', minWidth: 110, render: record => <Tag type={websiteAnalysis(record)?.status === 'completed' ? 'green' : websiteAnalysis(record)?.status === 'failed' ? 'red' : 'blue'}>{websiteAnalysis(record)?.status === 'completed' ? '已完成' : websiteAnalysis(record)?.status === 'failed' ? '失败' : '待分析'}</Tag> },
            { key: 'lead_action', header: '线索操作', minWidth: 140, render: record => websiteAnalysis(record)?.status === 'completed' ? <Button kind="tertiary" size="sm" renderIcon={UserFollow} disabled={promotingIds.includes(record.id) || promotedRecordIds.includes(record.id)} onClick={() => void promoteToLead(record)}>{promotedRecordIds.includes(record.id) ? '已加入线索' : promotingIds.includes(record.id) ? '提交中…' : '加入线索'}</Button> : '—' },
          ]} columnSettingsKey="search-discovery-final-results" />
        </section>
      </>}

      <nav className="tp-search-discovery__wizard-nav" aria-label="流程导航">
        <Button kind="secondary" renderIcon={ArrowLeft} disabled={activeStep === 0} onClick={() => setActiveStep(step => Math.max(0, step - 1))}>上一步</Button>
        <span>步骤 {activeStep + 1} / 4</span>
        <Button kind="primary" renderIcon={ArrowRight} disabled={activeStep === 3 || (activeStep === 0 && !product.trim()) || (activeStep === 1 && selectedRecordIds.length === 0)} onClick={() => activeStep === 0 ? void submit() : setActiveStep(step => Math.min(3, step + 1))}>
          {activeStep === 0 ? (submitting ? '创建中…' : '创建搜索任务并下一步') : '下一步'}
        </Button>
      </nav>
    </main>
  );
}
