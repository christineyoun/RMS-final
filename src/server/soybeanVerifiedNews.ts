/**
 * Soybean publisher-first news collection. Free public HTML/RSS only.
 * Candidate index/feed links are never trusted until the original article's
 * publisher, headline, publication date and soybean-specific market content
 * have been independently checked. No Gemini calls or snapshot writes here.
 */
import { load } from 'cheerio';
import { selectMarketEvidence } from './newsEvidenceQuality.ts';
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';

type Source={url:string;host:string;publisher:string;kind:'rss'|'index'|'outlook';sourceType:'news'|'official'};
export const SOYBEAN_PUBLIC_SOURCES:Source[]=[
  {url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',kind:'rss',sourceType:'news'},
  {url:'https://www.world-grain.com/rss/articles',host:'world-grain.com',publisher:'World Grain',kind:'rss',sourceType:'news'},
  {url:'https://www.graincentral.com/markets/feed/',host:'graincentral.com',publisher:'Grain Central',kind:'rss',sourceType:'news'},
  {url:'https://www.graincentral.com/markets/',host:'graincentral.com',publisher:'Grain Central',kind:'index',sourceType:'news'},
  {url:'https://www.world-grain.com/articles/topic/1350',host:'world-grain.com',publisher:'World Grain',kind:'index',sourceType:'news'},
  {url:'https://www.world-grain.com/articles/topic/1344-oilseeds',host:'world-grain.com',publisher:'World Grain',kind:'index',sourceType:'news'},
  {url:'https://www.world-grain.com/articles/topic/1349-soy',host:'world-grain.com',publisher:'World Grain',kind:'index',sourceType:'news'},
  {url:'https://commodity-board.com/category/soybeans-market-news-prices-global-supply-demand-outlook/',host:'commodity-board.com',publisher:'Commodity Board',kind:'index',sourceType:'news'},
  {url:'https://www.ers.usda.gov/topics/crops/soybeans-and-oil-crops/market-outlook',host:'ers.usda.gov',publisher:'USDA ERS',kind:'outlook',sourceType:'official'},
];
const hosts=new Set(SOYBEAN_PUBLIC_SOURCES.map(s=>s.host));
const strip=(s:unknown)=>String(s??'').replace(/\s+/g,' ').trim();
const normHost=(s:string)=>s.toLowerCase().replace(/^www\./,'');
const soybean=/(?:\bsoybeans?\b|\bsoyabeans?\b|\bsoya\s*beans?\b|\bsoya\b|大豆|대두)/i;
const market=/(?:\b(?:price|futures|harvest|planting|yield|production|crop|weather|crush|exports?|imports?|stocks?|supply|demand|trade|tariff|freight|shipment|outlook|forecast|basis|purchases?|sales|china|brazil|argentina|usd|bushel)\b)/i;
const irrelevant=/(?:job openings?|vacanc(?:y|ies)|careers?|recipe|seed\s+coating|equipment\s+launch)/i;
function validUrl(raw:string,expectedHost?:string):URL|null {
  try{
    const u=new URL(raw);const host=normHost(u.hostname);
    if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!hosts.has(host)||(expectedHost&&host!==expectedHost))return null;
    if(!u.pathname||u.pathname==='/'||/\/(?:feed|rss|tag|search|category)(?:\/|$)/i.test(u.pathname))return null;
    if(host==='ers.usda.gov') {
      if(!(/^\/publications\/\d{4,}\/?$/.test(u.pathname)||u.pathname==='/topics/crops/soybeans-and-oil-crops/market-outlook'))return null;
    }else if(u.pathname.length<16||/\/articles\/topic\//i.test(u.pathname))return null;
    u.hash='';return u;
  }catch{return null;}
}
function dateISO(v:string):string {
  const raw=strip(v);if(!raw)return '';
  let ms=Date.parse(raw);
  if(!Number.isFinite(ms))return '';
  const day=new Date(ms).toISOString().slice(0,10);
  return day;
}
function inWindow(day:string,now=Date.now()):boolean {
  const d=Date.parse(day+'T00:00:00Z');
  const today=Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  return !!day&&Number.isFinite(d)&&d>=today-30*86400000&&d<=today;
}
function titleMatch(a:string,b:string):boolean {
  const stop=new Set(['soybean','soybeans','soya','the','and','with','from','after','more','usda','outlook','market','report','october','2026','2027']);
  const words=(v:string)=>new Set((v.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!stop.has(w)));
  const x=words(a),y=words(b);let overlap=0;
  for(const w of x)if(y.has(w))overlap++;
  return x.size>0&&y.size>0&&overlap>=Math.min(2,x.size,y.size)&&overlap/Math.min(x.size,y.size)>=.5;
}
async function fetchSamePublisher(url:string,host:string,accept:string):Promise<Response> {
  let current=url;
  for(let i=0;i<3;i++){
    const u=new URL(current);
    if(u.protocol!=='https:'||normHost(u.hostname)!==host||u.username||u.password||(u.port&&u.port!=='443'))throw Error('unsafe-redirect');
    const res=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{Accept:accept,'User-Agent':'Mozilla/5.0 (compatible; RMS-SoybeanPublisherVerifier/1.0)'}});
    if([301,302,303,307,308].includes(res.status)){
      const next=res.headers.get('location');await res.body?.cancel().catch(()=>{});
      if(!next)throw Error('redirect-missing');current=new URL(next,current).href;continue;
    }
    return res;
  }
  throw Error('redirect-limit');
}
function candidate(src:Source,id:string,title:string,link:string,date:string,retrievedAt:string):RetrievedSourceMetadata {
  return {rawId:id,rawTitle:strip(title),rawSnippet:'',sourceName:src.publisher,
    sourceType:src.sourceType,publishedAt:date,originalUrl:link,retrievedAt,
    category:'수급 전망',affectedRegion:'글로벌'};
}
export function parseSoybeanFeed(xml:string,src:Source,retrievedAt:string):RetrievedSourceMetadata[] {
  const $=load(xml,{xmlMode:true}),out:RetrievedSourceMetadata[]=[];
  $('item,entry').each((i,el)=>{
    const n=$(el),title=strip(n.children('title').first().text());
    const raw=strip(n.children('link').first().text())||strip(n.children('link').first().attr('href'));
    const u=validUrl(raw,src.host),date=dateISO(strip(n.children('pubDate,published,updated,dc\\:date').first().text()));
    // Broader headline can still point to soybean-specific reporting; verify the original article later.
    const teaser=strip(load(strip(n.children('description,summary,content\\:encoded').first().text())).text()).slice(0,900);
    const hints=title+' '+teaser;
    if(!u||!title||!inWindow(date)||!soybean.test(hints)||!market.test(hints)||irrelevant.test(title))return;
    out.push(candidate(src,`soy-rss-${src.host}-${i}`,title,u.href,date,retrievedAt));
  });return out;
}
export function parseSoybeanIndex(html:string,src:Source,retrievedAt:string):RetrievedSourceMetadata[]{
  const $=load(html),out:RetrievedSourceMetadata[]=[];
  $('a[href]').each((i,el)=>{
    const href=$(el).attr('href')||'';let u:URL|null=null;
    try{u=validUrl(new URL(href,src.url).href,src.host);}catch{return;}
    if(!u)return;
    const title=strip($(el).text())||strip($(el).attr('title'));
    if(title.length<12||title.length>210||/^read more$/i.test(title)||irrelevant.test(title))return;
    const official=src.host==='ers.usda.gov';
    const context=strip($(el).closest('article,.article-item,.post,.story,.card,.teaser').first().text()
      ||$(el).parent().parent().text()).slice(0,750);
    const hints=title+' '+context;
    const rawDate=(context.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/)||
      context.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i)||
      title.match(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i))?.[0]||'';
    const indexDay=dateISO(rawDate);
    if(indexDay&&!inWindow(indexDay))return;
    if(official){if(!/oil crops outlook/i.test(hints))return;}
    else {
      const wire=src.host==='graincentral.com'&&/^Daily Market Wire\b/i.test(title);
      const topicalIndex=src.host==='world-grain.com'&&/\/articles\/\d{3,}-/i.test(u.pathname)
        &&/\/articles\/topic\/134(?:4|9)|\/articles\/topic\/1350/i.test(src.url);
      // Accept plausible mixed-grain/oilseed pages as *candidates* on topical indexes,
      // never as verified news until the independent soybean-body evidence check passes.
      if(!(soybean.test(hints)&&market.test(hints))&&!wire&&!topicalIndex)return;
    }
    out.push(candidate(src,`soy-index-${src.host}-${i}`,official&&title.length<12?'Oil Crops Outlook':title,u.href,indexDay,retrievedAt));
  });return out;
}
/** USDA ERS publishes a current, dated outlook on this stable landing page.
 * We verify it again as original publisher content before treating it as news.
 * No fixed report issue, headline, numerical claim or publication URL is embedded.
 */
export function parseSoybeanOutlook(html:string,src:Source,retrievedAt:string):RetrievedSourceMetadata[]{
  if(src.host!=='ers.usda.gov'||src.kind!=='outlook')return [];
  const $=load(html),main=$('main').first().length?$('main').first():$('body');
  const h1=strip(main.find('h1').first().text()||$('h1').first().text());
  const text=strip(main.text());
  const match=text.match(/\bUpdated\s*:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\b/i);
  const day=dateISO(match?.[1]||'');
  if(!/soybeans?\s+and\s+oil\s+crops/i.test(h1)||!inWindow(day)||!soybean.test(text)||!market.test(text))return [];
  const u=validUrl(src.url,src.host);if(!u)return [];
  return [candidate(src,`soy-ers-outlook-${day}`,h1,u.href,day,retrievedAt)];
}
export async function discoverSoybeanFreeSources(retrievedAt=new Date().toISOString()){
  const results=await Promise.all(SOYBEAN_PUBLIC_SOURCES.map(async src=>{
    try{
      const res=await fetchSamePublisher(src.url,src.host,src.kind==='rss'?'application/rss+xml,application/xml,text/xml':'text/html');
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      const body=(await res.text()).slice(0,1_000_000);
      const items=src.kind==='rss'?parseSoybeanFeed(body,src,retrievedAt):src.kind==='outlook'?parseSoybeanOutlook(body,src,retrievedAt):parseSoybeanIndex(body,src,retrievedAt);
      return {src,items,okay:true,error:''};
    }catch(e){return {src,items:[] as RetrievedSourceMetadata[],okay:false,error:String((e as Error).message||e)};}
  }));
  const seen=new Set<string>(),counts=new Map<string,number>(),candidates:RetrievedSourceMetadata[]=[];
  const raw=results.flatMap(r=>r.items).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  for(const c of raw){
    const host=normHost(new URL(c.originalUrl).hostname);
    const k=c.originalUrl.toLowerCase().replace(/\/+$/,'');
    if(seen.has(k)||(counts.get(host)||0)>=14)continue;
    seen.add(k);counts.set(host,(counts.get(host)||0)+1);candidates.push(c);
  }
  candidates.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  return {candidates:candidates.slice(0,35),diagnostics:{sourcesTried:results.length,sourcesRead:results.filter(r=>r.okay).length,
    discovered:candidates.length,sourceResults:results.map(r=>({publisher:r.src.publisher,kind:r.src.kind,url:r.src.url,
      discovered:r.items.length,okay:r.okay,error:r.error||undefined})),
    candidatesByPublisher:Object.fromEntries([...new Set(candidates.map(c=>c.sourceName))].map(k=>[k,candidates.filter(c=>c.sourceName===k).length])),
    errors:results.filter(r=>!r.okay).map(r=>`${r.src.publisher}: ${r.error}`)}};
}
function articleJsonLd($:ReturnType<typeof load>):{headline:string;date:string;body:string}[]{
  const out:{headline:string;date:string;body:string}[]=[];
  const visit=(value:unknown)=>{
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(!value||typeof value!=='object')return;
    const v=value as Record<string,unknown>;
    const types=Array.isArray(v['@type'])?v['@type']:String(v['@type']||'').split(',');
    if(types.some(t=>/(?:newsarticle|article|report)/i.test(String(t)))) {
      const body=strip(v.articleBody);
      out.push({headline:strip(v.headline||v.name),date:strip(v.datePublished||v.dateCreated),body});
    }
    if(v['@graph'])visit(v['@graph']);
    if(v.mainEntity)visit(v.mainEntity);
  };
  $('script[type="application/ld+json"]').each((_,el)=>{
    try{visit(JSON.parse($(el).html()||''));}catch{/* ignore bad JSON-LD; HTML remains eligible */}
  });
  return out;
}
function extractOriginalEvidence(html:string,$:ReturnType<typeof load>):{excerpt:string;anchors:number;passages:number;reason:string}{
  const $copy=load(html);
  $copy('script,style,nav,header,footer,noscript,aside,form,button,iframe,.breadcrumb,.related-articles,.related-stories,.recommended,.newsletter,.author-bio').remove();
  const selectors=['[itemprop="articleBody"]','.article-body','.article__body','.article-content','.article__content','.story-body','.story-content','.entry-content','.prose','article','main'];
  const sets:string[][]=[];
  for(const selector of selectors){
    $copy(selector).slice(0,3).each((_,root)=>{
      const paragraphs=$copy(root).find('p,h2,h3,li').toArray().map(el=>strip($copy(el).text()))
        .filter(s=>!!s.trim()&&s.length<=1400);
      if(paragraphs.length>0)sets.push(paragraphs);
    });
  }
  // Some publishers put the full article outside a semantic <article> element.
  // A body fallback remains evidence-gated: boilerplate cannot pass crop/market checks.
  if(!sets.length){
    const body=$copy('body').find('p,h2,h3').toArray().map(el=>strip($copy(el).text())).filter(s=>!!s.trim()&&s.length<=1400);
    if(body.length>0)sets.push(body);
  }
  for(const entry of articleJsonLd($))if(!!entry.body.trim()){
    const chunks=entry.body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(s=>!!s.trim());
    if(chunks.length>0)sets.push(chunks);
  }
  let best={excerpt:'',anchors:0,passages:0,reason:'article-body-too-short'},bestScore=-1;
  for(const paragraphs of sets){
    const found=selectMarketEvidence(paragraphs,'soybean',5600);
    // Penalize an entire website's mixed related-content paragraphs versus an article body.
    const score=found.anchorCount*100+found.marketPassageCount*30+found.excerpt.length/150;
    if(score>bestScore){bestScore=score;best={excerpt:found.excerpt,anchors:found.anchorCount,passages:paragraphs.length,reason:found.reason};}
  }
  return best;
}
export async function verifySoybeanOriginal(candidate:RetrievedSourceMetadata):Promise<{allowed:boolean;reason:string;verified?:RetrievedSourceMetadata}>{
  const url=validUrl(candidate.originalUrl);if(!url)return {allowed:false,reason:'unsafe-or-nonspecific-url'};
  try{
    const host=normHost(url.hostname),res=await fetchSamePublisher(url.href,host,'text/html');
    if(!res.ok||!/html/i.test(res.headers.get('content-type')||''))return {allowed:false,reason:`not-publisher-html:${res.status}`};
    const html=(await res.text()).slice(0,900_000),$=load(html);
    const title=strip($('h1').first().text()),og=strip($('meta[property="og:title"]').attr('content'));
    const jsonLd=articleJsonLd($);
    const official=host==='ers.usda.gov'&&url.pathname==='/topics/crops/soybeans-and-oil-crops/market-outlook'&&
      /soybeans?\s+and\s+oil\s+crops/i.test(title+' '+candidate.rawTitle);
    if(!(official||titleMatch(candidate.rawTitle,title)||titleMatch(candidate.rawTitle,og)||
      jsonLd.some(x=>titleMatch(candidate.rawTitle,x.headline))))return {allowed:false,reason:'article-headline-mismatch'};
    const officialUpdated=official?strip($('main').first().text()||$('body').text()).match(/\bUpdated\s*:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\b/i)?.[1]:undefined;
    const dateCandidates=[officialUpdated, $('meta[property="article:published_time"]').attr('content'),
      $('meta[name="datePublished"]').attr('content'), $('meta[itemprop="datePublished"]').attr('content'),
      ...jsonLd.map(x=>x.date),html.match(/"datePublished"\s*:\s*"([^"\n]+)/i)?.[1],
      $('time[datetime]').first().attr('datetime')];
    const day=dateCandidates.map(x=>dateISO(String(x||''))).find(Boolean)||'';
    if(!inWindow(day))return {allowed:false,reason:'publication-date-unverified'};
    if(candidate.publishedAt&&Math.abs(Date.parse(candidate.publishedAt)-Date.parse(day))>86400000)
      return {allowed:false,reason:'rss-article-date-mismatch'};
    const evidence=extractOriginalEvidence(html,$);
    if(!evidence.passages||evidence.excerpt.trim()===title.trim())return {allowed:false,reason:'article-body-unavailable'};
    if(evidence.reason!=='ok'||evidence.anchors<1)
      return {allowed:false,reason:evidence.reason};
    if(!soybean.test(evidence.excerpt)||!market.test(evidence.excerpt))return {allowed:false,reason:'soybean-facts-missing'};
    return {allowed:true,reason:'verified',verified:{...candidate,rawTitle:strip(title||og),rawSnippet:evidence.excerpt,publishedAt:day,
      originalUrl:url.href,sourceName:SOYBEAN_PUBLIC_SOURCES.find(x=>x.host===host)!.publisher,
      sourceType:host==='ers.usda.gov'?'official':'news',unavailable:false}};
  }catch(e){return {allowed:false,reason:`publisher-fetch:${String((e as Error).message||e).slice(0,80)}`};}
}
export async function verifySoybeanCandidates(candidates:RetrievedSourceMetadata[]){
  const dedup=new Set<string>();const unique=candidates.filter(x=>{
    const k=x.originalUrl.toLowerCase().replace(/\/+$/,'');if(dedup.has(k))return false;dedup.add(k);return true;
  });
  // Balance original-page verification across available publishers.
  const buckets=new Map<string,RetrievedSourceMetadata[]>();
  for(const c of unique){const group=buckets.get(c.sourceName)||[];group.push(c);buckets.set(c.sourceName,group);}
  const balanced:RetrievedSourceMetadata[]=[];
  while(balanced.length<28&&[...buckets.values()].some(items=>items.length)){
    for(const items of buckets.values())if(items.length&&balanced.length<28)balanced.push(items.shift()!);
  }
  const checks=await Promise.all(balanced.map(verifySoybeanOriginal));
  const accepted=checks.flatMap(c=>c.allowed&&c.verified?[c.verified]:[]);
  const rejectedByPublisher:Record<string,Record<string,number>>={};
  for(let i=0;i<checks.length;i++){
    if(checks[i].allowed)continue;
    const key=balanced[i].sourceName;
    const group=rejectedByPublisher[key]||(rejectedByPublisher[key]={});
    const reason=checks[i].reason;group[reason]=(group[reason]||0)+1;
  }
  return {accepted,summary:{checked:checks.length,accepted:accepted.length,rejected:checks.length-accepted.length,
    rejectedByPublisher,
    acceptedByPublisher:Object.fromEntries([...new Set(accepted.map(c=>c.sourceName))].map(k=>[k,accepted.filter(c=>c.sourceName===k).length])),
    reasons:checks.filter(c=>!c.allowed).reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{} as Record<string,number>)}};
}
export function selectSoybeanNews(candidates:RetrievedSourceMetadata[],limit=6){
  // MVP: First pass favors publisher diversity; second pass fills remaining
  // slots with other independently verified articles when publishers block HTML.
  // Distinct original URLs are mandatory. This rule never bypasses verification.
  const sorted=[...candidates].filter(a=>a.originalUrl && a.rawSnippet)
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  const kept:RetrievedSourceMetadata[]=[],seen=new Set<string>(),count=new Map<string,number>();
  const add=(a:RetrievedSourceMetadata)=>{
    const url=a.originalUrl.toLowerCase().replace(/\/+$/,'');
    if(seen.has(url))return;
    seen.add(url);kept.push(a);count.set(a.sourceName,(count.get(a.sourceName)||0)+1);
  };
  for(const a of sorted){
    if((count.get(a.sourceName)||0)<2)add(a);
    if(kept.length>=limit)return kept;
  }
  // If other publishers are unavailable/403, retain independently verified
  // additional items from the same publisher rather than blocking all cards.
  for(const a of sorted){add(a);if(kept.length>=limit)break;}
  return kept;
}
