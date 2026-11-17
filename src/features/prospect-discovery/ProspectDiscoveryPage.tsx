import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionItem, Button, Checkbox, ComboBox, InlineLoading, InlineNotification,
  RadioButton, RadioButtonGroup, Select, SelectItem, SelectableTile, Tag, TextArea, TextInput,
  Toggle, Tabs, TabList, Tab, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/prospect-discovery.scss';

const steps = [
  '意图与画像锚定（Target Profiling）',
  '数据源与平台选择（Platform & Source Selection）',
  '拦截护盾配置（Filtering & Guardrails Config）',
  '执行全网搜索（Multi-Channel Execution）',
  'AI智能清洗与打分（AI Filtering & Scoring）',
  '决策人穿透与入库（Decision-Maker Enrichment & CRM Sync）',
] as const;

const continents = [
  { value: 'Africa', label: '非洲（Africa）' },
  { value: 'Americas', label: '美洲（Americas）' },
  { value: 'Asia', label: '亚洲（Asia）' },
  { value: 'Europe', label: '欧洲（Europe）' },
  { value: 'Oceania', label: '大洋洲（Oceania）' },
] as const;

const buyerOptions = [
  { id: 'importer', title: 'Importer', detail: '大型进口商', description: '跨境采购、进口与供应链采购主体' },
  { id: 'distributor', title: 'Distributor / Wholesaler', detail: '区域分销商 / 批发商', description: '区域渠道、批发网络与经销体系' },
  { id: 'brand', title: 'Brand Owner / DTC', detail: '品牌方 / 独立站', description: '自有品牌、贴牌采购与 DTC 商家' },
  { id: 'contractor', title: 'Contractor / Retailer', detail: '工程商 / 零售连锁', description: '项目采购、线下零售与连锁门店' },
] as const;

const materials = ['Forged', 'CNC Machined', 'Silicone', 'Aluminum', 'Stainless Steel', 'ABS', 'Die Casting', 'Injection Molded'];
const certifications = ['CE', 'RoHS', 'FCC', 'UKCA', 'REACH', 'IATF 16949'];
const excludedTerms = ['jobs', 'careers', '招聘', 'DIY', 'used'];

type Country = {
  name: { common: string };
  cca2: string;
  region: string;
  tld?: string[];
  languages?: Record<string, string>;
};
type Profile = {
  name: string;
  coreNoun: string;
  buyers: string[];
  continent: string;
  country: string;
  city: string;
  materials: string[];
  specifications: string;
  hsCode: string;
  certifications: string[];
  employeeScale: string;
  activity: string;
  competitors: string[];
};
type Strategy = { google: string[]; maps: string[]; social: string[] };

const emptyProfile: Profile = {
  name: '', coreNoun: '', buyers: [], continent: '', country: '', city: '', materials: [],
  specifications: '', hsCode: '', certifications: [], employeeScale: '', activity: '',
  competitors: ['', '', ''],
};

function compileStrategy(profile: Profile, tld: string): Strategy {
  const noun = profile.coreNoun.trim();
  if (!noun) return { google: [], maps: [], social: [] };
  const buyerTerms = profile.buyers.map(id => buyerOptions.find(item => item.id === id)?.title ?? '').filter(Boolean);
  const buyerClause = buyerTerms.length ? '(' + buyerTerms.map(item => '"' + item + '"').join(' OR ') + ')' : '';
  const market = profile.country ? ' "' + profile.country + '"' : '';
  const city = profile.city.trim() ? ' "' + profile.city.trim() + '"' : '';
  const site = tld ? ' site:' + tld : '';
  const exclusions = excludedTerms.map(term => '-' + term).join(' ');
  const base = '"' + noun + '"';
  const specs = [profile.specifications, ...profile.materials].filter(Boolean).join(' ');
  const specClause = specs ? ' (' + specs + ')' : '';
  const hs = profile.hsCode.trim() ? ' "' + profile.hsCode.trim() + '"' : '';
  const google = [
    [base, buyerClause, market, site, exclusions].filter(Boolean).join(' '),
    [base, specClause, hs, buyerClause, market, exclusions].filter(Boolean).join(' '),
    [base, '(supplier OR sourcing OR procurement OR wholesale)', market, site, exclusions].filter(Boolean).join(' '),
  ];
  const area = profile.city.trim() || profile.country || 'target market';
  const mapTerms = [
    noun, noun + ' importer', noun + ' distributor', noun + ' wholesaler',
    noun + ' supplier', noun + ' retailer', noun + ' trading company', noun + ' procurement',
  ];
  const maps = mapTerms.map(term => term + ' near ' + area);
  const social = [
    'site:linkedin.com/company ' + base + (buyerClause ? ' ' + buyerClause : '') + market,
    'site:myshopify.com ' + base + ' ' + '(brand OR store)' + market,
  ];
  return { google, maps, social };
}

export function ProspectDiscoveryPage() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryLoading, setCountryLoading] = useState(true);
  const [countryError, setCountryError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateList, setTemplateList] = useState<Array<{ name: string; profile: Profile }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [synonymInput, setSynonymInput] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [googleQueries, setGoogleQueries] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('https://restcountries.com/v3.1/all?fields=name,cca2,region,tld,languages')
      .then(response => { if (!response.ok) throw new Error('国家主数据暂时不可用'); return response.json() as Promise<Country[]>; })
      .then(data => { if (active) setCountries(data.filter(item => item.cca2 && item.name?.common).sort((a, b) => a.name.common.localeCompare(b.name.common))); })
      .catch(cause => { if (active) setCountryError(cause instanceof Error ? cause.message : '国家主数据加载失败'); })
      .finally(() => { if (active) setCountryLoading(false); });
    try {
      const saved = localStorage.getItem('tradepilot.prospect-profiling.templates.v1');
      if (saved) setTemplateList(JSON.parse(saved) as Array<{ name: string; profile: Profile }>);
    } catch { /* Ignore malformed local template cache. */ }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = profile.coreNoun.trim();
    if (query.length < 2) { setSuggestions([]); setSuggestionError(''); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      setSuggestionError('');
      try {
        const country = countries.find(item => item.cca2 === profile.country);
        const language = country?.languages ? Object.keys(country.languages)[0] : 'en';
        const db = await getSupabaseClient();
        const { data } = await db.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('登录状态已失效，请重新登录。');
        const params = new URLSearchParams({ q: query, gl: (profile.country || 'US').toLowerCase(), hl: language || 'en' });
        const response = await fetch('/api/v1/prospect-profiling/autocomplete?' + params.toString(), {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        });
        const payload = await response.json() as { data?: { suggestions?: string[] }; suggestions?: string[]; message?: string };
        if (!response.ok) throw new Error(payload.message || 'Google 搜索联想暂时不可用');
        if (active) setSuggestions(payload.data?.suggestions ?? payload.suggestions ?? []);
      } catch (cause) {
        if (active) setSuggestionError(cause instanceof Error ? cause.message : '搜索联想失败');
      } finally {
        if (active) setSuggestionLoading(false);
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [profile.coreNoun, profile.country, countries]);

  const filteredCountries = useMemo(
    () => countries.filter(item => !profile.continent || item.region === profile.continent),
    [countries, profile.continent],
  );
  const selectedCountry = countries.find(item => item.cca2 === profile.country);
  const countryTld = selectedCountry?.tld?.[0] ?? '';
  const countryLanguage = selectedCountry?.languages ? Object.values(selectedCountry.languages).join(', ') : '';

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile(current => ({ ...current, [key]: value }));
  const toggleArray = (key: 'buyers' | 'materials' | 'certifications', value: string) => {
    setProfile(current => {
      const values = current[key];
      return { ...current, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] };
    });
  };
  const updateCompetitor = (index: number, value: string) => setProfile(current => ({
    ...current, competitors: current.competitors.map((item, i) => i === index ? value : item),
  }));

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) { setError('请先填写画像模板名称。'); return; }
    const next = [...templateList.filter(item => item.name !== name), { name, profile: structuredClone(profile) }];
    try {
      localStorage.setItem('tradepilot.prospect-profiling.templates.v1', JSON.stringify(next));
      setTemplateList(next); setSelectedTemplate(name); setNotice('画像模板已保存在当前浏览器。'); setError('');
    } catch { setError('模板保存失败，请检查浏览器存储空间。'); }
  };
  const loadTemplate = () => {
    const item = templateList.find(entry => entry.name === selectedTemplate);
    if (item) { setProfile(structuredClone(item.profile)); setNotice('已加载画像模板：' + item.name); setError(''); }
  };
  const generateStrategy = () => {
    if (!profile.coreNoun.trim()) { setError('请先填写核心产品名词，再生成获客策略。'); return; }
    const result = compileStrategy(profile, countryTld);
    setGoogleQueries(result.google);
    setPreviewOpen(true);
    setNotice('已根据当前画像编译搜索矩阵。AI 词库裂变尚未执行。');
    setError('');
  };
  const strategy = compileStrategy(profile, countryTld);

  const updateGoogleQuery = (index: number, value: string) => setGoogleQueries(current => current.map((item, i) => i === index ? value : item));
  const addSynonym = () => {
    const value = synonymInput.trim();
    if (value && !synonyms.includes(value)) setSynonyms(current => [...current, value]);
    setSynonymInput('');
  };

  return (
    <main className="tp-prospect-discovery">
      <header className="tp-prospect-discovery__page-header">
        <div>
          <p className="tp-prospect-discovery__eyebrow">PROSPECT DISCOVERY / WORKFLOW</p>
          <h1>全球外贸智能潜客发现</h1>
          <p>将商业意图转化为可执行的全球获客搜索策略。</p>
        </div>
        <div className="tp-prospect-discovery__header-meta">
          <span>STEP 01 / 06</span>
          <strong>Target Profiling</strong>
        </div>
      </header>

      <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: nextIndex }) => setSelectedIndex(nextIndex)}>
        <TabList aria-label="潜客发现六步流程" contained>
          {steps.map(step => <Tab key={step}>{step}</Tab>)}
        </TabList>
      </Tabs>

      {selectedIndex === 0 ? (
        <section className="tp-prospect-discovery__step">
          {(notice || error) && (
            <div className="tp-prospect-discovery__notifications">
              {notice && <InlineNotification kind="success" lowContrast title="操作完成" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
              {error && <InlineNotification kind="error" lowContrast title="需要处理" subtitle={error} onCloseButtonClick={() => setError('')} />}
            </div>
          )}

          <div className="tp-prospect-discovery__template-bar">
            <div className="tp-prospect-discovery__template-title">
              <CarbonIcons.Bookmark size={20} />
              <div><strong>画像模板</strong><span>保存常用获客画像，快速复用</span></div>
            </div>
            <div className="tp-prospect-discovery__template-controls">
              <TextInput id="tp-template-name" labelText="模板名称" hideLabel value={templateName} placeholder="输入模板名称" onChange={event => setTemplateName(event.currentTarget.value)} />
              <Button kind="secondary" size="md" renderIcon={CarbonIcons.Save} onClick={saveTemplate}>保存模板</Button>
              <Select id="tp-template-select" labelText="选择模板" hideLabel value={selectedTemplate} onChange={event => setSelectedTemplate(event.currentTarget.value)}>
                <SelectItem value="" text="选择已保存模板" />
                {templateList.map(item => <SelectItem key={item.name} value={item.name} text={item.name} />)}
              </Select>
              <Button kind="ghost" size="md" disabled={!selectedTemplate} onClick={loadTemplate}>加载</Button>
            </div>
          </div>

          <section className="tp-prospect-discovery__section">
            <div className="tp-prospect-discovery__section-heading">
              <div><span className="tp-prospect-discovery__section-index">01</span><div><h2>基础定位</h2><p>定义核心产品、目标买家与目标市场</p></div></div>
              <Tag type="red">核心必填</Tag>
            </div>
            <div className="tp-prospect-discovery__field">
              <ComboBox
                id="tp-core-noun"
                titleText="核心产品名词（Core Noun）"
                placeholder="输入英文产品名词，例如 Industrial air compressor"
                items={suggestions}
                selectedItem={profile.coreNoun}
                itemToString={item => typeof item === 'string' ? item : ''}
                onInputChange={value => update('coreNoun', value)}
                onChange={({ selectedItem }) => { if (typeof selectedItem === 'string') update('coreNoun', selectedItem); }}
                helperText="输入至少 2 个字符，系统将按目标国家与语言请求 Google 搜索联想。"
              />
              {(suggestionLoading || suggestionError || suggestions.length > 0) && (
                <div className="tp-prospect-discovery__suggestions">
                  {suggestionLoading && <InlineLoading description="正在获取 Google 搜索建议…" />}
                  {suggestionError && <span className="tp-prospect-discovery__field-error">{suggestionError}</span>}
                  {suggestions.map(item => <button type="button" key={item} onClick={() => update('coreNoun', item)}>{item}<CarbonIcons.ArrowUpRight size={14} /></button>)}
                </div>
              )}
            </div>

            <div className="tp-prospect-discovery__field">
              <span className="tp-prospect-discovery__field-label">供应链身位锚定（Buyer Persona）</span>
              <div className="tp-prospect-discovery__buyer-grid">
                {buyerOptions.map(item => (
                  <SelectableTile key={item.id} id={'tp-buyer-' + item.id} value={item.id} selected={profile.buyers.includes(item.id)} onChange={() => toggleArray('buyers', item.id)}>
                    <div className="tp-prospect-discovery__buyer-tile">
                      <strong>{item.title}</strong><b>{item.detail}</b><span>{item.description}</span>
                    </div>
                  </SelectableTile>
                ))}
              </div>
            </div>

            <div className="tp-prospect-discovery__field">
              <span className="tp-prospect-discovery__field-label">目标市场与语言锚定（Geo & Language）</span>
              <div className="tp-prospect-discovery__geo-grid">
                <Select id="tp-continent" labelText="大洲 / 地区" value={profile.continent} onChange={event => setProfile(current => ({ ...current, continent: event.currentTarget.value, country: '', city: '' }))}>
                  <SelectItem value="" text="选择大洲" />
                  {continents.map(item => <SelectItem key={item.value} value={item.value} text={item.label} />)}
                </Select>
                <Select id="tp-country" labelText="目标国家" value={profile.country} disabled={!profile.continent || countryLoading} onChange={event => setProfile(current => ({ ...current, country: event.currentTarget.value, city: '' }))}>
                  <SelectItem value="" text={countryLoading ? '正在加载国家…' : '选择国家'} />
                  {filteredCountries.map(item => <SelectItem key={item.cca2} value={item.cca2} text={item.name.common} />)}
                </Select>
                <TextInput id="tp-city" labelText="目标城市" placeholder="输入城市名称（可选）" value={profile.city} disabled={!profile.country} onChange={event => update('city', event.currentTarget.value)} />
              </div>
              {countryError && <span className="tp-prospect-discovery__field-error">{countryError}</span>}
              {selectedCountry && (
                <div className="tp-prospect-discovery__geo-meta">
                  <span>国家代码：{selectedCountry.cca2}</span><span>顶级域名：{countryTld || '暂无'}</span><span>商业语言：{countryLanguage || '待确认'}</span>
                </div>
              )}
            </div>
          </section>

          <section className="tp-prospect-discovery__section tp-prospect-discovery__advanced">
            <div className="tp-prospect-discovery__section-heading">
              <div><span className="tp-prospect-discovery__section-index">02</span><div><h2>进阶筛选</h2><p>收纳产品规格、企业体量与竞品约束</p></div></div>
            </div>
            <Accordion>
              <AccordionItem title="A. 材质工艺与规格锚定（Specs & Compliance）">
                <div className="tp-prospect-discovery__field">
                  <span className="tp-prospect-discovery__field-label">材质与工艺属性</span>
                  <div className="tp-prospect-discovery__tag-list">
                    {materials.map(item => <Checkbox key={item} id={'tp-material-' + item.replace(/[^a-z0-9]/gi, '-')} labelText={item} checked={profile.materials.includes(item)} onChange={() => toggleArray('materials', item)} />)}
                  </div>
                </div>
                <div className="tp-prospect-discovery__two-col">
                  <TextInput id="tp-specifications" labelText="核心规格 / 尺寸 / 功率" placeholder="例如 18-inch、100W、IP67" value={profile.specifications} onChange={event => update('specifications', event.currentTarget.value)} />
                  <TextInput id="tp-hs-code" labelText="海关编码（HS Code）" placeholder="输入 HS Code" value={profile.hsCode} onChange={event => update('hsCode', event.currentTarget.value)} />
                </div>
                <div className="tp-prospect-discovery__field">
                  <span className="tp-prospect-discovery__field-label">目标市场强制认证</span>
                  <div className="tp-prospect-discovery__tag-list">
                    {certifications.map(item => <Checkbox key={item} id={'tp-cert-' + item.replace(/[^a-z0-9]/gi, '-')} labelText={item} checked={profile.certifications.includes(item)} onChange={() => toggleArray('certifications', item)} />)}
                  </div>
                </div>
              </AccordionItem>
              <AccordionItem title="B. 买家体量与活跃度锚定（Scale & Activity）">
                <div className="tp-prospect-discovery__two-col">
                  <Select id="tp-employee-scale" labelText="员工规模区间" value={profile.employeeScale} onChange={event => update('employeeScale', event.currentTarget.value)}>
                    <SelectItem value="" text="不限" /><SelectItem value="1-10" text="1–10 人" /><SelectItem value="11-50" text="11–50 人" /><SelectItem value="51-200" text="51–200 人" /><SelectItem value="201-500" text="201–500 人" /><SelectItem value="500+" text="500 人以上" />
                  </Select>
                  <div className="tp-prospect-discovery__field">
                    <span className="tp-prospect-discovery__field-label">海关交易活跃窗口</span>
                    <RadioButtonGroup legendText="采购活跃度" name="tp-activity" valueSelected={profile.activity} onChange={value => update('activity', String(value))}>
                      <RadioButton id="tp-activity-6m" value="6m" labelText="近 6 个月活跃" />
                      <RadioButton id="tp-activity-1y" value="1y" labelText="近 1 年稳定采购" />
                    </RadioButtonGroup>
                  </div>
                </div>
              </AccordionItem>
              <AccordionItem title="C. 竞品逆向锚定（Competitor Benchmark）">
                <p className="tp-prospect-discovery__helper">录入 1–3 个竞争对手英文名或独立站域名，用于后续逆向挖掘分销网络。</p>
                <div className="tp-prospect-discovery__competitors">
                  {profile.competitors.map((value, index) => <TextInput key={index} id={'tp-competitor-' + index} labelText={'竞争对手 ' + (index + 1)} placeholder="例如 competitor.com 或 Brand Name" value={value} onChange={event => updateCompetitor(index, event.currentTarget.value)} />)}
                </div>
              </AccordionItem>
            </Accordion>
          </section>

          <div className="tp-prospect-discovery__actions">
            <Button kind="primary" renderIcon={CarbonIcons.MagicWand} onClick={generateStrategy}>生成获客策略</Button>
          </div>

          {previewOpen && (
            <section className="tp-prospect-discovery__preview">
              <div className="tp-prospect-discovery__section-heading">
                <div><span className="tp-prospect-discovery__section-index">03</span><div><h2>获客策略预览</h2><p>由当前画像编译的搜索指令，可检查并手动调整</p></div></div>
              </div>
              <div className="tp-prospect-discovery__preview-summary">
                <div><strong>{googleQueries.length}</strong><span>条搜索引擎指令</span></div>
                <div><strong>{strategy.maps.length}</strong><span>条地图搜索组合</span></div>
                <div><strong>{strategy.social.length}</strong><span>条社媒 / 独立站指令</span></div>
              </div>
              <div className="tp-prospect-discovery__preview-block">
                <h3>词库与本土化裂变</h3>
                <p>AI 词库裂变服务尚未接入；以下为手动补充词，当前不会伪造 AI 同义词结果。</p>
                <div className="tp-prospect-discovery__synonyms">
                  {synonyms.map(item => <Tag key={item} type="blue" filter onClose={() => setSynonyms(current => current.filter(value => value !== item))}>{item}</Tag>)}
                  <TextInput id="tp-synonym-input" labelText="补充行业词汇" hideLabel placeholder="输入同义词或本土商业词汇" value={synonymInput} onChange={event => setSynonymInput(event.currentTarget.value)} />
                  <Button kind="tertiary" size="sm" renderIcon={CarbonIcons.Add} onClick={addSynonym}>添加词汇</Button>
                </div>
              </div>
              <div className="tp-prospect-discovery__preview-block">
                <div className="tp-prospect-discovery__preview-heading"><h3>黄金搜索矩阵（Golden Dork Matrix）</h3><Toggle id="tp-advanced-mode" labelText="高级模式" labelA="关闭" labelB="开启" toggled={advancedMode} onToggle={setAdvancedMode} /></div>
                <Accordion>
                  <AccordionItem title={'Google Dorks（' + googleQueries.length + ' 条）'}>
                    <div className="tp-prospect-discovery__query-list">
                      {googleQueries.map((query, index) => advancedMode
                        ? <TextArea key={index} id={'tp-google-query-' + index} labelText={'搜索指令 ' + (index + 1)} rows={3} value={query} onChange={event => updateGoogleQuery(index, event.currentTarget.value)} />
                        : <code key={index}>{query}</code>)}
                    </div>
                  </AccordionItem>
                  <AccordionItem title={'地图扫街矩阵（' + strategy.maps.length + ' 条）'}>
                    <ul>{strategy.maps.map(item => <li key={item}><code>{item}</code></li>)}</ul>
                  </AccordionItem>
                  <AccordionItem title={'社媒与独立站专项（' + strategy.social.length + ' 条）'}>
                    <ul>{strategy.social.map(item => <li key={item}><code>{item}</code></li>)}</ul>
                  </AccordionItem>
                </Accordion>
              </div>
              <div className="tp-prospect-discovery__preview-footer">
                <span>当前为本地规则编译结果；AI 词库裂变、地图数据源和后续步骤传递将在对应服务完成后启用。</span>
                <Button kind="secondary" renderIcon={CarbonIcons.Checkmark} onClick={() => setNotice('第一步策略已在当前页面确认。')}>确认当前策略</Button>
              </div>
            </section>
          )}
        </section>
      ) : (
        <div className="tp-prospect-discovery__future-step" aria-label="后续步骤暂未开放" />
      )}
    </main>
  );
}
