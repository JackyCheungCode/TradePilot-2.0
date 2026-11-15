import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, TextArea,
  CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/trade-tools.scss';

type ToolId = 'currency' | 'holidays' | 'shipping' | 'translation' | 'contact-time' | 'profit';
type Holiday = { date: string; localName: string; name: string; global: boolean; counties?: string[]; types?: string[] };
type LocationResult = { name: string; country: string; country_code: string; admin1?: string; latitude: number; longitude: number; timezone: string };
type WeatherDay = { date: string; code: number; high: number; low: number; rain: number };
type ContactOption = { id: string; label: string; address: string };
type CarrierResult = Record<string, unknown>;

const currencies = ['USD','CNY','EUR','GBP','JPY','HKD','TWD','AUD','CAD','SGD','CHF','KRW','INR','THB','MYR','IDR','VND','AED','SAR','BRL','MXN','PLN','SEK','NOK','DKK','NZD','ZAR'];
const countryNames: Record<string,string> = { DE:'德国',US:'美国',GB:'英国',FR:'法国',IT:'意大利',ES:'西班牙',NL:'荷兰',BE:'比利时',CH:'瑞士',AT:'奥地利',PL:'波兰',CZ:'捷克',JP:'日本',KR:'韩国',CN:'中国',HK:'中国·香港',MO:'中国·澳门',TW:'中国·台湾',SG:'新加坡',AU:'澳大利亚',CA:'加拿大',IN:'印度',BR:'巴西',MX:'墨西哥',TH:'泰国',MY:'马来西亚',ID:'印度尼西亚',VN:'越南',AE:'阿联酋',SA:'沙特阿拉伯',ZA:'南非' };
const flags: Record<string,string> = { DE:'🇩🇪',US:'🇺🇸',GB:'🇬🇧',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',NL:'🇳🇱',BE:'🇧🇪',CH:'🇨🇭',AT:'🇦🇹',PL:'🇵🇱',CZ:'🇨🇿',JP:'🇯🇵',KR:'🇰🇷',CN:'🇨🇳',HK:'🇭🇰',MO:'🇲🇴',TW:'🇹🇼',SG:'🇸🇬',AU:'🇦🇺',CA:'🇨🇦',IN:'🇮🇳',BR:'🇧🇷',MX:'🇲🇽',TH:'🇹🇭',MY:'🇲🇾',ID:'🇮🇩',VN:'🇻🇳',AE:'🇦🇪',SA:'🇸🇦',ZA:'🇿🇦' };
const tools: Array<{id:ToolId;label:string;description:string;icon:React.ReactNode}> = [
  {id:'currency',label:'汇率换算',description:'参考汇率、币种换算与半年走势',icon:<CarbonIcons.Currency size={20}/>},
  {id:'holidays',label:'全球公共假期',description:'国家与州／省级公共假期查询',icon:<CarbonIcons.Calendar size={20}/>},
  {id:'shipping',label:'国际物流追踪',description:'DHL、UPS、FedEx 官方轨迹查询',icon:<CarbonIcons.Delivery size={20}/>},
  {id:'translation',label:'DeepL 在线翻译',description:'面向外贸沟通的多语言翻译',icon:<CarbonIcons.Translate size={20}/>},
  {id:'contact-time',label:'客户联系时机',description:'当地时间、工作日、昼夜与天气',icon:<CarbonIcons.Time size={20}/>},
  {id:'profit',label:'报价利润计算器',description:'成本、费用、报价与利润率测算',icon:<CarbonIcons.Calculator size={20}/>},
];

async function getToken() {
  const db = await getSupabaseClient();
  const { data } = await db.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  return data.session.access_token;
}
async function readJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('接口请求失败（HTTP ' + response.status + '）');
  return response.json();
}
function weatherIcon(code:number) {
  if (code === 0) return '☀️';
  if ([1,2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '🌡️';
}

export function TradeToolsPage() {
  const [active,setActive] = useState<ToolId>('currency');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);

  const [base,setBase] = useState('USD');
  const [quote,setQuote] = useState('CNY');
  const [amount,setAmount] = useState('1');
  const [rate,setRate] = useState<number | null>(null);
  const [rateDate,setRateDate] = useState('');
  const [series,setSeries] = useState<Array<{date:string;rate:number}>>([]);

  const [holidayCountry,setHolidayCountry] = useState('DE');
  const [holidayYear,setHolidayYear] = useState(String(new Date().getFullYear()));
  const [holidayRegion,setHolidayRegion] = useState('all');
  const [holidayCountries,setHolidayCountries] = useState<Array<{countryCode:string;name:string}>>([]);
  const [holidays,setHolidays] = useState<Holiday[]>([]);

  const [carrier,setCarrier] = useState('dhl');
  const [trackingNumber,setTrackingNumber] = useState('');
  const [tracking,setTracking] = useState<CarrierResult | null>(null);

  const [sourceLanguage,setSourceLanguage] = useState('auto');
  const [targetLanguage,setTargetLanguage] = useState('ZH');
  const [translationText,setTranslationText] = useState('');
  const [translated,setTranslated] = useState('');

  const [locationQuery,setLocationQuery] = useState('');
  const [location,setLocation] = useState<LocationResult | null>(null);
  const [locations,setLocations] = useState<LocationResult[]>([]);
  const [timeData,setTimeData] = useState<{datetime:string;timezone:string;utc_offset:string;day_of_week:number}|null>(null);
  const [weather,setWeather] = useState<WeatherDay[]>([]);
  const [holidayToday,setHolidayToday] = useState<Holiday|null>(null);
  const [contacts,setContacts] = useState<ContactOption[]>([]);
  const [selectedContact,setSelectedContact] = useState('');

  const [cost,setCost] = useState('100');
  const [freight,setFreight] = useState('5');
  const [duty,setDuty] = useState('0');
  const [other,setOther] = useState('2');
  const [margin,setMargin] = useState('25');
  const [saleQty,setSaleQty] = useState('1');

  const conversion = useMemo(() => rate === null ? null : Number(amount || 0) * rate,[amount,rate]);
  const profit = useMemo(() => {
    const totalCost = Number(cost||0)+Number(freight||0)+Number(duty||0)+Number(other||0);
    const targetMargin = Math.min(99.99,Math.max(0,Number(margin||0)))/100;
    const price = totalCost/(1-targetMargin);
    return {totalCost,price,profit:price-totalCost,margin:targetMargin*100,qty:Math.max(1,Number(saleQty||1))};
  },[cost,freight,duty,other,margin,saleQty]);

  const loadCurrency = useCallback(async () => {
    setBusy(true);setError('');
    try {
      const today = new Date();
      const from = new Date(today.getFullYear(),today.getMonth()-6,today.getDate()).toISOString().slice(0,10);
      const to = today.toISOString().slice(0,10);
      const latest = await readJson('https://api.frankfurter.dev/v2/rates?base='+base+'&quotes='+quote);
      const row = Array.isArray(latest) ? latest[0] : latest;
      if (typeof row?.rate !== 'number') throw new Error('该币种组合暂无可用参考汇率。');
      setRate(row.rate);setRateDate(row.date || '');
      const history = await readJson('https://api.frankfurter.dev/v2/rates?from='+from+'&to='+to+'&base='+base+'&quotes='+quote+'&group=month');
      const rows = (Array.isArray(history)?history:[]).map((item:any)=>({date:String(item.date),rate:Number(item.rate)})).filter((item:any)=>Number.isFinite(item.rate));
      setSeries(rows);
    } catch(e) {setError(e instanceof Error?e.message:'汇率数据读取失败。');}
    finally {setBusy(false);}
  },[base,quote]);
  useEffect(()=>{if(active==='currency') void loadCurrency();},[active,loadCurrency]);

  useEffect(()=>{void readJson('https://date.nager.at/api/v3/AvailableCountries').then(data=>setHolidayCountries(data as Array<{countryCode:string;name:string}>)).catch(()=>setHolidayCountries([]));},[]);
  const loadHolidays = useCallback(async () => {
    setBusy(true);setError('');
    try {
      const data = await readJson('https://date.nager.at/api/v3/PublicHolidays/'+holidayYear+'/'+holidayCountry) as Holiday[];
      setHolidays(data);
      const regions = Array.from(new Set(data.flatMap(item=>item.counties||[]))).sort();
      if(holidayRegion!=='all'&&!regions.includes(holidayRegion)) setHolidayRegion('all');
    } catch(e) {setError(e instanceof Error?e.message:'公共假期读取失败。');}
    finally {setBusy(false);}
  },[holidayCountry,holidayYear]);
  useEffect(()=>{if(active==='holidays') void loadHolidays();},[active,loadHolidays]);
  const holidayRegions = useMemo(()=>Array.from(new Set(holidays.flatMap(item=>item.counties||[]))).sort(),[holidays]);
  const filteredHolidays = useMemo(()=>holidays.filter(item=>holidayRegion==='all'||item.global||item.counties?.includes(holidayRegion)),[holidays,holidayRegion]);

  const trackShipment = async () => {
    setBusy(true);setError('');setTracking(null);
    try {
      const token=await getToken();
      const response=await fetch('/api/v1/trade-tools/track',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({carrier,trackingNumber:trackingNumber.trim()})});
      const body=await response.json() as {data?:CarrierResult;error?:{message?:string}};
      if(!response.ok) throw new Error(body.error?.message||'物流查询失败（HTTP '+response.status+'）');
      setTracking(body.data||body as CarrierResult);
    } catch(e) {setError(e instanceof Error?e.message:'物流查询失败。');}
    finally {setBusy(false);}
  };

  const translate = async () => {
    setBusy(true);setError('');setTranslated('');
    try {
      const token=await getToken();
      const response=await fetch('/api/v1/discovery/translate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({text:translationText,targetLanguage,sourceLanguage})});
      const body=await response.json() as {data?:{translatedText?:string};error?:{message?:string}};
      if(!response.ok) throw new Error(body.error?.message||'翻译失败');
      setTranslated(body.data?.translatedText||'');
    } catch(e) {setError(e instanceof Error?e.message:'翻译失败。');}
    finally {setBusy(false);}
  };

  const loadContacts = async () => {
    try {
      const db=await getSupabaseClient();
      const [accounts,people]=await Promise.all([db.from('crm_accounts').select('*').limit(200),db.from('crm_contacts').select('*').limit(200)]);
      const rows=[...(accounts.data||[]).map((r:any)=>({id:'account:'+r.id,label:String(r.name||r.company_name||'客户'),address:String(r.full_address||r.address||[r.city,r.state,r.country].filter(Boolean).join(', '))})),...(people.data||[]).map((r:any)=>({id:'contact:'+r.id,label:String(r.full_name||r.name||r.email||'联系人'),address:String(r.full_address||r.address||[r.city,r.state,r.country].filter(Boolean).join(', '))}))].filter(x=>x.address.trim());
      setContacts(rows);
    } catch { setContacts([]); }
  };
  useEffect(()=>{if(active==='contact-time') void loadContacts();},[active]);

  const searchLocation = async () => {
    if(!locationQuery.trim()) return;
    setBusy(true);setError('');
    try {
      const data=await readJson('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(locationQuery)+'&count=8&language=zh');
      setLocations((data.results||[]) as LocationResult[]);
    } catch(e) {setError(e instanceof Error?e.message:'地点搜索失败。');}
    finally {setBusy(false);}
  };
  const loadContactTime = async (place:LocationResult) => {
    setLocation(place);setLocations([]);setBusy(true);setError('');setTimeData(null);setWeather([]);
    try {
      const [time,forecast,holidayList]=await Promise.all([
        readJson('https://time.now/developer/api/time?timezone='+encodeURIComponent(place.timezone)),
        readJson('https://api.open-meteo.com/v1/forecast?latitude='+place.latitude+'&longitude='+place.longitude+'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&past_days=1&forecast_days=2&timezone=auto'),
        readJson('https://date.nager.at/api/v3/PublicHolidays/'+new Date().getFullYear()+'/'+place.country_code).catch(()=>[]),
      ]);
      setTimeData(time);
      const d=forecast.daily||{};
      setWeather((d.time||[]).map((date:string,i:number)=>({date,code:Number(d.weather_code?.[i]??0),high:Number(d.temperature_2m_max?.[i]??0),low:Number(d.temperature_2m_min?.[i]??0),rain:Number(d.precipitation_probability_max?.[i]??0)})));
      const localDate=String(time.datetime||'').slice(0,10);
      setHolidayToday((holidayList as Holiday[]).find(h=>h.date===localDate)||null);
    } catch(e) {setError(e instanceof Error?e.message:'时间或天气读取失败。');}
    finally {setBusy(false);}
  };
  const chooseContact = async (id:string) => {
    setSelectedContact(id);
    const found=contacts.find(x=>x.id===id);
    if(!found) return;
    setLocationQuery(found.address);
    setBusy(true);
    try {
      const data=await readJson('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(found.address)+'&count=1&language=zh');
      const place=data.results?.[0] as LocationResult|undefined;
      if(!place) throw new Error('无法从该客户地址解析出城市和时区，请手动搜索城市。');
      await loadContactTime(place);
    } catch(e) {setError(e instanceof Error?e.message:'客户地址解析失败。');setBusy(false);}
  };

  const visibleSeries = series.length ? series : [];
  const chartPoints = visibleSeries.map((item,i)=> {
    const min=Math.min(...visibleSeries.map(x=>x.rate)),max=Math.max(...visibleSeries.map(x=>x.rate));
    const x=28+(i/(Math.max(1,visibleSeries.length-1)))*544;
    const y=126-((item.rate-min)/(max-min||1))*96;
    return x+','+y;
  }).join(' ');

  return <main className="tp-trade-tools">
    <header className="tp-trade-tools__header">
      <div><p className="tp-trade-tools__eyebrow">TRADE TOOLS</p><h1>外贸工具</h1><p>汇率、假期、物流、翻译、客户联系时机与报价测算。</p></div>
      <Tag type="blue">6 项工具</Tag>
    </header>
    <div className="tp-trade-tools__layout">
      <nav className="tp-trade-tools__nav" aria-label="外贸工具">
        {tools.map(item=><Button key={item.id} kind={active===item.id?'primary':'ghost'} className="tp-trade-tools__nav-item" onClick={()=>{setActive(item.id);setError('');setNotice('');}}>
          <span className="tp-trade-tools__nav-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
        </Button>)}
      </nav>
      <section className="tp-trade-tools__workspace">
        {error&&<InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
        {notice&&<InlineNotification kind="success" title="操作成功" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
        {active==='currency'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Currency size={24}/><div><h2>汇率换算</h2><p>Frankfurter 官方参考汇率 · 半年历史走势</p></div></div>
          <div className="tp-trade-tools__form-grid">
            <Select id="fx-base" labelText="原币种" value={base} onChange={e=>setBase(e.currentTarget.value)}>{currencies.map(c=><SelectItem key={c} value={c} text={c}/>)}</Select>
            <Select id="fx-quote" labelText="目标币种" value={quote} onChange={e=>setQuote(e.currentTarget.value)}>{currencies.map(c=><SelectItem key={c} value={c} text={c}/>)}</Select>
            <TextInput id="fx-amount" labelText="换算金额" type="number" value={amount} onChange={e=>setAmount(e.currentTarget.value)}/>
            <Button kind="primary" onClick={()=>void loadCurrency()} disabled={busy}>查询汇率</Button>
          </div>
          {busy&&active==='currency'?<InlineLoading description="正在读取参考汇率…"/>:rate!==null&&<div className="tp-trade-tools__result">
            <div><span>{amount||'0'} {base}</span><strong>{conversion?.toLocaleString(undefined,{maximumFractionDigits:4})} {quote}</strong><small>1 {base} = {rate.toFixed(6)} {quote} · 汇率日期 {rateDate}</small></div>
            <div className="tp-trade-tools__chart"><div className="tp-trade-tools__chart-heading"><strong>过去六个月</strong><span>{base}/{quote}</span></div>
              {visibleSeries.length>1?<svg viewBox="0 0 600 150" role="img" aria-label="半年汇率走势折线图"><line x1="28" y1="126" x2="572" y2="126"/><polyline points={chartPoints}/>{visibleSeries.map((p,i)=><text key={p.date} x={28+(i/Math.max(1,visibleSeries.length-1))*544} y="145">{p.date.slice(5,7)}月</text>)}</svg>:<p>暂无足够的历史数据。</p>}
            </div>
          </div>}
          <p className="tp-trade-tools__footnote">汇率为公开参考数据，非银行实时交易报价；Frankfurter 按工作日更新。</p>
        </section>}

        {active==='holidays'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Calendar size={24}/><div><h2>全球公共假期</h2><p>Nager.Date · 支持国家及一级行政区假期</p></div></div>
          <div className="tp-trade-tools__form-grid">
            <Select id="holiday-country" labelText="国家或地区" value={holidayCountry} onChange={e=>{setHolidayCountry(e.currentTarget.value);setHolidayRegion('all');}}>
              <SelectItem value="DE" text="🇩🇪 德国（默认）"/>
              {holidayCountries.filter(c=>c.countryCode!=='DE'&&!['HK','MO','TW'].includes(c.countryCode)).map(c=><SelectItem key={c.countryCode} value={c.countryCode} text={(flags[c.countryCode]||'🌐')+' '+(countryNames[c.countryCode]||c.name)}/>)}
              <SelectItem value="HK" text="🇭🇰 中国·香港（数据可能不可用）"/>
              <SelectItem value="MO" text="🇲🇴 中国·澳门（数据可能不可用）"/>
              <SelectItem value="TW" text="🇹🇼 中国·台湾（数据可能不可用）"/>
            </Select>
            <Select id="holiday-year" labelText="年份" value={holidayYear} onChange={e=>setHolidayYear(e.currentTarget.value)}>{[2025,2026,2027,2028].map(y=><SelectItem key={y} value={String(y)} text={String(y)}/>)}</Select>
            <Select id="holiday-region" labelText="州／省／地区" value={holidayRegion} onChange={e=>setHolidayRegion(e.currentTarget.value)}><SelectItem value="all" text="全部地区"/>{holidayRegions.map(r=><SelectItem key={r} value={r} text={r}/>)}</Select>
            <Button kind="primary" onClick={()=>void loadHolidays()} disabled={busy}>查询假期</Button>
          </div>
          {busy&&active==='holidays'?<InlineLoading description="正在读取公共假期…"/>:<div className="tp-trade-tools__holiday-list">{filteredHolidays.map(h=><div className="tp-trade-tools__holiday-row" key={h.date+h.name}><div className="tp-trade-tools__holiday-date">{h.date}</div><div><strong>{h.localName||h.name}</strong><small>{h.name} · {(h.types||[]).join(' / ')||'公共假期'}</small></div><Tag type={h.global?'green':'cool-gray'}>{h.global?'全国':'地区性'}</Tag></div>)}{!filteredHolidays.length&&<p className="tp-trade-tools__empty">该条件下没有返回假期记录；请确认国家、年份或地区支持情况。</p>}</div>}
        </section>}

        {active==='shipping'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Delivery size={24}/><div><h2>国际物流追踪</h2><p>通过承运商官方 API 查询运输状态与轨迹</p></div></div>
          <div className="tp-trade-tools__form-grid">
            <Select id="carrier" labelText="物流服务商" value={carrier} onChange={e=>setCarrier(e.currentTarget.value)}><SelectItem value="dhl" text="DHL Express / Shipment Tracking"/><SelectItem value="ups" text="UPS"/><SelectItem value="fedex" text="FedEx"/></Select>
            <TextInput id="tracking-number" labelText="运单号" placeholder="输入物流追踪号码" value={trackingNumber} onChange={e=>setTrackingNumber(e.currentTarget.value)}/>
            <Button kind="primary" disabled={busy||!trackingNumber.trim()} onClick={()=>void trackShipment()}>查询物流</Button>
          </div>
          {busy&&active==='shipping'&&<InlineLoading description="正在请求承运商官方接口…"/>}
          {tracking&&<div className="tp-trade-tools__tracking"><h3>物流查询结果</h3><pre>{JSON.stringify(tracking,null,2)}</pre></div>}
          <p className="tp-trade-tools__footnote">需先在「设置中心 → 外贸工具 API」配置对应承运商凭证。DHL 追踪 API 的可用服务范围以官方账户授权为准。</p>
        </section>}

        {active==='translation'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Translate size={24}/><div><h2>DeepL 在线翻译</h2><p>使用已配置的 DeepL API，密钥仅在 Worker 服务端保存</p></div></div>
          <div className="tp-trade-tools__form-grid">
            <Select id="translate-source" labelText="源语言" value={sourceLanguage} onChange={e=>setSourceLanguage(e.currentTarget.value)}><SelectItem value="auto" text="自动识别"/>{[['EN','英语'],['DE','德语'],['FR','法语'],['ES','西班牙语'],['JA','日语'],['KO','韩语'],['ZH','中文'],['ZH-HANT','繁体中文'],['PT-BR','葡萄牙语'],['IT','意大利语']].map(([v,l])=><SelectItem key={v} value={v} text={l}/>)}</Select>
            <Select id="translate-target" labelText="目标语言" value={targetLanguage} onChange={e=>setTargetLanguage(e.currentTarget.value)}>{[['ZH','中文'],['ZH-HANT','繁体中文'],['EN-US','英语（美国）'],['EN-GB','英语（英国）'],['DE','德语'],['FR','法语'],['ES','西班牙语'],['JA','日语'],['KO','韩语'],['PT-BR','葡萄牙语（巴西）'],['IT','意大利语']].map(([v,l])=><SelectItem key={v} value={v} text={l}/>)}</Select>
          </div>
          <TextArea id="translate-text" labelText="待翻译内容" rows={5} value={translationText} onChange={e=>setTranslationText(e.currentTarget.value)} placeholder="输入邮件、询盘、产品说明或商务沟通内容…"/>
          <Button kind="primary" disabled={busy||!translationText.trim()} onClick={()=>void translate()}>开始翻译</Button>
          {translated&&<div className="tp-trade-tools__translation-result"><h3>翻译结果</h3><p>{translated}</p><Button kind="ghost" size="sm" onClick={()=>void navigator.clipboard?.writeText(translated)}>复制译文</Button></div>}
        </section>}

        {active==='contact-time'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Time size={24}/><div><h2>客户联系时机</h2><p>当地时间、工作日状态、昼夜和近三天天气</p></div></div>
          <div className="tp-trade-tools__form-grid">
            <Select id="contact-select" labelText="选择客户／联系人（可选）" value={selectedContact} onChange={e=>void chooseContact(e.currentTarget.value)}><SelectItem value="" text="手动输入地点"/>{contacts.map(c=><SelectItem key={c.id} value={c.id} text={c.label+' · '+c.address}/>)}</Select>
            <TextInput id="contact-location" labelText="国家／省州／城市或地址" value={locationQuery} onChange={e=>setLocationQuery(e.currentTarget.value)} placeholder="例如 Berlin, Germany"/>
            <Button kind="primary" disabled={busy||!locationQuery.trim()} onClick={()=>void searchLocation()}>搜索地点</Button>
          </div>
          {locations.length>0&&<div className="tp-trade-tools__location-results">{locations.map((p,i)=><Button key={p.timezone+i} kind="ghost" onClick={()=>void loadContactTime(p)}>{p.name}{p.admin1?', '+p.admin1:''} · {p.country} · {p.timezone}</Button>)}</div>}
          {busy&&active==='contact-time'&&<InlineLoading description="正在解析时区与天气…"/>}
          {location&&timeData&&<div className="tp-trade-tools__contact-result">
            <div className="tp-trade-tools__clock"><div><span>{location.name}{location.admin1?', '+location.admin1:''}, {location.country}</span><strong>{new Date(timeData.datetime).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:location.timezone})}</strong><small>{new Date(timeData.datetime).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long',timeZone:location.timezone})} · {timeData.timezone} ({timeData.utc_offset})</small></div>
              <div className="tp-trade-tools__day-status">{(()=>{const h=Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hourCycle:'h23',timeZone:location.timezone}).format(new Date(timeData.datetime)));const localWeekday=new Intl.DateTimeFormat('en',{weekday:'short',timeZone:location.timezone}).format(new Date(timeData.datetime));const isDay=h>=6&&h<18;const weekend=localWeekday==='Sun'||localWeekday==='Sat';return <><span>{isDay?'☀️':'🌙'}</span><strong>{isDay?'当地白天':'当地夜晚'}</strong><small>{weekend?'休息日':holidayToday?'公共假期':'工作日'}</small></>;})()}</div>
            </div>
            <div className="tp-trade-tools__weather">{weather.map((w,i)=><div key={w.date}><span>{i===0?'昨天':i===1?'今天':'明天'}</span><strong>{weatherIcon(w.code)}</strong><small>{w.high.toFixed(0)}° / {w.low.toFixed(0)}°C</small><small>降雨概率 {w.rain}%</small></div>)}</div>
            <p className="tp-trade-tools__footnote">工作日按当地周末与 Nager.Date 公共假期数据判断；昼夜按当地 06:00–18:00 粗略划分。天气来自 Open-Meteo。时间数据由 <a href="https://time.now" target="_blank" rel="noreferrer">Time.Now</a> 提供。</p>
          </div>}
        </section>}

        {active==='profit'&&<section className="tp-trade-tools__tool">
          <div className="tp-trade-tools__tool-title"><CarbonIcons.Calculator size={24}/><div><h2>报价利润计算器</h2><p>按目标毛利率反推报价，估算单件与订单利润</p></div></div>
          <div className="tp-trade-tools__form-grid tp-trade-tools__form-grid--profit">
            <TextInput id="profit-cost" labelText="产品成本（单件）" type="number" value={cost} onChange={e=>setCost(e.currentTarget.value)}/>
            <TextInput id="profit-freight" labelText="物流费用（单件）" type="number" value={freight} onChange={e=>setFreight(e.currentTarget.value)}/>
            <TextInput id="profit-duty" labelText="税费（单件）" type="number" value={duty} onChange={e=>setDuty(e.currentTarget.value)}/>
            <TextInput id="profit-other" labelText="其他费用（单件）" type="number" value={other} onChange={e=>setOther(e.currentTarget.value)}/>
            <TextInput id="profit-margin" labelText="目标毛利率（%）" type="number" value={margin} onChange={e=>setMargin(e.currentTarget.value)}/>
            <TextInput id="profit-qty" labelText="报价数量" type="number" value={saleQty} onChange={e=>setSaleQty(e.currentTarget.value)}/>
          </div>
          <div className="tp-trade-tools__profit-result"><div><span>单件总成本</span><strong>{profit.totalCost.toFixed(2)}</strong></div><div><span>建议单价</span><strong>{profit.price.toFixed(2)}</strong></div><div><span>单件利润</span><strong>{profit.profit.toFixed(2)}</strong></div><div><span>订单总利润</span><strong>{(profit.profit*profit.qty).toFixed(2)}</strong></div><div><span>目标毛利率</span><strong>{profit.margin.toFixed(2)}%</strong></div></div>
          <p className="tp-trade-tools__footnote">当前按不含税销售额计算毛利率，报价币种由你录入成本时自行统一；尚未纳入汇率、佣金和阶梯价格。</p>
        </section>}
      </section>
    </div>
  </main>;
}
