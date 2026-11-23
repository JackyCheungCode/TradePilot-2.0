import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, Checkbox, ComboBox, InlineNotification, Link, NumberInput, ProgressIndicator, ProgressStep, WorldMapChart, Tag, TextArea, TextInput, Tile, Select, SelectItem, TpDataTable } from '@/design-system';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '@/lib/supabase';
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
  const [engines, setEngines] = useState<string[]>(['serper']);
  const [limit, setLimit] = useState(100);
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [categories, setCategories] = useState<ExclusionCategory[]>([]);
  const [excludeDomains, setExcludeDomains] = useState('');
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
      getSupabaseClient().then(client => client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').in('status',['new','removed']).order('updated_at',{ascending:false}).limit(1000)),
    ]).then(([countryData, exclusionData, runResult, recordResult]) => {
      if (!active) return;
      setCountries(countryData.countries ?? []);
      setCategories(exclusionData ?? []);
      if (recordResult.error) throw recordResult.error;
      setVerifiedRecords((recordResult.data ?? []) as SearchRecord[]);
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
  const refreshDiscoveryData = async () => {
    const client = await getSupabaseClient();
    const { data, error: recordError } = await client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').in('status',['new','removed']).order('updated_at',{ascending:false}).limit(1000);
    if (recordError) throw recordError;
    setVerifiedRecords((data ?? []) as SearchRecord[]);
  };

  const startAnalysis = async (forceReanalysis = false) => {
    const eligibleRecordIds = selectedRecordIds.filter(id => verifiedRecords.some(record => record.id === id && record.status === 'new' && !!record.website));
    if (!eligibleRecordIds.length) { setError('所选候选中没有可分析的官网地址，请选择带有官网 URL 的记录。'); return; }
    if (eligibleRecordIds.length > 500) { setError('单次最多分析 500 个候选网站，请分批选择。'); return; }
    setError(''); setNotice(''); setAnalyzeSubmitting(true);
    try {
      const result = await api<{ id: string; taskCode: string; selectedCount: number; batchSize: number }>('/api/v1/search-discovery-runs/analyze', {
        method: 'POST', body: JSON.stringify({ recordIds: eligibleRecordIds, batchSize, forceReanalysis, country: country?.cca2 }),
      });
      setNotice('AI 分析任务已创建：' + result.taskCode + ' · ' + result.selectedCount + ' 个网站 · 每批 ' + result.batchSize + ' 个');
      await refreshDiscoveryData();
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
      const payload = await api<{ taskCode?: string; message?: string }>('/api/v1/search-discovery-runs', {
        method: 'POST',
        body: JSON.stringify({
          country: country.cca2, query: product.trim(), advancedQuery: activeQuery,
          limitPerCountry: limit, searchEngines: engines, searchTypes: ['web'],
          searchLanguage, excludeCategories: categories.filter(item => item.enabled).map(item => item.key),
          excludeDomains: domains, businessTypes: rolesSelected,
        }),
      });
      setNotice('搜索任务已创建：' + (payload.taskCode ?? '已进入队列') + '。任务日志已开始记录；搜索结果完成后将自动进入候选网站池。');
      setActiveStep(1);
      const client = await getSupabaseClient();
      const { data: recordData, error: recordError } = await client.from('discovery_records').select('id,name,website,country_code,status,raw_data,updated_at').eq('channel','search_engine').order('updated_at',{ascending:false}).limit(1000);
      if (recordError) throw recordError;
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
      <section className="tp-search-discovery__steps-viewport" aria-label="搜索客户流程">
        <div className="tp-search-discovery__steps-track"><ProgressIndicator currentIndex={activeStep} spaceEqually><ProgressStep label="搜索条件" description="Search criteria" /><ProgressStep label="候选网站" description="Candidate websites" /><ProgressStep label="批量分析" description="Batch analysis" /><ProgressStep label="分析结果" description="Company results" /></ProgressIndicator></div>
      </section>
      <div className="tp-search-discovery__page-actions">
        <Button kind="secondary" onClick={() => navigate('/prospect-discovery/search-engine/tasks')}>历史任务</Button>
        <Button kind="primary" onClick={() => navigate('/prospect-discovery/search-engine/results')}>搜索客户</Button>
      </div>

      {error && <InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="任务已提交" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      {activeStep === 0 && <>
      <Tile id="search-target" className="tp-search-discovery__tile">
        <h2>1. 搜索目标</h2>
        <p>输入产品名称，选择希望发现客户的国家或地区。国家参数用于定位搜索市场，网站域名不会被当作企业所在地证明。</p>
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
          <p>国家 / 地区决定搜索市场；此选项限制网页结果语言，不会自动跟随国家切换。</p>
        </div>
        <div className="tp-search-discovery__map"><h3>Carbon 全球市场地图</h3><p>点击地图上的国家 / 地区即可单选；也可使用上方国家搜索框。</p><WorldMapChart data={mapCountries} selectedCode={country?.cca2} onCountrySelect={code => setCountry(countries.find(item => item.cca2 === code) ?? null)} showRanking={false} unitLabel="个目标市场" /></div>
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
        <h2>3. 搜索服务与排除规则</h2><p>内置排除库覆盖常见电商、社交媒体、企业目录、新闻、论坛、地图点评、招聘、政府教育、软件目录、托管建站等非目标来源。可按类别启用或关闭，也可添加自定义域名。</p>
        <div className="tp-search-discovery__options-grid tp-search-discovery__engine-grid">
          <Checkbox id="engine-serper" labelText="Serper" checked={engines.includes('serper')} onChange={(_, data) => toggleEngine('serper', data.checked)} />
          <Checkbox id="engine-serpapi" labelText="SerpApi" checked={engines.includes('serpapi')} onChange={(_, data) => toggleEngine('serpapi', data.checked)} />
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
        <p>下一步将创建搜索任务。系统仅调用搜索 API，不会在此阶段抓取候选网站。</p>
      </Tile>
      </>}

      {activeStep === 1 && <>
      <section id="candidate-pool" className="tp-search-discovery__section">
        <div className="tp-search-discovery__section-heading">
          <div><h2>候选网站池</h2><p>这里只展示搜索 API 返回并已保存的候选，不访问网站、不运行 Browser Run。</p></div>
          <Tag type="blue">{verifiedRecords.length} 个候选 · 已选 {selectedRecordIds.length}</Tag>
        </div>

        <div className="tp-search-discovery__candidate-toolbar"><Tag type="blue">{verifiedRecords.length} 个候选 · 已选用于分析 {selectedRecordIds.length}</Tag></div>
        <TpDataTable
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
            { key: 'select-analysis', label: '加入分析选择', onClick: records => setSelectedRecordIds(records.filter(record => record.website && record.status === 'new').map(record => record.id)) },
            { key: 'remove-candidates', label: '从候选池移除', onClick: async records => { const client = await getSupabaseClient(); const { error: updateError } = await client.from('discovery_records').update({ status: 'removed' }).eq('channel', 'search_engine').in('id', records.map(record => record.id)); if (updateError) throw updateError; setSelectedRecordIds(current => current.filter(id => !records.some(record => record.id === id))); await refreshDiscoveryData(); } },
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
        <p>只分析第二步勾选的网站。每批默认 10 个，最多 20 个；Browser Run 和 AI 只在此任务中调用。已完成的记录不会重复分析，除非明确选择重新分析。</p>
        <div className="tp-search-discovery__analysis-launch">
          <NumberInput id="analysis-batch-size" label="每批网站数量" min={1} max={20} step={1} value={batchSize} onChange={(_, data) => setBatchSize(Math.max(1, Math.min(20, Number(data.value) || 10)))} />
          <div className="tp-search-discovery__analysis-launch-actions">
            <Button kind="primary" onClick={() => void startAnalysis(false)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '分析所选网站'}</Button>
            <Button kind="secondary" onClick={() => void startAnalysis(true)} disabled={!selectedRecordIds.length || analyzeSubmitting}>{analyzeSubmitting ? '正在启动…' : '重新分析所选'}</Button>
          </div>
        </div>
        <div className="tp-search-discovery__history-hint">
          <p>分析任务创建后，进度、暂停 / 继续、取消、重试及执行日志统一在「历史任务」页面管理，不在流程页显示实时任务面板。</p>
          <Button kind="secondary" onClick={() => navigate('/prospect-discovery/search-engine/tasks')}>打开历史任务</Button>
        </div>
      </section>


      </>}
      {activeStep === 3 && <>
        <section className="tp-search-discovery__result-shortcut">
          <h2>搜索客户结果</h2>
          <p>全部候选企业和完成分析的客户集中在搜索客户页面，支持按搜索任务、搜索词分组，以 Carbon 数据表格查看和导出。</p>
          <Button kind="primary" onClick={() => navigate('/prospect-discovery/search-engine/results')}>打开搜索客户</Button>
        </section>
      </>}

      <nav className="tp-search-discovery__wizard-nav" aria-label="流程导航">
        <Button kind="secondary" disabled={activeStep === 0} onClick={() => setActiveStep(step => Math.max(0, step - 1))}>上一步</Button>
        <span>步骤 {activeStep + 1} / 4</span>
        <Button kind="primary" disabled={activeStep === 3 || (activeStep === 0 && !product.trim())} loading={submitting} onClick={() => activeStep === 0 ? void submit() : setActiveStep(step => Math.min(3, step + 1))}>
          {activeStep === 0 ? (submitting ? '创建中…' : '创建搜索任务并下一步') : '下一步'}
        </Button>
      </nav>
    </main>
  );
}
