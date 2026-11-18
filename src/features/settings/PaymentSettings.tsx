import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type SettingItem = { id: string; setting_type: string; code: string; name: string; config: Record<string, unknown>; sequence: number; is_active: boolean };
type HistoryItem = { id: string; source_table: string; operation: string; changed_at: string };
type Config = Record<string, string | number | boolean>;
type Dictionary = { value: string; label: string; seeds: Array<[string, string]> };

const paymentDefaults: Config = {
  default_currency: 'USD',
  default_bank_account_id: '',
  default_payment_method: 'T/T',
  numbering_mode: 'independent',
  approval_mode: 'single',
  require_confirmation_before_posting: true,
  allow_third_party_payment: true,
  require_bank_slip: true,
  require_swift_reference: false,
  default_fee_bearer: 'SHA',
  exchange_rate_source: 'manual',
  fx_gain_loss_method: 'realized_and_unrealized',
  allow_partial_allocation: true,
  allow_unallocated_receipts: true,
  short_payment_action: 'review',
  overpayment_action: 'unallocated',
  fee_tolerance_amount: 5,
  reconciliation_tolerance_amount: 0.01,
  allow_shortfall_writeoff: false,
  require_refund_approval_after_shipment: true,
  require_refund_reason: true,
  default_deposit_percent: 30,
  default_pre_shipment_percent: 60,
  default_balance_percent: 10,
  aging_bucket_1_days: 30,
  aging_bucket_2_days: 60,
  aging_bucket_3_days: 90,
  reminder_first_days: 3,
  reminder_second_days: 7,
  reminder_third_days: 14,
  reminder_escalation_days: 30,
  lc_presentation_days: 21,
  lc_require_commercial_invoice: true,
  lc_require_packing_list: true,
  lc_require_bill_of_lading: true,
  lc_require_insurance_certificate: false,
};

const dictionaries: Dictionary[] = [
  { value: 'payment_method', label: '收款方式', seeds: [['T/T','电汇'],['L/C','信用证'],['D/P','付款交单'],['D/A','承兑交单'],['PayPal','PayPal'],['Western Union','西联汇款'],['cash','现金'],['cheque','支票'],['other','其他']] },
  { value: 'payment_fee_category', label: '手续费类型', seeds: [['bank_fee','银行手续费'],['intermediary_fee','中转行手续费'],['swift_fee','SWIFT费用'],['correspondent_fee','代理行费用'],['handling_fee','汇款处理费']] },
  { value: 'payment_document_type', label: '收款凭证类型', seeds: [['bank_slip','银行水单'],['swift_copy','SWIFT回执'],['lc_copy','信用证副本'],['acceptance_copy','承兑文件'],['remittance_advice','汇款通知'],['refund_proof','退款凭证']] },
  { value: 'payment_difference_type', label: '收款差异类型', seeds: [['bank_fee','银行扣费'],['fx_difference','汇率差异'],['short_payment','短款'],['overpayment','多付款'],['other','其他']] },
];

const selectFields: Array<{ key: string; label: string; options: Array<[string,string]> }> = [
  { key:'default_payment_method', label:'默认收款方式', options:[] },
  { key:'default_fee_bearer', label:'默认手续费承担方', options:[['OUR','付款方承担'],['SHA','双方分摊'],['BEN','收款方承担']] },
  { key:'exchange_rate_source', label:'汇率来源', options:[['manual','手动录入'],['order_snapshot','沿用订单汇率快照']] },
  { key:'fx_gain_loss_method', label:'汇兑损益确认', options:[['realized_only','仅实际到账确认'],['realized_and_unrealized','实际与期末重估']] },
  { key:'short_payment_action', label:'短款处理', options:[['review','进入差异复核'],['writeoff','允许核销差额'],['keep_open','保留未收余额']] },
  { key:'overpayment_action', label:'多付款处理', options:[['unallocated','保留未分配预收'],['refund','发起退款流程'],['review','进入人工复核']] },
];

const toggleFields: Array<[string,string]> = [
  ['require_confirmation_before_posting','到账确认后才允许过账'],
  ['allow_third_party_payment','允许第三方代付'],
  ['require_bank_slip','收款确认必须上传银行水单'],
  ['require_swift_reference','跨境电汇必须填写 SWIFT / UETR'],
  ['allow_partial_allocation','允许部分核销'],
  ['allow_unallocated_receipts','允许保留未分配预收款'],
  ['allow_shortfall_writeoff','允许短款差异核销'],
  ['require_refund_approval_after_shipment','发运后退款必须审批'],
  ['require_refund_reason','退款必须填写原因'],
  ['lc_require_commercial_invoice','信用证要求商业发票'],
  ['lc_require_packing_list','信用证要求装箱单'],
  ['lc_require_bill_of_lading','信用证要求提单'],
  ['lc_require_insurance_certificate','信用证要求保险凭证'],
];

export function PaymentSettings() {
  const [ownerId,setOwnerId] = useState('');
  const [config,setConfig] = useState<Config>(paymentDefaults);
  const [items,setItems] = useState<SettingItem[]>([]);
  const [history,setHistory] = useState<HistoryItem[]>([]);
  const [currencies,setCurrencies] = useState<Array<{code:string;name:string}>>([]);
  const [baseCurrency,setBaseCurrency] = useState('USD');
  const [bankAccounts,setBankAccounts] = useState<Array<{id:string;bank_name:string;account_name:string;currency_code:string|null;is_default:boolean}>>([]);
  const [itemType,setItemType] = useState('payment_method');
  const [itemCode,setItemCode] = useState('');
  const [itemName,setItemName] = useState('');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const db = await getSupabaseClient();
      const {data:session,error:sessionError} = await db.auth.getSession();
      if(sessionError) throw sessionError;
      const userId = session.session?.user.id;
      if(!userId) throw new Error('登录状态已失效，请重新登录。');
      setOwnerId(userId);
      const [settingsResult,itemsResult,historyResult,currencyResult,bankResult,profileResult] = await Promise.all([
        db.from('trade_business_settings').select('config').eq('owner_id',userId).eq('scope_key','payment').maybeSingle(),
        db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key','payment').order('sequence').order('code'),
        db.from('trade_business_setting_history').select('id,source_table,operation,changed_at').eq('owner_id',userId).eq('scope_key','payment').order('changed_at',{ascending:false}).limit(12),
        db.from('trade_business_setting_items').select('code,name').eq('owner_id',userId).eq('scope_key','shared').eq('setting_type','currency').eq('is_active',true).order('sequence'),
        db.from('enterprise_bank_accounts').select('id,bank_name,account_name,currency_code,is_default').eq('owner_id',userId).eq('is_active',true).eq('is_archived',false).order('is_default',{ascending:false}).order('bank_name'),
        db.from('enterprise_profiles').select('default_currency').eq('is_default',true).eq('is_archived',false).maybeSingle(),
      ]);
      if(settingsResult.error) throw settingsResult.error;
      if(itemsResult.error) throw itemsResult.error;
      if(historyResult.error) throw historyResult.error;
      if(currencyResult.error) throw currencyResult.error;
      if(bankResult.error) throw bankResult.error;
      if(profileResult.error) throw profileResult.error;
      let rows = (itemsResult.data||[]) as SettingItem[];
      let seeded = false;
      for(const dictionary of dictionaries) {
        if(!rows.some(x=>x.setting_type===dictionary.value)) {
          const seed = dictionary.seeds.map(([code,name],i)=>({owner_id:userId,scope_key:'payment',setting_type:dictionary.value,code,name,config:{},sequence:(i+1)*10,is_active:true}));
          const {error:seedError} = await db.from('trade_business_setting_items').upsert(seed,{onConflict:'owner_id,scope_key,setting_type,code',ignoreDuplicates:true});
          if(seedError) throw seedError;
          seeded = true;
        }
      }
      if(seeded) {
        const refreshed = await db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key','payment').order('sequence').order('code');
        if(refreshed.error) throw refreshed.error;
        rows = (refreshed.data||[]) as SettingItem[];
      }
      const sharedCurrencies = (currencyResult.data||[]) as Array<{code:string;name:string}>;
      const bankRows = (bankResult.data||[]) as Array<{id:string;bank_name:string;account_name:string;currency_code:string|null;is_default:boolean}>;
      setItems(rows); setHistory((historyResult.data||[]) as HistoryItem[]);
      setCurrencies(sharedCurrencies); setBankAccounts(bankRows);
      const enterpriseCurrency = profileResult.data?.default_currency || 'USD';
      setBaseCurrency(enterpriseCurrency);
      const saved = (settingsResult.data?.config||{}) as Config;
      const defaultBank = bankRows.find(x=>x.is_default)?.id || '';
      setConfig({...paymentDefaults,...saved,default_currency:String(saved.default_currency||enterpriseCurrency),default_bank_account_id:String(saved.default_bank_account_id||defaultBank)});
    } catch(e) { setError(e instanceof Error?e.message:'读取收款设置失败'); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{void load();},[load]);

  const activeMethods = useMemo(()=>items.filter(x=>x.setting_type==='payment_method'&&x.is_active),[items]);
  const visibleItems = items.filter(x=>x.setting_type===itemType);
  const update = (key:string,value:string|number|boolean) => setConfig(current=>({...current,[key]:value}));

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      if(!currencies.some(x=>x.code===config.default_currency)) throw new Error('默认收款币种必须来自共享币种字典。');
      if(!activeMethods.some(x=>x.code===config.default_payment_method)) throw new Error('默认收款方式必须选择已启用的收款方式。');
      if(config.default_bank_account_id && !bankAccounts.some(x=>x.id===config.default_bank_account_id)) throw new Error('默认收款账户必须是企业档案中启用的银行账户。');
      const deposit = Number(config.default_deposit_percent), preShip = Number(config.default_pre_shipment_percent), balance = Number(config.default_balance_percent);
      if(deposit<0||preShip<0||balance<0||Math.abs(deposit+preShip+balance-100)>0.001) throw new Error('默认应收计划比例合计必须等于 100%。');
      if(Number(config.aging_bucket_1_days)>=Number(config.aging_bucket_2_days)||Number(config.aging_bucket_2_days)>=Number(config.aging_bucket_3_days)) throw new Error('账龄区间必须按天数递增。');
      const db = await getSupabaseClient();
      const {error:saveError} = await db.from('trade_business_settings').upsert({
        owner_id:ownerId,scope_key:'payment',config:{...config,numbering_mode:'independent',approval_mode:'single'},
      },{onConflict:'owner_id,scope_key'});
      if(saveError) throw saveError;
      setNotice('收款规则已保存。历史收款记录不受影响；收款业务表单与服务端规则将在下一阶段接入这些配置。');
      await load();
    } catch(e) { setError(e instanceof Error?e.message:'保存收款设置失败'); }
    finally { setSaving(false); }
  };

  const addItem = async () => {
    const code = itemCode.trim().toUpperCase(), name = itemName.trim()||code;
    if(!code) {setError('请填写编码。');return;}
    if(visibleItems.some(x=>x.code===code)) {setError('该编码已存在。');return;}
    setSaving(true); setError(''); setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const db = await getSupabaseClient();
      const {data,error:insertError} = await db.from('trade_business_setting_items').insert({
        owner_id:ownerId,scope_key:'payment',setting_type:itemType,code,name,config:{},sequence:(visibleItems.length+1)*10,is_active:true,
      }).select('id,setting_type,code,name,config,sequence,is_active').single();
      if(insertError) throw insertError;
      setItems(current=>[...current,data as SettingItem]); setItemCode(''); setItemName('');
      setNotice('收款字典项目已新增。');
    } catch(e) {setError(e instanceof Error?e.message:'新增收款字典失败');}
    finally {setSaving(false);}
  };

  const toggleItem = async (item:SettingItem) => {
    if(item.setting_type==='payment_method'&&item.is_active&&config.default_payment_method===item.code) {setError('当前默认收款方式不能停用，请先更换默认方式。');return;}
    setError('');setNotice('');
    const db = await getSupabaseClient();
    const {error:updateError} = await db.from('trade_business_setting_items').update({is_active:!item.is_active}).eq('id',item.id).eq('owner_id',ownerId);
    if(updateError) {setError(updateError.message);return;}
    setItems(current=>current.map(x=>x.id===item.id?{...x,is_active:!item.is_active}:x));
    setNotice('字典状态已更新；停用只影响新业务，历史收款记录保留原值。');
  };

  if(loading) return <div className="tp-settings__advanced"><InlineLoading description="正在读取收款设置…" /></div>;

  if (loading) return <PageSkeleton variant="table" />;
  return <div className="tp-settings__advanced tp-payment-settings">
    {error&&<InlineNotification kind="error" title="收款设置操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {notice&&<InlineNotification kind="success" title="操作成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    <section className="tp-settings__editor">
      <h4>收款基础规则</h4>
      <p className="tp-settings__hint">收款编号独立生成，采用单级审批；银行账户与币种直接引用企业及共享基础设置，不在此重复维护。</p>
      <div className="tp-settings__editor-grid">
        <TextInput id="payment-enterprise-base-currency" labelText="企业本位币（来自企业档案）" value={baseCurrency} readOnly />
        <Select id="payment-default-currency" labelText="默认收款币种" value={String(config.default_currency)} onChange={e=>update('default_currency',e.currentTarget.value)}>{currencies.map(x=><SelectItem key={x.code} value={x.code} text={x.code+' · '+x.name}/>)}</Select>
        <Select id="payment-default-bank" labelText="默认收款账户" value={String(config.default_bank_account_id)} onChange={e=>update('default_bank_account_id',e.currentTarget.value)}><SelectItem value="" text="不设置默认账户"/>{bankAccounts.map(x=><SelectItem key={x.id} value={x.id} text={x.bank_name+' · '+x.account_name+(x.currency_code?' · '+x.currency_code:'')}/>)}</Select>
        <Select id="payment-default-method" labelText="默认收款方式" value={String(config.default_payment_method)} onChange={e=>update('default_payment_method',e.currentTarget.value)}>{activeMethods.map(x=><SelectItem key={x.code} value={x.code} text={x.name+' · '+x.code}/>)}</Select>
        <TextInput id="payment-numbering-mode" labelText="收款编号规则" value="独立编号（independent）" readOnly />
        <TextInput id="payment-approval-mode" labelText="审批机制" value="单级审批（single）" readOnly />
      </div>
      <div className="tp-settings__editor-grid">
        {toggleFields.slice(0,4).map(([key,label])=><Select key={key} id={'payment-'+key} labelText={label} value={String(Boolean(config[key]))} onChange={e=>update(key,e.currentTarget.value==='true')}><SelectItem value="true" text="启用"/><SelectItem value="false" text="停用"/></Select>)}
      </div>
    </section>

    <section className="tp-settings__editor">
      <h4>汇率、手续费与差异处理</h4>
      <p className="tp-settings__hint">企业本位币从企业档案读取；汇率录入和汇兑损益口径在此配置，不重复创建币种或汇率主数据。</p>
      <div className="tp-settings__editor-grid">
        {selectFields.filter(x=>['default_fee_bearer','exchange_rate_source','fx_gain_loss_method','short_payment_action','overpayment_action'].includes(x.key)).map(field=><Select key={field.key} id={'payment-'+field.key} labelText={field.label} value={String(config[field.key])} onChange={e=>update(field.key,e.currentTarget.value)}>{field.options.map(([value,label])=><SelectItem key={value} value={value} text={label}/>)}</Select>)}
        <TextInput id="payment-fee-tolerance" labelText="手续费差异容差" type="number" min="0" value={String(config.fee_tolerance_amount)} onChange={e=>update('fee_tolerance_amount',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-reconciliation-tolerance" labelText="对账金额容差" type="number" min="0" step="0.01" value={String(config.reconciliation_tolerance_amount)} onChange={e=>update('reconciliation_tolerance_amount',Math.max(0,Number(e.currentTarget.value)||0))}/>
      </div>
      <div className="tp-settings__editor-grid">
        {toggleFields.slice(4,9).map(([key,label])=><Select key={key} id={'payment-'+key} labelText={label} value={String(Boolean(config[key]))} onChange={e=>update(key,e.currentTarget.value==='true')}><SelectItem value="true" text="启用"/><SelectItem value="false" text="停用"/></Select>)}
      </div>
    </section>

    <section className="tp-settings__editor">
      <h4>应收计划与账龄</h4>
      <p className="tp-settings__hint">默认节点比例作为后续新销售订单应收计划模板；调整比例时必须确保总和为 100%。</p>
      <div className="tp-settings__editor-grid">
        <TextInput id="payment-deposit-percent" labelText="定金比例（%）" type="number" min="0" max="100" value={String(config.default_deposit_percent)} onChange={e=>update('default_deposit_percent',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-pre-shipment-percent" labelText="发运前比例（%）" type="number" min="0" max="100" value={String(config.default_pre_shipment_percent)} onChange={e=>update('default_pre_shipment_percent',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-balance-percent" labelText="尾款比例（%）" type="number" min="0" max="100" value={String(config.default_balance_percent)} onChange={e=>update('default_balance_percent',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-aging-1" labelText="账龄区间一（天）" type="number" min="1" value={String(config.aging_bucket_1_days)} onChange={e=>update('aging_bucket_1_days',Math.max(1,Number(e.currentTarget.value)||1))}/>
        <TextInput id="payment-aging-2" labelText="账龄区间二（天）" type="number" min="2" value={String(config.aging_bucket_2_days)} onChange={e=>update('aging_bucket_2_days',Math.max(2,Number(e.currentTarget.value)||2))}/>
        <TextInput id="payment-aging-3" labelText="账龄区间三（天）" type="number" min="3" value={String(config.aging_bucket_3_days)} onChange={e=>update('aging_bucket_3_days',Math.max(3,Number(e.currentTarget.value)||3))}/>
      </div>
      <div className="tp-settings__editor-grid">
        <TextInput id="payment-reminder-first" labelText="首次提醒（到期前天数）" type="number" min="0" value={String(config.reminder_first_days)} onChange={e=>update('reminder_first_days',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-reminder-second" labelText="二次提醒（逾期天数）" type="number" min="0" value={String(config.reminder_second_days)} onChange={e=>update('reminder_second_days',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-reminder-third" labelText="升级提醒（逾期天数）" type="number" min="0" value={String(config.reminder_third_days)} onChange={e=>update('reminder_third_days',Math.max(0,Number(e.currentTarget.value)||0))}/>
        <TextInput id="payment-reminder-escalation" labelText="管理层升级（逾期天数）" type="number" min="0" value={String(config.reminder_escalation_days)} onChange={e=>update('reminder_escalation_days',Math.max(0,Number(e.currentTarget.value)||0))}/>
      </div>
    </section>

    <section className="tp-settings__editor">
      <h4>信用证规则</h4>
      <p className="tp-settings__hint">用于信用证收款的交单期限和单据要求；实际信用证字段继续保存在现有收款记录中。</p>
      <div className="tp-settings__editor-grid">
        <TextInput id="payment-lc-presentation-days" labelText="默认交单期限（天）" type="number" min="1" value={String(config.lc_presentation_days)} onChange={e=>update('lc_presentation_days',Math.max(1,Number(e.currentTarget.value)||1))}/>
        {toggleFields.slice(9).map(([key,label])=><Select key={key} id={'payment-'+key} labelText={label} value={String(Boolean(config[key]))} onChange={e=>update(key,e.currentTarget.value==='true')}><SelectItem value="true" text="要求提供"/><SelectItem value="false" text="不要求"/></Select>)}
      </div>
    </section>

    <section className="tp-settings__editor">
      <h4>收款业务字典</h4>
      <p className="tp-settings__hint">维护收款方式、手续费类型、收款凭证和差异类型。停用只影响新业务，不删除历史数据。</p>
      <div className="tp-settings__editor-grid">
        <Select id="payment-dictionary-type" labelText="字典类型" value={itemType} onChange={e=>setItemType(e.currentTarget.value)}>{dictionaries.map(x=><SelectItem key={x.value} value={x.value} text={x.label}/>)}</Select>
        <TextInput id="payment-dictionary-code" labelText="编码" value={itemCode} onChange={e=>setItemCode(e.currentTarget.value)}/>
        <TextInput id="payment-dictionary-name" labelText="名称" value={itemName} onChange={e=>setItemName(e.currentTarget.value)}/>
        <Button kind="primary" disabled={saving||!itemCode.trim()} onClick={()=>void addItem()}>新增配置项</Button>
      </div>
      <div className="tp-settings__table-wrap">
        <Table><TableHead><TableRow><TableHeader>编码</TableHeader><TableHeader>名称</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
          <TableBody>{visibleItems.map(item=><TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>void toggleItem(item)}>{item.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody>
        </Table>
        {!visibleItems.length&&<p className="tp-settings__empty">暂无配置项目。</p>}
      </div>
    </section>

    <section className="tp-settings__editor">
      <h4>最近配置变更</h4>
      <div className="tp-settings__table-wrap">
        <Table><TableHead><TableRow><TableHeader>时间</TableHeader><TableHeader>配置对象</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
          <TableBody>{history.map(row=><TableRow key={row.id}><TableCell>{new Date(row.changed_at).toLocaleString()}</TableCell><TableCell>{row.source_table==='trade_business_settings'?'收款规则':'收款字典'}</TableCell><TableCell>{row.operation==='INSERT'?'新增':row.operation==='UPDATE'?'修改':'停用'}</TableCell></TableRow>)}</TableBody>
        </Table>
        {!history.length&&<p className="tp-settings__empty">暂无配置变更记录。</p>}
      </div>
    </section>
    <div className="tp-settings__actions"><Button kind="primary" disabled={saving} onClick={()=>void save()}>{saving?'正在保存…':'保存收款设置'}</Button></div>
  </div>;
}
