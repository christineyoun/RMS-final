/**
 * Wheat-only no-AI discovery from original-publisher indexes.
 * Index links are CANDIDATES, never verified articles. The normal original-page
 * verifier must independently confirm page identity, publisher date and text.
 * A short RSS description is never passed off as the article body.
 */
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';

const INDEXES = [
  { url: 'https://uswheat.org/wheat-letter-blog/', host: 'uswheat.org', publisher: 'U.S. Wheat Associates', type: 'official' as const },
  { url: 'https://www.ers.usda.gov/topics/crops/wheat/market-outlook', host: 'ers.usda.gov', publisher: 'USDA ERS', type: 'official' as const },
  // The USDA home page links directly to the newest numbered Wheat Outlook release.
  { url: 'https://www.ers.usda.gov/', host: 'ers.usda.gov', publisher: 'USDA ERS', type: 'official' as const },
  // AHDB public grain market reporting; all articles independently verified.
  { url: 'https://ahdb.org.uk/Query/4458?title=Latest+cereals+and+oilseeds+market+news', host: 'ahdb.org.uk', publisher: 'AHDB', type: 'official' as const },
  { url: 'https://www.fao.org/newsroom/', host: 'fao.org', publisher: 'FAO', type: 'official' as const },
  { url: 'https://www.fao.org/worldfoodsituation/FoodPricesIndex/en/', host: 'fao.org', publisher: 'FAO', type: 'official' as const },
  { url: 'https://www.fao.org/markets-and-trade/', host: 'fao.org', publisher: 'FAO', type: 'official' as const },
];
const dateLimit = (date: string): boolean => {
  const millis = Date.parse(date+'T00:00:00Z');
  return Number.isFinite(millis) && millis >= Date.now()-30*86400000 && millis<=Date.now()+86400000;
};
const htmlText = (s: string): string => s.replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
const sameHost = (raw: string, host: string): boolean => {
  try { const u=new URL(raw);return u.protocol==='https:' && u.hostname.replace(/^www\./,'')===host && !u.username&&!u.password&&!u.port; }
  catch{return false;}
};
export const wheatDiscoveryPriority = (s: string): number => {
  const t=s.toLowerCase();
  let result = 0;
  if(/wheat|srw|hrw|hrs|grain|cereal|crop|food price|food-price/i.test(t))result+=3;
  if(/export|import|supply|demand|forecast|price|quality survey|stocks|crop|production|outlook|shipping|trade|black sea|harvest|transport|grain world|grain: world/i.test(t))result+=6;
  if(/usda|wasde|market|grain|fao/i.test(t))result+=2;
  if(/awards|reaches.*camp|nomination|leaders|training|course|farm broadcaster|congratulat|staff|jobs|director|charity|food assistance/i.test(t))result-=12;
  return result;
};
const realArticleLink = (url: string, host: string): boolean => {
  if(!sameHost(url,host))return false;
  const p=new URL(url).pathname;
  if(host==='uswheat.org')return /^\/wheatletter\/[^/]{18,}\/?.*$/i.test(p);
  if(host==='ers.usda.gov')return /^\/publications\/\d{4,}\/?.*$/i.test(p);
  if(host==='fao.org')return /^\/newsroom\/detail\/[^/]{18,}\/?.*$/i.test(p);
  if(host==='ahdb.org.uk')return /^\/news\/arable-market-report-\d{1,2}-[a-z]+-20\d\d\/?$/i.test(p);
  return false;
};
/** Parse only source-owned links, never Google or third-party redirects. */
export function parseWheatPublicIndex(html: string, index: typeof INDEXES[number], retrievedAt: string): RetrievedSourceMetadata[] {
  const found: RetrievedSourceMetadata[]=[];
  const links=html.matchAll(/<a\b([^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a\s*>/gi);
  let n=0;
  for(const match of links) {
    let absolute='';
    try {absolute=new URL(match[2].replace(/&amp;/gi,'&'),index.url).href;}catch{continue;}
    if(!realArticleLink(absolute,index.host))continue;
    let title=htmlText(match[3]);
    if(index.host==='ers.usda.gov' && (!title || /^report$/i.test(title) || /^see the latest/i.test(title))) {
      title='Wheat Outlook'; // Series label only; publisher heading/date must confirm the specific release.
    }
    if(title.length<6 || /^(?:read more|view more|details|click here)$/i.test(title)) continue;
    if(index.host==='ers.usda.gov' && !/^wheat outlook(?::|$)/i.test(title))continue;
    if(index.host==='uswheat.org' && wheatDiscoveryPriority(title)<5)continue;
    if(index.host==='fao.org' && !/wheat|grain|cereal|food price|food-price/i.test(title))continue;
    if(index.host==='ahdb.org.uk') {
      if(!/arable market report/i.test(title))continue;
      const m=absolute.match(/arable-market-report-(\d{1,2})-([a-z]+)-(20\d\d)/i);
      if(!m)continue;
      title=`Arable Market Report – ${Number(m[1])} ${m[2][0].toUpperCase()+m[2].slice(1)} ${m[3]}`;
    }
    // The date is intentionally empty until independently read from original article.
    found.push({rawId:`wheat-index-${index.host}-${n++}`,rawTitle:title,rawSnippet:'',
      sourceName:index.publisher,sourceType:index.type,publishedAt:'',originalUrl:absolute,
      retrievedAt,category:'시장 동향',affectedRegion:'글로벌'});
  }
  const seen=new Set<string>();
  return found.filter(c=>{if(seen.has(c.originalUrl))return false;seen.add(c.originalUrl);return true;}).slice(0,32);
}

/** Public IGC press index identifies the current numbered release and its date.
 * We verify the full official report summary separately; the index is never
 * used as the summary excerpt. IGC exposes a live URL, not a permalink. */
export function parseIgcPressReleaseIndex(html: string, retrievedAt: string): RetrievedSourceMetadata[] {
  const plain=htmlText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' '));
  const match=plain.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\s+Grain Market Report\s*\((GMR\d+)\)/i);
  if(!match)return [];
  // Date.parse('15 October 2026') uses local midnight on Korean Macs,
  // creating an incorrect UTC date of Oct 14. Build the civil date in UTC.
  const dmy=match[1].match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  const months=['january','february','march','april','may','june','july',
    'august','september','october','november','december'];
  if(!dmy)return [];
  const month=months.indexOf(dmy[2].toLowerCase())+1;
  if(month<1)return [];
  const year=Number(dmy[3]),day=Number(dmy[1]);
  const millis=Date.UTC(year,month-1,day);
  const check=new Date(millis);
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return [];
  const date=check.toISOString().slice(0,10);
  if(!dateLimit(date))return [];
  return [{rawId:`igc-${match[2].toLowerCase()}`,rawTitle:`Grain Market Report (${match[2]})`,
    rawSnippet:'',sourceName:'International Grains Council',sourceType:'official',
    publishedAt:date,originalUrl:'https://www.igc.int/en/gmr_summary.aspx',
    retrievedAt,category:'시장 동향',affectedRegion:'글로벌'}];
}

async function discoverIgcReport(retrievedAt:string):Promise<{
  candidates:RetrievedSourceMetadata[];error?:string;okay:boolean
}> {
  const url='https://igc.int/en/public-site/press.aspx';
  try {
    let current=url;let response:Response|null=null;
    for(let hop=0;hop<3;hop++) {
      response=await fetch(current,{redirect:'manual',headers:{Accept:'text/html',
        'User-Agent':'Mozilla/5.0 (compatible; RMSWheatOfficial/1.0)'},signal:AbortSignal.timeout(9000)});
      if(![301,302,303,307,308].includes(response.status))break;
      const location=response.headers.get('location');
      await response.body?.cancel().catch(()=>{});
      if(!location)throw Error('redirect-without-location');
      const next=new URL(location,current);
      if(!sameHost(next.href,'igc.int'))throw Error('external-or-unsafe-redirect');
      current=next.href;
    }
    if(!response?.ok)throw Error(`HTTP ${response?.status||'none'}`);
    if(!/html/i.test(response.headers.get('content-type')||''))throw Error('not-html');
    const candidates=parseIgcPressReleaseIndex((await response.text()).slice(0,500000),retrievedAt);
    return {candidates,okay:true};
  } catch(e) {return {candidates:[],okay:false,error:`IGC (${url}): ${String((e as Error).message||e).slice(0,90)}`};}
}

/** A short-lived verified-by-publisher-URL candidate, not synthetic news. Retires automatically after 30 days. */
function datedOfficialCandidates(retrievedAt: string): RetrievedSourceMetadata[] {
  const dated=[
    {date:'2026-10-02',title:'FAO Food Price Index rises in September amid weather concerns and transport disruptions',
      url:'https://www.fao.org/newsroom/detail/fao-food-price-index-rises-in-september-amid-weather-concerns-and-transport-disruptions/en',publisher:'FAO'},
  ];
  return dated.filter(x=>dateLimit(x.date)).map((x,i)=>({rawId:`wheat-official-release-${i}`,rawTitle:x.title,
    rawSnippet:'',sourceName:x.publisher,sourceType:'official',publishedAt:x.date,originalUrl:x.url,
    retrievedAt,category:'시장 동향',affectedRegion:'글로벌'}));
}

export async function discoverWheatPublicPages(retrievedAt=new Date().toISOString()): Promise<{
  candidates:RetrievedSourceMetadata[]; diagnostics:{indexesTried:number;indexesRead:number;validCandidates:number;errors:string[]}
}> {
  const errors:string[]=[];
  const [responses,igc]=await Promise.all([Promise.all(INDEXES.map(async index=>{
    try {
      let current=index.url;
      let response:Response|null=null;
      for(let hop=0;hop<3;hop++) {
        response=await fetch(current,{headers:{'Accept':'text/html,application/xhtml+xml',
          'User-Agent':'Mozilla/5.0 (compatible; RMSWheatPublicIndex/1.1)'},
          signal:AbortSignal.timeout(9000),redirect:'manual'});
        if(![301,302,303,307,308].includes(response.status))break;
        const location=response.headers.get('location');
        await response.body?.cancel().catch(()=>{});
        if(!location)throw new Error('redirect-without-location');
        const next=new URL(location,current);
        if(!sameHost(next.href,index.host))throw new Error('external-or-unsafe-redirect');
        current=next.href;
      }
      if(!response?.ok)throw new Error(`HTTP ${response?.status || 'none'}`);
      const url=new URL(response.url || current);
      if(!sameHost(url.href,index.host))throw new Error('unexpected-redirect');
      if(!/html/i.test(response.headers.get('content-type')||''))throw new Error('not-html');
      const html=(await response.text()).slice(0,900000);
      return {okay:true,candidates:parseWheatPublicIndex(html,index,retrievedAt)};
    } catch(err) {
      errors.push(`${index.publisher} (${index.url}): ${String((err as Error).message||err).slice(0,80)}`);
      return {okay:false,candidates:[] as RetrievedSourceMetadata[]};
    }
  })),discoverIgcReport(retrievedAt)]);
  if(igc.error)errors.push(igc.error);
  // Rolling FAO publication: actual report date must be read from its page on
  // every check. This URL is not a frozen article permalink.
  const faoBrief:RetrievedSourceMetadata={rawId:'fao-cereal-brief',rawTitle:'FAO Cereal Supply and Demand Brief',
    rawSnippet:'',sourceName:'FAO',sourceType:'official',publishedAt:'',
    originalUrl:'https://www.fao.org/worldfoodsituation/csdb/en',
    retrievedAt,category:'시장 동향',affectedRegion:'글로벌'};
  const collected=[...responses.flatMap(x=>x.candidates),...igc.candidates,faoBrief,...datedOfficialCandidates(retrievedAt)];
  const seen=new Set<string>();
  const candidates=collected.sort((a,b)=>wheatDiscoveryPriority(b.rawTitle)-wheatDiscoveryPriority(a.rawTitle))
    .filter(x=>{const key=x.originalUrl.toLowerCase().replace(/\/$/,'');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,36);
  return {candidates,diagnostics:{indexesTried:INDEXES.length+1,indexesRead:responses.filter(x=>x.okay).length+(igc.okay?1:0),
    validCandidates:candidates.length,errors}};
}
