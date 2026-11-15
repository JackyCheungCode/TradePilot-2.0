import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Tag, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/global-shipment-map.scss';

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
type GeoPoint = { lat: number; lon: number };
type MapSize = { width: number; height: number };
type Tile = { key: string; url: string; left: number; top: number };
const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', pending_booking: '待订舱', booked: '已订舱', loaded: '已装运',
  customs_cleared: '已清关', departed: '已离港', in_transit: '运输中',
  arrived: '已到港', import_cleared: '进口清关', delivered: '已签收', cancelled: '已取消',
};
const STATUS_TONE: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'teal' | 'purple'> = {
  draft: 'gray', pending_booking: 'gray', booked: 'gray',
  loaded: 'cyan', departed: 'teal', in_transit: 'blue',
  customs_cleared: 'purple', import_cleared: 'purple',
  arrived: 'green', delivered: 'green',
  exception: 'red', delayed: 'red', failed: 'red', damaged: 'red', lost: 'red', returned: 'red',
  cancelled: 'gray',
};
const ROUTE_TONE: Record<string, string> = {
  arrived: 'arrived', delivered: 'arrived',
  exception: 'exception', delayed: 'exception', failed: 'exception',
  damaged: 'exception', lost: 'exception', returned: 'exception',
  draft: 'pending', pending_booking: 'pending', booked: 'pending', cancelled: 'pending',
  loaded: 'loaded', departed: 'departed', in_transit: 'transit',
  customs_cleared: 'customs', import_cleared: 'customs',
};
const SHENZHEN: GeoPoint = { lat: 22.5431, lon: 114.0579 };
const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 7;
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function worldSize(zoom: number) {
  return TILE_SIZE * 2 ** zoom;
}
function toWorld(point: GeoPoint, zoom: number) {
  const size = worldSize(zoom);
  const lat = clamp(point.lat, -85.05112878, 85.05112878) * Math.PI / 180;
  return {
    x: ((point.lon + 180) / 360) * size,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * size,
  };
}
function fromWorld(x: number, y: number, zoom: number): GeoPoint {
  const size = worldSize(zoom);
  const wrappedX = ((x % size) + size) % size;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * clamp(y, 0, size) / size))) * 180 / Math.PI;
  return { lat, lon: wrappedX / size * 360 - 180 };
}
function destinationOf(shipment: Shipment): (GeoPoint & { city: string; country: string }) | null {
  const address = shipment.ship_to_address || {};
  const header = shipment.header || {};
  const lat = Number(address.latitude ?? address.lat ?? header.destination_latitude);
  const lon = Number(address.longitude ?? address.lng ?? header.destination_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, city: String(address.city || address.locality || ''), country: String(address.country || '') };
}
function originOf(shipment: Shipment): GeoPoint {
  const header = shipment.header || {};
  const lat = Number(header.origin_latitude);
  const lon = Number(header.origin_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : SHENZHEN;
}
function makeTiles(center: GeoPoint, zoom: number, size: MapSize): { tiles: Tile[]; left: number; top: number } {
  const centerWorld = toWorld(center, zoom);
  const left = centerWorld.x - size.width / 2;
  const top = centerWorld.y - size.height / 2;
  const count = 2 ** zoom;
  const minX = Math.floor(left / TILE_SIZE) - 1;
  const maxX = Math.ceil((left + size.width) / TILE_SIZE) + 1;
  const minY = Math.max(0, Math.floor(top / TILE_SIZE) - 1);
  const maxY = Math.min(count - 1, Math.ceil((top + size.height) / TILE_SIZE) + 1);
  const tiles: Tile[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const wrappedX = ((x % count) + count) % count;
      tiles.push({
        key: zoom + ':' + x + ':' + y,
        url: 'https://tile.openstreetmap.org/' + zoom + '/' + wrappedX + '/' + y + '.png',
        left: x * TILE_SIZE - left,
        top: y * TILE_SIZE - top,
      });
    }
  }
  return { tiles, left, top };
}
function routeGeometry(origin: GeoPoint, destination: GeoPoint, index: number, zoom: number, left: number, top: number) {
  const size = worldSize(zoom);
  const start = toWorld(origin, zoom);
  const finish = toWorld(destination, zoom);
  let dx = finish.x - start.x;
  if (dx > size / 2) dx -= size;
  if (dx < -size / 2) dx += size;
  const x1 = start.x - left;
  const y1 = start.y - top;
  const x2 = start.x + dx - left;
  const y2 = finish.y - top;
  const distance = Math.hypot(dx, finish.y - start.y);
  const controlX = (x1 + x2) / 2;
  const controlY = (y1 + y2) / 2 - Math.min(100, distance * 0.16) - (index % 3) * 5;
  return { path: 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' Q' + controlX.toFixed(1) + ',' + controlY.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1), x1, y1, x2, y2 };
}
export function GlobalShipmentMap() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [center, setCenter] = useState<GeoPoint>({ lat: 24, lon: 35 });
  const [mapSize, setMapSize] = useState<MapSize>({ width: 960, height: 480 });
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; worldX: number; worldY: number } | null>(null);

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

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setMapSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visible = useMemo(() => shipments.filter(item => statusFilter === 'all' || item.status === statusFilter), [shipments, statusFilter]);
  const activeShipment = shipments.find(item => item.id === selected) || null;
  const summary = useMemo(() => ({
    total: shipments.length,
    moving: shipments.filter(item => ['departed', 'in_transit', 'customs_cleared', 'import_cleared'].includes(item.status)).length,
    arrived: shipments.filter(item => ['arrived', 'delivered'].includes(item.status)).length,
    packages: shipments.reduce((sum, item) => sum + Number(item.total_packages || 0), 0),
  }), [shipments]);
  const map = useMemo(() => makeTiles(center, zoom, mapSize), [center, zoom, mapSize]);
  const originMarker = toWorld(SHENZHEN, zoom);
  const originX = originMarker.x - map.left;
  const originY = originMarker.y - map.top;

  const changeZoom = (nextZoom: number) => {
    const next = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (next === zoom) return;
    setZoom(next);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, select')) return;
    const world = toWorld(center, zoom);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, worldX: world.x, worldY: world.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCenter(fromWorld(drag.worldX - (event.clientX - drag.x), drag.worldY - (event.clientY - drag.y), zoom));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 1 : -1));
  };

  return <section className="tp-shipment-map" aria-labelledby="tp-shipment-map-title">
    <div className="tp-shipment-map__heading">
      <div>
        <p className="tp-shipment-map__eyebrow">GLOBAL LOGISTICS / OPENSTREETMAP</p>
        <h2 id="tp-shipment-map-title">全球发运态势</h2>
        <p>基于 OpenStreetMap 真实地理底图 · 深圳发往全球的订单路线</p>
      </div>
      <div className="tp-shipment-map__actions">
        <Tag type="blue" size="sm">演示数据</Tag>
        <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Renew} onClick={() => setRefresh(value => value + 1)} disabled={loading}>刷新数据</Button>
      </div>
    </div>
    <div className="tp-shipment-map__metrics">
      <div><span>演示发运</span><strong>{summary.total}</strong></div>
      <div><span>运输途中</span><strong>{summary.moving}</strong></div>
      <div><span>已到达 / 签收</span><strong>{summary.arrived}</strong></div>
      <div><span>包裹总数</span><strong>{summary.packages.toLocaleString()}</strong></div>
    </div>
    <div className="tp-shipment-map__toolbar">
      <div className="tp-shipment-map__legend"><span><i className="is-origin"/>深圳发货地</span><span><i className="is-arrived"/>到达 / 签收</span><span><i className="is-exception"/>异常</span><span><i className="is-route"/>运输中及其他状态</span><span><i className="is-particle"/>动态轨迹</span></div>
      <Select id="shipment-map-status" labelText="运输状态" size="sm" value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}>
        <SelectItem value="all" text="全部状态"/>
        {Object.entries(STATUS_LABEL).filter(([key]) => key !== 'draft' && key !== 'cancelled').map(([key, label]) => <SelectItem key={key} value={key} text={label}/>)}
      </Select>
    </div>
    {error && <InlineNotification kind="error" lowContrast title="全球发运数据读取失败" subtitle={error}/>}
    <div
      className="tp-shipment-map__canvas"
      ref={mapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      role="application"
      aria-label="可拖动和缩放的 OpenStreetMap 全球发运地图"
    >
      {loading ? <div className="tp-shipment-map__loading"><InlineLoading description="正在加载全球发运路线…"/></div> : <>
        <svg className="tp-shipment-map__tiles" width={mapSize.width} height={mapSize.height} viewBox={'0 0 ' + mapSize.width + ' ' + mapSize.height} aria-hidden="true">
          {map.tiles.map(tile => <image key={tile.key} href={tile.url} x={tile.left} y={tile.top} width={TILE_SIZE} height={TILE_SIZE}/>)}
        </svg>
        <svg className="tp-shipment-map__overlay" width={mapSize.width} height={mapSize.height} viewBox={'0 0 ' + mapSize.width + ' ' + mapSize.height} aria-label="发运路线与目的地">
          {visible.map((shipment, index) => {
            const destination = destinationOf(shipment);
            if (!destination) return null;
            const geometry = routeGeometry(originOf(shipment), destination, index, zoom, map.left, map.top);
            const isSelected = selected === shipment.id;
            const routeTone = ROUTE_TONE[shipment.status] || 'transit';
            return <g key={shipment.id} className={'tp-shipment-map__shipment is-' + routeTone + (isSelected ? ' is-selected' : '')} onClick={() => setSelected(shipment.id)} role="button" tabIndex={0} aria-label={'查看发运单 ' + shipment.shipment_no} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelected(shipment.id); }}>
              <path d={geometry.path} className="tp-shipment-map__route-glow"/>
              <path d={geometry.path} className="tp-shipment-map__route"/>
              <path d={geometry.path} className="tp-shipment-map__route-flow"/>
              <circle r="3.2" className="tp-shipment-map__particle"><animateMotion dur={(5 + index % 5) + 's'} repeatCount="indefinite" path={geometry.path}/></circle>
              <circle cx={geometry.x2} cy={geometry.y2} r={isSelected ? 8 : 5.5} className="tp-shipment-map__destination"/>
              <circle cx={geometry.x2} cy={geometry.y2} r="12" className="tp-shipment-map__destination-halo"/>
            </g>;
          })}
          <circle cx={originX} cy={originY} r="18" className="tp-shipment-map__origin-halo"/>
          <circle cx={originX} cy={originY} r="6" className="tp-shipment-map__origin"/>
          <text x={originX + 12} y={originY - 12} className="tp-shipment-map__origin-label">SHENZHEN</text>
        </svg>
        <div className="tp-shipment-map__controls">
          <Button kind="tertiary" size="sm" hasIconOnly renderIcon={CarbonIcons.Add} iconDescription="放大地图" onClick={() => changeZoom(zoom + 1)} disabled={zoom >= MAX_ZOOM}/>
          <Button kind="tertiary" size="sm" hasIconOnly renderIcon={CarbonIcons.Subtract} iconDescription="缩小地图" onClick={() => changeZoom(zoom - 1)} disabled={zoom <= MIN_ZOOM}/>
          <Button kind="tertiary" size="sm" onClick={() => { setCenter({ lat: 24, lon: 35 }); setZoom(2); }}>重置视图</Button>
        </div>
        <div className="tp-shipment-map__attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
        <div className="tp-shipment-map__map-caption"><span>OPENSTREETMAP · ZOOM {zoom}</span><span>{visible.length} 条路线</span></div>
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
      </div> : <p className="tp-shipment-map__hint">拖动地图浏览全球，使用滚轮或右上角控件缩放；点击路线或目的地查看发运信息。</p>}
    </div>
    <div className="tp-shipment-map__footnote">地图底图 © OpenStreetMap contributors；路线连接发货地与收货地，动态光点仅用于展示路线方向，不代表实时 GPS 物流定位。</div>
  </section>;
}
