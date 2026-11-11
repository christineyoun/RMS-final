/** Deterministic excerpts of effective published fields; no independent market forecast. */
import {decisionBrief} from './overviewDecisionBrief';
import {rankOverviewIssues} from './overviewIssueRanking';
import {rmsAiEditorial} from './rmsAiEditorial';
import {marketIntelligenceSourceLabel} from '../components/CommodityNews';
export const OVERVIEW_COMMODITIES=[['wheat','밀','grains'],['corn','옥수수','grains'],['soybean','대두','grains'],['soybean-oil','대두유','oils'],['palm-oil','팜유','oils'],['sugar','원당','sweeteners'],['potato-starch','감자전분','starches'],['tapioca-starch','타피오카전분','starches']] as const;
export type SavedOverviewInput={id:string;analysis:any|null;articles:any[]};
const sentences=(text:string)=>String(text||'').split(/(?<=다\.)\s+|\n+/u).map(t=>t.trim()).filter(Boolean);
const group=(id:string)=>OVERVIEW_COMMODITIES.find(c=>c[0]===id)?.[2]||id;
const label=(id:string)=>OVERVIEW_COMMODITIES.find(c=>c[0]===id)?.[1]||id;
export function aggregateOverview(inputs:SavedOverviewInput[],now=Date.now()){
 const analyses=inputs.flatMap(({id,analysis})=>{if(!analysis?.generatedAt||!analysis.executiveSummary||!analysis.deskRecommendation)return[];const p=rmsAiEditorial(id,analysis.generatedAt,analysis.sources||[],analysis);return[{id,...analysis,...p.fields,sources:p.sources}];});
 const fragments:any[]=[];
 const opening=(a:any)=>sentences(a.executiveSummary)[0]||'';
 // Supply burdens and constrained supply are kept separate; one sentence cannot
 // become a forecast for another crop. Sector/stance diversity precedes repeats.
 const score=(a:any)=>Number(/우선 확보|먼저 확보/.test(a.deskRecommendation))*4+Number(/장기 선구매 유보/.test(a.deskRecommendation))*3+Number(/관망|대기|유보/.test(a.deskRecommendation))*2+Number(/확보 전환/.test(a.deskRecommendation))*2;
 const ranked=[...analyses].sort((a,b)=>score(b)-score(a)||b.generatedAt.localeCompare(a.generatedAt)||a.id.localeCompare(b.id));
 const directives:any[]=[],groups=new Set<string>();for(const a of ranked){if(directives.length===3)break;if(groups.has(group(a.id)))continue;groups.add(group(a.id));directives.push({commodity:a.id,name:label(a.id),recommendation:a.deskRecommendation,reason:opening(a),generatedAt:a.generatedAt});}
 const missing=OVERVIEW_COMMODITIES.filter(c=>!analyses.some(a=>a.id===c[0])).map(c=>c[0]);
 const decision=decisionBrief(analyses.map(a=>({...a,name:label(a.id),group:group(a.id)})));fragments.push(...decision.fragments);const brief=decision.text;
 const byUrl=new Map<string,any>();for(const input of inputs)for(const a of input.articles||[]){if(a.unavailable||a.linkStatus!=='verified'||!a.originalUrl||!a.summary||!Number.isFinite(Date.parse(a.publishedAt))||Date.parse(a.publishedAt)>now)continue;const key=a.originalUrl.replace(/\/$/,'');const inferredPriority=/생산|재고|단수|수출|공급|관세|바이오연료|가뭄|강수|선적|운임/.test(a.title+' '+a.summary)?4:2;const priority=a.procurementReview?.reviewedAt?a.procurementReview.priority:inferredPriority;const existing=byUrl.get(key);if(existing){existing.commodities=[...new Set([...existing.commodities,input.id])];existing.priority=Math.max(existing.priority,priority);continue;}byUrl.set(key,{...a,id:key,url:a.originalUrl,source:marketIntelligenceSourceLabel(a.sourceName,a.originalUrl),commodities:[input.id],priority,theme:a.procurementReview?.theme||'market',risk:null,direction:null});}
 // Procurement significance and coverage precede source freshness.
 const issues=rankOverviewIssues([...byUrl.values()]);
 const dates=analyses.map(a=>a.generatedAt).sort();return{brief,issues,directives,fragments,missing,analyses:analyses.map(a=>({id:a.id,generatedAt:a.generatedAt,deskRecommendation:a.deskRecommendation})),sourceDates:dates.length?`${dates[0].slice(0,10)}–${dates.at(-1)!.slice(0,10)}`:'',inputArticleCount:inputs.reduce((n,v)=>n+v.articles.length,0),distinctArticleCount:byUrl.size};
}
export async function loadOverviewIntelligence(fetcher:typeof fetch=fetch,signal?:AbortSignal){
 const inputs=await Promise.all(OVERVIEW_COMMODITIES.map(async([id])=>{
  const [a,n]=await Promise.allSettled([fetcher('/api/ai-analysis/'+id,{signal,cache:'no-store'}).then(async r=>r.ok?await r.json():Promise.reject(Error('Saved analysis unavailable'))),fetcher('/api/market-intelligence?commodity='+id,{signal,cache:'no-store'}).then(async r=>r.ok?await r.json():Promise.reject(Error('Saved news unavailable')))]);
  const articles=n.status==='fulfilled'&&n.value?.success&&Array.isArray(n.value.articles)?n.value.articles.filter((v:any)=>!v.unavailable&&v.linkStatus==='verified'&&v.originalUrl&&v.summary&&Number.isFinite(Date.parse(v.publishedAt))&&Date.parse(v.publishedAt)<=Date.now()):[];
  // A saved bundle is not a substitute for approved STEP 7 publication.
  // Explicitly omit unavailable analyses; older news cannot become a current issue.
  return{id,analysis:a.status==='fulfilled'&&a.value?.success?a.value.data:null,
    articles:articles.filter((v:any)=>Date.now()-Date.parse(v.publishedAt)<=30*86400000)};
 }));
 const result=aggregateOverview(inputs);
 // Region metadata is delivered by the original commodity MI API, not fetched
 // or inferred independently by Overview. No duplicate network calls.
 try{const response=await fetcher('/api/overview/comparison',{signal,cache:'no-store'});if(response.ok){const comparison=await response.json();result.brief=result.brief.replace('[전일 대비 주요 변화] 전일 비교 데이터 없음','[전일 대비 주요 변화] '+comparison.message);}}
 catch{/* No comparison must never become an invented unchanged market. */}
 return result;
}
