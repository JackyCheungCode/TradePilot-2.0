import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, Checkbox, ComboBox, InlineNotification, Link, NumberInput, Select, SelectItem, Tag, TextArea, TextInput, Tile, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Country = { cca2: string; cca3?: string; name: { common: string } };
type ExclusionCategory = { key: string; label: string; domains: string[]; enabled: boolean };
type Run = { id: string; task_code?: string; query?: string; countries?: string[]; status?: string; progress?: number; discovered_count?: number; message?: string; created_at?: string; search_config?: Record<string, unknown> };
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
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

export function SearchEngineDiscoveryPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [product, setProduct] = useState('');
  const [rolesSelected, setRolesSelected] = useState<string[]>(['manufacturer','brand','supplier','wholesaler','importer','distributor','oem']);
  const [searchLanguage, setSearchLanguage] = useState('en');
  const [engines, setEngines] = useState<string[]>(['serper','serpapi']);
  const [limit, setLimit] = useState(100);
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [categories, setCategories] = useState<ExclusionCategory[]>([]);
  const [excludeDomains, setExcludeDomains] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
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
    ]).then(([countryData, exclusionData, runResult]) => {
      if (!active) return;
      setCountries(countryData.countries ?? []);
      setCategories(exclusionData ?? []);
      if (runResult.error) throw runResult.error;
      setRuns((runResult.data ?? []) as Run[]);
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

  const toggleRole = (id: string, checked: boolean) => setRolesSelected(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleEngine = (id: string, checked: boolean) => setEngines(current => checked ? [...current, id] : current.filter(item => item !== id));
  const toggleCategory = (key: string, checked: boolean) => setCategories(current => current.map(item => item.key === key ? { ...item, enabled: checked } : item));

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
      const { data } = await client.from('discovery_runs').select('id,task_code,query,countries,status,progress,discovered_count,message,created_at,search_config').eq('channel','search_engine').order('created_at',{ascending:false}).limit(8);
      setRuns((data ?? []) as Run[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建搜索任务失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <main>
      <PageHeader>
        <div>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem', letterSpacing: '0.08em' }}>GLOBAL PROSPECT DISCOVERY / SEARCH ENGINE</p>
          <h1>搜索引擎发现</h1>
          <p>从产品名称出发，发现目标国家的制造商、品牌商、供应商、进口商与分销商，并核验企业官网。</p>
        </div>
        <div><Tag type="blue">产品驱动发现</Tag></div>
      </PageHeader>

      {error && <InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="任务已提交" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <Tile style={{ marginBottom: '1rem' }}>
        <h2>1. 搜索目标</h2>
        <p>输入产品名称，选择希望发现客户的国家或地区。国家参数用于定位搜索市场，网站域名不会被当作企业所在地证明。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(16rem, 2fr) minmax(14rem, 1fr)', gap: '1rem', marginTop: '1rem' }}>
          <TextInput id="search-product" labelText="产品名称" placeholder="例如：Wireless Earbuds" value={product} onChange={event => setProduct(event.target.value)} />
          <ComboBox id="search-country" titleText="目标国家 / 地区" placeholder="搜索国家名称或代码" items={countries} itemToString={item => item ? countryLabel(item) + ' (' + item.cca2 + ')' : ''} selectedItem={country} onChange={({ selectedItem }) => setCountry(selectedItem ?? null)} />
        </div>
        {country && <p style={{ marginTop: '0.75rem' }}><img src={flag(country.cca2)} alt="" width="24" height="16" />　目标市场：{country.name.common}（{country.cca2}） · 搜索语言：{searchLanguage}</p>}
        <div style={{ marginTop: '1rem' }}>
          <h3>目标企业类型</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: '0.5rem' }}>
            {roles.map(role => <Checkbox key={role.id} id={'role-' + role.id} labelText={role.label} checked={rolesSelected.includes(role.id)} onChange={(_, data) => toggleRole(role.id, data.checked)} />)}
          </div>
        </div>
      </Tile>

      <Tile style={{ marginBottom: '1rem' }}>
        <h2>2. 高级搜索语法</h2>
        <p>系统按产品和企业类型生成查询；也可以自行编辑完整搜索表达式。支持能力以当前搜索供应商实际执行结果为准。</p>
        <TextArea id="search-advanced-query" labelText="高级搜索表达式（留空则自动生成）" rows={4} value={advancedQuery} onChange={event => setAdvancedQuery(event.target.value)} placeholder={generatedQuery || '"wireless earbuds" manufacturer OR supplier -directory'} />
        <p style={{ marginTop: '0.5rem', overflowWrap: 'anywhere' }}><strong>当前预览：</strong>{activeQuery || '输入产品名称后自动生成'}</p>
      </Tile>

      <Tile style={{ marginBottom: '1rem' }}>
        <h2>3. 搜索服务与排除规则</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(13rem,1fr))', gap: '0.5rem', margin: '1rem 0' }}>
          <Checkbox id="engine-serper" labelText="Serper" checked={engines.includes('serper')} onChange={(_, data) => toggleEngine('serper', data.checked)} />
          <Checkbox id="engine-serpapi" labelText="SerpApi" checked={engines.includes('serpapi')} onChange={(_, data) => toggleEngine('serpapi', data.checked)} />
        </div>
        <NumberInput id="search-limit" label="每个搜索引擎最大候选数" min={10} max={500} step={10} value={limit} onChange={(_, data) => setLimit(Number(data.value) || 100)} />
        <h3 style={{ marginTop: '1.25rem' }}>网站类别排除</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
          {categories.map(item => <Checkbox key={item.key} id={'exclude-' + item.key} labelText={item.label || categoryLabels[item.key] || item.key} checked={item.enabled} onChange={(_, data) => toggleCategory(item.key, data.checked)} />)}
        </div>
        <TextArea id="search-exclude-domains" labelText="任务级排除域名（支持批量粘贴 100+，每行一个，也可用逗号分隔）" rows={5} value={excludeDomains} onChange={event => setExcludeDomains(event.target.value)} placeholder={'amazon.com\nalibaba.com\nfacebook.com\nyellowpages.com'} />
      </Tile>

      <Tile style={{ marginBottom: '1.5rem' }}>
        <h2>4. 创建搜索任务</h2>
        <p>目标国家通过搜索引擎国家参数和语言参数定位；实际企业所在地需要后续根据网站地址、联系方式和公开资料核验。</p>
        <Button renderIcon={semanticIcons.search} disabled={submitting || loading} onClick={() => void submit()}>{submitting ? '正在创建…' : '开始搜索并发现企业'}</Button>
        <Link href="/prospect-history">查看全部发现任务</Link>
      </Tile>

      <section>
        <h2>最近搜索任务</h2>
        {loading ? <p>正在读取任务…</p> : runs.length === 0 ? <Tile>暂无搜索引擎发现任务。</Tile> : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {runs.map(run => <Tile key={run.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div><strong>{run.task_code || run.query || '搜索任务'}</strong><p>{run.query} · {(run.countries ?? []).join(', ')} · {run.message || '—'}</p></div>
                <div><Tag type={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'blue'}>{statusText[run.status || ''] || run.status || '未知'}</Tag>　{run.discovered_count ?? 0} 条发现</div>
              </div>
              <div style={{ marginTop: '0.5rem' }}><Link href={'/prospect-history/' + run.id}>任务详情与日志</Link></div>
            </Tile>)}
          </div>
        )}
      </section>
    </main>
  );
}
