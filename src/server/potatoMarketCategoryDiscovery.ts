/** Potato market archive discovery (not publication approval).
 * Discover NEW article URLs from a publisher-owned, dated category page;
 * a separate existing verifier must retrieve the original article and confirm
 * its actual potato-starch procurement relevance and publication date.
 */
import {load} from 'cheerio';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';

export const POTATO_MARKET_INDEX='https://commodity-board.com/category/potato-market-news-prices-global-supply-demand-outlook';
const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const TOPIC=/(?:potato|potat[oO]NL|starch|avebe|lyckeby)/i;
const MARKET=/(?:prices?|pricing|crops?|harvest|suppl(?:y|ies)|demand|stocks?|processing|starch|markets?|yields?|exports?|imports?|production|costs?|shortage|trade|quotations?|outlook)/i;

function archiveDate(text:string,now:Date):string|null{
  const patterns=[
    /\b([A-Za-z]{3,9})\.?\s+([0-3]?\d),?\s+(20\d{2})\b/g,
    /\b([0-3]?\d)\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/g,
    /\b(20\d{2})-(\d{2})-(\d{2})\b/g
  ];
  for(let p=0;p<patterns.length;p++){
    for(const m of text.matchAll(patterns[p])){
      const mo=p===2 ? +m[2]-1 : MONTHS.indexOf((p===0?m[1]:m[2]).slice(0,3).toLowerCase());
      const day=p===2?+m[3]:+(p===0?m[2]:m[1]);
      const year=+(p===2?m[1]:m[3]);
      if(mo<0||mo>11)continue;
      const d=new Date(Date.UTC(year,mo,day,12));
      if(d.getUTCFullYear()!==year||d.getUTCMonth()!==mo||d.getUTCDate()!==day)continue;
      if(d.getTime()>now.getTime()+86400000||now.getTime()-d.getTime()>30*86400000)continue;
      return d.toISOString().slice(0,10);
    }
  }
  return null;
}

export function parsePotatoMarketCategory(html:string,now=new Date()):RetrievedSourceMetadata[]{
  const $=load(html),results:RetrievedSourceMetadata[]=[];
  // RMS_MI_POTATO_CATEGORY_DATE_FIX_V6
  const bodyText=clean($('body').text());
  const seen=new Set<string>();
  $('a[href]').slice(0,500).each((i,element)=>{
    try{
      const link=$(element);
      const title=clean(link.text());
      if(title.length<28||title.length>240||!TOPIC.test(title)||!MARKET.test(title))return;
      const u=new URL(link.attr('href')||'',POTATO_MARKET_INDEX);
      if(u.protocol!=='https:'||u.hostname!=='commodity-board.com'||u.port||u.username||u.password||
         !/^\/[a-z][a-z0-9-]+\/?$/.test(u.pathname))return;
      u.hash='';u.search='';
      if(seen.has(u.href))return;
      let item=link;
      let date:null|string=null;
      for(let depth=0;depth<7;depth++){
        item=item.parent();
        if(!item.length)break;
        const content=clean(item.text());
        if(content.length>1300)break;
        const published=item.find('time[datetime]').first().attr('datetime');
        if(published)date=archiveDate(published,now);
        if(!date){
          const at=content.indexOf(title);
          // RMS_MI_POTATO_V7_FIX: preserve date boundaries.
          const nearby=at>=0?content.slice(Math.max(0,at-300),at)+' '+content.slice(at+title.length,at+title.length+300):content;
          date=archiveDate(nearby,now);
        }
        if(date)break;
      }
      if(!date){
        // The archive displays dates shortly after article titles.
        // This is candidate metadata, not original-source approval.
        const pos=bodyText.indexOf(title);
        if(pos>=0){
          date=archiveDate(
            bodyText.slice(pos+title.length,pos+title.length+160),
            now
          );
        }
      }
      if(!date)return;
      seen.add(u.href);
      results.push({rawId:'potato-category-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,
        publishedAt:date,sourceName:'Commodity Board',sourceType:'news',retrievedAt:now.toISOString()});
    }catch{}
  });
  return results.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,12);
}

export async function discoverPotatoMarketCategory(fetcher:typeof fetch=fetch,now=new Date()){
 try{
   const r=await fetcher(POTATO_MARKET_INDEX,{redirect:'error',signal:AbortSignal.timeout(9500),
     headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 (compatible; RMS Market Quality/1.0)'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   if(!String(r.headers.get('content-type')||'').toLowerCase().includes('html'))
     throw Error('not-html');
   const html=await r.text();
   if(html.length>2_000_000)throw Error('oversized-archive');
   return {candidates:parsePotatoMarketCategory(html,now),errors:[] as string[]};
 }catch(e){
   return {candidates:[] as RetrievedSourceMetadata[],
     errors:['Commodity Board potato archive: '+(e instanceof Error?e.message:'unavailable')]};
 }
}
