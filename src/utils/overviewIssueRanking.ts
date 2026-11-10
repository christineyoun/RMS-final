/** Rank only previously verified Market Intelligence issues.
 * Approved priority and thematic impact precede freshness. No external calls,
 * synthetic event detection or fill-to-four behavior. */
export type OverviewIssue={url:string;publishedAt:string;priority?:number;theme?:string;sourceType?:string;commodities:string[];procurementReview?:{score?:number};[key:string]:any};
const priority=(a:OverviewIssue)=>Math.max(0,Math.min(4,Number(a.priority)||0));
const significance=(theme:string)=>/crop|weather|yield|logistic|freight|biofuel|ethanol|stocks|stockpile|tariff|policy/i.test(theme)?3:/balance|supply|regional-prices|export|imports|demand/i.test(theme)?2:1;
const reviewScore=(a:OverviewIssue)=>Number.isFinite(Number(a.procurementReview?.score))?Number(a.procurementReview?.score):0;
export function rankOverviewIssues(candidates:OverviewIssue[],max=4):OverviewIssue[]{
 const selected:OverviewIssue[]=[],covered=new Set<string>(),used=new Set<string>();
 while(selected.length<Math.min(4,Math.max(0,max))){
  const left=candidates.filter(a=>a?.url&&!used.has(a.url));
  if(!left.length)break;
  const newCoverage=(a:OverviewIssue)=>a.commodities.filter(id=>!covered.has(id)).length;
  left.sort((a,b)=>priority(b)-priority(a)||
    significance(String(b.theme||''))-significance(String(a.theme||''))||
    newCoverage(b)-newCoverage(a)||
    Number(b.sourceType==='official')-Number(a.sourceType==='official')||
    reviewScore(b)-reviewScore(a)||
    b.commodities.length-a.commodities.length||
    String(b.publishedAt).localeCompare(String(a.publishedAt))||
    a.url.localeCompare(b.url));
  const next=left[0];selected.push(next);used.add(next.url);
  next.commodities.forEach(id=>covered.add(id));
 }
 return selected;
}
