import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, TextInput, Tag } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Scope = 'shared' | 'quotation' | 'sales_order';
type Field = { key: string; label: string; initial: string; hint?: string };

const fields: Record<Scope, Field[]> = {
  shared: [
    { key: 'quotePrefix', label: '报价单编号前缀', initial: 'QT' },
    { key: 'quoteDigits', label: '报价单序号位数', initial: '4' },
    { key: 'orderPrefix', label: '销售订单编号前缀', initial: 'SO' },
    { key: 'orderDigits', label: '销售订单序号位数', initial: '4' },
    { key: 'defaultCurrency', label: '默认报价币种', initial: 'USD' },
    { key: 'supportedCurrencies', label: '启用币种（逗号分隔）', initial: 'USD, EUR, GBP, CNY' },
    { key: 'defaultTaxRate', label: '默认税率（%）', initial: '0' },
    { key: 'taxMode', label: '默认税价模式', initial: 'exclusive', hint: 'exclusive = 未税；inclusive = 含税' },
    { key: 'productTaxable', label: '产品默认计税', initial: 'true', hint: 'true / false' },
    { key: 'freightTaxable', label: '运费默认计税', initial: 'false', hint: 'true / false' },
    { key: 'insuranceTaxable', label: '保险费默认计税', initial: 'false', hint: 'true / false' },
    { key: 'otherFeesTaxable', label: '其他费用默认计税', initial: 'false', hint: 'true / false' },
    { key: 'maxLineDiscount', label: '产品最大折扣（%）', initial: '30' },
    { key: 'maxDocumentDiscount', label: '整单最大折扣（%）', initial: '20' },
    { key: 'defaultIncoterm', label: '默认贸易术语', initial: 'FOB' },
    { key: 'incotermVersion', label: '贸易术语版本', initial: 'Incoterms 2020' },
    { key: 'defaultPaymentTerms', label: '默认付款条款', initial: '30% deposit, 70% before shipment' },
    { key: 'feeItems', label: '默认费用项目（逗号分隔）', initial: 'Freight, Insurance, Packaging, Other' },
  ],
  quotation: [
    { key: 'validityDays', label: '默认报价有效期（天）', initial: '30' },
    { key: 'validityStart', label: '有效期起算点', initial: 'issued_at', hint: 'issued_at = 发送/签发日期；created_at = 创建日期' },
    { key: 'allowOnlineAcceptance', label: '允许客户在线接受整份报价', initial: 'false', hint: 'true / false；当前在线接受流程仍需独立接通' },
    { key: 'publicLinkDays', label: '客户访问链接有效期（天）', initial: '7' },
    { key: 'allowRevision', label: '允许创建报价修订版本', initial: 'true', hint: '已发送报价的商业信息变更应创建新版本' },
    { key: 'requireRejectionReason', label: '客户拒绝时要求填写原因', initial: 'true', hint: 'true / false' },
  ],
  sales_order: [
    { key: 'requireApproval', label: '订单确认前需要审批', initial: 'false', hint: 'true / false' },
    { key: 'lockCommercialOnConfirm', label: '确认后锁定商业信息', initial: 'true', hint: 'true / false' },
    { key: 'allowCancelAfterConfirm', label: '确认后允许取消订单', initial: 'false', hint: 'true / false；仍需记录取消原因' },
    { key: 'defaultFulfillmentStatus', label: '订单创建后的默认履行状态', initial: 'pending' },
    { key: 'requireDeliveryDate', label: '订单是否要求交付日期', initial: 'false', hint: 'true / false' },
    { key: 'allowPartialShipment', label: '允许分批发货', initial: 'true', hint: 'true / false' },
  ],
};

const scopeMeta: Record<Scope, { title: string; description: string }> = {
  shared: { title: '销售单据通用设置', description: '报价单与销售订单共用的编号机制、币种、税务、折扣、费用、贸易和付款默认值。编号序列仍按单据类型独立运行。' },
  quotation: { title: '报价单专属设置', description: '只管理报价生命周期和客户确认规则；币种、税务、折扣、费用等共性规则从通用设置继承。' },
  sales_order: { title: '销售订单专属设置', description: '只管理订单确认、锁定、履行和取消规则；商业条件从来源报价或通用设置继承。' },
};

export function TradeDocumentSettings({ scope }: { scope: Scope }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentFields = useMemo(() => fields[scope], [scope]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const db = await getSupabaseClient();
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const ownerId = sessionData.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const { data, error: readError } = await db.from('trade_document_settings').select('config').eq('owner_id', ownerId).eq('scope_key', scope).maybeSingle();
      if (readError) throw readError;
      const defaults = Object.fromEntries(currentFields.map((field) => [field.key, field.initial]));
      setValues({ ...defaults, ...((data?.config ?? {}) as Record<string, string>) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取销售单据设置失败');
    } finally {
      setLoading(false);
    }
  }, [scope, currentFields]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const db = await getSupabaseClient();
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const ownerId = sessionData.session?.user.id;
      if (!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const { error: saveError } = await db.from('trade_document_settings').upsert(
        { owner_id: ownerId, scope_key: scope, config: values },
        { onConflict: 'owner_id,scope_key' },
      );
      if (saveError) throw saveError;
      setNotice('设置已保存。现有报价单和销售订单不会被追溯修改。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存销售单据设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tp-settings__advanced tp-trade-document-settings">
      <div className="tp-trade-document-settings__intro">
        <div><h4>{scopeMeta[scope].title}</h4><p>{scopeMeta[scope].description}</p></div>
        <Tag type="blue">{scope === 'shared' ? '共享规则' : '单据专属'}</Tag>
      </div>
      {error && <InlineNotification kind="error" title="设置操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      {loading ? <InlineLoading description="正在读取销售单据设置…" /> : (
        <>
          <div className="tp-trade-document-settings__grid">
            {currentFields.map((field) => (
              <div className="tp-trade-document-settings__field" key={field.key}>
                <TextInput
                  id={`trade-setting-${scope}-${field.key}`}
                  labelText={field.label}
                  value={values[field.key] ?? field.initial}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))}
                />
                {field.hint && <p className="tp-settings__hint">{field.hint}</p>}
              </div>
            ))}
          </div>
          <div className="tp-trade-document-settings__footer">
            <p className="tp-settings__hint">保存只更新默认规则。已创建单据继续使用创建时保存的快照。</p>
            <Button kind="primary" disabled={saving} onClick={() => void save()}>{saving ? '正在保存…' : '保存设置'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
