import { useMemo, useState } from 'react';
import {
  Button, ComboBox, Column, Grid, InlineNotification, NumberInput, Select, SelectItem,
  Tag, TextInput, Tile,
} from '@/design-system';

type Manufacturer = { id: string; name: string; country: string; domain: string; logo: string };
const manufacturers: Manufacturer[] = [
  { id: 'bbs', name: 'BBS', country: 'Germany', domain: 'bbs.com', logo: 'https://logo.clearbit.com/bbs.com' },
  { id: 'oz', name: 'OZ Racing', country: 'Italy', domain: 'ozracing.com', logo: 'https://logo.clearbit.com/ozracing.com' },
  { id: 'enkei', name: 'Enkei', country: 'Japan', domain: 'enkei.com', logo: 'https://logo.clearbit.com/enkei.com' },
  { id: 'rays', name: 'RAYS / VOLK RACING', country: 'Japan', domain: 'rayswheels.co.jp', logo: 'https://logo.clearbit.com/rayswheels.co.jp' },
  { id: 'work', name: 'WORK Wheels', country: 'Japan', domain: 'workwheelsusa.com', logo: 'https://logo.clearbit.com/workwheelsusa.com' },
  { id: 'hre', name: 'HRE Performance Wheels', country: 'United States', domain: 'hrewheels.com', logo: 'https://logo.clearbit.com/hrewheels.com' },
  { id: 'vossen', name: 'Vossen', country: 'United States', domain: 'vossenwheels.com', logo: 'https://logo.clearbit.com/vossenwheels.com' },
  { id: 'rotiform', name: 'Rotiform', country: 'United States', domain: 'rotiform.com', logo: 'https://logo.clearbit.com/rotiform.com' },
  { id: 'konig', name: 'Konig', country: 'United States', domain: 'konigwheels.com', logo: 'https://logo.clearbit.com/konigwheels.com' },
  { id: 'forgeline', name: 'Forgeline', country: 'United States', domain: 'forgeline.com', logo: 'https://logo.clearbit.com/forgeline.com' },
  { id: 'method', name: 'Method Race Wheels', country: 'United States', domain: 'methodracewheels.com', logo: 'https://logo.clearbit.com/methodracewheels.com' },
  { id: 'fuel', name: 'Fuel Off-Road', country: 'United States', domain: 'fueloffroad.com', logo: 'https://logo.clearbit.com/fueloffroad.com' },
];

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '—';

export function WheelFitmentPage() {
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [year, setYear] = useState('');
  const [trim, setTrim] = useState('');
  const [chassis, setChassis] = useState('');
  const [market, setMarket] = useState('global');
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
  const [oldTire, setOldTire] = useState('245/40R19');
  const [newTire, setNewTire] = useState('255/35R20');

  const front = useMemo(() => {
    const widthDelta = (numberValue(frontNewWidth) - numberValue(frontOldWidth)) * 25.4 / 2;
    const etDelta = numberValue(frontNewEt) - numberValue(frontOldEt);
    return { inner: widthDelta + etDelta, outer: widthDelta - etDelta };
  }, [frontOldWidth, frontOldEt, frontNewWidth, frontNewEt]);
  const rear = useMemo(() => {
    const widthDelta = (numberValue(rearNewWidth) - numberValue(rearOldWidth)) * 25.4 / 2;
    const etDelta = numberValue(rearNewEt) - numberValue(rearOldEt);
    return { inner: widthDelta + etDelta, outer: widthDelta - etDelta };
  }, [rearOldWidth, rearOldEt, rearNewWidth, rearNewEt]);
  const tireComparison = useMemo(() => {
    const parse = (value: string) => {
      const match = value.trim().match(/^(\d{3})\/(\d{2})R(\d{2})$/i);
      if (!match) return null;
      const width = Number(match[1]);
      const aspect = Number(match[2]);
      const rim = Number(match[3]);
      return rim * 25.4 + 2 * width * aspect / 100;
    };
    const oldValue = parse(oldTire);
    const newValue = parse(newTire);
    if (!oldValue || !newValue) return null;
    return { oldValue, newValue, delta: (newValue - oldValue) / oldValue * 100 };
  }, [oldTire, newTire]);

  const selectedVehicle = [vehicleMake, vehicleModel, year, trim, chassis].filter(Boolean).join(' · ');

  return (
    <main className="tp-wheel-fitment">
      <div className="tp-page-heading">
        <div>
          <p className="cds--label">HARMONIA / WHEEL ENGINEERING</p>
          <h1>轮毂适配与改装</h1>
          <p>先识别车辆，再读取原厂规格、定义改装目标并验证轮毂适配性。</p>
        </div>
        <Tag type="blue">工程计算工作台</Tag>
      </div>

      <InlineNotification
        kind="info"
        lowContrast
        title="数据完整性"
        subtitle="当前版本提供车辆信息录入和几何计算。车辆数据库、OEM 参数、刹车模板及实车间隙尚未接入；未验证项目会明确标记，不会推断为安全适配。"
      />

      <section aria-labelledby="vehicle-section-title">
        <div className="tp-fitment-section-heading">
          <div><p className="cds--label">STEP 01</p><h2 id="vehicle-section-title">选择车辆</h2><p>车辆是适配计算的起点。请尽可能填写具体年款、配置和底盘代号。</p></div>
          <Tag type={selectedVehicle ? 'green' : 'cool-gray'}>{selectedVehicle ? '已填写车辆信息' : '待填写'}</Tag>
        </div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={4} lg={4}>
              <TextInput id="vehicle-make" labelText="车辆品牌" placeholder="例如 BMW" value={vehicleMake} onChange={event => setVehicleMake(event.currentTarget.value)} />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <TextInput id="vehicle-model" labelText="车型 / 车系" placeholder="例如 M3" value={vehicleModel} onChange={event => setVehicleModel(event.currentTarget.value)} />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <TextInput id="vehicle-year" labelText="年款" placeholder="例如 2024" value={year} onChange={event => setYear(event.currentTarget.value)} />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <TextInput id="vehicle-trim" labelText="具体配置 / 版本" placeholder="例如 Competition xDrive" value={trim} onChange={event => setTrim(event.currentTarget.value)} />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <TextInput id="vehicle-chassis" labelText="底盘代号（选填）" placeholder="例如 G80" value={chassis} onChange={event => setChassis(event.currentTarget.value)} />
            </Column>
            <Column sm={4} md={4} lg={4}>
              <Select id="vehicle-market" labelText="销售市场" value={market} onChange={event => setMarket(event.currentTarget.value)}>
                <SelectItem value="global" text="全球 / 未指定" />
                <SelectItem value="us" text="北美" />
                <SelectItem value="eu" text="欧洲" />
                <SelectItem value="jp" text="日本" />
                <SelectItem value="cn" text="中国" />
              </Select>
            </Column>
          </Grid>
          <div className="tp-fitment-inline-note">
            <span className="cds--label">当前车辆</span>
            <strong>{selectedVehicle || '尚未选择车辆'}</strong>
            <span className="cds--label">市场：{market.toUpperCase()}</span>
          </div>
          <InlineNotification kind="warning" lowContrast title="车辆目录尚未连接" subtitle="以上是车辆身份字段，不是虚构的车型数据库下拉选项。接入车辆数据源后，将升级为品牌、车型、年款、配置逐级检索，并支持 VIN 辅助识别。" />
        </Tile>
      </section>

      <section aria-labelledby="oem-section-title">
        <div className="tp-fitment-section-heading">
          <div><p className="cds--label">STEP 02</p><h2 id="oem-section-title">原厂规格与基准</h2><p>填写车辆原厂前后轴轮毂及轮胎规格，作为改装比较基准。</p></div>
          <Tag type="cool-gray">需数据源确认</Tag>
        </div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <h3>前轴 / Front axle</h3>
              <Grid condensed>
                <Column sm={2} md={4} lg={8}><NumberInput id="front-oem-width" label="原厂宽度（J）" min={4} max={15} step={0.5} value={frontOldWidth} onChange={(_e, state) => setFrontOldWidth(String(state.value ?? ''))} /></Column>
                <Column sm={2} md={4} lg={8}><NumberInput id="front-oem-et" label="原厂偏距 ET（mm）" min={-100} max={150} value={frontOldEt} onChange={(_e, state) => setFrontOldEt(String(state.value ?? ''))} /></Column>
              </Grid>
            </Column>
            <Column sm={4} md={8} lg={8}>
              <h3>后轴 / Rear axle</h3>
              <Grid condensed>
                <Column sm={2} md={4} lg={8}><NumberInput id="rear-oem-width" label="原厂宽度（J）" min={4} max={15} step={0.5} value={rearOldWidth} onChange={(_e, state) => setRearOldWidth(String(state.value ?? ''))} /></Column>
                <Column sm={2} md={4} lg={8}><NumberInput id="rear-oem-et" label="原厂偏距 ET（mm）" min={-100} max={150} value={rearOldEt} onChange={(_e, state) => setRearOldEt(String(state.value ?? ''))} /></Column>
              </Grid>
            </Column>
            <Column sm={4} md={8} lg={8}><TextInput id="fitment-oem-tire" labelText="原厂轮胎规格" value={oldTire} onChange={event => setOldTire(event.currentTarget.value)} placeholder="245/40R19" /></Column>
            <Column sm={4} md={8} lg={8}><p className="cds--label">待补充的 OEM 关键参数</p><p>PCD · 中心孔 CB · 螺栓规格 · 前后轴原厂差异 · 原厂刹车配置</p></Column>
          </Grid>
        </Tile>
      </section>

      <section aria-labelledby="target-section-title">
        <div className="tp-fitment-section-heading">
          <div><p className="cds--label">STEP 03</p><h2 id="target-section-title">定义改装目标</h2><p>设定目标尺寸与轮胎组合；系统按前后轴分别计算。</p></div>
        </div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <Select id="fitment-style" labelText="改装取向" value={style} onChange={event => setStyle(event.currentTarget.value)}>
                <SelectItem value="oem-plus" text="OEM Plus · 原厂升级" />
                <SelectItem value="performance" text="Performance · 运动性能" />
                <SelectItem value="flush" text="Flush · 视觉齐平" />
                <SelectItem value="extreme" text="Extreme · 极限改装" />
              </Select>
            </Column>
            <Column sm={4} md={8} lg={8}><TextInput id="fitment-new-tire" labelText="目标轮胎规格" value={newTire} onChange={event => setNewTire(event.currentTarget.value)} placeholder="255/35R20" /></Column>
          </Grid>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <h3>前轴目标尺寸</h3>
              <Grid condensed>
                <Column sm={2} md={4} lg={8}><NumberInput id="front-new-width" label="目标宽度（J）" min={4} max={15} step={0.5} value={frontNewWidth} onChange={(_e, state) => setFrontNewWidth(String(state.value ?? ''))} /></Column>
                <Column sm={2} md={4} lg={8}><NumberInput id="front-new-et" label="目标偏距 ET（mm）" min={-100} max={150} value={frontNewEt} onChange={(_e, state) => setFrontNewEt(String(state.value ?? ''))} /></Column>
              </Grid>
            </Column>
            <Column sm={4} md={8} lg={8}>
              <h3>后轴目标尺寸</h3>
              <Grid condensed>
                <Column sm={2} md={4} lg={8}><NumberInput id="rear-new-width" label="目标宽度（J）" min={4} max={15} step={0.5} value={rearNewWidth} onChange={(_e, state) => setRearNewWidth(String(state.value ?? ''))} /></Column>
                <Column sm={2} md={4} lg={8}><NumberInput id="rear-new-et" label="目标偏距 ET（mm）" min={-100} max={150} value={rearNewEt} onChange={(_e, state) => setRearNewEt(String(state.value ?? ''))} /></Column>
              </Grid>
            </Column>
          </Grid>
        </Tile>
      </section>

      <section aria-labelledby="analysis-section-title">
        <div className="tp-fitment-section-heading">
          <div><p className="cds--label">STEP 04</p><h2 id="analysis-section-title">适配计算与验证</h2><p>计算值只描述几何变化，不代表车辆具有相同数值的实际剩余间隙。</p></div>
          <Tag type="blue">实时计算</Tag>
        </div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <h3>前轴几何变化</h3>
              <p><strong>内侧边缘变化：{fmt(front.inner)} mm</strong></p>
              <p className="cds--label">ΔInner = ((Jnew − Jold) × 25.4 ÷ 2) + (ETnew − ETold)</p>
              <p><strong>外侧边缘变化：{fmt(front.outer)} mm</strong></p>
              <p className="cds--label">ΔOuter = ((Jnew − Jold) × 25.4 ÷ 2) − (ETnew − ETold)</p>
            </Column>
            <Column sm={4} md={8} lg={8}>
              <h3>后轴几何变化</h3>
              <p><strong>内侧边缘变化：{fmt(rear.inner)} mm</strong></p>
              <p className="cds--label">ΔInner = ((Jnew − Jold) × 25.4 ÷ 2) + (ETnew − ETold)</p>
              <p><strong>外侧边缘变化：{fmt(rear.outer)} mm</strong></p>
              <p className="cds--label">ΔOuter = ((Jnew − Jold) × 25.4 ÷ 2) − (ETnew − ETold)</p>
            </Column>
          </Grid>
          <div className="tp-fitment-result-strip">
            <div><span className="cds--label">内侧正值</span><strong>向悬挂侧移动，间隙减少</strong></div>
            <div><span className="cds--label">外侧正值</span><strong>向翼子板侧突出</strong></div>
          </div>
        </Tile>
        <Tile>
          <h3>轮胎外径对比</h3>
          {tireComparison ? (
            <>
              <Grid condensed>
                <Column sm={4} md={4} lg={4}><p className="cds--label">原厂理论外径</p><h4>{fmt(tireComparison.oldValue)} mm</h4></Column>
                <Column sm={4} md={4} lg={4}><p className="cds--label">目标理论外径</p><h4>{fmt(tireComparison.newValue)} mm</h4></Column>
                <Column sm={4} md={4} lg={4}><p className="cds--label">外径变化率</p><h4>{fmt(tireComparison.delta)}%</h4></Column>
              </Grid>
              <p className="cds--label">D = 轮辋直径 × 25.4 + 2 × 胎宽 × 扁平比 ÷ 100</p>
              <p className="cds--label">变化率 = (目标外径 − 原厂外径) ÷ 原厂外径 × 100%</p>
              <Tag type={Math.abs(tireComparison.delta) <= 2 ? 'green' : 'red'}>{Math.abs(tireComparison.delta) <= 2 ? '理论变化在 ±2% 内' : '外径变化需重点复核'}</Tag>
            </>
          ) : <InlineNotification kind="warning" lowContrast title="轮胎规格无法识别" subtitle="请使用 245/40R19 格式输入。" />}
        </Tile>
        <Tile>
          <h3>必须完成的适配验证</h3>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <p><Tag type="cool-gray">待验证</Tag> PCD、中心孔、螺栓规格与座型</p>
              <p><Tag type="cool-gray">待验证</Tag> 卡钳外形、刹车盘与辐条间隙</p>
              <p><Tag type="cool-gray">待验证</Tag> 避震器、转向及悬挂压缩空间</p>
            </Column>
            <Column sm={4} md={8} lg={8}>
              <p><Tag type="cool-gray">待验证</Tag> 轮胎实际断面宽度与负载指数</p>
              <p><Tag type="cool-gray">待验证</Tag> 翼子板及动态行驶间隙</p>
              <p><Tag type="cool-gray">待验证</Tag> 当地法规及实车安装测试</p>
            </Column>
          </Grid>
          <InlineNotification kind="warning" lowContrast title="当前结果不是安全适配认证" subtitle="没有实测间隙、刹车模板或可靠 fitment 数据时，不计算或承诺最大/最小安全尺寸范围。" />
        </Tile>
      </section>

      <section aria-labelledby="product-section-title">
        <div className="tp-fitment-section-heading">
          <div><p className="cds--label">STEP 05 · OPTIONAL</p><h2 id="product-section-title">筛选轮毂产品</h2><p>制造商品牌仅用于缩小产品目录范围，不参与车辆几何适配计算。必须进一步匹配系列、型号及具体尺寸。</p></div>
          <Tag type="cool-gray">可选条件</Tag>
        </div>
        <Tile>
          <Grid condensed>
            <Column sm={4} md={8} lg={8}>
              <ComboBox
                id="wheel-manufacturer"
                titleText="轮毂制造商（可选）"
                placeholder="不限定品牌，或搜索制造商"
                items={manufacturers}
                itemToString={(item: Manufacturer | null) => item?.name ?? ''}
                itemToElement={(item: Manufacturer) => (
                  <div className="tp-fitment-manufacturer-option">
                    <img src={item.logo} alt="" width="32" height="32" onError={event => { event.currentTarget.hidden = true; }} />
                    <span><strong>{item.name}</strong><small>{item.country}</small></span>
                  </div>
                )}
                selectedItem={manufacturer}
                onChange={({ selectedItem }) => setManufacturer(selectedItem ?? null)}
              />
            </Column>
            <Column sm={4} md={8} lg={8}>
              <p className="cds--label">筛选逻辑</p>
              <p>{manufacturer ? '已指定制造商：' + manufacturer.name + '。后续产品目录将按车辆适配条件过滤该品牌的具体型号。' : '未限定制造商。产品目录接入后，将展示所有满足车辆规格的品牌与产品。'}</p>
              <Button kind="ghost" size="sm" disabled={!manufacturer} onClick={() => setManufacturer(null)}>清除品牌筛选</Button>
            </Column>
          </Grid>
          <InlineNotification kind="info" lowContrast title="产品目录尚未接入" subtitle="当前制造商列表仅是筛选原型。尚无可验证的品牌产品型号、尺寸库存或制造商适配认证，不会显示虚构产品。" />
        </Tile>
      </section>

      <div className="tp-fitment-footer">
        <p className="cds--label">DATA SOURCES / INTEGRATION ROADMAP</p>
        <p>后续按车辆识别、OEM 规格、改装 fitment、轮胎、刹车模板分别接入数据源，并保存来源、授权、更新时间及冲突记录。</p>
        <div className="tp-fitment-source-list">
          <Tag type="blue">NHTSA vPIC · VIN 识别</Tag>
          <Tag type="blue">ANKUSI · 轮毂参数候选源</Tag>
          <Tag type="blue">AIWT · 车辆基础规格</Tag>
          <Tag type="blue">VehDB · 轮胎数据</Tag>
          <Tag type="blue">Wheel-Size · 专业适配数据</Tag>
        </div>
        <Button kind="tertiary" onClick={() => {
          setVehicleMake(''); setVehicleModel(''); setYear(''); setTrim(''); setChassis('');
          setMarket('global'); setManufacturer(null);
        }}>清除车辆与产品筛选</Button>
      </div>
    </main>
  );
}
