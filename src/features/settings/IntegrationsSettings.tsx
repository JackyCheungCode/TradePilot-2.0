import { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, InlineLoading, InlineNotification, Modal, Tag, TextInput, Tile } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/settings.scss';

type Protocol='openai'|'anthropic'|'gemini'|'workers-ai';
type Provider={id:string;providerKey:string;name:string;protocol:Protocol;baseUrl:string;model:string;secretName?:string;configured?:boolean;enabled?:boolean};
type Config={defaultModel:string;taskModels:Record<string,string>;providers:Provider[]};
type Catalog={id:string;name:string;protocol:Protocol;baseUrl:string;logo:string;initial:string;needsKey?:boolean};
const catalog:Catalog[]=[
{id:'cloudflare-workers-ai',name:'Cloudflare Workers AI',protocol:'workers-ai',baseUrl:'',logo:'cloudflare',initial:'C',needsKey:false},
{id:'openrouter',name:'OpenRouter',protocol:'openai',baseUrl:'https://openrouter.ai/api/v1',logo:'openrouter',initial:'O'},
{id:'openai',name:'OpenAI',protocol:'openai',baseUrl:'https://api.openai.com/v1',logo:'openai',initial:'O'},
{id:'anthropic',name:'Anthropic',protocol:'anthropic',baseUrl:'https://api.anthropic.com/v1',logo:'anthropic',initial:'A'},
{id:'gemini',name:'Google Gemini',protocol:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',logo:'googlegemini',initial:'G'},
{id:'deepseek',name:'DeepSeek',protocol:'openai',baseUrl:'https://api.deepseek.com/v1',logo:'deepseek',initial:'D'},
{id:'qwen',name:'阿里云百炼 Qwen',protocol:'openai',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',logo:'alibabacloud',initial:'Q'},
{id:'zhipu',name:'智谱 AI',protocol:'openai',baseUrl:'https://open.bigmodel.cn/api/paas/v4',logo:'zhipu',initial:'Z'},
{id:'kimi',name:'月之暗面 Kimi',protocol:'openai',baseUrl:'https://api.moonshot.cn/v1',logo:'moonshot',initial:'K'},
{id:'minimax',name:'MiniMax',protocol:'openai',baseUrl:'https://api.minimax.chat/v1',logo:'minimax',initial:'M'},
{id:'mistral',name:'Mistral AI',protocol:'openai',baseUrl:'https://api.mistral.ai/v1',logo:'mistral',initial:'M'},
{id:'siliconflow',name:'硅基流动 SiliconFlow',protocol:'openai',baseUrl:'https://api.siliconflow.cn/v1',logo:'siliconcloud',initial:'S'},
{id:'xai',name:'xAI Grok',protocol:'openai',baseUrl:'https://api.x.ai/v1',logo:'x',initial:'X'},
{id:'groq',name:'Groq',protocol:'openai',baseUrl:'https://api.groq.com/openai/v1',logo:'groq',initial:'G'},
{id:'baidu-qianfan',name:'百度千帆',protocol:'openai',baseUrl:'https://qianfan.baidubce.com/v2',logo:'baidu',initial:'B'},
{id:'tencent-hunyuan',name:'腾讯混元',protocol:'openai',baseUrl:'https://api.hunyuan.cloud.tencent.com/v1',logo:'tencent',initial:'T'},
{id:'volcengine-ark',name:'火山引擎方舟',protocol:'openai',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',logo:'bytedance',initial:'火'},
{id:'together',name:'Together AI',protocol:'openai',baseUrl:'https://api.together.xyz/v1',logo:'together',initial:'T'},
{id:'custom',name:'自定义 OpenAI 兼容接口',protocol:'openai',baseUrl:'',logo:'',initial:'API'}
];
const apiCards=[
{id:'apify',name:'Apify',logo:'apify',initial:'A',description:'网页采集、社交平台与数据发现。',fields:[{key:'apify',label:'API Token'}],test:'apify'},
{id:'serper',name:'Serper',logo:'',initial:'S',description:'Google 搜索引擎数据 API。',fields:[{key:'serper',label:'API Key'}],test:'serper'},
{id:'serpapi',name:'SerpApi',logo:'',initial:'S',description:'多类型搜索结果 API。',fields:[{key:'serpapi',label:'API Key'}],test:'serpapi'},
{id:'deepl',name:'DeepL',logo:'deepl',initial:'D',description:'外贸工具在线翻译。',fields:[{key:'deepl',label:'API Key'}],test:'deepl'},
{id:'googleMaps',name:'Google Maps（New）',logo:'googlemaps',initial:'G',description:'地理编码与时区识别；需启用 Geocoding API 和 Time Zone API。',fields:[{key:'googleMaps',label:'API Key'}],test:'googleMaps'},
{id:'dhl',name:'DHL',logo:'dhl',initial:'DHL',description:'DHL Shipment Tracking 官方接口。',fields:[{key:'dhl',label:'API Subscription Key'}],test:'dhl'},
{id:'ups',name:'UPS',logo:'ups',initial:'UPS',description:'UPS OAuth 2.0 与 Shipment Tracking API。',fields:[{key:'upsClientId',label:'Client ID'},{key:'upsClientSecret',label:'Client Secret'}],test:'ups'},
{id:'fedex',name:'FedEx',logo:'fedex',initial:'FX',description:'FedEx OAuth 2.0 与 Track API。',fields:[{key:'fedexClientId',label:'API Key / Client ID'},{key:'fedexClientSecret',label:'Secret Key'}],test:'fedex'},
{id:'cloudflare',name:'Cloudflare Workers AI',logo:'cloudflare',initial:'C',description:'Workers AI 模型目录读取。请使用仅具备 Workers AI Read 权限的 API Token。',fields:[{key:'cloudflareApiToken',label:'Workers AI API Token'},{key:'cloudflareAccountId',label:'Account ID'}],test:'cloudflare'},
{id:'omnibox',name:'Omnibox 贸易百宝箱',logo:'',initial:'O',description:'HS Code 智能归类、关税预估、贸易实体筛查与美国 CBP 裁决检索。',fields:[{key:'omnibox',label:'Omnibox API Key'}],test:'omnibox'}
] as const;
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const db=await getSupabaseClient();const {data}=await db.auth.getSession();if(!data.session?.access_token)throw new Error('登录状态已失效，请重新登录。');
 const r=await fetch(path,{...init,headers:{Authorization:'Bearer '+data.session.access_token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const b=await r.json() as {data?:T;error?:{message?:string}};if(!r.ok||!('data'in b))throw new Error(b.error?.message||'请求失败');return b.data as T;
}
function Logo({logo,initial}:{logo:string;initial:string}){const [bad,setBad]=useState(false);return <span className="tp-integration-logo">{logo&&!bad?<img src={'https://cdn.simpleicons.org/'+logo} alt="" onError={()=>setBad(true)}/>:<span>{initial}</span>}</span>;}

export function IntegrationsSettings({section}:{section:string}){
 const [statuses,setStatuses]=useState<Record<string,boolean>>({});const [values,setValues]=useState<Record<string,string>>({});
 const [apiLoading,setApiLoading]=useState(true);const [apiSaving,setApiSaving]=useState('');const [apiTesting,setApiTesting]=useState('');
 const [apiError,setApiError]=useState('');const [apiNotice,setApiNotice]=useState('');const [tests,setTests]=useState<Record<string,{ok:boolean;message:string}>>({});const [pendingDelete,setPendingDelete]=useState<{type:'api';card:typeof apiCards[number]}|{type:'ai';provider:Provider}|null>(null);
 const [config,setConfig]=useState<Config>({defaultModel:'',taskModels:{},providers:[]});const [aiLoading,setAiLoading]=useState(true);
 const [aiError,setAiError]=useState('');const [aiNotice,setAiNotice]=useState('');const [savingAI,setSavingAI]=useState(false);const [testingAI,setTestingAI]=useState(false);const [aiTestPassed,setAiTestPassed]=useState(false);
 const [provider,setProvider]=useState<Catalog>(catalog[0]);const [key,setKey]=useState('');const [base,setBase]=useState('');const [models,setModels]=useState<Array<{id:string;name:string}>>([]);
 const [model,setModel]=useState<{id:string;name:string}|null>(null);const [manualModelId,setManualModelId]=useState('');const [loadingModels,setLoadingModels]=useState(false);const [modelError,setModelError]=useState('');
 const loadAPI=async()=>{setApiLoading(true);try{setStatuses(await request('/api/v1/settings/integrations'));}catch(e){setApiError(e instanceof Error?e.message:'读取 API 状态失败');}finally{setApiLoading(false);}};
 const loadAI=async()=>{setAiLoading(true);try{setConfig(await request<Config>('/api/v1/settings/ai-config'));}catch(e){setAiError(e instanceof Error?e.message:'读取 AI 配置失败');}finally{setAiLoading(false);}};
 useEffect(()=>{void loadAPI();void loadAI();},[]);
 const saveAPI=async(card:typeof apiCards[number])=>{const body:Record<string,string>={};card.fields.forEach(f=>{if(values[f.key]?.trim())body[f.key]=values[f.key].trim();});if(!Object.keys(body).length){setApiError('请填写 '+card.name+' 凭证。');return;}setApiSaving(card.id);setApiError('');try{await request('/api/v1/settings/integrations',{method:'POST',body:JSON.stringify(body)});setValues(v=>{const n={...v};Object.keys(body).forEach(k=>delete n[k]);return n;});setApiNotice(card.name+' 配置已加密保存。');await loadAPI();}catch(e){setApiError(e instanceof Error?e.message:'保存失败');}finally{setApiSaving('');}};
 const testAPI=async(card:typeof apiCards[number])=>{setApiTesting(card.id);try{const r=await request<{ok:boolean;message?:string}>('/api/v1/settings/integrations/test',{method:'POST',body:JSON.stringify({service:card.test})});setTests(t=>({...t,[card.id]:{ok:r.ok,message:r.message||'测试完成'}}));}catch(e){setTests(t=>({...t,[card.id]:{ok:false,message:e instanceof Error?e.message:'测试失败'}}));}finally{setApiTesting('');}};
 const deleteAPI=async(card:typeof apiCards[number])=>{setApiSaving(card.id);try{await request('/api/v1/settings/integrations/'+card.id,{method:'DELETE'});setApiNotice(card.name+' 凭证已删除。');await loadAPI();}catch(e){setApiError(e instanceof Error?e.message:'删除失败');}finally{setApiSaving('');}};
 const providerItems=useMemo(()=>catalog,[]);
 const getModels=async()=>{setAiTestPassed(false);setLoadingModels(true);setModels([]);setModel(null);setManualModelId('');setModelError('');try{const r=await request<{models:Array<{id:string;name:string}>}>('/api/v1/settings/ai-providers/models',{method:'POST',body:JSON.stringify({providerKey:provider.id,protocol:provider.protocol,baseUrl:base||provider.baseUrl,apiKey:key})});setModels(r.models);setModel(r.models[0]||null);}catch(e){setModelError(e instanceof Error?e.message:'获取模型失败');}finally{setLoadingModels(false);}};
 const testAI=async()=>{if(!model)return;setAiTestPassed(false);setTestingAI(true);setAiError('');try{const r=await request<{ok:boolean;message:string}>('/api/v1/settings/ai-providers/test',{method:'POST',body:JSON.stringify({providerKey:provider.id,protocol:provider.protocol,baseUrl:base||provider.baseUrl,model:model.id,apiKey:key})});if(!r.ok)throw new Error(r.message);setAiTestPassed(true);setAiNotice(r.message);}catch(e){setAiError(e instanceof Error?e.message:'AI 测试失败');}finally{setTestingAI(false);}};
 const saveAI=async()=>{if(!model)return;if(!aiTestPassed){setAiError('请先测试模型连接，测试成功后才能保存。');return;}if(provider.needsKey!==false&&!key.trim()){setAiError('请填写 API Key');return;}setSavingAI(true);setAiError('');try{const item:Provider={id:crypto.randomUUID(),providerKey:provider.id,name:provider.name,protocol:provider.protocol,baseUrl:base||provider.baseUrl,model:model.id,configured:true,enabled:true};await request('/api/v1/settings/ai-providers',{method:'POST',body:JSON.stringify({provider:item,apiKey:key})});setKey('');setModels([]);setModel(null);setManualModelId('');setBase('');setAiTestPassed(false);setAiNotice(provider.name+' / '+model.id+' 已保存。');await loadAI();}catch(e){setAiError(e instanceof Error?e.message:'保存 AI 配置失败');}finally{setSavingAI(false);}};
 const testSaved=async(p:Provider)=>{setTestingAI(true);try{const r=await request<{ok:boolean;message:string}>('/api/v1/settings/ai-providers/test',{method:'POST',body:JSON.stringify({providerKey:p.providerKey,protocol:p.protocol,baseUrl:p.baseUrl,model:p.model,secretName:p.secretName})});if(!r.ok)throw new Error(r.message);setAiNotice(p.name+'：'+r.message);}catch(e){setAiError(e instanceof Error?e.message:'测试失败');}finally{setTestingAI(false);}};
 const removeAI=async(p:Provider)=>{setSavingAI(true);try{await request('/api/v1/settings/ai-providers/'+encodeURIComponent(p.id),{method:'DELETE'});setAiNotice('AI 配置已删除。');await loadAI();}catch(e){setAiError(e instanceof Error?e.message:'删除失败');}finally{setSavingAI(false);}};
 const setDefault=async(p:Provider)=>{setSavingAI(true);try{const modelRef=p.id+'::'+p.model;const next={...config,defaultModel:modelRef,taskModels:{...config.taskModels,agent_chat:modelRef,agent_planning:modelRef}};await request('/api/v1/settings/ai-config',{method:'PUT',body:JSON.stringify(next)});setConfig(next);setAiNotice('已将 '+p.name+' 设为小雅默认模型。');}catch(e){setAiError(e instanceof Error?e.message:'设置默认模型失败');}finally{setSavingAI(false);}};
 return <>
 <div className="tp-integrations-settings">
 {section==='api'&&<><div className="tp-integrations-settings__intro"><h3>API 集成</h3><p>统一管理业务模块的第三方服务凭证。凭证在服务端加密保存，页面不会读取或回显密钥。</p></div>
 {apiError&&<InlineNotification kind="error" title="API 配置失败" subtitle={apiError} onCloseButtonClick={()=>setApiError('')}/>}
 {apiNotice&&<InlineNotification kind="success" title="操作完成" subtitle={apiNotice} onCloseButtonClick={()=>setApiNotice('')}/>}
 {apiLoading?<InlineLoading description="正在读取 API 配置…"/>:<div className="tp-integrations-settings__api-grid">{apiCards.map(card=><Tile key={card.id} className="tp-integrations-settings__card">
 <div className="tp-integrations-settings__heading"><div className="tp-integrations-settings__provider"><Logo logo={card.logo} initial={card.initial}/><div><h4>{card.name}</h4><p>{card.description}</p></div></div><Tag type={card.fields.every(f=>statuses[f.key])?'green':'cool-gray'}>{card.fields.every(f=>statuses[f.key])?'已配置':card.fields.some(f=>statuses[f.key])?'部分配置':'待配置'}</Tag></div>
 <div className="tp-integrations-settings__fields">{card.fields.map(f=><TextInput key={f.key} id={'integration-'+f.key} labelText={f.label} type="password" autoComplete="new-password" placeholder={statuses[f.key]?'已保存 · 输入新值可更新':'填写 '+f.label} value={values[f.key]||''} onChange={e=>setValues(v=>({...v,[f.key]:e.currentTarget.value}))}/>)}</div>
 {tests[card.id]&&<InlineNotification kind={tests[card.id].ok?'success':'error'} title={tests[card.id].ok?'测试成功':'测试失败'} subtitle={tests[card.id].message}/>}
 <div className="tp-integrations-settings__actions"><Button kind="primary" disabled={Boolean(apiSaving)||!card.fields.some(f=>Boolean(values[f.key]?.trim()))} onClick={()=>void saveAPI(card)}>{apiSaving===card.id?'正在保存…':'保存配置'}</Button><Button kind="secondary" disabled={Boolean(apiTesting)||!card.fields.every(f=>statuses[f.key])} onClick={()=>void testAPI(card)}>{apiTesting===card.id?'正在测试…':'测试连接'}</Button>{card.fields.some(f=>statuses[f.key])&&<Button kind="ghost" disabled={Boolean(apiSaving)} onClick={()=>setPendingDelete({type:'api',card})}>删除</Button>}</div>
 </Tile>)}</div>}</>}
 {section==='ai'&&<><div className="tp-integrations-settings__intro"><h3>AI 模型集成</h3><p>支持添加多个供应商及多个模型配置。每个实例独立保存；先填写凭证、获取模型、测试连接，再保存。</p></div>
 {aiError&&<InlineNotification kind="error" title="AI 配置失败" subtitle={aiError} onCloseButtonClick={()=>setAiError('')}/>}
 {aiNotice&&<InlineNotification kind="success" title="操作完成" subtitle={aiNotice} onCloseButtonClick={()=>setAiNotice('')}/>}
 {aiLoading?<InlineLoading description="正在读取 AI 配置…"/>:<>
 <div className="tp-integrations-settings__saved"><h4>已保存的模型配置 <Tag type="cool-gray">{config.providers.length}</Tag></h4>{config.providers.length?<div className="tp-integrations-settings__saved-grid">{config.providers.map(p=><Tile key={p.id} className="tp-integrations-settings__card"><div className="tp-integrations-settings__heading"><div className="tp-integrations-settings__provider"><Logo logo={catalog.find(c=>c.id===p.providerKey)?.logo||'cloudflare'} initial={p.name.slice(0,2)}/><div><h4>{p.name}</h4><p>{p.model}</p></div></div><Tag type={p.configured?'green':'red'}>{p.configured?'已配置':'凭证缺失'}</Tag></div><div className="tp-integrations-settings__actions"><Button kind="secondary" disabled={testingAI} onClick={()=>void testSaved(p)}>测试连接</Button><Button kind="secondary" disabled={savingAI||!p.configured} onClick={()=>void setDefault(p)}>设为小雅默认</Button><Button kind="ghost" disabled={savingAI} onClick={()=>setPendingDelete({type:'ai',provider:p})}>删除</Button></div></Tile>)}</div>:<p>尚未添加 AI 模型配置。</p>}</div>
 <Tile className="tp-integrations-settings__add"><h4>添加 AI 模型配置</h4><div className="tp-integrations-settings__form">
 <Dropdown id="ai-provider-dropdown" titleText="AI 供应商" label="选择供应商" items={providerItems} selectedItem={provider} itemToString={item=>item?.name||''} itemToElement={item=><div className="tp-integrations-settings__dropdown-item"><Logo logo={item.logo} initial={item.initial}/><span>{item.name}</span></div>} renderSelectedItem={item=><div className="tp-integrations-settings__dropdown-item"><Logo logo={item.logo} initial={item.initial}/><span>{item.name}</span></div>} onChange={({selectedItem})=>{if(selectedItem){setProvider(selectedItem);setKey('');setBase(selectedItem.baseUrl);setModels([]);setModel(null);setManualModelId('');setModelError('');setAiTestPassed(false);}}}/>
 {provider.id==='custom'&&<TextInput id="ai-custom-base-url" labelText="Base URL" placeholder="https://api.example.com/v1" value={base} onChange={e=>{setBase(e.currentTarget.value);setAiTestPassed(false);}}/>}
 {provider.needsKey!==false&&<TextInput id="ai-provider-key" labelText="API Key" type="password" autoComplete="new-password" placeholder={'输入 '+provider.name+' API Key'} value={key} onChange={e=>{setKey(e.currentTarget.value);setAiTestPassed(false);}}/>}
 {provider.id==='cloudflare-workers-ai'&&<p>使用 API 集成中配置的 Cloudflare Workers AI Token 与 Account ID，无需重复填写。</p>}
 <Button kind="secondary" disabled={loadingModels||(provider.needsKey!==false&&!key.trim())||(provider.id==='custom'&&!base.trim())} onClick={()=>void getModels()}>{loadingModels?'正在获取模型…':'获取模型列表'}</Button>
 {modelError&&<InlineNotification kind="error" title="模型列表获取失败" subtitle={modelError}/>}
 {models.length>0&&<Dropdown id="ai-model-dropdown" titleText="模型选择" label="选择模型" items={models} selectedItem={model} itemToString={item=>item?.id||''} onChange={({selectedItem})=>{setModel(selectedItem||null);setManualModelId(selectedItem?.id||'');setAiTestPassed(false);}}/>}
 <TextInput id="ai-model-manual" labelText="模型 ID（手动输入 / 覆盖）" placeholder="供应商模型目录不可用时，可填写模型 ID" value={manualModelId} onChange={e=>{const value=e.currentTarget.value;setManualModelId(value);setModel(value.trim()?{id:value.trim(),name:value.trim()}:null);setAiTestPassed(false);}}/>
 {model&&<p className="tp-integrations-settings__model-preview">当前模型：<strong>{model.id}</strong></p>}
 <div className="tp-integrations-settings__actions"><Button kind="secondary" disabled={!model||testingAI} onClick={()=>void testAI()}>{testingAI?'正在测试…':'测试连接'}</Button><Button kind="primary" disabled={!model||!aiTestPassed||savingAI||testingAI} onClick={()=>void saveAI()}>{savingAI?'正在保存…':'保存模型配置'}</Button></div>
 </div></Tile></>}
 </>}
 </div>
  <Modal
   open={Boolean(pendingDelete)}
   modalHeading={pendingDelete?.type==='api'?'删除 API 凭证？':'删除 AI 模型配置？'}
   primaryButtonText="确认删除"
   secondaryButtonText="取消"
   danger
   onRequestClose={()=>setPendingDelete(null)}
   onRequestSubmit={()=>{const target=pendingDelete;setPendingDelete(null);if(target?.type==='api')void deleteAPI(target.card);else if(target?.type==='ai')void removeAI(target.provider);}}
  >
   <p>{pendingDelete?.type==='api'?'删除后，使用该凭证的业务模块将无法继续调用对应 API，除非重新配置。':'删除后，小雅和 Agent 将无法再使用此供应商模型配置。'}</p>
  </Modal>
 </>;
}
