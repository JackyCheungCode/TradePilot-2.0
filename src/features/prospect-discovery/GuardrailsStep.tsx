import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Button, Checkbox, FileUploaderButton, InlineNotification,
  MultiSelect, RadioButton, RadioButtonGroup, Select, SelectItem, Tag, TextArea, TextInput, Toggle,
} from '@/design-system';

type CountryOption = { cca2: string; name: { common: string } };
type ProfileContext = { coreNoun?: string; country?: string; countryName?: string; buyers?: string[] };
type RuleSet = Record<string, string>;

const keywordDimensions = [
  { id: 'identity', label: '企业身份', examples: 'manufacturer, factory, supplier, wholesaler, retailer' },
  { id: 'consumer', label: '零售与个人消费', examples: 'personal use, consumer only, buy one, single piece' },
  { id: 'content', label: '内容与非商业网站', examples: 'blog, forum, tutorial, review, wiki' },
  { id: 'recruitment', label: '招聘与求职', examples: 'careers, jobs, hiring, vacancy, internship' },
  { id: 'intermediary', label: '平台及中介属性', examples: 'marketplace, dropshipping, affiliate, broker' },
  { id: 'risk', label: '无效企业与风险信号', examples: 'dissolved, closed, bankrupt, parked domain' },
  { id: 'mismatch', label: '产品与业务不相关', examples: 'clothing, furniture, cosmetics, food' },
  { id: 'custom', label: '自定义关键词', examples: '输入企业名、品牌名、产品型号或其他词汇' },
] as const;

const positions = [
  { id: 'title', text: '搜索结果标题' }, { id: 'snippet', text: '搜索结果摘要' },
  { id: 'url', text: 'URL / 路径' }, { id: 'meta', text: 'Meta Title / Description' },
  { id: 'content', text: '官网正文' }, { id: 'company', text: '企业名称' },
];
const matchModes = [
  { id: 'whole', text: '完整词匹配' }, { id: 'phrase', text: '词组匹配' },
  { id: 'contains', text: '包含匹配' }, { id: 'prefix', text: '前缀匹配' },
  { id: 'regex', text: '正则表达式（高级）' },
];
const websiteTypes = [
  '电商零售平台', 'B2C 零售商城', '社交媒体', '论坛与社区', '博客与内容平台',
  '黄页与企业目录', '招聘与求职网站', '新闻与媒体', '政府及公共机构网站',
];
const websiteRuleTypes = [
  { value: 'exact_url', text: '指定网址（Exact URL）' },
  { value: 'domain', text: '根域名（Domain）' },
  { value: 'suffix', text: '网站后缀（TLD）' },
  { value: 'subdomain', text: '子域名（Subdomain）' },
  { value: 'path', text: 'URL 路径（Path）' },
  { value: 'platform', text: '网站平台 / 类型' },
  { value: 'pattern', text: 'URL 模式（Pattern）' },
];
const exclusionActions = [
  { value: 'company', text: '拦截企业' }, { value: 'page', text: '跳过页面' }, { value: 'result', text: '跳过搜索结果' },
];

const emptyRules: RuleSet = {
  keywords: '', websites: '', companies: '', geography: '', products: '', contacts: '', people: '', quality: '',
};

export function GuardrailsStep({ countries, profile }: { countries: CountryOption[]; profile: ProfileContext }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    keywords: true, websites: true, companies: true, geography: true,
    products: true, contacts: true, people: true, quality: true,
  });
  const [rules, setRules] = useState<RuleSet>(emptyRules);
  const [selectedDimensions, setSelectedDimensions] = useState<Array<{ id: string; text: string }>>([]);
  const [selectedPositions, setSelectedPositions] = useState(positions);
  const [selectedModes, setSelectedModes] = useState(matchModes.slice(0, 2));
  const [selectedWebsiteTypes, setSelectedWebsiteTypes] = useState<Array<{ id: string; text: string }>>([]);
  const [websiteType, setWebsiteType] = useState('domain');
  const [websiteValue, setWebsiteValue] = useState('');
  const [websiteRows, setWebsiteRows] = useState<Array<{ type: string; value: string }>>([]);
  const [scope, setScope] = useState('task');
  const [keywordAction, setKeywordAction] = useState('page');
  const [doNotContact, setDoNotContact] = useState(true);
  const [contactEntries, setContactEntries] = useState({ emails: '', phones: '', social: '', addresses: '' });
  const [excludedCountries, setExcludedCountries] = useState<Array<{ id: string; text: string }>>([]);
  const [employeeFloor, setEmployeeFloor] = useState('');
  const [requireIndependentSite, setRequireIndependentSite] = useState(false);
  const [unknownPolicy, setUnknownPolicy] = useState('pending');
  const [duplicatePolicy, setDuplicatePolicy] = useState('merge');
  const [template, setTemplate] = useState('standard');
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradepilot.guardrails.frontend.v1');
      if (saved) {
        const value = JSON.parse(saved) as { enabled?: Record<string, boolean>; rules?: RuleSet; websiteRows?: Array<{ type: string; value: string }>; scope?: string; selectedDimensions?: Array<{ id: string; text: string }>; selectedPositions?: typeof positions; selectedModes?: typeof matchModes; selectedWebsiteTypes?: Array<{ id: string; text: string }>; excludedCountries?: Array<{ id: string; text: string }>; contactEntries?: typeof contactEntries; keywordAction?: string; doNotContact?: boolean; employeeFloor?: string; requireIndependentSite?: boolean; unknownPolicy?: string; duplicatePolicy?: string; template?: string };
        if (value.enabled) setEnabled(value.enabled);
        if (value.rules) setRules({ ...emptyRules, ...value.rules });
        if (value.websiteRows) setWebsiteRows(value.websiteRows);
        if (value.scope) setScope(value.scope);
        if (value.selectedDimensions) setSelectedDimensions(value.selectedDimensions);
        if (value.selectedPositions) setSelectedPositions(value.selectedPositions);
        if (value.selectedModes) setSelectedModes(value.selectedModes);
        if (value.selectedWebsiteTypes) setSelectedWebsiteTypes(value.selectedWebsiteTypes);
        if (value.excludedCountries) setExcludedCountries(value.excludedCountries);
        if (value.contactEntries) setContactEntries(value.contactEntries);
        if (value.keywordAction) setKeywordAction(value.keywordAction);
        if (typeof value.doNotContact === 'boolean') setDoNotContact(value.doNotContact);
        if (value.employeeFloor !== undefined) setEmployeeFloor(value.employeeFloor);
        if (typeof value.requireIndependentSite === 'boolean') setRequireIndependentSite(value.requireIndependentSite);
        if (value.unknownPolicy) setUnknownPolicy(value.unknownPolicy);
        if (value.duplicatePolicy) setDuplicatePolicy(value.duplicatePolicy);
        if (value.template) setTemplate(value.template);
      }
    } catch { /* Keep the default local-only configuration. */ }
  }, []);

  const selectedCountryName = countries.find(item => item.cca2 === profile.country)?.name.common ?? profile.countryName ?? '';
  const updateRule = (key: keyof RuleSet, value: string) => setRules(current => ({ ...current, [key]: value }));
  const toggleEnabled = (key: string, value: boolean) => setEnabled(current => ({ ...current, [key]: value }));
  const addWebsiteRule = () => {
    const value = websiteValue.trim();
    if (!value) return;
    setWebsiteRows(current => [...current, { type: websiteType, value }]);
    setWebsiteValue('');
  };
  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.toLowerCase().endsWith('.xlsx')) { setImportPreview([]); setNotice('已选择 XLSX 文件。当前前端版本暂只解析 CSV / TXT 文本，XLSX 字段预览将在独立导入模块阶段补齐；文件未上传。'); return; }
      const lines = String(reader.result ?? '').split(/\\r?\\n/).map(line => line.trim()).filter(Boolean);
      setImportPreview(lines.slice(0, 8));
      setNotice('已读取文件并生成前端预览。确认后可将识别内容加入当前规则；当前版本不会上传文件。');
      setError('');
    };
    reader.onerror = () => setError('文件读取失败，请检查文件格式。');
    reader.readAsText(file);
  };
  const applyImportPreview = () => {
    const imported = importPreview.filter(line => !websiteRows.some(row => row.value.toLowerCase() === line.toLowerCase()));
    const classify = (value: string) => {
      if (/^https?:\\/\\//i.test(value)) return 'exact_url';
      if (value.startsWith('.')) return 'suffix';
      if (value.startsWith('/')) return 'path';
      if (value.includes('*') || value.includes('?')) return 'pattern';
      return 'domain';
    };
    setWebsiteRows(current => [...current, ...imported.map(value => ({ type: classify(value), value }))]);
    setImportPreview([]);
    setNotice('已将预览中的项目加入本地网站排除规则。');
  };
  const saveLocal = () => {
    try {
      localStorage.setItem('tradepilot.guardrails.frontend.v1', JSON.stringify({ enabled, rules, websiteRows, scope, contactEntries, excludedCountries, keywordAction, doNotContact, selectedDimensions, selectedPositions, selectedModes, selectedWebsiteTypes, employeeFloor, requireIndependentSite, unknownPolicy, duplicatePolicy, template }));
      setNotice('护盾配置已保存在当前浏览器。尚未写入服务器或任务。');
      setError('');
    } catch { setError('浏览器本地保存失败，请检查存储空间。'); }
  };
  const loadPreset = (value: string) => {
    setTemplate(value);
    if (value === 'strict') {
      setRequireIndependentSite(true);
      setEmployeeFloor('10');
      setUnknownPolicy('pending');
    } else if (value === 'relaxed') {
      setRequireIndependentSite(false);
      setEmployeeFloor('');
      setUnknownPolicy('pending');
    } else {
      setRequireIndependentSite(false);
      setEmployeeFloor('5');
      setUnknownPolicy('pending');
    }
  };

  useEffect(() => {
    if (countries.length) setExcludedCountries(current => current.length ? current : countries.filter(item => item.cca2 === 'CN').map(item => ({ id: item.cca2, text: item.name.common + ' (' + item.cca2 + ')' })));
  }, [countries]);

  const summary = useMemo(() => Object.values(enabled).filter(Boolean).length, [enabled]);

  return (
    <section className="tp-prospect-discovery__step tp-guardrails">
      <div className="tp-guardrails__notice">
        <InlineNotification kind="info" lowContrast hideCloseButton title="前端配置预览" subtitle="本阶段仅实现界面交互与浏览器本地状态，不会创建后端规则、写入数据库、启动过滤或影响现有任务。" />
      </div>
      {(notice || error) && <div className="tp-guardrails__feedback">
        {notice && <InlineNotification kind="success" lowContrast title="提示" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
        {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      </div>}

      <div className="tp-guardrails__context">
        <div><span>当前画像</span><strong>{profile.coreNoun || '尚未填写核心产品'}</strong></div>
        <div><span>目标市场</span><strong>{selectedCountryName || '尚未选择国家'}</strong></div>
        <div><span>启用规则类别</span><strong>{summary} / 8</strong></div>
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">01</span><div><h2>关键词排除</h2><p>按业务语义、出现位置与匹配方式筛选不相关内容</p></div></div>
          <Toggle id="tp-guardrails-keywords" labelText="启用关键词排除" toggled={enabled.keywords} onToggle={value => toggleEnabled('keywords', value)} />
        </div>
        <div className="tp-guardrails__field">
          <MultiSelect id="tp-guardrails-keyword-dimensions" titleText="关键词分类" label="选择需要启用的分类" items={keywordDimensions.map(item => ({ id: item.id, text: item.label }))} itemToString={item => item?.text ?? ''} selectedItems={selectedDimensions} onChange={({ selectedItems }) => setSelectedDimensions(selectedItems ?? [])} />
        </div>
        <div className="tp-guardrails__keyword-grid">
          {keywordDimensions.map(item => <div className="tp-guardrails__keyword-group" key={item.id}>
            <strong>{item.label}</strong><span>{item.examples}</span>
          </div>)}
        </div>
        <div className="tp-guardrails__field">
          <TextArea id="tp-guardrails-keywords-list" labelText="排除关键词（每行一个）" placeholder={'personal use\\nconsumer only\\njob vacancy\\npersonal blog'} rows={5} value={rules.keywords} onChange={event => updateRule('keywords', event.currentTarget.value)} />
        </div>
        <div className="tp-guardrails__two-col">
          <MultiSelect id="tp-guardrails-keyword-positions" titleText="匹配位置" label="选择匹配位置" items={positions} itemToString={item => item?.text ?? ''} selectedItems={selectedPositions} onChange={({ selectedItems }) => setSelectedPositions(selectedItems ?? [])} />
          <MultiSelect id="tp-guardrails-keyword-modes" titleText="匹配方式" label="选择匹配方式" items={matchModes} itemToString={item => item?.text ?? ''} selectedItems={selectedModes} onChange={({ selectedItems }) => setSelectedModes(selectedItems ?? [])} />
        </div>
        <div className="tp-guardrails__field">
          <span className="tp-guardrails__field-label">命中后的处理动作</span>
          <div className="tp-guardrails__choice-row">
            <RadioButtonGroup legendText="命中后的处理动作" name="tp-guardrails-keyword-action" valueSelected={keywordAction} onChange={value => setKeywordAction(String(value))}>
            {exclusionActions.map(item => <RadioButton key={item.value} id={'tp-guardrails-action-' + item.value} value={item.value} labelText={item.text} />)}
          </RadioButtonGroup>
          </div>
        </div>
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">02</span><div><h2>网站与域名排除</h2><p>支持七种匹配方式，并可批量导入网址或域名</p></div></div>
          <Toggle id="tp-guardrails-websites" labelText="启用网站排除" toggled={enabled.websites} onToggle={value => toggleEnabled('websites', value)} />
        </div>
        <div className="tp-guardrails__website-builder">
          <Select id="tp-guardrails-website-type" labelText="排除规则类型" value={websiteType} onChange={event => setWebsiteType(event.currentTarget.value)}>
            {websiteRuleTypes.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}
          </Select>
          <TextInput id="tp-guardrails-website-value" labelText="网址 / 域名 / 路径" placeholder="例如 example.com、.xyz、/blog/" value={websiteValue} onChange={event => setWebsiteValue(event.currentTarget.value)} />
          <Button kind="primary" onClick={addWebsiteRule} disabled={!websiteValue.trim()}>添加规则</Button>
        </div>
        <div className="tp-guardrails__rule-list">
          {websiteRows.length === 0 && <p className="tp-guardrails__empty">尚未添加网站排除规则。</p>}
          {websiteRows.map((row, index) => <div className="tp-guardrails__rule-row" key={row.type + row.value + index}>
            <Tag type="blue">{websiteRuleTypes.find(item => item.value === row.type)?.text ?? row.type}</Tag><span>{row.value}</span>
            <Button kind="ghost" size="sm" onClick={() => setWebsiteRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>移除</Button>
          </div>)}
        </div>
        <div className="tp-guardrails__field">
          <MultiSelect id="tp-guardrails-website-types" titleText="网站类型预设" label="选择需要排除的网站类型" items={websiteTypes.map((text, id) => ({ id: String(id), text }))} itemToString={item => item?.text ?? ''} selectedItems={selectedWebsiteTypes} onChange={({ selectedItems }) => setSelectedWebsiteTypes(selectedItems ?? [])} />
        </div>
        <div className="tp-guardrails__import">
          <div><strong>批量导入网站排除清单</strong><span>支持 CSV / TXT 文本预览；当前只在浏览器读取，不上传文件。</span></div>
          <FileUploaderButton accept={['.csv', '.txt', '.xlsx']} buttonKind="tertiary" labelText="选择文件" name="tp-guardrails-import" onChange={importFile} />
        </div>
        {importPreview.length > 0 && <div className="tp-guardrails__import-preview">
          <strong>导入预览（最多显示前 8 条）</strong>
          {importPreview.map((item, index) => <span key={index}>{item}</span>)}
          <Button kind="primary" size="sm" onClick={applyImportPreview}>加入规则</Button>
        </div>}
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">03</span><div><h2>企业主体排除</h2><p>排除企业全称、简称、别名、品牌及已确认的集团主体</p></div></div>
          <Toggle id="tp-guardrails-companies" labelText="启用企业排除" toggled={enabled.companies} onToggle={value => toggleEnabled('companies', value)} />
        </div>
        <TextArea id="tp-guardrails-companies-list" labelText="企业名称 / 品牌 / 别名（每行一个）" placeholder={'企业全称\\n企业简称\\n品牌名称\\n集团名称'} rows={4} value={rules.companies} onChange={event => updateRule('companies', event.currentTarget.value)} />
        <div className="tp-guardrails__choice-row">
          <Checkbox id="tp-guardrails-company-alias" labelText="同时匹配已确认的企业别名" defaultChecked />
          <Checkbox id="tp-guardrails-company-group" labelText="匹配已验证的集团关联主体" />
        </div>
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">04</span><div><h2>地域排除</h2><p>按国家、省州、城市、邮编或具体区域排除</p></div></div>
          <Toggle id="tp-guardrails-geography" labelText="启用地域排除" toggled={enabled.geography} onToggle={value => toggleEnabled('geography', value)} />
        </div>
        <div className="tp-guardrails__field">
          <MultiSelect id="tp-guardrails-country-exclusion" titleText="排除国家 / 地区" label="选择需要排除的国家或地区" items={countries.map(item => ({ id: item.cca2, text: item.name.common + ' (' + item.cca2 + ')' }))} itemToString={item => item?.text ?? ''} selectedItems={excludedCountries} onChange={({ selectedItems }) => setExcludedCountries(selectedItems ?? [])} />
        </div>
        <TextArea id="tp-guardrails-subregions" labelText="省州 / 城市 / 邮政编码（每行一个）" placeholder={'California\\nOntario\\nDubai\\n10001'} rows={3} value={rules.geography} onChange={event => updateRule('geography', event.currentTarget.value)} />
        <p className="tp-guardrails__helper">地域判定优先依据企业注册地与实际经营地址；IP 和服务器位置仅作辅助证据。</p>
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">05</span><div><h2>产品与业务排除</h2><p>与第一步画像联动，排除经营品类或业务模式不匹配的企业</p></div></div>
          <Toggle id="tp-guardrails-products" labelText="启用产品与业务排除" toggled={enabled.products} onToggle={value => toggleEnabled('products', value)} />
        </div>
        <div className="tp-guardrails__context-tags">
          {profile.coreNoun && <Tag type="green">目标产品：{profile.coreNoun}</Tag>}
          {profile.buyers?.map(item => <Tag key={item} type="blue">目标身份：{item}</Tag>)}
          {!profile.coreNoun && <span>完成第一步画像后，这里将展示目标产品与买家身份。</span>}
        </div>
        <TextArea id="tp-guardrails-product-exclusions" labelText="排除产品品类 / 业务模式（每行一个）" placeholder={'clothing\\nfurniture\\ncosmetics\\nrepair-only service\\nconsulting-only'} rows={4} value={rules.products} onChange={event => updateRule('products', event.currentTarget.value)} />
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">06</span><div><h2>联系方式排除</h2><p>避免重复联系、无效联系方式及明确拒绝联系对象</p></div></div>
          <Toggle id="tp-guardrails-contacts" labelText="启用联系方式排除" toggled={enabled.contacts} onToggle={value => toggleEnabled('contacts', value)} />
        </div>
        <div className="tp-guardrails__two-col">
          <TextArea id="tp-guardrails-emails" labelText="邮箱 / 邮箱域名" placeholder={'name@example.com\\nexample.org'} rows={3} value={contactEntries.emails} onChange={event => setContactEntries(current => ({ ...current, emails: event.currentTarget.value }))} />
          <TextArea id="tp-guardrails-phones" labelText="电话 / WhatsApp 号码" placeholder={'+1 202 555 0100\\n+886 912 345 678'} rows={3} value={contactEntries.phones} onChange={event => setContactEntries(current => ({ ...current, phones: event.currentTarget.value }))} />
          <TextArea id="tp-guardrails-social" labelText="社交账号 / 个人主页链接" placeholder={'LinkedIn URL\\nFacebook URL\\nInstagram handle'} rows={3} value={contactEntries.social} onChange={event => setContactEntries(current => ({ ...current, social: event.currentTarget.value }))} />
          <TextArea id="tp-guardrails-addresses" labelText="地址 / 其他联系方式" placeholder="输入需要排除的地址或联系方式" rows={3} value={contactEntries.addresses} onChange={event => setContactEntries(current => ({ ...current, addresses: event.currentTarget.value }))} />
        </div>
        <Toggle id="tp-guardrails-dnc" labelText="启用禁止联系名单（Do Not Contact）" labelA="关闭" labelB="开启" toggled={doNotContact} onToggle={setDoNotContact} />
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">07</span><div><h2>人员与账号排除</h2><p>排除不相关职位、指定联系人、内部人员及重复账号</p></div></div>
          <Toggle id="tp-guardrails-people" labelText="启用人员排除" toggled={enabled.people} onToggle={value => toggleEnabled('people', value)} />
        </div>
        <div className="tp-guardrails__two-col">
          <TextArea id="tp-guardrails-person-names" labelText="联系人姓名 / 账号" placeholder="每行一个姓名或账号" rows={3} value={rules.people} onChange={event => updateRule('people', event.currentTarget.value)} />
          <TextArea id="tp-guardrails-job-titles" labelText="排除职位 / 岗位" placeholder={'intern\\nassistant\\nnon-purchasing role'} rows={3} />
        </div>
        <div className="tp-guardrails__choice-row">
          <Checkbox id="tp-guardrails-internal-staff" labelText="排除内部员工" />
          <Checkbox id="tp-guardrails-competitor-staff" labelText="排除竞争对手员工" />
          <Checkbox id="tp-guardrails-non-decision" labelText="排除非决策岗位" />
        </div>
      </div>

      <div className="tp-guardrails__panel">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">08</span><div><h2>数据质量与重复排除</h2><p>识别重复主体、无效网站和低质量数据，尽可能归并而非删除</p></div></div>
          <Toggle id="tp-guardrails-quality" labelText="启用质量检查" toggled={enabled.quality} onToggle={value => toggleEnabled('quality', value)} />
        </div>
        <div className="tp-guardrails__two-col">
          <Select id="tp-guardrails-duplicate-policy" labelText="重复企业处理" value={duplicatePolicy} onChange={event => setDuplicatePolicy(event.currentTarget.value)}>
            <SelectItem value="merge" text="识别并归并，保留所有来源" />
            <SelectItem value="skip" text="跳过重复记录，不新建线索" />
            <SelectItem value="review" text="进入待验证队列" />
          </Select>
          <Select id="tp-guardrails-unknown-policy" labelText="信息未知时处理" value={unknownPolicy} onChange={event => setUnknownPolicy(event.currentTarget.value)}>
            <SelectItem value="pending" text="待验证（推荐）" />
            <SelectItem value="allow" text="暂时放行" />
            <SelectItem value="block" text="直接拦截（严格）" />
          </Select>
        </div>
        <div className="tp-guardrails__two-col">
          <TextInput id="tp-guardrails-employee-floor" labelText="最低员工人数门槛" type="number" min={1} placeholder="例如 10；留空表示不限" value={employeeFloor} onChange={event => setEmployeeFloor(event.currentTarget.value)} />
          <Toggle id="tp-guardrails-independent-site" labelText="要求独立企业官网" labelA="关闭" labelB="开启" toggled={requireIndependentSite} onToggle={setRequireIndependentSite} />
        </div>
        <TextArea id="tp-guardrails-quality-rules" labelText="其他质量排除备注" placeholder={'confirmed closed\\nparked domain\\ninvalid contact data'} rows={3} value={rules.quality} onChange={event => updateRule('quality', event.currentTarget.value)} />
      </div>

      <div className="tp-guardrails__panel tp-guardrails__template">
        <div className="tp-guardrails__panel-heading">
          <div><span className="tp-guardrails__index">09</span><div><h2>护盾模板与应用范围</h2><p>保存当前浏览器配置，选择后续任务的规则范围</p></div></div>
          <Tag type="blue">本地预览</Tag>
        </div>
        <div className="tp-guardrails__two-col">
          <Select id="tp-guardrails-template" labelText="预设模板" value={template} onChange={event => loadPreset(event.currentTarget.value)}>
            <SelectItem value="relaxed" text="宽松型" /><SelectItem value="standard" text="标准型（推荐）" /><SelectItem value="strict" text="严格型" />
          </Select>
          <Select id="tp-guardrails-scope" labelText="规则作用范围" value={scope} onChange={event => setScope(event.currentTarget.value)}>
            <SelectItem value="task" text="当前任务" /><SelectItem value="global" text="全局规则" /><SelectItem value="both" text="全局 + 当前任务" />
          </Select>
        </div>
        <div className="tp-guardrails__rule-summary">
          <span>已启用 {summary} / 8 类规则</span>
          <span>员工门槛：{employeeFloor || '不限'}</span>
          <span>未知信息：{unknownPolicy === 'pending' ? '待验证' : unknownPolicy === 'allow' ? '暂时放行' : '拦截'}</span>
          <span>重复处理：{duplicatePolicy === 'merge' ? '归并并保留来源' : duplicatePolicy === 'skip' ? '跳过重复' : '待验证'}</span>
        </div>
        <div className="tp-guardrails__footer-actions">
          <Button kind="secondary" onClick={() => { setRules(emptyRules); setWebsiteRows([]); setNotice('已清空当前页面的文本规则。'); }}>清空文本规则</Button>
          <Button kind="primary" onClick={saveLocal}>保存本地配置</Button>
        </div>
      </div>
    </section>
  );
}
