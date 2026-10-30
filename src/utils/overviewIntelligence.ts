/** Deterministic excerpts of effective published fields; no independent market forecast. */
import {decisionBrief} from './overviewDecisionBrief';
import {rmsAiEditorial} from './rmsAiEditorial';
import {marketIntelligenceSourceLabel} from '../components/CommodityNews';
import {eligibleMarketIssue} from './marketIssueEligibility';
export const OVERVIEW_COMMODITIES=[['wheat','밀','grains'],['corn','옥수수','grains'],['soybean','대두','grains'],['soybean-oil','대두유','oils'],['palm-oil','팜유','oils'],['sugar','원당','sweeteners'],['potato-starch','감자전분','starches'],['tapioca-starch','타피오카전분','starches']] as const;
export type SavedOverviewInput={id:string;analysis:any|null;articles:any[]};
const sentences=(text:string)=>String(text||'').split(/(?<=다\.)\s+|\n+/u).map(t=>t.trim()).filter(Boolean);
const group=(id:string)=>OVERVIEW_COMMODITIES.find(c=>c[0]===id)?.[2]||id;
const label=(id:string)=>OVERVIEW_COMMODITIES.find(c=>c[0]===id)?.[1]||id;
export function aggregateOverview(inputs:SavedOverviewInput[],now=Date.now()){
 const analyses=inputs.flatMap(({id,analysis})=>{if(!analysis?.generatedAt||!analysis.executiveSummary||!analysis.deskRecommendation||analysis.status&&!['live','cached'].includes(analysis.status))return[];const p=rmsAiEditorial(id,analysis.generatedAt,analysis.sources||[],analysis);return[{id,...analysis,...p.fields,sources:p.sources}];});
 const fragments:any[]=[];
 const opening=(a:any)=>sentences(a.executiveSummary)[0]||'';
 // Supply burdens and constrained supply are kept separate; one sentence cannot
 // become a forecast for another crop. Sector/stance diversity precedes repeats.
 const score=(a:any)=>Number(/우선 확보|먼저 확보/.test(a.deskRecommendation))*4+Number(/장기 선구매 유보/.test(a.deskRecommendation))*3+Number(/관망|대기|유보/.test(a.deskRecommendation))*2+Number(/확보 전환/.test(a.deskRecommendation))*2;
 const ranked=[...analyses].sort((a,b)=>score(b)-score(a)||b.generatedAt.localeCompare(a.generatedAt)||a.id.localeCompare(b.id));
 const directives:any[]=[],groups=new Set<string>();for(const a of ranked){if(directives.length===3)break;if(groups.has(group(a.id)))continue;groups.add(group(a.id));directives.push({commodity:a.id,name:label(a.id),recommendation:a.deskRecommendation,reason:opening(a),generatedAt:a.generatedAt});}
 const missing=OVERVIEW_COMMODITIES.filter(c=>!analyses.some(a=>a.id===c[0])).map(c=>c[0]);
 const decision=decisionBrief(analyses);fragments.push(...decision.fragments);const brief=decision.text;
 const byUrl=new Map<string,any>();for(const input of inputs)for(const a of input.articles||[]){if(!eligibleMarketIssue(a,now)||a.linkStatus!=='verified'||!a.summary)continue;const key=a.originalUrl.replace(/\/$/,'');const inferredPriority=/생산|재고|단수|수출|공급|관세|바이오연료|가뭄|강수|선적|운임/.test(a.title+' '+a.summary)?4:2;const priority=a.procurementReview?.reviewedAt?a.procurementReview.priority:inferredPriority;const existing=byUrl.get(key);if(existing){existing.commodities=[...new Set([...existing.commodities,input.id])];existing.priority=Math.max(existing.priority,priority);continue;}byUrl.set(key,{...a,id:key,url:a.originalUrl,source:marketIntelligenceSourceLabel(a.sourceName,a.originalUrl),commodities:[input.id],priority,theme:a.procurementReview?.theme||'market',risk:null,direction:null});}
 // Fresh accepted developments precede older context; quality still ranks within each window.
 const freshness=(a:any)=>{const age=(now-Date.parse(a.publishedAt))/86400000;return age<=14?2:age<=30?1:0;};
 const significance=(theme:string)=>/crop|weather|logistic|ethanol|biofuel|stocks/.test(theme)?3:/balance|supply|regional-prices|export/.test(theme)?2:1;
 const issueScore=(a:any)=>Math.min(4,Math.max(0,Number(a.priority)||0))*2+Math.max(0,30-(now-Date.parse(a.publishedAt))/86400000)+Math.min(2,a.commodities.length-1)+significance(a.theme)+Number(a.sourceType==='official');
 const issues:any[]=[],themes=new Set<string>(),covered=new Set<string>(),publishers=new Set<string>();
 while(issues.length<4){
  const left=[...byUrl.values()].filter(a=>!issues.includes(a));if(!left.length)break;
  // Freshness is an eligibility gate, not a reason to show four nearly identical
  // stories about the same crop. Prefer uncovered commodities within the same
  // 14-day publication window, then a different publisher/theme and relevance.
  const novel=(a:any)=>a.commodities.some((id:string)=>!covered.has(id));
  const publisher=(a:any)=>String(a.sourceName||a.source||'').trim().toLowerCase();
  left.sort((a,b)=>freshness(b)-freshness(a)||
   Number(novel(b))-Number(novel(a))||
   Number(!publishers.has(publisher(b)))-Number(!publishers.has(publisher(a)))||
   Number(!themes.has(b.theme))-Number(!themes.has(a.theme))||
   issueScore(b)-issueScore(a)||Number(b.sourceType==='official')-Number(a.sourceType==='official')||
   Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.url.localeCompare(b.url));
  const a=left[0];issues.push(a);themes.add(a.theme);publishers.add(publisher(a));a.commodities.forEach((id:string)=>covered.add(id));
 }
 const dates=analyses.map(a=>a.generatedAt).sort();return{brief,issues,directives,fragments,missing,analyses:analyses.map(a=>({id:a.id,generatedAt:a.generatedAt,deskRecommendation:a.deskRecommendation})),sourceDates:dates.length?`${dates[0].slice(0,10)}–${dates.at(-1)!.slice(0,10)}`:'',inputArticleCount:inputs.reduce((n,v)=>n+v.articles.length,0),distinctArticleCount:byUrl.size};
}
export async function loadOverviewIntelligence(fetcher:typeof fetch=fetch,signal?:AbortSignal){
 let publication:any=null;try{const r=await fetcher('/api/rms/free-publication',{signal,cache:'no-store'});if(r.ok)publication=await r.json();}catch{}
 // The daily bundle is a fallback, not a permanently authoritative news/AI snapshot.
 const saved:SavedOverviewInput[]=publication?.version===1&&Array.isArray(publication.data?.inputs)?publication.data.inputs:[];
 const inputs=await Promise.all(OVERVIEW_COMMODITIES.map(async([id])=>{
  const prior=saved.find(p=>p.id===id);
  const [a,n]=await Promise.allSettled([fetcher('/api/ai-analysis/'+id,{signal,cache:'no-store'}).then(async r=>r.ok?await r.json():Promise.reject(Error('Saved analysis unavailable'))),fetcher('/api/market-intelligence?commodity='+id,{signal,cache:'no-store'}).then(async r=>r.ok?await r.json():Promise.reject(Error('Saved news unavailable')))]);
  // An authoritative successful news read may legitimately contain ZERO verified
  // articles (expired, invalid receipt, source rejection). Never resurrect an
  // older, potentially invalid news card from the Overview publication in that
  // case. Only use the previously published fallback when the news API itself
  // was unavailable or did not return a valid response.
  const newsAvailable=n.status==='fulfilled'&&n.value?.success&&Array.isArray(n.value.articles);
  const articles=newsAvailable?n.value.articles.filter((v:any)=>!v.unavailable&&v.linkStatus==='verified'&&v.originalUrl&&v.summary&&Number.isFinite(Date.parse(v.publishedAt))&&Date.parse(v.publishedAt)<=Date.now()):null;
  return{id,analysis:a.status==='fulfilled'?(a.value?.success?a.value.data:null):prior?.analysis||null,articles:articles??prior?.articles??[]};
 }));
 const result=aggregateOverview(inputs);
 try{const response=await fetcher('/api/overview/comparison',{signal,cache:'no-store'});if(response.ok){const comparison=await response.json();result.brief=result.brief.replace('[전일 대비 주요 변화] 전일 비교 데이터 없음','[전일 대비 주요 변화] '+comparison.message);}}
 catch{/* No comparison must never become an invented unchanged market. */}
 return result;
}
