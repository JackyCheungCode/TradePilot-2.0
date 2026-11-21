import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/design-system';
import { Button, Dropdown, InlineNotification, Tag, TextInput, TPInlineLoading, semanticIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import './wheel-fitment.scss';

type VehicleOption = { id: string; text: string; logoKey?: string };
type FitmentRecord = { id: string; provider: string; confidence: string; record: Record<string, unknown> };
type ApiResult<T> = { data?: T; error?: { message?: string } };
type CatalogResult = { items?: unknown[]; records?: FitmentRecord[]; sources?: Array<{id:string;status:string;license?:string}>; limitations?: string[]; raw?: unknown };

const API = '/api/v1/wheel-fitment';
const numeric = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const mm = (value: number) => value.toFixed(1) + ' mm';
const diameter = (width: number, aspect: number, rim: number) => rim * 25.4 + 2 * width * aspect / 100;
const getToken = async () => {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
};
const flatten = (value: unknown, prefix = '', depth = 0): Array<[string,string]> => {
  if (depth > 3 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, prefix ? prefix + '.' + (index + 1) : String(index + 1), depth + 1));
  if (typeof value !== 'object') return prefix ? [[prefix, String(value)]] : [];
  return Object.entries(value as Record<string,unknown>).flatMap(([key,item]) => flatten(item, prefix ? prefix + ' / ' + key : key, depth + 1));
};
function BrandMark({option}:{option:VehicleOption|null}) {
  if (!option) return <span className="tp-wheel__brand-fallback">?</span>;
  return <img className="tp-wheel__brand-logo" src={'https://cdn.simpleicons.org/' + encodeURIComponent(option.logoKey || option.text.toLowerCase().replace(/[^a-z0-9]/g,''))} alt="" onError={event => { event.currentTarget.style.display='none'; }} />;
}

export function WheelFitmentPage() {
  const [makes,setMakes] = useState<VehicleOption[]>([]);
  const [models,setModels] = useState<VehicleOption[]>([]);
  const [years,setYears] = useState<VehicleOption[]>([]);
  const [generations,setGenerations] = useState<VehicleOption[]>([]);
  const [modifications,setModifications] = useState<VehicleOption[]>([]);
  const [make,setMake] = useState<VehicleOption|null>(null);
  const [model,setModel] = useState<VehicleOption|null>(null);
  const [year,setYear] = useState<VehicleOption|null>(null);
  const [generation,setGeneration] = useState<VehicleOption|null>(null);
  const [modification,setModification] = useState<VehicleOption|null>(null);
  const [region,setRegion] = useState('all');
  const [records,setRecords] = useState<FitmentRecord[]>([]);
  const [selectedRecord,setSelectedRecord] = useState<FitmentRecord|null>(null);
  const [busy,setBusy] = useState(false);
  const [catalogBusy,setCatalogBusy] = useState(false);
  const [error,setError] = useState('');
  const [sourceInfo,setSourceInfo] = useState<CatalogResult>({});
  const [vin,setVin] = useState('');
  const [vinResult,setVinResult] = useState<unknown>(null);
  const [baseline,setBaseline] = useState({width:'8',diameter:'18',offset:'35',tireWidth:'225',aspect:'45'});
  const [proposal,setProposal] = useState({width:'8.5',diameter:'19',offset:'35',tireWidth:'235',aspect:'40'});
  const [calculated,setCalculated] = useState(false);

  const query = useCallback(async (kind:string, params:Record<string,string> = {}):Promise<CatalogResult> => {
    const token = await getToken();
    const url = new URL(API + '/' + kind, window.location.origin);
    Object.entries(params).forEach(([key,value]) => { if(value) url.searchParams.set(key,value); });
    const response = await fetch(url.toString(), { headers:{ Authorization:'Bearer ' + token } });
    const body = await response.json() as ApiResult<CatalogResult>;
    if(!response.ok) throw new Error(body.error?.message || '车辆数据请求失败（HTTP ' + response.status + '）');
    return body.data ?? body as CatalogResult;
  },[]);

  const options = (items:unknown[] = []):VehicleOption[] => items.map((item,index) => {
    if(typeof item === 'string' || typeof item === 'number') return {id:String(item),text:String(item)};
    const value = item as Record<string,unknown>;
    const text = String(value.name ?? value.make ?? value.model ?? value.year ?? value.title ?? value.slug ?? '配置 ' + (index + 1));
    return {id:String(value.id ?? value.slug ?? text),text,logoKey:typeof value.logoKey === 'string' ? value.logoKey : undefined};
  });

  const loadMakes = useCallback(async () => {
    setCatalogBusy(true); setError('');
    try { const data = await query('makes',{region}); setMakes(options(data.items)); setSourceInfo(data); }
    catch(e) { setError(e instanceof Error ? e.message : '无法读取车辆品牌目录。'); }
    finally { setCatalogBusy(false); }
  },[query,region]);
  useEffect(()=>{void loadMakes();},[loadMakes]);

  const loadDependent = async (kind:string, params:Record<string,string>, setter:(value:VehicleOption[])=>void) => {
    setCatalogBusy(true); setError('');
    try { const data=await query(kind,params); setter(options(data.items)); setSourceInfo(data); }
    catch(e) { setter([]); setError(e instanceof Error ? e.message : '车辆目录读取失败。'); }
    finally { setCatalogBusy(false); }
  };
  const baseParams = {make:make?.text || '',model:model?.text || '',year:year?.text || '',generation:generation?.text || '',region};
  const findVehicle = async () => {
    if(!make || !model) { setError('请先选择车辆品牌和车型。'); return; }
    setBusy(true); setError(''); setRecords([]); setSelectedRecord(null); setCalculated(false);
    try {
      const data=await query('vehicle',{...baseParams,modification:modification?.text || ''});
      const rows=(data.records || []) as FitmentRecord[];
      setRecords(rows); setSourceInfo(data);
      if(rows.length) setSelectedRecord(rows[0]);
      if(!rows.length) setError('没有检索到匹配的原厂规格。请调整年款、世代、配置或市场后重试。');
    } catch(e) { setError(e instanceof Error ? e.message : '车辆规格查询失败。'); }
    finally { setBusy(false); }
  };
  const decodeVin = async () => {
    setBusy(true); setError(''); setVinResult(null);
    try { const data=await query('vin',{vin}); setVinResult(data); }
    catch(e) { setError(e instanceof Error ? e.message : 'VIN 解码失败。'); }
    finally { setBusy(false); }
  };

  const calculation = useMemo(() => {
    const bw=numeric(baseline.width), bd=numeric(baseline.diameter), bo=numeric(baseline.offset), btw=numeric(baseline.tireWidth), ba=numeric(baseline.aspect);
    const pw=numeric(proposal.width), pd=numeric(proposal.diameter), po=numeric(proposal.offset), ptw=numeric(proposal.tireWidth), pa=numeric(proposal.aspect);
    const baseD=diameter(btw,ba,bd), proposedD=diameter(ptw,pa,pd);
    const widthDelta=(pw-bw)*25.4;
    const offsetDelta=po-bo;
    const inner=(widthDelta/2)+offsetDelta;
    const outer=(widthDelta/2)-offsetDelta;
    return {baseD,proposedD,diameterDelta:proposedD-baseD,diameterPercent:baseD?((proposedD-baseD)/baseD)*100:0,speedAt100:baseD?100*proposedD/baseD:0,inner,outer,track:2*(bo-po),valid:[bw,bd,btw,ba,pw,pd,ptw,pa].every(v=>v>0) && ba<100 && pa<100};
  },[baseline,proposal]);

  const selectedFields = useMemo(()=>selectedRecord ? flatten(selectedRecord.record).filter(([key])=>!key.toLowerCase().includes('image')) : [],[selectedRecord]);
  const setBaseField=(key:string,value:string)=>setBaseline(current=>({...current,[key]:value}));
  const setProposalField=(key:string,value:string)=>setProposal(current=>({...current,[key]:value}));
  const renderMeasure=(label:string,key:keyof typeof baseline,value:string,onChange:(key:string,value:string)=>void,step='1')=><TextInput id={'wheel-base-'+key} labelText={label} type="number" step={step} value={value} onChange={event=>onChange(key,event.currentTarget.value)}/>;
  const renderProposal=(label:string,key:keyof typeof proposal,value:string)=><TextInput id={'wheel-proposal-'+key} labelText={label} type="number" step="1" value={value} onChange={event=>setProposalField(key,event.currentTarget.value)}/>;

  return <main className="tp-wheel">
    <PageHeader className="tp-wheel__header"><div><p className="tp-wheel__eyebrow">HARMONIA · WHEEL ENGINEERING</p><h1>轮毂与轮胎适配</h1><p>原厂规格查询、改装参数计算与多来源适配验证</p></div><Tag type="blue">工程计算</Tag></PageHeader>
    {error && <InlineNotification kind="error" title="操作未完成" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
    <section className="tp-wheel__section">
      <div className="tp-wheel__section-title"><div><h2>01 · 选择车辆</h2><p>先确认车辆身份，再读取对应市场、年款与配置的原厂规格。</p></div>{catalogBusy && <TPInlineLoading status="active" description="读取车辆目录…"/>}</div>
      <div className="tp-wheel__vehicle-grid">
        <div className="tp-wheel__field"><label>车辆品牌</label><div className="tp-wheel__brand-select"><BrandMark option={make}/><Dropdown id="wheel-make" titleText="" label="选择制造商" items={makes} itemToString={(item:VehicleOption|null)=>item?.text || ''} selectedItem={make} onChange={({selectedItem}:{selectedItem:VehicleOption|null})=>{setMake(selectedItem);setModel(null);setYear(null);setGeneration(null);setModification(null);setModels([]);setYears([]);setGenerations([]);setModifications([]);setRecords([]);setSelectedRecord(null);if(selectedItem) void loadDependent('models',{make:selectedItem.text,region},setModels);}}/></div></div>
        <div className="tp-wheel__field"><label>车型</label><Dropdown id="wheel-model" titleText="" label="选择车型" items={models} itemToString={(item:VehicleOption|null)=>item?.text || ''} selectedItem={model} disabled={!make} onChange={({selectedItem}:{selectedItem:VehicleOption|null})=>{setModel(selectedItem);setYear(null);setGeneration(null);setModification(null);setRecords([]);if(selectedItem) void loadDependent('years',{make:make?.text || '',model:selectedItem.text,region},setYears);}}/></div>
        <div className="tp-wheel__field"><label>年款</label><Dropdown id="wheel-year" titleText="" label="选择年款（可选）" items={years} itemToString={(item:VehicleOption|null)=>item?.text || ''} selectedItem={year} disabled={!model} onChange={({selectedItem}:{selectedItem:VehicleOption|null})=>{setYear(selectedItem);setGeneration(null);setModification(null);if(selectedItem) void loadDependent('generations',{make:make?.text||'',model:model?.text||'',year:selectedItem.text,region},setGenerations);}}/></div>
        <div className="tp-wheel__field"><label>世代</label><Dropdown id="wheel-generation" titleText="" label="选择世代（可选）" items={generations} itemToString={(item:VehicleOption|null)=>item?.text || ''} selectedItem={generation} disabled={!model} onChange={({selectedItem}:{selectedItem:VehicleOption|null})=>{setGeneration(selectedItem);setModification(null);if(selectedItem) void loadDependent('modifications',{make:make?.text||'',model:model?.text||'',year:year?.text||'',generation:selectedItem.text,region},setModifications);}}/></div>
        <div className="tp-wheel__field"><label>具体配置 / 动力版本</label><Dropdown id="wheel-modification" titleText="" label="选择配置（可选）" items={modifications} itemToString={(item:VehicleOption|null)=>item?.text || ''} selectedItem={modification} disabled={!model} onChange={({selectedItem}:{selectedItem:VehicleOption|null})=>setModification(selectedItem)}/></div>
        <div className="tp-wheel__field"><label>销售市场</label><Dropdown id="wheel-region" titleText="" label="选择市场" items={[{id:'all',text:'全部市场'},{id:'us',text:'美国'},{id:'eu',text:'欧洲'},{id:'uk',text:'英国'},{id:'jp',text:'日本'},{id:'au',text:'澳大利亚'}]} itemToString={(item:{id:string;text:string}|null)=>item?.text||''} selectedItem={{id:region,text:({all:'全部市场',us:'美国',eu:'欧洲',uk:'英国',jp:'日本',au:'澳大利亚'} as Record<string,string>)[region]||'全部市场'}} onChange={({selectedItem}:{selectedItem:{id:string;text:string}|null})=>setRegion(selectedItem?.id||'all')}/></div>
      </div>
      <div className="tp-wheel__actions"><Button kind="primary" renderIcon={semanticIcons.search} disabled={!make||!model||busy} onClick={()=>void findVehicle()}>查询原厂规格</Button><span>数据结果可能包含多个前后轴、制动套件或地区配置，请逐条确认。</span></div>
      <div className="tp-wheel__vin"><div><h3>VIN 辅助识别</h3><p>可使用 11–17 位 VIN 解码车辆信息；VIN 解码不等于轮毂适配认证。</p></div><div className="tp-wheel__vin-controls"><TextInput id="wheel-vin" labelText="车辆识别码（VIN）" value={vin} onChange={event=>setVin(event.currentTarget.value.toUpperCase())} placeholder="输入 VIN"/><Button kind="tertiary" disabled={busy||vin.trim().length<11} onClick={()=>void decodeVin()}>解码 VIN</Button></div>{vinResult!==null&&<pre>{JSON.stringify(vinResult,null,2)}</pre>}</div>
    </section>
    <section className="tp-wheel__section">
      <div className="tp-wheel__section-title"><div><h2>02 · 原厂规格数据库</h2><p>保留各数据源的原始配置记录，不将不同车型或轴位错误合并。</p></div><Tag type="cool-gray">{records.length} 条记录</Tag></div>
      {!records.length ? <div className="tp-wheel__empty"><semanticIcons.product size={28}/><p>选择车辆并查询后，原厂轮毂、轮胎、PCD、中心孔与 ET 等信息将在这里呈现。</p></div> : <div className="tp-wheel__records">{records.map(record=><button type="button" key={record.id} className={'tp-wheel__record '+(selectedRecord?.id===record.id?'is-selected':'')} onClick={()=>{setSelectedRecord(record);setCalculated(false);}}><span><strong>{record.provider}</strong><small>{record.id}</small></span><Tag type={record.confidence==='professional_database'?'green':'blue'}>{record.confidence==='professional_database'?'专业数据库':'开放参考数据'}</Tag><semanticIcons.chevronRight size={16}/></button>)}</div>}
      {selectedRecord&&<div className="tp-wheel__record-detail"><div className="tp-wheel__record-heading"><h3>选中配置 · {selectedRecord.provider}</h3><Tag type="cool-gray">原始数据保留</Tag></div><div className="tp-wheel__data-grid">{selectedFields.slice(0,48).map(([key,value],index)=><div key={key+'-'+index}><span>{key}</span><strong>{value}</strong></div>)}</div><details><summary>查看完整原始数据</summary><pre>{JSON.stringify(selectedRecord.record,null,2)}</pre></details></div>}
      {sourceInfo.sources?.length ? <div className="tp-wheel__sources"><strong>数据源状态</strong>{sourceInfo.sources.map(source=><Tag key={source.id} type={source.status==='available'?'green':'cool-gray'}>{source.id}: {source.status}</Tag>)}</div>:null}
    </section>
    <section className="tp-wheel__section">
      <div className="tp-wheel__section-title"><div><h2>03 · 改装参数与适配计算</h2><p>可直接以原厂数据为基准，也可手动输入已确认的原厂或改装参数。</p></div><Tag type="blue">实时计算</Tag></div>
      <div className="tp-wheel__calc-grid">
        <div className="tp-wheel__calc-panel"><h3>基准规格（原厂 / 当前）</h3><div className="tp-wheel__inputs">{renderMeasure('轮毂宽度（J）','width',baseline.width,setBaseField,'0.5')}{renderMeasure('轮毂直径（英寸）','diameter',baseline.diameter,setBaseField)}{renderMeasure('ET 偏距（mm）','offset',baseline.offset,setBaseField)}{renderMeasure('轮胎宽度（mm）','tireWidth',baseline.tireWidth,setBaseField)}{renderMeasure('扁平比（%）','aspect',baseline.aspect,setBaseField)}</div></div>
        <div className="tp-wheel__calc-panel tp-wheel__calc-panel--proposal"><h3>目标规格（改装）</h3><div className="tp-wheel__inputs">{renderProposal('轮毂宽度（J）','width',proposal.width)}{renderProposal('轮毂直径（英寸）','diameter',proposal.diameter)}{renderProposal('ET 偏距（mm）','offset',proposal.offset)}{renderProposal('轮胎宽度（mm）','tireWidth',proposal.tireWidth)}{renderProposal('扁平比（%）','aspect',proposal.aspect)}</div></div>
      </div>
      <div className="tp-wheel__actions"><Button kind="primary" disabled={!calculation.valid} onClick={()=>setCalculated(true)}>计算改装差异</Button><span>请先确认基准规格与目标规格的单位正确。</span></div>
      {calculated&&<div className="tp-wheel__results"><h3>计算结果与公式</h3><div className="tp-wheel__result-grid">
        <div><span>基准轮胎外径</span><strong>{mm(calculation.baseD)}</strong><small>(轮胎宽度 × 扁平比 × 2) + 轮毂直径 × 25.4</small></div>
        <div><span>目标轮胎外径</span><strong>{mm(calculation.proposedD)}</strong><small>(目标胎宽 × 目标扁平比 × 2) + 目标轮毂直径 × 25.4</small></div>
        <div><span>外径变化</span><strong>{mm(calculation.diameterDelta)} / {calculation.diameterPercent.toFixed(2)}%</strong><small>(目标外径 − 基准外径) ÷ 基准外径 × 100%</small></div>
        <div><span>速度表参考值</span><strong>{calculation.speedAt100.toFixed(1)} km/h</strong><small>显示 100 km/h 时，理论实际速度 = 100 × 目标外径 ÷ 基准外径</small></div>
        <div><span>内侧空间变化</span><strong>{calculation.inner>=0?'减少 ':'增加 '}{mm(Math.abs(calculation.inner))}</strong><small>(目标轮毂宽度 − 基准宽度) × 12.7 + (目标 ET − 基准 ET)</small></div>
        <div><span>外侧突出变化</span><strong>{calculation.outer>=0?'增加 ':'减少 '}{mm(Math.abs(calculation.outer))}</strong><small>(目标轮毂宽度 − 基准宽度) × 12.7 − (目标 ET − 基准 ET)</small></div>
        <div><span>轮距变化（整车）</span><strong>{calculation.track>=0?'增加 ':'减少 '}{mm(Math.abs(calculation.track))}</strong><small>2 × (基准 ET − 目标 ET)</small></div>
      </div><InlineNotification kind={Math.abs(calculation.diameterPercent)>3?'warning':'info'} title="计算边界" subtitle="以上是几何差异估算，不代表制动卡钳、悬挂、翼子板或满载转向间隙已经通过验证。最终安全性仍需核对车辆实测间隙、轮毂负载等级、螺栓规格及制造商要求。"/></div>}
    </section>
    <section className="tp-wheel__section tp-wheel__validation"><div className="tp-wheel__section-title"><div><h2>04 · 适配验证</h2><p>验证必须基于真实规格、制动组件和车辆实测数据；不以 AI 猜测替代安全认证。</p></div><Tag type="warm-gray">需实车确认</Tag></div><div className="tp-wheel__validation-grid"><div><semanticIcons.checkmarkOutline size={20}/><strong>数据库匹配</strong><p>对比品牌、车型、年款、世代、配置与原厂规格记录。</p></div><div><semanticIcons.calculator size={20}/><strong>几何计算</strong><p>计算外径、轮距、内侧间隙变化与外侧突出变化。</p></div><div><semanticIcons.warning size={20}/><strong>实车安全检查</strong><p>需确认卡钳、悬挂、翼子板、满载压缩、转向角及负载等级。</p></div></div><p className="tp-wheel__disclaimer">系统当前可提供数据源交叉参考和几何计算。没有取得对应车辆的制动卡钳模板、轮毂结构尺寸及实车间隙测量前，不会将结果标记为“安全通过”。</p></section>
  </main>;
}
