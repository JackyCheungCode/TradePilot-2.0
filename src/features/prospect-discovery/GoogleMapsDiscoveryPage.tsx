import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionItem, Button, Checkbox, Dropdown, FilterableMultiSelect, InlineNotification, Link,
  Select, SelectItem, Tag, TextInput, TpDataTable, semanticIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Country = { cca2: string; name: { common: string }; region?: string };
type Region = { id: string; name: string; geometry: unknown };
type City = { id: number | null; name: string; admin1: string; admin2: string; latitude: number | null; longitude: number | null };
type ProspectRow = {
  id: string; name?: string; country_code?: string; address?: string; phone?: string; email?: string;
  website?: string; latitude?: number | null; longitude?: number | null; status?: string;
  confidence_score?: number | null; lead_id?: string | null; raw_data?: Record<string, unknown> | null;
  created_at?: string;
  discovery_record_occurrences?: Array<{ provider?: string; captured_at?: string; raw_data?: Record<string, unknown> | null }>;
  [key: string]: unknown;
};
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

const languageByCountry: Record<string, { deepl: string; google: string }> = {
  JP: { deepl: 'JA', google: 'ja' }, KR: { deepl: 'KO', google: 'ko' },
  US: { deepl: 'EN-US', google: 'en' }, GB: { deepl: 'EN-GB', google: 'en' }, CA: { deepl: 'EN-US', google: 'en' }, AU: { deepl: 'EN-GB', google: 'en' }, NZ: { deepl: 'EN-GB', google: 'en' },
  CN: { deepl: 'ZH-HANS', google: 'zh-CN' }, TW: { deepl: 'ZH-HANT', google: 'zh-TW' },
  HK: { deepl: 'ZH-HANT', google: 'zh-TW' }, MO: { deepl: 'ZH-HANT', google: 'zh-TW' },
  DE: { deepl: 'DE', google: 'de' }, AT: { deepl: 'DE', google: 'de' }, CH: { deepl: 'DE', google: 'de' },
  FR: { deepl: 'FR', google: 'fr' }, ES: { deepl: 'ES', google: 'es' }, MX: { deepl: 'ES', google: 'es' },
  IT: { deepl: 'IT', google: 'it' }, PT: { deepl: 'PT-PT', google: 'pt' }, BR: { deepl: 'PT-BR', google: 'pt-BR' },
  NL: { deepl: 'NL', google: 'nl' }, BE: { deepl: 'NL', google: 'nl' }, PL: { deepl: 'PL', google: 'pl' },
  RU: { deepl: 'RU', google: 'ru' }, UA: { deepl: 'UK', google: 'uk' }, TR: { deepl: 'TR', google: 'tr' },
  TH: { deepl: 'TH', google: 'th' }, VN: { deepl: 'VI', google: 'vi' }, ID: { deepl: 'ID', google: 'id' },
  SE: { deepl: 'SV', google: 'sv' }, NO: { deepl: 'NB', google: 'no' }, DK: { deepl: 'DA', google: 'da' },
  FI: { deepl: 'FI', google: 'fi' }, CZ: { deepl: 'CS', google: 'cs' }, GR: { deepl: 'EL', google: 'el' },
  HU: { deepl: 'HU', google: 'hu' }, RO: { deepl: 'RO', google: 'ro' }, BG: { deepl: 'BG', google: 'bg' },
  IL: { deepl: 'HE', google: 'he' }, SA: { deepl: 'AR', google: 'ar' }, AE: { deepl: 'AR', google: 'ar' },
};
const standardFields = [
  'places.id', 'places.name', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress',
  'places.addressComponents', 'places.addressDescriptor', 'places.adrFormatAddress', 'places.postalAddress',
  'places.location', 'places.viewport', 'places.types', 'places.primaryType',
  'places.primaryTypeDisplayName', 'places.googleMapsUri', 'places.googleMapsLinks', 'places.googleMapsTypeLabel',
  'places.searchUri', 'places.iconBackgroundColor', 'places.iconMaskBaseUri', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.rating', 'places.userRatingCount',
  'places.businessStatus', 'places.openingDate', 'places.pureServiceAreaBusiness', 'places.photos',
  'places.containingPlaces', 'places.subDestinations', 'places.regularOpeningHours',
  'places.currentOpeningHours', 'places.regularSecondaryOpeningHours', 'places.currentSecondaryOpeningHours', 'places.transitStation', 'places.priceLevel',
  'places.priceRange', 'places.plusCode', 'places.timeZone', 'places.utcOffsetMinutes',
  'places.attributions', 'places.consumerAlert', 'places.movedPlace', 'places.movedPlaceId',
];
const advancedFields = [
  'places.reviews', 'places.reviewSummary', 'places.editorialSummary', 'places.accessibilityOptions',
  'places.parkingOptions', 'places.paymentOptions', 'places.dineIn', 'places.takeout', 'places.delivery',
  'places.reservable', 'places.servesBreakfast', 'places.servesBrunch', 'places.servesLunch',
  'places.servesDinner', 'places.servesVegetarianFood', 'places.servesBeer', 'places.servesCocktails',
  'places.servesCoffee', 'places.servesDessert', 'places.servesWine', 'places.outdoorSeating', 'places.liveMusic',
  'places.goodForChildren', 'places.goodForGroups', 'places.goodForWatchingSports', 'places.menuForChildren',
  'places.neighborhoodSummary', 'places.generativeSummary', 'places.evChargeAmenitySummary',
  'places.evChargeOptions', 'places.fuelOptions', 'places.restroom', 'places.allowsDogs', 'places.curbsidePickup',
];
const fieldLabels: Record<string, string> = {
  'places.id': 'Place ID', 'places.name': '资源名称', 'places.displayName': '商家名称',
  'places.formattedAddress': '完整地址', 'places.shortFormattedAddress': '简要地址',
  'places.addressComponents': '地址组成', 'places.addressDescriptor': '地址描述', 'places.adrFormatAddress': 'ADR 地址', 'places.postalAddress': '邮政地址', 'places.location': '经纬度', 'places.viewport': '地图视口',
  'places.types': 'Google 类型', 'places.primaryType': '主要类型', 'places.primaryTypeDisplayName': '主要类型名称',
  'places.googleMapsUri': 'Google Maps 链接', 'places.googleMapsLinks': '地图深层链接', 'places.googleMapsTypeLabel': '地图类型标签', 'places.searchUri': '搜索链接', 'places.iconBackgroundColor': '图标背景色', 'places.iconMaskBaseUri': '图标资源',
  'places.websiteUri': '官网', 'places.nationalPhoneNumber': '本地电话', 'places.internationalPhoneNumber': '国际电话',
  'places.rating': '评分', 'places.userRatingCount': '评价数量', 'places.businessStatus': '营业状态',
  'places.regularOpeningHours': '常规营业时间', 'places.currentOpeningHours': '当前营业时间', 'places.regularSecondaryOpeningHours': '常规附加营业时间', 'places.currentSecondaryOpeningHours': '当前附加营业时间', 'places.transitStation': '交通站点',
  'places.priceLevel': '价格等级', 'places.priceRange': '价格范围', 'places.plusCode': 'Plus Code',
  'places.timeZone': '时区', 'places.utcOffsetMinutes': 'UTC 偏移', 'places.attributions': '数据归属', 'places.consumerAlert': '消费者提示', 'places.movedPlace': '迁移地点', 'places.movedPlaceId': '迁移地点 ID',
  'places.reviews': '评论内容', 'places.reviewSummary': '评论摘要', 'places.editorialSummary': '编辑摘要',
  'places.accessibilityOptions': '无障碍设施', 'places.parkingOptions': '停车设施',
  'places.paymentOptions': '支付方式', 'places.dineIn': '店内用餐', 'places.takeout': '外带',
  'places.delivery': '配送', 'places.reservable': '可预约', 'places.servesBreakfast': '早餐',
  'places.servesBrunch': '早午餐', 'places.servesLunch': '午餐', 'places.servesDinner': '晚餐', 'places.servesBeer': '啤酒', 'places.servesCocktails': '鸡尾酒', 'places.servesCoffee': '咖啡', 'places.servesDessert': '甜点', 'places.servesWine': '葡萄酒',
  'places.servesVegetarianFood': '素食', 'places.outdoorSeating': '户外座位', 'places.liveMusic': '现场音乐',
  'places.goodForChildren': '适合儿童', 'places.goodForGroups': '适合团体', 'places.goodForWatchingSports': '适合观看体育', 'places.menuForChildren': '儿童菜单', 'places.neighborhoodSummary': '社区摘要', 'places.generativeSummary': '生成式摘要', 'places.evChargeAmenitySummary': '充电设施摘要', 'places.evChargeOptions': '电动车充电选项', 'places.fuelOptions': '燃油选项', 'places.restroom': '洗手间', 'places.allowsDogs': '允许携犬',
  'places.curbsidePickup': '路边取货',
};
const businessTypes = [
  { value: 'distributor', label: '经销商 / 批发商' },
  { value: 'manufacturer', label: '制造商' },
  { value: 'electrical_equipment', label: '电气设备' },
  { value: 'electronics', label: '电子产品商店' },
  { value: 'computer_network', label: '电脑 / 网络 / 通信' },
  { value: 'industrial_supplies', label: '工业用品' },
  { value: 'corporate_office', label: '企业办公室' },
  { value: 'mobile_communications', label: '手机 / 通信门店' },
];
const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.error?.message || '请求失败（HTTP ' + response.status + '）');
  return (payload.data ?? payload) as T;
}

function countryLabel(country: Country) {
  return country.name.common;
}
function flagUrl(code: string) {
  return 'https://flagcdn.com/w40/' + code.toLowerCase() + '.png';
}
function pointList(geometry: Geometry): Array<[number, number]> {
  const coordinates = geometry.coordinates as any;
  if (geometry.type === 'Polygon') return (coordinates as Array<Array<[number, number]>>).flat();
  return (coordinates as Array<Array<Array<[number, number]>>>).flat(2);
}
function polygonPath(rings: Array<Array<[number, number]>>, project: (point: [number, number]) => [number, number]) {
  return rings.map(ring => ring.map((point, index) => {
    const [x, y] = project(point);
    return (index ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ') + ' Z').join(' ');
}
function RegionMap({ regions, selectedRegion, city, onRegionSelect }: {
  regions: Region[]; selectedRegion: string; city: City | null; onRegionSelect: (id: string, name: string) => void;
}) {
  const shapes = useMemo(() => {
    const valid = regions.flatMap(region => {
      const geometry = region.geometry as Geometry;
      if (!geometry?.coordinates || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return [];
      const polygons = geometry.type === 'Polygon'
        ? [geometry.coordinates as Array<Array<[number, number]>>]
        : geometry.coordinates as Array<Array<Array<[number, number]>>>;
      return [{ ...region, polygons, points: pointList(geometry) }];
    });
    const points = valid.flatMap(item => item.points);
    if (!points.length) return [];
    const minLon = Math.min(...points.map(point => point[0]));
    const maxLon = Math.max(...points.map(point => point[0]));
    const minLat = Math.min(...points.map(point => point[1]));
    const maxLat = Math.max(...points.map(point => point[1]));
    const width = Math.max(0.001, maxLon - minLon);
    const height = Math.max(0.001, maxLat - minLat);
    const scale = Math.min(580 / width, 320 / height);
    const offsetX = (640 - width * scale) / 2;
    const offsetY = (360 - height * scale) / 2;
    const project = ([lon, lat]: [number, number]): [number, number] => [offsetX + (lon - minLon) * scale, offsetY + (maxLat - lat) * scale];
    return valid.map(item => ({
      ...item,
      path: item.polygons.map(polygon => polygonPath(polygon, project)).join(' '),
    }));
  }, [regions, city]);
  const cityPoint = useMemo(() => {
    if (!city || city.latitude == null || city.longitude == null || !shapes.length) return null;
    const points = shapes.flatMap(shape => shape.points);
    const minLon = Math.min(...points.map(point => point[0]));
    const maxLon = Math.max(...points.map(point => point[0]));
    const minLat = Math.min(...points.map(point => point[1]));
    const maxLat = Math.max(...points.map(point => point[1]));
    const width = Math.max(0.001, maxLon - minLon);
    const height = Math.max(0.001, maxLat - minLat);
    const scale = Math.min(580 / width, 320 / height);
    const offsetX = (640 - width * scale) / 2;
    const offsetY = (360 - height * scale) / 2;
    return [offsetX + (city.longitude - minLon) * scale, offsetY + (maxLat - city.latitude) * scale] as [number, number];
  }, [city, shapes]);
  if (!regions.length) return <div className="tp-gmaps-discovery__map-empty">选择国家后加载行政区地图</div>;
  return (
    <div className="tp-gmaps-discovery__map">
      <svg viewBox="0 0 640 360" role="img" aria-label="州省行政区选择地图">
        {shapes.map(shape => (
          <path key={shape.id} d={shape.path} className="tp-gmaps-discovery__region"
            data-selected={!city && selectedRegion === shape.id ? 'true' : 'false'}
            role="button" tabIndex={0} aria-label={shape.name}
            onClick={() => onRegionSelect(shape.id, shape.name)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRegionSelect(shape.id, shape.name); } }}>
            <title>{shape.name}</title>
          </path>
        ))}
        {cityPoint && <g className="tp-gmaps-discovery__city-pin" transform={'translate(' + cityPoint[0] + ' ' + cityPoint[1] + ')'}><circle r="10" /><circle r="3.5" /></g>}
      </svg>
      <div className="tp-gmaps-discovery__map-caption">
        {city ? '地图标记：' + city.name + '（城市级）' : selectedRegion ? '地图标记：' + (regions.find(region => region.id === selectedRegion)?.name || '已选州 / 省') : '点击地图选择州 / 省'}
      </div>
    </div>
  );
}

export function GoogleMapsDiscoveryPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState('');
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [cityOptions, setCityOptions] = useState<City[]>([]);
  const [city, setCity] = useState<City | null>(null);
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [translated, setTranslated] = useState('');
  const [originalKeyword, setOriginalKeyword] = useState('');
  const [translationBusy, setTranslationBusy] = useState(false);
  const [limit, setLimit] = useState('20');
  const [minRating, setMinRating] = useState('0');
  const [openNow, setOpenNow] = useState(false);
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);
  const [includePureServiceAreaBusinesses, setIncludePureServiceAreaBusinesses] = useState(false);
  const [rankPreference, setRankPreference] = useState('RELEVANCE');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [advancedFieldRows, setAdvancedFieldRows] = useState<string[]>([]);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionError, setRegionError] = useState('');
  const [regionReload, setRegionReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runId, setRunId] = useState('');
  const [runStatus, setRunStatus] = useState('');
  const [runMessage, setRunMessage] = useState('');
  const [runTaskCode, setRunTaskCode] = useState('');
  const [runProgress, setRunProgress] = useState(0);
  const [runLogs, setRunLogs] = useState<Array<{ id: string; level?: string; message?: string; createdAt?: string }>>([]);
  const [results, setResults] = useState<ProspectRow[]>([]);
  const [tableSearch, setTableSearch] = useState('');

  const language = languageByCountry[country] ?? { deepl: 'EN-US', google: 'en' };
  const chosenCountry = countries.find(item => item.cca2 === country);

  const loadResults = useCallback(async (id: string) => {
    const [run, rows] = await Promise.all([
      api<Record<string, any>>('/api/v1/discovery-runs/' + id),
      api<ProspectRow[]>('/api/v1/discovery-records?runId=' + id + '&limit=500'),
    ]);
    setRunStatus(String(run.status ?? ''));
    setRunMessage(String(run.message ?? ''));
    setRunTaskCode(String(run.taskCode ?? ''));
    setRunProgress(Math.max(0, Math.min(100, Number(run.progress ?? 0))));
    setRunLogs(Array.isArray(run.logs) ? run.logs : []);
    setResults((rows ?? []).map(row => {
      const occurrence = (row.discovery_record_occurrences ?? []).find(item => item.provider === 'google_maps');
      return { ...row, raw_data: { ...(row.raw_data ?? {}), ...(occurrence?.raw_data ?? {}) } };
    }));
  }, []);

  useEffect(() => {
    let active = true;
    void api<{ countries: Country[] }>('/api/v1/prospect-profiling/countries')
      .then(payload => { if (active) setCountries(payload.countries ?? []); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '国家列表读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!country) { setRegions([]); setRegion(''); setCity(null); setCityOptions([]); setRegionError(''); setRegionLoading(false); return; }
    let active = true;
    setRegions([]); setRegion(''); setCity(null); setCityQuery(''); setCityOptions([]); setRegionError(''); setRegionLoading(true);
    void api<{ regions: Region[] }>('/api/v1/prospect-profiling/regions?country=' + country)
      .then(payload => { if (active) setRegions(payload.regions ?? []); })
      .catch(cause => { if (active) setRegionError(cause instanceof Error ? cause.message : '行政区地图加载失败。'); })
      .finally(() => { if (active) setRegionLoading(false); });
    return () => { active = false; };
  }, [country, regionReload]);

  useEffect(() => {
    if (!country || cityQuery.trim().length < 2) { setCityOptions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      const url = '/api/v1/prospect-profiling/cities?q=' + encodeURIComponent(cityQuery.trim()) + '&country=' + country + '&language=en';
      void api<{ cityDetails: City[] }>(url)
        .then(payload => { if (active) { const selectedRegionName = regions.find(item => item.id === region)?.name.toLocaleLowerCase(); setCityOptions((payload.cityDetails ?? []).filter(item => !selectedRegionName || item.admin1.toLocaleLowerCase() === selectedRegionName || item.admin1.toLocaleLowerCase().includes(selectedRegionName) || selectedRegionName.includes(item.admin1.toLocaleLowerCase()))); } })
        .catch(() => { if (active) setCityOptions([]); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cityQuery, country, region, regions]);

  useEffect(() => {
    if (!country || keyword.trim().length < 2) { setSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      const url = '/api/v1/prospect-profiling/autocomplete?q=' + encodeURIComponent(keyword.trim()) + '&hl=' + language.google + '&gl=' + country.toLowerCase();
      void api<{ suggestions: string[] }>(url)
        .then(payload => { if (active) setSuggestions(payload.suggestions ?? []); })
        .catch(() => { if (active) setSuggestions([]); });
    }, 260);
    return () => { active = false; window.clearTimeout(timer); };
  }, [keyword, country, language.google]);

  useEffect(() => {
    if (!runId || !['queued', 'running', 'planned'].includes(runStatus)) return;
    const timer = window.setInterval(() => { void loadResults(runId).catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [runId, runStatus, loadResults]);

  const requestedFields = useMemo(() => [...standardFields, ...advancedFieldRows], [advancedFieldRows]);
  const tableRows = useMemo(() => {
    const query = tableSearch.trim().toLocaleLowerCase();
    return results.filter(row => !query || [row.name, row.address, row.phone, row.website, row.country_code].join(' ').toLocaleLowerCase().includes(query));
  }, [results, tableSearch]);

  const columns = useMemo(() => {
    const base = [
      { key: 'name', header: '企业名称', primary: true, minWidth: 220, render: (row: ProspectRow) => row.name || '—' },
      { key: 'address', header: 'Google Maps 地址', minWidth: 260 },
      { key: 'phone', header: '电话', minWidth: 160 },
      { key: 'website', header: '官网', minWidth: 180 },
      { key: 'rating', header: '评分', minWidth: 90, render: (row: ProspectRow) => valueText(row.raw_data?.rating) },
      { key: 'userRatingCount', header: '评价数', minWidth: 100, render: (row: ProspectRow) => valueText(row.raw_data?.userRatingCount ?? row.raw_data?.user_rating_count) },
      { key: 'businessStatus', header: '营业状态', minWidth: 120, render: (row: ProspectRow) => valueText(row.raw_data?.businessStatus ?? row.raw_data?.business_status) },
      { key: 'types', header: 'Google 类型', minWidth: 180, render: (row: ProspectRow) => valueText(row.raw_data?.types) },
      { key: 'googleMapsUri', header: '地图链接', minWidth: 180, render: (row: ProspectRow) => {
        const url = String(row.raw_data?.googleMapsUri ?? row.raw_data?.googleMapsLinks ?? '');
        return url.startsWith('http') ? <a href={url} target="_blank" rel="noreferrer">打开地图</a> : '—';
      } },
    ];
    const dynamicKeys = [...new Set(results.flatMap(row => Object.keys(row.raw_data ?? {})))]
      .filter(key => !['place_id', 'formatted_address', 'phone', 'website', 'rating', 'user_rating_count', 'business_status', 'types', 'guardrail_review_required'].includes(key))
      .sort();
    const dynamic = dynamicKeys.map(key => ({
      key: 'raw_' + key, header: key, minWidth: 180,
      render: (row: ProspectRow) => valueText(row.raw_data?.[key]),
      exportValue: (row: ProspectRow) => valueText(row.raw_data?.[key]),
    }));
    return [...base, ...dynamic] as any;
  }, [results]);

  const selectCountry = (code: string) => {
    setCountry(code); setRegion(''); setCity(null); setCityQuery(''); setTranslated(''); setOriginalKeyword(''); setSuggestions([]);
  };
  const chooseCity = (item: City) => {
    setCity(item); setCityQuery(item.name); setCityOptions([]);
  };

  const translateKeyword = async () => {
    if (!keyword.trim() || !country) return;
    setTranslationBusy(true); setError('');
    try {
      const response = await api<{ translatedText: string }>('/api/v1/discovery/translate', {
        method: 'POST', body: JSON.stringify({ text: keyword.trim(), targetLanguage: language.deepl, sourceLanguage: 'auto' }),
      });
      setTranslated(response.translatedText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'DeepL 翻译失败。');
    } finally { setTranslationBusy(false); }
  };

  const startDiscovery = async () => {
    if (!country || !keyword.trim()) { setError('请先选择国家 / 地区并填写搜索关键词。'); return; }
    setBusy(true); setError(''); setNotice(''); setResults([]);
    try {
      const input = {
        countries: [country], query: keyword.trim(), originalQuery: originalKeyword || undefined,
        translatedQuery: originalKeyword ? keyword.trim() : undefined, targetLanguage: originalKeyword ? language.deepl : undefined,
        state: region ? regions.find(item => item.id === region)?.name : undefined,
        city: city ? (city.admin1 && !region ? city.name + ', ' + city.admin1 : city.name) : undefined,
        limitPerCountry: Math.min(60, Math.max(1, Number(limit) || 20)),
        providers: ['google_maps'], businessTypes: selectedTypes,
        filters: { minRating: Number(minRating) || undefined, openNow, requireWebsite, requirePhone },
        googleFieldMask: requestedFields,
        googleFieldStorageModes: {},
        googleLanguageCode: language.google,
        googleRankPreference: rankPreference,
        googleIncludePureServiceAreaBusinesses: includePureServiceAreaBusinesses,
      };
      const run = await api<{ id: string; taskCode?: string; status: string; message?: string; progress?: number }>('/api/v1/discovery-runs', { method: 'POST', body: JSON.stringify(input) });
      setRunId(run.id); setRunTaskCode(run.taskCode ?? ''); setRunStatus(run.status); setRunProgress(run.progress ?? 0); setRunMessage(run.message ?? '任务已排队');
      setNotice('Google Maps 发现任务已创建。结果会在后台完成后自动更新。');
      await loadResults(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建 Google Maps 发现任务失败。');
    } finally { setBusy(false); }
  };

  const convertCustomer = async (row: ProspectRow) => {
    if (row.status === 'promoted' || row.lead_id) throw new Error('该潜客已经转换为 CRM 客户。');
    const raw = row.raw_data ?? {};
    const stage = String(raw.lifecycle_stage ?? 'discovered');
    const intel = raw.contact_intelligence && typeof raw.contact_intelligence === 'object' ? raw.contact_intelligence as Record<string, unknown> : {};
    const candidates = Array.isArray(intel.candidates) ? intel.candidates as Array<Record<string, unknown>> : [];
    if (stage !== 'collected') {
      if (stage === 'discovered') {
        await api('/api/v1/discovery-records/' + row.id + '/action', { method: 'POST', body: JSON.stringify({ action: 'review' }) });
      }
      await api('/api/v1/discovery-contact-enrichments', {
        method: 'POST', body: JSON.stringify({ recordIds: [row.id], providers: ['website'] }),
      });
      setNotice('已通过潜客审核并启动官网联系人补全。任务完成后，再次点击「转为客户」即可选择联系人并创建 CRM 客户。');
      await loadResults(runId);
      return;
    }
    const candidateKeys = candidates.filter(item => String(item.full_name ?? '').trim()).map(item =>
      String(item.provider ?? '') + '：' + String(item.provider_person_id ?? item.email ?? item.linkedin_url ?? item.full_name ?? ''),
    );
    if (!candidateKeys.length) throw new Error('联系人补全已完成，但未发现可转换的有效联系人。请先检查该企业资料。');
    const converted = await api<{ accountId: string; accountName: string; createdContacts: number; linkedContacts: number }>(
      '/api/v1/discovery-contact-candidates/convert',
      { method: 'POST', body: JSON.stringify({ recordId: row.id, candidateKeys }) },
    );
    setNotice('已转换为客户：' + converted.accountName + '；新增联系人 ' + converted.createdContacts + ' 位，关联 ' + converted.linkedContacts + ' 位。');
    await loadResults(runId);
  };

  const rowActions = [{ key: 'convert-customer', label: '转为客户', onClick: (row: ProspectRow) => {
    void convertCustomer(row).catch(cause => setError(cause instanceof Error ? cause.message : '客户转换失败。'));
  }}];

  return (
    <main className="tp-gmaps-discovery">
      <PageHeader className="tp-gmaps-discovery__header">
        <div>
          <p className="tp-gmaps-discovery__eyebrow">TRADEPILOT / PROSPECT DISCOVERY</p>
          <h1>Google Maps 发现</h1>
          <p>使用 Google Maps Places API 发现目标国家的本地企业、经销商、制造商与渠道商。</p>
        </div>
        <div className="tp-gmaps-discovery__header-actions">
          <Link href="/prospect-discovery/google-maps/tasks" renderIcon={semanticIcons.time}>Google Maps 发现任务中心</Link>
          <Link href="/prospect-discovery/google-maps/customers" renderIcon={semanticIcons.database}>Google Maps 发现客户</Link>
        </div>
      </PageHeader>

      {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title="操作已提交" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <section className="tp-gmaps-discovery__section">
        <div className="tp-gmaps-discovery__section-heading">
          <div><span>01</span><div><h2>目标市场与地理范围</h2><p>一次选择一个国家或地区，再逐级缩小到州 / 省或城市。</p></div></div>
          <Tag type="blue">单一市场</Tag>
        </div>
        <div className="tp-gmaps-discovery__location-grid">
          <div className="tp-gmaps-discovery__field">
            <label>国家 / 地区</label>
            <div className="tp-gmaps-discovery__country-select">
              <Dropdown
                id="gmaps-country"
                titleText="选择国家或地区"
                label="请选择国家 / 地区"
                items={countries}
                selectedItem={chosenCountry ?? null}
                itemToString={item => item ? countryLabel(item) : ''}
                itemToElement={item => <span className="tp-gmaps-discovery__country-option"><img src={flagUrl(item.cca2)} alt="" /><span>{countryLabel(item)}</span></span>}
                renderSelectedItem={item => item ? <span className="tp-gmaps-discovery__country-option"><img src={flagUrl(item.cca2)} alt="" /><span>{countryLabel(item)}</span></span> : null}
                onChange={({ selectedItem }) => selectCountry(selectedItem?.cca2 ?? '')}
                disabled={loading}
              />
            </div>
          </div>
          <div className="tp-gmaps-discovery__field">
            <label>州 / 省</label>
            <Select id="gmaps-region" labelText="选择州 / 省" hideLabel value={region} onChange={event => { setRegion(event.currentTarget.value); setCity(null); setCityQuery(''); }} disabled={!country || regionLoading || (!regions.length && !regionError)}>
              <SelectItem value="" text={regionLoading ? '正在加载州 / 省…' : regions.length ? '全部州 / 省' : regionError ? '行政区数据加载失败' : '该国家暂无可用一级行政区'} />
              {regions.map(item => <SelectItem key={item.id} value={item.id} text={item.name} />)}
            </Select>
            {regionError && <div className="tp-gmaps-discovery__region-error" role="alert"><span>{regionError}</span><Button kind="ghost" size="sm" onClick={() => setRegionReload(value => value + 1)}>重试</Button></div>}
          </div>
          <div className="tp-gmaps-discovery__field tp-gmaps-discovery__city-field">
            <label>城市</label>
            <TextInput id="gmaps-city" labelText="输入城市名称" hideLabel value={cityQuery} placeholder="输入城市名称以搜索" onChange={event => { setCityQuery(event.currentTarget.value); setCity(null); }} disabled={!country} />
            {cityOptions.length > 0 && <div className="tp-gmaps-discovery__suggestion-list">
              {cityOptions.map(item => <button key={String(item.id) + item.name + item.admin1} type="button" onClick={() => chooseCity(item)}>
                <strong>{item.name}</strong><span>{[item.admin1, item.admin2].filter(Boolean).join(' · ')}</span>
              </button>)}
            </div>}
          </div>
        </div>
        <div className="tp-gmaps-discovery__map-heading">
          <div><strong>行政区地图</strong><span>{city ? '城市级定位优先，不高亮所属州 / 省' : region ? '已高亮所选州 / 省' : '点击地图也可选择州 / 省'}</span></div>
          {region && <Button kind="ghost" size="sm" onClick={() => setRegion('')}>清除州 / 省</Button>}
        </div>
        <RegionMap regions={regions} selectedRegion={region} city={city} onRegionSelect={(id) => { setRegion(id); setCity(null); setCityQuery(''); }} />
        <p className="tp-gmaps-discovery__source-note">行政区边界：geoBoundaries gbOpen（CC BY 4.0）；城市搜索：Open-Meteo Geocoding API。</p>
      </section>

      <section className="tp-gmaps-discovery__section">
        <div className="tp-gmaps-discovery__section-heading">
          <div><span>02</span><div><h2>搜索关键词</h2><p>Google 搜索联想免费建议关键词；翻译结果必须手动确认后才会替换。</p></div></div>
          {country && <Tag type="cool-gray">默认语言：{language.deepl}</Tag>}
        </div>
        <div className="tp-gmaps-discovery__keyword-row">
          <div className="tp-gmaps-discovery__keyword-input">
            <TextInput id="gmaps-keyword" labelText="企业或产品关键词" value={keyword} onChange={event => { setKeyword(event.currentTarget.value); setTranslated(''); setOriginalKeyword(''); }} placeholder="例如：electronics wholesaler、computer accessories distributor" />
            {suggestions.length > 0 && <div className="tp-gmaps-discovery__suggestion-list tp-gmaps-discovery__keyword-suggestions">
              {suggestions.map(item => <button type="button" key={item} onClick={() => { setKeyword(item); setSuggestions([]); setTranslated(''); setOriginalKeyword(''); }}><span>{item}</span><span>采用关键词</span></button>)}
            </div>}
          </div>
          <Button kind="tertiary" renderIcon={semanticIcons.translate} onClick={() => void translateKeyword()} disabled={!country || !keyword.trim() || translationBusy}>{translationBusy ? '翻译中…' : 'DeepL 翻译'}</Button>
        </div>
        {translated && <div className="tp-gmaps-discovery__translation">
          <div><span>翻译建议 · {language.deepl}</span><strong>{translated}</strong></div>
          <div><Button kind="primary" size="sm" onClick={() => { setOriginalKeyword(keyword.trim()); setKeyword(translated); setTranslated(''); setSuggestions([]); }}>确认替换关键词</Button><Button kind="ghost" size="sm" onClick={() => setTranslated('')}>保留原词</Button></div>
        </div>}
      </section>

      <section className="tp-gmaps-discovery__section">
        <div className="tp-gmaps-discovery__section-heading">
          <div><span>03</span><div><h2>Google Maps 请求参数</h2><p>基础请求参数与响应字段分组展示；高级字段按需启用，避免无意触发更高计费 SKU。</p></div></div>
          <Tag type="blue">Places API · Text Search</Tag>
        </div>
        <div className="tp-gmaps-discovery__parameter-grid">
          <div className="tp-gmaps-discovery__field"><label>最大结果数（最多 60）</label><Select id="gmaps-limit" labelText="最大结果数" hideLabel value={limit} onChange={event => setLimit(event.currentTarget.value)}>{['10','20','40','60'].map(value => <SelectItem key={value} value={value} text={value + ' 条'} />)}</Select></div>
          <div className="tp-gmaps-discovery__field"><label>最低评分</label><Select id="gmaps-rating" labelText="最低评分" hideLabel value={minRating} onChange={event => setMinRating(event.currentTarget.value)}>{['0','3','3.5','4','4.5','5'].map(value => <SelectItem key={value} value={value} text={value === '0' ? '不限' : value + ' 星及以上'} />)}</Select></div>
          <div className="tp-gmaps-discovery__field"><label>结果排序</label><Select id="gmaps-rank" labelText="结果排序" hideLabel value={rankPreference} onChange={event => setRankPreference(event.currentTarget.value)}><SelectItem value="RELEVANCE" text="相关性优先" /><SelectItem value="DISTANCE" text="距离优先" /></Select></div>
        </div>
        <div className="tp-gmaps-discovery__checks">
          <Checkbox id="gmaps-open-now" labelText="仅当前营业" checked={openNow} onChange={event => setOpenNow(event.currentTarget.checked)} />
          <Checkbox id="gmaps-website" labelText="必须有官网" checked={requireWebsite} onChange={event => setRequireWebsite(event.currentTarget.checked)} />
          <Checkbox id="gmaps-phone" labelText="必须有电话" checked={requirePhone} onChange={event => setRequirePhone(event.currentTarget.checked)} />
          <Checkbox id="gmaps-service-area" labelText="包含纯服务区域企业" checked={includePureServiceAreaBusinesses} onChange={event => setIncludePureServiceAreaBusinesses(event.currentTarget.checked)} />
        </div>
        <div className="tp-gmaps-discovery__field">
          <label>企业类型过滤</label>
          <div className="tp-gmaps-discovery__checks">
            {businessTypes.map(item => <Checkbox key={item.value} id={'gmaps-type-' + item.value} labelText={item.label} checked={selectedTypes.includes(item.value)} onChange={event => setSelectedTypes(current => event.currentTarget.checked ? [...current, item.value] : current.filter(value => value !== item.value))} />)}
          </div>
        </div>
        <Accordion>
          <AccordionItem title="高级响应字段（可多选）">
            <div className="tp-gmaps-discovery__advanced-note">在下拉框中搜索并勾选希望 Google Maps 返回的额外数据。未选择的高级字段不会加入本次请求；字段是否有值取决于 Google 的商家资料覆盖情况。</div>
            <FilterableMultiSelect
              id="gmaps-advanced-fields"
              titleText="选择高级响应字段"
              placeholder="搜索字段名称或 API 字段"
              items={advancedFields.map(field => ({ id: field, label: (fieldLabels[field] || field) + ' · ' + field }))}
              itemToString={item => item?.label ?? ''}
              selectedItems={advancedFieldRows.map(field => ({ id: field, label: (fieldLabels[field] || field) + ' · ' + field }))}
              onChange={({ selectedItems }) => setAdvancedFieldRows(selectedItems.map(item => item.id))}
              selectionFeedback="top"
            />
            <div className="tp-gmaps-discovery__request-summary">
              <strong>基础字段 {standardFields.length} 项 · 已选高级字段 {advancedFieldRows.length} 项</strong>
              <span>本次请求会合并基础字段和已选字段；未选择的高级字段不会请求。</span>
            </div>
          </AccordionItem>
        </Accordion>
        <div className="tp-gmaps-discovery__actions">
          <Button kind="primary" renderIcon={semanticIcons.search} onClick={() => void startDiscovery()} disabled={busy || !country || !keyword.trim()}>{busy ? '正在创建任务…' : '开始 Google Maps 发现'}</Button>
        </div>
      </section>

      <section className="tp-gmaps-discovery__section tp-gmaps-discovery__results">
        <div className="tp-gmaps-discovery__section-heading">
          <div><span>04</span><div><h2>Google Maps 发现结果</h2><p>保留 API 返回的原始 Place 字段；表格按实际返回字段自动扩展列，不丢弃未知字段。</p></div></div>
          {runId && <Tag type={runStatus === 'completed' ? 'green' : runStatus === 'failed' ? 'red' : 'blue'}>{runStatus || '任务处理中'}</Tag>}
        </div>
        {runId && <div className="tp-gmaps-discovery__run-panel">
          <div className="tp-gmaps-discovery__run-summary"><strong>任务编号：{runTaskCode || runId}</strong><span>任务 ID：{runId}</span><Tag type={runStatus === 'completed' ? 'green' : runStatus === 'failed' ? 'red' : 'blue'}>{runStatus || '任务处理中'}</Tag><span>已读取 {results.length} 条记录</span></div>
          <div className="tp-gmaps-discovery__progress">
            <div><strong>任务进度</strong><span>{runProgress}%</span></div>
            <progress className="tp-gmaps-discovery__progress-meter" aria-label="Google Maps 发现任务进度" max={100} value={runProgress} />
            <p>{runMessage}</p>
          </div>
          <div className="tp-gmaps-discovery__logs">
            <strong>执行日志</strong>
            {runLogs.map(log => <div key={log.id}><time>{log.createdAt ? new Date(log.createdAt).toLocaleString('zh-TW', { hour12: false }) : '—'}</time><Tag type={log.level === 'error' ? 'red' : log.level === 'success' ? 'green' : 'gray'}>{log.level || 'info'}</Tag><span>{log.message || '—'}</span></div>)}
            {!runLogs.length && <p>任务启动后，日志会实时显示在这里。</p>}
          </div>
        </div>}
        <TpDataTable
          columns={columns}
          rows={tableRows}
          rowKey="id"
          selectable
          batchActions={[{ key: 'convert-selected-customers', label: '转为客户', onClick: async (rows: ProspectRow[]) => { for (const row of rows) await convertCustomer(row); } }]}
          rowActions={rowActions}
          searchValue={tableSearch}
          onSearchChange={setTableSearch}
          columnSettingsKey="google-maps-discovery-results"
          emptyState={<p className="tp-gmaps-discovery__empty">尚无 Google Maps 发现结果。选择国家、关键词并启动任务后，结果会显示在这里。</p>}
          ariaLabel="Google Maps 潜客发现结果"
        />
      </section>
    </main>
  );
}
