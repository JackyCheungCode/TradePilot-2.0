import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionItem, Button, Checkbox, Tag, CarbonIcons } from '@/design-system';

type Country = { name: { common: string }; cca2: string; region: string };
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
const continentOrder = ['Americas','Europe','Asia','Africa','Oceania'];

export function PlatformSelectionStep({
  countryCode, countryName, continentLabel, countries, onChangeCountry, onSelectionCountChange,
}: {
  countryCode: string; countryName: string; continentLabel: string; countries: Country[];
  onChangeCountry: () => void; onSelectionCountChange: (count: number) => void;
}) {
  const recommended = useMemo(() => recommendedFor(countryCode), [countryCode]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected(recommended); }, [countryCode]);
  useEffect(() => { onSelectionCountChange(selected.length); }, [selected, onSelectionCountChange]);
  const availableCount = regionalSources.filter(source => source.markets.includes('*') || source.markets.includes(countryCode)).length
    + globalCatalog.reduce((count, group) => count + group.sources.length, 0);
  const orderedCountries = useMemo(() => [...countries].sort((a,b) => {
    if (a.cca2 === countryCode) return -1;
    if (b.cca2 === countryCode) return 1;
    return a.name.common.localeCompare(b.name.common);
  }), [countries, countryCode]);
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const renderCards = (sources: Source[]) => (
    <div className="tp-prospect-discovery__source-grid">
      {sources.map(source => {
        const checked = selected.includes(source.id);
        const isRecommended = recommended.includes(source.id);
        return <div className={'tp-prospect-discovery__source-card' + (checked ? ' is-selected' : '')} key={source.id}>
          <div className="tp-prospect-discovery__source-card-top">
            <span className="tp-prospect-discovery__source-mark" aria-hidden="true">{source.name.split(/[ /]/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span>
            <div className="tp-prospect-discovery__source-copy"><strong>{source.name}</strong>{isRecommended && <Tag type="green">智能推荐</Tag>}</div>
            <Checkbox id={'tp-source-' + source.id} labelText={source.name + '，选择数据源'} hideLabel checked={checked} onChange={() => toggle(source.id)} />
          </div>
          <p>{source.description}</p>
        </div>;
      })}
    </div>
  );
  return <section className="tp-prospect-discovery__step tp-prospect-discovery__step-two">
    <div className="tp-prospect-discovery__source-summary tp-prospect-discovery__source-summary-cards">
      <div className="tp-prospect-discovery__summary-card"><span>数据源</span><strong>{globalCatalog.reduce((n,g)=>n+g.sources.length,0)+regionalSources.length+preservedGroups[0].sources.length}</strong><small>目录收录平台</small></div>
      <div className="tp-prospect-discovery__summary-card"><span>智能推荐</span><strong>{recommended.length}</strong><small>匹配当前目标市场</small></div>
      <div className="tp-prospect-discovery__summary-card"><span>当前市场可用选择</span><strong>{availableCount}</strong><small>{countryName || '尚未选择国家'}</small></div>
    </div>

    <div className="tp-prospect-discovery__market-context">
      <span className="tp-prospect-discovery__market-pin"><CarbonIcons.Map size={20}/></span>
      <div className="tp-prospect-discovery__market-copy">
        <span>当前锁定的目标市场</span>
        <strong>{continentLabel || '尚未选择大洲'}{countryName ? ' → ' + countryName + ' (' + countryCode + ')' : ' → 尚未选择国家'}</strong>
        <p>完整平台目录始终开放浏览；当前国家的推荐平台优先标记。</p>
      </div>
      <Button kind="ghost" size="md" renderIcon={CarbonIcons.Edit} onClick={onChangeCountry}>更改国家</Button>
    </div>

    <div className="tp-prospect-discovery__source-matrix">
      {preservedGroups.map(group => <section className="tp-prospect-discovery__source-group" key={group.id}>
        <div className="tp-prospect-discovery__source-group-heading"><div><h3>{group.title}</h3><p>{group.description}</p></div><Tag type="teal">保持现有渠道</Tag></div>
        {renderCards(group.sources)}
      </section>)}
    </div>

    <section className="tp-prospect-discovery__catalog">
      <div className="tp-prospect-discovery__source-group-heading"><div><h3>全球平台目录</h3><p>按全球通用、大洲和国家浏览；所有目录默认可展开查看，当前市场置顶并突出显示。</p></div></div>
      <section className="tp-prospect-discovery__source-group">
        <div className="tp-prospect-discovery__source-group-heading"><div><h3>全球通用平台</h3><p>跨地区适用的搜索、社交、电商、评论、网站和商业情报平台。</p></div><Tag type="blue">全球</Tag></div>
        <Accordion>
          {globalCatalog.map(group => <AccordionItem key={group.id} title={group.title + ' · ' + group.sources.length + ' 个平台'}>
            <p className="tp-prospect-discovery__catalog-description">{group.description}</p>
            {renderCards(group.sources)}
          </AccordionItem>)}
        </Accordion>
      </section>

      {continentOrder.map(continent => {
        const continentCountries = orderedCountries.filter(country => country.region === continent);
        const continentSources = regionalSources.filter(source => source.continent === continent);
        return <section className={'tp-prospect-discovery__source-group' + (continentLabel.includes(continent) ? ' is-current-continent' : '')} key={continent}>
          <div className="tp-prospect-discovery__source-group-heading"><div><h3>{continent === 'Americas' ? '美洲' : continent === 'Europe' ? '欧洲' : continent === 'Asia' ? '亚洲' : continent === 'Africa' ? '非洲' : '大洋洲'}</h3><p>该区域的本土企业目录、电商、商业网络与行业平台。</p></div><Tag type={continentLabel.includes(continent) ? 'green' : 'gray'}>{continentCountries.length} 个国家</Tag></div>
          <Accordion>
            {continentCountries.map(country => {
              const countrySources = continentSources.filter(source => source.markets.includes('*') || source.markets.includes(country.cca2));
              const current = country.cca2 === countryCode;
              return <AccordionItem key={country.cca2} title={(current ? '当前市场 · ' : '') + country.name.common + ' (' + country.cca2 + ') · ' + countrySources.length + ' 个本土平台'}>
                {current && <p className="tp-prospect-discovery__current-market-note">当前目标国家 · 智能推荐平台已标记并优先选择</p>}
                {countrySources.length ? renderCards(countrySources) : <p className="tp-prospect-discovery__catalog-description">该国家暂未配置专属本土平台，可使用上方全球通用平台。</p>}
              </AccordionItem>;
            })}
          </Accordion>
        </section>;
      })}
    </section>
    <div className="tp-prospect-discovery__source-selection-note">
      <span>已选择 {selected.length} 个平台。此步骤仅配置选择，不启动任何采集任务。</span>
      <Button kind="secondary" onClick={() => setSelected(recommended)} disabled={!countryCode}>恢复当前市场智能推荐</Button>
    </div>
  </section>;
}
