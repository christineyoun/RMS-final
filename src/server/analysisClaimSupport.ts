import {verifiedReferenceContext} from './analysisReferenceContext.ts';
/** Claim capabilities are derived from verified records, never model labels.
 * This is a small evidence contract, not a free-text entailment engine. */
import type {AnalysisFact} from './analysisEvidence.ts';

export const CLAIM_ASPECTS=['price-level','interval-change','sustained-price-trend','inventory-level','inventory-change',
  'inventory-adequacy','stock-balance-forecast','production','consumption','exports','production-proxy','planting-progress','weather-signal','crush-input','production-input-ratio','total-supply','modeled-price-scenario'] as const;
export type ClaimAspect=typeof CLAIM_ASPECTS[number];
export type ClaimSupport={evidenceId:string;aspect:ClaimAspect};
type Metric='price'|'inventory'|'production'|'consumption'|'exports'|'planting'|'weather'|'crush'|'ratio'|'totalSupply';
const vocabulary:Record<Metric,RegExp>={
  crush:/압착|착유|\bcrush(?:ing)?\b/i,
  ratio:/질량비|환산율|생산\/원료|생산\/압착|mass ratio/i,
  totalSupply:/총공급|total supply/i,
  planting:/파종|planting|sowing/i,
  weather:/기상|고온|강수|weather|rainfall|heat/i,
  price:/가격|종가|시세|선물\s*일봉|반등|상승세|하락세|강세|약세|공표가격|견적|오퍼|\bprice\b|\bclose\b/i,
  inventory:/재고|\bstocks?\b|inventor/i,
  production:/생산|수확|작황|\bproduction\b|\bharvest\b/i,
  consumption:/소비|수요|\bconsumption\b|\bdemand\b/i,
  exports:/수출|선적|\bexports?\b|\bshipment/i,
};
// Soybean oil must never be resolved as whole soybeans. Benchmark aliases are
// identity, not proof of a measurement/trend; metrics are checked separately.
const subjects:Record<string,RegExp>={
  'palm-cpo':/\bCPO\b|\bFCPO(?:c1)?\b|원유팜유|원유\s*팜유/i,
  'palm-olein':/\b(?:RBD\s*)?(?:palm\s*)?olein\b|\bFPOL(?:c1)?\b|올레인/i,
  'palm-oil':/팜유|palm\s*oil/i,
  'soybean-oil':/대두유|soybean\s*oil|soya\s*oil|soyoil/i,
  soybean:/대두(?!유)|soybeans?(?!\s*oil)|soya\s*beans?/i,
  sugar:/원당|설탕|sugar/i,
  'potato-starch':/감자\s*전분|potato\s*starch/i,
  'raw-potato':/원료감자|감자\s*(?:생산|수확)|raw[ -]potato|potato\s*production/i,
};
export function claimMetrics(text:string,refs:AnalysisFact[]=[]):Metric[]{
  const metrics=(Object.keys(vocabulary) as Metric[]).filter(k=>vocabulary[k].test(text));
  // Resolve an instrument observation by its verified measurement identity,
  // not a mandatory spelling of "price". Volumes/positions are different metrics.
  if(!metrics.includes('price')&&/(?:선물|futures|CBOT)/i.test(text)&&/(?:관측|observation)/i.test(text)&&
    !/(?:거래량|미결제|계약\s*수|volume|open interest)/i.test(text)&&
    refs.some(f=>f.measure?.metric==='price'&&/^CBOT:/.test(f.measure.benchmark)))metrics.push('price');
  // 수출 수요 is an exports premise, not a claim about total consumption.
  return metrics.includes('exports')&&!/소비|consumption/i.test(text)?metrics.filter(m=>m!=='consumption'):metrics;
}
function namedSubjects(text:string):string[]{
  const clean=text.replace(/대두유|soybean\s*oil|soya\s*oil|soyoil/gi,'SOY_OIL');
  return Object.entries(subjects).filter(([id,re])=>id==='soybean-oil'?re.test(text):re.test(clean)).map(([id])=>id);
}
export function factClaimContext(f:AnalysisFact){
  // Earlier retained responses predate measure metadata. Resolve only known
  // original-record ID + source + canonical metric forms; never use model prose.
  const legacyPsd=!f.measure&&/^https:\/\/api\.fas\.usda\.gov\/api\/psd\/commodity\/\d+\/world\/year\/\d{4}$/.test(f.sourceUrl)&&
    /^USDA PSD \d{4}-\d{2} 보고:/.test(f.text)?({'psd-28':'생산','psd-176':'기말재고','psd-88':'수출','psd-20':'기초재고','psd-125':'소비'} as Record<string,string>)[f.id]:undefined;
  const legacyPrice=!f.measure&&((f.id==='palm-cpo-'+f.observedAt&&f.sourceUrl==='https://www.investing.com/commodities/palm-oil-historical-data')||
    (f.id==='palm-olein-'+f.observedAt&&f.sourceUrl==='https://www.investing.com/commodities/rbd-palm-olein-historical-data'))&&/공표 종가 \d+(?:\.\d+)? (?:MYR|USD)\/MT\.$/.test(f.text);
  const aspects:ClaimAspect[]=[];const metric=f.measure?.metric||legacyPsd||(legacyPrice?'price':undefined);
  if(metric==='raw-soybean-crush-input')aspects.push('crush-input');
  if(metric==='production-crush-ratio')aspects.push('production-input-ratio');
  if(metric==='oil-total-supply')aspects.push('total-supply');
  if(metric==='modeled-price-scenario')aspects.push('modeled-price-scenario');
  if(metric==='reported-inventory-change')aspects.push('inventory-change');
  if(metric==='planting-progress')aspects.push('planting-progress');
  if(metric==='weather-screen')aspects.push('weather-signal');
  if(metric==='price')aspects.push('price-level');
  if(f.comparison?.metric==='price'){
    aspects.push('interval-change');
    if(f.comparison.monotonic&&f.comparison.observationCount>=3&&f.comparison.direction!=='unchanged')aspects.push('sustained-price-trend');
  }
  if(metric==='기초재고'||metric==='기말재고')aspects.push('inventory-level');
  if(f.comparison?.metric==='annual-stock-forecast-balance')aspects.push('stock-balance-forecast');
  if(f.comparison?.metric==='verified-inventory-adequacy')aspects.push('inventory-adequacy');
  if(f.comparison?.metric==='observed-inventory')aspects.push('inventory-change');
  if(metric==='생산')aspects.push('production');
  if(metric==='소비')aspects.push('consumption');
  if(metric==='수출')aspects.push('exports');
  if(metric==='raw-potato-production')aspects.push('production-proxy');
  // A retained original quotation supports the *reported* metric only. A title,
  // URL or generated summary cannot confer quantitative/adequacy capabilities.
  const quote=f.id.startsWith('article-')?/원문 인용: “([\s\S]+)”$/.exec(f.text)?.[1]:undefined;
  if(quote){
    for(const m of claimMetrics(quote)){
      if(m==='inventory'){
        aspects.push('inventory-level');
        if(/(?:rose|fell|increas|decreas|증가|감소)[\s\S]*\bfrom\b|(?:전월|지난달|대비)[\s\S]*(?:증가|감소)/i.test(quote))aspects.push('inventory-change');
      }else if(m==='production'||m==='consumption'||m==='exports')aspects.push(m);
      // Article price mentions are not dated benchmark closes or trends.
    }
  }
  const identity=f.measure?.benchmark==='palm-cpo'||legacyPrice&&f.id.startsWith('palm-cpo-')?'palm-cpo':f.measure?.benchmark==='palm-olein'||legacyPrice&&f.id.startsWith('palm-olein-')?'palm-olein':
    metric==='raw-potato-production'?'raw-potato':metric==='raw-soybean-crush-input'||metric==='weather-screen'&&f.measure?.scope.includes('upstream-soybean-grid-model')?'soybean':f.commodity;
  return {subject:identity,aspects:[...new Set(aspects)],valueKind:f.measure?.valueKind??'attributed-report'};
}
const aspectMetric:Record<ClaimAspect,Metric>={
  'price-level':'price','interval-change':'price','sustained-price-trend':'price',
  'inventory-level':'inventory','inventory-change':'inventory','inventory-adequacy':'inventory','stock-balance-forecast':'inventory',
  production:'production',consumption:'consumption',exports:'exports','production-proxy':'production','planting-progress':'planting','weather-signal':'weather','crush-input':'crush','production-input-ratio':'ratio','total-supply':'totalSupply','modeled-price-scenario':'price',
};
/** Resolve premise identity from the verified ID/benchmark/metric, with bilingual
 * aliases only for matching explicit references. No requirement to repeat 팜유
 * when the claim and record are already in the same commodity's report. */
export function validateClaimReferences(premise:string,refs:AnalysisFact[],support?:ClaimSupport[],options:{adviceTarget?:boolean;assertionScope?:boolean}={}):string[]{
  const issues:string[]=[],metrics=claimMetrics(premise,refs),named=namedSubjects(premise);
  const contexts=refs.map(f=>({fact:f,...factClaimContext(f)}));
  for(const symbol of premise.matchAll(/\b(ZS|ZL)(?:=F)?\b/gi))if(refs.some(f=>f.measure?.metric==='price')&&!refs.some(f=>f.measure?.benchmark.toUpperCase()==='CBOT:'+symbol[1].toUpperCase()+'=F'))issues.push('unsupported-benchmark-identity:'+symbol[1].toUpperCase());
  if(refs.some(f=>f.commodity==='soybean-oil')){
    if(/\bZS(?:=F)?\b/i.test(premise))issues.push('oil-benchmark-ZS-not-supported');
    const inventory=refs.filter(f=>factClaimContext(f).aspects.some(a=>['inventory-level','inventory-change','stock-balance-forecast'].includes(a)));
    if(/세계|글로벌|world|global/i.test(premise)&&inventory.length&&inventory.some(f=>f.measure?.scope.startsWith('US:')))issues.push('oil-inventory-geography-mismatch');
    if(/현재|지금|현시점|current/i.test(premise)&&inventory.some(f=>f.measure?.scope.includes('NOPA-members')))issues.push('oil-inventory-reference-period-mismatch');
    if(/USDA/.test(premise)&&inventory.some(f=>f.measure?.scope.includes('NOPA-members')))issues.push('oil-inventory-source-mismatch');
    if(/정제유|현물|도착 원가/.test(premise)&&refs.some(f=>f.measure?.benchmark==='CBOT:ZL=F'))issues.push('futures-not-physical-procurement-price');
  }
  const compatible=(subject:string,target:string)=>subject===target||subject==='palm-oil'&&['palm-cpo','palm-olein'].includes(target);
  const relevant=(c:typeof contexts[number])=>(!named.length||named.some(s=>compatible(s,c.subject)))&&
    metrics.some(m=>c.aspects.some(a=>aspectMetric[a]===m));
  const hasMetric=(m:Metric)=>contexts.some(c=>(!named.length||named.some(s=>compatible(s,c.subject)))&&c.aspects.some(a=>aspectMetric[a]===m));
  // A hypothetical driver need not already be measured (e.g. softer consumption
  // could make exports miss a verified export forecast). But a claim to review
  // *production and consumption forecasts* needs both actual forecast records.
  // Every premise still needs at least one relevant measured/reported baseline.
  const forecastMetrics=claimMetrics([...premise.matchAll(/[^,.!?]{0,45}(?:전망|forecast)/gi)].map(m=>m[0]).join(' '));
  for(const m of metrics)if(!hasMetric(m)&&(!metrics.some(hasMetric)||forecastMetrics.includes(m)||['crush','ratio','totalSupply'].includes(m)))issues.push('claim-evidence-metric-mismatch:'+m);
  if((options.adviceTarget||options.assertionScope)&&/수입국|importer/i.test(premise)&&/수요|소비|demand|consumption/i.test(premise)&&!refs.some(f=>/importer|수입국/i.test(f.measure?.scope||'')))issues.push('unsupported-importer-demand-scope');
  for(const subject of named)if(!contexts.some(c=>compatible(subject,c.subject)))issues.push('claim-evidence-subject-mismatch:'+subject);
  // A planting observation is not an existing regional supply forecast.
  if(/공급\s*(?:확대|증가|감소|축소)?\s*전망/.test(premise)){
    const forecasts=refs.filter(f=>factClaimContext(f).aspects.includes('production')&&f.measure?.valueKind==='forecast');
    if(!forecasts.length)issues.push('unsupported-supply-forecast-premise');
    if(/남미|South America/i.test(premise)&&!forecasts.some(f=>/남미|South America/i.test(f.measure?.scope||'')))issues.push('supply-forecast-geography-mismatch');
  }
  if(options.adviceTarget||options.assertionScope){
    // Scope comes from verified metadata where available, not model-declared
    // support. A named monitoring target must belong to its cited geography.
    const places:Record<string,RegExp>={US:/미국|\bUS\b|United States/i,Brazil:/브라질|\bBrazil\b/i,Argentina:/아르헨티나|\bArgentina\b/i,
      Paraguay:/파라과이|\bParaguay\b/i,Malaysia:/말레이시아|\bMalaysia\b/i,world:/세계|글로벌|\bworld\b|\bglobal\b/i};
    for(const [name,re] of Object.entries(places))if(re.test(premise)&&!refs.some(f=>verifiedReferenceContext(f).geographies.includes(name)||re.test(f.measure?.scope||f.text)))
      issues.push((options.adviceTarget?'advice-evidence-geography-mismatch:':'claim-evidence-geography-mismatch:')+name);
  }
  if(!metrics.length)issues.push('missing-specific-evidence-premise');
  for(const c of contexts)if(!relevant(c))issues.push('irrelevant-evidence-reference:'+c.fact.id);
  if(support!==undefined){
    if(!Array.isArray(support)||!support.length)issues.push('missing-structured-claim-support');
    const entries=Array.isArray(support)?support:[];
    for(const entry of entries){
      const context=contexts.find(c=>c.fact.id===entry?.evidenceId);
      if(!context||!context.aspects.includes(entry.aspect))issues.push('unsupported-structured-claim-support');
      else if(!metrics.includes(aspectMetric[entry.aspect]))issues.push('irrelevant-structured-claim-support');
    }
    for(const c of contexts)if(!entries.some(s=>s?.evidenceId===c.fact.id))issues.push('unmapped-evidence-reference:'+c.fact.id);
  }
  return [...new Set(issues)];
}
