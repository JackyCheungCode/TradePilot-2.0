import { useMemo } from 'react';
import { ClickableTile } from '../components/Tile';
import worldAtlas from 'world-atlas/countries-110m.json';

export type WorldMapDatum = {
  code: string;
  label: string;
  value: number;
  detail?: string;
};

type TopologyGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  arcs: number[][] | number[][][];
  properties?: Record<string, unknown>;
  id?: string | number;
};
type Topology = {
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
  objects: { countries: { geometries: TopologyGeometry[] } };
};

type CountryShape = { key: string; name: string; path: string };

const WIDTH = 960;
const HEIGHT = 480;
const topology = worldAtlas as unknown as Topology;

function normalize(value: unknown) {
  return String(value || '').normalize('NFKD').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const CODE_ALIASES: Record<string, string> = {
  CD: 'Democratic Republic of the Congo',
  CG: 'Republic of the Congo',
  CI: 'Ivory Coast',
  BO: 'Bolivia',
  VE: 'Venezuela',
  TZ: 'Tanzania',
  SY: 'Syria',
  LA: 'Laos',
  MD: 'Moldova',
  VN: 'Vietnam',
  IR: 'Iran',
  PS: 'Palestine',
  BN: 'Brunei',
  TL: 'Timor-Leste',
  MK: 'North Macedonia',
  MM: 'Myanmar',
  SZ: 'Eswatini',
  TR: 'Turkey',
  CZ: 'Czechia',
};

const NAME_ALIASES: Record<string, string> = {
  unitedstates: 'unitedstatesofamerica',
  russia: 'russianfederation',
  southkorea: 'korea',
  northkorea: 'democraticpeoplesrepublicofkorea',
  vietnam: 'vietnam',
  iran: 'iran',
  bolivia: 'bolivia',
  tanzania: 'unitedrepublicoftanzania',
  moldova: 'republicofmoldova',
  laos: 'laopeoplesdemocraticrepublic',
  syria: 'syrianarabrepublic',
  brunei: 'bruneidarussalam',
  turkey: 'turkiye',
  czechia: 'czechrepublic',
  ivorycoast: 'cotedivoire',
  palestine: 'palestine',
  taiwan: 'taiwan',
  northmacedonia: 'macedonia',
  eswatini: 'swaziland',
};

function decodeArc(index: number, cache: Map<number, Array<[number, number]>>) {
  const arcIndex = index < 0 ? ~index : index;
  let points = cache.get(arcIndex);
  if (!points) {
    const raw = topology.arcs[arcIndex] || [];
    let x = 0;
    let y = 0;
    const scale = topology.transform?.scale || [1, 1];
    const translate = topology.transform?.translate || [0, 0];
    points = raw.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as [number, number];
    });
    cache.set(arcIndex, points);
  }
  return index < 0 ? [...points].reverse() : points;
}

function project([longitude, latitude]: [number, number]): [number, number] {
  return [((longitude + 180) / 360) * WIDTH, ((90 - latitude) / 180) * HEIGHT];
}

function ringPath(indices: number[], cache: Map<number, Array<[number, number]>>) {
  const points = indices.flatMap((index, position) => {
    const arc = decodeArc(index, cache);
    return position === 0 ? arc : arc.slice(1);
  });
  if (!points.length) return '';
  return points.map((point, index) => {
    const [x, y] = project(point);
    return (index === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ') + ' Z';
}

function buildWorldShapes(): CountryShape[] {
  const geometries = topology.objects?.countries?.geometries || [];
  const cache = new Map<number, Array<[number, number]>>();
  return geometries.map((geometry, index) => {
    const name = String(geometry.properties?.name || geometry.properties?.NAME || geometry.id || 'Unknown');
    const polygons = geometry.type === 'Polygon'
      ? [geometry.arcs as number[][]]
      : geometry.arcs as number[][][];
    const path = polygons.map(rings => rings.map(ring => ringPath(ring, cache)).join(' ')).join(' ');
    return { key: String(geometry.id ?? index), name, path };
  }).filter(shape => shape.path.length > 0);
}

const WORLD_SHAPES = buildWorldShapes();

function buildCountryLookup(data: WorldMapDatum[]) {
  const lookup = new Map<string, WorldMapDatum>();
  for (const item of data) {
    const englishName = countryName(item.code);
    const keys = [item.code, item.label, englishName, CODE_ALIASES[item.code.toUpperCase()] || '', NAME_ALIASES[normalize(englishName)] || '', NAME_ALIASES[normalize(item.label)] || ''];
    keys.forEach(key => { if (key) lookup.set(normalize(key), item); });
  }
  return lookup;
}

export function WorldMapChart({
  data,
  selectedCode,
  onCountrySelect,
  unitLabel = '条',
  showRanking = true,
  emptyLabel = '暂无国家 / 地区数据',
}: {
  data: WorldMapDatum[];
  selectedCode?: string;
  onCountrySelect?: (countryCode: string) => void;
  unitLabel?: string;
  showRanking?: boolean;
  emptyLabel?: string;
}) {
  const lookup = useMemo(() => buildCountryLookup(data), [data]);
  const positiveValues = useMemo(() => data.map(item => Math.max(0, Number(item.value) || 0)).filter(value => value > 0).sort((a, b) => a - b), [data]);
  const thresholds = useMemo(() => [0.2, 0.4, 0.6, 0.8].map(position => positiveValues[Math.min(positiveValues.length - 1, Math.floor((positiveValues.length - 1) * position))] || 0), [positiveValues]);
  const ranked = useMemo(() => [...data].filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 8), [data]);
  const max = positiveValues[positiveValues.length - 1] || 0;
  const min = positiveValues[0] || 0;

  return (
    <div className="tp-world-map">
      <div className="tp-world-map__canvas">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`全球分布地图，共 ${data.filter(item => item.value > 0).length} 个有数据的国家或地区`}>
          <g className="tp-world-map__countries">
            {WORLD_SHAPES.map(shape => {
              const key = normalize(shape.name);
              const item = lookup.get(key) || lookup.get(normalize(NAME_ALIASES[key] || ''));
              const value = item ? Math.max(0, Number(item.value) || 0) : 0;
              const level = value <= 0 ? 0 : Math.min(5, 1 + thresholds.filter(threshold => value > threshold).length);
              const selected = Boolean(item && selectedCode?.toUpperCase() === item.code.toUpperCase());
              return (
                <path
                  key={shape.key}
                  d={shape.path}
                  className="tp-world-map__country"
                  data-level={level}
                  data-selected={selected ? 'true' : 'false'}
                  role={onCountrySelect && item ? 'button' : undefined}
                  tabIndex={onCountrySelect && item ? 0 : undefined}
                  aria-label={item ? `${item.label}: ${value.toLocaleString()} ${unitLabel}` : shape.name}
                  onClick={onCountrySelect && item ? () => onCountrySelect(item.code) : undefined}
                  onKeyDown={onCountrySelect && item ? event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onCountrySelect(item.code);
                    }
                  } : undefined}
                >
                  <title>{item ? `${item.label} · ${value.toLocaleString()} ${unitLabel}${item.detail ? ' · ' + item.detail : ''}` : shape.name + ' · 暂无数据'}</title>
                </path>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="tp-world-map__legend" aria-label="地图数据强度图例">
        <span>低</span>
        <i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /><i data-level="5" />
        <span>高</span>
        <span className="tp-world-map__legend-empty"><i /> 无数据</span>
        {max > 0 && <span className="tp-world-map__legend-range">{min.toLocaleString()} – {max.toLocaleString()} {unitLabel}</span>}
      </div>
      {showRanking && (
        <div className="tp-world-map__ranking">
          {ranked.map((item, index) => (
            <ClickableTile
              key={item.code}
              className="tp-world-map__rank"
              data-selected={selectedCode?.toUpperCase() === item.code.toUpperCase() ? 'true' : 'false'}
              onClick={() => onCountrySelect?.(item.code)}
              disabled={!onCountrySelect}
            >
              <span className="tp-world-map__rank-content">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.label}</strong>
                <b>{item.value.toLocaleString()}</b>
              </span>
            </ClickableTile>
          ))}
          {!ranked.length && <p className="tp-world-map__empty">{emptyLabel}</p>}
        </div>
      )}
      {!showRanking && !ranked.length && <p className="tp-world-map__empty">{emptyLabel}</p>}
    </div>
  );
}
