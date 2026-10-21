import {collectSoybeanOilArticleEvidence} from './soybeanOilAnalysisEvidence.ts';
/** Free original-source preparation for approved AI jobs. Never runs on page views,
 * changes news snapshots, or treats a generated news summary as primary evidence. */
import fs from 'node:fs';
import {collectSoybeanArticleEvidence} from './soybeanAnalysisEvidence.ts';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {collectAnalysisEvidence,trustedAnalysisUrl,validAnalysisFact,type AnalysisFact} from './analysisEvidence.ts';
import {selectMarketEvidence} from './newsEvidenceQuality.ts';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const topics:Record<string,RegExp>={soybean:/soybeans?|soya\s*beans?|대두/i,'soybean-oil':/soybean\s*oil|soya\s*oil|soyoil|대두유/i,
  'palm-oil':/palm\s*oil|palm\s*olein|\bCPO\b|팜유/i,sugar:/sugar|원당|설탕/i,'potato-starch':/potato\s*starch|starch\s*potato|potato\s*processing|감자.*전분/i};
export function originalArticleFact(html:string,sourceUrl:string,publishedAt:string,id:string,verifiedAt:string):AnalysisFact|null {
  if(!trustedAnalysisUrl(sourceUrl)||!topics[id]||html.length<500||html.length>2_000_000)return null;
  const $=load(html);const bodyText=$('body').text().replace(/\s+/g,' ');
  const mpob=new URL(sourceUrl).hostname==='prestasisawit.mpob.gov.my';
  const mpobTitle=mpob?/MARKET DEVELOPMENT\s+(.+?)\s+(?:calendar)?\d{2}-\d{2}-20\d{2}/.exec(bodyText)?.[1]:undefined;
  const title=($('meta[property="og:title"]').attr('content')||mpobTitle||$('h1').first().text()).replace(/\s+/g,' ').trim();
  const jsonDate=/"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  const mpobDate=mpob?/(\d{2})-(\d{2})-(20\d{2})\s*\|/.exec(bodyText):null;
  const sunDate=new URL(sourceUrl).hostname.endsWith('sunsirs.com')?/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2} 20\d{2} \d{2}:\d{2}:\d{2}/.exec(bodyText)?.[0]:undefined;
  const rawDate=$('meta[property="article:published_time"]').attr('content')||$('meta[name="date"]').attr('content')||$('time[datetime]').first().attr('datetime')||jsonDate||(mpobDate?`${mpobDate[3]}-${mpobDate[2]}-${mpobDate[1]}`:undefined)||sunDate;
  if(!rawDate||!Number.isFinite(Date.parse(rawDate))||!Number.isFinite(Date.parse(publishedAt)))return null;
  const date=new Date(rawDate).toISOString().slice(0,10),now=new Date(verifiedAt);
  if(date!==new Date(publishedAt).toISOString().slice(0,10)||Date.parse(date)>now.getTime()||now.getTime()-Date.parse(date)>31*86400000||!topics[id].test(title))return null;
  $('script,style,noscript,nav,footer,header,aside').remove();
  const root=$('article,main,[itemprop="articleBody"],.article-content,.news-content').first();
  const paragraphs=(root.length?root:$('body')).find('p').toArray().map(p=>$(p).text().replace(/\s+/g,' ').trim());
  const selected=selectMarketEvidence(paragraphs,id,1800);
  if(!selected.anchorCount)return null;
  const excerpt=selected.excerpt.split(/(?<=[.!?])\s+/).find(s=>s.length>=45&&s.length<=650&&topics[id].test(s));
  if(!excerpt)return null;
  const fact:AnalysisFact={id:'article-'+sha(sourceUrl).slice(0,16),commodity:id,topic:id==='palm-oil'?'팜유':id==='soybean-oil'?'대두유':id==='soybean'?'대두':id==='sugar'?'설탕':'감자전분',
    text:`${date} ${title} 원문 인용: “${excerpt}”`,sourceUrl,sourceTitle:title,observedAt:date,verifiedAt,verification:'original-record',recordSha256:sha(html)};
  return validAnalysisFact(fact,id,now)?fact:null;
}
export async function prepareAnalysisEvidence(id:string,root=process.cwd(),now=new Date(),options:{fetchSources?:boolean;fetcher?:typeof fetch}={}){
  const evidence=collectAnalysisEvidence(id,root,now),dir=path.join(root,'.rms-stage3/evidence/articles');
  if(id==='soybean-oil'){const articles=collectSoybeanOilArticleEvidence(root,now);evidence.facts.push(...articles.facts);evidence.failures.push(...articles.failures);return evidence;}
  if(id==='soybean'){const articles=collectSoybeanArticleEvidence(root,now);evidence.facts.push(...articles.facts);evidence.failures.push(...articles.failures);return evidence;}
  let articles:any[]=[];
  try{articles=JSON.parse(fs.readFileSync(path.join(root,`.rms-stage3/snapshots/news-${id}.json`),'utf8')).payload?.articles||[];}catch{/* no saved articles */}
  if(id==='palm-oil'&&fs.existsSync(path.join(root,'.rms-stage3/palm-news-verified.json'))){const {readVerifiedPalmNews}=await import('./palmVerifiedNews.ts');articles=readVerifiedPalmNews(root,now);}
  const candidates=[...new Map(articles.filter(a=>!a.unavailable&&a.originalUrl&&a.publishedAt&&trustedAnalysisUrl(a.originalUrl)).map(a=>[a.originalUrl,a])).values()].slice(0,id==='palm-oil'?4:3);
  const results=await Promise.all(candidates.map(async article=>{
    // Revalidate retained original content, not the saved Korean AI summary.
    if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(n=>/^article-[a-f0-9]{64}\.json$/.test(n)))try{
      const receipt=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
      if(receipt.sourceUrl!==article.originalUrl||sha(receipt.html)!==receipt.sha256||name!==`article-${receipt.sha256}.json`||now.getTime()-Date.parse(receipt.verifiedAt)>7*86400000)continue;
      const fact=originalArticleFact(receipt.html,receipt.sourceUrl,article.publishedAt,id,receipt.verifiedAt);if(fact&&validAnalysisFact(fact,id,now))return fact;
    }catch{/* malformed receipt never establishes an assertion */}
    if(options.fetchSources===false){evidence.failures.push('article-original-not-retained:'+article.originalUrl);return null;}
    try{
      const response=await (options.fetcher||fetch)(article.originalUrl,{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{Accept:'text/html'}});
      if(!response.ok||!response.headers.get('content-type')?.includes('html'))throw Error('HTTP '+response.status);
      const reader=response.body?.getReader();if(!reader)throw Error('empty-body');
      const chunks:Uint8Array[]=[];let length=0;
      try{while(true){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>2_000_000){await reader.cancel();throw Error('body-limit');}chunks.push(r.value);}}finally{reader.releaseLock();}
      const html=Buffer.concat(chunks).toString('utf8'),verifiedAt=now.toISOString();
      const fact=originalArticleFact(html,article.originalUrl,article.publishedAt,id,verifiedAt);
      if(!fact)throw Error('date-topic-or-original-passage-not-verified');
      fs.mkdirSync(dir,{recursive:true,mode:0o700});const digest=sha(html),file=path.join(dir,`article-${digest}.json`);
      if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({sourceUrl:article.originalUrl,verifiedAt,sha256:digest,html}),{flag:'wx',mode:0o600});
      return fact;
    }catch(error){evidence.failures.push('article:'+article.originalUrl+':'+String((error as Error).message));return null;}
  }));
  evidence.facts.push(...results.filter((f):f is AnalysisFact=>!!f));
  return evidence;
}
