import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Dropdown, MultiSelect, Tag, TextInput, Tabs, TabList, Tab, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { PlatformSelectionStep } from './PlatformSelectionStep';
import { ActorSchemaFields } from './ActorSchemaFields';
import { GuardrailsStep } from './GuardrailsStep';
import { ExecutionStep } from './ExecutionStep';
import { ScoringStep } from './ScoringStep';
import { DecisionMakerStep } from './DecisionMakerStep';
import '@/design-system/patterns/prospect-discovery.scss';

const createPlanTaskCode = () => 'TPD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

const steps = [
  '数据源与平台选择（Platform & Source Selection）',
  'Actor 动态参数配置（Actor Input Schema）',
  '拦截护盾配置（Filtering & Guardrails Config）',
  '执行全网搜索（Multi-Channel Execution）',
  'AI智能清洗与打分（AI Filtering & Scoring）',
  '决策人穿透与入库（Decision-Maker Enrichment & CRM Sync）',
] as const;

type Country = {
  name: { common: string };
  cca2: string;
  region: string;
  tld?: string[];
  languages?: Record<string, string>;
};

type Profile = {
  coreNoun: string;
  buyers: string[];
  continent: string;
  country: string;
  countryName: string;
  city: string;
};

const buyerOptions = [
  { id: 'importer', title: '进口商', detail: 'Importer' },
  { id: 'distributor', title: '分销商 / 批发商', detail: 'Distributor / Wholesaler' },
  { id: 'brand', title: '品牌方', detail: 'Brand Owner' },
  { id: 'contractor', title: '工程商 / 零售商', detail: 'Contractor / Retailer' },
];

const fallbackContinentCodes: Record<string, string[]> = {
  Africa: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TF TG TN TZ UG YT ZA ZM ZW'.split(' '),
  Americas: 'AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC'.split(' '),
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

const emptyProfile: Profile = {
  coreNoun: '', buyers: [], continent: '', country: '', countryName: '', city: '',
};

const EMPTY_DISCOVERY_SOURCES: Array<{ id: string; name: string; category?: string }> = [];

export function ProspectDiscoveryPage() {
  const navigate = useNavigate();
  const [planTaskCode] = useState(() => createPlanTaskCode());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSourceCount, setSelectedSourceCount] = useState(0);
  const [selectedSources, setSelectedSources] = useState<Array<{ id: string; name: string; category?: string }> | null>(null);
  const [actorParameters, setActorParameters] = useState<Record<string, unknown>>({});
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [countries, setCountries] = useState<Country[]>([]);

  const handleSelectionCountChange = useCallback((count: number) => setSelectedSourceCount(count), []);
  const handleSelectionChange = useCallback((sources: Array<{ id: string; name: string; category?: string }>) => setSelectedSources(sources), []);
  const actorSourcesForSchema = selectedSources ?? EMPTY_DISCOVERY_SOURCES;

  useEffect(() => {
    let active = true;
    const loadCountries = async () => {
      try {
        const db = await getSupabaseClient();
        const { data } = await db.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('登录状态已失效，请重新登录。');
        const response = await fetch('/api/v1/prospect-profiling/countries', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        });
        const payload = await response.json() as { data?: { countries?: Country[] } };
        if (!response.ok) throw new Error('国家目录暂不可用');
        const valid = (payload.data?.countries ?? []).filter(item => item.cca2 && item.name?.common);
        if (active) setCountries(valid.length ? valid : buildFallbackCountries());
      } catch {
        if (active) setCountries(buildFallbackCountries());
      }
    };
    void loadCountries();
    return () => { active = false; };
  }, []);

  const updateProfile = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile(current => ({ ...current, [key]: value }));
  };
  const selectedCountry = countries.find(country => country.cca2 === profile.country);

  return (
    <main className="tp-prospect-discovery">
      <header className="tp-prospect-discovery__page-header">
        <div>
          <p className="tp-prospect-discovery__eyebrow">TRADEPILOT / CRM · PROSPECT DISCOVERY</p>
          <h1>全球外贸智能潜客发现</h1>
          <p>选择数据来源、配置任务业务上下文，并按各数据源真实 Schema 执行采集。</p>
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

      {selectedIndex === 0 ? (
        <>
          <section className="tp-prospect-discovery__step tp-prospect-discovery__task-context">
            <div className="tp-prospect-discovery__section-heading">
              <div><span className="tp-prospect-discovery__section-index">01</span><div><h2>任务业务上下文</h2><p>仅定义本次搜索的产品、目标市场和买家类型；不作为 Actor 参数预设值。</p></div></div>
            </div>
            <div className="tp-prospect-discovery__two-col">
              <TextInput id="prospect-task-core-product" labelText="核心产品 / 搜索主题" placeholder="例如：wireless earbuds、USB-C hub" value={profile.coreNoun} onChange={event => updateProfile('coreNoun', event.currentTarget.value)} />
              <Dropdown
                id="prospect-task-country"
                titleText="目标国家 / 市场"
                label="选择一个国家"
                items={countries}
                itemToString={item => item ? item.name.common : ''}
                selectedItem={selectedCountry ?? null}
                onChange={({ selectedItem }) => {
                  const country = selectedItem as Country | null;
                  setProfile(current => ({ ...current, country: country?.cca2 ?? '', countryName: country?.name.common ?? '', continent: country?.region ?? '', city: '' }));
                }}
              />
              <TextInput id="prospect-task-city" labelText="目标城市（可选）" placeholder="例如：Berlin" value={profile.city} onChange={event => updateProfile('city', event.currentTarget.value)} />
              <MultiSelect
                id="prospect-task-buyers"
                titleText="目标买家类型"
                label="选择买家类型"
                items={buyerOptions}
                itemToString={item => item ? item.title : ''}
                selectedItems={buyerOptions.filter(item => profile.buyers.includes(item.id))}
                onChange={({ selectedItems }) => updateProfile('buyers', (selectedItems ?? []).map(item => item.id))}
              />
            </div>
          </section>
          <PlatformSelectionStep countryCode={profile.country} countries={countries} onSelectionCountChange={handleSelectionCountChange} selectedIds={selectedSources?.map(item => item.id)} onSelectionChange={handleSelectionChange} />
        </>
      ) : selectedIndex === 1 ? (
        <section className="tp-prospect-discovery__step">
          <div className="tp-prospect-discovery__section-heading">
            <div><span className="tp-prospect-discovery__section-index">02</span><div><h2>Actor 动态参数配置</h2><p>仅展示所选数据源 Input Schema 实际定义的参数；不再提供预设画像字段。</p></div></div>
          </div>
          <ActorSchemaFields sources={actorSourcesForSchema} onValuesChange={setActorParameters} />
        </section>
      ) : selectedIndex === 2 ? (
        <GuardrailsStep countries={countries} profile={{ coreNoun: profile.coreNoun, country: profile.country, countryName: profile.countryName, buyers: profile.buyers }} />
      ) : selectedIndex === 3 ? (
        <ExecutionStep
          profile={{ coreNoun: profile.coreNoun, buyers: profile.buyers, continent: profile.continent, country: profile.country, countryName: profile.countryName, city: profile.city }}
          sources={selectedSources ?? []}
          actorParameters={actorParameters}
          planTaskCode={planTaskCode}
          onEditStep={setSelectedIndex}
          onContinueToScoring={ids => {
            try { localStorage.setItem('tradepilot.prospect-scoring.queue.v1', JSON.stringify(ids)); } catch { /* Keep navigation available if local storage is full. */ }
            setSelectedIndex(4);
          }}
        />
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
