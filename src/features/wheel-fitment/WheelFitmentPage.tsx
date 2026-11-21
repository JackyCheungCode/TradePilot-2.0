import { useMemo, useState } from 'react';
import {
  Button, ComboBox, Column, Grid, InlineNotification, NumberInput, Select, SelectItem,
  Tag, TextInput, Tile, semanticIcons,
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
  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null);
  const [vehicle, setVehicle] = useState('BMW 530i');
  const [year, setYear] = useState('2022');
  const [market, setMarket] = useState('global');
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
      const match = value.match(/^(\d{3})\/(\d{2})R(\d{2})$/i);
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

  const selectedManufacturer = manufacturer ? manufacturers.find(item => item.id === manufacturer.id) ?? null : null;

  return (
    <main>
      <div className="tp-page-heading">
        <div>
          <p className="cds--label">HARMONIA / WHEEL ENGINEERING</p>
          <h1>轮毂适配与改装计算中心</h1>
          <p>车型识别、制造商选择、轮毂尺寸计算与适配验证</p>
        </div>
        <Tag type="blue">工程计算工作台</Tag>
      </div>

      <InlineNotification
        kind="info"
        lowContrast
        title="数据状态说明"
        subtitle="当前页面先提供可交互的几何计算与制造商选择。车辆原厂数据、刹车空间和实车间隙尚未连接并核验前，不会将计算结果标记为已验证适配。"
      />

      <Grid condensed>
        <Column sm={4} md={8} lg={8}>
          <Tile>
            <h3>01 / 车辆与制造商</h3>
            <p>选择车辆版本和希望匹配的轮毂制造商。</p>
            <Grid condensed>
              <Column sm={4} md={4} lg={8}>
                <TextInput id="fitment-vehicle" labelText="车辆 / 车型" value={vehicle} onChange={event => setVehicle(event.currentTarget.value)} placeholder="例如 BMW 530i"/>
              </Column>
              <Column sm={4} md={2} lg={4}>
                <TextInput id="fitment-year" labelText="年款" value={year} onChange={event => setYear(event.currentTarget.value)} placeholder="2022"/>
              </Column>
              <Column sm={4} md={2} lg={4}>
                <Select id="fitment-market" labelText="销售市场" value={market} onChange={event => setMarket(event.currentTarget.value)}>
                  <SelectItem value="global" text="全球 / 未指定"/>
                  <SelectItem value="us" text="北美"/>
                  <SelectItem value="eu" text="欧洲"/>
                  <SelectItem value="jp" text="日本"/>
                  <SelectItem value="cn" text="中国"/>
                </Select>
              </Column>
              <Column sm={4} md={4} lg={8}>
                <ComboBox
                  id="wheel-manufacturer"
                  titleText="轮毂制造商"
                  placeholder="搜索或选择制造商"
                  items={manufacturers}
                  itemToString={(item: Manufacturer | null) => item?.name ?? ''}
                  itemToElement={(item: Manufacturer) => (
                    <div className="tp-fitment-manufacturer-option">
                      <img src={item.logo} alt="" width="36" height="36" onError={event => { event.currentTarget.hidden = true; }}/>
                      <span><strong>{item.name}</strong><small>{item.country} · {item.domain}</small></span>
                    </div>
                  )}
                  selectedItem={manufacturer}
                  onChange={({ selectedItem }: { selectedItem: Manufacturer | null }) => setManufacturer(selectedItem)}
                />
              </Column>
              {selectedManufacturer && (
                <Column sm={4} md={8} lg={16}>
                  <div className="tp-fitment-selected-manufacturer">
                    <img src={selectedManufacturer.logo} alt="" width="44" height="44" onError={event => { event.currentTarget.hidden = true; }}/>
                    <div><strong>{selectedManufacturer.name}</strong><p>{selectedManufacturer.country} · 官方网站：{selectedManufacturer.domain}</p></div>
                    <Tag type="green">已选择</Tag>
                  </div>
                </Column>
              )}
            </Grid>
          </Tile>
        </Column>
        <Column sm={4} md={8} lg={8}>
          <Tile>
            <h3>02 / 改装目标</h3>
            <p>选择改装风格，设定目标直径与轮胎组合。</p>
            <Select id="fitment-style" labelText="改装方案" value={style} onChange={event => setStyle(event.currentTarget.value)}>
              <SelectItem value="oem-plus" text="OEM Plus · 原厂升级"/>
              <SelectItem value="performance" text="Performance · 运动性能"/>
              <SelectItem value="flush" text="Flush · 视觉齐平"/>
              <SelectItem value="extreme" text="Extreme · 极限改装"/>
            </Select>
            <Grid condensed>
              <Column sm={4} md={8} lg={16}>
                <TextInput id="fitment-oem-tire" labelText="原厂轮胎规格（例：245/40R19）" value={oldTire} onChange={event => setOldTire(event.currentTarget.value)}/>
              </Column>
              <Column sm={4} md={8} lg={16}>
                <TextInput id="fitment-new-tire" labelText="目标轮胎规格（例：255/35R20）" value={newTire} onChange={event => setNewTire(event.currentTarget.value)}/>
              </Column>
            </Grid>
            <p className="cds--label">车辆：{vehicle || '未填写'} · {year || '年款未填写'} · {market.toUpperCase()} · {style.toUpperCase()}</p>
          </Tile>
        </Column>
      </Grid>

      <Tile>
        <h3>03 / 原厂与改装轮毂参数</h3>
        <p>录入原厂基准和目标尺寸，系统即时计算内外侧边缘变化。</p>
        <Grid condensed>
          <Column sm={4} md={8} lg={8}>
            <h4>前轴 / Front axle</h4>
            <Grid condensed>
              <Column sm={2} md={4} lg={8}><NumberInput id="front-oem-width" label="原厂宽度（J）" min={4} max={15} step={0.5} value={frontOldWidth} onChange={(_e, state) => setFrontOldWidth(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="front-oem-et" label="原厂 ET（mm）" min={-100} max={150} value={frontOldEt} onChange={(_e, state) => setFrontOldEt(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="front-new-width" label="目标宽度（J）" min={4} max={15} step={0.5} value={frontNewWidth} onChange={(_e, state) => setFrontNewWidth(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="front-new-et" label="目标 ET（mm）" min={-100} max={150} value={frontNewEt} onChange={(_e, state) => setFrontNewEt(String(state.value ?? ''))}/></Column>
            </Grid>
            <p><strong>内侧空间变化：{fmt(front.inner)} mm</strong></p>
            <p className="cds--label">公式：(目标 J − 原厂 J) × 25.4 ÷ 2 + (目标 ET − 原厂 ET)</p>
            <p><strong>外侧突出变化：{fmt(front.outer)} mm</strong></p>
            <p className="cds--label">公式：(目标 J − 原厂 J) × 25.4 ÷ 2 − (目标 ET − 原厂 ET)</p>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <h4>后轴 / Rear axle</h4>
            <Grid condensed>
              <Column sm={2} md={4} lg={8}><NumberInput id="rear-oem-width" label="原厂宽度（J）" min={4} max={15} step={0.5} value={rearOldWidth} onChange={(_e, state) => setRearOldWidth(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="rear-oem-et" label="原厂 ET（mm）" min={-100} max={150} value={rearOldEt} onChange={(_e, state) => setRearOldEt(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="rear-new-width" label="目标宽度（J）" min={4} max={15} step={0.5} value={rearNewWidth} onChange={(_e, state) => setRearNewWidth(String(state.value ?? ''))}/></Column>
              <Column sm={2} md={4} lg={8}><NumberInput id="rear-new-et" label="目标 ET（mm）" min={-100} max={150} value={rearNewEt} onChange={(_e, state) => setRearNewEt(String(state.value ?? ''))}/></Column>
            </Grid>
            <p><strong>内侧空间变化：{fmt(rear.inner)} mm</strong></p>
            <p className="cds--label">公式：(目标 J − 原厂 J) × 25.4 ÷ 2 + (目标 ET − 原厂 ET)</p>
            <p><strong>外侧突出变化：{fmt(rear.outer)} mm</strong></p>
            <p className="cds--label">公式：(目标 J − 原厂 J) × 25.4 ÷ 2 − (目标 ET − 原厂 ET)</p>
          </Column>
        </Grid>
      </Tile>

      <Grid condensed>
        <Column sm={4} md={8} lg={8}>
          <Tile>
            <h3>04 / 轮胎外径计算</h3>
            {tireComparison ? (
              <>
                <p>原厂理论外径：<strong>{fmt(tireComparison.oldValue)} mm</strong></p>
                <p>目标理论外径：<strong>{fmt(tireComparison.newValue)} mm</strong></p>
                <p>外径变化率：<strong>{fmt(tireComparison.delta)}%</strong></p>
                <p className="cds--label">公式：D = 轮辋直径 × 25.4 + 2 × 胎宽 × 扁平比 ÷ 100</p>
                <p className="cds--label">变化率 = (目标外径 − 原厂外径) ÷ 原厂外径 × 100%</p>
                <Tag type={Math.abs(tireComparison.delta) <= 2 ? 'green' : 'red'}>{Math.abs(tireComparison.delta) <= 2 ? '理论变化在 ±2% 内' : '外径变化需重点复核'}</Tag>
              </>
            ) : <InlineNotification kind="warning" lowContrast title="轮胎格式无法识别" subtitle="请按 245/40R19 格式输入轮胎规格。"/>}
          </Tile>
        </Column>
        <Column sm={4} md={8} lg={8}>
          <Tile>
            <h3>05 / 适配验证清单</h3>
            <p><Tag type="cool-gray">待验证</Tag> PCD、中心孔、螺栓规格与座型</p>
            <p><Tag type="cool-gray">待验证</Tag> 卡钳外形、刹车盘与辐条间隙</p>
            <p><Tag type="cool-gray">待验证</Tag> 避震器、转向及悬挂压缩空间</p>
            <p><Tag type="cool-gray">待验证</Tag> 轮胎实际宽度、负载指数与法规</p>
            <p><Tag type="cool-gray">待验证</Tag> 实车安装及动态测试</p>
            <InlineNotification kind="warning" lowContrast title="不可作为安全适配结论" subtitle="几何边缘变化不等于车辆间隙。未取得实测数据前，不生成最大/最小安全 ET 承诺。"/>
          </Tile>
        </Column>
      </Grid>

      <Tile>
        <h3>06 / 数据来源与后续连接</h3>
        <p>当前页面不会伪造 OEM 规格或 API 验证状态。后续数据连接将按车辆识别、OEM 规格、改装数据库、轮胎规格及刹车空间分别接入，并保留来源、更新时间和许可信息。</p>
        <div className="tp-fitment-source-list">
          <Tag type="blue">NHTSA vPIC · VIN 识别</Tag>
          <Tag type="blue">ANKUSI · 轮毂参数候选源</Tag>
          <Tag type="blue">AIWT · 车辆与基础规格</Tag>
          <Tag type="blue">VehDB · 轮胎数据</Tag>
          <Tag type="blue">Wheel-Size · 专业适配数据</Tag>
        </div>
        <Button kind="tertiary" onClick={() => { setManufacturer(null); setVehicle(''); setYear(''); }}>重置车辆与制造商选择</Button>
      </Tile>
    </main>
  );
}
