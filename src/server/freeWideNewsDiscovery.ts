// RMS_MI_ACCESS_AND_RELEVANCE_V3
// RMS_MI_COVERAGE_V2: broaden candidate discovery; original evidence checks remain mandatory.
/** Keyless, bounded original-publisher candidate discovery for all RMS commodities.
 * Bing RSS is only an INDEX. Its date/title do not prove a publisher's claims;
 * the existing original-page verifier must approve every article.
 */
import {load} from 'cheerio';
import {materialMarketHeadline} from './newsCandidateQuality.ts';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';

type QuerySet={queries:string[];title:RegExp};
const SEARCH:Record<string,QuerySet>={
 wheat:{queries:['wheat exports','wheat production','wheat grain freight Black Sea','wheat USDA supplies stocks'],title:/\bwheat\b/i},
 corn:{queries:['corn harvest exports','maize supply outlook','corn futures prices','US corn production','corn supply site:world-grain.com/articles','maize harvest site:graincentral.com'],title:/\b(?:corn|maize)\b/i},
 soybean:{queries:['soybean crush demand','soybean exports China','soybeans harvest stocks','soybean futures prices','soybean crush site:world-grain.com/articles','soybean production site:graincentral.com'],title:/\b(?:soybeans?|soyabeans?|soya beans?)\b/i},
 'soybean-oil':{queries:['"soybean oil" demand','"soybean oil" prices','"soybean oil" biodiesel exports','"soybean oil" crush stocks'],title:/\b(?:soybean[ -]?oil|soya[ -]?oil|soyoil)\b/i},
 'palm-oil':{queries:['"palm oil" inventories','"crude palm oil" futures','Malaysia palm oil CPO refinery stocks exports','Indonesia palm oil biodiesel export levy demand'],title:/\b(?:palm[ -]?oil|crude palm oil|CPO)\b/i},
 sugar:{queries:['sugar prices','raw sugar exports','Brazil sugar cane crush ethanol','India sugar export policy stocks'],title:/\b(?:sugar|sugarcane)\b/i},
 'potato-starch':{queries:['"potato starch" market','"starch potatoes" harvest','Avebe starch potato prices','"potato starch" production','potato starch producer Emsland Avebe contract','potato starch supply prices site:chemanalyst.com','starch potatoes processing prices site:potatonewstoday.com'],title:/\bpotato(?:es)?\b.{0,35}\bstarch\b|\bstarch\b.{0,35}\bpotato(?:es)?\b|\bavebe\b.{0,45}\b(?:potato|starch)\b|\blyckeby\b.{0,45}\bstarch\b/i},
 'tapioca-starch':{queries:['"tapioca starch" prices','"cassava starch" exports','Vietnam cassava market factory supply exports','Thailand tapioca starch TTSA TTTA shipments'],title:/\b(?:tapioca|cassava|manioc)\b/i}
};
const MARKET=/\b(?:market\s+(?:update|report|brief)|prices?|pricing|stocks?|inventor(?:y|ies)|suppl(?:y|ies)|demand|production|harvest|yields?|shipments?|imports?|exports?|futures?|biofuels?|ethanol|crush(?:ing)?|tariffs?|freight|trade|outlook|costs?|capacity|policy|shortage|weather|forecast|output|mills?|duties|consumption|quotas?)\b/i;
// A search index may surface a new legitimate publisher at any time.
// Restrict the URL by transport/network safety and article shape, NOT by a
// frozen list of publisher names. The original page verifier remains mandatory.
function safePublisherHost(host:string):boolean{
 const h=host.toLowerCase().replace(/\.$/,'');
 if(!h.includes('.')||h.length>253||h.endsWith('.local')||
    h.endsWith('.internal')||h.endsWith('.localhost')||h.endsWith('.test')||
    h.endsWith('.invalid')||h.endsWith('.example')||
    h==='localhost'||h==='metadata.google.internal'||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(h)||h.includes(':')||
    !/^[a-z0-9.-]+$/.test(h))return false;
 const labels=h.split('.');
 return labels.every(x=>x.length>0&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'))&&
        /^[a-z]{2,}$/i.test(labels.at(-1)||'');
}
const OFFICIAL=['usda.gov','fao.org','eia.gov','mpob.gov.my','ec.europa.eu'];
const inDomain=(host:string,domain:string)=>host===domain||host.endsWith('.'+domain);
function originalUrl(link:string):URL|null{
 try{
  let url=new URL(link.trim());
  const host=url.hostname.toLowerCase();
  if(inDomain(host,'bing.com')){
   // Bing's /news/apiclick.aspx links embed the publisher's URL in ?url=.
   if(url.pathname.toLowerCase()!=='/news/apiclick.aspx')return null;
   const embedded=url.searchParams.get('url');
   if(!embedded)return null;
   url=new URL(embedded);
  }
  const publisher=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     url.pathname==='/'||!safePublisherHost(publisher)||
     /\/(?:tag|category|search|topics|archive|feed|rss)(?:\/|$)/i.test(url.pathname))return null;
  return url;
 }catch{return null;}
}
function related(a:string,b:string){
 const tokens=(s:string)=>new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>=4));
 const aa=tokens(a),bb=tokens(b);let match=0;
 if(aa.size===0||bb.size===0)return false;
 for(const word of aa)if(bb.has(word))match++;
 return match/Math.min(aa.size,bb.size)>=0.84;
}
function parseFeed(xml:string,id:string,now:Date):RetrievedSourceMetadata[]{
 const config=SEARCH[id];if(!config||!/\<rss\b|\<rdf:RDF\b/i.test(xml))throw Error('invalid RSS feed');
 const $=load(xml,{xmlMode:true});
 const cutoff=now.getTime()-30*86400000;
 const out:RetrievedSourceMetadata[]=[];
 $('item').slice(0,40).each((i,node)=>{
  const n=$(node);
  const title=n.children('title').first().text().replace(/\s+/g,' ').trim();
  if(title.length<22||title.length>300||!config.title.test(title)||!MARKET.test(title)||!materialMarketHeadline(title))return;
  const url=originalUrl(n.children('link').first().text());
  if(!url)return;
  const ms=Date.parse(n.children('pubDate').first().text());
  if(!Number.isFinite(ms)||ms<cutoff||ms>now.getTime()+86400000)return;
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  out.push({
   rawId:'bing-'+id+'-'+i,
   rawTitle:title.slice(0,200),rawSnippet:'',originalUrl:url.href,
   // The RSS time is provisional; the original article's date is authoritative.
   publishedAt:new Date(ms).toISOString().slice(0,10),
   sourceName:host,sourceType:OFFICIAL.some(x=>inDomain(host,x))?'official':'news',
   retrievedAt:now.toISOString()
  });
 });
 return out;
}
let queue:Promise<void>=Promise.resolve();
let lastRequest=0;
async function pace(ms:number){
 if(ms<=0)return;
 const next=queue.then(async()=>{
  const delay=Math.max(0,ms-(Date.now()-lastRequest));
  if(delay)await new Promise<void>(resolve=>setTimeout(resolve,delay));
  lastRequest=Date.now();
 });
 queue=next.catch(()=>{});await next;
}

export type WideDiscoveryResult={candidates:RetrievedSourceMetadata[];errors:string[]};
export async function discoverWideNews(
 id:string,fetcher:typeof fetch=fetch,now=new Date(),waitMs=350
):Promise<WideDiscoveryResult>{
 const config=SEARCH[id];if(!config)return {candidates:[],errors:[]};
 const all:RetrievedSourceMetadata[]=[];
 const errors:string[]=[];
 for(const query of config.queries){
  const url=new URL('https://www.bing.com/news/search');
  url.searchParams.set('q',query);
  url.searchParams.set('format','rss');
  url.searchParams.set('setmkt','en-US');
  try{
   await pace(waitMs);
   const response=await fetcher(url.href,{
    redirect:'error',signal:AbortSignal.timeout(8500),
    headers:{Accept:'application/rss+xml, application/xml, text/xml'}
   });
   if(!response.ok)throw Error('HTTP '+response.status);
   const xml=await response.text();
   if(xml.length>1_000_000)throw Error('RSS response too large');
   all.push(...parseFeed(xml,id,now));
  }catch(e){
   errors.push('Bing news RSS: '+(e instanceof Error?e.message:'unavailable'));
   // When the provider is blocked, don't waste another timeout.
   break;
  }
 }
 const unique:RetrievedSourceMetadata[]=[];
 const hostCounts=new Map<string,number>();
 for(const candidate of all.sort((a,b)=>
   b.publishedAt.localeCompare(a.publishedAt))){
  const host=new URL(candidate.originalUrl).hostname.replace(/^www\./,'');
  if(unique.some(x=>x.originalUrl===candidate.originalUrl||related(x.rawTitle,candidate.rawTitle))||
     (hostCounts.get(host)||0)>=2)continue;
  unique.push(candidate);
  hostCounts.set(host,(hostCounts.get(host)||0)+1);
  if(unique.length>=24)break;
 }
 return {candidates:unique,errors};
}
