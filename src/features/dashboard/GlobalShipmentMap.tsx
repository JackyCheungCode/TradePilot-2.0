import { useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, Tile, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import './global-shipment-map.scss';

type Shipment = {
  id: string;
  shipment_no: string;
  status: string;
  planned_ship_date: string;
  actual_ship_date: string | null;
  total_packages: number;
  shipment_value: number;
  currency_code: string;
  ship_to_address: Record<string, unknown>;
  header: Record<string, unknown>;
  remarks_external: string | null;
};
type RoutePoint = { x: number; y: number };
const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', pending_booking: '待订舱', booked: '已订舱', loaded: '已装运',
  customs_cleared: '已清关', departed: '已离港', in_transit: '运输中',
  arrived: '已到港', import_cleared: '进口清关', delivered: '已签收', cancelled: '已取消',
};
const STATUS_TONE: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'teal'> = {
  in_transit: 'blue', departed: 'teal', arrived: 'green', delivered: 'green',
  customs_cleared: 'teal', import_cleared: 'teal', booked: 'gray', cancelled: 'red',
};
const SHENZHEN: RoutePoint = { x: 22.5431, y: 114.0579 };
const CONTINENTS: Array<Array<[number, number]>> = [
  [[-168,70],[-145,60],[-130,52],[-124,40],[-116,30],[-105,22],[-97,17],[-84,9],[-78,8],[-82,24],[-90,30],[-80,40],[-60,50],[-55,58],[-78,70],[-110,74],[-140,72]],
  [[-81,12],[-70,8],[-60,-4],[-52,-12],[-48,-25],[-55,-42],[-68,-55],[-76,-35],[-80,-10]],
  [[-10,72],[20,72],[42,60],[60,55],[80,55],[105,48],[130,50],[150,60],[170,58],[178,48],[160,38],[145,30],[130,20],[115,5],[100,0],[82,8],[70,20],[55,25],[42,35],[30,40],[20,48],[5,55],[-10,55]],
  [[-18,35],[5,38],[30,32],[42,12],[48,-12],[35,-34],[18,-35],[5,-25],[-5,-5],[-15,12]],
  [[112,-11],[130,-10],[145,-18],[154,-28],[146,-40],[128,-43],[114,-32]],
  [[-52,82],[-25,78],[-18,65],[-42,58],[-58,68]],
];
function project(lat: number, lon: number): RoutePoint {
  const wrapped = ((lon - 120 + 360) % 360 + 360) % 360;
  return { x: wrapped / 360 * 1000, y: (90 - lat) / 180 * 500 };
}
function pathFrom(points: Array<[number, number]>) {
  return points.map(([lon, lat], index) => {
    const p = project(lat, lon);
    return (index ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
  }).join(' ') + ' Z';
}
function routePath(destination: RoutePoint, index: number) {
  const origin = project(SHENZHEN.x, SHENZHEN.y);
  const end = project(destination.x, destination.y);
  let dx = end.x - origin.x;
  if (dx > 500) dx -= 1000;
  if (dx < -500) dx += 1000;
  const adjustedEnd = { x: origin.x + dx, y: end.y };
  const midX = origin.x + dx / 2;
  const distance = Math.hypot(dx, end.y - origin.y);
  const controlY = Math.max(18, Math.min(origin.y, end.y) - Math.min(170, distance * 0.22) - (index % 4) * 7);
  return { d: 'M' + origin.x.toFixed(1) + ',' + origin.y.toFixed(1) + ' Q' + midX.toFixed(1) + ',' + controlY.toFixed(1) + ' ' + adjustedEnd.x.toFixed(1) + ',' + adjustedEnd.y.toFixed(1), origin, end: adjustedEnd };
}
function destinationOf(shipment: Shipment) {
  const address = shipment.ship_to_address || {};
  const header = shipment.header || {};
  const lat = Number(address.latitude ?? address.lat ?? header.destination_latitude);
  const lon = Number(address.longitude ?? address.lng ?? header.destination_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, city: String(address.city || address.locality || ''), country: String(address.country || ''), recipient: String(address.recipient_name || address.name || '') };
}
function originOf(shipment: Shipment) {
  const header = shipment.header || {};
  const lat = Number(header.origin_latitude ?? SHENZHEN.x);
  const lon = Number(header.origin_longitude ?? SHENZHEN.y);
  return { lat, lon };
}
export function GlobalShipmentMap() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const db = await getSupabaseClient();
        const { data, error: queryError } = await db.from('trade_shipments')
          .select('id,shipment_no,status,planned_ship_date,actual_ship_date,total_packages,shipment_value,currency_code,ship_to_address,header,remarks_external')
          .filter('header->>demo_group', 'eq', 'global-shipment-map')
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        if (active) setShipments((data || []) as Shipment[]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '发运数据读取失败');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [refresh]);

  const visible = useMemo(() => shipments.filter(item => statusFilter === 'all' || item.status === statusFilter), [shipments, statusFilter]);
  const activeShipment = shipments.find(item => item.id === selected) || null;
  const summary = useMemo(() => ({
    total: shipments.length,
    moving: shipments.filter(item => ['departed', 'in_transit', 'customs_cleared', 'import_cleared'].includes(item.status)).length,
    arrived: shipments.filter(item => ['arrived', 'delivered'].includes(item.status)).length,
    packages: shipments.reduce((sum, item) => sum + Number(item.total_packages || 0), 0),
  }), [shipments]);

  return <section className="tp-shipment-map" aria-labelledby="tp-shipment-map-title">
    <div className="tp-shipment-map__heading">
      <div>
        <p className="tp-shipment-map__eyebrow">GLOBAL LOGISTICS / LIVE OVERVIEW</p>
        <h2 id="tp-shipment-map-title">全球发运态势</h2>
        <p>从深圳发往全球的订单路线 · 演示数据与真实业务分开展示</p>
      </div>
      <div className="tp-shipment-map__actions">
        <Tag type="blue" size="sm">演示数据</Tag>
        <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Renew} onClick={() => setRefresh(value => value + 1)} disabled={loading}>刷新地图</Button>
      </div>
    </div>
    <div className="tp-shipment-map__metrics">
      <div><span>演示发运</span><strong>{summary.total}</strong></div>
      <div><span>运输途中</span><strong>{summary.moving}</strong></div>
      <div><span>已到达 / 签收</span><strong>{summary.arrived}</strong></div>
      <div><span>包裹总数</span><strong>{summary.packages.toLocaleString()}</strong></div>
    </div>
    <div className="tp-shipment-map__toolbar">
      <div className="tp-shipment-map__legend"><span><i className="is-origin"/>深圳发货地</span><span><i className="is-route"/>订单路线</span><span><i className="is-particle"/>流动数据</span></div>
      <Select id="shipment-map-status" labelText="运输状态" labelText="运输状态" size="sm" value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}>
        <SelectItem value="all" text="全部状态"/>
        {Object.entries(STATUS_LABEL).filter(([key]) => key !== 'draft' && key !== 'cancelled').map(([key, label]) => <SelectItem key={key} value={key} text={label}/>)}
      </Select>
    </div>
    {error && <InlineNotification kind="error" lowContrast title="全球发运数据读取失败" subtitle={error}/>}
    <div className="tp-shipment-map__canvas">
      {loading ? <div className="tp-shipment-map__loading"><InlineLoading description="正在加载全球发运路线…"/></div> : <>
        <svg className="tp-shipment-map__svg" viewBox="0 0 1000 500" role="img" aria-label="从深圳连接全球目的地的发运路线地图">
          <defs>
            <pattern id="tp-map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth="1"/></pattern>
            <radialGradient id="tp-map-glow"><stop offset="0" stopColor="#78A9FF" stopOpacity=".3"/><stop offset="1" stopColor="#78A9FF" stopOpacity="0"/></radialGradient>
          </defs>
          <rect width="1000" height="500" fill="url(#tp-map-grid)"/>
          {CONTINENTS.map((continent, index) => <path key={index} d={pathFrom(continent)} className="tp-shipment-map__land"/>)}
          {visible.map((shipment, index) => {
            const destination = destinationOf(shipment);
            if (!destination) return null;
            const route = routePath({ x: destination.lat, y: destination.lon }, index);
            const isSelected = selected === shipment.id;
            return <g key={shipment.id} className={isSelected ? 'is-selected' : ''} onClick={() => setSelected(shipment.id)} role="button" tabIndex={0} aria-label={'查看发运单 ' + shipment.shipment_no} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelected(shipment.id); }}>
              <path d={route.d} className="tp-shipment-map__route-glow"/>
              <path d={route.d} className="tp-shipment-map__route"/>
              <path d={route.d} className="tp-shipment-map__route-flow"/>
              <circle r="3.2" className="tp-shipment-map__particle"><animateMotion dur={(5 + index % 5) + 's'} repeatCount="indefinite" path={route.d}/></circle>
              <circle cx={route.end.x} cy={route.end.y} r={isSelected ? 8 : 5.5} className="tp-shipment-map__destination"/>
              <circle cx={route.end.x} cy={route.end.y} r="12" className="tp-shipment-map__destination-halo"/>
            </g>;
          })}
          <circle cx={project(SHENZHEN.x, SHENZHEN.y).x} cy={project(SHENZHEN.x, SHENZHEN.y).y} r="26" fill="url(#tp-map-glow)"/>
          <circle cx={project(SHENZHEN.x, SHENZHEN.y).x} cy={project(SHENZHEN.x, SHENZHEN.y).y} r="6" className="tp-shipment-map__origin"/>
          <text x={project(SHENZHEN.x, SHENZHEN.y).x + 13} y={project(SHENZHEN.x, SHENZHEN.y).y - 12} className="tp-shipment-map__origin-label">SHENZHEN</text>
        </svg>
        <div className="tp-shipment-map__map-caption"><span>SHENZHEN · CHINA</span><span>{visible.length} 条路线</span></div>
      </>}
    </div>
    <div className="tp-shipment-map__details">
      {activeShipment ? <div className="tp-shipment-map__selected">
        <div><span className="tp-shipment-map__detail-label">当前选中发运</span><strong>{activeShipment.shipment_no}</strong></div>
        <Tag type={STATUS_TONE[activeShipment.status] || 'gray'}>{STATUS_LABEL[activeShipment.status] || activeShipment.status}</Tag>
        <div><span>收货方</span><strong>{String(activeShipment.ship_to_address.recipient_name || '—')}</strong></div>
        <div><span>目的地</span><strong>{[activeShipment.ship_to_address.city, activeShipment.ship_to_address.country].filter(Boolean).join(', ') || '—'}</strong></div>
        <div><span>承运商 / 运单</span><strong>{String(activeShipment.header.carrier || '—')} · {String(activeShipment.header.tracking_number || '—')}</strong></div>
        <div><span>计划发运</span><strong>{activeShipment.planned_ship_date || '—'}</strong></div>
      </div> : <p className="tp-shipment-map__hint">选择地图上的任意路线或目的地标记，查看对应订单的发运信息。</p>}
    </div>
    <div className="tp-shipment-map__footnote">演示路线仅表示发货地与收货地之间的连接关系；光点为视觉数据流动效果，不代表实时物流定位。</div>
  </section>;
}
