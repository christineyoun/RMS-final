/**
 * Corn Market Intelligence: free original-publisher discovery and verification.
 * No Gemini requests, no snapshot writes. Source feeds and index pages are ONLY
 * candidate locators. Their original HTML pages and dates are checked separately.
 * A USDA Feed Outlook is backed by the publisher-linked full report PDF, not
 * the short landing-page abstract. A short council landing page is NOT full evidence.
 */
import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { selectMarketEvidence, reviewMarketSummary, prepareCornCouncilPdfEvidence } from './newsEvidenceQuality.ts';
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';

type Source = { url: string; host: string; publisher: string; kind: 'rss'|'index'; sourceType: 'news'|'official' };
export const CORN_PUBLIC_SOURCES: Source[] = [
  {url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',kind:'rss',sourceType:'news'},
  {url:'https://www.world-grain.com/rss/articles',host:'world-grain.com',publisher:'World Grain',kind:'rss',sourceType:'news'},
  {url:'https://www.graincentral.com/markets/feed/',host:'graincentral.com',publisher:'Grain Central',kind:'rss',sourceType:'news'},
  {url:'https://www.ers.usda.gov/topics/crops/corn-and-other-feed-grains/market-outlook',host:'ers.usda.gov',publisher:'USDA ERS',kind:'index',sourceType:'official'},
  {url:'https://grains.org/market_perspectives/',host:'grains.org',publisher:'U.S. Grains & BioProducts Council',kind:'index',sourceType:'official'},
  {url:'https://ahdb.org.uk/Query/4458?title=Latest+cereals+and+oilseeds+market+news',host:'ahdb.org.uk',publisher:'AHDB',kind:'index',sourceType:'official'}
];
const allowedHosts=new Set(CORN_PUBLIC_SOURCES.map(x=>x.host));
const normHost=(s:string)=>s.toLowerCase().replace(/^www\./,'');
const strip=(s:unknown)=>String(s||'').replace(/\s+/g,' ').trim();
const cornTerm=/\b(?:corn|maize|feed\s+grains?|ethanol|coarse\s+grains?)\b/i;
const marketTerm=/\b(?:price|forecast|outlook|market|supply|stock|export|import|production|harvest|trade|shipment|feed|grain|futures|basis|weather|freight|logistic|drought|yield)\b/i;
const normalizeUrl=(s:string)=>{try{const u=new URL(s);u.hash='';return u.href.replace(/\/$/,'');}catch{return s;}};
export function cornCivilDate(v:string):string {
  const raw=strip(v);
  if(/^20\d\d-\d\d-\d\d/.test(raw))return raw.slice(0,10);
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const dmy=raw.match(/^(\d{1,2})\s+([a-z]+)\s+(20\d\d)$/i);
  const mdy=raw.match(/^([a-z]+)\s+(\d{1,2}),?\s+(20\d\d)$/i);
  const slash=raw.match(/^(\d{1,2})\/(\d{1,2})\/(20\d\d)$/);
  let year:number,month:number,day:number;
  if(dmy){day=+dmy[1];month=months.indexOf(dmy[2].toLowerCase())+1;year=+dmy[3];}
  else if(mdy){day=+mdy[2];month=months.indexOf(mdy[1].toLowerCase())+1;year=+mdy[3];}
  else if(slash){month=+slash[1];day=+slash[2];year=+slash[3];}
  else {const n=Date.parse(raw);return Number.isFinite(n)?new Date(n).toISOString().slice(0,10):'';}
  if(month<1||month>12)return '';
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):'';
}
const inWindow=(d:string,now=Date.now())=>{
  const t=Date.parse(d+'T00:00:00Z');
  const kstDay=Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  return !!d&&Number.isFinite(t)&&t>=kstDay-30*86400000&&t<=kstDay+86400000;
};
function validUrl(value:string,host?:string,allowFeed=false):URL|null {
  try {
    const u=new URL(value);
    const h=normHost(u.hostname);
    if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||
      !allowedHosts.has(h)||(host&&h!==host))return null;
    if(!allowFeed && /\/(?:search|category|tag|feed|rss)\/?$/i.test(u.pathname))return null;
    return u;
  }catch{return null;}
}
function articlePath(u:URL):boolean {
  const p=u.pathname;
  if(u.hostname.endsWith('ers.usda.gov'))return /^\/publications\/\d{4,}\/?$/i.test(p);
  if(u.hostname.endsWith('grains.org'))return /^\/market_perspectives\/market-perspectives-[a-z]+-\d{1,2}-20\d\d\/?$/i.test(p);
  if(u.hostname.endsWith('ahdb.org.uk'))return /^\/news\/arable-market-report-\d{1,2}-[a-z]+-20\d\d\/?$/i.test(p);
  return p.length>18&&p!=='/'&&!/\/(?:feed|rss|markets)\/?$/i.test(p);
}
function candidate(retrievedAt:string,id:string,title:string,url:string,publisher:string,type:'news'|'official',date=''):RetrievedSourceMetadata {
  return {rawId:id,rawTitle:title,rawSnippet:'',sourceName:publisher,sourceType:type,
    publishedAt:date,originalUrl:url,retrievedAt,category:'시장 동향',affectedRegion:'글로벌'};
}
export function parseCornIndex(html:string,src:Source,retrievedAt:string):RetrievedSourceMetadata[] {
  const $=load(html);const found:RetrievedSourceMetadata[]=[];let i=0;
  $('a[href]').each((_,el)=>{
    const href=$(el).attr('href')||'';let absolute='';
    try{absolute=new URL(href,src.url).href;}catch{return;}
    const u=validUrl(absolute,src.host);
    if(!u||!articlePath(u))return;
    let title=strip($(el).text());
    if(src.host==='ers.usda.gov') {
      if(!/feed outlook/i.test(title)) {
        // The ERS index sometimes uses 'Latest Report' for the link.
        const nearby=strip($(el).parent().text());
        if(!/feed outlook/i.test(nearby))return;
        title='Feed Outlook';
      }
    } else if(src.host==='grains.org') {
      if(!/market perspectives/i.test(title))return;
    } else if(src.host==='ahdb.org.uk') {
      if(!/arable market report/i.test(title))return;
    }
    if(title.length<8)return;
    found.push(candidate(retrievedAt,`corn-index-${src.host}-${i++}`,title,u.href,src.publisher,src.sourceType));
  });
  return found;
}
export function parseCornFeed(xml:string,src:Source,retrievedAt:string):RetrievedSourceMetadata[] {
  const $=load(xml,{xmlMode:true});const found:RetrievedSourceMetadata[]=[];
  $('item, entry').each((i,element)=>{
    const node=$(element);const title=strip(node.children('title').first().text());
    const rawLink=strip(node.children('link').first().text())||strip(node.children('link').first().attr('href'));
    const date=cornCivilDate(strip(node.children('pubDate,published,updated,dc\\:date').first().text()));
    const u=validUrl(rawLink,src.host);
    if(!u||!articlePath(u)||!inWindow(date)||!cornTerm.test(title+' '+u.pathname)||
       !marketTerm.test(title)||/\b(?:awards?|hiring|careers?|appointed|recipes?)\b/i.test(title))return;
    found.push(candidate(retrievedAt,`corn-feed-${src.host}-${i}`,title,u.href,src.publisher,src.sourceType,date));
  });
  return found;
}
async function publisherFetch(url:string,host:string,accept='text/html,application/xhtml+xml',allowFeed=false):
  Promise<{res:Response;url:URL}> {
  let current=url;
  for(let hop=0;hop<3;hop++) {
    const u=validUrl(current,host,allowFeed);
    if(!u)throw Error('unsafe-url-or-redirect');
    const res=await fetch(current,{redirect:'manual',headers:{Accept:accept,
      'User-Agent':'Mozilla/5.0 (compatible; RMSCornSourceVerifier/1.0)'},
      signal:AbortSignal.timeout(12000)});
    if(![301,302,303,307,308].includes(res.status))return {res,url:u};
    const location=res.headers.get('location');
    await res.body?.cancel().catch(()=>{});
    if(!location)throw Error('redirect-without-location');
    current=new URL(location,current).href;
  }
  throw Error('too-many-redirects');
}
export async function discoverCornFreeSources(retrievedAt=new Date().toISOString()) {
  const responses=await Promise.all(CORN_PUBLIC_SOURCES.map(async src=>{
    try{
      const {res}=await publisherFetch(src.url,src.host,src.kind==='rss'?'application/rss+xml,application/xml,text/xml':'text/html',src.kind==='rss');
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      const body=(await res.text()).slice(0,1000000);
      if(src.kind==='rss'&&!/<(?:rss|feed|item|entry)\b/i.test(body))throw Error('not-rss');
      if(src.kind==='index'&&!/<html|<a\b/i.test(body))throw Error('not-html');
      const items=src.kind==='rss'?parseCornFeed(body,src,retrievedAt):parseCornIndex(body,src,retrievedAt);
      return {src,items,okay:true,error:''};
    }catch(e){return {src,items:[] as RetrievedSourceMetadata[],okay:false,error:String((e as Error).message||e)};}
  }));
  const counts=new Map<string,number>(),seen=new Set<string>();
  const candidates:RetrievedSourceMetadata[]=[];
  // Reserve room for publisher diversity, not 25 articles from a single feed.
  for(const response of responses) for(const item of response.items) {
    const k=normalizeUrl(item.originalUrl);
    if(seen.has(k)||(counts.get(response.src.host)||0)>=8)continue;
    seen.add(k);counts.set(response.src.host,(counts.get(response.src.host)||0)+1);
    candidates.push(item);
  }
  // A dated USDA report is only a candidate, independently verified and retired
  // outside 30 days. Dynamic ERS index remains the long-term discovery path.
  const october='https://www.ers.usda.gov/publications/115628';
  if(inWindow('2026-10-14')&&!seen.has(october))candidates.push(candidate(retrievedAt,'corn-ers-oct26',
    'Feed Outlook: October 2026',october,'USDA ERS','official'));
  return {candidates:candidates.slice(0,40),diagnostics:{sourcesTried:responses.length,
    sourcesRead:responses.filter(r=>r.okay).length,discovered:candidates.length,
    errors:responses.filter(r=>!r.okay).map(r=>`${r.src.publisher} (${r.src.url}): ${r.error}`)}};
}
function titleTokens(s:string):Set<string>{
  const stop=new Set(['and','the','for','from','with','report','market','markets','october','september','outlook','price','grain','corn','maize','2026','2027']);
  return new Set((s.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(t=>!stop.has(t)));
}
function titleMatch(a:string,b:string):boolean {
  const x=titleTokens(a),y=titleTokens(b);
  if(x.size===0||y.size===0)return a.toLowerCase().includes(b.toLowerCase())||b.toLowerCase().includes(a.toLowerCase());
  let hits=0;for(const t of x)if(y.has(t))hits++;
  return hits>=Math.min(2,x.size) && hits/Math.min(x.size,y.size)>=0.5;
}
function publicationDate($:ReturnType<typeof load>,h1:ReturnType<ReturnType<typeof load>>,html:string):string {
  const selectors=['meta[property="article:published_time"]','meta[name="datePublished"]','meta[itemprop="datePublished"]',
    'meta[name="pubdate"]','meta[name="publication_date"]'];
  for(const s of selectors){const d=cornCivilDate($(s).first().attr('content')||'');if(d)return d;}
  const schema=html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
  if(schema){const d=cornCivilDate(schema);if(d)return d;}
  const time=cornCivilDate($('time[datetime]').first().attr('datetime')||'');if(time)return time;
  // Locate the date close to the publisher's H1, not a footer archive date.
  const near=strip(h1.parent().text()+' '+h1.parent().next().text()).slice(0,1200);
  const matches=[near.match(/\b\d{1,2}\/\d{1,2}\/20\d\d\b/),
    near.match(/\b(?:Monday,?\s*|Tuesday,?\s*|Wednesday,?\s*|Thursday,?\s*|Friday,?\s*|Saturday,?\s*|Sunday,?\s*)?(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d)\b/i),
    near.match(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d\d)\b/i)];
  for(const m of matches){const d=cornCivilDate(m?.[1]||m?.[0]||'');if(d)return d;}
  return '';
}
async function officialLinkedPdf($:ReturnType<typeof load>,page:URL):Promise<string> {
  // Publisher-owned PDF only; retain the HTML article as the click-through link.
  const anchors=$('a[href]').toArray().map(a=>({href:$(a).attr('href')||'',text:strip($(a).text())}));
  const report=anchors.find(a=>/\.pdf(?:\?|$)/i.test(a.href) &&
    /download|full report|report pdf|pdf/i.test(a.text+' '+a.href));
  if(!report)return '';
  const pdfUrl=new URL(report.href,page.href);
  if(pdfUrl.protocol!=='https:'||!['ers.usda.gov','grains.org'].includes(normHost(pdfUrl.hostname)))return '';
  const res=await fetch(pdfUrl.href,{redirect:'manual',signal:AbortSignal.timeout(18000),headers:{Accept:'application/pdf'}});
  if(!res.ok||!(/pdf/i.test(res.headers.get('content-type')||'')||/\.pdf$/i.test(pdfUrl.pathname)))return '';
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.byteLength<2000||bytes.byteLength>9_000_000)return '';
  const parser=new PDFParse({data:bytes});
  try{
    const parsed=await parser.getText();
    return String(typeof parsed==='string'?parsed:(parsed as any).text||'').replace(/[ \t]+/g,' ').trim();
  } finally {await parser.destroy();}
}
export type CornCheck = {allowed:boolean;reason:string;excerpt?:string;date?:string;contentChars?:number};
export async function verifyCornOriginal(candidate:RetrievedSourceMetadata):Promise<CornCheck> {
  const u=validUrl(candidate.originalUrl);
  if(!u||!articlePath(u))return {allowed:false,reason:'unsafe-or-nonspecific-url'};
  try {
    const {res}=await publisherFetch(u.href,normHost(u.hostname));
    if(!res.ok)return {allowed:false,reason:`HTTP ${res.status}`};
    if(!/html/i.test(res.headers.get('content-type')||''))return {allowed:false,reason:'not-html'};
    const html=(await res.text()).slice(0,850000);
    const $=load(html),h1=$('h1').first();
    const heading=strip(h1.text());
    const pageTitle=strip($('meta[property="og:title"]').first().attr('content')||$('title').first().text());
    const host=normHost(u.hostname);
    const officialFeed=host==='ers.usda.gov' && /\/publications\/\d+/.test(u.pathname)&&/feed outlook/i.test(candidate.rawTitle);
    const council=host==='grains.org';
    const ahdb=host==='ahdb.org.uk';
    const identity=officialFeed
      ? /^feed outlook:\s*[a-z]+\s+20\d\d/i.test(heading)
      : titleMatch(candidate.rawTitle,heading)||titleMatch(candidate.rawTitle,pageTitle)||
        (council&&/^market perspectives\s*[–-]\s*[a-z]+\s+\d{1,2},?\s+20\d\d/i.test(heading))||
        (ahdb&&/^arable market report\s*[–-]\s*\d{1,2}\s+[a-z]+\s+20\d\d/i.test(heading));
    if(!identity)return {allowed:false,reason:'headline-mismatch'};
    const date=publicationDate($,h1,html);
    const titleDate=cornCivilDate(heading.replace(/^.*?\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d\d).*$/i,'$1'));
    const verifiedDate=date||((officialFeed||council||ahdb)?titleDate:'');
    if(!inWindow(verifiedDate) || (candidate.publishedAt&&Math.abs(Date.parse(verifiedDate)-Date.parse(candidate.publishedAt))>86400000))
      return {allowed:false,reason:'publication-date-unverified'};
    const $copy=load(html);
    $copy('script,style,noscript,nav,header,footer,aside,form,iframe,button, .breadcrumbs, .breadcrumb').remove();
    // Read article paragraph boundaries, never flatten a whole <main> section
    // into one long teaser/nav blob before selecting commodity-specific evidence.
    const root=$copy('article').first().length && $copy('article').first().find('p').length>=3
      ? $copy('article').first() : $copy('main').first().length ? $copy('main').first() : $copy('body');
    const htmlParagraphs=root.find('p,h2,h3,h4,li,tr').toArray()
      .map(el=>strip($copy(el).text()))
      .filter(x=>x.length>=30&&x.length<1400);
    const fallback=strip(root.text());
    let paragraphs=htmlParagraphs.length>=3?htmlParagraphs:[fallback];
    // A short official landing page is not enough: prefer the linked original
    // PDF, then subject every paragraph to the SAME relevant-evidence gate.
    if((officialFeed||council) && fallback.length<1900) {
      const report=await officialLinkedPdf($,u);
      if(report.length>fallback.length && cornTerm.test(report))
        paragraphs=(council ? prepareCornCouncilPdfEvidence(report) : report)
          .replace(/\r/g,'').split(/\n\s*\n+/).map(x=>strip(x)).filter(Boolean);
      else return {allowed:false,reason:'official-report-body-unavailable',contentChars:fallback.length};
    }
    const selected=selectMarketEvidence(paragraphs,'corn',5800);
    if(selected.reason!=='ok')return {allowed:false,reason:selected.reason,
      contentChars:selected.excerpt.length};
    const excerpt=selected.excerpt;
    return {allowed:true,reason:'verified-original',date:verifiedDate,excerpt,contentChars:excerpt.length};
  }catch(e){return {allowed:false,reason:`fetch-or-parse-error:${String((e as Error).message||e).slice(0,70)}`};}
}
export async function verifyCornCandidates(items:RetrievedSourceMetadata[]) {
  const accepted:RetrievedSourceMetadata[]=[];const reasons:Record<string,number>={};
  for(let i=0;i<items.length;i+=5) {
    const batch=items.slice(i,i+5);
    const results=await Promise.all(batch.map(verifyCornOriginal));
    results.forEach((r,j)=>{
      if(r.allowed&&r.excerpt&&r.date){
        const item=batch[j];
        let title=item.rawTitle;
        // AHDB search-index anchors sometimes contain entire article teasers.
        // Canonicalize ONLY after original URL, headline and publication date verify.
        const ahdbSlug=new URL(item.originalUrl).pathname.match(/^\/news\/arable-market-report-(\d{1,2})-([a-z]+)-(20\d{2})\/?$/i);
        if(ahdbSlug && item.sourceName==='AHDB') {
          const [,dd,mm,yyyy]=ahdbSlug;
          const month=mm.charAt(0).toUpperCase()+mm.slice(1).toLowerCase();
          const dateFromSlug=cornCivilDate(`${Number(dd)} ${month} ${yyyy}`);
          if(dateFromSlug===r.date)title=`Arable Market Report – ${Number(dd)} ${month} ${yyyy}`;
        }
        accepted.push({...item,rawTitle:title,rawSnippet:r.excerpt,publishedAt:r.date});
      }
      else reasons[r.reason]=(reasons[r.reason]||0)+1;
    });
  }
  return {accepted,summary:{accepted:accepted.length,rejected:items.length-accepted.length,reasons}};
}
const theme=(title:string)=>{
  if(/\b(?:drought|weather|rain|dry|flood|planting)\b/i.test(title))return 'weather';
  if(/freight|shipping|black sea|export|import|trade|logistic/i.test(title))return 'trade';
  if(/price|futures|basis|bid/i.test(title))return 'price';
  if(/production|stocks|supply|demand|wasde|outlook|forecast|harvest|yield/i.test(title))return 'supply';
  return 'other';
};
export function cornLabelsForSource(x:RetrievedSourceMetadata) {
  const sourceUrl=new URL(x.originalUrl);
  const host=normHost(sourceUrl.hostname);
  const text=x.rawTitle+' '+sourceUrl.pathname.replace(/[-_/]/g,' ');
  const group=theme(x.rawTitle);
  const category=({weather:'기상 리스크',trade:'물류·무역',price:'가격 동향',supply:'수급 전망',other:'시장 동향'} as Record<string,string>)[group];
  const region=/ukrain|russi|black sea/i.test(text)?'흑해':/\b(?:us|u\.s\.)\b/i.test(text)&&/eu\b|europe|euronext/i.test(text)?'미국·유럽':/europe|eu\b|euronext/i.test(text)||host==='ahdb.org.uk'?'유럽':
    /brazil/i.test(text)?'브라질':/argentin/i.test(text)?'아르헨티나':/china/i.test(text)?'중국':
    /\bindia\b/i.test(text)?'인도':host==='ers.usda.gov'||/usda|us corn|u\.s\.|america/i.test(text)?'미국':
    host==='grains.org'?'미국·글로벌':'글로벌';
  return {category,affectedRegion:region};
}
export function cornSummaryRisk(summary:string,evidence:string,title='옥수수 시장 동향'):string|null {
  const shared=reviewMarketSummary(title,summary,evidence,'corn');
  if(shared)return shared;
  // Avoid fabricated numerical percentages and confuse-as-wheat mistakes.
  for(const m of summary.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const n=m[1];if(!new RegExp(`\\b${n.replace('.','\\.')}\\s*(?:%|percent|per cent)`,'i').test(evidence))
      return 'unsupported-percentage';
  }
  if(/미국\s*밀\s*생산/.test(summary)&&/us maize production|u\.s\. corn production/i.test(evidence))return 'possible-crop-confusion';
  return null;
}
export function selectCornNews(items:RetrievedSourceMetadata[],limit=4,now=Date.now()):RetrievedSourceMetadata[] {
  const valid=items.filter(x=>x.publishedAt&&inWindow(x.publishedAt,now)&&x.rawSnippet.length>=200);
  const result:RetrievedSourceMetadata[]=[],hosts=new Map<string,number>(),topics=new Map<string,number>();
  const seen=new Set<string>();
  while(result.length<limit){
    const remaining=valid.filter(x=>!result.includes(x)&&!seen.has(normalizeUrl(x.originalUrl)));
    if(!remaining.length)break;
    remaining.sort((a,b)=>{
      const score=(x:RetrievedSourceMetadata)=>{
        const age=(now-Date.parse(x.publishedAt+'T00:00:00Z'))/86400000;
        const host=normHost(new URL(x.originalUrl).hostname);
        const t=theme(x.rawTitle);
        return Math.max(0,45-Math.max(0,age)*2)+(cornTerm.test(x.rawTitle)?6:0)+
          Math.min(5,x.rawSnippet.length/800)-(hosts.get(host)||0)*22-(topics.get(t)||0)*5;
      };
      return score(b)-score(a)||b.publishedAt.localeCompare(a.publishedAt);
    });
    const chosen=remaining[0];result.push(chosen);
    seen.add(normalizeUrl(chosen.originalUrl));
    const host=normHost(new URL(chosen.originalUrl).hostname),t=theme(chosen.rawTitle);
    hosts.set(host,(hosts.get(host)||0)+1);topics.set(t,(topics.get(t)||0)+1);
  }
  return result;
}

/** Gating uses Korean calendar days. Diversity and freshness are required BEFORE any paid call. */
export function cornSelectedQuality(items:RetrievedSourceMetadata[], now=Date.now()) {
  const kstDay=Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  const within14Days=items.filter(x=>{
    const t=Date.parse(x.publishedAt+'T00:00:00Z');
    return Number.isFinite(t)&&t>=kstDay-14*86400000&&t<=kstDay;
  }).length;
  const uniquePublishers=new Set(items.map(x=>normHost(new URL(x.originalUrl).hostname))).size;
  return {selected:items.length,uniquePublishers,within14Days,
    readyForReview:items.length===4 && uniquePublishers>=3 && within14Days>=3};
}
