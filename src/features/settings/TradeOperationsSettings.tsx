import { useCallback, useEffect, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Scope = 'shared' | 'shipment' | 'payment';
type SettingItem = { id: string; setting_type: string; code: string; name: string; config: Record<string, unknown>; sequence: number; is_active: boolean };
const currencies = [
  ['USD','美元',2],['EUR','欧元',2],['GBP','英镑',2],['CNY','人民币',2],['TWD','新台币',0],
  ['JPY','日元',0],['HKD','港币',2],['AUD','澳元',2],['CAD','加元',2],['SGD','新加坡元',2],
];
const incoterms = ['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'];

export function TradeOperationsSettings({ scope }: { scope: Scope }) {
  const [ownerId,setOwnerId] = useState('');
  const [items,setItems] = useState<SettingItem[]>([]);
  const [baseCurrency,setBaseCurrency] = useState('USD');
  const [incotermVersion,setIncotermVersion] = useState('2020');
  const [itemType,setItemType] = useState<'currency'|'incoterm'>('currency');
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
      const [settingsResult,itemsResult] = await Promise.all([
        db.from('trade_business_settings').select('config').eq('owner_id',userId).eq('scope_key','shared').maybeSingle(),
        db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key','shared').order('sequence').order('code'),
      ]);
      if(settingsResult.error) throw settingsResult.error;
      if(itemsResult.error) throw itemsResult.error;
      let rows = (itemsResult.data || []) as SettingItem[];
      if(!rows.some(x=>x.setting_type==='currency')) {
        const seed = currencies.map(([code,name,decimal_places],i)=>({owner_id:userId,scope_key:'shared',setting_type:'currency',code:String(code),name:String(name),config:{decimal_places:Number(decimal_places)},sequence:(i+1)*10,is_active:true}));
        const {error:seedError} = await db.from('trade_business_setting_items').upsert(seed,{onConflict:'owner_id,scope_key,setting_type,code',ignoreDuplicates:true});
        if(seedError) throw seedError;
      }
      if(!rows.some(x=>x.setting_type==='incoterm')) {
        const seed = incoterms.map((code,i)=>({owner_id:userId,scope_key:'shared',setting_type:'incoterm',code,name:code,config:{version:'2020'},sequence:(i+1)*10,is_active:true}));
        const {error:seedError} = await db.from('trade_business_setting_items').upsert(seed,{onConflict:'owner_id,scope_key,setting_type,code',ignoreDuplicates:true});
        if(seedError) throw seedError;
      }
      if(!itemsResult.data?.length || !rows.some(x=>x.setting_type==='currency') || !rows.some(x=>x.setting_type==='incoterm')) {
        const refreshed = await db.from('trade_business_setting_items').select('id,setting_type,code,name,config,sequence,is_active').eq('owner_id',userId).eq('scope_key','shared').order('sequence').order('code');
        if(refreshed.error) throw refreshed.error;
        rows = (refreshed.data || []) as SettingItem[];
      }
      setItems(rows);
      const config = (settingsResult.data?.config || {}) as Record<string,string>;
      setBaseCurrency(config.base_currency || 'USD');
      setIncotermVersion(config.incoterm_version || '2020');
    } catch(e) { setError(e instanceof Error?e.message:'读取共享设置失败'); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ if(scope==='shared') void load(); else setLoading(false); },[scope,load]);

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      if(!ownerId) throw new Error('登录状态已失效，请重新登录。');
      if(!items.some(x=>x.setting_type==='currency'&&x.code===baseCurrency&&x.is_active)) throw new Error('本位币必须是已启用的币种。');
      const db = await getSupabaseClient();
      const {error:saveError} = await db.from('trade_business_settings').upsert(
        {owner_id:ownerId,scope_key:'shared',config:{base_currency:baseCurrency,incoterm_version:incotermVersion}},
        {onConflict:'owner_id,scope_key'}
      );
      if(saveError) throw saveError;
      setNotice('共享基础设置已保存。新业务将读取最新配置，历史业务保留原快照。');
      await load();
    } catch(e) { setError(e instanceof Error?e.message:'保存共享设置失败'); }
    finally { setSaving(false); }
  };

  const addItem = async () => {
    const code=itemCode.trim().toUpperCase();
    const name=(itemName.trim()||code);
    if(!code) {setError('请填写编码。');return;}
    setSaving(true);setError('');setNotice('');
    try {
      const db=await getSupabaseClient();
      const config=itemType==='currency'?{decimal_places:2}:{version:incotermVersion};
      const {data,error:insertError}=await db.from('trade_business_setting_items').insert({
        owner_id:ownerId,scope_key:'shared',setting_type:itemType,code,name,config,
        sequence:(items.filter(x=>x.setting_type===itemType).length+1)*10,is_active:true
      }).select('id,setting_type,code,name,config,sequence,is_active').single();
      if(insertError) throw insertError;
      setItems(current=>[...current,data as SettingItem]);
      setItemCode('');setItemName('');
      setNotice('共享字典项目已新增。');
    } catch(e) {setError(e instanceof Error?e.message:'新增字典项目失败');}
    finally {setSaving(false);}
  };

  const toggleItem = async (item:SettingItem) => {
    if(item.setting_type==='currency'&&item.code===baseCurrency&&item.is_active) {setError('当前本位币不能停用，请先切换本位币。');return;}
    setError('');setNotice('');
    const db=await getSupabaseClient();
    const {error:updateError}=await db.from('trade_business_setting_items').update({is_active:!item.is_active}).eq('id',item.id);
    if(updateError){setError(updateError.message);return;}
    setItems(current=>current.map(x=>x.id===item.id?{...x,is_active:!item.is_active}:x));
    setNotice('字典状态已更新；历史业务记录不受影响。');
  };

  if(scope!=='shared') return <div className="tp-settings__advanced"><InlineNotification kind="info" title="分阶段接入" subtitle={scope==='shipment'?'发运配置将在共享基础设置验收后接入。':'收款配置将在共享基础设置验收后接入。'} /></div>;

  const visibleItems=items.filter(x=>x.setting_type===itemType);
  return <div className="tp-settings__advanced">
    {error&&<InlineNotification kind="error" title="设置操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    {notice&&<InlineNotification kind="success" title="操作成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
    {loading?<InlineLoading description="正在读取共享基础设置…"/>:<>
      <section className="tp-settings__editor">
        <h4>共享默认规则</h4>
        <p className="tp-settings__hint">币种和贸易术语由共享字典统一维护，发运与收款模块引用同一份数据。</p>
        <div className="tp-settings__editor-grid">
          <Select id="trade-shared-base-currency" labelText="本位币" value={baseCurrency} onChange={e=>setBaseCurrency(e.currentTarget.value)}>
            {items.filter(x=>x.setting_type==='currency'&&x.is_active).map(x=><SelectItem key={x.code} value={x.code} text={x.code+' · '+x.name}/>)}
          </Select>
          <Select id="trade-shared-incoterm-version" labelText="贸易术语版本" value={incotermVersion} onChange={e=>setIncotermVersion(e.currentTarget.value)}>
            <SelectItem value="2020" text="Incoterms 2020"/>
            <SelectItem value="2010" text="Incoterms 2010"/>
          </Select>
          <Button kind="primary" disabled={saving} onClick={()=>void save()}>{saving?'正在保存…':'保存共享规则'}</Button>
        </div>
      </section>
      <section className="tp-settings__editor">
        <h4>共享基础字典</h4>
        <p className="tp-settings__hint">维护币种和贸易术语。停用只影响新建业务，历史单据保留原值。</p>
        <div className="tp-settings__editor-grid">
          <Select id="trade-shared-item-type" labelText="字典类型" value={itemType} onChange={v=>setItemType(v as 'currency'|'incoterm')}>
            <SelectItem value="currency" text="币种"/>
            <SelectItem value="incoterm" text="贸易术语"/>
          </Select>
          <TextInput id="trade-shared-item-code" labelText="编码" value={itemCode} onChange={e=>setItemCode(e.currentTarget.value)}/>
          <TextInput id="trade-shared-item-name" labelText="名称" value={itemName} onChange={e=>setItemName(e.currentTarget.value)}/>
          <Button kind="primary" disabled={saving||!itemCode.trim()} onClick={()=>void addItem()}>新增项目</Button>
        </div>
        <div className="tp-settings__table-wrap">
          <Table>
            <TableHead><TableRow><TableHeader>编码</TableHeader><TableHeader>名称</TableHeader><TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
            <TableBody>{visibleItems.map(item=><TableRow key={item.id}>
              <TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell>
              <TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell>
              <TableCell><Button kind="ghost" size="sm" onClick={()=>void toggleItem(item)}>{item.is_active?'停用':'启用'}</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!visibleItems.length&&<p className="tp-settings__empty">暂无字典项目。</p>}
        </div>
      </section>
    </>}
  </div>;
}
