import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, ComboBox, Column, Grid, InlineNotification, NumberInput, Select, SelectItem,
  Tag, TextInput, Tile,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type MakeItem = { name: string; logoKey?: string };
type FitmentRecord = { id: string; provider: string; confidence: string; record: Record<string, unknown> };
type ApiPayload = {
  data?: {
    items?: unknown[];
    records?: FitmentRecord[];
    raw?: Record<string, unknown>;
    sources?: Array<{ id: string; status: string; license?: string; attribution?: string; fields?: string[] }>;
    limitations?: string[];
    vehicle?: Record<string, unknown>;
  };
  error?: { message?: string };
};
type Manufacturer = { id: string; name: string; country: string; domain: string; logo: string };
const manufacturers: Manufacturer[] = [
  { id: 'bbs', name: 'BBS', country: 'Germany', domain: 'bbs.com', logo: 'https://cdn.simpleicons.org/bmw' },
  { id: 'oz', name: 'OZ Racing', country: 'Italy', domain: 'ozracing.com', logo: 'https://cdn.simpleicons.org/ozon' },
  { id: 'enkei', name: 'Enkei', country: 'Japan', domain: 'enkei.com', logo: 'https://cdn.simpleicons.org/enkei' },
  { id: 'rays', name: 'RAYS / VOLK RACING', country: 'Japan', domain: 'rayswheels.co.jp', logo: 'https://cdn.simpleicons.org/ray' },
  { id: 'work', name: 'WORK Wheels', country: 'Japan', domain: 'workwheelsusa.com', logo: 'https://cdn.simpleicons.org/workplace' },
  { id: 'hre', name: 'HRE Performance Wheels', country: 'United States', domain: 'hrewheels.com', logo: 'https://cdn.simpleicons.org/hp' },
  { id: 'vossen', name: 'Vossen', country: 'United States', domain: 'vossenwheels.com', logo: 'https://cdn.simpleicons.org/v' },
  { id: 'rotiform', name: 'Rotiform', country: 'United States', domain: 'rotiform.com', logo: 'https://cdn.simpleicons.org/r' },
  { id: 'konig', name: 'Konig', country: 'United States', domain: 'konigwheels.com', logo: 'https://cdn.simpleicons.org/k' },
  { id: 'forgeline', name: 'Forgeline', country: 'United States', domain: 'forgeline.com', logo: 'https://cdn.simpleicons.org/forgejo' },
  { id: 'method', name: 'Method Race Wheels', country: 'United States', domain: 'methodracewheels.com', logo: 'https://cdn.simpleicons.org/m' },
  { id: 'fuel', name: 'Fuel Off-Road', country: 'United States', domain: 'fueloffroad.com', logo: 'https://cdn.simpleicons.org/f' },
];

const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '—';
const toNumber = (value: string) => value.trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const asLabel = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return String(item.name ?? item.slug ?? item.year ?? item.trim ?? item.title ?? '');
  }
  return '';
};
const tireDiameter = (value: string): number | null => {
  const match = value.trim().match(/^(\d{3})\/(\d{2})R(\d{2})$/i);
  if (!match) return null;
  return Number(match[3]) * 25.4 + 2 * Number(match[1]) * Number(match[2]) / 100;
};
const wheelSpec = (value: string) => {
  const match = value.match(/(\d{1,2}(?:\.\d)?)\s*[x×]\s*(\d{1,2}(?:\.\d)?)\s*J?\s*(?:at\s*)?ET\s*(-?\d+(?:\.\d+)?)/i);
  return match ? { diameter: match[1], width: match[2], et: match[3] } : null;
};
const recordStrings = (value: unknown, output: string[] = [], depth = 0): string[] => {
  if (depth > 6 || value == null) return output;
  if (typeof value === 'string') { output.push(value); return output; }
  if (Array.isArray(value)) { value.forEach(item => recordStrings(item, output, depth + 1)); return output; }
  if (typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(item => recordStrings(item, output, depth + 1));
  return output;
};

export function WheelFitmentPage() {
  const [makes, setMakes] = useState<MakeItem[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [generations, setGenerations] = useState<unknown[]>([]);
  const [modifications, setModifications] = useState<unknown[]>([]);
  const [make, setMake] = useState<MakeItem | null>(null);
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [generation, setGeneration] = useState('');
  const [modification, setModification] = useState('');
  const [region, setRegion] = useState('all');
  const [vin, setVin] = useState('');
  const [vinResult, setVinResult] = useState<unknown>(null);
  const [records, setRecords] = useState<FitmentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState('');
  const [sources, setSources] = useState<ApiPayload['data'] extends infer D ? D extends { sources?: infer S } ? S : never : never>([]);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [retrievedAt, setRetrievedAt] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null);
  const [style, setStyle] = useState('oem-plus');
  const [frontOldWidth, setFrontOldWidth] = useState('8');
  const [frontOldEt, setFrontOldEt] = useState('30');
  const [frontNewWidth, setFrontNewWidth] = useState('9');
  const [frontNewEt, setFrontNewEt] = useState('35');
  const [rearOldWidth, setRearOldWidth] = useState('9');
  const [rearOldEt, setRearOldEt] = useState('44');
  const [rearNewWidth, setRearNewWidth] = useState('10');
  const [rearNewEt, setRearNewEt] = useState('40');
  const [oldTire, setOldTire] = useState('');
  const [newTire, setNewTire] = useState('');

  const request = useCallback(async (path: string) => {
    const client = await getSupabaseClient();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session?.access_token) throw new Error('登录会话已失效，请重新登录。');
    const response = await fetch('/api/v1/wheel-fitment/' + path, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + sessionData.session.access_token },
    });
    const payload = await response.json() as ApiPayload;
    if (!response.ok) throw new Error(payload.error?.message || '车辆数据查询失败。');
    return payload.data ?? {};
  }, []);

  const load = useCallback(async (kind: string, params: Record<string, string> = {}) => {
    setBusy(kind); setError('');
    try {
      const query = new URLSearchParams(params);
      const result = await request(kind + (query.size ? '?' + query.toString() : ''));
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '车辆数据查询失败。');
      return null;
    } finally { setBusy(''); }
  }, [request]);

  useEffect(() => {
    let active = true;
    void load('makes', { region }).then(result => {
      if (!active || !result?.items) return;
      setMakes(result.items.map(item => typeof item === 'string' ? { name: item } : item as MakeItem));
      setSources(result.sources ?? []);
    });
    return () => { active = false; };
  }, [load, region]);

  const chooseMake = async (item: MakeItem | null) => {
    setMake(item); setModel(''); setYear(''); setGeneration(''); setModification('');
    setModels([]); setYears([]); setGenerations([]); setModifications([]); setRecords([]); setRaw(null);
    if (!item) return;
    const result = await load('models', { make: item.name, region });
    if (result?.items) setModels(result.items.map(asLabel).filter(Boolean));
  };
  const chooseModel = async (value: string) => {
    setModel(value); setYear(''); setGeneration(''); setModification('');
    setYears([]); setGenerations([]); setModifications([]); setRecords([]); setRaw(null);
    if (!make || !value) return;
    const [yearResult, generationResult] = await Promise.all([
      load('years', { make: make.name, model: value, region }),
      load('generations', { make: make.name, model: value, region }),
    ]);
    if (yearResult?.items) setYears(yearResult.items.map(asLabel).filter(Boolean));
    if (generationResult?.items) setGenerations(generationResult.items);
  };
  const chooseYear = async (value: string) => {
    setYear(value); setModification(''); setModifications([]); setRecords([]); setRaw(null);
    if (!make || !model || !value) return;
    const result = await load('modifications', { make: make.name, model, year: value, region });
    if (result?.items) setModifications(result.items);
  };
  const searchVehicle = async () => {
    if (!make || !model) { setError('请先选择车辆品牌和车型。'); return; }
    const result = await load('vehicle', {
      make: make.name, model, year, generation, modification, region,
    });
    if (!result) return;
    setRecords(result.records ?? []);
    setRaw(result.raw ?? null);
    setRetrievedAt(String((result as Record<string, unknown>).retrievedAt ?? new Date().toISOString()));
    setSources(result.sources ?? []);
    setSelectedRecord('');
  };
  const decodeVin = async () => {
    if (!vin.trim()) { setError('请输入 VIN。'); return; }
    const result = await load('vin', { vin: vin.trim() });
    if (result) setVinResult(result.raw ?? result);
  };
  const selectBaseline = (item: FitmentRecord) => {
    setSelectedRecord(item.id);
    const wheelText = String(item.record.oe_wheel ?? item.record.oem_rim ?? recordStrings(item.record).find(value => /\d{1,2}(?:\.\d)?\s*[x×]\s*\d+(?:\.\d)?J?/i.test(value)) ?? '');
    const parsed = wheelSpec(wheelText);
    if (parsed) {
      setFrontOldWidth(parsed.width); setFrontOldEt(parsed.et);
      setRearOldWidth(parsed.width); setRearOldEt(parsed.et);
    }
    const tireText = String(item.record.oe_tire ?? item.record.oem_tire ?? recordStrings(item.record).find(value => /\d{3}\/\d{2}R\d{2}/i.test(value)) ?? '');
    if (/^\d{3}\/\d{2}R\d{2}$/i.test(tireText.trim())) setOldTire(tireText.trim());
  };

  const selected = records.find(item => item.id === selectedRecord) ?? null;
  const selectedStrings = selected ? recordStrings(selected.record) : [];
  const selectedRim = selectedStrings.map(wheelSpec).find(Boolean) ?? null;
  const selectedTireText = selectedStrings.find(value => /\d{3}\/\d{2}R\d{2}/i.test(value)) ?? '';
  const front = useMemo(() => {
    const oldW = toNumber(frontOldWidth), oldE = toNumber(frontOldEt), newW = toNumber(frontNewWidth), newE = toNumber(frontNewEt);
    if ([oldW, oldE, newW, newE].some(value => value === null)) return null;
    const half = ((newW as number) - (oldW as number)) * 25.4 / 2;
    const et = (newE as number) - (oldE as number);
    return { inner: half + et, outer: half - et };
  }, [frontOldWidth, frontOldEt, frontNewWidth, frontNewEt]);
  const rear = useMemo(() => {
    const oldW = toNumber(rearOldWidth), oldE = toNumber(rearOldEt), newW = toNumber(rearNewWidth), newE = toNumber(rearNewEt);
    if ([oldW, oldE, newW, newE].some(value => value === null)) return null;
    const half = ((newW as number) - (oldW as number)) * 25.4 / 2;
    const et = (newE as number) - (oldE as number);
    return { inner: half + et, outer: half - et };
  }, [rearOldWidth, rearOldEt, rearNewWidth, rearNewEt]);
  const oldDiameter = tireDiameter(oldTire);
  const newDiameter = tireDiameter(newTire);
  const tireDelta = oldDiameter && newDiameter ? (newDiameter - oldDiameter) / oldDiameter * 100 : null;
  const selectedVehicle = [make?.name, model, year, generation, modification].filter(Boolean).join(' · ');

  return (
    <main className="tp-wheel-fitment">
      <div className="tp-page-heading">
        <div><p className="cds--label">HARMONIA / WHEEL ENGINEERING</p><h1>轮毂适配与改装</h1><p>多数据源车辆识别、原厂规格检索、改装计算与适配验证。</p></div>
        <Tag type="blue">多源数据工作台</Tag>
      </div>
      {error && <InlineNotification kind="error" lowContrast title="查询未完成" subtitle={error} />}
      <InlineNotification kind="info" lowContrast title="数据源策略" subtitle="优先调用 Wheel-Size 专业适配 API；同时使用 ANKUSI 开放数据集补充 PCD、中心孔、原厂及参考改装规格。VIN 由 NHTSA vPIC 辅助解码。各来源原始响应均保留，不会把参考数据标记为安全认证。" />

      <section aria-labelledby="vehicle-section-title">
        <div className="tp-fitment-section-heading"><div><p className="cds--label">STEP 01</p><h2 id="vehicle-section-title">车辆识别与目录</h2><p>品牌、车型、年款、世代、具体配置和销售市场逐级筛选。</p></div><Tag type={make && model ? 'green' : 'cool-gray'}>{make && model ? '车辆已选择' : '等待选择'}</Tag></div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={4} lg={4}>
              <ComboBox id="vehicle-make" titleText="车辆品牌（含品牌标识）" placeholder={busy === 'makes' ? '正在加载品牌目录…' : '搜索品牌'} items={makes} itemToString={(item: MakeItem | null) => item?.name ?? ''} itemToElement={(item: MakeItem) => <div className="tp-fitment-manufacturer-option"><img src={`https://cdn.simpleicons.org/${item.logoKey || item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`} alt="" width="28" height="28" onError={event => { event.currentTarget.style.display = 'none'; }} /><span className="tp-fitment-brand-fallback">{item.name.slice(0, 2).toUpperCase()}</span><strong>{item.name}</strong></div>} selectedItem={make} onChange={({ selectedItem }) => void chooseMake(selectedItem ?? null)} />
            </Column>
            <Column sm={4} md={4} lg={4}><Select id="vehicle-model" labelText="车型 / 车系" value={model} disabled={!make || models.length === 0} onChange={event => void chooseModel(event.currentTarget.value)}><SelectItem value="" text="请选择车型" />{models.map(item => <SelectItem key={item} value={item} text={item} />)}</Select></Column>
            <Column sm={4} md={4} lg={4}><Select id="vehicle-year" labelText="年款" value={year} disabled={!model || years.length === 0} onChange={event => void chooseYear(event.currentTarget.value)}><SelectItem value="" text="请选择年款" />{years.map(item => <SelectItem key={item} value={item} text={item} />)}</Select></Column>
            <Column sm={4} md={4} lg={4}><Select id="vehicle-generation" labelText="世代 / 底盘" value={generation} disabled={!model || generations.length === 0} onChange={event => { setGeneration(event.currentTarget.value); setRecords([]); }}><SelectItem value="" text="全部世代 / 未指定" />{generations.map((item, index) => <SelectItem key={index} value={String((item as Record<string, unknown>)?.slug ?? (item as Record<string, unknown>)?.id ?? asLabel(item))} text={asLabel(item)} />)}</Select></Column>
            <Column sm={4} md={4} lg={4}><Select id="vehicle-modification" labelText="配置 / 动力版本" value={modification} disabled={!model || modifications.length === 0} onChange={event => setModification(event.currentTarget.value)}><SelectItem value="" text="全部配置 / 未指定" />{modifications.map((item, index) => <SelectItem key={index} value={String((item as Record<string, unknown>)?.slug ?? (item as Record<string, unknown>)?.id ?? asLabel(item))} text={asLabel(item)} />)}</Select></Column>
            <Column sm={4} md={4} lg={4}><Select id="vehicle-region" labelText="销售市场 / 数据区域" value={region} onChange={event => { setRegion(event.currentTarget.value); setModels([]); setYears([]); setRecords([]); }}><SelectItem value="all" text="全部可用市场" /><SelectItem value="usdm" text="北美 USDM" /><SelectItem value="eudm" text="欧洲 EUDM" /><SelectItem value="jdm" text="日本 JDM" /><SelectItem value="cndm" text="中国" /><SelectItem value="seadm" text="东南亚" /><SelectItem value="ocdm" text="大洋洲" /><SelectItem value="cdm" text="加拿大" /></Select></Column>
          </Grid>
          <div className="tp-fitment-inline-note"><span className="cds--label">当前车辆</span><strong>{selectedVehicle || '尚未选择'}</strong></div>
          <Button kind="primary" onClick={() => void searchVehicle()} disabled={!make || !model || Boolean(busy)}>{busy === 'vehicle' ? '正在查询原厂规格…' : '查询原厂及适配规格'}</Button>
          <div className="tp-fitment-inline-note"><TextInput id="vehicle-vin" labelText="VIN 辅助识别（选填）" placeholder="输入 17 位 VIN" value={vin} onChange={event => setVin(event.currentTarget.value)} /><Button kind="tertiary" onClick={() => void decodeVin()} disabled={!vin || Boolean(busy)}>解码 VIN</Button></div>
          {vinResult && <details><summary>查看 NHTSA VIN 解码完整响应</summary><pre className="tp-fitment-json">{JSON.stringify(vinResult, null, 2)}</pre></details>}
          {!make && <InlineNotification kind="info" lowContrast title="品牌目录加载说明" subtitle="目录会合并 Wheel-Size 与 ANKUSI 返回结果。未配置 Wheel-Size API Key 时，仍可使用 ANKUSI 开放数据覆盖的品牌与车辆记录。" />}
        </Tile>
      </section>

      <section aria-labelledby="oem-section-title">
        <div className="tp-fitment-section-heading"><div><p className="cds--label">STEP 02</p><h2 id="oem-section-title">原厂规格与多配置结果</h2><p>同一车型可能有多种年款、动力、刹车及前后轴组合，必须逐条确认。</p></div><Tag type={records.length ? 'green' : 'cool-gray'}>{records.length} 条记录</Tag></div>
        {retrievedAt && <p className="cds--label">数据查询时间：{new Date(retrievedAt).toLocaleString()}</p>}
        {records.length === 0 ? <InlineNotification kind="warning" lowContrast title="尚无原厂规格结果" subtitle="请完成车辆选择并执行查询。若没有匹配记录，请检查销售市场、年款、世代或配置，不要用相似车型数据代替。" /> : <>
          <Grid condensed>
            {records.map((item, index) => <Column key={item.id} sm={4} md={8} lg={8}>
              <Tile>
                <div className="tp-fitment-section-heading"><div><h3>{item.provider} · 规格记录 {index + 1}</h3><p className="cds--label">{item.confidence === 'professional_database' ? '专业适配数据库' : '开放参考数据集'}</p></div><Tag type={item.provider === 'Wheel-Size' ? 'green' : 'blue'}>{item.provider}</Tag></div>
                <p>{String(item.record.make ?? make?.name ?? '')} {String(item.record.model ?? model)} {String(item.record.year ?? year)}</p>
                <p><strong>PCD：</strong>{String(item.record.technical && (item.record.technical as Record<string, unknown>).bolt_pattern || item.record.bolt_pattern || '未提供')}</p>
                <p><strong>中心孔：</strong>{String(item.record.technical && (item.record.technical as Record<string, unknown>).center_bore || item.record.center_bore_mm || '未提供')} mm</p>
                <p><strong>原厂轮毂：</strong>{String(item.record.oe_wheel ?? '请展开查看完整 OE 数据')}</p>
                <p><strong>参考改装：</strong>{String(item.record.flush_wheel ?? item.record.max_wheel ?? '未提供')}</p>
                <Button kind={selectedRecord === item.id ? 'primary' : 'tertiary'} size="sm" onClick={() => selectBaseline(item)}>{selectedRecord === item.id ? '已选为计算基准' : '选择此记录为计算基准'}</Button>
                <details><summary>查看该条 API 完整字段</summary><pre className="tp-fitment-json">{JSON.stringify(item.record, null, 2)}</pre></details>
              </Tile>
            </Column>)}
          </Grid>
          {selected && <InlineNotification kind="info" lowContrast title="已选择计算基准" subtitle={`来源：${selected.provider}。系统保留原始记录；若该记录含前后轴轮毂/轮胎信息，可在下方核对后用于计算。`} />}
        </>}
        {raw && <details><summary>查看所有数据源原始响应（包含未映射字段）</summary><pre className="tp-fitment-json">{JSON.stringify(raw, null, 2)}</pre></details>}
      </section>

      <section aria-labelledby="target-section-title">
        <div className="tp-fitment-section-heading"><div><p className="cds--label">STEP 03</p><h2 id="target-section-title">客户改装需求与参数</h2><p>选择方案取向，或直接输入客户指定的前后轴轮毂和轮胎参数。</p></div></div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}><Select id="fitment-style" labelText="改装取向" value={style} onChange={event => setStyle(event.currentTarget.value)}><SelectItem value="oem-plus" text="OEM Plus · 原厂升级" /><SelectItem value="performance" text="Performance · 运动性能" /><SelectItem value="flush" text="Flush · 视觉齐平" /><SelectItem value="extreme" text="Extreme · 极限改装" /></Select></Column>
            <Column sm={4} md={8} lg={8}><TextInput id="target-tire" labelText="目标轮胎规格" placeholder="例如 255/35R20" value={newTire} onChange={event => setNewTire(event.currentTarget.value)} /></Column>
          </Grid>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}><h3>前轴</h3><NumberInput id="front-old-width" label="基准 J" min={4} max={15} step={0.5} value={frontOldWidth} onChange={(_event, state) => setFrontOldWidth(String(state.value ?? ''))} /><NumberInput id="front-old-et" label="基准 ET（mm）" value={frontOldEt} onChange={(_event, state) => setFrontOldEt(String(state.value ?? ''))} /><NumberInput id="front-new-width" label="目标 J" min={4} max={15} step={0.5} value={frontNewWidth} onChange={(_event, state) => setFrontNewWidth(String(state.value ?? ''))} /><NumberInput id="front-new-et" label="目标 ET（mm）" value={frontNewEt} onChange={(_event, state) => setFrontNewEt(String(state.value ?? ''))} /></Column>
            <Column sm={4} md={8} lg={8}><h3>后轴</h3><NumberInput id="rear-old-width" label="基准 J" min={4} max={15} step={0.5} value={rearOldWidth} onChange={(_event, state) => setRearOldWidth(String(state.value ?? ''))} /><NumberInput id="rear-old-et" label="基准 ET（mm）" value={rearOldEt} onChange={(_event, state) => setRearOldEt(String(state.value ?? ''))} /><NumberInput id="rear-new-width" label="目标 J" min={4} max={15} step={0.5} value={rearNewWidth} onChange={(_event, state) => setRearNewWidth(String(state.value ?? ''))} /><NumberInput id="rear-new-et" label="目标 ET（mm）" value={rearNewEt} onChange={(_event, state) => setRearNewEt(String(state.value ?? ''))} /></Column>
          </Grid>
          <Grid condensed><Column sm={4} md={8} lg={8}><TextInput id="baseline-tire" labelText="基准轮胎规格" placeholder="例如 245/40R19" value={oldTire} onChange={event => setOldTire(event.currentTarget.value)} /></Column><Column sm={4} md={8} lg={8}><p className="cds--label">已选数据基准</p><p>{selected ? selected.provider + ' · ' + selected.id : '手动参数 / 尚未选择数据库记录'}</p>{selectedTireText && <p>记录中识别到轮胎：{selectedTireText}</p>}{selectedRim && <p>识别到轮毂参数：{selectedRim.width}J ET{selectedRim.et}</p>}</Column></Grid>
          <InlineNotification kind="info" lowContrast title="参数来源与确认" subtitle="目前保留手动输入作为明确基准。API 返回的复杂 OE 前后轴组合需按完整原始字段核对后录入，系统不会把无法确定轴位的字符串自动套用到前后轴。" />
        </Tile>
      </section>

      <section aria-labelledby="analysis-section-title">
        <div className="tp-fitment-section-heading"><div><p className="cds--label">STEP 04</p><h2 id="analysis-section-title">几何计算与完整适配验证</h2><p>所有计算只在输入有效时显示；理论位移不能替代实车剩余间隙。</p></div><Tag type="blue">实时计算</Tag></div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}><h3>前轴几何变化</h3>{front ? <><p><strong>内侧边缘：{fmt(front.inner)} mm</strong></p><p><strong>外侧边缘：{fmt(front.outer)} mm</strong></p></> : <p>请填写有效的基准及目标 J / ET。</p>}<p className="cds--label">ΔInner = ((Jnew − Jold) × 25.4 ÷ 2) + (ETnew − ETold)</p><p className="cds--label">ΔOuter = ((Jnew − Jold) × 25.4 ÷ 2) − (ETnew − ETold)</p></Column>
            <Column sm={4} md={8} lg={8}><h3>后轴几何变化</h3>{rear ? <><p><strong>内侧边缘：{fmt(rear.inner)} mm</strong></p><p><strong>外侧边缘：{fmt(rear.outer)} mm</strong></p></> : <p>请填写有效的基准及目标 J / ET。</p>}<p className="cds--label">正内侧值 = 内侧空间减少；正外侧值 = 向翼子板突出。</p></Column>
          </Grid>
        </Tile>
        <Tile><h3>轮胎外径与速度表影响</h3>{oldDiameter && newDiameter && tireDelta !== null ? <Grid condensed><Column sm={4} md={4} lg={4}><p className="cds--label">基准外径</p><h4>{fmt(oldDiameter)} mm</h4></Column><Column sm={4} md={4} lg={4}><p className="cds--label">目标外径</p><h4>{fmt(newDiameter)} mm</h4></Column><Column sm={4} md={4} lg={4}><p className="cds--label">外径变化</p><h4>{fmt(tireDelta)}%</h4></Column><Column sm={4} md={4} lg={4}><p className="cds--label">理论实际速度（表显 100 km/h）</p><h4>{fmt(100 * newDiameter / oldDiameter)} km/h</h4></Column></Grid> : <InlineNotification kind="warning" lowContrast title="需要有效轮胎规格" subtitle="请输入基准和目标规格，例如 245/40R19 与 255/35R20。" />}<p className="cds--label">D = 25.4 × 轮辋直径 + 2 × 胎宽 × 扁平比 ÷ 100；Vactual = Vindicated × Dnew ÷ Dold。</p></Tile>
        <Tile><h3>适配验证矩阵</h3><Grid condensed><Column sm={4} md={8} lg={8}><p><Tag type="cool-gray">需车辆/轮毂数据</Tag> PCD、螺栓孔数、中心孔与定位环</p><p><Tag type="cool-gray">需制造商数据</Tag> 螺栓/螺母牙距、座型、紧固扭矩</p><p><Tag type="cool-gray">需 3D 模板</Tag> 卡钳、刹车盘、辐条背部间隙</p><p><Tag type="cool-gray">需实车测量</Tag> 悬挂、转向全行程、压缩空间</p></Column><Column sm={4} md={8} lg={8}><p><Tag type="cool-gray">需轮胎厂数据</Tag> 实际断面宽度、负载指数、速度级别</p><p><Tag type="cool-gray">需实车测量</Tag> 翼子板、内衬及动态间隙</p><p><Tag type="cool-gray">需车辆资料</Tag> 轴荷、载重、胎压及 TPMS</p><p><Tag type="cool-gray">需地区规则</Tag> 轮胎外径、轮距、车身突出法规</p></Column></Grid><InlineNotification kind="warning" lowContrast title="当前不能给出安全认证" subtitle="几何计算可自动完成；但未取得对应车型、刹车套件和具体轮毂型号的模板或实测间隙前，只能给出待验证建议，不会输出已安全适配。" /></Tile>
      </section>

      <section aria-labelledby="product-section-title"><div className="tp-fitment-section-heading"><div><p className="cds--label">STEP 05 · OPTIONAL</p><h2 id="product-section-title">轮毂制造商筛选</h2><p>制造商只用于后续产品目录筛选，不作为车辆计算的前置条件。</p></div></div><Tile><ComboBox id="wheel-manufacturer" titleText="轮毂制造商（可选）" placeholder="不限定品牌，或搜索制造商" items={manufacturers} itemToString={(item: Manufacturer | null) => item?.name ?? ''} itemToElement={(item: Manufacturer) => <div className="tp-fitment-manufacturer-option"><img src={item.logo} alt="" width="28" height="28" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /><span><strong>{item.name}</strong><small>{item.country}</small></span></div>} selectedItem={manufacturer} onChange={({ selectedItem }) => setManufacturer(selectedItem ?? null)} /><Button kind="ghost" size="sm" disabled={!manufacturer} onClick={() => setManufacturer(null)}>清除制造商筛选</Button><InlineNotification kind="info" lowContrast title="具体产品目录仍需接入" subtitle="只有获得具体系列、型号、轮辋尺寸、负载额定值及卡钳模板后，才可以验证某个实际产品。" /></Tile></section>

      <section className="tp-fitment-footer"><p className="cds--label">DATA PROVIDERS / ATTRIBUTION</p>{sources.map(source => <p key={source.id}><strong>{source.id}</strong> · {source.status}{source.license ? ' · ' + source.license : ''}</p>)}<p>ANKUSI Wheel Fitment Dataset — CC BY 4.0，需保留来源署名。Wheel-Size API 的车辆查询属于用户主动操作；API Key 仅保存在 Worker Secret 中。</p><p>数据更新时间及授权范围以各供应商响应和服务协议为准。原始响应保留于本次查询结果，供逐字段审查。</p></section>
    </main>
  );
}
