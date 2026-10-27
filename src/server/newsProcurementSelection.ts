import fs from 'node:fs';
import path from 'node:path';
/** Selection/editorial policy AFTER existing source verification. No discovery,
 * provider calls, fact approval, text-length limit or persistent side effects. */
import {createHash} from 'node:crypto';
import reviewed from '../data/news_procurement_reviews.json';
import {assessNewsSummary} from '../utils/newsSummaryQuality.ts';
type Item={originalUrl:string;publishedAt:string;title:string;summary:string;sourceName?:string;sourceType?:string;unavailable?:boolean;[key:string]:any};
type ReviewMap=Record<string,Array<{url:string;publishedAt:string;sourceSummarySha256:string;priority:number;theme:string;eventKey:string;decision:string;rationale:string;title?:string;summary?:string}>>;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function selectProcurementNews<T extends Item>(commodity:string,verified:T[],now=Date.now()):T[]{
 let current:typeof reviewed=reviewed;try{current=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/data/news_procurement_reviews.json'),'utf8'));}catch{/* Verified new articles do not depend on a local editorial file. */}
 if(!current?.reviews)return [];
 const reviews=current.reviews as ReviewMap;
 const seen=new Set<string>();
 const candidates=verified.flatMap((article,index)=>{
  const url=String(article.originalUrl||'').replace(/\/$/,''),date=Date.parse(article.publishedAt);
  if(article.unavailable||seen.has(url)||!Number.isFinite(date)||date>now||!assessNewsSummary(article.summary,article.title,commodity).pass)return [];
  seen.add(url);
  const r=reviews[commodity]?.find(r=>r.url===article.originalUrl&&r.publishedAt===article.publishedAt&&r.sourceSummarySha256===hash(article.summary));
  if(r?.decision==='omit')return [];
  // Bound summaries retain the exact wording validated against their receipt.
  // Editorial selection metadata may rank/omit; it cannot rewrite that evidence binding.
  const title=article.verifiedSourceEvidence?article.title:r?.title||article.title,summary=article.verifiedSourceEvidence?article.summary:r?.summary||article.summary;
  // A reviewed cross-commodity summary must identify this crop, like any saved card.
  if(!assessNewsSummary(summary,title,commodity).pass)return [];
  const text=title+' '+summary;
  const promotional=/innovation award|wins? .*award|수상|혁신상|수출 주문.*접수|견적 요청/i.test(text);
  const driver=/가격|공급|수요|재고|수확|단수|관세|수출|수입|바이오연료|운임|물류|가뭄|강수|생산|price|stock|supply|demand|yield|freight|tariff/i.test(text);
  if(!r&&(promotional||!driver))return [];
  // Editorial verification/wording remains authoritative, but historic review
  // tiers are not a permanent ranking advantage over newly verified reporting.
  const signals=[/생산|수확|단수|작황|crop|production|yield|harvest/i,/소비|수요|착유|demand|consumption|crush/i,/재고|stocks?|inventor/i,/가격|호가|선물|price|futures?|offers?/i,/수출|수입|교역|exports?|imports?|trade/i,/관세|정책|바이오연료|에탄올|tariff|policy|biofuel|ethanol/i,/운임|물류|선적|freight|logistics|shipping/i];
  const relevance=signals.reduce((n,re)=>n+Number(re.test(text)),0);
  const development=/증가|감소|상향|하향|하락|상승|축소|확대|차질|부족|늘|줄|raised|lowered|rise|fell|cut|disrupt|shortage|increase|decrease/i.test(text);
  const priority=Math.min(4,relevance+Number(development)),credibility=article.sourceType==='official'?3:article.sourceType==='company'?1:2;
  const age=Math.max(0,(now-date)/86400000),timeliness=age<=7?3:age<=14?2:age<=30?1:0;
  const score=priority*2+timeliness*2+credibility;
  return[{article:{...article,title,summary,...('title_kr' in article?{title_kr:title}:{}),...('summary_kr' in article?{summary_kr:summary}:{}),procurementReview:{kind:'independently-reviewed-news-selection',priority,legacyPriority:r?.priority,score,ageDays:age,theme:r?.theme||'market-development',rationale:'Verified market relevance, material development, source credibility and publication age; legacy approval confers no ranking bonus.',reviewedAt:r?current.reviewedAt:undefined}} as T,priority,score,credibility,timeliness,index,event:r?.eventKey||title.toLowerCase().replace(/\s+/g,'')}];
 });
 // Decision value precedes credibility and age; diversity breaks ties, never fills a quota.
 const result:T[]=[],events=new Set<string>(),publishers=new Set<string>();
 while(result.length<4){const left=candidates.filter(c=>!events.has(c.event));if(!left.length)break;
  left.sort((a,b)=>b.score-a.score||b.priority-a.priority||b.timeliness-a.timeliness||b.credibility-a.credibility||Number(publishers.has(a.article.sourceName||''))-Number(publishers.has(b.article.sourceName||''))||b.article.publishedAt.localeCompare(a.article.publishedAt)||a.index-b.index);
  const next=left[0];result.push(next.article);events.add(next.event);publishers.add(next.article.sourceName||'');
 }
 return result;
}
