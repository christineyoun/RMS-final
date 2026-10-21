/**
 * Free-first discovery of original Wheat publisher URLs from public RSS feeds.
 * A feed entry is ONLY a candidate. The existing independent Wheat original-page
 * verifier must check title, original publication date and Wheat article body.
 * No Gemini calls, paid APIs, RSS mirrors or news aggregator redirect links.
 */
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';

type Feed = { url: string; publisher: string; host: string };
export const WHEAT_PUBLIC_FEEDS: readonly Feed[] = [
  {url: 'https://www.world-grain.com/rss/topic/1351-wheat', publisher: 'World Grain',host: 'world-grain.com'},
  {url: 'https://www.world-grain.com/rss/articles', publisher: 'World Grain',host: 'world-grain.com'},
  {url: 'https://www.northernag.net/feed/', publisher: 'Northern Ag Network',host: 'northernag.net'},
  {url: 'https://commodity-board.com/feed/', publisher: 'Commodity Board',host: 'commodity-board.com'},
  {url: 'https://www.graincentral.com/markets/feed/', publisher: 'Grain Central',host: 'graincentral.com'},
  {url: 'https://www.graincentral.com/trade/feed', publisher: 'Grain Central',host: 'graincentral.com'},
  // Removed misleading /production/feed: it redirects to HTML, not RSS.
];
function decodeXml(text: string): string {
  return text.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;|&#x27;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/<[^>]+>/g,'').trim();
}
function field(xml:string,tag:string):string {
  const v=xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`,'i'))?.[1];
  return v?decodeXml(v):'';
}
function isoDate(text:string):string {
  if(!text)return '';
  const t=Date.parse(text);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';
}
const wheatTopic=(title:string,link:string)=>/\bwheat\b|\bwasde\b|\bhrw\b|\bsrw\b|\bhrs\b|소맥|밀\s*(?:시장|가격|수급)/i.test(title+' '+link);
// Prefer information with direct implications for procurement rather than generic wheat mentions.
export const wheatProcurementScore = (title:string):number => {
  const s=title.toLowerCase();
  return (/(?:price|market|futures|settlement|basis|wheat supplies|wasde|export|import|trade|stocks|production|harvest|crop|yield|drought|weather|black sea|russia|ukraine|tariff|freight|shipping|usda)/i.test(s)?4:0) +
    (/(?:wheat|hrw|srw|hrs)/i.test(s)?2:0) -
    (/(?:recipe|baking|pasta|flour mill equipment|health benefits|consumer food)/i.test(s)?8:0);
};
function validPublisherArticle(url:string,host:string):boolean {
  try {
    const u=new URL(url);
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    return u.protocol==='https:' && h===host &&
      !u.username&&!u.password&&(!u.port||u.port==='443') &&
      u.pathname.length>16 && !/\/(?:feed|rss|search|category|tag)(?:\/|$)/i.test(u.pathname) &&
      !/\.(?:jpg|png|gif|xml|zip)$/i.test(u.pathname);
  } catch {return false;}
}
export function parseWheatPublisherFeed(xml:string,feed:Feed,retrievedAt:string):RetrievedSourceMetadata[] {
  const now=Date.now();
  const items=[...(xml.match(/<item\b[^>]*>[\s\S]*?<\/item\s*>/gi)||[]),
    ...(xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry\s*>/gi)||[])];
  const entries: RetrievedSourceMetadata[]=[];
  for(const [i,item] of items.entries()) {
    const title=field(item,'title');
    const atomLink=item.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    const link=field(item,'link') || (atomLink?decodeXml(atomLink):'');
    const date=isoDate(field(item,'pubDate')||field(item,'published')||field(item,'updated')||field(item,'dc:date'));
    const millis=date?Date.parse(date+'T00:00:00Z'):NaN;
    if(!title||!validPublisherArticle(link,feed.host)||!wheatTopic(title,link) || wheatProcurementScore(title)<2 ||
      !date||!Number.isFinite(millis)||millis<now-30*86400000||millis>now+86400000)continue;
    entries.push({rawId:`rss-${feed.host}-${i}`,rawTitle:title,rawSnippet:'',
      sourceName:feed.publisher,sourceType:'news',publishedAt:date,
      originalUrl:link,retrievedAt,category:'시장 동향',affectedRegion:'글로벌'});
  }
  return entries;
}
export async function discoverWheatPublisherFeeds(retrievedAt=new Date().toISOString()):Promise<{
  candidates:RetrievedSourceMetadata[]; diagnostics:{feedsTried:number;feedsRead:number;validCandidates:number;errors:string[]}
}> {
  const errors:string[]=[];
  const results=await Promise.all(WHEAT_PUBLIC_FEEDS.map(async feed=>{
    try {
      let response:Response|null=null;
      let current=feed.url;
      for(let hop=0;hop<3;hop++) {
        response=await fetch(current,{headers:{Accept:'application/rss+xml,application/xml,text/xml',
          'User-Agent':'Mozilla/5.0 (compatible; RMSWheatFeedDiscovery/1.0)'},
          signal:AbortSignal.timeout(7000),redirect:'manual'});
        if(![301,302,303,307,308].includes(response.status))break;
        const location=response.headers.get('location');
        await response.body?.cancel().catch(()=>{});
        if(!location)throw new Error('feed-redirect-without-location');
        const next=new URL(location,current);
        const host=next.hostname.toLowerCase().replace(/^www\./,'');
        if(next.protocol!=='https:'||host!==feed.host||next.username||next.password||
          (next.port&&next.port!=='443'))throw new Error('unexpected-feed-redirect');
        current=next.href;
      }
      if(!response?.ok)throw new Error(`HTTP ${response?.status||'none'}`);
      const final=new URL(response.url || current);
      const h=final.hostname.toLowerCase().replace(/^www\./,'');
      if(h!==feed.host)throw new Error('unexpected-feed-redirect');
      const body=(await response.text()).slice(0,1100000);
      if(!/<(?:rss|feed|item|entry)\b/i.test(body))throw new Error('not-rss');
      return {okay:true,items:parseWheatPublisherFeed(body,feed,retrievedAt)};
    } catch(e) { errors.push(`${feed.publisher} (${feed.url}): ${String((e as Error).message||e).slice(0,70)}`);
      return {okay:false,items:[] as RetrievedSourceMetadata[]};}
  }));
  const seen=new Set<string>();
  const candidates=results.flatMap(r=>r.items).sort((a,b)=>
      wheatProcurementScore(b.rawTitle)-wheatProcurementScore(a.rawTitle) || b.publishedAt.localeCompare(a.publishedAt))
    .filter(x=>{const key=x.originalUrl.split('?')[0].replace(/\/$/,'').toLowerCase();if(seen.has(key))return false;seen.add(key);return true;})
    .slice(0,24);
  return {candidates,diagnostics:{feedsTried:WHEAT_PUBLIC_FEEDS.length,
    feedsRead:results.filter(r=>r.okay).length,validCandidates:candidates.length,errors}};
}
