import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Button, Checkbox, InlineLoading, InlineNotification, NumberInput, ProgressBar,
  Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableHeader, TableRow, Tag, TextInput,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import {
  createDiscoveryRun, getDiscoveryRecords, getDiscoveryRun, getDiscoveryRuns,
  type DiscoveryRecord, type DiscoveryRun,
} from './api';
import '@/design-system/patterns/prospect-discovery.scss';

type Category = 'maps' | 'social' | 'ecommerce';
type Platform = 'google_maps' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'amazon' | 'alibaba' | 'aliexpress';
type Step = 1 | 2 | 3 | 4;
const platformGroups: Array<{ id: Category; title: string; description: string; platforms: Array<{id: Platform;name:string;enabled:boolean;hint:string}> }> = [
  { id:'maps', title:'地图平台', description:'按地区发现企业、门店和经销商', platforms:[{id:'google_maps',name:'Google Maps',enabled:true,hint:'Google Places API（官方）'}] },
  { id:'social', title:'社交媒体', description:'发现企业主页、品牌账号和公开商业资料', platforms:[{id:'facebook',name:'Facebook Pages',enabled:true,hint:'Apify · Facebook 搜索 Actor'},{id:'instagram',name:'Instagram',enabled:true,hint:'Apify · Instagram Scraper'},{id:'linkedin',name:'LinkedIn',enabled:false,hint:'Actor 接入待验证'},{id:'tiktok',name:'TikTok',enabled:false,hint:'Actor 接入待验证'}] },
  { id:'ecommerce', title:'电商平台', description:'发现商品、店铺和供应商线索', platforms:[{id:'amazon',name:'Amazon',enabled:false,hint:'Actor 接入待验证'},{id:'alibaba',name:'Alibaba.com',enabled:false,hint:'Actor 接入待验证'},{id:'aliexpress',name:'AliExpress',enabled:false,hint:'Actor 接入待验证'}] },
];
const countryItems=[['US','美国'],['GB','英国'],['DE','德国'],['FR','法国'],['JP','日本'],['TW','中国台湾'],['KR','韩国'],['SG','新加坡'],['AU','澳大利亚'],['CA','加拿大'],['AE','阿联酋'],['NL','荷兰'],['IT','意大利'],['ES','西班牙'],['IN','印度'],['BR','巴西']] as const;
const businessOptions=[['distributor','经销商 / 分销商'],['manufacturer','制造商'],['electrical_equipment','电子设备供应商'],['electronics','电子产品零售商'],['computer_network','电脑与网络设备商'],['mobile_communications','手机与通信设备商'],['industrial_supplies','工业用品供应商'],['corporate_office','企业办公室']];
const terminalStatuses=new Set(['completed','partial','failed','cancelled']);
const statusLabels:Record<string,string>={queued:'排队中',running:'执行中',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消',planned:'待执行',awaiting_approval:'等待确认'};
const channelLabels:Record<string,string>={map_local_businesses:'Google Maps',facebook:'Facebook',instagram:'Instagram'};
const isTerminal=(status:string)=>terminalStatuses.has(status);

export function ProspectDiscoveryPage() {
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [booting,setBooting]=useState(true);
  const [authBusy,setAuthBusy]=useState(false);
  const [error,setError]=useState('');
  const [step,setStep]=useState<Step>(1);
  const [category,setCategory]=useState<Category>('maps');
  const [platform,setPlatform]=useState<Platform>('google_maps');
  const [query,setQuery]=useState('电子产品批发商');
  const [country,setCountry]=useState('US');
  const [stateName,setStateName]=useState('');
  const [city,setCity]=useState('');
  const [limit,setLimit]=useState(100);
  const [minRating,setMinRating]=useState('0');
  const [requireWebsite,setRequireWebsite]=useState(false);
  const [requirePhone,setRequirePhone]=useState(false);
  const [businessTypes,setBusinessTypes]=useState<string[]>(['distributor','manufacturer','electronics']);
  const [facebookPages,setFacebookPages]=useState(true);
  const [instagramMinFollowers,setInstagramMinFollowers]=useState(100);
  const [activeRun,setActiveRun]=useState<DiscoveryRun|null>(null);
  const [records,setRecords]=useState<DiscoveryRecord[]>([]);
  const [runs,setRuns]=useState<DiscoveryRun[]>([]);
  const [polling,setPolling]=useState(false);
  const [lastUpdate,setLastUpdate]=useState<Date|null>(null);
  const [clock,setClock]=useState(Date.now());
  const activitySignature=useRef('');

  useEffect(()=>{let alive=true;let subscription: {unsubscribe:()=>void}|undefined;
    getSupabaseClient().then(async supabase=>{
      if(!alive)return;setClient(supabase);
      const {data}=await supabase.auth.getSession();if(alive)setSession(data.session);
      const listener=supabase.auth.onAuthStateChange((_event,next)=>{if(alive)setSession(next);});
      subscription=listener.data.subscription;
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'连接初始化失败');}).finally(()=>{if(alive)setBooting(false);});
    return()=>{alive=false;subscription?.unsubscribe();};
  },[]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const currentPlatform=useMemo(()=>platformGroups.flatMap(g=>g.platforms).find(p=>p.id===platform),[platform]);
  const chooseCategory=(next:Category)=>{setCategory(next);const first=platformGroups.find(g=>g.id===next)?.platforms.find(p=>p.enabled);if(first)setPlatform(first.id);setStep(1);};
  const token=session?.access_token??'';

  const refreshRun=useCallback(async(id:string)=>{
    if(!token)return;
    const [nextRun,nextRecords]=await Promise.all([getDiscoveryRun(token,id),getDiscoveryRecords(token,id)]);
    setActiveRun(nextRun);setRecords(nextRecords);setLastUpdate(new Date());
    return nextRun;
  },[token]);
  useEffect(()=>{
    if(!session)return;
    let alive=true;
    getDiscoveryRuns(session.access_token).then(data=>{if(alive)setRuns(data);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'无法读取任务列表');});
    return()=>{alive=false;};
  },[session]);
  useEffect(()=>{
    if(!activeRun||!token||isTerminal(activeRun.status))return;
    let alive=true;setPolling(true);
    const poll=async()=>{try{const next=await getDiscoveryRun(token,activeRun.id);const resultRows=await getDiscoveryRecords(token,activeRun.id);if(!alive)return;const latestLog=next.logs?.[next.logs.length-1];const signature=[next.status,next.progress,next.message,latestLog?.id??''].join('|');if(signature!==activitySignature.current){activitySignature.current=signature;setLastUpdate(new Date());}setActiveRun(next);setRecords(resultRows);if(isTerminal(next.status)){setPolling(false);setRuns(previous=>[next,...previous.filter(r=>r.id!==next.id)]);}}catch(e){if(alive)setError(e instanceof Error?e.message:'读取任务状态失败');}};
    void poll();const timer=window.setInterval(poll,2500);
    return()=>{alive=false;window.clearInterval(timer);setPolling(false);};
  },[activeRun?.id,activeRun?.status,token]);

  const signIn=async(event:FormEvent)=>{event.preventDefault();if(!client)return;setAuthBusy(true);setError('');try{const {error:authError}=await client.auth.signInWithPassword({email:email.trim(),password});if(authError)throw authError;}catch(e){setError(e instanceof Error?e.message:'登录失败');}finally{setAuthBusy(false);}};
  const startTask=async(event:FormEvent)=>{
    event.preventDefault();if(!client||!token)return;setError('');setAuthBusy(true);
    try{
      let channel:'map'|'facebook'|'instagram';let config:Record<string,unknown>;
      if(platform==='google_maps'){
        channel='map';config={countries:[country],query,limitPerCountry:limit,providers:['google_maps'],state:stateName||undefined,city:city||undefined,businessTypes,filters:{minRating:Number(minRating),requireWebsite,requirePhone}};
      }else if(platform==='facebook'){
        channel='facebook';config={country,state:stateName||undefined,city:city||undefined,query,objectTypes:['page'],limitPerType:limit,enrichPages:facebookPages};
      }else if(platform==='instagram'){
        channel='instagram';config={keywords:query.split(/[，,\n]/).map(v=>v.trim()).filter(Boolean),countries:[country],languageCodes:[],accountTypes:['business','creator'],minFollowers:instagramMinFollowers,maxFollowers:100000000,recentDays:365,requireContact:true,excludeTerms:[],limit,includeCaptions:false};
      }else{throw new Error('该平台尚未开放。');}
      const created=await createDiscoveryRun(client,token,channel,config);
      setActiveRun({...created,createdAt:new Date().toISOString(),logs:[]});activitySignature.current='';setLastUpdate(new Date());setRecords([]);setStep(4);
      const current=await getDiscoveryRuns(token);setRuns(current);
    }catch(e){setError(e instanceof Error?e.message:'无法创建发现任务');}finally{setAuthBusy(false);}
  };
  const selectPlatform=(id:Platform)=>{const p=platformGroups.flatMap(g=>g.platforms).find(x=>x.id===id);if(!p?.enabled)return;setPlatform(id);setCategory(platformGroups.find(g=>g.platforms.some(x=>x.id===id))!.id);};
  const elapsed=activeRun?Math.max(0,Math.floor((clock-new Date(activeRun.createdAt).getTime())/1000)):0;
  const elapsedLabel=elapsed<60?`${elapsed} 秒`:`${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`;
  const stale=!!activeRun&&!isTerminal(activeRun.status)&&lastUpdate!==null&&(clock-lastUpdate.getTime()>45000);

  if(booting)return <div className="tp-discovery__center"><InlineLoading description="正在连接 TradePilot…" /></div>;
  if(!session)return <main className="tp-discovery">
    <header className="tp-discovery__heading"><div><p className="tp-discovery__eyebrow">TRADEPILOT / PROSPECTING</p><h1>潜客发现</h1><p>登录后创建全球企业与商业账号发现任务。</p></div></header>
    {error&&<InlineNotification kind="error" title="连接错误" subtitle={error} />}
    <section className="tp-discovery__auth">
      <h2>登录 TradePilot</h2><p>使用现有 TradePilot 账号继续。</p>
      <form onSubmit={signIn}>
        <TextInput id="discovery-email" labelText="邮箱" type="email" value={email} onChange={e=>setEmail(e.currentTarget.value)} required />
        <TextInput id="discovery-password" labelText="密码" type="password" value={password} onChange={e=>setPassword(e.currentTarget.value)} required />
        <Button type="submit" disabled={!client||authBusy}>{authBusy?'正在登录…':'登录'}</Button>
      </form>
    </section>
  </main>;

  return <main className="tp-discovery">
    <header className="tp-discovery__heading"><div><p className="tp-discovery__eyebrow">TRADEPILOT / PROSPECTING</p><h1>潜客发现</h1><p>选择渠道、配置发现条件，并实时跟踪采集任务。</p></div><div className="tp-discovery__heading-actions"><Tag type="blue">Google Maps / Apify</Tag><Button kind="ghost" size="sm" onClick={()=>client?.auth.signOut()}>退出登录</Button></div></header>
    {error&&<InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={()=>setError('')} />}
    <nav className="tp-discovery__steps" aria-label="发现任务步骤">
      {([['01','发现途径'],['02','数据引擎'],['03','条件配置'],['04','执行结果']] as const).map(([number,label],index)=><button key={number} className={step===index+1?'is-active':step>index+1?'is-complete':''} onClick={()=>{if(index<3&&index+1<=step)setStep((index+1) as Step);}} disabled={index+1>step}><span>{number}</span>{label}</button>)}
    </nav>
    {step===1&&<section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>选择发现途径</h2><p>先选择发现大类，再选择一个具体平台。每次任务只使用一个平台。</p></div><Tag type="gray">单选渠道</Tag></div>
      <div className="tp-discovery__category-grid">{platformGroups.map(group=><button key={group.id} className={category===group.id?'tp-discovery__category is-selected':'tp-discovery__category'} onClick={()=>chooseCategory(group.id)}><strong>{group.title}</strong><span>{group.description}</span></button>)}</div>
      <div className="tp-discovery__platform-list">{platformGroups.find(g=>g.id===category)?.platforms.map(item=><button key={item.id} disabled={!item.enabled} className={platform===item.id?'tp-discovery__platform is-selected':'tp-discovery__platform'} onClick={()=>selectPlatform(item.id)}><span><strong>{item.name}</strong><small>{item.hint}</small></span><Tag type={item.enabled?'green':'gray'}>{item.enabled?'可用':'接入中'}</Tag></button>)}</div>
      <div className="tp-discovery__actions"><Button onClick={()=>setStep(2)} disabled={!currentPlatform?.enabled}>下一步</Button></div>
    </section>}
    {step===2&&<section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>数据引擎</h2><p>系统根据平台自动匹配 API 或 Actor，不需要手动选择。</p></div><Tag type="green">自动匹配</Tag></div>
      <div className="tp-discovery__engine-card"><div><small>发现平台</small><strong>{currentPlatform?.name}</strong></div><div><small>执行服务</small><strong>{platform==='google_maps'?'Google Places API（官方）':'Apify Actor'}</strong></div><div><small>采集引擎</small><strong>{platform==='google_maps'?'Places API · Text Search / Nearby Search':platform==='facebook'?'coregent/facebook-search-scraper（主页详情按需补充）':'apify/instagram-search-scraper（公开账号资料补充）'}</strong></div><div><small>配置状态</small><Tag type="blue">运行时校验凭证</Tag></div></div>
      <InlineNotification kind="info" title="自动路由" subtitle="API Key 仅从 Worker 安全环境读取。任务页面不会展示或保存密钥；如果服务未配置，启动时会明确提示，不会假装任务已执行。" />
      <div className="tp-discovery__actions"><Button kind="secondary" onClick={()=>setStep(1)}>上一步</Button><Button onClick={()=>setStep(3)}>配置搜索条件</Button></div>
    </section>}
    {step===3&&<section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>配置发现条件</h2><p>根据所选平台显示对应字段，尽可能使用预设选项降低输入错误。</p></div><Tag type="blue">{currentPlatform?.name}</Tag></div>
      <form className="tp-discovery__form" onSubmit={startTask}>
        <TextInput id="discovery-query" labelText={platform==='instagram'?'关键词 / Hashtag（多个用逗号分隔）':'搜索关键词'} helperText="例如：消费电子批发商、手机配件经销商、电脑周边供应商" value={query} onChange={e=>setQuery(e.currentTarget.value)} required />
        <div className="tp-discovery__form-grid">
          <Select id="discovery-country" labelText="目标国家 / 地区" value={country} onChange={e=>setCountry(e.currentTarget.value)}>{countryItems.map(([code,name])=><SelectItem key={code} value={code} text={name}/>)}</Select>
          <NumberInput id="discovery-limit" label="最大候选数量" min={1} max={500} step={10} value={limit} onChange={(_event,{value})=>setLimit(Number(value)||100)} />
        </div>
        {platform!=='instagram'&&<div className="tp-discovery__form-grid"><TextInput id="discovery-state" labelText="州 / 省（可选）" value={stateName} onChange={e=>setStateName(e.currentTarget.value)} /><TextInput id="discovery-city" labelText="城市（可选）" value={city} onChange={e=>setCity(e.currentTarget.value)} /></div>}
        {platform==='google_maps'&&<>
          <fieldset className="tp-discovery__fieldset"><legend>企业类型（可多选）</legend><div className="tp-discovery__checkbox-grid">{businessOptions.map(([value,label])=><Checkbox key={value} id={`business-${value}`} labelText={label} checked={businessTypes.includes(value)} onChange={(_,data)=>setBusinessTypes(prev=>data.checked?[...prev,value]:prev.filter(x=>x!==value))}/>)}</div></fieldset>
          <div className="tp-discovery__form-grid"><Select id="discovery-rating" labelText="最低评分" value={minRating} onChange={e=>setMinRating(e.currentTarget.value)}><SelectItem value="0" text="不限"/><SelectItem value="3" text="3.0 分以上"/><SelectItem value="3.5" text="3.5 分以上"/><SelectItem value="4" text="4.0 分以上"/><SelectItem value="4.5" text="4.5 分以上"/></Select><div className="tp-discovery__checkbox-stack"><Checkbox id="require-website" labelText="必须有官网" checked={requireWebsite} onChange={(_,d)=>setRequireWebsite(d.checked)}/><Checkbox id="require-phone" labelText="必须有电话" checked={requirePhone} onChange={(_,d)=>setRequirePhone(d.checked)}/></div></div>
        </>}
        {platform==='facebook'&&<fieldset className="tp-discovery__fieldset"><legend>采集范围</legend><Checkbox id="facebook-page-enrich" labelText="补充公开主页详情（可能增加采集耗时）" checked={facebookPages} onChange={(_,d)=>setFacebookPages(d.checked)}/></fieldset>}
        {platform==='instagram'&&<div className="tp-discovery__form-grid"><NumberInput id="instagram-followers" label="最低粉丝数" min={0} max={100000000} step={100} value={instagramMinFollowers} onChange={(_event,{value})=>setInstagramMinFollowers(Number(value)||0)}/><div className="tp-discovery__field-note">仅发现公开商业 / 创作者账号；联系方式以公开资料为准。</div></div>}
        <div className="tp-discovery__actions"><Button kind="secondary" type="button" onClick={()=>setStep(2)}>上一步</Button><Button type="submit" disabled={authBusy||!query.trim()||!limit||((platform==='google_maps')&&!businessTypes.length)}>{authBusy?'正在创建任务…':'开始发现'}</Button></div>
      </form>
    </section>}
    {step===4&&<section className="tp-discovery__panel">
      <div className="tp-discovery__section-head"><div><h2>任务执行与发现结果</h2><p>日志每 2.5 秒刷新一次；任务阶段和进度来自后台真实状态，不使用虚假的动画百分比。</p></div>{activeRun&&<Tag type={isTerminal(activeRun.status)?'green':'blue'}>{statusLabels[activeRun.status]??activeRun.status}</Tag>}</div>
      {activeRun?<><div className="tp-discovery__run-summary"><div><small>任务编号</small><strong>{activeRun.taskCode}</strong></div><div><small>已运行</small><strong>{elapsedLabel}</strong></div><div><small>发现记录</small><strong>{activeRun.discoveredCount}</strong></div><div><small>潜客入库</small><strong>{activeRun.createdLeadCount}</strong></div></div>
        <ProgressBar label="后台执行进度" value={activeRun.progress??0} max={100} helperText={activeRun.message}/>
        <div className="tp-discovery__activity"><div className="tp-discovery__activity-head"><h3>动态执行日志</h3><span>{polling?'实时轮询中':isTerminal(activeRun.status)?'执行已结束':'等待更新'} · {lastUpdate?lastUpdate.toLocaleTimeString():'读取中'}</span></div>
          {stale&&<InlineNotification kind="warning" lowContrast title="正在等待数据源响应" subtitle="后台仍在运行或重试。当前没有收到新日志，页面会继续检查，不代表任务已经卡死。" />}
          {activeRun.logs.length?<ol className="tp-discovery__log-list">{activeRun.logs.map(log=><li key={log.id} className={`is-${log.level}`}><span className="tp-discovery__log-dot"/><div><p>{log.message}</p><time>{new Date(log.createdAt).toLocaleTimeString()}</time></div></li>)}</ol>:<InlineLoading description="等待后台工作流写入第一条执行日志…" />}
          {!isTerminal(activeRun.status)&&<div className="tp-discovery__heartbeat"><span className="tp-discovery__pulse"/><span>任务仍在执行 · 已运行 {elapsedLabel} · 自动刷新中</span></div>}
        </div>
        <div className="tp-discovery__results"><div className="tp-discovery__activity-head"><h3>搜索结果</h3><Tag type="gray">{records.length} 条</Tag></div>
          <TableContainer><Table size="lg"><TableHead><TableRow><TableHeader>名称</TableHeader><TableHeader>类型 / 地区</TableHeader><TableHeader>联系方式</TableHeader><TableHeader>来源</TableHeader></TableRow></TableHead><TableBody>{records.map(record=><TableRow key={record.id}><TableCell><strong>{record.name}</strong><div className="tp-discovery__muted">{record.website??'暂无官网'}</div></TableCell><TableCell>{record.record_type} · {record.country_code??'—'}</TableCell><TableCell>{[record.email,record.phone].filter(Boolean).join(' / ')||'待补充'}</TableCell><TableCell>{channelLabels[record.channel]??record.channel}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
          {records.length===0&&<p className="tp-discovery__empty">任务发现结果将在采集并写入数据库后自动出现。</p>}
        </div>
      </>:<InlineNotification kind="info" title="尚未选择任务" subtitle="请先完成发现途径和条件配置。" />}
      <div className="tp-discovery__actions"><Button kind="secondary" onClick={()=>setStep(1)}>创建新任务</Button><Button kind="ghost" onClick={()=>{if(activeRun)void refreshRun(activeRun.id);}}>刷新状态</Button></div>
    </section>}
    <section className="tp-discovery__history"><div className="tp-discovery__activity-head"><h2>最近任务</h2><Button kind="ghost" size="sm" onClick={()=>getDiscoveryRuns(token).then(setRuns).catch(e=>setError(String(e)))}>刷新列表</Button></div>
      {runs.length?<div className="tp-discovery__history-list">{runs.slice(0,8).map(run=><button key={run.id} onClick={()=>{void refreshRun(run.id);setStep(4);}}><span><strong>{run.taskCode}</strong><small>{channelLabels[run.channel]??run.channel} · {run.query}</small></span><span><Tag type={isTerminal(run.status)?'green':'blue'}>{statusLabels[run.status]??run.status}</Tag><small>{run.discoveredCount} 条 · {new Date(run.createdAt).toLocaleString()}</small></span></button>)}</div>:<p className="tp-discovery__empty">暂无发现任务。</p>}
    </section>
  </main>;
}
