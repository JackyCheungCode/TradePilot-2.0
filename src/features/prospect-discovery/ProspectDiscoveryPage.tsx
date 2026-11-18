// Release trigger only; no runtime behavior. Approved platform catalog release 2026-11-17. Final build gate after catalog cleanup. Includes initial all-platform visibility fix.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionItem, Button, Checkbox, ComboBox, Dropdown, MultiSelect, InlineLoading, InlineNotification,
  RadioButton, RadioButtonGroup, Select, SelectItem, Tag, TextArea, TextInput,
  Toggle, Tabs, TabList, Tab, Grid, Column, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { PlatformSelectionStep } from './PlatformSelectionStep';
import { ActorSchemaFields } from './ActorSchemaFields';
import { GuardrailsStep } from './GuardrailsStep';
import { ExecutionStep } from './ExecutionStep';
import { ScoringStep } from './ScoringStep';
import { DecisionMakerStep } from './DecisionMakerStep';
import '@/design-system/patterns/prospect-discovery.scss';

const createPlanTaskCode = () => 'TPD-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.random().toString(36).slice(2,8).toUpperCase();

const steps = [
  '数据源与平台选择（Platform & Source Selection）',
  'Actor 动态参数配置（Actor Input Schema）',
  '拦截护盾配置（Filtering & Guardrails Config）',
  '执行全网搜索（Multi-Channel Execution）',
  'AI智能清洗与打分（AI Filtering & Scoring）',
  '决策人穿透与入库（Decision-Maker Enrichment & CRM Sync）',
] as const;

const continents: Array<{ value: string; label: string; path: string }> = [
  { value: 'Africa', label: '非洲（Africa）', path: 'M43 5 58 9 68 20 65 34 73 45 64 59 59 78 48 94 38 83 34 67 24 57 27 43 19 31 25 16 35 10Z' },
  { value: 'Americas', label: '美洲（Americas）', path: 'M23 5 39 9 48 20 43 31 51 42 44 52 42 66 34 80 28 96 20 84 23 69 14 57 18 44 10 31 15 17Z M66 56 76 59 82 70 77 83 70 78 67 67Z' },
  { value: 'Asia', label: '亚洲（Asia）', path: 'M8 22 19 11 34 8 45 13 58 8 74 13 91 24 87 37 76 42 70 54 57 52 48 62 35 56 26 62 16 50 10 38Z' },
  { value: 'Europe', label: '欧洲（Europe）', path: 'M13 25 22 14 34 11 43 17 53 13 63 18 74 16 85 26 78 36 67 35 60 44 49 40 42 48 31 42 22 49 14 40Z' },
  { value: 'Oceania', label: '大洋洲（Oceania）', path: 'M12 29 24 20 38 22 48 32 42 44 28 48 18 41Z M61 60 73 54 88 61 86 74 75 81 63 73Z M47 80 51 77 54 82 50 86Z' },
];

const buyerOptions = [
  { id: 'importer', title: 'Importer', detail: '大型进口商', description: '跨境采购、进口与供应链采购主体' },
  { id: 'distributor', title: 'Distributor / Wholesaler', detail: '区域分销商 / 批发商', description: '区域渠道、批发网络与经销体系' },
  { id: 'brand', title: 'Brand Owner / DTC', detail: '品牌方 / 独立站', description: '自有品牌、贴牌采购与 DTC 商家' },
  { id: 'contractor', title: 'Contractor / Retailer', detail: '工程商 / 零售连锁', description: '项目采购、线下零售与连锁门店' },
] as const;

const materials = ['Forged', 'CNC Machined', 'Silicone', 'Aluminum', 'Stainless Steel', 'ABS', 'Die Casting', 'Injection Molded'];
const certifications = ['CE', 'RoHS', 'FCC', 'UKCA', 'REACH', 'IATF 16949'];
const excludedTerms = ['jobs', 'careers', '招聘', 'DIY', 'used'];
const EMPTY_DISCOVERY_SOURCES: Array<{ id: string; name: string; category?: string }> = [];

type Country = {
  name: { common: string };
  cca2: string;
  region: string;
  tld?: string[];
  languages?: Record<string, string>;
};
const fallbackContinentCodes: Record<string, string[]> = {
  Africa: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TF TG TN TZ UG YT ZA ZM ZW'.split(' '),
  Americas: 'AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GS GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC'.split(' '),
  Asia: 'AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE'.split(' '),
  Europe: 'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK'.split(' '),
  Oceania: 'AS AU CC CK CX FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS'.split(' '),
};
function buildFallbackCountries(): Country[] {
  const displayNames = new Intl.DisplayNames(['zh-TW', 'en'], { type: 'region' });
  const byCode = new Map<string, string>();
  Object.entries(fallbackContinentCodes).forEach(([continent, codes]) => codes.forEach(code => byCode.set(code, continent)));
  const rows: Country[] = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = displayNames.of(code);
      const region = byCode.get(code);
      if (name && name !== code && region) rows.push({ name: { common: name }, cca2: code, region });
    }
  }
  return rows.sort((a, b) => a.name.common.localeCompare(b.name.common, 'zh-TW'));
}

type Profile = {
  name: string;
  coreNoun: string;
  buyers: string[];
  continent: string;
  country: string;
  countryName: string;
  city: string;
  materials: string[];
  customMaterials?: string[];
  specifications: string;
  customSpecifications?: string[];
  hsCode: string;
  certifications: string[];
  employeeScale: string;
  activity: string;
  competitors: string[];
};
type Strategy = { google: string[]; maps: string[]; social: string[] };

const emptyProfile: Profile = {
  name: '', coreNoun: '', buyers: [], continent: '', country: '', countryName: '', city: '', materials: [],
  customMaterials: [], specifications: '', customSpecifications: [], hsCode: '', certifications: [], employeeScale: '', activity: '',
  competitors: [''],
};

const languageAliases: Record<string, string> = {
  deu: 'de', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', nld: 'nl', zho: 'zh',
  jpn: 'ja', kor: 'ko', rus: 'ru', ara: 'ar', hin: 'hi', tur: 'tr', vie: 'vi',
  tha: 'th', pol: 'pl', ces: 'cs', swe: 'sv', dan: 'da', fin: 'fi', nor: 'no',
  ell: 'el', heb: 'he', ukr: 'uk', ind: 'id', msa: 'ms', ron: 'ro', hun: 'hu',
  bul: 'bg', hrv: 'hr', slk: 'sk', slv: 'sl', cat: 'ca', fas: 'fa', urd: 'ur',
  ben: 'bn', tam: 'ta', tel: 'te', mar: 'mr', nep: 'ne', mya: 'my', khm: 'km',
  lao: 'lo', sqi: 'sq', srp: 'sr', bos: 'bs', mkd: 'mk', lit: 'lt', lav: 'lv',
  est: 'et', isl: 'is', gle: 'ga', eus: 'eu', glg: 'gl',
};
function primaryLanguage(country?: Country): string {
  const code = country?.languages ? Object.keys(country.languages)[0] : 'en';
  return code ? languageAliases[code] ?? (code.length === 2 ? code : 'en') : 'en';
}

function compileStrategy(profile: Profile, tld: string, keywords: string[] = []): Strategy {
  const noun = profile.coreNoun.trim();
  if (!noun) return { google: [], maps: [], social: [] };
  const buyerTerms = profile.buyers.map(id => buyerOptions.find(item => item.id === id)?.title ?? '').filter(Boolean);
  const buyerClause = buyerTerms.length ? '(' + buyerTerms.map(item => '"' + item + '"').join(' OR ') + ')' : '';
  const market = profile.countryName ? ' "' + profile.countryName + '"' : '';
  const site = tld ? ' site:' + tld : '';
  const exclusions = excludedTerms.map(term => '-' + term).join(' ');
  const base = '"' + noun + '"';
  const expanded = keywords.length ? '(' + [noun, ...keywords].map(term => '"' + term + '"').join(' OR ') + ')' : base;
  const specs = [profile.specifications, ...profile.materials, ...(profile.customMaterials ?? []), ...(profile.customSpecifications ?? [])].filter(Boolean).join(' ');
  const specClause = specs ? ' (' + specs + ')' : '';
  const hs = profile.hsCode.trim() ? ' "' + profile.hsCode.trim() + '"' : '';
  const google = [
    [expanded, buyerClause, market, site, exclusions].filter(Boolean).join(' '),
    [expanded, specClause, hs, buyerClause, market, exclusions].filter(Boolean).join(' '),
    [expanded, '(supplier OR sourcing OR procurement OR wholesale)', market, site, exclusions].filter(Boolean).join(' '),
    ...profile.competitors.filter(Boolean).map(competitor => '"' + competitor.trim() + '" (distributor OR dealer OR reseller OR stockist)'),
  ];
  const area = profile.city.trim() || profile.countryName || 'target market';
  const mapTerms = [
    noun, ...keywords.slice(0, 2), noun + ' importer', noun + ' distributor', noun + ' wholesaler',
    noun + ' supplier', noun + ' retailer', noun + ' trading company', noun + ' procurement',
  ];
  const maps = mapTerms.map(term => term + ' near ' + area);
  const social = [
    'site:linkedin.com/company ' + expanded + (buyerClause ? ' ' + buyerClause : '') + market,
    'site:myshopify.com ' + expanded + ' ' + '(brand OR store)' + market,
  ];
  return { google, maps, social };
}

export function ProspectDiscoveryPage() {
  const navigate = useNavigate();
  const [planTaskCode] = useState(() => createPlanTaskCode());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSourceCount, setSelectedSourceCount] = useState(0);
  const [selectedSources, setSelectedSources] = useState<Array<{ id: string; name: string; category?: string }> | null>(null);
  const [actorParameters, setActorParameters] = useState<Record<string, unknown>>({});
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryLoading, setCountryLoading] = useState(true);
  const [countryError, setCountryError] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateList, setTemplateList] = useState<Array<{ name: string; profile: Profile }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [synonymInput, setSynonymInput] = useState('');
  const [customMaterialInput, setCustomMaterialInput] = useState('');
  const [customSpecificationInput, setCustomSpecificationInput] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [aiSynonyms, setAiSynonyms] = useState<string[]>([]);
  const [localizedTerms, setLocalizedTerms] = useState<string[]>([]);
  const [buyerKeywords, setBuyerKeywords] = useState<string[]>([]);
  const [strategyLoading, setStrategyLoading] = useState(false);

  const handleSelectionCountChange = useCallback((count: number) => setSelectedSourceCount(count), []);
  const handleSelectionChange = useCallback((sources: Array<{ id: string; name: string; category?: string }>) => setSelectedSources(sources), []);
  const actorSourcesForSchema = selectedSources ?? EMPTY_DISCOVERY_SOURCES;

  const [googleQueries, setGoogleQueries] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSupabaseClient().then(async db => { const { data } = await db.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error('登录状态已失效，请重新登录。'); const response = await fetch('/api/v1/prospect-profiling/countries', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }); const payload = await response.json() as { data?: { countries?: Country[] }; error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message || '国家列表暂时不可用'); return payload.data?.countries ?? []; })
      .then(data => {
        if (!active) return;
        const valid = data.filter(item => item.cca2 && item.name?.common);
        setCountries(valid.length ? valid : buildFallbackCountries());
        if (!valid.length) setCountryError('已切换至本地国家目录，可继续选择国家。');
      })
      .catch(() => {
        if (!active) return;
        setCountries(buildFallbackCountries());
        setCountryError('在线国家目录暂不可用，已切换至本地国家目录。');
      })
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
        const language = primaryLanguage(country);
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

  useEffect(() => {
    const query = profile.city.trim();
    if (!profile.country || !profile.countryName) { setCitySuggestions([]); setCityError(''); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setCityLoading(true);
      setCityError('');
      try {
        const db = await getSupabaseClient();
        const { data } = await db.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('登录状态已失效，请重新登录。');
        const country = countries.find(item => item.cca2 === profile.country);
        const language = country?.languages ? Object.keys(country.languages)[0] : 'en';
        const params = new URLSearchParams({ country: profile.country, countryName: profile.countryName, language: language || 'en' });
        if (query.length >= 2) params.set('q', query);
        const response = await fetch('/api/v1/prospect-profiling/cities?' + params.toString(), {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        });
        const payload = await response.json() as { data?: { cities?: string[] }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || '城市联想暂时不可用');
        if (active) setCitySuggestions(payload.data?.cities ?? []);
      } catch (cause) {
        if (active) setCityError(cause instanceof Error ? cause.message : '城市联想失败');
      } finally {
        if (active) setCityLoading(false);
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [profile.city, profile.country, countries]);

  const filteredCountries = useMemo(
    () => countries.filter(item => !profile.continent || item.region === profile.continent),
    [countries, profile.continent],
  );
  const selectedCountry = countries.find(item => item.cca2 === profile.country);
  const countryTld = selectedCountry?.tld?.[0] ?? '';
  const countryLanguage = selectedCountry?.languages ? Object.values(selectedCountry.languages).join(', ') : '';

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile(current => ({ ...current, [key]: value }));
  const addCustomMaterial = () => {
    const value = customMaterialInput.trim();
    if (value && !(profile.customMaterials ?? []).includes(value)) update('customMaterials', [...(profile.customMaterials ?? []), value]);
    setCustomMaterialInput('');
  };
  const addCustomSpecification = () => {
    const value = customSpecificationInput.trim();
    if (value && !(profile.customSpecifications ?? []).includes(value)) update('customSpecifications', [...(profile.customSpecifications ?? []), value]);
    setCustomSpecificationInput('');
  };
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
  const generateStrategy = async () => {
    if (!profile.coreNoun.trim()) { setError('请先填写核心产品名词，再生成获客策略。'); return; }
    setStrategyLoading(true);
    setError('');
    setPreviewOpen(true);
    try {
      const db = await getSupabaseClient();
      const { data } = await db.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/prospect-profiling/strategy', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          coreNoun: profile.coreNoun,
          buyers: profile.buyers.map(id => buyerOptions.find(item => item.id === id)?.title ?? id),
          country: profile.countryName,
          city: profile.city,
          materials: [...profile.materials, ...(profile.customMaterials ?? [])],
          specifications: [profile.specifications, ...(profile.customSpecifications ?? [])].filter(Boolean).join('; '),
          hsCode: profile.hsCode,
          certifications: profile.certifications,
          employeeScale: profile.employeeScale,
          activity: profile.activity,
          competitors: profile.competitors.filter(Boolean),
        }),
      });
      const payload = await response.json() as { data?: { synonyms?: string[]; localizedTerms?: string[]; buyerKeywords?: string[] }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || 'AI 词库生成失败');
      const generated = payload.data ?? {};
      setAiSynonyms(generated.synonyms ?? []);
      setLocalizedTerms(generated.localizedTerms ?? []);
      setBuyerKeywords(generated.buyerKeywords ?? []);
      const allKeywords = [...(generated.synonyms ?? []), ...(generated.localizedTerms ?? []), ...(generated.buyerKeywords ?? []), ...synonyms];
      const result = compileStrategy(profile, countryTld, allKeywords);
      setGoogleQueries(result.google);
      setNotice('AI 词库裂变与本地规则搜索矩阵已生成。请检查词汇和查询指令。');
    } catch (cause) {
      setAiSynonyms([]); setLocalizedTerms([]); setBuyerKeywords([]);
      const result = compileStrategy(profile, countryTld, synonyms);
      setGoogleQueries(result.google);
      setError(cause instanceof Error ? cause.message + '；已保留本地规则搜索矩阵。' : 'AI 服务暂不可用；已保留本地规则搜索矩阵。');
    } finally {
      setStrategyLoading(false);
    }
  };
  const strategy = compileStrategy(profile, countryTld, [...aiSynonyms, ...localizedTerms, ...buyerKeywords, ...synonyms]);

  useEffect(() => {
    if (previewOpen && !advancedMode) {
      setGoogleQueries(compileStrategy(profile, countryTld, [...aiSynonyms, ...localizedTerms, ...buyerKeywords, ...synonyms]).google);
    }
  }, [previewOpen, advancedMode, profile, countryTld, aiSynonyms, localizedTerms, buyerKeywords, synonyms]);

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
          <p className="tp-prospect-discovery__eyebrow">TRADEPILOT / CRM · PROSPECT DISCOVERY</p>
          <h1>全球外贸智能潜客发现</h1>
          <p>将商业意图转化为可执行的全球获客搜索策略。</p>
        </div>
        <div className="tp-prospect-discovery__header-actions">
          <div className="tp-prospect-discovery__header-meta">
            <Tag type="blue">步骤 / STEP {String(selectedIndex + 1).padStart(2, '0')} / 06</Tag>
            <strong>{steps[selectedIndex]}</strong>
          </div>
          <div className="tp-prospect-discovery__hub-actions">
            <Button kind="secondary" size="md" renderIcon={CarbonIcons.DocumentMultiple_01} onClick={() => navigate('/prospect-history')}>历史任务</Button>
            <Button kind="tertiary" size="md" renderIcon={CarbonIcons.DataBase} onClick={() => navigate('/prospect-data')}>潜客数据</Button>
          </div>
        </div>
      </header>

      <div className="tp-prospect-discovery__task-code"><span>本次方案任务编码</span><strong>{planTaskCode}</strong><span className="tp-prospect-discovery__task-code-note">每次重新打开潜客方案都会生成新的唯一编码</span></div>

      <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: nextIndex }) => setSelectedIndex(nextIndex)}>
        <TabList aria-label="潜客发现六步流程" contained>
          {steps.map(step => <Tab key={step}>{step}</Tab>)}
        </TabList>
      </Tabs>

      {selectedIndex === 1 ? (
        <section className="tp-prospect-discovery__step">
          <div className="tp-prospect-discovery__section-heading">
            <div><span className="tp-prospect-discovery__section-index">01</span><div><h2>Actor 动态参数配置</h2><p>仅展示所选数据源 Input Schema 实际定义的参数；不再提供预设画像字段。</p></div></div>
          </div>
          <ActorSchemaFields sources={actorSourcesForSchema} onValuesChange={setActorParameters} />
        </section>
       ) : selectedIndex === 0 ? (
        <PlatformSelectionStep countryCode={profile.country} countries={countries} onSelectionCountChange={handleSelectionCountChange} selectedIds={selectedSources?.map(item => item.id)} onSelectionChange={handleSelectionChange} />
      ) : selectedIndex === 2 ? (
        <GuardrailsStep countries={countries} profile={{ coreNoun: profile.coreNoun, country: profile.country, countryName: profile.countryName, buyers: profile.buyers }} />
      ) : selectedIndex === 3 ? (
        <ExecutionStep profile={{ coreNoun: profile.coreNoun, buyers: profile.buyers, continent: continents.find(item => item.value === profile.continent)?.label ?? profile.continent, country: profile.country, countryName: profile.countryName, city: profile.city }} sources={selectedSources ?? []} actorParameters={actorParameters} planTaskCode={planTaskCode} onEditStep={setSelectedIndex} onContinueToScoring={ids => { try { localStorage.setItem('tradepilot.prospect-scoring.queue.v1', JSON.stringify(ids)); } catch { /* Keep navigation available if local storage is full. */ } setSelectedIndex(4); }} />
      ) : selectedIndex === 4 ? (
        <ScoringStep profile={{ coreNoun: profile.coreNoun, countryName: profile.countryName, buyers: profile.buyers }} onContinueToEnrichment={() => setSelectedIndex(5)} />
      ) : selectedIndex === 5 ? (
        <DecisionMakerStep profile={{ coreNoun: profile.coreNoun, countryName: profile.countryName }} />
      ) : (
        <div className="tp-prospect-discovery__future-step" aria-label="后续步骤暂未开放"><h2>{steps[selectedIndex]}</h2><p>此步骤将在前序配置确认后启用。</p></div>
      )}
      <div className="tp-prospect-discovery__step-navigation">
        <Button kind="secondary" renderIcon={CarbonIcons.ArrowLeft} onClick={() => setSelectedIndex(index => Math.max(0, index - 1))} disabled={selectedIndex === 0}>上一步</Button>
        <span>第 {selectedIndex + 1} 步，共 6 步</span>
        <Button kind="primary" renderIcon={CarbonIcons.ArrowRight} onClick={() => setSelectedIndex(index => Math.min(5, index + 1))} disabled={selectedIndex === 5 || (selectedIndex === 0 && selectedSourceCount === 0)}>下一步</Button>
      </div>
    </main>
  );
}
