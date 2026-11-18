import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, TextInput, Select, SelectItem, Tag, Table, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Scope = 'shared' | 'quotation' | 'sales_order';
type HistoryRow = { id: string; old_config: Record<string, unknown>; new_config: Record<string, unknown>; created_at: string };
type Field = { key: string; label: string; initial: string; hint?: string; type?: 'text' | 'number' | 'boolean' | 'select'; options?: Array<{ value: string; label: string }> };

const fields: Record<Scope, Field[]> = {
  shared: [
    { key: 'quotePrefix', label: '报价单编号前缀', initial: 'QT' },
    { key: 'quoteDigits', label: '报价单序号位数', initial: '4', type: 'number' },
    { key: 'orderPrefix', label: '销售订单编号前缀', initial: 'SO' },
    { key: 'orderDigits', label: '销售订单序号位数', initial: '4', type: 'number' },
    { key: 'defaultCurrency', label: '默认报价币种', initial: 'USD' },
    { key: 'supportedCurrencies', label: '启用币种（逗号分隔）', initial: 'USD, EUR, GBP, CNY' },
    { key: 'defaultTaxRate', label: '默认税率（%）', initial: '0', type: 'number' },
    { key: 'taxMode', label: '默认税价模式', initial: 'exclusive', type: 'select', options: [{ value: 'exclusive', label: '未税' }, { value: 'inclusive', label: '含税' }] },
    { key: 'productTaxable', label: '产品默认计税', initial: 'true', type: 'boolean' },
    { key: 'freightTaxable', label: '运费默认计税', initial: 'false', type: 'boolean' },
    { key: 'insuranceTaxable', label: '保险费默认计税', initial: 'false', type: 'boolean' },
    { key: 'otherFeesTaxable', label: '其他费用默认计税', initial: 'false', type: 'boolean' },
    { key: 'maxLineDiscount', label: '产品最大折扣（%）', initial: '30', type: 'number' },
    { key: 'maxDocumentDiscount', label: '整单最大折扣（%）', initial: '20', type: 'number' },
    { key: 'defaultIncoterm', label: '默认贸易术语', initial: 'FOB' },
    { key: 'incotermVersion', label: '贸易术语版本', initial: 'Incoterms 2020' },
    { key: 'defaultPaymentTerms', label: '默认付款条款', initial: '30% deposit, 70% before shipment' },
    { key: 'feeItems', label: '默认费用项目（逗号分隔）', initial: 'Freight, Insurance, Packaging, Other' },
  ],
  quotation: [
    { key: 'validityDays', label: '默认报价有效期（天）', initial: '30', type: 'number' },
    { key: 'validityStart', label: '有效期起算点', initial: 'issued_at', hint: 'issued_at = 发送/签发日期；created_at = 创建日期' },
    { key: 'allowOnlineAcceptance', label: '允许客户在线接受整份报价', initial: 'false', type: 'boolean', hint: '在线接受流程接通后生效' },
    { key: 'publicLinkDays', label: '客户访问链接有效期（天）', initial: '7', type: 'number' },
    { key: 'allowRevision', label: '允许创建报价修订版本', initial: 'true', type: 'boolean', hint: '已发送报价的商业信息变更应创建新版本' },
    { key: 'requireRejectionReason', label: '客户拒绝时要求填写原因', initial: 'true', type: 'boolean' },
  ],
  sales_order: [
    { key: 'requireApproval', label: '订单确认前需要审批', initial: 'false', type: 'boolean' },
    { key: 'lockCommercialOnConfirm', label: '确认后锁定商业信息', initial: 'true', type: 'boolean' },
    { key: 'allowCancelAfterConfirm', label: '确认后允许取消订单', initial: 'false', type: 'boolean', hint: '仍需记录取消原因' },
    { key: 'defaultFulfillmentStatus', label: '订单创建后的默认履行状态', initial: 'pending' },
    { key: 'requireDeliveryDate', label: '订单是否要求交付日期', initial: 'false', type: 'boolean' },
    { key: 'allowPartialShipment', label: '允许分批发货', initial: 'true', type: 'boolean' },
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
  const [history, setHistory] = useState<HistoryRow[]>([]);

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
      const [settingsResult, historyResult] = await Promise.all([
        db.from('trade_document_settings').select('config').eq('owner_id', ownerId).eq('scope_key', scope).maybeSingle(),
        db.from('trade_document_settings_history').select('id,old_config,new_config,created_at').eq('owner_id', ownerId).eq('scope_key', scope).order('created_at', { ascending: false }).limit(10),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (historyResult.error) throw historyResult.error;
      const defaults = Object.fromEntries(currentFields.map((field) => [field.key, field.initial]));
      setValues({ ...defaults, ...((settingsResult.data?.config ?? {}) as Record<string, string>) });
      setHistory((historyResult.data ?? []) as HistoryRow[]);
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
      const { data: historyData, error: historyError } = await db.from('trade_document_settings_history').select('id,old_config,new_config,created_at').eq('owner_id', ownerId).eq('scope_key', scope).order('created_at', { ascending: false }).limit(10);
      if (historyError) throw historyError;
      setHistory((historyData ?? []) as HistoryRow[]);
      setNotice('设置已保存。变更已记录；现有报价单和销售订单不会被追溯修改。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存销售单据设置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton variant="form" />;
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
                {field.type === 'boolean' ? (
                  <Select id={`trade-setting-${scope}-${field.key}`} labelText={field.label} value={values[field.key] ?? field.initial} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))}>
                    <SelectItem value="true" text="启用" />
                    <SelectItem value="false" text="停用" />
                  </Select>
                ) : field.type === 'select' ? (
                  <Select id={`trade-setting-${scope}-${field.key}`} labelText={field.label} value={values[field.key] ?? field.initial} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))}>
                    {(field.options ?? []).map((option) => <SelectItem key={option.value} value={option.value} text={option.label} />)}
                  </Select>
                ) : (
                  <TextInput id={`trade-setting-${scope}-${field.key}`} labelText={field.label} type={field.type === 'number' ? 'number' : 'text'} value={values[field.key] ?? field.initial} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))} />
                )}
                {field.hint && <p className="tp-settings__hint">{field.hint}</p>}
              </div>
            ))}
          </div>
          <div className="tp-trade-document-settings__footer">
            <p className="tp-settings__hint">保存只更新默认规则。已创建单据继续使用创建时保存的快照。</p>
            {saving && <InlineLoading status="active" description="正在保存…" />}<Button kind="primary" disabled={saving} onClick={() => void save()}>保存设置</Button>
          </div>
          <section className="tp-trade-document-settings__history">
            <div><h4>最近设置变更</h4><p className="tp-settings__hint">保留最近 10 次变更，包含修改前后的配置快照。</p></div>
            {history.length ? (
              <Table>
                <TableHead><TableRow><TableHeader>变更时间</TableHeader><TableHeader>变更项目</TableHeader></TableRow></TableHead>
                <TableBody>{history.map((row) => {
                  const keys = Array.from(new Set([...Object.keys(row.old_config || {}), ...Object.keys(row.new_config || {})])).filter((key) => JSON.stringify(row.old_config?.[key]) !== JSON.stringify(row.new_config?.[key]));
                  return <TableRow key={row.id}><TableCell>{new Date(row.created_at).toLocaleString()}</TableCell><TableCell>{keys.length ? keys.join('、') : '首次保存配置'}</TableCell></TableRow>;
                })}</TableBody>
              </Table>
            ) : <p className="tp-settings__hint">暂无变更记录。</p>}
          </section>
        </>
      )}
    </div>
  );
}
