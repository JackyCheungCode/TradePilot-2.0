export type Category = 'maps' | 'social' | 'ecommerce';
export type CategoryFilter = 'all' | Category;
export type Platform = 'google_maps' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'amazon' | 'alibaba' | 'aliexpress';

export const platformGroups: Array<{
  id: Category;
  title: string;
  description: string;
  platforms: Array<{ id: Platform; name: string; enabled: boolean; hint: string }>;
}> = [
  { id: 'maps', title: '地图平台', description: '按地区发现企业、门店和经销商', platforms: [
    { id: 'google_maps', name: 'Google Maps', enabled: true, hint: 'Google Places API（官方）' },
  ] },
  { id: 'social', title: '社交媒体', description: '发现企业主页、品牌账号和公开商业资料', platforms: [
    { id: 'facebook', name: 'Facebook Pages', enabled: true, hint: 'Apify · Facebook 搜索 Actor' },
    { id: 'instagram', name: 'Instagram', enabled: true, hint: 'Apify · Instagram Scraper' },
    { id: 'linkedin', name: 'LinkedIn', enabled: false, hint: 'Actor 接入待验证' },
    { id: 'tiktok', name: 'TikTok', enabled: false, hint: 'Actor 接入待验证' },
  ] },
  { id: 'ecommerce', title: '电商平台', description: '发现商品、店铺和供应商线索', platforms: [
    { id: 'amazon', name: 'Amazon', enabled: false, hint: 'Actor 接入待验证' },
    { id: 'alibaba', name: 'Alibaba.com', enabled: false, hint: 'Actor 接入待验证' },
    { id: 'aliexpress', name: 'AliExpress', enabled: false, hint: 'Actor 接入待验证' },
  ] },
];

export const consolePlatformCatalog = [
  ...platformGroups.flatMap(group => group.platforms.map(platform => ({
    key: platform.id, label: platform.name, enabled: platform.enabled,
  }))),
  { key: 'search_engine', label: '搜索引擎', enabled: true },
  { key: 'agent', label: '内置 Agent', enabled: true },
];
