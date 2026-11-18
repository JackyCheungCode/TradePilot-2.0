import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, MultiSelect, Pagination, Search, Tag } from '@/design-system';

type Source = { id: string; name: string; description: string; markets: string[] };
type SourceGroup = { id: string; title: string; description: string; sources: Source[] };
type RegionalSource = Source & { continent: string };

const preservedGroups: SourceGroup[] = [
  { id: 'global-penetration', title: '全球通用与全域穿透渠道', description: '跨国家覆盖，补充企业发现与决策人线索', sources: [
    { id: 'google-maps', name: 'Google Maps', description: '本地企业、门店、工程商与公开联系信息', markets: ['*'] },
    { id: 'linkedin', name: 'LinkedIn', description: '企业档案与采购、品类及管理层决策人', markets: ['*'] },
    { id: 'shopify', name: 'Shopify / 独立站雷达', description: '按国家域名与行业词发现 DTC 品牌及独立站', markets: ['*'] },
  ] },
];

const globalCatalog: SourceGroup[] = [
  { id: 'search', title: '搜索引擎与网页发现', description: '网页、关键词、新闻、图片、商品搜索与网站发现', sources: [
    ['google-search','Google Search','网页、企业、产品与关键词结果'],['bing-search','Bing Search','网页、新闻与图片搜索'],['yahoo-search','Yahoo Search','网页与新闻发现'],['duckduckgo','DuckDuckGo','网页搜索与主题发现'],['google-news','Google News','行业新闻与企业动态'],['google-shopping','Google Shopping','商品、价格与零售商信息'],['yandex','Yandex','区域网页、图片与商品搜索'],['baidu','Baidu','中文网页与资讯搜索'],['naver-search','Naver Search','韩国网页与内容搜索'],['brave-search','Brave Search','网页索引与发现'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'social', title: '社交媒体与专业网络', description: '企业主页、个人资料、帖子、评论、粉丝与互动', sources: [
    ['instagram','Instagram','公开账号、帖子、Reels、话题与互动'],['facebook','Facebook','公开主页、帖子、群组与评论'],['tiktok','TikTok','公开账号、视频、话题与评论'],['linkedin-global','LinkedIn','企业、个人职业资料、职位与公开帖子'],['x-twitter','X','公开帖子、账号、话题与互动'],['reddit','Reddit','社区、帖子、评论与需求讨论'],['pinterest','Pinterest','Pins、Boards 与视觉趋势'],['threads','Threads','公开帖子与账号'],['snapchat','Snapchat','公开内容与创作者资料'],['telegram','Telegram','公开频道与群组内容'],['quora','Quora','问答、主题与用户讨论'],['medium','Medium','文章、作者与行业话题'],['tumblr','Tumblr','公开博客与内容'],['nextdoor','Nextdoor','公开本地社区内容'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'video', title: '视频、直播与内容平台', description: '频道、视频、创作者、评论与内容趋势', sources: [
    ['youtube','YouTube','频道、视频、评论、字幕与关键词'],['vimeo','Vimeo','视频与创作者资料'],['twitch','Twitch','频道、直播与公开互动'],['dailymotion','Dailymotion','视频与频道'],['rumble','Rumble','视频、频道与内容'],['bilibili','Bilibili','视频、UP 主、评论与弹幕'],['nicovideo','Niconico','日本视频与创作者内容'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'ecommerce', title: '电商、零售与商品市场', description: '商品、卖家、品牌、价格、排名、评价与店铺', sources: [
    ['amazon','Amazon','商品、卖家、品牌、价格与评论'],['ebay','eBay','商品、卖家、成交与价格信号'],['walmart','Walmart','商品、品牌、卖家与评价'],['alibaba','Alibaba.com','B2B 供应商、产品与报价'],['aliexpress','AliExpress','商品、店铺、价格与评价'],['etsy','Etsy','商品、店铺与评价'],['temu','Temu','商品、价格与品类趋势'],['shein','SHEIN','商品、款式与价格'],['shopify-stores','Shopify Stores','独立站、商品与品牌目录'],['woocommerce','WooCommerce','独立站商品与店铺'],['bigcommerce','BigCommerce','独立站商品与品牌'],['rakuten','Rakuten','商品、商家与价格'],['target','Target','商品、品牌与零售价格'],['bestbuy','Best Buy','消费电子商品与评价'],['costco','Costco','商品与零售价格'],['newegg','Newegg','电脑硬件、消费电子与卖家'],['wayfair','Wayfair','家居与智能家居商品'],['flipkart','Flipkart','印度电商商品与卖家'],['lazada','Lazada','东南亚商品与店铺'],['shopee','Shopee','东南亚商品、卖家与评价'],['tiktok-shop','TikTok Shop','商品、店铺与创作者带货'],['mercado-libre','Mercado Libre','拉美商品、店铺与卖家'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'reviews', title: '评价、口碑与消费者反馈', description: '品牌声誉、商品体验、评分与用户痛点', sources: [
    ['trustpilot','Trustpilot','企业评分、评论与口碑'],['g2','G2','软件与企业服务评价'],['capterra','Capterra','软件产品与供应商评价'],['trustradius','TrustRadius','产品评测与企业评价'],['sitejabber','Sitejabber','网站与商家评价'],['tripadvisor','Tripadvisor','本地商家与服务评价'],['yelp-reviews','Yelp','本地商家评分与评论'],['google-reviews','Google Reviews','企业地点与用户评价'],['amazon-reviews','Amazon Reviews','商品评价与用户反馈'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'web-tech', title: '独立站、网站与技术情报', description: '网站发现、技术栈、店铺识别与流量线索', sources: [
    ['builtwith','BuiltWith','网站技术栈与技术使用情况'],['wappalyzer','Wappalyzer','网站技术识别'],['similarweb','Similarweb','网站流量与竞争情报'],['website-crawl','网站内容采集','官网、产品页、联系页与经销商页面'],['domain-discovery','域名与品牌发现','品牌域名、子域名与网站关联线索'],['webflow','Webflow','基于 Webflow 的独立站发现'],['wix','Wix','基于 Wix 的独立站发现'],['squarespace','Squarespace','基于 Squarespace 的独立站发现'],['magento','Magento / Adobe Commerce','电商网站与商品目录'],['prestashop','PrestaShop','电商网站与商品目录'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'jobs', title: '招聘、人才与企业扩张信号', description: '职位、招聘需求、企业规模与组织变化', sources: [
    ['indeed','Indeed','职位与招聘企业'],['glassdoor','Glassdoor','企业资料、职位与评价'],['linkedin-jobs','LinkedIn Jobs','职位、企业与招聘趋势'],['monster','Monster','职位与雇主资料'],['ziprecruiter','ZipRecruiter','招聘职位与企业'],['workday','Workday','企业招聘门户公开职位'],['greenhouse','Greenhouse','企业招聘岗位'],['lever','Lever','企业招聘岗位'],['stepstone','StepStone','欧洲招聘与企业职位'],['seek','SEEK','澳新招聘与雇主信息'],['naukri','Naukri','印度招聘与企业职位'],['xing-jobs','Xing Jobs','德语区招聘职位'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'business-finance', title: '企业、投融资与产品创新', description: '企业档案、融资、初创公司与新品发布', sources: [
    ['crunchbase','Crunchbase','企业、融资、投资人与成长阶段'],['dealroom','Dealroom','科技企业、投资与生态系统'],['wellfound','Wellfound','初创公司与招聘团队'],['product-hunt','Product Hunt','新产品、品牌与创始团队'],['betalist','BetaList','早期产品与初创项目'],['github','GitHub','开发者组织、项目与技术生态'],['hackernews','Hacker News','科技产品与行业讨论'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'public-procurement', title: '政府采购与公共招投标', description: '采购公告、供应商、合同与公共项目', sources: [
    ['sam-gov','SAM.gov','美国联邦采购与承包商公开信息'],['ted','TED','欧洲公共采购公告'],['ungm','UNGM','联合国采购机会与供应商资料'],['dgmarket','DGMarket','国际发展项目采购'],['devex','Devex','国际发展与项目采购机会'],['eu-funding','EU Funding & Tenders','欧盟项目与采购信息'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
  { id: 'events-communities', title: '展会、协会与垂直社区', description: '参展商、行业协会会员、专业社区与供应链网络', sources: [
    ['canton-fair','广交会','参展商与采购商公开目录'],['hannover-messe','Hannover Messe','工业展商与行业企业'],['ces','CES','消费电子品牌与参展商'],['sema','SEMA','汽车与改装产业参展商'],['industry-associations','行业协会','行业组织与会员企业目录'],['trade-fairs','全球展会目录','展会、参展商与赞助商'],['craigslist','Craigslist','本地分类信息与商业线索'],['gumtree','Gumtree','本地分类信息与商业线索'],
  ].map(([id,name,description])=>({id,name,description,markets:['*']})) },
];

const regionalSources: RegionalSource[] = [
  {id:'thomasnet',name:'Thomasnet',description:'工业制造商、零部件供应商与分销商',markets:['US','CA'],continent:'Americas'},
  {id:'macraes',name:'MacRAE’s Blue Book',description:'北美工业供应商与制造商目录',markets:['US','CA'],continent:'Americas'},
  {id:'yellowpages-us',name:'Yellow Pages US',description:'美国本地企业与服务商黄页',markets:['US'],continent:'Americas'},
  {id:'yellowpages-ca',name:'YellowPages.ca',description:'加拿大企业与本地服务目录',markets:['CA'],continent:'Americas'},
  {id:'bbb',name:'Better Business Bureau',description:'北美企业档案与商业信誉信息',markets:['US','CA'],continent:'Americas'},
  {id:'yelp-local',name:'Yelp',description:'本地企业、零售与服务商',markets:['US','CA'],continent:'Americas'},
  {id:'section-amarilla-mx',name:'Sección Amarilla',description:'墨西哥本地商业黄页',markets:['MX'],continent:'Americas'},
  {id:'mercado-br',name:'Mercado Livre',description:'巴西电商商品与卖家',markets:['BR'],continent:'Americas'},
  {id:'telelistas',name:'TeleListas',description:'巴西企业与本地商业目录',markets:['BR'],continent:'Americas'},
  {id:'yapo',name:'Yapo.cl',description:'智利分类信息与商业线索',markets:['CL'],continent:'Americas'},
  {id:'europages',name:'Europages',description:'欧洲跨国 B2B 企业、制造商与分销商',markets:['*'],continent:'Europe'},
  {id:'kompass',name:'Kompass',description:'按国家、行业与企业角色筛选企业',markets:['*'],continent:'Europe'},
  {id:'wlw',name:'WLW',description:'德语区工业采购与供应商平台',markets:['DE','AT','CH'],continent:'Europe'},
  {id:'gelbe-seiten',name:'Gelbe Seiten',description:'德国本土商业黄页',markets:['DE'],continent:'Europe'},
  {id:'das-oertliche',name:'Das Örtliche',description:'德国本地企业与联系方式目录',markets:['DE'],continent:'Europe'},
  {id:'11880',name:'11880',description:'德国企业与服务商目录',markets:['DE'],continent:'Europe'},
  {id:'xing',name:'Xing',description:'德语区企业与专业人士网络',markets:['DE','AT','CH'],continent:'Europe'},
  {id:'yell-uk',name:'Yell',description:'英国本地企业目录',markets:['GB'],continent:'Europe'},
  {id:'companies-house',name:'Companies House',description:'英国官方企业注册档案',markets:['GB'],continent:'Europe'},
  {id:'pages-jaunes',name:'PagesJaunes',description:'法国企业与服务商黄页',markets:['FR'],continent:'Europe'},
  {id:'pagine-gialle',name:'PagineGialle',description:'意大利本地企业黄页',markets:['IT'],continent:'Europe'},
  {id:'paginas-amarillas-es',name:'Páginas Amarillas',description:'西班牙本地企业黄页',markets:['ES'],continent:'Europe'},
  {id:'kvk',name:'Kamer van Koophandel',description:'荷兰企业注册与商业档案',markets:['NL'],continent:'Europe'},
  {id:'marktplaats',name:'Marktplaats',description:'荷兰商品与商家市场',markets:['NL'],continent:'Europe'},
  {id:'allegro',name:'Allegro',description:'波兰电商商品与卖家',markets:['PL'],continent:'Europe'},
  {id:'hitta',name:'Hitta',description:'瑞典企业与本地服务目录',markets:['SE'],continent:'Europe'},
  {id:'braby',name:'Brabys',description:'南非企业与商业目录',markets:['ZA'],continent:'Africa'},
  {id:'yellowpages-za',name:'Yellow Pages South Africa',description:'南非企业黄页',markets:['ZA'],continent:'Africa'},
  {id:'vconnect',name:'VConnect',description:'尼日利亚企业与服务商目录',markets:['NG'],continent:'Africa'},
  {id:'jiji-africa',name:'Jiji',description:'非洲本地分类信息与商家线索',markets:['NG','KE','GH','UG'],continent:'Africa'},
  {id:'yellowpages-ae',name:'YellowPages.ae',description:'阿联酋企业目录',markets:['AE'],continent:'Asia'},
  {id:'yellowpages-sa',name:'YellowPages.sa',description:'沙特企业目录',markets:['SA'],continent:'Asia'},
  {id:'dubizzle',name:'Dubizzle',description:'中东本地商业与分类信息',markets:['AE','SA'],continent:'Asia'},
  {id:'indiamart',name:'IndiaMART',description:'印度 B2B 买家、供应商与产品',markets:['IN'],continent:'Asia'},
  {id:'tradeindia',name:'TradeIndia',description:'印度批发采购与企业名录',markets:['IN'],continent:'Asia'},
  {id:'justdial',name:'Justdial',description:'印度本地企业与服务目录',markets:['IN'],continent:'Asia'},
  {id:'naver',name:'Naver',description:'韩国搜索、企业与内容生态',markets:['KR'],continent:'Asia'},
  {id:'coupang',name:'Coupang',description:'韩国电商商品与卖家',markets:['KR'],continent:'Asia'},
  {id:'rakuten-jp',name:'Rakuten Japan',description:'日本电商商品与店铺',markets:['JP'],continent:'Asia'},
  {id:'yahoo-japan',name:'Yahoo! Japan',description:'日本搜索、拍卖与商品信息',markets:['JP'],continent:'Asia'},
  {id:'townpage',name:'タウンページ',description:'日本本地企业与商业黄页',markets:['JP'],continent:'Asia'},
  {id:'1688',name:'1688',description:'中国批发商品与供应商',markets:['CN'],continent:'Asia'},
  {id:'jd',name:'京东',description:'中国消费电子商品、品牌与卖家',markets:['CN'],continent:'Asia'},
  {id:'taobao',name:'淘宝 / 天猫',description:'中国商品、店铺与品牌',markets:['CN'],continent:'Asia'},
  {id:'pchome',name:'PChome',description:'台湾消费电子与零售商品',markets:['TW'],continent:'Asia'},
  {id:'momo',name:'momo购物网',description:'台湾电商商品与品牌',markets:['TW'],continent:'Asia'},
  {id:'hktdc',name:'香港贸发局商贸平台',description:'香港贸易企业与供应商目录',markets:['HK'],continent:'Asia'},
  {id:'yellowpages-sg',name:'Yellow Pages Singapore',description:'新加坡企业黄页',markets:['SG'],continent:'Asia'},
  {id:'carousell',name:'Carousell',description:'新加坡及东南亚商品与商家',markets:['SG','MY','HK','TW'],continent:'Asia'},
  {id:'lazada-sea',name:'Lazada',description:'东南亚商品、店铺与卖家',markets:['SG','MY','TH','ID','PH','VN'],continent:'Asia'},
  {id:'shopee-sea',name:'Shopee',description:'东南亚商品、卖家与评价',markets:['SG','MY','TH','ID','PH','VN','TW'],continent:'Asia'},
  {id:'tokopedia',name:'Tokopedia',description:'印尼商品与卖家',markets:['ID'],continent:'Asia'},
  {id:'yellowpages-au',name:'Yellow Pages Australia',description:'澳大利亚企业黄页',markets:['AU'],continent:'Oceania'},
  {id:'truelocal',name:'True Local',description:'澳大利亚本地企业目录',markets:['AU'],continent:'Oceania'},
  {id:'seek-au',name:'SEEK',description:'澳大利亚与新西兰招聘企业与职位',markets:['AU','NZ'],continent:'Oceania'},
  {id:'trade-me',name:'Trade Me',description:'新西兰商品、商家与分类市场',markets:['NZ'],continent:'Oceania'},
  {id:'finda',name:'Finda',description:'新西兰本地企业目录',markets:['NZ'],continent:'Oceania'},
];

const defaults: Record<string, string[]> = {
  DE: ['wlw','gelbe-seiten','das-oertliche','europages','google-maps','linkedin'],
  AT: ['wlw','europages','kompass','google-maps','linkedin'],
  CH: ['wlw','europages','kompass','google-maps','linkedin'],
  GB: ['yell-uk','companies-house','europages','google-maps','linkedin'],
  FR: ['pages-jaunes','europages','kompass','google-maps','linkedin'],
  IT: ['pagine-gialle','europages','kompass','google-maps','linkedin'],
  ES: ['paginas-amarillas-es','europages','kompass','google-maps','linkedin'],
  US: ['thomasnet','macraes','yellowpages-us','google-maps','linkedin'],
  CA: ['thomasnet','yellowpages-ca','yelp-local','google-maps','linkedin'],
  AE: ['yellowpages-ae','dubizzle','google-maps','linkedin'],
  SA: ['yellowpages-sa','dubizzle','google-maps','linkedin'],
  ZA: ['braby','yellowpages-za','google-maps','linkedin'],
  IN: ['indiamart','tradeindia','justdial','google-maps','linkedin'],
  AU: ['yellowpages-au','truelocal','seek-au','google-maps','linkedin'],
  BR: ['mercado-br','telelistas','google-maps','linkedin'],
  MX: ['section-amarilla-mx','google-maps','linkedin'],
  JP: ['rakuten-jp','yahoo-japan','townpage','google-maps','linkedin'],
  KR: ['naver','coupang','google-maps','linkedin'],
  CN: ['1688','jd','taobao','google-maps'],
  TW: ['pchome','momo','carousell','google-maps'],
  SG: ['yellowpages-sg','carousell','lazada-sea','shopee-sea','google-maps'],
  NZ: ['trade-me','finda','seek-au','google-maps'],
};
const recommendedFor = (code: string) => defaults[code] ?? ['google-maps','linkedin','shopify','europages','kompass'];
const regionalCategory = (source: RegionalSource) => {
  const id = source.id.toLowerCase();
  if (/amazon|ebay|mercado|marktplaats|allegro|coupang|rakuten|1688|jd|taobao|pchome|momo|carousell|lazada|shopee|tokopedia|trade-me|yapo|jiji/.test(id)) return '电商、零售与商品市场';
  if (/seek|naukri|xing/.test(id)) return '招聘、人才与企业扩张信号';
  if (/companies-house|kvk/.test(id)) return '企业、投融资与产品创新';
  if (/naver|yahoo/.test(id)) return '搜索引擎与网页发现';
  if (/bbb|yelp/.test(id)) return '评价、口碑与消费者反馈';
  if (/thomasnet|macraes|europages|kompass|wlw|yellow|gelbe|das-oertliche|11880|section|telelistas|braby|vconnect|justdial|hitta|truelocal|finda|townpage|hktdc/.test(id)) return '企业名录与本地商业目录';
  return '企业名录与本地商业目录';
};
const allPlatforms: Array<Source & { category: string; global: boolean }> = [
  ...preservedGroups.flatMap(group => group.sources.map(source => ({ ...source, category: '全球通用与全域穿透渠道', global: true }))),
  ...globalCatalog.flatMap(group => group.sources.map(source => ({ ...source, category: group.title, global: true }))),
  ...regionalSources.map(source => ({ ...source, category: regionalCategory(source), global: false })),
];

type PlatformExecutionStatus = 'connected' | 'verify' | 'actor' | 'unavailable';
const getPlatformExecutionStatus = (id: string): PlatformExecutionStatus => {
  if (id === 'google-maps') return 'connected';
  if (id === 'facebook' || id === 'instagram' || id === 'google-search') return 'verify';
  return 'actor';
};
const isRunnablePlatform = (id: string) => allPlatforms.some(source => source.id === id);
const platformStatusLabels: Record<PlatformExecutionStatus, string> = {
  connected: '执行链已接入',
  verify: '需验证连接 / 凭证',
  actor: '需通过数据源质量门禁',
  unavailable: '尚未接入执行器',
};

export function PlatformSelectionStep({
  onSelectionCountChange, selectedIds, onSelectionChange,
}: {

  onSelectionCountChange: (count: number) => void;
  selectedIds?: string[]; onSelectionChange?: (sources: Array<{ id: string; name: string; category?: string }>) => void;
}) {
  const recommended = useMemo(() => recommendedFor('').filter(isRunnablePlatform), []);
  const [selected, setSelected] = useState<string[]>(() => selectedIds !== undefined ? selectedIds.filter(isRunnablePlatform) : []);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPlatformPageSize);
  const [selectionWarning, setSelectionWarning] = useState('');
  const maxSelectedSources = 20;


  useEffect(() => { onSelectionCountChange(selected.length); onSelectionChange?.(allPlatforms.filter(source => selected.includes(source.id)).map(source => ({ id: source.id, name: source.name, category: source.category }))); }, [selected, onSelectionCountChange, onSelectionChange]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase();
    return allPlatforms.filter(source => {
      const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(source.category);
      const searchMatch = !term || source.name.toLocaleLowerCase().includes(term)
        || source.description.toLocaleLowerCase().includes(term)
        || source.category.toLocaleLowerCase().includes(term);
      return categoryMatch && searchMatch;
    }).sort((a, b) => Number(recommended.includes(b.id)) - Number(recommended.includes(a.id)) || a.name.localeCompare(b.name));
  }, [recommended, searchTerm, selectedCategories]);

  useEffect(() => { setPage(1); }, [searchTerm, selectedCategories, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePlatforms = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visibleIds = visiblePlatforms.filter(source => isRunnablePlatform(source.id)).map(source => source.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const selectedOnPage = visibleIds.filter(id => selected.includes(id)).length;
  const toggle = (id: string) => {
    if (!isRunnablePlatform(id)) return;
    setSelected(current => {
      if (current.includes(id)) return current.filter(value => value !== id);
      if (current.length >= maxSelectedSources) { setSelectionWarning('每次方案最多选择 ' + maxSelectedSources + ' 个平台，请分批执行。'); return current; }
      setSelectionWarning('');
      return [...current, id];
    });
  };
  const togglePage = () => setSelected(current => {
    if (allVisibleSelected) return current.filter(id => !visibleIds.includes(id));
    const additions = visibleIds.filter(id => !current.includes(id));
    const remaining = Math.max(0, maxSelectedSources - current.length);
    if (additions.length > remaining) setSelectionWarning('本页还有 ' + (additions.length - remaining) + ' 个平台未选中；每次方案最多选择 ' + maxSelectedSources + ' 个。');
    else setSelectionWarning('');
    return [...current, ...additions.slice(0, remaining)];
  });
  const selectAllFiltered = () => setSelected(current => {
    const additions = filtered.filter(source => isRunnablePlatform(source.id) && !current.includes(source.id)).map(source => source.id);
    const remaining = Math.max(0, maxSelectedSources - current.length);
    if (additions.length > remaining) setSelectionWarning('已达到本次方案上限，未选中的平台可在下一批任务中选择。');
    else setSelectionWarning('');
    return [...current, ...additions.slice(0, remaining)];
  });
  const clearAllFiltered = () => {
    const filteredIds = new Set(filtered.map(source => source.id));
    setSelected(current => current.filter(id => !filteredIds.has(id)));
    setSelectionWarning('');
  };
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategories([]);
  };

  return <section className="tp-prospect-discovery__step tp-prospect-discovery__step-two">
    <section className="tp-prospect-discovery__platform-browser">
      <div className="tp-prospect-discovery__platform-browser-heading">
        <div><h3>全球平台筛选与选择</h3><p>同一筛选维度内为“或”关系，不同维度之间为“且”关系。</p>
        </div>
        <Tag type="blue">{allPlatforms.length} 个平台</Tag>
      </div>
      <div className="tp-prospect-discovery__platform-filters">
        <div className="tp-prospect-discovery__platform-search">
          <Search id="platform-catalog-search" labelText="搜索平台" placeholder="搜索平台名称或描述" size="lg" value={searchTerm} onChange={(event) => setSearchTerm(event.currentTarget.value)} />
        </div>
        <div className="tp-prospect-discovery__platform-filter">
          <MultiSelect id="platform-category-filter" titleText="平台分类" label="全部分类" items={categoryLabels} itemToString={(item) => item ?? ''} selectedItems={selectedCategories} onChange={({ selectedItems }) => setSelectedCategories(selectedItems ?? [])} />
        </div>
      </div>

      <div className="tp-prospect-discovery__platform-toolbar">
        <div className="tp-prospect-discovery__platform-result-meta">
          <strong>{filtered.length}</strong><span>个匹配平台</span>
          <span className="tp-prospect-discovery__platform-selection-meta">已选 {selected.length} 个</span>
          {selectedOnPage > 0 && <span>本页已选 {selectedOnPage} 个</span>}
        </div>
        <div className="tp-prospect-discovery__platform-actions">
          <Button kind="ghost" size="sm" onClick={clearFilters}>清除筛选</Button>
          <Button kind="ghost" size="sm" onClick={togglePage} disabled={visiblePlatforms.length === 0}>{allVisibleSelected ? '取消本页选择' : '选择本页'}</Button>
          <Button kind="ghost" size="sm" onClick={selectAllFiltered} disabled={filtered.length === 0}>全选筛选结果</Button>
          <Button kind="ghost" size="sm" onClick={clearAllFiltered} disabled={filtered.length === 0}>取消筛选结果</Button>
        </div>
      </div>

      {selectionWarning && <div className="tp-prospect-discovery__selection-warning"><Tag type="red">选择上限</Tag><span>{selectionWarning}</span></div>}

      <div className="tp-prospect-discovery__platform-list" aria-live="polite">
        {visiblePlatforms.map(source => {
          const checked = selected.includes(source.id);
          const isRecommended = recommended.includes(source.id);
          return <div className={'tp-prospect-discovery__platform-row' + (checked ? ' is-selected' : '')} key={source.id}>
            <Checkbox id={'tp-platform-' + source.id} labelText={source.name} hideLabel checked={checked} disabled={!isRunnablePlatform(source.id)} onChange={() => toggle(source.id)} />
            <div className="tp-prospect-discovery__platform-copy">
              <div className="tp-prospect-discovery__platform-name">
                <span className={`tp-prospect-discovery__platform-status is-${getPlatformExecutionStatus(source.id)}`} role="img" aria-label={platformStatusLabels[getPlatformExecutionStatus(source.id)]} title={platformStatusLabels[getPlatformExecutionStatus(source.id)]}><i aria-hidden="true" /></span>
                <strong>{source.name}</strong>{isRecommended && <Tag type="green">智能推荐</Tag>}{source.global && <Tag type="blue">全球通用</Tag>}
              </div>
              <p>{source.description}</p>
            </div>
            <div className="tp-prospect-discovery__platform-classification"><Tag type="gray">{source.category}</Tag></div>
          </div>;
        })}
        {visiblePlatforms.length === 0 && <div className="tp-prospect-discovery__platform-empty"><strong>没有找到符合条件的平台</strong><p>请调整大洲、国家、分类或关键词筛选条件。</p><Button kind="ghost" onClick={clearFilters}>清除筛选条件</Button></div>}
      </div>

      <div className="tp-prospect-discovery__platform-pagination">
        <Pagination id="platform-catalog-pagination" page={page} pageSize={pageSize} pageSizes={platformPageSizes} totalItems={filtered.length} onChange={({ page: nextPage, pageSize: nextPageSize }) => { setPage(nextPage); setPageSize(nextPageSize); }} />
        <span>每页显示 {pageSize} 条 · 共 {pageCount} 页</span>
      </div>
    </section>

    <div className="tp-prospect-discovery__source-selection-note">
      <span>已选择 {selected.length} 个平台；每次方案最多 20 个。未通过数据源质量门禁的来源不会启动正式采集。</span>
      <Button kind="secondary" onClick={() => setSelected(recommended)} disabled={!countryCode}>恢复当前市场智能推荐</Button>
    </div>
  </section>;
}
