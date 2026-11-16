import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Source = 'blank' | 'sales_order' | 'purchase_order' | 'shipment';
type DocumentPolicy = {
  enabled: boolean;
  allowedSources: Source[];
  allowBlankCreation: boolean;
  requireOrderOnConfirmation: boolean;
  requireLockedOrderWhenOrderLinked: boolean;
  requireShipmentWhenOrderLinked: boolean;
  allowStandaloneConfirmation: boolean;
  requireReview: boolean;
  requiredFields: string[];
};
type Config = Record<string, unknown> & { documentTypes?: Record<string, Partial<DocumentPolicy>> };

const definitions = [
  { id: 'quotation', label: '报价单', sources: ['blank','sales_order'] as Source[] },
  { id: 'request_for_quotation', label: '采购询价单', sources: ['blank','purchase_order'] as Source[] },
  { id: 'proforma_invoice', label: '形式发票（PI）', sources: ['blank','sales_order'] as Source[] },
  { id: 'sales_contract', label: '销售合同', sources: ['blank','sales_order'] as Source[] },
  { id: 'sales_confirmation', label: '销售订单确认书', sources: ['blank','sales_order'] as Source[] },
  { id: 'purchase_order', label: '采购订单（PO）', sources: ['blank','purchase_order'] as Source[] },
  { id: 'purchase_confirmation', label: '采购订单确认书', sources: ['blank','purchase_order'] as Source[] },
  { id: 'tax_invoice', label: '税务发票', sources: ['blank','sales_order'] as Source[] },
  { id: 'credit_note', label: '贷项通知单', sources: ['blank','sales_order'] as Source[] },
  { id: 'debit_note', label: '借项通知单', sources: ['blank','sales_order'] as Source[] },
  { id: 'commercial_invoice', label: '商业发票', sources: ['blank','sales_order','shipment'] as Source[] },
  { id: 'packing_list', label: '装箱单', sources: ['blank','sales_order','shipment'] as Source[] },
  { id: 'shipping_instructions', label: '装运指示', sources: ['blank','sales_order','shipment'] as Source[] },
  { id: 'shipper_letter_instruction', label: '托运人指示书', sources: ['blank','sales_order','shipment'] as Source[] },
  { id: 'vgm_declaration', label: 'VGM 声明', sources: ['sales_order','shipment'] as Source[] },
  { id: 'packing_declaration', label: '包装声明', sources: ['sales_order','shipment'] as Source[] },
  { id: 'origin_declaration', label: '原产地声明', sources: ['blank','sales_order'] as Source[] },
  { id: 'origin_certificate_application', label: '原产地证申请资料', sources: ['blank','sales_order'] as Source[] },
  { id: 'non_asbestos_declaration', label: '非石棉声明', sources: ['blank','sales_order'] as Source[] },
  { id: 'bill_of_exchange', label: '汇票', sources: ['blank','sales_order'] as Source[] },
] as const;

const boolOptions = [{ value: 'true', text: '启用' }, { value: 'false', text: '停用' }];
const sourceOptions: { id: Source; label: string }[] = [{ id: 'blank', label: '空白创建' }, { id: 'sales_order', label: '销售订单' }, { id: 'purchase_order', label: '采购订单' }, { id: 'shipment', label: '发运记录' }];
const defaultsFor = (id: string, sources: Source[]): DocumentPolicy => ({
  enabled: true,
  allowedSources: [...sources],
  allowBlankCreation: !['vgm_declaration','packing_declaration'].includes(id),
  requireOrderOnConfirmation: false,
  requireLockedOrderWhenOrderLinked: !['quotation','request_for_quotation','purchase_order','purchase_confirmation'].includes(id),
  requireShipmentWhenOrderLinked: ['commercial_invoice','packing_list','shipping_instructions','shipper_letter_instruction','vgm_declaration','packing_declaration'].includes(id),
  allowStandaloneConfirmation: true,
  requireReview: false,
  requiredFields: ['vgm_declaration'].includes(id) ? ['seller_name','buyer_name','shipment.total_gross_weight'] :
    ['packing_declaration'].includes(id) ? ['seller_name','buyer_name','shipment.total_packages','shipment.total_gross_weight'] :
    ['shipping_instructions','shipper_letter_instruction'].includes(id) ? ['seller_name','buyer_name','buyer_shipping_address'] :
    ['bill_of_exchange'].includes(id) ? ['seller_name','buyer_name','currency_code','totals.grand_total'] :
    ['tax_invoice','credit_note','debit_note'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_address','currency_code','items','totals.grand_total'] :
    ['proforma_invoice','sales_contract','sales_confirmation','purchase_order','purchase_confirmation','commercial_invoice','packing_list','quotation','request_for_quotation','origin_declaration','origin_certificate_application','non_asbestos_declaration'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_address','currency_code','items'] : [],
});
const normalize = (id: string, sources: Source[], value?: Partial<DocumentPolicy>): DocumentPolicy => {
  const base = defaultsFor(id, sources);
  return { ...base, ...(value ?? {}), allowedSources: Array.isArray(value?.allowedSources) ? value.allowedSources.filter((v): v is Source => ['blank','sales_order','purchase_order','shipment'].includes(v)) : base.allowedSources, requiredFields: Array.isArray(value?.requiredFields) ? value.requiredFields : base.requiredFields };
};

export function DocumentTypeSettings() {
  const [config, setConfig] = useState<Config>({});
  const [selectedType, setSelectedType] = useState<string>(definitions[0].id);
  const [policy, setPolicy] = useState<DocumentPolicy>(defaultsFor(definitions[0].id, [...definitions[0].sources]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(() => definitions.find(item => item.id === selectedType) ?? definitions[0], [selectedType]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const { data: session, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const { data, error: queryError } = await db.from('trade_document_settings').select('config').eq('owner_id', ownerId).eq('owner_id', ownerId).eq('scope_key', 'shared').maybeSingle();
      if (queryError) throw queryError;
      const next = (data?.config ?? {}) as Config;
      setConfig(next);
      const first = definitions[0];
      setPolicy(normalize(first.id, [...first.sources], next.documentTypes?.[first.id]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取单据类型配置失败。'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const item = definitions.find(value => value.id === selectedType) ?? definitions[0];
    setPolicy(normalize(item.id, [...item.sources], config.documentTypes?.[item.id]));
  }, [selectedType, config]);

  const update = <K extends keyof DocumentPolicy>(key: K, value: DocumentPolicy[K]) => setPolicy(current => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data: session, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const next: Config = { ...config, documentTypes: { ...(config.documentTypes ?? {}), [selectedType]: policy } };
      const { error: saveError } = await db.from('trade_document_settings').upsert({ owner_id: ownerId, scope_key: 'shared', config: next }, { onConflict: 'owner_id,scope_key' });
      if (saveError) throw saveError;
      setConfig(next);
      setNotice(selected.label + '配置已保存。新建单据将采用这套规则，已有单据保留原快照。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存单据类型配置失败。'); }
    finally { setSaving(false); }
  };

  return <section className="tp-settings__advanced tp-document-type-settings">
    <div className="tp-trade-document-settings__intro">
      <div><h4>单据类型独立规则</h4><p>每种单据分别控制可用来源、空白创建、订单锁定和正式确认要求。规则由后端执行，不只是前端显示设置。</p></div>
      <Tag type="blue">逐单据配置</Tag>
    </div>
    {error && <InlineNotification kind="error" title="配置操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {notice && <InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
    {loading ? <InlineLoading description="正在读取单据配置…" /> : <>
      <div className="tp-document-type-settings__editor">
        <Select id="tp-document-type-config" labelText="选择单据类型" value={selectedType} onChange={event => setSelectedType(event.currentTarget.value)}>
          {definitions.map(item => <SelectItem key={item.id} value={item.id} text={item.label} />)}
        </Select>
        <Select id="tp-document-type-enabled" labelText="单据类型状态" value={String(policy.enabled)} onChange={event => update('enabled', event.currentTarget.value === 'true')}>
          {boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}
        </Select>
      </div>
      <div className="tp-document-type-settings__grid">
        <div><h5>允许的数据来源</h5><div className="tp-document-type-settings__sources">{sourceOptions.map(option => <Checkbox key={option.id} id={'tp-document-source-' + option.id} labelText={option.label} checked={policy.allowedSources.includes(option.id)} onChange={(_, data) => update('allowedSources', data.checked ? [...new Set([...policy.allowedSources, option.id])] : policy.allowedSources.filter(value => value !== option.id))} />)}</div></div>
        <div><h5>空白创建</h5><Select id="tp-document-blank" labelText="是否允许不关联订单创建草稿" value={String(policy.allowBlankCreation)} onChange={event => update('allowBlankCreation', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>正式确认规则</h5><Select id="tp-document-order-required" labelText="正式确认时是否必须关联订单" value={String(policy.requireOrderOnConfirmation)} onChange={event => update('requireOrderOnConfirmation', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>订单来源校验</h5><Select id="tp-document-lock-required" labelText="关联订单时是否要求成交快照已锁定" value={String(policy.requireLockedOrderWhenOrderLinked)} onChange={event => update('requireLockedOrderWhenOrderLinked', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>发运来源校验</h5><Select id="tp-document-shipment-required" labelText="订单来源是否必须关联实际发运批次" value={String(policy.requireShipmentWhenOrderLinked)} onChange={event => update('requireShipmentWhenOrderLinked', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>独立正式确认</h5><Select id="tp-document-standalone-confirm" labelText="无订单时是否允许正式确认" value={String(policy.allowStandaloneConfirmation)} onChange={event => update('allowStandaloneConfirmation', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>审核流程</h5><Select id="tp-document-review" labelText="正式确认前是否需要审核" value={String(policy.requireReview)} onChange={event => update('requireReview', event.currentTarget.value === 'true')}>{boolOptions.map(item => <SelectItem key={item.value} value={item.value} text={item.text} />)}</Select></div>
        <div><h5>正式确认必填字段</h5><TextInput id="tp-document-required-fields" labelText="字段键（逗号分隔）" value={policy.requiredFields.join(', ')} onChange={event => update('requiredFields', event.currentTarget.value.split(',').map(value => value.trim()).filter(Boolean))} /></div>
      </div>
      <div className="tp-document-type-settings__footer"><p>空白草稿是否允许保存，与正式确认要求分开判断。修改配置不会追溯改变已生成单据。</p><Button kind="primary" disabled={saving} onClick={() => void save()}>{saving ? '正在保存…' : '保存当前单据配置'}</Button></div>
    </>}
  </section>;
}
