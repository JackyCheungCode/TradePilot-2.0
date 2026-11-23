import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, Checkbox, ComboBox, InlineNotification, Link, NumberInput, ProgressBar, Tag, TextArea, TextInput, Tile, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { SearchDiscoveryTwin } from './SearchDiscoveryTwin';
import '@/design-system/patterns/search-engine-discovery.scss';

type Country = { cca2: string; cca3?: string; name: { common: string } };
type ExclusionCategory = { key: string; label: string; domains: string[]; enabled: boolean };
type Run = { id: string; task_code?: string; query?: string; countries?: string[]; status?: string; progress?: number; discovered_count?: number; message?: string; created_at?: string; search_config?: Record<string, unknown> };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type SearchRecord = { id: string; name?: string | null; website?: string | null; country_code?: string | null; status?: string; raw_data?: Record<string, unknown> | null; updated_at?: string };
const roles = [
  { id: 'manufacturer', label: '制造商 / 工厂', terms: 'manufacturer OR factory' },
  { id: 'brand', label: '品牌商', terms: 'brand OR brand owner' },
  { id: 'supplier', label: '供应商', terms: 'supplier OR supplier company' },
  { id: 'wholesaler', label: '批发商', terms: 'wholesaler OR wholesale' },
  { id: 'importer', label: '进口商', terms: 'importer OR importing company' },
  { id: 'distributor', label: '分销商', terms: 'distributor OR distributor company' },
  { id: 'oem', label: 'OEM / ODM', terms: 'OEM OR ODM' },
];
const categoryLabels: Record<string, string> = { ecommerce: '电商平台', social: '社交媒体', video: '视频平台', directories: '企业目录', news: '新闻媒体', forums: '论坛社区' };
const languageByCountry: Record<string, string> = { DE:'de', AT:'de', CH:'de', FR:'fr', ES:'es', MX:'es', IT:'it', JP:'ja', KR:'ko', CN:'zh-cn', TW:'zh-tw', HK:'zh-tw', NL:'nl', BR:'pt-br', PT:'pt', RU:'ru', TH:'th', VN:'vi', ID:'id', TR:'tr', SA:'ar', AE:'ar' };
const statusText: Record<string, string> = { queued:'排队中', running:'执行中', completed:'已完成', partial:'部分完成', failed:'失败', paused:'已暂停', cancelled:'已取消' };

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
  const local = new Intl.DisplayNames(['zh-TW'], { type: 'region' }).of(country.cca2);
  return local && local !== country.cca2 ? local + ' · ' + country.name.common : country.name.common;
}
function flag(code: string) { return 'https://flagcdn.com/w40/' + code.toLowerCase() + '.png'; }
function websiteAnalysis(record: SearchRecord): Record<string, unknown> | null { const value = record.raw_data?.website_analysis; return value && typeof value === 'object' ? value as Record<string, unknown> : null; }

export function SearchEngineDiscoveryPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [product, setProduct] = useState('');
  const [rolesSelected, setRolesSelected] = useState<string[]>(['manufacturer','brand','supplier','wholesaler','importer','distributor','oem']);
  const [searchLanguage, setSearchLanguage] = useState('en');
  const [engines, setEngines] = useState<string[]>(['serper']);
  const [limit, setLimit] = useState(100);
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [categories, setCategories] = useState<ExclusionCategory[]>([]);
  const [excludeDomains, setExcludeDomains] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [verifiedRecords, setVerifiedRecords] = useState<SearchRecord[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [candidateFilter, setCandidateFilter] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [analyzeSubmitting, setAnalyzeSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ countries: Country[] }>('/api/v1/prospect-profiling/countries'),
      api<ExclusionCategory[]>('/api/v1/settings/search-exclusions'),
      getSupabaseClient().then(client => client.from('discovery_runs').select('id,task_code,query,countries,status,progress,discovered_count,message,created_at,search_config').eq('channel','search_engine').order('created_at',{ascending:false}).limit(8)),
      getSupabaseClient().then(client => client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').eq('status','new').order('updated_at',{ascending:false}).limit(1000)),
    ]).then(([countryData, exclusionData, runResult, recordResult]) => {
      if (!active) return;
      setCountries(countryData.countries ?? []);
      setCategories(exclusionData ?? []);
      if (runResult.error) throw runResult.error;
      setRuns((runResult.data ?? []) as Run[]);
      if (recordResult.error) throw recordResult.error;
      setVerifiedRecords((recordResult.data ?? []) as SearchRecord[]);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '页面数据读取失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!country) return;
    setSearchLanguage(languageByCountry[country.cca2] ?? 'en');
  }, [country]);

  const generatedQuery = useMemo(() => {
    const terms = roles.filter(role => rolesSelected.includes(role.id)).map(role => '(' + role.terms + ')');
    const base = '"' + product.trim().replace(/"/g, '') + '"';
    return [base, terms.length ? '(' + terms.join(' OR ') + ')' : '', country ? '(' + country.name.common + ' OR ' + country.cca2 + ')' : ''].filter(Boolean).join(' ');
  }, [product, rolesSelected, country]);
  const activeQuery = advancedQuery.trim() || generatedQuery;
  const analysisRuns = useMemo(() => runs.filter(run => run.search_config?.taskType === 'website_analysis'), [runs]);
  const latestAnalysisRun = analysisRuns[0];
  const visibleCandidates = useMemo(() => verifiedRecords.filter(record => (record.name || '').toLowerCase().includes(candidateFilter.toLowerCase()) || (record.website || '').toLowerCase().includes(candidateFilter.toLowerCase())), [verifiedRecords, candidateFilter]);
  const analysisResults = useMemo(() => verifiedRecords.filter(record => websiteAnalysis(record)?.status === 'completed'), [verifiedRecords]);

  const toggleRole = (id: string, checked: boolean) => setRolesSelected(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleEngine = (id: string, checked: boolean) => setEngines(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleCategory = (key: string, checked: boolean) => setCategories(current => current.map(item => item.key === key ? { ...item, enabled: checked } : item));
  const refreshDiscoveryData = async () => {
    const client = await getSupabaseClient();
    const [{ data: runData, error: runError }, { data: recordData, error: recordError }] = await Promise.all([
      client.from('discovery_runs').select('id,task_code,query,countries,status,progress,discovered_count,message,created_at,search_config').eq('channel','search_engine').order('created_at',{ascending:false}).limit(20),
      client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').eq('status','new').order('updated_at',{ascending:false}).limit(100),
    ]);
    if (runError) throw runError;
    if (recordError) throw recordError;
    setRuns((runData ?? []) as Run[]);
    setVerifiedRecords((recordData ?? []) as SearchRecord[]);
  };

  useEffect(() => {
    const hasActiveAnalysis = runs.some(run => run.search_config?.taskType === 'website_analysis' && ['queued','running','paused'].includes(run.status || ''));
    if (!hasActiveAnalysis) return;
    const timer = window.setInterval(() => { void refreshDiscoveryData().catch(cause => setError(cause instanceof Error ? cause.message : '刷新分析进度失败')); }, 5000);
    return () => window.clearInterval(timer);
  }, [runs]);

  const startAnalysis = async (forceReanalysis = false) => {
    if (!selectedRecordIds.length) { setError('请先在候选网站池中选择要分析的网站。'); return; }
    if (selectedRecordIds.length > 500) { setError('单次最多分析 500 个候选网站，请分批选择。'); return; }
    setError(''); setNotice(''); setAnalyzeSubmitting(true);
    try {
      const result = await api<{ id: string; taskCode: string; selectedCount: number; batchSize: number }>('/api/v1/search-discovery-runs/analyze', {
        method: 'POST', body: JSON.stringify({ recordIds: selectedRecordIds, batchSize, forceReanalysis, country: country?.cca2 }),
      });
      setNotice('AI 分析任务已创建：' + result.taskCode + ' · ' + result.selectedCount + ' 个网站 · 每批 ' + result.batchSize + ' 个');
      setActiveStep(2);
      await refreshDiscoveryData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '启动网站分析失败'); }
    finally { setAnalyzeSubmitting(false); }
  };

  const controlAnalysis = async (runId: string, action: 'pause' | 'resume' | 'cancel') => {
    setError('');
    try {
      await api('/api/v1/search-discovery-runs/' + runId + '/control', { method: 'POST', body: JSON.stringify({ action }) });
      setNotice(action === 'pause' ? '分析任务已暂停。' : action === 'resume' ? '分析任务已继续。' : '分析任务已取消。');
      await refreshDiscoveryData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '任务控制失败'); }
  };

  const retryAnalysis = async (runId: string) => {
    setError('');
    try {
      const result = await api<{ taskCode: string; selectedCount: number }>('/api/v1/search-discovery-runs/' + runId + '/retry', { method: 'POST', body: JSON.stringify({}) });
      setNotice('失败网站已重新排队：' + result.taskCode + ' · ' + result.selectedCount + ' 个');
      await refreshDiscoveryData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '重试失败'); }
  };

  const removeSelectedCandidates = async () => {
    if (!selectedRecordIds.length) return;
    const client = await getSupabaseClient();
    const { error: updateError } = await client.from('discovery_records').update({ status: 'removed' }).eq('channel', 'search_engine').in('id', selectedRecordIds);
    if (updateError) { setError(updateError.message); return; }
    setSelectedRecordIds([]);
    setNotice('已从候选池移除所选网站；原始搜索来源记录仍保留。');
    await refreshDiscoveryData();
  };

  const exportAnalysisResults = () => {
    const columns = ['公司名称','官网','国家','地址','电话','邮箱','联系人','产品','企业简介','企业类型','官网可信度','官网判断理由','来源网页','证据'];
    const rows = analysisResults.map(record => {
      const result = websiteAnalysis(record) ?? {};
      const evidence = Array.isArray(result.evidence) ? result.evidence as Array<Record<string, unknown>> : [];
      return [
        result.company_name || record.name || '', result.official_website || record.website || '',
        result.country || record.country_code || '', result.address || '', result.phone || '',
        result.email || '', result.contact_person || '',
        Array.isArray(result.products) ? (result.products as string[]).join('；') : '',
        result.company_description || '', result.business_type || '', result.website_confidence ?? '',
        result.official_website_reason || '', result.source_url || record.website || '',
        evidence.map(item => [item.field, item.value, item.excerpt].map(value => String(value ?? '')).join(': ')).join(' | '),
      ];
    });
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'tradepilot-company-intelligence.csv'; link.click();
    URL.revokeObjectURL(url);
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
      const payload = await api<{ taskCode?: string; message?: string }>('/api/v1/search-discovery-runs', {
        method: 'POST',
        body: JSON.stringify({
          country: country.cca2, query: product.trim(), advancedQuery: activeQuery,
          limitPerCountry: limit, searchEngines: engines, searchTypes: ['web'],
          searchLanguage, excludeCategories: categories.filter(item => item.enabled).map(item => item.key),
          excludeDomains: domains, businessTypes: rolesSelected,
        }),
      });
      setNotice('搜索任务已创建：' + (payload.taskCode ?? '已进入队列'));
      const client = await getSupabaseClient();
      const [{ data }, { data: recordData }] = await Promise.all([
        client.from('discovery_runs').select('id,task_code,query,countries,status,progress,discovered_count,message,created_at,search_config').eq('channel','search_engine').order('created_at',{ascending:false}).limit(8),
        client.from('discovery_records').select('id,name,website,country_code,raw_data,updated_at').eq('channel','search_engine').order('updated_at',{ascending:false}).limit(100),
      ]);
      setRuns((data ?? []) as Run[]);
      setVerifiedRecords((recordData ?? []) as SearchRecord[]);
      setSelectedRecordIds([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建搜索任务失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <main>
      <PageHeader>
        <div>
          <p className="tp-search-discovery__eyebrow">GLOBAL PROSPECT DISCOVERY / SEARCH ENGINE</p>
          <h1>搜索引擎发现</h1>
          <p>从产品名称发现目标市场企业，先建立候选网站池，再按需启动 AI 深度分析。</p>
        </div>
        <div><Tag type="blue">产品驱动发现</Tag></div>
      </PageHeader>
      <SearchDiscoveryTwin activeStep={activeStep} onStepChange={step => {
        setActiveStep(step);
        const target = ['search-target', 'candidate-pool', 'analysis-workbench', 'analysis-results'][step];
        window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }} candidateCount={verifiedRecords.length} taskCount={runs.length} searchCompleted={runs.some(run => run.search_config?.taskType !== 'website_analysis' && (run.status === 'completed' || run.status === 'partial'))} analysisCount={analysisRuns.reduce((sum, run) => sum + (run.discovered_count ?? 0), 0)} resultCount={analysisResults.length} />

      {error && <InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="任务已提交" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Tile id="search-target" className="tp-search-discovery__tile">
        <h2>1. 搜索目标</h2>
        <p>输入产品名称，选择希望发现客户的国家或地区。国家参数用于定位搜索市场，网站域名不会被当作企业所在地证明。</p>
        <div className="tp-search-discovery__target-grid">
          <TextInput id="search-product" labelText="产品名称" placeholder="例如：Wireless Earbuds" value={product} onChange={event => setProduct(event.target.value)} />
          <ComboBox id="search-country" titleText="目标国家 / 地区" placeholder="搜索国家名称或代码" items={countries} itemToString={item => item ? countryLabel(item) + ' (' + item.cca2 + ')' : ''} selectedItem={country} onChange={({ selectedItem }) => setCountry(selectedItem ?? null)} />
        </div>
        {country && <p className="tp-search-discovery__market-meta"><img src={flag(country.cca2)} alt="" width="24" height="16" />　目标市场：{country.name.common}（{country.cca2}） · 搜索语言：{searchLanguage}</p>}
        <div className="tp-search-discovery__subsection">
          <h3>目标企业类型</h3>
          <div className="tp-search-discovery__options-grid">
            {roles.map(role => <Checkbox key={role.id} id={'role-' + role.id} labelText={role.label} checked={rolesSelected.includes(role.id)} onChange={(_, data) => toggleRole(role.id, data.checked)} />)}
          </div>
        </div>
      </Tile>

      <Tile className="tp-search-discovery__tile">
        <h2>2. 高级搜索语法</h2>
        <p>系统按产品和企业类型生成查询；也可以自行编辑完整搜索表达式。支持能力以当前搜索供应商实际执行结果为准。</p>
        <TextArea id="search-advanced-query" labelText="高级搜索表达式（留空则自动生成）" rows={4} value={advancedQuery} onChange={event => setAdvancedQuery(event.target.value)} placeholder={generatedQuery || '"wireless earbuds" manufacturer OR supplier -directory'} />
        <p className="tp-search-discovery__query-preview"><strong>当前预览：</strong>{activeQuery || '输入产品名称后自动生成'}</p>
      </Tile>

      <Tile className="tp-search-discovery__tile">
        <h2>3. 搜索服务与排除规则</h2>
        <div className="tp-search-discovery__options-grid tp-search-discovery__engine-grid">
          <Checkbox id="engine-serper" labelText="Serper" checked={engines.includes('serper')} onChange={(_, data) => toggleEngine('serper', data.checked)} />
          <Checkbox id="engine-serpapi" labelText="SerpApi" checked={engines.includes('serpapi')} onChange={(_, data) => toggleEngine('serpapi', data.checked)} />
        </div>
        <NumberInput id="search-limit" label="每个搜索引擎最大候选数" min={10} max={500} step={10} value={limit} onChange={(_, data) => setLimit(Number(data.value) || 100)} />
        <h3 className="tp-search-discovery__section-label">网站类别排除</h3>
        <div className="tp-search-discovery__options-grid">
          {categories.map(item => <Checkbox key={item.key} id={'exclude-' + item.key} labelText={item.label || categoryLabels[item.key] || item.key} checked={item.enabled} onChange={(_, data) => toggleCategory(item.key, data.checked)} />)}
        </div>
        <TextArea id="search-exclude-domains" labelText="任务级排除域名（支持批量粘贴 100+，每行一个，也可用逗号分隔）" rows={5} value={excludeDomains} onChange={event => setExcludeDomains(event.target.value)} placeholder={'amazon.com\nalibaba.com\nfacebook.com\nyellowpages.com'} />
      </Tile>

      <Tile id="search-submit" className="tp-search-discovery__tile tp-search-discovery__tile--last">
        <h2>4. 创建搜索任务</h2>
        <p>目标国家通过搜索引擎国家参数和语言参数定位；实际企业所在地需要后续根据网站地址、联系方式和公开资料核验。</p>
        <Button renderIcon={semanticIcons.search} disabled={submitting || loading} onClick={() => void submit()}>{submitting ? '正在创建…' : '开始搜索并发现企业'}</Button>
        <Link href="/prospect-history">查看全部发现任务</Link>
      </Tile>

      <section id="candidate-pool" className="tp-search-discovery__section">
        <div className="tp-search-discovery__section-heading">
          <div><h2>候选网站池</h2><p>这里只展示搜索 API 返回并已保存的候选，不访问网站、不运行 Browser Run。</p></div>
          <Tag type="blue">{verifiedRecords.length} 个候选 · 已选 {selectedRecordIds.length}</Tag>
        </div>

        <div className="tp-search-discovery__candidate-toolbar">
          <TextInput id="candidate-filter" labelText="筛选候选网站" placeholder="输入公司名称或域名" value={candidateFilter} onChange={event => setCandidateFilter(event.currentTarget.value)} />
          <div className="tp-search-discovery__selection-actions">
            <Button kind="ghost" size="sm" onClick={() => setSelectedRecordIds(current => [...new Set([...current, ...visibleCandidates.map(record => record.id)])])} disabled={!visibleCandidates.length}>全选筛选结果</Button>
            <Button kind="ghost" size="sm" onClick={() => setSelectedRecordIds(current => [...new Set([...current.filter(id => !visibleCandidates.some(record => record.id === id)), ...visibleCandidates.filter(record => !current.includes(record.id)).map(record => record.id)])])} disabled={!visibleCandidates.length}>反选筛选结果</Button>
            <Button kind="ghost" size="sm" onClick={() => setSelectedRecordIds([])} disabled={!selectedRecordIds.length}>清空选择</Button>
            <Button kind="danger--tertiary" size="sm" onClick={() => void removeSelectedCandidates()} disabled={!selectedRecordIds.length}>移除所选</Button>
          </div>
        </div>
        {visibleCandidates.length === 0 ? <Tile>暂无符合条件的候选网站。完成第一步搜索后，候选网站会保存在这里。</Tile> : (
          <div className="tp-search-discovery__run-list">
            {visibleCandidates.map(record => {
              const analysis = websiteAnalysis(record);
              const analyzed = analysis?.status === 'completed';
              const failed = analysis?.status === 'failed';
              return <Tile key={record.id}>
                <div className="tp-search-discovery__candidate-row">
                  <Checkbox id={'candidate-' + record.id} labelText="" checked={selectedRecordIds.includes(record.id)} disabled={!record.website} onChange={(_, data) => setSelectedRecordIds(current => data.checked ? [...new Set([...current, record.id])] : current.filter(id => id !== record.id))} />
                  <div className="tp-search-discovery__candidate-copy">
                    <strong>{record.name || '未命名候选网站'}</strong>
                    <p>{record.website || '搜索结果尚未提供官网地址'} · {record.country_code || '国家待核实'}</p>
                    {record.website && <Link href={record.website}>打开候选网站</Link>}
                  </div>
                  <Tag type={analyzed ? 'green' : failed ? 'red' : 'cool-gray'}>{analyzed ? '已分析' : failed ? '分析失败' : '待分析'}</Tag>
                </div>
              </Tile>;
            })}
          </div>
        )}
      </section>

      <section id="analysis-workbench" className="tp-search-discovery__phase-panel">
        <p className="tp-search-discovery__eyebrow">WORKSTATION 03 / AI INTELLIGENCE</p>
        <h2>AI 深度分析工作站</h2>
        <p>只分析第二步勾选的网站。每批默认 10 个，最多 20 个；Browser Run 和 AI 只在此任务中调用。已完成的记录不会重复分析，除非明确选择重新分析。</p>
        <div className="tp-search-discovery__analysis-launch">
          <NumberInput id="analysis-batch-size" label="每批网站数量" min={1} max={20} step={1} value={batchSize} onChange={(_, data) => setBatchSize(Math.max(1, Math.min(20, Number(data.value) || 10)))} />
          <div className="tp-search-discovery__analysis-launch-actions">
            <Button kind="primary" onClick={() => void startAnalysis(false)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '分析所选网站'}</Button>
            <Button kind="secondary" onClick={() => void startAnalysis(true)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '重新分析所选'}</Button>
          </div>
        </div>
        {latestAnalysisRun ? (
          <Tile>
            <div className="tp-search-discovery__run-row">
              <div><strong>{latestAnalysisRun.task_code || 'AI 网站分析任务'}</strong><p>{latestAnalysisRun.message || '—'}</p></div>
              <Tag type={latestAnalysisRun.status === 'completed' ? 'green' : latestAnalysisRun.status === 'failed' ? 'red' : latestAnalysisRun.status === 'paused' ? 'warm-gray' : 'blue'}>{statusText[latestAnalysisRun.status || ''] || latestAnalysisRun.status}</Tag>
            </div>
            <ProgressBar value={latestAnalysisRun.progress ?? 0} max={100} label="分析进度" helperText={(latestAnalysisRun.progress ?? 0) + "% · 已处理 " + (latestAnalysisRun.discovered_count ?? 0) + " 个候选"} />
            <div className="tp-search-discovery__analysis-controls">
              {latestAnalysisRun.status === 'running' || latestAnalysisRun.status === 'queued' ? <Button kind="ghost" size="sm" onClick={() => void controlAnalysis(latestAnalysisRun.id, 'pause')}>暂停</Button> : null}
              {latestAnalysisRun.status === 'paused' ? <Button kind="ghost" size="sm" onClick={() => void controlAnalysis(latestAnalysisRun.id, 'resume')}>继续</Button> : null}
              {['running','queued','paused'].includes(latestAnalysisRun.status || '') ? <Button kind="danger--tertiary" size="sm" onClick={() => void controlAnalysis(latestAnalysisRun.id, 'cancel')}>取消</Button> : null}
              {['failed','partial'].includes(latestAnalysisRun.status || '') ? <Button kind="secondary" size="sm" onClick={() => void retryAnalysis(latestAnalysisRun.id)}>重试失败网站</Button> : null}
            </div>
          </Tile>
        ) : <Tile>尚未启动网站分析任务。先在第二步选择候选网站，再启动分析。</Tile>}
      </section>

      <section id="analysis-results" className="tp-search-discovery__phase-panel">
        <p className="tp-search-discovery__eyebrow">WORKSTATION 04 / COMPANY INTELLIGENCE</p>
        <h2>企业情报结果</h2>
        <p>结果保留原始网页 URL、字段证据和 AI 判断依据；所有记录均需人工复核，不会自动创建正式客户。</p>
        <div><Button kind="secondary" size="sm" onClick={exportAnalysisResults} disabled={!analysisResults.length}>导出企业情报 CSV</Button></div>
        {analysisResults.length === 0 ? <Tile>暂无已完成的企业情报分析结果。</Tile> : (
          <div className="tp-search-discovery__run-list">
            {analysisResults.map(record => {
              const result = websiteAnalysis(record) ?? {};
              const evidence = Array.isArray(result.evidence) ? result.evidence as Array<Record<string, unknown>> : [];
              const products = Array.isArray(result.products) ? result.products as string[] : [];
              return <Tile key={record.id}>
                <div className="tp-search-discovery__result-header">
                  <div><strong>{String(result.company_name || record.name || '未命名企业')}</strong><p>{String(result.official_website || record.website || '')}</p></div>
                  <Tag type="green">官网可信度 {Number(result.website_confidence ?? 0)} / 100</Tag>
                </div>
                <div className="tp-search-discovery__result-grid">
                  <div><span>国家 / 地区</span><strong>{String(result.country || record.country_code || '待核实')}</strong></div>
                  <div><span>地址</span><strong>{String(result.address || '—')}</strong></div>
                  <div><span>电话</span><strong>{String(result.phone || '—')}</strong></div>
                  <div><span>邮箱</span><strong>{String(result.email || '—')}</strong></div>
                  <div><span>联系人</span><strong>{String(result.contact_person || '—')}</strong></div>
                  <div><span>企业类型</span><strong>{String(result.business_type || '—')}</strong></div>
                </div>
                <p>{String(result.company_description || '暂无企业简介')}</p>
                {products.length > 0 && <p>产品：{products.join('、')}</p>}
                <p className="tp-search-discovery__evidence-note">判断依据：{String(result.official_website_reason || '—')} · 来源：{String(result.source_url || record.website || '')}</p>
                {evidence.length > 0 && <details><summary>查看 {evidence.length} 条网页证据</summary>{evidence.map((item, index) => <blockquote key={index}><strong>{String(item.field)}</strong>：{String(item.value)}<p>{String(item.excerpt)}</p></blockquote>)}</details>}
              </Tile>;
            })}
          </div>
        )}
      </section>

      <section>
        <h2>最近搜索任务</h2>
        {loading ? <p>正在读取任务…</p> : runs.length === 0 ? <Tile>暂无搜索引擎发现任务。</Tile> : (
          <div className="tp-search-discovery__run-list">
            {runs.map(run => <Tile key={run.id}>
              <div className="tp-search-discovery__run-row">
                <div><strong>{run.task_code || run.query || '搜索任务'}</strong><p>{run.query} · {(run.countries ?? []).join(', ')} · {run.message || '—'}</p></div>
                <div><Tag type={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'blue'}>{statusText[run.status || ''] || run.status || '未知'}</Tag>　{run.discovered_count ?? 0} 条发现</div>
              </div>
              <div className="tp-search-discovery__run-link"><Link href={'/prospect-history/' + run.id}>任务详情与日志</Link></div>
            </Tile>)}
          </div>
        )}
      </section>
    </main>
  );
}
