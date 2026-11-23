/** Deterministic selection from previously verified, published commodity news.
 * No searches, model calls, new assertions or quota-filling. Priority is not
 * the only signal: a concrete market change, recency and distinct commodity
 * coverage all matter. Review scores are tie-breakers, not fact validation. */
export type OverviewIssue={
  url:string;publishedAt:string;priority?:number;theme?:string;
  sourceType?:string;commodities:string[];title?:string;summary?:string;
  procurementReview?:{score?:number;marketChange?:string;purchasingImplication?:string};
  [key:string]:any
};
const priority=(a:OverviewIssue)=>Math.max(0,Math.min(4,Number(a.priority)||0));
const significance=(theme:string)=>/crop|weather|yield|logistic|freight|biofuel|ethanol|stocks|stockpile|tariff|policy/i.test(theme)?3:/balance|supply|regional-prices|export|imports|demand/i.test(theme)?2:1;
const reviewScore=(a:OverviewIssue)=>Number.isFinite(Number(a.procurementReview?.score))?Number(a.procurementReview?.score):0;

/** Signal strength for an *already verified* summary. This never creates an
 * event, changes its wording or asserts market causality. General editorial
 * distinctions, not publisher/commodity/article exceptions. */
export function overviewMarketDevelopmentStrength(a:OverviewIssue):number {
  const title=String(a.title||'').trim();
  const summary=String(a.summary||'').trim();
  const text=title+' '+summary;
  const direct=/가격|시세|선물|재고|수급|공급|수요|수확|작황|단수|생산량|수출량|수입량|수출 리스크|수입 규제|관세|선적|운임|가뭄|crop yield|production|inventor|stock|supply|demand|price|futures?|freight|tariff|shipment|import controls?|export risk/i;
  const movement=/증가|감소|상향|하향|상승|하락|급등|급락|축소|확대|조정|강화|완화|차질|중단|부족|타이트|변동|압박|제한|규제|조절|rise|fall|increase|decrease|cut|adjust|tighten|disrupt|restrict|shortage|lower|raise|premium/i;
  const urgent=/공격|봉쇄|파업|제재|수출 금지|수입 금지|수입 규제|수출 규제|차질|중단|부족|리스크 프리미엄|대규모 피해|attack|blockade|strike|sanction|embargo|disrupt|shortage|risk premium/i;
  const peripheral=/명칭 변경|조직 개편|인사|수상|장비|설비|기계|renam|rebrand|award|machinery|equipment/i;
  // Institutional and equipment developments are indirect unless their own
  // headline also states a direct change in commodity markets.
  if(peripheral.test(title)&&!direct.test(title))return 0;
  if(direct.test(title)&&urgent.test(title))return 3;
  if(direct.test(title)&&movement.test(title))return 2;
  if(direct.test(title))return 1;
  if(direct.test(text)&&movement.test(text))return 1;
  return 0;
}

const freshness=(a:OverviewIssue,now:number)=>{
  const date=Date.parse(String(a.publishedAt||''));
  if(!Number.isFinite(date)||date>now)return 0;
  const age=(now-date)/86400000;
  return age<=14?Math.max(1,8-Math.floor(age)):age<=30?1:0;
};
/** Market relevance precedes source recency, but a newer material event can
 * outrank older background even when the latter is official or cross-listed. */
export function rankOverviewIssues(candidates:OverviewIssue[],max=4,now=Date.now()):OverviewIssue[]{
 const selected:OverviewIssue[]=[],covered=new Set<string>(),used=new Set<string>();
 const limit=Math.min(4,Math.max(0,Math.floor(Number.isFinite(max)?max:4)));
 while(selected.length<limit){
  const left=candidates.filter(a=>a?.url&&!used.has(a.url));
  if(!left.length)break;
  const coverage=(a:OverviewIssue)=>a.commodities.filter(id=>!covered.has(id)).length;
  const merit=(a:OverviewIssue)=>priority(a)*5+overviewMarketDevelopmentStrength(a)*6+
    significance(String(a.theme||''))+freshness(a,now)+Math.min(2,coverage(a))+
    Number(a.sourceType==='official');
  left.sort((a,b)=>merit(b)-merit(a)||
    overviewMarketDevelopmentStrength(b)-overviewMarketDevelopmentStrength(a)||
    coverage(b)-coverage(a)||reviewScore(b)-reviewScore(a)||
    String(b.publishedAt).localeCompare(String(a.publishedAt))||
    a.url.localeCompare(b.url));
  const next=left[0];selected.push(next);used.add(next.url);
  next.commodities.forEach(id=>covered.add(id));
 }
 return selected;
}
