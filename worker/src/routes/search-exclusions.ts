import { errorResponse, successResponse } from "../lib/http";
interface Env { SUPABASE_URL:string; SUPABASE_ANON_KEY:string; SUPABASE_SERVICE_ROLE_KEY:string; }
export const DEFAULT_SEARCH_EXCLUSIONS = [
 {key:"ecommerce",label:"电商与购物平台 / E-commerce",domains:["amazon.com","amazon.co.uk","amazon.de","amazon.fr","amazon.co.jp","ebay.com","walmart.com","etsy.com","aliexpress.com","alibaba.com","1688.com","temu.com","shopee.com","lazada.com","taobao.com","tmall.com","jd.com","rakuten.co.jp","mercadolivre.com.br","mercadolibre.com","flipkart.com","otto.de","zalando.com","wayfair.com","bestbuy.com","target.com","newegg.com","shein.com","wish.com","coupang.com"]},
 {key:"social",label:"社交媒体与社群 / Social media",domains:["facebook.com","instagram.com","linkedin.com","x.com","twitter.com","pinterest.com","tiktok.com","threads.net","snapchat.com","vk.com","weibo.com","wechat.com","line.me","telegram.org","discord.com","mastodon.social","tumblr.com","flickr.com"]},
 {key:"video",label:"视频与直播平台 / Video & streaming",domains:["youtube.com","youtu.be","vimeo.com","dailymotion.com","twitch.tv","bilibili.com","youku.com","iqiyi.com","netflix.com","rumble.com","kick.com"]},
 {key:"directories",label:"企业目录与黄页 / Business directories",domains:["yellowpages.com","yelp.com","manta.com","kompass.com","europages.com","thomasnet.com","dnb.com","opencorporates.com","crunchbase.com","zoominfo.com","apollo.io","owler.com","buzzfile.com","mapquest.com","brownbook.net","hotfrog.com","cylex.com","192.com","scoot.co.uk","bbb.org","chamberofcommerce.com","bizapedia.com","datanyze.com","themanifest.com","clutch.co","goodfirms.co","g2.com","capterra.com","trustpilot.com","angi.com","homeadvisor.com"]},
 {key:"news",label:"新闻与媒体 / News & media",domains:["news.google.com","cnn.com","bbc.com","reuters.com","bloomberg.com","forbes.com","theguardian.com","nytimes.com","wsj.com","ft.com","cnbc.com","techcrunch.com","wired.com","engadget.com","theverge.com","digitaltrends.com","zdnet.com","gizmodo.com","medium.com","substack.com"]},
 {key:"forums",label:"论坛与问答 / Forums & Q&A",domains:["reddit.com","quora.com","stackexchange.com","stackoverflow.com","answers.yahoo.com","discourse.org","xda-developers.com","linustechtips.com","tomshardware.com"]},
 {key:"search_engines",label:"搜索引擎与搜索聚合 / Search engines",domains:["google.com","bing.com","yahoo.com","duckduckgo.com","baidu.com","yandex.com","ecosia.org","startpage.com","search.brave.com","ask.com","aol.com","naver.com","sogou.com","so.com"]},
 {key:"job_boards",label:"招聘与求职网站 / Job boards",domains:["indeed.com","glassdoor.com","monster.com","ziprecruiter.com","careerbuilder.com","simplyhired.com","jobsdb.com","seek.com.au","stepstone.com","reed.co.uk","totaljobs.com","jooble.org","talent.com","workable.com","lever.co","greenhouse.io"]},
 {key:"maps_reviews",label:"地图、点评与本地商户 / Maps & reviews",domains:["maps.google.com","yelp.com","tripadvisor.com","foursquare.com","here.com","waze.com","opentable.com","zomato.com","thefork.com"]},
 {key:"government",label:"政府、监管与公共机构 / Government",domains:["usa.gov","gov.uk","gov.au","canada.ca","europa.eu","who.int","wto.org","oecd.org","worldbank.org","un.org","data.gov","sec.gov","uspto.gov","epo.org","wipo.int"]},
 {key:"education",label:"教育、学术与研究机构 / Education",domains:["scholar.google.com","researchgate.net","academia.edu","jstor.org","springer.com","sciencedirect.com","wiley.com","tandfonline.com","ieee.org","arxiv.org","semanticscholar.org","openalex.org"]},
 {key:"software",label:"软件目录与应用商店 / Software catalogs",domains:["apps.apple.com","play.google.com","sourceforge.net","github.com","gitlab.com","bitbucket.org","producthunt.com","alternativeto.net","softonic.com","cnet.com","download.com"]},
 {key:"hosting",label:"托管、建站与域名服务 / Hosting & site builders",domains:["wixsite.com","wix.com","wordpress.com","blogspot.com","blogger.com","weebly.com","squarespace.com","webflow.io","shopify.com","myshopify.com","sites.google.com","notion.site","carrd.co","linktr.ee","godaddy.com","namecheap.com","cloudflarepages.com","pages.dev","vercel.app","netlify.app","github.io"]},
 {key:"classifieds",label:"分类信息与二手交易 / Classifieds",domains:["craigslist.org","olx.com","gumtree.com","locanto.com","kijiji.ca","leboncoin.fr","subito.it","marktplaats.nl","avito.ru","mercari.com"]},
 {key:"finance",label:"金融行情与投资信息 / Finance & investing",domains:["finance.yahoo.com","marketwatch.com","investing.com","tradingview.com","morningstar.com","seekingalpha.com","fool.com","stocktwits.com","coinmarketcap.com","coingecko.com","macrotrends.net"]},
 {key:"travel",label:"旅游、住宿与票务 / Travel & ticketing",domains:["booking.com","airbnb.com","expedia.com","trip.com","agoda.com","kayak.com","skyscanner.com","tripadvisor.com","viator.com","getyourguide.com","ticketmaster.com","eventbrite.com"]},
 {key:"aggregators",label:"价格比较与内容聚合 / Aggregators",domains:["pricerunner.com","idealo.com","shopzilla.com","bizrate.com","pricegrabber.com","nextag.com","kelkoo.com","shopmania.com","feedly.com"]},
 {key:"nonprofit",label:"非营利组织与百科 / Nonprofits & encyclopedias",domains:["wikipedia.org","wikimedia.org","charitynavigator.org","guidestar.org","globalgiving.org","give.org","change.org","gofundme.com"]},
 {key:"adult_gambling",label:"成人、博彩与非目标内容 / Adult & gambling",domains:["pornhub.com","xvideos.com","xnxx.com","onlyfans.com","chaturbate.com","bet365.com","draftkings.com","fanduel.com","pokerstars.com","stake.com","1xbet.com"]}
] as const;
async function userId(request:Request,env:Env):Promise<string|null>{
 const token=request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]; if(!token)return null;
 const res=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
 if(!res.ok)return null; const body=await res.json() as {id?:string}; return body.id??null;
}
async function db<T>(env:Env,path:string,init?:RequestInit):Promise<T>{
 const res=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...init?.headers}});
 const raw=await res.text(); if(!res.ok)throw new Error("DATABASE_"+res.status+": "+raw.slice(0,250)); return raw?JSON.parse(raw) as T:undefined as T;
}
function normalizeDomain(input:string):string|null{
 const raw=input.trim().toLowerCase(); if(!raw)return null;
 try{const u=new URL(raw.includes("://")?raw:"https://"+raw);if(!u.hostname||!u.hostname.includes("."))return null;return u.hostname.replace(/^www\./,"")+(u.pathname==="/"?"":u.pathname.replace(/\/$/,""));}catch{return null;}
}
export async function handleSearchExclusions(request:Request,env:Env):Promise<Response>{
 const path=new URL(request.url).pathname; if(path!=="/api/v1/settings/search-exclusions")return errorResponse(request,"NOT_FOUND","搜索排除规则接口不存在。",404);
 const owner=await userId(request,env); if(!owner)return errorResponse(request,"UNAUTHORIZED","请先登录后管理搜索排除规则。",401);
 if(request.method==="GET"){
  const rows=await db<Array<{category_key:string;category_label:string;domains:string[];enabled:boolean}>>(env,"search_exclusion_rules?owner_id=eq."+owner+"&select=category_key,category_label,domains,enabled");
  const saved=new Map((rows??[]).map(row=>[row.category_key,row]));
  return successResponse(request,DEFAULT_SEARCH_EXCLUSIONS.map(item=>{const row=saved.get(item.key);return {key:item.key,label:row?.category_label??item.label,domains:row?.domains??[...item.domains],enabled:row?.enabled??true};}));
 }
 if(request.method==="PUT"){
  let body:{categories?:Array<{key:string;label:string;domains:string[];enabled:boolean}>};try{body=await request.json() as typeof body;}catch{return errorResponse(request,"INVALID_JSON","请求内容格式不正确。",400);}
  if(!Array.isArray(body.categories)||body.categories.length!==DEFAULT_SEARCH_EXCLUSIONS.length)return errorResponse(request,"VALIDATION_ERROR","排除分类数据不完整。",400);
  const allowed=new Set<string>(DEFAULT_SEARCH_EXCLUSIONS.map(item=>item.key));
  const rows=body.categories.map(item=>{
   if(!item||!allowed.has(item.key)||typeof item.label!=="string"||item.label.trim().length<1||item.label.length>80||typeof item.enabled!=="boolean"||!Array.isArray(item.domains)||item.domains.length>300)throw new Error("INVALID_CATEGORY");
   const domains=[...new Set(item.domains.map(normalizeDomain).filter((v):v is string=>Boolean(v)))];
   if(domains.length!==item.domains.filter(v=>String(v).trim()).length)throw new Error("INVALID_DOMAIN");
   return {owner_id:owner,category_key:item.key,category_label:item.label.trim(),domains,enabled:item.enabled,updated_at:new Date().toISOString()};
  });
  const saved=await db(env,"search_exclusion_rules?on_conflict=owner_id,category_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(rows)});
  return successResponse(request,{saved:true,categories:(saved as Array<Record<string,unknown>>|undefined)??rows});
 }
 return errorResponse(request,"METHOD_NOT_ALLOWED","不支持的请求方式。",405);
}
