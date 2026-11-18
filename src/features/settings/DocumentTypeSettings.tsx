import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag } from '@/design-system';
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
  requiredOnDraftFields?: string[];
  editableFields?: string[];
};
type Config = Record<string, unknown> & { documentTypes?: Record<string, Partial<DocumentPolicy>> };
type HistoryRow = { id: string; created_at: string; old_config: Config; new_config: Config };

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
const fieldOptions = [
  { id: 'seller_name', label: '卖方名称' }, { id: 'seller_address', label: '卖方地址' },
  { id: 'buyer_name', label: '买方名称' }, { id: 'buyer_address', label: '买方开票地址' },
  { id: 'buyer_shipping_address', label: '买方收货地址' }, { id: 'contact_name', label: '联系人' },
  { id: 'contact_email', label: '联系人邮箱' }, { id: 'contact_phone', label: '联系人电话' },
  { id: 'currency_code', label: '币种' }, { id: 'items', label: '货物明细' },
  { id: 'totals.grand_total', label: '单据总金额' }, { id: 'payment_terms', label: '付款条件' },
  { id: 'incoterms_code', label: '贸易术语' }, { id: 'named_place', label: '贸易术语指定地点' },
  { id: 'delivery_date', label: '交付日期' }, { id: 'shipment.total_packages', label: '发运总箱数' },
  { id: 'shipment.total_gross_weight', label: '发运毛重' }, { id: 'shipment.total_net_weight', label: '发运净重' },
];
const editableFieldOptions = [
  { id: 'seller_name', label: '卖方名称' }, { id: 'seller_address', label: '卖方地址' },
  { id: 'buyer_name', label: '买方名称' }, { id: 'buyer_address', label: '买方开票地址' },
  { id: 'buyer_shipping_address', label: '买方收货地址' }, { id: 'contact_name', label: '联系人' },
  { id: 'contact_email', label: '联系人邮箱' }, { id: 'contact_phone', label: '联系人电话' },
  { id: 'notes', label: '单据备注' }, { id: 'items', label: '货物明细（仅空白单据）' },
  { id: 'customer_reference', label: '客户参考号' }, { id: 'payment_terms', label: '付款条件' },
  { id: 'incoterms_code', label: '贸易术语' }, { id: 'named_place', label: '指定地点' },
  { id: 'delivery_date', label: '交付日期' },
];

const sourceOptions: { id: Source; label: string }[] = [{ id: 'blank', label: '空白创建' }, { id: 'sales_order', label: '销售订单' }, { id: 'purchase_order', label: '采购订单' }, { id: 'shipment', label: '发运记录' }];
const defaultsFor = (id: string, sources: Source[]): DocumentPolicy => ({
  enabled: true,
  allowedSources: [...sources],
  allowBlankCreation: !['vgm_declaration','packing_declaration'].includes(id),
  requireOrderOnConfirmation: false,
  requireLockedOrderWhenOrderLinked: !['quotation','request_for_quotation','purchase_order','purchase_confirmation'].includes(id),
  requireShipmentWhenOrderLinked: ['commercial_invoice','packing_list','shipping_instructions','shipper_letter_instruction','vgm_declaration','packing_declaration'].includes(id),
  allowStandaloneConfirmation: !['vgm_declaration','packing_declaration'].includes(id),
  requireReview: false,
  editableFields: ['seller_name','seller_address','buyer_name','buyer_address','buyer_shipping_address','contact_name','contact_email','contact_phone','notes','customer_reference','items'],
  requiredOnDraftFields: [],
  requiredFields: ['vgm_declaration'].includes(id) ? ['seller_name','buyer_name','shipment.total_gross_weight'] :
    ['packing_declaration'].includes(id) ? ['seller_name','buyer_name','shipment.total_packages','shipment.total_gross_weight'] :
    ['packing_list'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_shipping_address','items','shipment.total_packages','shipment.total_gross_weight','shipment.total_net_weight'] :
    ['shipping_instructions','shipper_letter_instruction'].includes(id) ? ['seller_name','buyer_name','buyer_shipping_address'] :
    ['bill_of_exchange'].includes(id) ? ['seller_name','buyer_name','currency_code','totals.grand_total'] :
    ['tax_invoice','credit_note','debit_note','commercial_invoice'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_address','currency_code','items','totals.grand_total'] :
    ['proforma_invoice','sales_contract','sales_confirmation','purchase_order','purchase_confirmation','quotation','request_for_quotation'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_address','currency_code','items','totals.grand_total'] :
    ['origin_declaration','origin_certificate_application','non_asbestos_declaration'].includes(id) ? ['seller_name','seller_address','buyer_name','buyer_address','items'] : [],
});
const normalize = (id: string, sources: Source[], value?: Partial<DocumentPolicy>): DocumentPolicy => {
  const base = defaultsFor(id, sources);
  return { ...base, ...(value ?? {}), allowedSources: Array.isArray(value?.allowedSources) ? value.allowedSources.filter((v): v is Source => ['blank','sales_order','purchase_order','shipment'].includes(v)) : base.allowedSources, requiredFields: Array.isArray(value?.requiredFields) ? value.requiredFields : base.requiredFields, requiredOnDraftFields: Array.isArray(value?.requiredOnDraftFields) ? value.requiredOnDraftFields : base.requiredOnDraftFields, editableFields: Array.isArray(value?.editableFields) ? value.editableFields : base.editableFields };
};

export function DocumentTypeSettings() {
  const [config, setConfig] = useState<Config>({});
  const [selectedType, setSelectedType] = useState<string>(definitions[0].id);
  const [policy, setPolicy] = useState<DocumentPolicy>(defaultsFor(definitions[0].id, [...definitions[0].sources]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const selected = useMemo(() => definitions.find(item => item.id === selectedType) ?? definitions[0], [selectedType]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const { data: session, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const ownerId = session.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const [settingsResult, historyResult] = await Promise.all([
        db.from('trade_document_settings').select('config').eq('owner_id', ownerId).eq('scope_key', 'shared').maybeSingle(),
        db.from('trade_document_settings_history').select('id,created_at,old_config,new_config').eq('owner_id', ownerId).eq('scope_key', 'shared').order('created_at', { ascending: false }).limit(8),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (historyResult.error) throw historyResult.error;
      const next = (settingsResult.data?.config ?? {}) as Config;
      setHistory((historyResult.data ?? []) as unknown as HistoryRow[]);
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
      const { data: historyRows, error: historyError } = await db.from('trade_document_settings_history').select('id,created_at,old_config,new_config').eq('owner_id', ownerId).eq('scope_key', 'shared').order('created_at', { ascending: false }).limit(8);
      if (historyError) throw historyError;
      setHistory((historyRows ?? []) as unknown as HistoryRow[]);
      setNotice(selected.label + '配置已保存。新建单据将采用这套规则，已有单据保留原快照。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存单据类型配置失败。'); }
    finally { setSaving(false); }
  };

  if (loading) return <PageSkeleton variant="table" />;
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
        <div className="tp-document-type-settings__field-group"><h5>正式确认必填字段</h5><p>勾选后，后端会在正式确认时逐项校验；空白草稿仍可先保存。</p><div className="tp-document-type-settings__field-options">{fieldOptions.map(option=><Checkbox key={option.id} id={'tp-document-required-'+option.id.replaceAll('.','-')} labelText={option.label} checked={policy.requiredFields.includes(option.id)} onChange={(_,data)=>update('requiredFields',data.checked?[...new Set([...policy.requiredFields,option.id])]:policy.requiredFields.filter(value=>value!==option.id))}/>)}</div></div>
        <div className="tp-document-type-settings__field-group"><h5>草稿保存时必填字段（可选）</h5><p>仅在此处勾选的字段会在保存草稿时校验，不影响未配置的草稿。</p><div className="tp-document-type-settings__field-options">{fieldOptions.filter(option=>!option.id.startsWith('shipment.')).map(option=><Checkbox key={option.id} id={'tp-document-draft-required-'+option.id.replaceAll('.','-')} labelText={option.label} checked={(policy.requiredOnDraftFields??[]).includes(option.id)} onChange={(_,data)=>update('requiredOnDraftFields',data.checked?[...new Set([...(policy.requiredOnDraftFields??[]),option.id])]: (policy.requiredOnDraftFields??[]).filter(value=>value!==option.id))}/>)}</div></div>
        <div className="tp-document-type-settings__field-group"><h5>草稿允许编辑的字段</h5><p>成交订单中的商品、价格、数量、币种和锁定条款不允许通过单据编辑器修改；空白单据可按配置编辑货物明细。</p><div className="tp-document-type-settings__field-options">{editableFieldOptions.map(option=><Checkbox key={option.id} id={'tp-document-editable-'+option.id} labelText={option.label} checked={(policy.editableFields??[]).includes(option.id)} onChange={(_,data)=>update('editableFields',data.checked?[...new Set([...(policy.editableFields??[]),option.id])]: (policy.editableFields??[]).filter(value=>value!==option.id))}/>)}</div></div>
      </div>
      <div className="tp-document-type-settings__footer"><p>空白草稿是否允许保存，与正式确认要求分开判断。修改配置不会追溯改变已生成单据。</p>{saving && <InlineLoading status="active" description="正在保存…" />}<Button kind="primary" disabled={saving} onClick={() => void save()}>保存当前单据配置</Button></div>
      <section className="tp-document-type-settings__history">
        <h5>配置变更历史</h5>
        {history.length ? <ul>{history.map(row => {
          const before = row.old_config.documentTypes?.[selectedType];
          const after = row.new_config.documentTypes?.[selectedType];
          const changed = JSON.stringify(before) !== JSON.stringify(after);
          return <li key={row.id}><time>{new Date(row.created_at).toLocaleString()}</time><span>{changed ? selected.label + '规则更新' : '其他单据配置更新'}</span></li>;
        })}</ul> : <p>尚无配置变更记录。保存后，后续修改会记录在这里。</p>}
      </section>
    </>}
  </section>;
}
