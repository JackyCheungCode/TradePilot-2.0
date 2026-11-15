import { useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Tag, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/trade-tools.scss';

type Status = { deepl?:boolean; dhl?:boolean; upsClientId?:boolean; upsClientSecret?:boolean; fedexClientId?:boolean; fedexClientSecret?:boolean };
type Credential = { id:string; label:string; hint:string; field:string; statusKey:keyof Status; placeholder:string };
const credentials:Credential[]=[
 {id:'deepl',label:'DeepL API Key',hint:'DeepL API Free / Pro Authentication Key',field:'deeplApiKey',statusKey:'deepl',placeholder:'输入 DeepL API Key'},
 {id:'dhl',label:'DHL Shipment Tracking',hint:'DHL-API-Key（Shipment Tracking Unified API）',field:'dhlApiKey',statusKey:'dhl',placeholder:'输入 DHL API Subscription Key'},
 {id:'upsClientId',label:'UPS Client ID',hint:'UPS Developer Portal 应用 OAuth Client ID',field:'upsClientId',statusKey:'upsClientId',placeholder:'输入 UPS Client ID'},
 {id:'upsClientSecret',label:'UPS Client Secret',hint:'与 Client ID 配对的 OAuth Secret',field:'upsClientSecret',statusKey:'upsClientSecret',placeholder:'输入 UPS Client Secret'},
 {id:'fedexClientId',label:'FedEx API Key',hint:'FedEx Developer Portal 项目 API Key',field:'fedexClientId',statusKey:'fedexClientId',placeholder:'输入 FedEx API Key'},
 {id:'fedexClientSecret',label:'FedEx Secret Key',hint:'与 API Key 配对的 OAuth Secret Key',field:'fedexClientSecret',statusKey:'fedexClientSecret',placeholder:'输入 FedEx Secret Key'},
];
export function TradeToolsApiSettings(){
 const [status,setStatus]=useState<Status>({});
 const [values,setValues]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState('');
 const [testing,setTesting]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [testResult,setTestResult]=useState<Record<string,{ok:boolean;message:string}>>({});
 useEffect(()=>{void load();},[]);
 const load=async()=>{
  setLoading(true);setError('');
  try{const token=await getToken();const r=await fetch('/api/v1/settings/integrations',{headers:{Authorization:'Bearer '+token}});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||'读取接口配置状态失败');setStatus(b.data||{});}
  catch(e){setError(e instanceof Error?e.message:'读取 API 配置失败。');}
  finally{setLoading(false);}
 };
 const save=async(item:Credential)=>{
  const value=values[item.id]?.trim();if(!value){setError('请填写 '+item.label+'。');return;}
  setSaving(item.id);setError('');setNotice('');
  try{const token=await getToken();const r=await fetch('/api/v1/settings/integrations',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({[item.field]:value})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||'保存失败');setValues(v=>({...v,[item.id]:''}));setNotice(item.label+' 已安全保存至 TradePilot Worker Secrets。');await load();}
  catch(e){setError(e instanceof Error?e.message:'保存凭证失败。');}
  finally{setSaving('');}
 };
 const test=async(service:string)=>{
  setTesting(service);setError('');
  try{const token=await getToken();const r=await fetch('/api/v1/settings/integrations/test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({service})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||'测试失败');setTestResult(v=>({...v,[service]:{ok:Boolean(b.data?.ok),message:String(b.data?.message||'测试完成')}}));}
  catch(e){setTestResult(v=>({...v,[service]:{ok:false,message:e instanceof Error?e.message:'连接测试失败'}}));}
  finally{setTesting('');}
 };
 if(loading)return <InlineLoading description="正在读取 API 配置状态…"/>;
 return <div className="tp-settings__editor">
  <h4>外贸工具 API 配置</h4>
  <p>密钥通过已配置的 Cloudflare API Token 保存为 TradePilot Worker Secrets。页面不会读取或回显已保存的密钥。</p>
  {error&&<InlineNotification kind="error" title="配置失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="success" title="保存成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  {credentials.map(item=><div key={item.id} className="tp-settings-trade-api__credential">
   <div className="tp-settings-trade-api__credential-heading"><strong>{item.label}</strong><Tag type={status[item.statusKey]?'green':'cool-gray'}>{status[item.statusKey]?'已配置':'未配置'}</Tag></div>
   <p>{item.hint}</p>
   <div className="tp-settings-trade-api__credential-form">
    <TextInput id={'trade-api-'+item.id} labelText={item.label} type="password" autoComplete="new-password" placeholder={item.placeholder} value={values[item.id]||''} onChange={e=>setValues(v=>({...v,[item.id]:e.currentTarget.value}))}/>
    <Button kind="primary" disabled={Boolean(saving)||!values[item.id]?.trim()} onClick={()=>void save(item)}>{saving===item.id?'正在保存…':'保存凭证'}</Button>
   </div>
  </div>)}
  <div className="tp-settings-trade-api__actions">
   <Button kind="secondary" disabled={Boolean(testing)} onClick={()=>void test('deepl')}>测试 DeepL</Button>
   <Button kind="secondary" disabled={Boolean(testing)} onClick={()=>void test('dhl')}>{testing==='dhl'?'正在测试…':'测试 DHL'}</Button>
   <Button kind="secondary" disabled={Boolean(testing)} onClick={()=>void test('upsClientId')}>{testing==='upsClientId'?'正在测试…':'测试 UPS'}</Button>
   <Button kind="secondary" disabled={Boolean(testing)} onClick={()=>void test('fedexClientId')}>{testing==='fedexClientId'?'正在测试…':'测试 FedEx'}</Button>
  </div>
  {Object.entries(testResult).map(([key,result])=><InlineNotification key={key} kind={result.ok?'success':'error'} title={key==='dhl'?'DHL':key.startsWith('ups')?'UPS':'FedEx'} subtitle={result.message}/>)}
  <p className="tp-settings__footnote">注意：DHL 使用 Shipment Tracking Unified API；UPS 与 FedEx 使用 OAuth 2.0。凭证必须来自各承运商官方开发者门户，且需已为应用开通 Tracking API 权限。</p>
 </div>;
}
async function getToken(){const db=await getSupabaseClient();const {data}=await db.auth.getSession();if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');return data.session.access_token;}
