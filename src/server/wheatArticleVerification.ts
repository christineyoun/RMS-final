import {hasMarketArticleBody} from './newsEvidenceQuality.ts';
/**
 * Wheat original-publisher article verifier. No Gemini calls.
 * Requires a direct HTTPS article, an independent page-title/URL identity match,
 * publication-date evidence, and real Wheat relevance. Saved Korean headlines
 * are not falsely compared with untranslated publisher headlines.
 */
import type { RetrievedSourceMetadata, MarketArticle } from './marketIntelligenceService.ts';

type Candidate = { rawTitle: string; publishedAt: string; originalUrl: string };
type Check = { allowed: boolean; reason: string; excerpt?: string; verifiedDate?: string };
const allowedDomains = [
  'reuters.com','apnews.com','bloomberg.com','ft.com','world-grain.com',
  'spglobal.com','agricensus.com','uswheat.org','usda.gov','fas.usda.gov',
  'fao.org','amis-outlook.org','igc.int','agriculture.gov.au',
  'graincentral.com','farmdocdaily.illinois.edu','wheatworld.org',
  'grains.org','noaa.gov','hellenicshippingnews.com','usgrains.org',
  'commodity-board.com','northernag.net','agriculture.com','dtnpf.com',
  'farmprogress.com','farmersadvance.com','successfulfarming.com','rfdtv.com',
  'agweb.com','farmdocdaily.illinois.edu','thegrocer.co.uk','ahdb.org.uk',
  'farmweekly.com.au','graincentral.com','abc.net.au'
];
const memo = new Map<string,{result:Check;checkedAt:number}>();
const MEMO_MS = 12*60*60*1000;
const MAX_PARALLEL = 5;
const timeoutMs = 6500;
const ignoredWords = new Set([
  'from','have','that','will','with','this','wheat','grain','report','price','prices',
  'market','after','about','amid','more','says','are','and','the','for','its','into',
  'their','over','outlook','data','news','updates','update','supply','usda','wasde',
  'wasdes','commodity','board'
]);
const reject = (reason:string):Check => ({allowed:false,reason});
const hostKey = (host:string) => host.toLowerCase().replace(/^www\./,'');
function publisherUrl(value:unknown):URL|null {
  if(typeof value!=='string'||value.length>1300)return null;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return null;
    const host=hostKey(u.hostname);
    if(!allowedDomains.some(d=>host===d||host.endsWith('.'+d)))return null;
    if(/(?:^|\/)search(?:\/|$)|(?:^|\/)tag\/|(?:^|\/)category\//i.test(u.pathname))return null;
    return u;
  } catch{return null;}
}
function likelyArticlePath(u:URL):boolean {
  const s=u.pathname.replace(/\/+$/,'').toLowerCase();
  if(s==='/'||s==='/markets/commodities')return false;
  // USDA's PSD tool is a database homepage, not an October WASDE article.
  if(/\/psdonline\/app\/(?:index\.html)?$/.test(s))return false;
  // Site path conventions are not evidence of credibility. Verify the page's
  // own title, publication date and Wheat article text below instead.
  if(/\.(?:pdf|html?)$/.test(s))return s.split('/').filter(Boolean).length>=2;
  if(/\/(?:feed|rss|search|category|tag|topic|topics|markets|news|articles)\/?$/.test(s))return false;
  const meaningful=s.split('/').filter(Boolean);
  return (meaningful.length>=2 && meaningful.join('/').length>=12) ||
    (meaningful.length===1 && meaningful[0].length>=16);
}
function tokens(s:string):Set<string> {
  const text=s.toLowerCase().normalize('NFKD').replace(/[\u2019'’]/g,'');
  return new Set((text.match(/[a-z][a-z0-9]{3,}/g)||[])
    .filter(t=>!ignoredWords.has(t)));
}
function identityMatches(title:string, u:URL):boolean {
  const slug=decodeURIComponent(u.pathname).split('/').filter(Boolean).at(-1)?.replace(/\.[a-z0-9]+$/i,'')||'';
  const s=tokens(slug.replace(/[-_]+/g,' ')), t=tokens(title);
  if(s.size<2||t.size<2)return false;
  let common=0;for(const v of s)if(t.has(v))common++;
  // For short slugs, both meaningful words must match; long slugs need 2+.
  return common>=2 && common/Math.min(s.size,6)>=0.34;
}
function originalTitleMatches(expected:string,actual:string):boolean {
  const e=tokens(expected),a=tokens(actual);
  if(e.size<2||a.size<2)return false;
  let common=0;for(const t of e)if(a.has(t))common++;
  return common>=2 && common/Math.min(e.size,8)>=0.36;
}
function decodeHtml(s:string):string {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function pageTitle(html:string):string {
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]) {
    if(/(?:property|name)\s*=\s*["']og:title["']/i.test(tag)) {
      const value=tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
      if(value)return decodeHtml(value);
    }
  }
  // Official monthly briefs may use H4/H5 headings.
  const heading=html.match(/<h([1-6])\b[^>]*>([\s\S]{5,500}?)<\/h\1>/i)?.[2];
  return decodeHtml((heading||html.match(/<title\b[^>]*>([^<]{5,350})<\/title>/i)?.[1]||'')
    .replace(/<[^>]*>/g,'').trim());
}
function isoDate(value:string):string|null {
  // A publication's *calendar date* must not shift backward in Asia/Seoul.
  // Date.parse('15 October 2026') in KST is Oct 14 UTC. Parse civil dates
  // explicitly before falling back to timezone-aware ISO timestamps.
  const months=['january','february','march','april','may','june',
    'july','august','september','october','november','december'];
  const text=value.trim();
  const dmy=text.match(/^(\d{1,2})\s+([a-z]+)\s+(20\d{2})$/i);
  const mdy=text.match(/^([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})$/i);
  const slash=text.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  let day:number, month:number,year:number;
  if(dmy){day=+dmy[1];month=months.indexOf(dmy[2].toLowerCase())+1;year=+dmy[3];}
  else if(mdy){day=+mdy[2];month=months.indexOf(mdy[1].toLowerCase())+1;year=+mdy[3];}
  else if(slash){month=+slash[1];day=+slash[2];year=+slash[3];}
  else {const n=Date.parse(text);return Number.isFinite(n)?new Date(n).toISOString().slice(0,10):null;}
  if(month<1||month>12)return null;
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day
    ?d.toISOString().slice(0,10):null;
}
/** Find headline in page for body anchoring, not a generic H1 such as "News". */
function articleHeading(html:string, expected:string, actualTitle:string): {index:number;end:number}|null {
  const headings=[...html.matchAll(/<h([1-6])\b[^>]*>[\s\S]{3,900}?<\/h\1>/gi)];
  for(const h of headings) {
    const content=decodeHtml(h[0].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
    if(content.length<8)continue;
    if(originalTitleMatches(expected,content) ||
      originalTitleMatches(actualTitle,content) || content.toLowerCase()===actualTitle.toLowerCase())
      return {index:h.index!,end:h.index!+h[0].length};
  }
  // Official numbered USDA report pages can have a short series heading.
  if(/^wheat outlook(?::\s*[a-z]+\s+20\d{2})?$/i.test(expected)) {
    const h=headings.find(x=>/wheat outlook/i.test(x[0].replace(/<[^>]*>/g,' ')));
    if(h)return {index:h.index!,end:h.index!+h[0].length};
  }
  if(/^arable market report/i.test(expected)){
    const h=headings.find(x=>/arable market report/i.test(x[0].replace(/<[^>]*>/g,' ')));
    if(h)return {index:h.index!,end:h.index!+h[0].length};
  }
  if(/^FAO Cereal Supply and Demand Brief$/i.test(expected)){
    const h=headings.find(x=>/cereal supply and demand brief/i.test(x[0].replace(/<[^>]*>/g,' ')));
    if(h)return {index:h.index!,end:h.index!+h[0].length};
  }
  return null;
}
function pageDate(html:string, headingEnd:number, domain:string):string|null {
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]) {
    if(/(?:property|name|itemprop)\s*=\s*["'](?:article:published_time|datePublished|pubdate|publication_date|date)["']/i.test(tag)) {
      const v=tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
      if(v&&isoDate(v))return isoDate(v);
    }
  }
  const jsonDate=html.match(/"datePublished"\s*:\s*"([^"\n]+)"/i)?.[1];
  if(jsonDate&&isoDate(jsonDate))return isoDate(jsonDate);
  const time=html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i)?.[1];
  if(time&&isoDate(time))return isoDate(time);
  // Strictly inspect text AFTER the matching headline, not navigation or a site-wide current date.
  // Many official report sites have lengthy image/author markup immediately after
  // the H1. Read a longer RAW slice but only the first 1,800 plain-text characters
  // after the matched article heading, to avoid unrelated archive/footer dates.
  const near=decodeHtml(html.slice(headingEnd,headingEnd+14000)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
    .replace(/<(?:nav|aside|footer)\b[^>]*>[\s\S]*?<\/(?:nav|aside|footer)>/gi,'')
    .replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').slice(0,1800);
  const written=near.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d\d\b/i)?.[0];
  if(written)return isoDate(written);
  const dayFirst=near.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)\b/i);
  if(dayFirst)return isoDate(`${dayFirst[2]} ${dayFirst[1]}, ${dayFirst[3]}`);
  const iso=near.match(/\b20\d\d-\d\d-\d\d\b/)?.[0];
  if(iso)return isoDate(iso);
  const numeric=near.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(numeric){
    const a=Number(numeric[1]),b=Number(numeric[2]),y=Number(numeric[3]);
    const month=domain.endsWith('fao.org')?b:a;
    const day=domain.endsWith('fao.org')?a:b;
    const v=new Date(Date.UTC(y,month-1,day));
    if(v.getUTCFullYear()===y&&v.getUTCMonth()===month-1&&v.getUTCDate()===day)
      return v.toISOString().slice(0,10);
  }
  return null;
}
export function reasonablePublicationDate(date:unknown):boolean {
  if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return false;
  const t=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(t)&&t>=Date.now()-30*86400000&&t<Date.now()+2*86400000;
}
function wheatTitle(text:string):boolean {
  return /\bwheat\b|(?:밀|소맥)(?!도)|\b(?:wasde|grain|srw|hrw|hrs)\b/i.test(text);
}
function hasWheatEvidence(text:string):boolean {
  return /\bwheat\b|소맥|밀\s*(?:가격|수급|생산|수출|재고)/i.test(text);
}
async function checkDetailed(candidate:Candidate):Promise<Check> {
  const u=publisherUrl(candidate.originalUrl);
  if(!u)return reject('unapproved-or-invalid-url');
  if(!likelyArticlePath(u))return reject('not-a-specific-article');
  // The original publisher's own publication metadata, not a model-guessed date, is authoritative.
  if(candidate.publishedAt && !reasonablePublicationDate(candidate.publishedAt))return reject('invalid-publication-date');
  const isAhdbReport=hostKey(u.hostname)==='ahdb.org.uk' && /^\/news\/arable-market-report-\d{1,2}-[a-z]+-20\d\d\/?$/i.test(u.pathname);
  const isFaoBrief=hostKey(u.hostname)==='fao.org' && /^\/worldfoodsituation\/csdb\/en\/?$/i.test(u.pathname);
  if(!wheatTitle(candidate.rawTitle) && !/\bwheat\b/i.test(u.pathname) &&
     !/\b(?:cereal|food[\s-]+price[\s-]+index)\b/i.test(candidate.rawTitle) && !isAhdbReport)return reject('not-wheat-related');
  const key=`${u.toString()}|${candidate.rawTitle}|${candidate.publishedAt}`;
  const cached=memo.get(key);
  if(cached&&Date.now()-cached.checkedAt<MEMO_MS)return cached.result;
  let result:Check=reject('source-unreachable');
  let response:Response|null=null;
  try {
    let fetchUrl=u.toString();
    for(let hop=0;hop<=2;hop++) {
      response=await fetch(fetchUrl,{
        method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
        headers:{Accept:'text/html,application/xhtml+xml,application/pdf',
          'User-Agent':'Mozilla/5.0 (compatible; RMSLinkVerifier/1.1)'}
      });
      if(![301,302,303,307,308].includes(response.status))break;
      const location=response.headers.get('location');
      await response.body?.cancel().catch(()=>{});
      if(!location){response=null;break;}
      const next=new URL(location,fetchUrl);
      if(!publisherUrl(next.toString())||!likelyArticlePath(next)||hostKey(next.hostname)!==hostKey(u.hostname)) {
        response=null;break;
      }
      fetchUrl=next.toString();response=null;
    }
    if(response?.status===200) {
      const type=(response.headers.get('content-type')||'').toLowerCase();
      if(type.includes('application/pdf')&&/\.pdf$/i.test(new URL(fetchUrl).pathname)) {
        // PDFs are allowed only for direct report URLs, not portal homepages.
        result={allowed:true,reason:'verified-specific-pdf-url'};
        await response.body?.cancel().catch(()=>{});
      }else if(type.includes('html')) {
        const html=(await response.text()).slice(0,500000);
        const title=pageTitle(html);
        const heading=articleHeading(html,candidate.rawTitle,title);
        const isIgcGmr=hostKey(u.hostname)==='igc.int' && /^\/en\/gmr_summary\.aspx$/i.test(u.pathname);
        // The IGC live monthly summary identifies its edition inside the original
        // page text. The dated press index alone is insufficient for acceptance.
        const igcReleaseText=isIgcGmr ? decodeHtml(html.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ') : '';
        const igcEdition=igcReleaseText.match(/IGC Grain Market Report\s*[-–—:]\s*(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})/i);
        const faoText=isFaoBrief && heading?decodeHtml(html.slice(heading.index,heading.index+42000)
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' '))
          .replace(/\s+/g,' '):'';
        const faoLabel=faoText.match(/Release date\s*:\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);
        const faoDate=faoLabel?isoDate(`${faoLabel[3]}-${faoLabel[2].padStart(2,'0')}-${faoLabel[1].padStart(2,'0')}`):null;
        const igcDate=igcEdition?isoDate(igcEdition[1]):null;
        const date=isIgcGmr?igcDate:isFaoBrief?faoDate:(heading?pageDate(html,heading.end,hostKey(u.hostname)):null);
        const soft404=/(?:^|\b)(?:404|page not found|article not found|content not found|page unavailable)(?:\b|$)/i.test(title);
        const headingText=heading?decodeHtml(html.slice(heading.index,heading.end).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()):'';
        const ahdbSlugDate=isAhdbReport?u.pathname.match(/arable-market-report-(\d{1,2})-([a-z]+)-(20\d{2})/i):null;
        const ahdbExpected=ahdbSlugDate?`arable market report ${Number(ahdbSlugDate[1])} ${ahdbSlugDate[2]} ${ahdbSlugDate[3]}`:'';
        const ahdbTitle=headingText.toLowerCase().replace(/[–—-]/g,' ').replace(/\s+/g,' ');
        const ahdbTitleOkay=!!ahdbSlugDate && ahdbTitle.includes(ahdbExpected);
        const faoTitleOkay=isFaoBrief && /^FAO Cereal Supply and Demand Brief$/i.test(candidate.rawTitle) &&
          /cereal supply and demand brief/i.test(headingText);
        // USDA ERS report paths are numbered rather than headline-based. The
        // original publisher's H1 identifies the release even when its og:title
        // contains a generic agency label. Match the independently fetched H1,
        // not merely the discovery index's text or an opaque URL ID.
        const isUsdaOutlook=hostKey(u.hostname)==='ers.usda.gov' && /^\/publications\/\d+\/?$/i.test(u.pathname);
        const usdaExpected=candidate.rawTitle.trim();
        const usdaHeadingOkay=isUsdaOutlook &&
          /^wheat outlook:\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}$/i.test(headingText) &&
          (/^wheat outlook$/i.test(usdaExpected) || usdaExpected.toLowerCase()===headingText.toLowerCase());
        const titleOkay=identityMatches(title,u) || originalTitleMatches(candidate.rawTitle,title) ||
          originalTitleMatches(candidate.rawTitle,headingText) || usdaHeadingOkay ||
          (hostKey(u.hostname)==='ers.usda.gov' && /^\/publications\/\d+\/?$/i.test(u.pathname) &&
            /^wheat outlook(?::\s*[a-z]+\s+20\d{2})?$/i.test(candidate.rawTitle) &&
            /^wheat outlook:\s*[a-z]+\s+20\d{2}(?:\s*[|–-]\s*.*)?$/i.test(title) &&
            (!candidate.rawTitle.includes(':') || title.toLowerCase().startsWith(candidate.rawTitle.toLowerCase()))) ||
          (isIgcGmr && /^Grain Market Report \(GMR\d+\)$/i.test(candidate.rawTitle) &&
            /\bsummary\b/i.test(title) && !!igcEdition) || ahdbTitleOkay || faoTitleOkay;
        const dateOkay=!!date && reasonablePublicationDate(date) &&
          (!candidate.publishedAt || Math.abs(Date.parse(date)-Date.parse(candidate.publishedAt))<=86400000) &&
          (!isAhdbReport || (!!ahdbSlugDate && date===isoDate(`${ahdbSlugDate[2]} ${ahdbSlugDate[1]}, ${ahdbSlugDate[3]}`)));
        // Pull text starting from the article heading, not menus/sidebar links.
        const articleRegion=isIgcGmr?html.slice(0,110000):(heading?html.slice(heading.index,heading.index+65000):'');
        const cleanRegion=articleRegion
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
          .replace(/<(?:nav|footer|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|aside)>/gi,' ');
        const actualText=decodeHtml(cleanRegion.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
        const topical=hasWheatEvidence(actualText.slice(0,isIgcGmr?20000:6500));
        // Source-backed excerpt for Korean summaries, never a Gemini-created snippet.
        // The IGC Summary includes multiple commodities. Keep wheat-bearing
        // sentences from the publisher text, plus essential report context.
        const igcSegments=actualText.split(/(?<=[.!?])\s+/).filter(x=>/wheat|grains|IGC GOI|harvest|stocks/i.test(x));
        const excerpt=(isIgcGmr?igcSegments.join(' '):actualText).slice(0,2600);
        result=soft404?reject('missing-article'):
          !titleOkay?reject('headline-does-not-match-url'):
          !dateOkay?reject('publication-date-unverified'):
          !topical?reject('page-not-about-wheat'):
          (!hasMarketArticleBody(excerpt,title))?reject('article-body-unavailable'):
          {allowed:true,reason:'verified-article',excerpt,verifiedDate:date!};
      }else result=reject('unsupported-response-type');
    }else {result=reject('source-http-error');await response?.body?.cancel().catch(()=>{});}
  } catch {result=reject('source-unreachable');}
  memo.set(key,{result,checkedAt:Date.now()});
  return result;
}
export async function checkWheatArticle(candidate:Candidate):Promise<boolean> {
  return (await checkDetailed(candidate)).allowed;
}
export type WheatNewsCheckSummary = {accepted:number; rejected:number; reasons:Record<string,number>};
export async function verifyWheatNewsLinksReported<T extends RetrievedSourceMetadata>(items:T[]):Promise<{
  accepted:T[]; summary:WheatNewsCheckSummary
}> {
  const accepted:T[]=[];
  const reasons:Record<string,number>={};
  for(let i=0;i<items.length;i+=MAX_PARALLEL) {
    const batch=items.slice(i,i+MAX_PARALLEL);
    const checks=await Promise.all(batch.map(async item=>checkDetailed({rawTitle:item.rawTitle,publishedAt:item.publishedAt,originalUrl:item.originalUrl})));
    checks.forEach((check,index)=>{
      if(check.allowed && check.excerpt && !!check.excerpt.trim() && check.verifiedDate) {
        // Save the actual publisher date, never an unconfirmed model date.
        accepted.push({...batch[index],rawSnippet:check.excerpt,publishedAt:check.verifiedDate});
      } else {
        const why=check.allowed?'insufficient-publisher-text':check.reason;
        reasons[why]=(reasons[why]||0)+1;
      }
    });
  }
  return {accepted,summary:{accepted:accepted.length,rejected:items.length-accepted.length,reasons}};
}
export async function verifyWheatNewsLinks<T extends RetrievedSourceMetadata>(items:T[]):Promise<T[]> {
  return (await verifyWheatNewsLinksReported(items)).accepted;
}
/** Revalidate existing saved links without paying Gemini or modifying the snapshot. */
export async function sanitizeSavedWheatNews(payload:any):Promise<any> {
  if(!payload?.success||!Array.isArray(payload.articles))return {success:true,articles:[],verifiedLinkCount:0,
    verificationSummary:{saved:0,accepted:0,rejected:0,reasons:{'invalid-snapshot':1}}};
  const articles:MarketArticle[]=payload.articles;
  const safe:MarketArticle[]=[];
  const reasons:Record<string,number>={};
  for(let i=0;i<articles.length;i+=MAX_PARALLEL) {
    const batch=articles.slice(i,i+MAX_PARALLEL);
    const checks=await Promise.all(batch.map(async item=>checkDetailed({
      rawTitle:item.sourceHeadline||item.title,
      publishedAt:item.publication_date||item.publishedAt,
      originalUrl:item.originalUrl||item.original_url
    })));
    checks.forEach((check,j)=>{
      if(check.allowed)safe.push({...batch[j],linkStatus:'verified',linkCheckedAt:new Date().toISOString()});
      else reasons[check.reason]=(reasons[check.reason]||0)+1;
    });
  }
  return {...payload,articles:safe,verifiedLinkCount:safe.length,
    verificationSummary:{saved:articles.length,accepted:safe.length,rejected:articles.length-safe.length,reasons},
    linkPolicy:'wheat-publisher-article-identity-publication-date-and-relevance'};
}
