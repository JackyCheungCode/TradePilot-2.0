import { useCallback, useEffect, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Scope = 'shared' | 'shipment' | 'payment';
type SettingItem = { id: string; setting_type: string; code: string; name: string; config: Record<string, unknown>; sequence: number; is_active: boolean };
type HistoryItem = { id: string; source_table: string; operation: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; changed_at: string };
type BusinessConfig = Record<string, string | number | boolean>;
const currencies = [
  ['USD','美元',2],['EUR','欧元',2],['GBP','英镑',2],['CNY','人民币',2],['TWD','新台币',0],
  ['JPY','日元',0],['HKD','港币',2],['AUD','澳元',2],['CAD','加元',2],['SGD','新加坡元',2],
];
const incoterms = ['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'];
const shipmentDefaults: BusinessConfig = {
  default_transport_mode: 'sea_fcl', default_incoterm: 'FOB', default_currency: 'USD',
  allow_partial_shipments: true, allow_over_shipment: false,
  eta_alert_days: 3, etd_alert_days: 2,
  require_bill_of_lading: true, require_commercial_invoice: true, require_packing_list: true,
};
const shipmentDictionaries = [
  { value: 'transport_mode', label: '运输方式', seeds: [['sea_fcl','海运整柜'],['sea_lcl','海运拼箱'],['air_freight','空运'],['express','国际快递'],['rail','铁路运输'],['road','公路运输']] },
  { value: 'container_type', label: '集装箱箱型', seeds: [['20GP','20尺普柜'],['40GP','40尺普柜'],['40HQ','40尺高柜'],['45HQ','45尺高柜'],['REEFER','冷藏柜']] },
  { value: 'package_type', label: '包装类型', seeds: [['carton','纸箱'],['pallet','托盘'],['wooden_case','木箱'],['crate','木架'],['bag','袋装']] },
  { value: 'shipment_fee_category', label: '发运费用', seeds: [['ocean_freight','海运费'],['air_freight','空运费'],['customs','报关费'],['terminal','码头费'],['insurance','保险费'],['handling','操作费']] },
  { value: 'tracking_event', label: '跟踪节点', seeds: [['booking_confirmed','订舱确认'],['cargo_received','货物入仓'],['customs_cleared','完成报关'],['departed','已离港'],['arrived','已到港'],['delivered','已签收']] },
  { value: 'exception_type', label: '发运异常', seeds: [['delay','运输延误'],['customs_hold','海关查验'],['damaged','货物损坏'],['lost','货物遗失'],['document_issue','单据异常']] },
];
const shipmentFields: Array<{key:keyof typeof shipmentDefaults;label:string;kind:'select'|'number'|'boolean';options?:Array<{value:string;label:string}>}> = [
  {key:'default_transport_mode',label:'默认运输方式',kind:'select',options:shipmentDictionaries[0].seeds.map(([value,label])=>({value,label}))},
  {key:'default_incoterm',label:'默认贸易条款',kind:'select',options:incoterms.map(value=>({value,label:value}))},
  {key:'default_currency',label:'默认发运币种',kind:'select',options:currencies.map(([value,label])=>({value:String(value),label:String(value)+' · '+String(label)}))},
  {key:'allow_partial_shipments',label:'允许拆分发运',kind:'boolean'},
  {key:'allow_over_shipment',label:'允许超出订单数量发运',kind:'boolean'},
  {key:'eta_alert_days',label:'ETA 提前预警天数',kind:'number'},
  {key:'etd_alert_days',label:'ETD 提前预警天数',kind:'number'},
  {key:'require_bill_of_lading',label:'提单作为必需文件',kind:'boolean'},
  {key:'require_commercial_invoice',label:'商业发票作为必需文件',kind:'boolean'},
  {key:'require_packing_list',label:'装箱单作为必需文件',kind:'boolean'},
];

export function TradeOperationsSettings({ scope }: { scope: Scope }) {
  const [ownerId,setOwnerId] = useState('');
  const [items,setItems] = useState<SettingItem[]>([]);
  const [history,setHistory] = useState<HistoryItem[]>([]);
  const [baseCurrency,setBaseCurrency] = useState('USD');
  const [incotermVersion,setIncotermVersion] = useState('2020');
  const [itemType,setItemType] = useState('currency');
  const [itemCode,setItemCode] = useState('');
  const [itemName,setItemName] = useState('');
  const [businessConfig,setBusinessConfig] = useState<BusinessConfig>(shipmentDefaults);
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
      const [settingsResult,itemsResult,profileResult,historyResult] = await Promise.all([
        db.from('trade_business_settings').select('config').eq('owner_id',userId).eq('scope_key',scope).maybeSingle(),
        db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key',scope).order('sequence').order('code'),
        db.from('enterprise_profiles').select('default_currency').eq('is_default',true).eq('is_archived',false).maybeSingle(),
        db.from('trade_business_setting_history').select('id,source_table,operation,before_data,after_data,changed_at').eq('owner_id',userId).eq('scope_key',scope).order('changed_at',{ascending:false}).limit(10),
      ]);
      if(settingsResult.error) throw settingsResult.error;
      if(itemsResult.error) throw itemsResult.error;
      if(profileResult.error) throw profileResult.error;
      if(historyResult.error) throw historyResult.error;
      setHistory((historyResult.data||[]) as HistoryItem[]);
      let rows = (itemsResult.data || []) as SettingItem[];
      if(scope==='shared') {
        for(const [type,seedRows] of [['currency',currencies.map(([code,name,decimal_places])=>[String(code),String(name),{decimal_places:Number(decimal_places)}])],['incoterm',incoterms.map(code=>[code,code,{version:'2020'}])]] as Array<[string,Array<[string,string,Record<string,unknown>]>]>) {
          if(!rows.some(x=>x.setting_type===type)) {
            const seed = seedRows.map(([code,name,config],i)=>({owner_id:userId,scope_key:scope,setting_type:type,code,name,config,sequence:(i+1)*10,is_active:true}));
            const {error:seedError} = await db.from('trade_business_setting_items').upsert(seed,{onConflict:'owner_id,scope_key,setting_type,code',ignoreDuplicates:true});
            if(seedError) throw seedError;
          }
        }
      }
      if(scope==='shipment') {
        let seededShipmentDictionary=false;
        for(const dictionary of shipmentDictionaries) {
          if(!rows.some(x=>x.setting_type===dictionary.value)) {
            const seed=dictionary.seeds.map(([code,name],i)=>({owner_id:userId,scope_key:scope,setting_type:dictionary.value,code,name,config:{},sequence:(i+1)*10,is_active:true}));
            const {error:seedError}=await db.from('trade_business_setting_items').upsert(seed,{onConflict:'owner_id,scope_key,setting_type,code',ignoreDuplicates:true});
            if(seedError) throw seedError;
            seededShipmentDictionary=true;
          }
        }
        if(seededShipmentDictionary) rows=[];
      }
      if(!itemsResult.data?.length || (scope==='shipment' && rows.length===0)) {
        const refreshed=await db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key',scope).order('sequence').order('code');
        if(refreshed.error) throw refreshed.error;
        rows=(refreshed.data||[]) as SettingItem[];
      } else if(scope==='shared' && (!rows.some(x=>x.setting_type==='currency') || !rows.some(x=>x.setting_type==='incoterm'))) {
        const refreshed=await db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key',scope).order('sequence').order('code');
        if(refreshed.error) throw refreshed.error;
        rows=(refreshed.data||[]) as SettingItem[];
      }
      setItems(rows);
      const config=(settingsResult.data?.config||{}) as BusinessConfig;
      setBaseCurrency(profileResult.data?.default_currency||'USD');
      setIncotermVersion(String(config.incoterm_version||'2020'));
      setBusinessConfig({...shipmentDefaults,...config});
    } catch(e) { setError(e instanceof Error?e.message:'读取业务设置失败'); }
    finally { setLoading(false); }
  },[scope]);

  useEffect(()=>{void load();},[load]);

  const saveShared = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      if(!items.some(x=>x.setting_type==='currency'&&x.code===baseCurrency&&x.is_active)) throw new Error('企业档案中的本位币未在共享币种字典中启用，请先维护币种字典。');
      const db=await getSupabaseClient();
      const {error:saveError}=await db.from('trade_business_settings').upsert({owner_id:ownerId,scope_key:'shared',config:{incoterm_version:incotermVersion}},{onConflict:'owner_id,scope_key'});
      if(saveError) throw saveError;
      setNotice('共享基础设置已保存。新业务将读取最新配置，历史业务保留原快照。');
      await load();
    } catch(e) {setError(e instanceof Error?e.message:'保存共享设置失败');}
    finally {setSaving(false);}
  };

  const saveShipment = async () => {
    setSaving(true);setError('');setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const activeModes=items.filter(x=>x.setting_type==='transport_mode'&&x.is_active);
      if(!activeModes.some(x=>x.code===businessConfig.default_transport_mode)) throw new Error('默认运输方式必须选择已启用的运输方式。');
      if(!items.some(x=>x.setting_type==='incoterm'&&x.code===businessConfig.default_incoterm&&x.is_active)) throw new Error('默认贸易条款必须在共享贸易术语中启用。');
      if(!items.some(x=>x.setting_type==='currency'&&x.code===businessConfig.default_currency&&x.is_active)) throw new Error('默认发运币种必须在共享币种中启用。');
      const db=await getSupabaseClient();
      const {error:saveError}=await db.from('trade_business_settings').upsert({owner_id:ownerId,scope_key:'shipment',config:businessConfig},{onConflict:'owner_id,scope_key'});
      if(saveError) throw saveError;
      setNotice('发运基础规则已保存。该配置用于新建发运；历史发运资料不自动变更。');
      await load();
    } catch(e) {setError(e instanceof Error?e.message:'保存发运设置失败');}
    finally {setSaving(false);}
  };

  const addItem = async () => {
    const code=itemCode.trim().toUpperCase(),name=itemName.trim()||code;
    if(!code){setError('请填写编码。');return;}
    setSaving(true);setError('');setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      const db=await getSupabaseClient();
      const config=itemType==='currency'?{decimal_places:2}:itemType==='incoterm'?{version:incotermVersion}:{};
      const {data,error:insertError}=await db.from('trade_business_setting_items').insert({owner_id:ownerId,scope_key:scope,setting_type:itemType,code,name,config,sequence:(items.filter(x=>x.setting_type===itemType).length+1)*10,is_active:true}).select('id,setting_type,code,name,config,sequence,is_active').single();
      if(insertError) throw insertError;
      setItems(current=>[...current,data as SettingItem]);setItemCode('');setItemName('');
      setNotice('配置项目已新增。');
    } catch(e) {setError(e instanceof Error?e.message:'新增配置项目失败');}
    finally {setSaving(false);}
  };

  const toggleItem = async (item:SettingItem) => {
    if(scope==='shared'&&item.setting_type==='currency'&&item.code===baseCurrency&&item.is_active){setError('当前本位币不能停用，请先切换本位币。');return;}
    if(scope==='shipment'&&item.setting_type==='transport_mode'&&item.code===businessConfig.default_transport_mode&&item.is_active){setError('当前默认运输方式不能停用，请先更换默认运输方式。');return;}
    setError('');setNotice('');
    const db=await getSupabaseClient();
    const {error:updateError}=await db.from('trade_business_setting_items').update({is_active:!item.is_active}).eq('id',item.id);
    if(updateError){setError(updateError.message);return;}
    setItems(current=>current.map(x=>x.id===item.id?{...x,is_active:!item.is_active}:x));
    setNotice('配置项目状态已更新；历史业务记录不受影响。');
  };

  const activeCurrency=items.filter(x=>x.setting_type==='currency'&&x.is_active);
  const activeIncoterms=items.filter(x=>x.setting_type==='incoterm'&&x.is_active);
  const visibleItems=items.filter(x=>x.setting_type===itemType);
  const selectedDictionary=shipmentDictionaries.find(x=>x.value===itemType);

  if(scope==='payment') return <div className="tp-settings__advanced"><InlineNotification kind="info" title="收款设置开发中" subtitle="共享基础设置与发运设置完成验收后，将在本设置中心内接入收款方式、手续费、应收节点、账龄、信用证及对账规则。" /></div>;

  return <div className="tp-settings__advanced">
    {error&&<InlineNotification kind="error" title="设置操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {notice&&<InlineNotification kind="success" title="操作成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    {loading?<InlineLoading description="正在读取设置…" />:<>
      {scope==='shared' ? <>
        <section className="tp-settings__editor">
          <h4>共享默认规则</h4><p className="tp-settings__hint">本位币由企业档案维护；币种与贸易术语由此统一管理，发运和收款共同引用。</p>
          <div className="tp-settings__editor-grid">
            <Select id="trade-shared-base-currency" labelText="企业本位币" value={baseCurrency} disabled>{activeCurrency.map(x=><SelectItem key={x.code} value={x.code} text={x.code+' · '+x.name}/>)}</Select>
            <Select id="trade-shared-incoterm-version" labelText="贸易术语版本" value={incotermVersion} onChange={e=>setIncotermVersion(e.currentTarget.value)}><SelectItem value="2020" text="Incoterms 2020"/><SelectItem value="2010" text="Incoterms 2010"/></Select>
            <Button kind="primary" disabled={saving} onClick={()=>void saveShared()}>{saving?'正在保存…':'保存共享规则'}</Button>
          </div>
        </section>
        <section className="tp-settings__editor">
          <h4>共享基础字典</h4><p className="tp-settings__hint">停用只影响新建业务，历史单据保留原值。</p>
          <div className="tp-settings__editor-grid">
            <Select id="trade-shared-item-type" labelText="字典类型" value={itemType} onChange={e=>setItemType(e.currentTarget.value)}><SelectItem value="currency" text="币种"/><SelectItem value="incoterm" text="贸易术语"/></Select>
            <TextInput id="trade-shared-item-code" labelText="编码" value={itemCode} onChange={e=>setItemCode(e.currentTarget.value)}/>
            <TextInput id="trade-shared-item-name" labelText="名称" value={itemName} onChange={e=>setItemName(e.currentTarget.value)}/>
            <Button kind="primary" disabled={saving||!itemCode.trim()} onClick={()=>void addItem()}>新增项目</Button>
          </div>
          <div className="tp-settings__table-wrap"><Table><TableHead><TableRow><TableHeader>编码</TableHeader><TableHeader>名称</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead><TableBody>{visibleItems.map(item=><TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>void toggleItem(item)}>{item.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody></Table>{!visibleItems.length&&<p className="tp-settings__empty">暂无字典项目。</p>}</div>
        </section>
      </> : <>
        <section className="tp-settings__editor">
          <h4>发运基础规则</h4><p className="tp-settings__hint">这些参数用于新建发运和前置校验；核心订单冻结、超发限制仍由服务端执行。</p>
          <div className="tp-settings__editor-grid">
            {shipmentFields.map(field=>field.kind==='select' ? <Select key={field.key} id={'shipment-'+field.key} labelText={field.label} value={String(businessConfig[field.key])} onChange={e=>setBusinessConfig(current=>({...current,[field.key]:e.currentTarget.value}))}>{field.options?.map(option=><SelectItem key={option.value} value={option.value} text={option.label}/>)}</Select> : field.kind==='boolean' ? <Select key={field.key} id={'shipment-'+field.key} labelText={field.label} value={String(businessConfig[field.key])} onChange={e=>setBusinessConfig(current=>({...current,[field.key]:e.currentTarget.value==='true'}))}><SelectItem value="true" text="启用"/><SelectItem value="false" text="停用"/></Select> : <TextInput key={field.key} id={'shipment-'+field.key} labelText={field.label} type="number" min="0" value={String(businessConfig[field.key])} onChange={e=>setBusinessConfig(current=>({...current,[field.key]:Math.max(0,Number(e.currentTarget.value)||0)}))}/>)}
          </div>
          <div className="tp-settings__actions"><Button kind="primary" disabled={saving} onClick={()=>void saveShipment()}>{saving?'正在保存…':'保存发运规则'}</Button></div>
        </section>
        <section className="tp-settings__editor">
          <h4>发运业务字典</h4><p className="tp-settings__hint">维护运输方式、箱型、包装、费用、跟踪节点和异常类型。停用后不再用于新建发运。</p>
          <div className="tp-settings__editor-grid">
            <Select id="shipment-dictionary-type" labelText="字典类型" value={itemType} onChange={e=>setItemType(e.currentTarget.value)}>{shipmentDictionaries.map(x=><SelectItem key={x.value} value={x.value} text={x.label}/>)}</Select>
            <TextInput id="shipment-dictionary-code" labelText="编码" value={itemCode} onChange={e=>setItemCode(e.currentTarget.value)}/>
            <TextInput id="shipment-dictionary-name" labelText="名称" value={itemName} onChange={e=>setItemName(e.currentTarget.value)}/>
            <Button kind="primary" disabled={saving||!itemCode.trim()} onClick={()=>void addItem()}>新增配置项</Button>
          </div>
          <div className="tp-settings__table-wrap"><Table><TableHead><TableRow><TableHeader>编码</TableHeader><TableHeader>名称</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead><TableBody>{visibleItems.map(item=><TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>void toggleItem(item)}>{item.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody></Table>{!visibleItems.length&&<p className="tp-settings__empty">暂无配置项目。</p>}</div>
        </section>
      </>}
      <section className="tp-settings__editor">
        <h4>最近配置变更</h4><p className="tp-settings__hint">系统自动记录该业务域配置的新增、修改和停用操作。</p>
        <div className="tp-settings__table-wrap"><Table><TableHead><TableRow><TableHeader>时间</TableHeader><TableHeader>配置对象</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead><TableBody>{history.map(row=><TableRow key={row.id}><TableCell>{new Date(row.changed_at).toLocaleString()}</TableCell><TableCell>{row.source_table==='trade_business_settings'?'业务默认规则':'业务字典'}</TableCell><TableCell>{row.operation==='INSERT'?'新增':row.operation==='UPDATE'?'修改':'停用'}</TableCell></TableRow>)}</TableBody></Table>{!history.length&&<p className="tp-settings__empty">暂无配置变更记录。</p>}</div>
      </section>
    </>}
  </div>;
}
