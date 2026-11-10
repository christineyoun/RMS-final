// RMS_MI_POTATO_CATEGORY_V5: original-publisher potato category, verified downstream.
import {discoverWideNews} from './freeWideNewsDiscovery.ts';
import {discoverPotatoMarketCategory} from './potatoMarketCategoryDiscovery.ts';
import {discoverPotatoStarchTag} from './potatoStarchTagDiscovery.ts';
import {discoverPotatoSpecialistNews} from './potatoStarchSpecialistDiscovery.ts';
import {prioritizePotatoStarchCandidates} from './potatoStarchCandidatePriority.ts';
import {materialMarketHeadline} from './newsCandidateQuality.ts';
/** Bounded candidate discovery from publishers already supported by RMS.
 * Feed metadata is never publication approval. Original articles must verify. */
import {load} from 'cheerio';
import {CORN_PUBLIC_SOURCES,cornCivilDate} from './cornVerifiedNews.ts';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';
const crops:Record<string,RegExp>={
 wheat:/\bwheat\b/i,
 corn:/\bcorn\b|\bmaize\b/i,
 soybean:/\bsoybeans?\b/i,
 'soybean-oil':/soybean oil|soyoil|soya oil/i,'palm-oil':/palm oil|palm olein|\bCPO\b/i,
 sugar:/sugar|sugarcane/i,'potato-starch':/potato.*starch|starch.*potato|potato.*process/i,
 'tapioca-starch':/tapioca|cassava/i,
};
export function parseAdditionalFeed(xml:string,id:string,source:{url:string;host:string;publisher:string;sourceType:string},now=new Date()):RetrievedSourceMetadata[]{
 const $=load(xml,{xmlMode:true}),out:RetrievedSourceMetadata[]=[];if(!crops[id])return out;
 $('item,entry').slice(0,100).each((i,node)=>{
  const n=$(node),title=n.children('title').text().trim(),link=n.children('link').text().trim()||n.children('link').attr('href')||'';
  const date=cornCivilDate(n.children('pubDate,published,updated').first().text());
  try{const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.replace(/^www\./,'')!==source.host||u.pathname==='/'||!(crops[id].test(title)||(crops[id].test(n.children('description,summary').first().text().slice(0,400))&&/\b(?:prices?|stocks?|exports?|imports?|supply|demand|output|production|harvest|crush|trade|shortage|tariff|biofuels?|shipping|freight)\b/i.test(title)))||!date||Date.parse(date)>+now||+now-Date.parse(date)>30*86400000)return;
   out.push({rawId:id+'-feed-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,publishedAt:date,sourceName:source.publisher,sourceType:source.sourceType as any,retrievedAt:now.toISOString()});
  }catch{}
 });return out.slice(0,12);
}

// Publisher topic-specific feeds are discovered from the live RSS directory.
// RSS metadata is NOT approved publication evidence.
const worldTopics:Record<string,string[]>={
 wheat:['wheat','Trade','Drought'],
 corn:['corn','ethanol','Trade'],
 soybean:['soybean','Oilseed Crushing','Trade'],
 'soybean-oil':['soybean','Oilseed Crushing','biofuels'],
 'palm-oil':['oilseeds','biofuels','Trade'],
 sugar:['Trade','biofuels'],
 'potato-starch':['grain processing','Trade'],
 'tapioca-starch':['grain processing','Trade']
};

let rssIndex:{
 until:number;
 feeds:Array<{label:string;url:string}>
}|null=null;

async function topicSources(id:string,fetcher:typeof fetch){
 try{
  if(!rssIndex||Date.now()>rssIndex.until){
   const r=await fetcher('https://www.world-grain.com/rss',{
    redirect:'error',signal:AbortSignal.timeout(9000)
   });
   if(!r.ok)throw Error('RSS directory inaccessible');

   const html=await r.text();
   if(html.length>1_000_000)throw Error('Oversized RSS directory');

   const $=load(html);
   const feeds:Array<{label:string;url:string}>=[];

   $('a[href]').each((_,n)=>{
    try{
     const u=new URL(
      $(n).attr('href')||'',
      'https://www.world-grain.com'
     );
     if(
      u.protocol==='https:' &&
      u.hostname.replace(/^www\./,'')==='world-grain.com' &&
      /^\/rss\/topic\/\d+-[a-z\d-]+$/i.test(u.pathname)
     ){
      feeds.push({
       label:$(n).text().trim().toLowerCase(),
       url:u.href
      });
     }
    }catch{}
   });

   rssIndex={until:Date.now()+3600000,feeds};
  }

  const labels=new Set(
   (worldTopics[id]||[]).map(s=>s.toLowerCase())
  );

  return rssIndex.feeds
   .filter(x=>labels.has(x.label))
   .slice(0,3)
   .map(x=>({
    url:x.url,
    host:'world-grain.com',
    publisher:'World Grain',
    sourceType:'news'
   }));
 }catch{
  return [];
 }
}


// The index can suggest URLs but NEVER approves an article as factual evidence.
// Only first-party MPOC media releases are indexed; its syndicated news is excluded.
export function parseIndustryIndex(html:string,id:string,now=new Date()):RetrievedSourceMetadata[]{
 const settings=id==='palm-oil'
  ?{base:'https://www.mpoc.org.my/category/media-releases/',host:'mpoc.org.my',selector:'h2 a[href]',publisher:'MPOC'}
  :id==='potato-starch'
  ?{base:'https://www.potatopro.com/topics/potato-starch/europe',host:'potatopro.com',selector:'a[href*="/news/"]',publisher:'PotatoPro'}
  :null;
 if(!settings)return [];
 const $=load(html),out:RetrievedSourceMetadata[]=[];
 // The publisher can render publication dates as siblings of the article links.
 // Read only a short adjacent text window; this remains metadata, not approval.
 const pageText=$('body').text().replace(/\s+/g,' ').trim();
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const mon='January|February|March|April|May|June|July|August|September|October|November|December';
 function getDate(text:string):string|null{
  const dayFirst=new RegExp('\\b([0-3]?\\d)\\s+('+mon+')\\s+(20\\d{2})\\b','i').exec(text);
  const monFirst=new RegExp('\\b('+mon+')\\s+([0-3]?\\d),?\\s+(20\\d{2})\\b','i').exec(text);
  const m=dayFirst||monFirst;
  if(!m)return null;
  const day=Number(dayFirst?m[1]:m[2]);
  const month=months.indexOf((dayFirst?m[2]:m[1]).toLowerCase());
  const year=Number(m[3]);
  const dt=new Date(Date.UTC(year,month,day,12));
  if(dt.getUTCFullYear()!==year||dt.getUTCMonth()!==month||dt.getUTCDate()!==day)return null;
  if(dt.getTime()>now.getTime()+86400000||now.getTime()-dt.getTime()>30*86400000)return null;
  return dt.toISOString().slice(0,10);
 }
 $(settings.selector).slice(0,100).each((i,el)=>{
  try{
   const u=new URL($(el).attr('href')||'',settings.base);
   if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.replace(/^www\./,'')!==settings.host)return;
   if(id==='potato-starch'&&!/^\/news\/20\d{2}\/[^/]+\/?$/.test(u.pathname))return;
   if(id==='palm-oil'&&u.pathname==='/'||u.pathname.includes('/category/'))return;
   const title=($(el).text()||$(el).attr('title')||$(el).attr('aria-label')||$(el).find('img[alt]').first().attr('alt')||'').replace(/\s+/g,' ').trim();
   if(title.length<18||title.length>300)return;
   if(id==='palm-oil'&&!/palm oil|\bCPO\b|palm trade|palm exports/i.test(title))return;
   if(id==='potato-starch'&&!/potato.*starch|starch.*potato|starch capacity|starch production/i.test(title))return;
   let node=$(el),publishedAt:null|string=null;
   for(let depth=0;depth<6;depth++){
    node=node.parent();
    if(!node.length)break;
    const text=node.text().replace(/\s+/g,' ').trim();
    if(text.length>2200)break;
    // A broad archive container can hold dates for several different links.
    // Never attach one article's date to a neighboring article.
    if(id==='potato-starch'){
     // A single publisher card may link to its article twice (overlay + heading).
     // Stop only when this container includes DIFFERENT article URLs, so
     // an adjacent card's date cannot be borrowed.
     const urls=new Set(node.find(settings.selector).map((_,link)=>{
      try{return new URL($(link).attr('href')||'',settings.base).pathname;}
      catch{return '';}
     }).get().filter(Boolean));
     if(urls.size>1)break;
    }
    publishedAt=getDate(text);
    if(publishedAt)break;
   }
   if(!publishedAt && id==='potato-starch'){
    // Some indexes put dates immediately BEFORE the headline, as siblings.
    // Bound the search at the preceding article title, never read dates
    // AFTER this title: they may belong to the next article instead.
    const at=pageText.indexOf(title);
    if(at>=0){
     let start=Math.max(0,at-90);
     $(settings.selector).each((_,other)=>{
      if(other===el)return;
      const otherTitle=$(other).text().replace(/\s+/g,' ').trim();
      if(!otherTitle)return;
      const pos=pageText.lastIndexOf(otherTitle,at-1);
      if(pos>=0&&pos<at)start=Math.max(start,pos+otherTitle.length);
     });
     publishedAt=getDate(pageText.slice(start,at));
    }
   }
   if(!publishedAt)return;
   out.push({rawId:id+'-index-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,publishedAt,sourceName:settings.publisher,sourceType:'news',retrievedAt:now.toISOString()});
  }catch{}
 });
 return [...new Map(out.map(x=>[x.originalUrl,x])).values()]
  .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,8);
}

async function discoverExistingPublisherNews(id:string,fetcher=fetch){
 const specialized=id==='sugar'
   ?[{url:'https://www.chinimandi.com/feed/',host:'chinimandi.com',publisher:'ChiniMandi',sourceType:'news'}]
   :id==='potato-starch'
   ?[{url:'https://www.potatopro.com/rss-ingredients',host:'potatopro.com',publisher:'PotatoPro',sourceType:'news'},{url:'https://www.potatopro.com/rss-potato-supply-chain',host:'potatopro.com',publisher:'PotatoPro',sourceType:'news'}]
   :[];
 // RMS_MI_POTATO_ORIGINAL_FEED_V4: recent direct industry market reporting.
 const potatoIndustryFeeds=id==='potato-starch'?[{
  url:'https://potatoes.news/tag/potato-prices/feed/',host:'potatoes.news',publisher:'Potatoes.News',sourceType:'news'
 },{
  url:'https://potatoes.news/feed/',host:'potatoes.news',publisher:'Potatoes.News',sourceType:'news'
 }]:[];
 const sources=[...potatoIndustryFeeds,...specialized,...CORN_PUBLIC_SOURCES.filter(s=>s.kind==='rss').slice(0,3),...(await topicSources(id,fetcher))].slice(0,8),candidates:RetrievedSourceMetadata[]=[],errors:string[]=[];
 const batches=await Promise.all(sources.map(async source=>{try{
  const r=await fetcher(source.url,{redirect:'error',signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('HTTP '+r.status);
  const text=await r.text();if(text.length>1000000)throw Error('Feed too large');return parseAdditionalFeed(text,id,source);
 }catch{errors.push(source.publisher+': feed unavailable');return [];}}));
 for(const batch of batches)candidates.push(...batch);
 // Specialized first-party/industry article indexes; candidates still require inspection.
 const indexUrls=id==='palm-oil'?['https://www.mpoc.org.my/category/media-releases/']
  :id==='potato-starch'?['https://www.potatopro.com/topics/potato-starch',
                        'https://www.potatopro.com/topics/potato-starch/europe']:[];
 // Both global and regional publisher indexes are dynamic. An index only
 // supplies original-article URL hints, never an approved Korean news card.
 for(const indexUrl of indexUrls)try{
  const r=await fetcher(indexUrl,{redirect:'error',signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  const html=await r.text();
  if(html.length>1_500_000)throw Error('Index too large');
  candidates.push(...parseIndustryIndex(html,id));
 }catch{errors.push(id+': specialized index unavailable');}
 if(id==='tapioca-starch')try{
  const index='https://tqindustry.com/en/news/';
  const r=await fetcher(index,{redirect:'error',signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  const html=await r.text();
  if(html.length>1000000)throw Error('Index too large');
  const $=load(html);
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  $('a[href]').each((i,el)=>{try{
   const title=$(el).text().replace(/\s+/g,' ').trim();
   if(!/tapioca|cassava/i.test(title)||!/price|market|root|starch/i.test(title))return;
   const url=new URL($(el).attr('href')||'',index);
   if(url.protocol!=='https:'||url.hostname!=='tqindustry.com'||!/^\/en\/news\/[^/]+\/?$/.test(url.pathname)||url.username||url.password||url.port)return;
   const hit=title.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
   if(!hit)return;
   const mm=months.indexOf(hit[2].toLowerCase())+1;
   const iso=hit[3]+'-'+String(mm).padStart(2,'0')+'-'+hit[1].padStart(2,'0');
   const age=Date.now()-Date.parse(iso+'T00:00:00Z');
   if(!Number.isFinite(age)||age>30*86400000||age< -86400000)return;
   candidates.push({
    rawId:'tapioca-index-'+i,
    rawTitle:title.slice(0,200),
    rawSnippet:'',
    originalUrl:url.href,
    publishedAt:iso,
    sourceName:'TQ Industry Starch',
    sourceType:'company',
    retrievedAt:new Date().toISOString()
   });
  }catch{}});
 }catch{errors.push('TQ Industry Starch: index unavailable');}
 if(id==='tapioca-starch')try{
  const r=await fetcher('https://vietbacagroimex.com/en/news',{redirect:'error',signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  const html=await r.text();
  if(html.length>1_500_000)throw Error('Index too large');
  candidates.push(...parseVietBacMarketIndex(html));
 }catch{errors.push('Viet Bac Agro Imex: index unavailable');}
 return {candidates:[...new Map(candidates.map(c=>[c.originalUrl,c])).values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,12),errors};
}


/** Publisher-index candidates only; original pages require verification. */
export function parseVietBacMarketIndex(html:string,now=new Date()):RetrievedSourceMetadata[]{
 const $=load(html),out:RetrievedSourceMetadata[]=[];
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 $('a[href]').each((i,el)=>{
  try{
   const u=new URL($(el).attr('href')||'','https://vietbacagroimex.com/en/news');
   if(u.protocol!=='https:'||u.hostname!=='vietbacagroimex.com'||u.username||u.password||u.port||
      !/^\/en\/posts\/[a-z0-9-]+\/?$/.test(u.pathname))return;
   const title=$(el).text().replace(/\s+/g,' ').trim();
   if(title.length<18||title.length>220||!/(?:cassava|tapioca)/i.test(title)||
      !/(?:market|prices?|pricing|bulletin|supply|demand|trade|report)/i.test(title)||
      /(?:accepting|orders?|sales?|supplier|products?\s+for\s+sale|export\s+partners?)/i.test(title))return;
   const found=/(january|february|march|april|may|june|july|august|september|october|november|december)[-\s]+([0-3]?\d)[,-\s]+(20\d{2})/i.exec(title+' '+u.pathname);
   let day='',month=-1,year='';
   if(found){day=found[2];month=months.indexOf(found[1].toLowerCase());year=found[3];}
   else{
    let node=$(el),match:RegExpExecArray|null=null;
    for(let depth=0;depth<4;depth++){
     node=node.parent();if(!node.length)break;
     match=/\b([0-3]?\d)\/([01]?\d)\/(20\d{2})\b/.exec(node.text().replace(/\s+/g,' ').slice(0,500));
     if(match)break;
    }
    if(!match)return;
    day=match[1];month=Number(match[2])-1;year=match[3];
   }
   const date=new Date(Date.UTC(Number(year),month,Number(day),12));
   if(date.getUTCFullYear()!==Number(year)||date.getUTCMonth()!==month||date.getUTCDate()!==Number(day)||
      date.getTime()>now.getTime()+86400000||now.getTime()-date.getTime()>30*86400000)return;
   out.push({rawId:'vietbac-index-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,
     publishedAt:date.toISOString().slice(0,10),sourceName:'Viet Bac Agro Imex',sourceType:'company',retrievedAt:now.toISOString()});
  }catch{}
 });
 return [...new Map(out.map(a=>[a.originalUrl,a])).values()]
   .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,6);
}

// RMS_SHARED_WIDE_DISCOVERY_V1
export async function discoverAdditionalNews(id:string,fetcher:typeof fetch=fetch){
  // A free search index adds original URLs; existing source rules still decide approval.
  const [existing,wide,potatoMarket,starchTag,specialist]=await Promise.all([
    discoverExistingPublisherNews(id,fetcher),
    discoverWideNews(id,fetcher),
    id==='potato-starch' ? discoverPotatoMarketCategory(fetcher) : Promise.resolve({candidates:[],errors:[]}),
    id==='potato-starch' ? discoverPotatoStarchTag(fetcher) : Promise.resolve({candidates:[],errors:[]}),
    id==='potato-starch' ? discoverPotatoSpecialistNews(fetcher) : Promise.resolve({candidates:[],errors:[]})
  ]);
  const seen=new Set<string>();
  const merged=[...specialist.candidates,...potatoMarket.candidates,...starchTag.candidates,...wide.candidates,...existing.candidates]
    .filter(a=>{
      if(!materialMarketHeadline(a.rawTitle))return false;
      const url=a.originalUrl.replace(/\/$/,'');
      if(seen.has(url))return false;
      seen.add(url);
      return true;
    })
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  const ranked=id==='potato-starch'?prioritizePotatoStarchCandidates(merged):merged;
  return {candidates:ranked.slice(0,32),errors:[...existing.errors,...wide.errors,...potatoMarket.errors,...starchTag.errors,...specialist.errors]};
}
