import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Accordion, AccordionItem, Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, TextArea, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/trade-tools.scss';

type ToolKey = 'hs' | 'tariff' | 'screen' | 'rulings';
type ToolMeta = { id: ToolKey; name: string; description: string; icon: React.ReactNode; category: string };
type ResultRecord = Record<string, unknown>;
const omniboxTools: ToolMeta[] = [
  { id: 'hs', name: 'HS Code 智能归类', description: '根据商品描述预测美国 10 位 HTS 编码', icon: <CarbonIcons.Product size={20}/>, category: '产品与关税' },
  { id: 'tariff', name: '出口关税预估', description: '查询基础、优惠及附加关税结构', icon: <CarbonIcons.Calculator size={20}/>, category: '产品与关税' },
  { id: 'screen', name: '贸易实体制裁筛查', description: '检查企业或个人是否命中受限名单', icon: <CarbonIcons.Security size={20}/>, category: '贸易合规' },
  { id: 'rulings', name: '美国 CBP 海关裁决检索', description: '语义检索美国海关历史裁决', icon: <CarbonIcons.Document size={20}/>, category: '贸易合规' },
];
const fieldLabels: Record<string, string> = {
  hs_code: 'HS 编码', hts_code: 'HTS 编码', code: '编码', description: '商品描述', product_description: '商品描述',
  heading: '税目', subheading: '子目', chapter: '章节', confidence: '匹配置信度', confidence_score: '匹配置信度',
  general_rate: '基础税率', general: '基础税率', special_rate: '优惠税率', special: '优惠税率',
  other_rate: '其他附加税率', additional_rate: '附加税率', tariff_rate: '关税税率', duty_rate: '关税税率',
  estimated_duty: '预估关税', duty: '关税', value: '申报价值', currency: '币种', origin_country: '原产国',
  country: '国家/地区', countries: '国家/地区', name: '主体名称', entity_name: '主体名称',
  matched_name: '命中名称', list_name: '名单来源', source: '数据来源', program: '限制项目',
  match_type: '匹配类型', score: '匹配分数', status: '筛查状态', is_match: '是否命中',
  address: '地址', city: '城市', state: '州/省', date: '日期', ruling_date: '裁决日期',
  ruling_number: '裁决编号', control_number: '裁决编号', title: '标题', subject: '裁决主题',
  summary: '摘要', url: '来源链接', link: '来源链接', keyword: '检索关键词', reason: '说明',
};
const preferredArrayKeys = ['results', 'items', 'matches', 'rulings', 'records', 'classifications', 'candidates', 'data'];
function labelFor(key: string) {
  const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return fieldLabels[normalized] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return Array.isArray(value) ? value.map(displayValue).join('；') : JSON.stringify(value);
  return String(value);
}
function findRecords(value: unknown, depth = 0): ResultRecord[] {
  if (depth > 5 || !value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) return value as ResultRecord[];
    for (const item of value) { const found = findRecords(item, depth + 1); if (found.length) return found; }
    return [];
  }
  const object = value as Record<string, unknown>;
  for (const key of preferredArrayKeys) {
    if (key in object) { const found = findRecords(object[key], depth + 1); if (found.length) return found; }
  }
  for (const nested of Object.values(object)) { const found = findRecords(nested, depth + 1); if (found.length) return found; }
  return [];
}
function resultEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [['查询结果', value]];
  return Object.entries(value as Record<string, unknown>).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
}
function authToken() {
  return getSupabaseClient().then(async db => {
    const { data } = await db.auth.getSession();
    if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
    return data.session.access_token;
  });
}
export function TradeToolsHubPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<ToolKey | null>(null);
  const [productDescription, setProductDescription] = useState('');
  const [originCountry, setOriginCountry] = useState('CN');
  const [declaredValue, setDeclaredValue] = useState('');
  const [entityName, setEntityName] = useState('');
  const [fuzzy, setFuzzy] = useState('true');
  const [countries, setCountries] = useState('');
  const [keyword, setKeyword] = useState('');
  const [threshold, setThreshold] = useState('0.65');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const filteredTools = useMemo(() => omniboxTools.filter(tool => (tool.name + tool.description + tool.category).toLowerCase().includes(query.trim().toLowerCase())), [query]);
  const categories = useMemo(() => [{ name: '产品与关税', tools: filteredTools.filter(tool => tool.category === '产品与关税') }, { name: '贸易合规', tools: filteredTools.filter(tool => tool.category === '贸易合规') }], [filteredTools]);
  const activeTool = omniboxTools.find(tool => tool.id === active) || null;
  const records = useMemo(() => findRecords(result), [result]);
  const entries = useMemo(() => resultEntries(result), [result]);
  const runQuery = async () => {
    if (!active) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const token = await authToken();
      const payload: Record<string, unknown> = active === 'hs' ? { productDescription, originCountry } : active === 'tariff' ? { productDescription, originCountry, value: declaredValue } : active === 'screen' ? { name: entityName, fuzzy_name: fuzzy === 'true', countries } : { keyword, match_threshold: Number(threshold) };
      const response = await fetch('/api/v1/trade-tools/omnibox', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: active === 'hs' || active === 'tariff' ? 'classify' : active, payload }) });
      const body = await response.json() as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || 'Omnibox 查询失败（HTTP ' + response.status + '）');
      setResult(body.data ?? body);
    } catch (e) { setError(e instanceof Error ? e.message : '查询失败，请稍后重试。'); }
    finally { setBusy(false); }
  };
  const selectTool = (id: ToolKey) => { setActive(id); setError(''); setResult(null); };
  const renderToolRow = (tool: ToolMeta) => <Button key={tool.id} kind="ghost" className="tp-tool-center__row" onClick={() => selectTool(tool.id)}><span className="tp-tool-center__row-icon">{tool.icon}</span><span className="tp-tool-center__row-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span><CarbonIcons.ChevronRight size={16}/></Button>;
  return <main className="tp-trade-tools tp-tool-center">
    <header className="tp-trade-tools__header"><div><p className="tp-trade-tools__eyebrow">TRADE TOOLS</p><h1>外贸工具</h1><p>集中查询外贸业务所需的信息与合规数据。</p></div><Tag type="blue">工具中心</Tag></header>
    <div className="tp-tool-center__search"><TextInput id="trade-tool-search" labelText="搜索工具" placeholder="输入工具名称或功能关键词" value={query} onChange={e => setQuery(e.currentTarget.value)}/></div>
    <div className="tp-tool-center__layout">
      <section className="tp-tool-center__catalog">
        <div className="tp-tool-center__section-heading"><h2>智能关务与贸易合规</h2><Tag type="cool-gray">Omnibox · 4 项能力</Tag></div>
        <Accordion align="start">{categories.map(category => <AccordionItem key={category.name} title={category.name} open>{category.tools.length ? category.tools.map(renderToolRow) : <p className="tp-tool-center__empty">没有匹配的工具。</p>}</AccordionItem>)}</Accordion>
        <div className="tp-tool-center__section-heading tp-tool-center__section-heading--legacy"><h2>其他外贸工具</h2><Tag type="cool-gray">6 项</Tag></div>
        <div className="tp-tool-center__legacy">{(!query || ('汇率换算 全球公共假期 国际物流追踪 DeepL 在线翻译 客户联系时机 报价利润计算器'.toLowerCase().includes(query.trim().toLowerCase()))) ? <Button kind="ghost" className="tp-tool-center__legacy-row" onClick={() => navigate('/trade-tools/legacy')}><span><strong>打开现有外贸工具</strong><small>汇率换算、公共假期、物流追踪、DeepL 翻译、客户联系时机、报价利润计算器</small></span><Tag type="cool-gray">6 项</Tag><CarbonIcons.ChevronRight size={16}/></Button> : <p className="tp-tool-center__empty">没有匹配的工具。</p>}</div>
        <p className="tp-tool-center__footnote">Omnibox 提供 HS Code 智能归类、关税预估、贸易实体筛查和 CBP 裁决检索。其他既有工具保持原有功能入口。</p>
      </section>
      <section className="tp-tool-center__workspace">
        {!activeTool ? <div className="tp-tool-center__placeholder"><CarbonIcons.Tools size={32}/><h2>选择一个工具开始查询</h2><p>选择左侧工具，填写查询条件，结果将在这里显示。</p></div> : <>
          <div className="tp-tool-center__panel-heading"><div>{activeTool.icon}<div><h2>{activeTool.name}</h2><p>{activeTool.description}</p></div></div><Button kind="ghost" size="sm" onClick={() => { setActive(null); setResult(null); setError(''); }}>关闭</Button></div>
          {(active === 'hs' || active === 'tariff') && <><TextArea id="omnibox-product-description" labelText="商品详细描述" rows={4} value={productDescription} onChange={e => setProductDescription(e.currentTarget.value)} placeholder="输入商品名称、材质、用途和技术规格"/><div className="tp-tool-center__form-grid"><TextInput id="omnibox-origin" labelText="原产国代码（ISO 两位代码）" value={originCountry} onChange={e => setOriginCountry(e.currentTarget.value.toUpperCase())} placeholder="CN"/>{active === 'tariff' && <TextInput id="omnibox-value" labelText="申报价值（USD）" type="number" value={declaredValue} onChange={e => setDeclaredValue(e.currentTarget.value)} placeholder="例如 1200"/>}</div></>}
          {active === 'screen' && <><TextInput id="omnibox-screen-name" labelText="企业或个人名称" value={entityName} onChange={e => setEntityName(e.currentTarget.value)} placeholder="输入英文法定名称或常用名称"/><div className="tp-tool-center__form-grid"><Select id="omnibox-screen-fuzzy" labelText="模糊匹配" value={fuzzy} onChange={e => setFuzzy(e.currentTarget.value)}><SelectItem value="true" text="启用"/><SelectItem value="false" text="精确匹配"/></Select><TextInput id="omnibox-screen-countries" labelText="国家过滤（可选）" value={countries} onChange={e => setCountries(e.currentTarget.value.toUpperCase())} placeholder="CN,RU"/></div></>}
          {active === 'rulings' && <><TextArea id="omnibox-rulings-keyword" labelText="裁决检索关键词" rows={4} value={keyword} onChange={e => setKeyword(e.currentTarget.value)} placeholder="例如：waterproof footwear, wireless bluetooth speaker"/><TextInput id="omnibox-rulings-threshold" labelText="匹配阈值（0–1）" type="number" value={threshold} onChange={e => setThreshold(e.currentTarget.value)}/></>}
          {error && <InlineNotification kind="error" title="查询失败" subtitle={error}/>}
          <div className="tp-tool-center__actions"><Button kind="primary" disabled={busy || ((active === 'hs' || active === 'tariff') ? !productDescription.trim() : active === 'screen' ? !entityName.trim() : !keyword.trim())} onClick={() => void runQuery()}>{busy ? '正在查询…' : '查询'}</Button>{busy && <InlineLoading description="正在请求 Omnibox 服务…"/>}</div>
          {result !== null && <section className="tp-tool-center__result" aria-live="polite">
            <div className="tp-tool-center__result-heading"><h3>查询结果</h3><Button kind="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(result, null, 2))}>复制原始数据</Button></div>
            {records.length > 0 ? <div className="tp-tool-center__table-wrap"><table className="cds--data-table cds--data-table--md"><thead><tr>{Object.keys(records[0]).filter(key => !['raw', 'metadata'].includes(key.toLowerCase())).slice(0, 9).map(key => <th key={key} scope="col">{labelFor(key)}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={String(record.id ?? record.ruling_number ?? record.hts_code ?? index)}>{Object.keys(records[0]).filter(key => !['raw', 'metadata'].includes(key.toLowerCase())).slice(0, 9).map(key => <td key={key}>{displayValue(record[key])}</td>)}</tr>)}</tbody></table></div> : <div className="tp-tool-center__table-wrap"><table className="cds--data-table cds--data-table--md"><thead><tr><th scope="col">业务字段</th><th scope="col">查询结果</th></tr></thead><tbody>{entries.map(([key, value]) => <tr key={key}><th scope="row">{labelFor(key)}</th><td>{displayValue(value)}</td></tr>)}</tbody></table></div>}
            <details className="tp-tool-center__raw"><summary>查看原始 JSON 数据</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
          </section>}
          <p className="tp-tool-center__footnote">查询结果仅供业务预判。HS Code 和关税信息不构成海关正式归类或报关意见；实体筛查命中结果需要结合主体身份、地址和官方清单进一步核实。</p>
        </>}
      </section>
    </div>
  </main>;
}
