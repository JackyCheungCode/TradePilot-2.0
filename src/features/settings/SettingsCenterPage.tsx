import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/settings.scss';
import { ProductAdvancedSettings } from './ProductAdvancedSettings';
import { OpportunitySettings, opportunitySettingSections } from './OpportunitySettings';
import { CrmDomainSettings, crmSettingSections, type CrmSettingsDomain } from './CrmDomainSettings';
import { TradeDocumentSettings } from './TradeDocumentSettings';
import { TradeOperationsSettings } from './TradeOperationsSettings';
import { AgentSettings } from './AgentSettings';
import { IntegrationsSettings } from './IntegrationsSettings';

type Domain = { id: string; label: string; icon: React.ReactNode; available: boolean };
type Section = { id: string; label: string; group: string; description: string; implemented?: boolean; integration?: 'connected'|'config-only'|'pending' };
type Category = { id: string; name: string; parent_id: string | null; code: string | null; description?: string | null; sequence: number; is_active: boolean };
type Attribute = { id: string; name: string; display_type: string; create_variant: string; sequence: number; is_active: boolean };
type AttributeValue = { id: string; attribute_id: string; name: string; html_color: string | null; sequence: number; is_active: boolean };

const domains: Domain[] = [
  { id: 'products', label: '产品', icon: <CarbonIcons.Product size={20} />, available: true },
  { id: 'opportunities', label: '商机', icon: <CarbonIcons.UserMultiple size={20} />, available: true },
  { id: 'contacts', label: '联系人', icon: <CarbonIcons.User size={20} />, available: true },
  { id: 'accounts', label: '客户', icon: <CarbonIcons.Building size={20} />, available: true },
  { id: 'leads', label: '线索', icon: <CarbonIcons.UserMultiple size={20} />, available: true },
  { id: 'trade-documents', label: '销售单据', icon: <CarbonIcons.Document size={20} />, available: true },
  { id: 'trade-operations', label: '发运与收款', icon: <CarbonIcons.Delivery size={20} />, available: true },
  { id: 'agent', label: 'Agent 设置', icon: <CarbonIcons.Settings size={20} />, available: true },
];

const integrationSections: Section[] = [
  { id: 'api', label: 'API 集成', group: '集成与 API', description: '统一管理 Apify、DeepL、Google Maps、DHL、UPS、FedEx 与 Cloudflare Workers AI 等 API 凭证。', implemented: true },
  { id: 'ai', label: 'AI 模型集成', group: '集成与 API', description: '添加多个国内外 AI 供应商和模型配置，支持动态获取模型、连接测试和独立保存。', implemented: true },
];

const agentSections: Section[] = [
  { id: 'models', label: '模型配置', group: '小雅与 Agent', description: '设置小雅使用的模型供应商、对话模型和任务规划模型。', implemented: true },
  { id: 'profiles', label: 'Agent 管理', group: '小雅与 Agent', description: '管理内置专业 Agent 的启用状态与专属指令。', implemented: true },
  { id: 'appearance', label: '头像与形象', group: '小雅与 Agent', description: '配置小雅默认头像的形状、配色和视觉风格。', implemented: true },
];

const tradeOperationsSections: Section[] = [
  { id: 'shared', label: '共享基础设置', group: '共享基础设置', description: '统一维护币种与贸易术语，发运和收款模块共用。', implemented: true },
  { id: 'shipment', label: '发运设置', group: '业务模块设置', description: '默认运输规则、运输方式、箱型、包装、费用、跟踪节点与异常字典。', implemented: true },
  { id: 'payment', label: '收款设置', group: '业务模块设置', description: '收款基础规则、账户与方式、汇率手续费、应收账龄、信用证、退款核销和对账。', implemented: true, integration: 'config-only' },
];

const tradeDocumentSections: Section[] = [
  { id: 'shared', label: '通用设置', group: '销售单据规则', description: '报价单与销售订单共享的业务规则和默认值。', implemented: true },
  { id: 'quotation', label: '报价单设置', group: '单据专属设置', description: '报价有效期、修订和客户确认规则。', implemented: true },
  { id: 'sales_order', label: '销售订单设置', group: '单据专属设置', description: '订单确认、锁定、履行和取消规则。', implemented: true },
];

const productSections: Section[] = [
  { id: 'categories', label: '分类与产品线', group: '产品基础设置', description: '维护多级产品分类，创建产品时直接选择。', implemented: true },
  { id: 'attributes', label: '规格属性', group: '规格与属性', description: '定义可复用属性及变体生成方式。', implemented: true },
  { id: 'templates', label: '规格模板', group: '规格与属性', description: '按产品分类组合属性模板。', implemented: true },
  { id: 'variants', label: '产品变体规则', group: '规格与属性', description: '维护变体组合与 SKU 生成规则。', implemented: true },
  { id: 'certifications', label: '认证类型', group: '规格与属性', description: '维护 CE、FCC、RoHS 等认证字典。', implemented: true },
  { id: 'units', label: '计量单位与换算', group: '计量与包装', description: '维护基本单位、销售单位、采购单位和换算关系。', implemented: true },
  { id: 'packaging', label: '包装层级', group: '计量与包装', description: '维护内盒、外箱、托盘和装柜规则。', implemented: true },
  { id: 'customs', label: '贸易与报关', group: '贸易与报关', description: '维护 HS 编码、申报要素、税率及监管条件。', implemented: true },
  { id: 'sales', label: '销售与采购', group: '销售与采购', description: '维护币种、税务分类、MOQ、交期和保修规则。', implemented: true },
  { id: 'files', label: '文件与多语言', group: '文件与多语言', description: '维护附件类型、支持语言和翻译字段规则。', implemented: true },
  { id: 'data-rules', label: '产品数据规则', group: '数据规则', description: '维护 SKU 编码、查重、审批及导入导出规则。', implemented: true },
];

const displayTypes = [{ value: 'select', label: '下拉选择' }, { value: 'radio', label: '单选按钮' }, { value: 'color', label: '颜色选择' }, { value: 'multi', label: '多选' }];
const variantModes = [{ value: 'never', label: '不生成变体' }, { value: 'dynamic', label: '按需生成' }, { value: 'always', label: '始终生成' }];

export function SettingsCenterPage() {
  const [domain, setDomain] = useState('products');
  const [section, setSection] = useState('categories');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [attributeValueName, setAttributeValueName] = useState('');
  const [attributeValueAttribute, setAttributeValueAttribute] = useState('');
  const [attributeValueColor, setAttributeValueColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryParent, setCategoryParent] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [editingAttributeId, setEditingAttributeId] = useState<string | null>(null);
  const [displayType, setDisplayType] = useState('select');
  const [variantMode, setVariantMode] = useState('never');

  const activeSections: Section[] = domain === 'integrations' ? integrationSections : domain === 'agent' ? agentSections : domain === 'trade-operations' ? tradeOperationsSections : domain === 'trade-documents' ? tradeDocumentSections : domain === 'opportunities' ? opportunitySettingSections : domain === 'contacts' || domain === 'accounts' || domain === 'leads' ? crmSettingSections[domain as CrmSettingsDomain] : productSections;
  const connectedCount = activeSections.filter(item => item.integration === 'connected' || item.implemented === true).length;
  const configOnlyCount = activeSections.filter(item => item.integration === 'config-only').length;
  const activeSection = activeSections.find((item) => item.id === section) ?? activeSections[0];
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const db = await getSupabaseClient();
      const [categoryResult, attributeResult, valueResult] = await Promise.all([
        db.from('trade_product_categories').select('id,name,parent_id,code,description,sequence,is_active').order('sequence').order('name'),
        db.from('trade_product_attributes').select('id,name,display_type,create_variant,sequence,is_active').order('sequence').order('name'),
        db.from('trade_product_attribute_values').select('id,attribute_id,name,html_color,sequence,is_active').order('sequence').order('name'),
      ]);
      if (categoryResult.error) throw categoryResult.error;
      if (attributeResult.error) throw attributeResult.error;
      if (valueResult.error) throw valueResult.error;
      setCategories((categoryResult.data ?? []) as Category[]);
      setAttributes((attributeResult.data ?? []) as Attribute[]);
      setAttributeValues((valueResult.data ?? []) as AttributeValue[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredCategories = useMemo(() => categories.filter((item) => [item.name, item.code].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [categories, query]);
  const filteredAttributes = useMemo(() => attributes.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [attributes, query]);
  const parentOptions = useMemo(() => categories.filter((item) => item.is_active), [categories]);

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data: session } = await db.auth.getSession();
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const payload = { name: categoryName.trim(), code: categoryCode.trim() || null, parent_id: categoryParent || null };
      const result = editingCategoryId
        ? await db.from('trade_product_categories').update(payload).eq('id', editingCategoryId).select('id,name,parent_id,code,description,sequence,is_active').single()
        : await db.from('trade_product_categories').insert({ ...payload, owner_id: ownerId, sequence: (categories.length + 1) * 10, is_active: true }).select('id,name,parent_id,code,description,sequence,is_active').single();
      if (result.error) throw result.error;
      setCategories((items) => editingCategoryId ? items.map((item) => item.id === editingCategoryId ? result.data as Category : item) : [...items, result.data as Category]);
      setCategoryName(''); setCategoryCode(''); setCategoryParent(''); setEditingCategoryId(null);
      setNotice('产品分类已保存；现在可以在创建产品时直接选择。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建产品分类失败');
    } finally { setSaving(false); }
  };

  const toggleCategory = async (item: Category) => {
    setError(''); setNotice('');
    const db = await getSupabaseClient();
    const result = await db.from('trade_product_categories').update({ is_active: !item.is_active }).eq('id', item.id);
    if (result.error) { setError(result.error.message); return; }
    setCategories((items) => items.map((row) => row.id === item.id ? { ...row, is_active: !item.is_active } : row));
  };

  const addAttribute = async () => {
    if (!attributeName.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data: session } = await db.auth.getSession();
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const payload = { name: attributeName.trim(), display_type: displayType, create_variant: variantMode };
      const result = editingAttributeId
        ? await db.from('trade_product_attributes').update(payload).eq('id', editingAttributeId).select('id,name,display_type,create_variant,sequence,is_active').single()
        : await db.from('trade_product_attributes').insert({ ...payload, owner_id: ownerId, sequence: (attributes.length + 1) * 10, is_active: true }).select('id,name,display_type,create_variant,sequence,is_active').single();
      if (result.error) throw result.error;
      setAttributes((items) => editingAttributeId ? items.map((item) => item.id === editingAttributeId ? result.data as Attribute : item) : [...items, result.data as Attribute]);
      setAttributeName(''); setEditingAttributeId(null);
      setNotice('规格属性已保存。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建规格属性失败');
    } finally { setSaving(false); }
  };

  const toggleAttribute = async (item: Attribute) => {
    setError(''); setNotice('');
    const db = await getSupabaseClient();
    const result = await db.from('trade_product_attributes').update({ is_active: !item.is_active }).eq('id', item.id);
    if (result.error) { setError(result.error.message); return; }
    setAttributes((items) => items.map((row) => row.id === item.id ? { ...row, is_active: !item.is_active } : row));
  };

  const addAttributeValue = async () => {
    if (!attributeValueName.trim() || !attributeValueAttribute) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data: session } = await db.auth.getSession();
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const result = await db.from('trade_product_attribute_values').insert({
        owner_id: ownerId, attribute_id: attributeValueAttribute, name: attributeValueName.trim(),
        html_color: attributeValueColor.trim() || null, sequence: attributeValues.filter((item) => item.attribute_id === attributeValueAttribute).length * 10 + 10, is_active: true,
      }).select('id,attribute_id,name,html_color,sequence,is_active').single();
      if (result.error) throw result.error;
      setAttributeValues((items) => [...items, result.data as AttributeValue]);
      setAttributeValueName(''); setAttributeValueColor('');
      setNotice('规格属性值已创建。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建属性值失败'); }
    finally { setSaving(false); }
  };

  const toggleAttributeValue = async (item: AttributeValue) => {
    setError(''); setNotice('');
    const db = await getSupabaseClient();
    const result = await db.from('trade_product_attribute_values').update({ is_active: !item.is_active }).eq('id', item.id);
    if (result.error) { setError(result.error.message); return; }
    setAttributeValues((items) => items.map((row) => row.id === item.id ? { ...row, is_active: !item.is_active } : row));
  };

  const sectionGroups = [...new Set(activeSections.map((item) => item.group))].map((group) => ({ group, items: activeSections.filter((item) => item.group === group) }));

  return (
    <main className="tp-settings">
      <header className="tp-settings__header">
        <div>
          <p className="tp-settings__eyebrow">TRADEPILOT / CONFIGURATION</p>
          <h1>设置（Setting）</h1>
          <p>统一维护全站业务基础数据与规则；业务页面直接读取并使用这些配置。</p>
        </div>
      </header>

      <div className="tp-settings__layout">
        <aside className="tp-settings__sidebar" aria-label="设置业务域">
          <div className="tp-settings__nav-heading">业务设置</div>
          {domains.map((item) => (
            <Button
              key={item.id}
              kind="ghost"
              size="md"
              className={`tp-settings__domain ${domain === item.id ? 'is-active' : ''}`}
              disabled={!item.available}
              onClick={() => { setDomain(item.id); setSection(item.id === 'integrations' ? 'api' : item.id === 'agent' ? 'models' : item.id === 'trade-documents' || item.id === 'trade-operations' ? 'shared' : item.id === 'opportunities' ? 'stages' : item.id === 'contacts' ? 'salutations' : item.id === 'accounts' ? 'account-types' : item.id === 'leads' ? 'lead-types' : 'categories'); setQuery(''); }}
              aria-pressed={domain === item.id}
            >
              <span className="tp-settings__domain-icon">{item.icon}</span>
              <span className="tp-settings__domain-copy"><strong>{item.label}</strong></span>
              {!item.available && <Tag type="cool-gray">规划中</Tag>}
            </Button>
          ))}
          <div className="tp-settings__nav-divider" />
          <div className="tp-settings__nav-heading">系统设置</div>
          <Button kind="ghost" size="md" className={`tp-settings__domain ${domain === 'integrations' ? 'is-active' : ''}`} onClick={() => { setDomain('integrations'); setSection('api'); setQuery(''); }} aria-pressed={domain === 'integrations'}>
            <span className="tp-settings__domain-icon"><CarbonIcons.Api size={20} /></span>
            <span className="tp-settings__domain-copy"><strong>集成与 API</strong></span>
          </Button>
          <div className="tp-settings__system-item"><CarbonIcons.User size={18} /><span>用户与权限</span><Tag type="cool-gray">后续接入</Tag></div>
          <div className="tp-settings__system-item"><CarbonIcons.Settings size={18} /><span>通用数据</span><Tag type="cool-gray">后续接入</Tag></div>
        </aside>

        <section className="tp-settings__workspace">
          <div className="tp-settings__workspace-heading">
            <div>
              <p className="tp-settings__eyebrow">{domain === 'integrations' ? 'INTEGRATIONS & APIS' : domain === 'agent' ? 'AGENT SETTINGS' : domain === 'trade-operations' ? 'TRADE OPERATIONS SETTINGS' : domain === 'trade-documents' ? 'TRADE DOCUMENT SETTINGS' : domain === 'opportunities' ? 'OPPORTUNITY SETTINGS' : domain === 'contacts' ? 'CONTACT SETTINGS' : domain === 'accounts' ? 'ACCOUNT SETTINGS' : domain === 'leads' ? 'LEAD SETTINGS' : 'PRODUCT SETTINGS'}</p>
              <h2>{domain === 'integrations' ? '集成与 API' : domain === 'agent' ? 'Agent 设置' : domain === 'trade-operations' ? '发运与收款设置' : domain === 'trade-documents' ? '销售单据设置' : domain === 'opportunities' ? '商机设置' : domain === 'contacts' ? '联系人设置' : domain === 'accounts' ? '客户设置' : domain === 'leads' ? '线索设置' : '产品设置'}</h2>
              <p>{domain === 'integrations' ? '统一管理全站 API 凭证与 AI 模型供应商；各业务模块直接调用已保存的集成配置。' : domain === 'agent' ? '集中配置小雅模型、专业 Agent 与头像形象。' : domain === 'trade-operations' ? '集中管理共享基础数据，并分别配置发运与收款业务规则。' : domain === 'trade-documents' ? '统一维护销售单据共性规则，并分别配置报价单与销售订单的专属流程。' : domain === 'opportunities' ? '维护销售流程、商机分类、销售组织、活动与预测规则。' : domain === 'contacts' ? '维护联系人身份、组织、联系方式、沟通偏好、合规与数据规则。' : domain === 'accounts' ? '维护客户主数据、客户分级、地址、交易财务、销售归属与风险规则。' : domain === 'leads' ? '维护线索分类、来源画像、资格评估、分配跟进、查重与转换规则。' : '维护产品主数据字典、模板、包装贸易规则和数据校验策略。'}</p>
            </div>
            {domain === 'trade-operations' ? <div className="tp-settings__workspace-status"><Tag type="green">设置配置已接入 3/3</Tag><Tag type="cool-gray">业务流程联动分阶段接入</Tag></div> : domain === "contacts" || domain === "accounts" || domain === "leads" ? <div className="tp-settings__workspace-status"><Tag type="green">字典已接入 {connectedCount}/{activeSections.length}</Tag><Tag type="cool-gray">规则待接入 {configOnlyCount}</Tag></div> : <Tag type="green">已接入 {activeSections.length} 项</Tag>}
          </div>

          <div className="tp-settings__section-layout">
            <nav className="tp-settings__section-nav" aria-label={domain === 'integrations' ? '集成与 API 设置分类' : domain === 'agent' ? 'Agent 设置分类' : domain === 'trade-operations' ? '发运与收款设置分类' : domain === 'trade-documents' ? '销售单据设置分类' : domain === 'opportunities' ? '商机设置分类' : domain === 'contacts' ? '联系人设置分类' : domain === 'accounts' ? '客户设置分类' : domain === 'leads' ? '线索设置分类' : '产品设置分类'}>
              {sectionGroups.map(({ group, items }) => (
                <div className="tp-settings__section-group" key={group}>
                  <div className="tp-settings__section-label">{group}</div>
                  {items.map((item) => (
                    <Button
                      key={item.id}
                      kind={section === item.id ? 'primary' : 'ghost'}
                      size="sm"
                      className="tp-settings__section-button"
                      onClick={() => { setSection(item.id); setQuery(''); }}
                    >
                      {item.label}
                      {(item.integration === "config-only" || item.integration === "pending" || item.implemented === false) && <span className="tp-settings__planned-dot" aria-label={item.integration === "config-only" ? "仅维护配置，尚未接入业务流程" : "尚未接入"} title={item.integration === "config-only" ? "仅维护配置，尚未接入业务流程" : "尚未接入"} />}
                    </Button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="tp-settings__content">
              <div className="tp-settings__content-head">
                <div><h3>{activeSection.label}</h3><p>{activeSection.description}</p></div>
                {['categories','attributes'].includes(section) && <TextInput id="settings-search" labelText="搜索设置项" hideLabel placeholder="搜索名称或编码" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />}
              </div>

              {error && <InlineNotification kind="error" title="设置操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
              {notice && <InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

              {loading && domain === 'products' && activeSection.implemented ? <InlineLoading description="正在读取设置…" /> : null}

              {section === 'categories' && !loading && (
                <>
                  <div className="tp-settings__editor">
                    <h4>{editingCategoryId ? '编辑产品分类' : '新增产品分类'}</h4>
                    <div className="tp-settings__editor-grid">
                      <TextInput id="setting-category-name" labelText="分类名称" value={categoryName} onChange={(event) => setCategoryName(event.currentTarget.value)} />
                      <TextInput id="setting-category-code" labelText="分类编码（可选）" value={categoryCode} onChange={(event) => setCategoryCode(event.currentTarget.value)} />
                      <Select id="setting-category-parent" labelText="上级分类" value={categoryParent} onChange={(event) => setCategoryParent(event.currentTarget.value)}>
                        <SelectItem value="" text="无上级分类（一级）" />
                        {parentOptions.map((item) => <SelectItem key={item.id} value={item.id} text={item.name} />)}
                      </Select>
                      <Button kind="primary" disabled={saving || !categoryName.trim()} onClick={() => void addCategory()}>{editingCategoryId ? '保存修改' : '新增分类'}</Button>{editingCategoryId && <Button kind="ghost" onClick={() => { setEditingCategoryId(null); setCategoryName(''); setCategoryCode(''); setCategoryParent(''); }}>取消</Button>}
                    </div>
                  </div>
                  <div className="tp-settings__table-wrap">
                    <Table>
                      <TableHead><TableRow><TableHeader>分类名称</TableHeader><TableHeader>编码</TableHeader><TableHeader>上级分类</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
                      <TableBody>{filteredCategories.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.name}</TableCell><TableCell>{item.code || '—'}</TableCell><TableCell>{categories.find((parent) => parent.id === item.parent_id)?.name || '—'}</TableCell>
                          <TableCell><Tag type={item.is_active ? 'green' : 'cool-gray'}>{item.is_active ? '启用' : '停用'}</Tag></TableCell>
                          <TableCell><Button kind="ghost" size="sm" onClick={() => { setEditingCategoryId(item.id); setCategoryName(item.name); setCategoryCode(item.code || ''); setCategoryParent(item.parent_id || ''); }}>编辑</Button><Button kind="ghost" size="sm" onClick={() => void toggleCategory(item)}>{item.is_active ? '停用' : '启用'}</Button></TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                    {!filteredCategories.length && <p className="tp-settings__empty">暂无分类记录。</p>}
                  </div>
                </>
              )}

              {section === 'attributes' && !loading && (
                <>
                  <div className="tp-settings__editor">
                    <h4>{editingAttributeId ? '编辑规格属性' : '新增规格属性'}</h4>
                    <div className="tp-settings__editor-grid tp-settings__editor-grid--attributes">
                      <TextInput id="setting-attribute-name" labelText="属性名称" value={attributeName} onChange={(event) => setAttributeName(event.currentTarget.value)} />
                      <Select id="setting-attribute-display" labelText="展示方式" value={displayType} onChange={(event) => setDisplayType(event.currentTarget.value)}>
                        {displayTypes.map((item) => <SelectItem key={item.value} value={item.value} text={item.label} />)}
                      </Select>
                      <Select id="setting-attribute-variant" labelText="变体生成方式" value={variantMode} onChange={(event) => setVariantMode(event.currentTarget.value)}>
                        {variantModes.map((item) => <SelectItem key={item.value} value={item.value} text={item.label} />)}
                      </Select>
                      <Button kind="primary" disabled={saving || !attributeName.trim()} onClick={() => void addAttribute()}>{editingAttributeId ? '保存修改' : '新增属性'}</Button>{editingAttributeId && <Button kind="ghost" onClick={() => { setEditingAttributeId(null); setAttributeName(''); setDisplayType('select'); setVariantMode('never'); }}>取消</Button>}
                    </div>
                  </div>
                  <div className="tp-settings__table-wrap">
                    <Table>
                      <TableHead><TableRow><TableHeader>属性名称</TableHeader><TableHeader>展示方式</TableHeader><TableHeader>变体规则</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
                      <TableBody>{filteredAttributes.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.name}</TableCell><TableCell>{displayTypes.find((option) => option.value === item.display_type)?.label || item.display_type}</TableCell>
                          <TableCell>{variantModes.find((option) => option.value === item.create_variant)?.label || item.create_variant}</TableCell>
                          <TableCell><Tag type={item.is_active ? 'green' : 'cool-gray'}>{item.is_active ? '启用' : '停用'}</Tag></TableCell>
                          <TableCell><Button kind="ghost" size="sm" onClick={() => { setEditingAttributeId(item.id); setAttributeName(item.name); setDisplayType(item.display_type); setVariantMode(item.create_variant); }}>编辑</Button><Button kind="ghost" size="sm" onClick={() => void toggleAttribute(item)}>{item.is_active ? '停用' : '启用'}</Button></TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                    {!filteredAttributes.length && <p className="tp-settings__empty">暂无规格属性。创建后可在产品规格配置中复用。</p>}
                  </div>
                  <div className="tp-settings__editor">
                    <h4>新增规格属性值</h4>
                    <div className="tp-settings__editor-grid">
                      <Select id="setting-attribute-value-parent" labelText="所属规格属性" value={attributeValueAttribute} onChange={(event) => setAttributeValueAttribute(event.currentTarget.value)}>
                        <SelectItem value="" text="请选择属性" />
                        {attributes.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id} text={item.name} />)}
                      </Select>
                      <TextInput id="setting-attribute-value-name" labelText="属性值" value={attributeValueName} onChange={(event) => setAttributeValueName(event.currentTarget.value)} />
                      <TextInput id="setting-attribute-value-color" labelText="颜色值（可选，如 #FF0000）" value={attributeValueColor} onChange={(event) => setAttributeValueColor(event.currentTarget.value)} />
                      <Button kind="primary" disabled={saving || !attributeValueName.trim() || !attributeValueAttribute} onClick={() => void addAttributeValue()}>新增属性值</Button>
                    </div>
                  </div>
                  <div className="tp-settings__table-wrap">
                    <Table>
                      <TableHead><TableRow><TableHeader>所属属性</TableHeader><TableHeader>属性值</TableHeader><TableHeader>颜色</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
                      <TableBody>{attributeValues.filter((item) => !attributeValueAttribute || item.attribute_id === attributeValueAttribute).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{attributes.find((attribute) => attribute.id === item.attribute_id)?.name || '—'}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.html_color || '—'}</TableCell>
                          <TableCell><Tag type={item.is_active ? 'green' : 'cool-gray'}>{item.is_active ? '启用' : '停用'}</Tag></TableCell>
                          <TableCell><Button kind="ghost" size="sm" onClick={() => void toggleAttributeValue(item)}>{item.is_active ? '停用' : '启用'}</Button></TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                    {!attributeValues.filter((item) => !attributeValueAttribute || item.attribute_id === attributeValueAttribute).length && <p className="tp-settings__empty">该属性暂无可选值。</p>}
                  </div>
                </>
              )}

              {domain === 'integrations' ? <IntegrationsSettings section={section} /> : domain === 'agent' ? <AgentSettings section={section} /> : domain === 'trade-operations' ? <TradeOperationsSettings scope={section as 'shared' | 'shipment' | 'payment'} /> : domain === 'trade-documents' ? <TradeDocumentSettings scope={section as 'shared' | 'quotation' | 'sales_order'} /> : domain === 'opportunities' ? <OpportunitySettings section={section} /> : domain === 'contacts' || domain === 'accounts' || domain === 'leads' ? <CrmDomainSettings domain={domain as CrmSettingsDomain} section={section} /> : !['categories','attributes'].includes(section) && <ProductAdvancedSettings section={section} /> }

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
