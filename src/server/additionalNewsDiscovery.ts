/** Bounded candidate discovery from publishers already supported by RMS.
 * Feed metadata is never publication approval. Original articles must verify. */
import {load} from 'cheerio';
import {CORN_PUBLIC_SOURCES,cornCivilDate} from './cornVerifiedNews.ts';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';
const crops:Record<string,RegExp>={
 'soybean-oil':/soybean oil|soyoil|soya oil/i,'palm-oil':/palm oil|palm olein|\bCPO\b/i,
 sugar:/sugar|sugarcane/i,'potato-starch':/potato.*starch|starch.*potato|potato.*process/i,
 'tapioca-starch':/tapioca|cassava/i,
};
export function parseAdditionalFeed(xml:string,id:string,source:{url:string;host:string;publisher:string;sourceType:string},now=new Date()):RetrievedSourceMetadata[]{
 const $=load(xml,{xmlMode:true}),out:RetrievedSourceMetadata[]=[];if(!crops[id])return out;
 $('item,entry').slice(0,100).each((i,node)=>{
  const n=$(node),title=n.children('title').text().trim(),link=n.children('link').text().trim()||n.children('link').attr('href')||'';
  const date=cornCivilDate(n.children('pubDate,published,updated').first().text());
  try{const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.replace(/^www\./,'')!==source.host||u.pathname==='/'||!crops[id].test(title)||!date||Date.parse(date)>+now||+now-Date.parse(date)>30*86400000)return;
   out.push({rawId:id+'-feed-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,publishedAt:date,sourceName:source.publisher,sourceType:source.sourceType as any,retrievedAt:now.toISOString()});
  }catch{}
 });return out.slice(0,12);
}
/** Category indexes are public *discovery only*. A link from an index is
 * never a verified article; downstream verification must read the original
 * publisher page, establish its date and validate the article body. */
export const ADDITIONAL_PUBLIC_INDEXES: Partial<Record<string,string[]>> = {
 'soybean-oil':['https://commodity-board.com/category/soybeans-market-news-prices-global-supply-demand-outlook'],
 'palm-oil':['https://commodity-board.com/category/palm-oil-market-news-prices-global-supply-demand-outlook'],
 sugar:['https://commodity-board.com/category/sugar-market-news-prices-global-supply-demand-outlook'],
 // The homepage is a discovery source only; it is not an official starch price.
 'potato-starch':['https://commodity-board.com/'],
 'tapioca-starch':['https://commodity-board.com/'],
};
const indexPublisher={publisher:'Commodity Board'};
export function parseAdditionalIndex(html:string,id:string,indexUrl:string,now=new Date()):RetrievedSourceMetadata[]{
 if(!crops[id])return [];
 const $=load(html),indexHost=new URL(indexUrl).hostname.replace(/^www\./,'');
 const seen=new Set<string>(),items:RetrievedSourceMetadata[]=[];
 $('a[href]').each((i,node)=>{
  if(items.length>=12)return;
  const title=$(node).text().replace(/\s+/g,' ').trim();
  if(title.length<20||title.length>220||!crops[id].test(title))return;
  try{
   const u=new URL($(node).attr('href')||'',indexUrl);u.hash='';
   if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.replace(/^www\./,'')!==indexHost||
      !/^\/[a-z0-9-]{20,}\/?$/.test(u.pathname)||seen.has(u.href))return;
   seen.add(u.href);
   items.push({rawId:id+'-index-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,
      // Unknown until the original article is independently checked. NEVER
      // label the index fetch time as an article publication date.
      publishedAt:'',sourceName:indexPublisher.publisher,sourceType:'news',retrievedAt:now.toISOString()});
  }catch{/* Invalid index link is not a candidate. */}
 });
 return items;
}
export async function discoverAdditionalNews(id:string,fetcher:typeof fetch=fetch,now=new Date()){
 const sources=CORN_PUBLIC_SOURCES.filter(s=>s.kind==='rss').slice(0,3),feedCandidates:RetrievedSourceMetadata[]=[],indexCandidates:RetrievedSourceMetadata[]=[],errors:string[]=[];
 for(const source of sources)try{
  const r=await fetcher(source.url,{redirect:'error',signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('HTTP '+r.status);
  const text=await r.text();if(text.length>1000000)throw Error('Feed too large');feedCandidates.push(...parseAdditionalFeed(text,id,source,now));
 }catch{errors.push(source.publisher+': feed unavailable');}
 for(const indexUrl of ADDITIONAL_PUBLIC_INDEXES[id]||[])try{
  const r=await fetcher(indexUrl,{redirect:'error',signal:AbortSignal.timeout(9000),headers:{Accept:'text/html'}});
  if(!r.ok||!String(r.headers.get('content-type')).includes('html'))throw Error('Index unavailable');
  const html=await r.text();if(html.length>1000000)throw Error('Index too large');
  indexCandidates.push(...parseAdditionalIndex(html,id,indexUrl,now));
 }catch{errors.push('Commodity Board: index unavailable');}
 // Index links have no date yet. Their inclusion does not mean publication
 // eligibility. VerifyOtherCommodityArticles reads and dates originals first.
 const ordered=[...indexCandidates.slice(0,6),...feedCandidates.slice(0,6),...indexCandidates.slice(6),...feedCandidates.slice(6)];
 return {candidates:[...new Map(ordered.map(c=>[c.originalUrl,c])).values()].slice(0,12),errors};
}
