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
export async function discoverAdditionalNews(id:string,fetcher=fetch){
 const sources=CORN_PUBLIC_SOURCES.filter(s=>s.kind==='rss').slice(0,3),candidates:RetrievedSourceMetadata[]=[],errors:string[]=[];
 for(const source of sources)try{
  const r=await fetcher(source.url,{redirect:'error',signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('HTTP '+r.status);
  const text=await r.text();if(text.length>1000000)throw Error('Feed too large');candidates.push(...parseAdditionalFeed(text,id,source));
 }catch{errors.push(source.publisher+': feed unavailable');}
 return {candidates:[...new Map(candidates.map(c=>[c.originalUrl,c])).values()].slice(0,12),errors};
}
