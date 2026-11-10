/** Dynamic starch-potato publisher index. Index dates/links are only hints;
 * the independent original-page verifier must approve the article body.
 */
import {load} from 'cheerio';
import {materialMarketHeadline} from './newsCandidateQuality.ts';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';
const INDEX='https://potatoes.news/tag/potato-starch/';
const headlineTopic=/(?:potato(?:es)?[ -]?starch|starch[ -]?potato(?:es)?|\bavebe\b|\blyckeby\b|\bemsland\b)/i;
const market=/(?:prices?|pricing|contracts?|costs?|markets?|suppl(?:y|ies)|production|output|demand|capacity|stocks?|harvest|yields?|processing|feedstock|exports?|imports?|shortage|industrial)/i;
const trim=(s:string)=>s.replace(/\s+/g,' ').trim();
function dateFrom(text:string,now:Date):string|null{
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const matches=[
  ...text.matchAll(/\b([0-3]?\d)\.([01]?\d)\.(20\d{2})\b/g),
  ...text.matchAll(/\b(20\d{2})-([01]\d)-([0-3]\d)\b/g),
  ...text.matchAll(/\b([A-Za-z]{3,9})\.?\s+([0-3]?\d),?\s+(20\d{2})\b/g)
 ];
 for(const m of matches){
  let day:number,month:number,year:number;
  if(m[0].includes('.')){day=+m[1];month=+m[2];year=+m[3];}
  else if(/^20\d{2}-/.test(m[0])){year=+m[1];month=+m[2];day=+m[3];}
  else {month=months.indexOf(m[1].slice(0,3).toLowerCase())+1;day=+m[2];year=+m[3];}
  if(month<1||month>12)continue;
  const d=new Date(Date.UTC(year,month-1,day,12));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day||
     d.getTime()>now.getTime()+86400000||now.getTime()-d.getTime()>31*86400000)continue;
  return d.toISOString().slice(0,10);
 }
 return null;
}
export function parsePotatoStarchTagIndex(html:string,now=new Date()):RetrievedSourceMetadata[]{
 const $=load(html),out:RetrievedSourceMetadata[]=[],seen=new Set<string>();
 const pageText=trim($('body').text());
 $('a[href]').slice(0,400).each((i,elem)=>{
  try{
   const a=$(elem),title=trim(a.text());
   if(title.length<25||title.length>240||!headlineTopic.test(title)||!market.test(title)||
      !materialMarketHeadline(title))return;
   const u=new URL(a.attr('href')||'',INDEX);
   if(u.protocol!=='https:'||u.hostname!=='potatoes.news'||u.username||u.password||u.port||
      !/^\/[a-z][a-z0-9-]+\/?$/.test(u.pathname)||seen.has(u.pathname))return;
   let node=a,date:string|null=null;
   for(let depth=0;depth<7;depth++){
    node=node.parent();if(!node.length)break;
    const text=trim(node.text());if(text.length>1600)break;
    date=dateFrom(text.replace(title,' '),now);
    if(date)break;
   }
   if(!date){
    // The tag index sometimes renders dates as adjacent siblings, outside
    // the anchor's ancestors. Require a date within 90 characters of title.
    const pos=pageText.indexOf(title);
    if(pos>=0){
     const preceding=pageText.slice(Math.max(0,pos-90),pos);
     const following=pageText.slice(pos+title.length,pos+title.length+90);
     date=dateFrom(following,now)||dateFrom(preceding,now);
    }
   }
   if(!date)return;
   seen.add(u.pathname);
   u.search='';u.hash='';
   out.push({rawId:'potatoes-starch-index-'+i,rawTitle:title,rawSnippet:'',originalUrl:u.href,
    publishedAt:date,sourceName:'Potatoes.News',sourceType:'news',retrievedAt:now.toISOString()});
  }catch{}
 });
 return out.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,8);
}
export async function discoverPotatoStarchTag(fetcher:typeof fetch=fetch,now=new Date()){
 try{
  const res=await fetcher(INDEX,{redirect:'error',signal:AbortSignal.timeout(9000),headers:{Accept:'text/html'}});
  if(!res.ok||!String(res.headers.get('content-type')||'').includes('html'))throw Error('publisher index unavailable');
  const html=await res.text();if(html.length>1500000)throw Error('publisher index too large');
  return {candidates:parsePotatoStarchTagIndex(html,now),errors:[] as string[]};
 }catch{
  return {candidates:[] as RetrievedSourceMetadata[],errors:['Potatoes.News starch index unavailable']};
 }
}
