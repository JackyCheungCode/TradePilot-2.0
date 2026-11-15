import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProspectDiscoveryHeader } from './ProspectDiscoveryHeader';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Button, Checkbox, InlineLoading, InlineNotification, NumberInput, ProgressBar,
  Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableHeader, TableRow, Tag, TextInput, RadioButton, RadioButtonGroup, Tabs, TabList, Tab,
  Layer, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import {
  createDiscoveryRun, getDiscoveryRecords, getDiscoveryRun,
  type DiscoveryRecord, type DiscoveryRun,
} from './api';
import '@/design-system/patterns/prospect-discovery.scss';

import { platformGroups, type CategoryFilter, type Platform } from './platform-catalog';
type Step = 1 | 2 | 3 | 4 | 5;
const countryItems=[['US','美国'],['GB','英国'],['DE','德国'],['FR','法国'],['JP','日本'],['TW','中国台湾'],['KR','韩国'],['SG','新加坡'],['AU','澳大利亚'],['CA','加拿大'],['AE','阿联酋'],['NL','荷兰'],['IT','意大利'],['ES','西班牙'],['IN','印度'],['BR','巴西']] as const;
const businessOptions=[['distributor','经销商 / 分销商'],['manufacturer','制造商'],['electrical_equipment','电子设备供应商'],['electronics','电子产品零售商'],['computer_network','电脑与网络设备商'],['mobile_communications','手机与通信设备商'],['industrial_supplies','工业用品供应商'],['corporate_office','企业办公室']];
const terminalStatuses=new Set(['completed','partial','failed','cancelled']);
const statusLabels:Record<string,string>={queued:'排队中',running:'执行中',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消',planned:'待执行',awaiting_approval:'等待确认'};
const channelLabels:Record<string,string>={map_local_businesses:'Google Maps',facebook:'Facebook',instagram:'Instagram'};
const isTerminal=(status:string)=>terminalStatuses.has(status);
function extraContactValues(record:DiscoveryRecord):string[]{
  const found:string[]=[];
  const visit=(value:unknown,path:string):void=>{
    if(value===null||value===undefined)return;
    if(Array.isArray(value)){value.forEach(item=>visit(item,path));return;}
    if(typeof value==='object'){for(const [key,item] of Object.entries(value as Record<string,unknown>))visit(item,key);return;}
    if((typeof value==='string'||typeof value==='number')&&/email|phone|whatsapp|telegram|wechat|line|contact|social/i.test(path)){
      const text=String(value).trim();if(text&&text.length<300)found.push(path+': '+text);
    }
  };
  visit(record.raw_data,'');
  return [...new Set(found)].slice(0,3);
}

export function ProspectDiscoveryPage() {
  const [searchParams]=useSearchParams();
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [booting,setBooting]=useState(true);
  const [authBusy,setAuthBusy]=useState(false);
  const [error,setError]=useState('');
  const [step,setStep]=useState<Step>(1);
  const [category,setCategory]=useState<CategoryFilter>('all');
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
  const [selectedRecordIds,setSelectedRecordIds]=useState<string[]>([]);
  const [recordActionBusy,setRecordActionBusy]=useState(false);
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
  const visiblePlatformGroups=useMemo(()=>category==='all'?platformGroups:platformGroups.filter(group=>group.id===category),[category]);
  const token=session?.access_token??'';
  useEffect(()=>{
    const runId=searchParams.get('runId');
    if(!runId||!token)return;
    let alive=true;
    Promise.all([getDiscoveryRun(token,runId),getDiscoveryRecords(token,runId)]).then(([run,rows])=>{
      if(!alive)return;setActiveRun(run);setRecords(rows);setSelectedRecordIds([]);
      setStep(isTerminal(run.status)&&(run.status==='completed'||run.status==='partial')?5:4);
      setLastUpdate(new Date());
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'无法打开任务详情');});
    return()=>{alive=false;};
  },[searchParams,token]);


  const refreshRun=useCallback(async(id:string)=>{
    if(!token)return;
    const [nextRun,nextRecords]=await Promise.all([getDiscoveryRun(token,id),getDiscoveryRecords(token,id)]);
    setActiveRun(nextRun);setRecords(nextRecords);setSelectedRecordIds([]);setLastUpdate(new Date());
    return nextRun;
  },[token]);
  useEffect(()=>{
    if(!activeRun||!token||isTerminal(activeRun.status))return;
    let alive=true;setPolling(true);
    const poll=async()=>{try{const next=await getDiscoveryRun(token,activeRun.id);const resultRows=await getDiscoveryRecords(token,activeRun.id);if(!alive)return;const latestLog=next.logs?.[next.logs.length-1];const signature=[next.status,next.progress,next.message,latestLog?.id??''].join('|');if(signature!==activitySignature.current){activitySignature.current=signature;setLastUpdate(new Date());}setActiveRun(next);setRecords(resultRows);if(isTerminal(next.status)){setPolling(false);if(next.status==='completed'||next.status==='partial')setStep(5);}}catch(e){if(alive)setError(e instanceof Error?e.message:'读取任务状态失败');}};
    void poll();const timer=window.setInterval(poll,2500);
    return()=>{alive=false;window.clearInterval(timer);setPolling(false);};
  },[activeRun?.id,activeRun?.status,token]);

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
      setActiveRun({...created,createdAt:new Date().toISOString(),logs:[]});activitySignature.current='';setLastUpdate(new Date());setRecords([]);setSelectedRecordIds([]);setStep(4);
    }catch(e){setError(e instanceof Error?e.message:'无法创建发现任务');}finally{setAuthBusy(false);}
  };
  const selectPlatform=(id:Platform)=>{const p=platformGroups.flatMap(g=>g.platforms).find(x=>x.id===id);if(!p?.enabled)return;setPlatform(id);};
  const selectCategory=(value:CategoryFilter)=>{setCategory(value);const groups=value==='all'?platformGroups:platformGroups.filter(group=>group.id===value);setPlatform(current=>{const currentItem=groups.flatMap(group=>group.platforms).find(item=>item.id===current&&item.enabled);if(currentItem)return current;const firstEnabled=groups.flatMap(group=>group.platforms).find(item=>item.enabled);return firstEnabled?.id??groups[0]?.platforms[0]?.id??current;});};
  const elapsed=activeRun?Math.max(0,Math.floor((clock-new Date(activeRun.createdAt).getTime())/1000)):0;
  const elapsedLabel=elapsed<60?`${elapsed} 秒`:`${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`;
  const stale=!!activeRun&&!isTerminal(activeRun.status)&&lastUpdate!==null&&(clock-lastUpdate.getTime()>45000);
  const runSingleRecordAction=async(id:string,action:'remove'|'discard'|'promote')=>{
    if(!token||!activeRun)return;setRecordActionBusy(true);setError('');
    try{const {applyDiscoveryRecordAction}=await import('./api');await applyDiscoveryRecordAction(token,id,action,activeRun.id);setRecords(await getDiscoveryRecords(token,activeRun.id));setSelectedRecordIds(prev=>prev.filter(item=>item!==id));}
    catch(e){setError(e instanceof Error?e.message:'结果操作失败');}finally{setRecordActionBusy(false);}
  };
  const runBulkRecordAction=async(action:'remove'|'discard'|'promote')=>{
    if(!token||!activeRun||!selectedRecordIds.length)return;setRecordActionBusy(true);setError('');
    try{const {applyDiscoveryRecordAction}=await import('./api');const ids=[...selectedRecordIds];const outcomes=await Promise.allSettled(ids.map(id=>applyDiscoveryRecordAction(token,id,action,activeRun.id)));const failed=outcomes.filter(item=>item.status==='rejected').length;setRecords(await getDiscoveryRecords(token,activeRun.id));setSelectedRecordIds([]);if(failed)setError(`${failed} 条记录操作失败，其余记录已处理。`);}
    catch(e){setError(e instanceof Error?e.message:'批量操作失败');}finally{setRecordActionBusy(false);}
  };


  if(booting)return <div className="tp-discovery__center"><InlineLoading description="正在连接 TradePilot…" /></div>;

  return <main className="tp-discovery">
    <ProspectDiscoveryHeader title="潜客发现" description="选择渠道、配置发现条件，并实时跟踪采集任务。">

    </ProspectDiscoveryHeader>
    {error&&<InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={()=>setError('')} />}
    <nav className="tp-discovery__steps" aria-label="发现任务步骤">
      {([['01','发现途径'],['02','数据引擎'],['03','条件配置'],['04','任务执行'],['05','查看结果']] as const).map(([number,label],index)=><button key={number} className={step===index+1?'is-active':step>index+1?'is-complete':''} onClick={()=>{if(index<5&&index+1<=step)setStep((index+1) as Step);}} disabled={index+1>step}><span>{number}</span>{label}</button>)}
    </nav>
    {step===1&&<>
      <section className="tp-discovery__panel tp-discovery__category-panel">
        <div className="tp-discovery__section-head"><div><h2><CarbonIcons.Search size={20} aria-hidden="true"/>选择发现平台大类</h2><p>先选择发现渠道类别。默认显示全部平台，便于快速浏览。</p></div><Tag type="gray">第 1 层 · 平台类别</Tag></div>
        <div className="tp-discovery__category-tabs">
          <Tabs
            selectedIndex={(['all','maps','social','ecommerce'] as CategoryFilter[]).indexOf(category)}
            onChange={({selectedIndex})=>selectCategory((['all','maps','social','ecommerce'] as CategoryFilter[])[selectedIndex]??'all')}
          >
            <TabList aria-label="发现平台大类" contained>
              <Tab><span className="tp-discovery__category-tab"><CarbonIcons.Apps size={20} aria-hidden="true"/>全部平台</span></Tab>
              <Tab><span className="tp-discovery__category-tab"><CarbonIcons.Map size={20} aria-hidden="true"/>地图平台</span></Tab>
              <Tab><span className="tp-discovery__category-tab"><CarbonIcons.Share size={20} aria-hidden="true"/>社交媒体</span></Tab>
              <Tab><span className="tp-discovery__category-tab"><CarbonIcons.ShoppingCart size={20} aria-hidden="true"/>电商平台</span></Tab>
            </TabList>
          </Tabs>
        </div>
      </section>
      <section className="tp-discovery__panel tp-discovery__platform-panel">
        <div className="tp-discovery__section-head"><div><h2><CarbonIcons.Search size={20} aria-hidden="true"/>选择具体发现平台</h2><p>{category==='all'?'当前展示全部平台；选择上方类别后，这里会同步筛选对应平台。':('当前展示'+(platformGroups.find(group=>group.id===category)?.title??'所选类别')+'下的平台。')}</p></div><Tag type="gray">第 2 层 · 具体平台 · 单选</Tag></div>
        <RadioButtonGroup
          legendText="具体平台"
          name="discovery-platform"
          value={platform}
          orientation="vertical"
          onChange={(value)=>selectPlatform(value as Platform)}
          className="tp-discovery__platform-groups"
        >
          {visiblePlatformGroups.map(group=>{
            const GroupIcon=group.id==='maps'?CarbonIcons.Map:group.id==='social'?CarbonIcons.Share:CarbonIcons.ShoppingCart;
            return <section key={group.id} className="tp-discovery__platform-group" aria-labelledby={"discovery-group-"+group.id}>
              <div className="tp-discovery__platform-group-head">
                <GroupIcon size={20} aria-hidden="true"/>
                <div><h3 id={"discovery-group-"+group.id}>{group.title}</h3><p>{group.description}</p></div>
              </div>
              <div className="tp-discovery__platform-options">
                {group.platforms.map(item=><div key={item.id} className="tp-discovery__platform-option">
                  <div className="tp-discovery__platform-choice">
                    <img className={"tp-discovery__platform-logo tp-discovery__platform-logo--"+item.id} src={"/platform-logos/"+item.id+".svg"} alt="" aria-hidden="true"/>
                    <RadioButton id={"platform-"+item.id} labelText={item.name} value={item.id} disabled={!item.enabled}/>
                    <span className={"tp-discovery__status-dot "+(item.enabled?'is-available':'is-connecting')} role="img" aria-label={item.enabled?'可用':'接入中'} title={item.enabled?'可用':'接入中'}/>
                  </div>
                  <div className="tp-discovery__platform-meta"><small>{item.hint}</small></div>
                </div>)}
              </div>
            </section>;
          })}
        </RadioButtonGroup>
        <div className="tp-discovery__actions"><Button onClick={()=>setStep(2)} disabled={!currentPlatform?.enabled}>下一步</Button></div>
      </section>
    </>}
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
      <div className="tp-discovery__section-head"><div><h2><CarbonIcons.Activity size={20} aria-hidden="true"/>任务执行</h2><p>本步骤只负责任务执行、状态监控和日志展示，不在执行过程中混合展示结果表格。</p></div>{activeRun&&<Tag type={isTerminal(activeRun.status)?activeRun.status==='failed'?'red':'green':'blue'}>{statusLabels[activeRun.status]??activeRun.status}</Tag>}</div>
      {activeRun?<><div className="tp-discovery__run-summary"><div><small>任务编号</small><strong>{activeRun.taskCode}</strong></div><div><small>已运行</small><strong>{elapsedLabel}</strong></div><div><small>发现记录</small><strong>{activeRun.discoveredCount}</strong></div><div><small>潜客入库</small><strong>{activeRun.createdLeadCount}</strong></div></div>
        {activeRun.progress>0?<ProgressBar label="后台执行进度" value={activeRun.progress} max={100} helperText={activeRun.message}/>:<div className="tp-discovery__progress-wait"><InlineLoading description={activeRun.status==='queued'?'等待后台工作流启动…':activeRun.message||'等待后台阶段进度…'}/></div>}
        <Layer level={2} className="tp-discovery__activity-layer">
          <div className="tp-discovery__activity">
            <div className="tp-discovery__activity-head"><h3>动态执行日志</h3><span>{polling?'实时轮询中':isTerminal(activeRun.status)?'执行已结束':'等待更新'} · {lastUpdate?lastUpdate.toLocaleTimeString():'读取中'}</span></div>
            {stale&&<InlineNotification kind="warning" lowContrast title="正在等待数据源响应" subtitle="后台仍在运行或重试。当前没有收到新日志，页面会继续检查，不代表任务已经卡死。"/>}
            {activeRun.logs.length?<StructuredListWrapper ariaLabel="动态执行日志" className="tp-discovery__log-list"><StructuredListBody>{activeRun.logs.map(log=><StructuredListRow key={log.id} className={`is-${log.level}`}><StructuredListCell className="tp-discovery__log-status"><span className="tp-discovery__log-dot" aria-hidden="true"/></StructuredListCell><StructuredListCell><p>{log.message}</p></StructuredListCell><StructuredListCell className="tp-discovery__log-time"><time>{new Date(log.createdAt).toLocaleTimeString()}</time></StructuredListCell></StructuredListRow>)}</StructuredListBody></StructuredListWrapper>:<InlineLoading description="等待后台工作流写入第一条执行日志…"/>}
            {!isTerminal(activeRun.status)&&<div className="tp-discovery__heartbeat"><span className="tp-discovery__pulse"/><span>任务仍在执行 · 已运行 {elapsedLabel} · 自动刷新中</span></div>}
          </div>
        </Layer>
      </>:<InlineNotification kind="info" title="尚未启动任务" subtitle="请先完成发现途径、数据引擎和条件配置。"/>}
      <div className="tp-discovery__actions tp-discovery__execution-actions"><Button kind="secondary" onClick={()=>setStep(3)}>返回条件配置</Button><Button kind="ghost" onClick={()=>{if(activeRun)void refreshRun(activeRun.id);}}>刷新状态</Button><Button className="tp-discovery__execution-results" onClick={()=>setStep(5)} disabled={!activeRun||!isTerminal(activeRun.status)||records.length===0}>查看结果</Button></div>
    </section>}
    {step===5&&<section className="tp-discovery__panel tp-discovery__results">
      <div className="tp-discovery__section-head"><div><h2><CarbonIcons.Building size={20} aria-hidden="true"/>发现结果</h2><p>任务执行结束后查看归档结果。表格采用单行布局，超长内容截断，悬停可查看完整值。</p></div><Tag type="gray">{records.length} 条记录</Tag></div>
      {activeRun&&<div className="tp-discovery__run-summary"><div><small>任务编号</small><strong>{activeRun.taskCode}</strong></div><div><small>任务状态</small><strong>{statusLabels[activeRun.status]??activeRun.status}</strong></div><div><small>发现记录</small><strong>{activeRun.discoveredCount}</strong></div><div><small>潜客入库</small><strong>{activeRun.createdLeadCount}</strong></div></div>}
      <div className="tp-discovery__table-toolbar">
        <span>{selectedRecordIds.length? `已选择 ${selectedRecordIds.length} 条`:'选择记录后可批量操作'}</span>
        <div><Button kind="secondary" size="sm" disabled={!selectedRecordIds.length||recordActionBusy} onClick={()=>void runBulkRecordAction('promote')}>转为潜客</Button><Button kind="ghost" size="sm" disabled={!selectedRecordIds.length||recordActionBusy} onClick={()=>void runBulkRecordAction('discard')}>排除</Button><Button kind="danger--ghost" size="sm" disabled={!selectedRecordIds.length||recordActionBusy} onClick={()=>void runBulkRecordAction('remove')}>删除</Button></div>
      </div>
      <div className="tp-discovery__table-scroll"><TableContainer><Table size="lg" useZebraStyles={false}><TableHead><TableRow>
        <TableHeader className="tp-discovery__select-cell"><Checkbox id="select-all-discovery-records" labelText="全选" hideLabel checked={records.length>0&&selectedRecordIds.length===records.length} indeterminate={selectedRecordIds.length>0&&selectedRecordIds.length<records.length} onChange={(_,data)=>setSelectedRecordIds(data.checked?records.map(r=>r.id):[])}/></TableHeader>
        <TableHeader>名称</TableHeader><TableHeader>类型</TableHeader><TableHeader>地区</TableHeader><TableHeader>网站</TableHeader><TableHeader>地址</TableHeader><TableHeader>电话</TableHeader><TableHeader>邮箱</TableHeader><TableHeader>来源</TableHeader><TableHeader>操作</TableHeader>
      </TableRow></TableHead><TableBody>{records.map(record=>{
        const contacts=extraContactValues(record);
        const source=record.discovery_record_occurrences?.[0]?.provider??channelLabels[record.channel]??record.channel;
        const cells=[record.name,record.record_type,record.country_code??'—',record.website??'—',record.address??'—',record.phone??'—',record.email??'—',source];
        return <TableRow key={record.id}>
          <TableCell className="tp-discovery__select-cell"><Checkbox id={`select-record-${record.id}`} labelText={`选择 ${record.name}`} hideLabel checked={selectedRecordIds.includes(record.id)} onChange={(_,data)=>setSelectedRecordIds(prev=>data.checked?[...prev,record.id]:prev.filter(id=>id!==record.id))}/></TableCell>
          {cells.map((value,index)=><TableCell key={index} className="tp-discovery__nowrap-cell"><span title={String(value)}>{String(value)}</span>{index===0&&contacts.length>0&&<span className="tp-discovery__cell-subline" title={contacts.join(' · ')}>{contacts.join(' · ')}</span>}</TableCell>)}
          <TableCell className="tp-discovery__row-actions"><Button kind="ghost" size="sm" disabled={recordActionBusy} onClick={()=>void runSingleRecordAction(record.id,'promote')}>转潜客</Button><Button kind="ghost" size="sm" disabled={recordActionBusy} onClick={()=>void runSingleRecordAction(record.id,'discard')}>排除</Button><Button kind="danger--ghost" size="sm" disabled={recordActionBusy} onClick={()=>void runSingleRecordAction(record.id,'remove')}>删除</Button></TableCell>
        </TableRow>;
      })}</TableBody></Table></TableContainer></div>
      {records.length===0&&<p className="tp-discovery__empty">当前任务没有可显示的发现记录。</p>}
      <div className="tp-discovery__actions"><Button kind="secondary" onClick={()=>setStep(4)}>查看执行日志</Button><Button onClick={()=>{setStep(1);setActiveRun(null);setRecords([]);setSelectedRecordIds([]);}}>创建新任务</Button></div>
    </section>}
  </main>;
}
