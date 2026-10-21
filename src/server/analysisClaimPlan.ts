/** Generation-side permissions, derived from verified records. No prose generation,
 * new evidence, provider schema, validation exemptions or execution authorization. */
import {validAnalysisFact,type AnalysisEvidence,type AnalysisFact} from './analysisEvidence.ts';
import {factClaimContext,type ClaimAspect} from './analysisClaimSupport.ts';
import {verifiedReferenceContext} from './analysisReferenceContext.ts';

type Relation={support:Array<{evidenceId:string;aspect:ClaimAspect}>;scope:string;period:string;
  mode:'hypothetical-forecast-revision'|'qualified-reported-revision'|'joint-forecast-scenario';
  driver:string;possibleOutcome:string;requirements:string[]};
const marketAspects=['production','consumption','exports'] as const;
const evidenceScope=(f:AnalysisFact)=>f.measure?.scope||'unspecified: no geographic expansion permitted';
export function deriveAnalysisClaimPlan(evidence:AnalysisEvidence,now=new Date()){
  if(!evidence.facts.length||new Set(evidence.facts.map(f=>f.id)).size!==evidence.facts.length||
    evidence.facts.some(f=>!validAnalysisFact(f,evidence.commodity,now)))throw Error('Claim planning requires unique verified commodity evidence');
  const records=evidence.facts.map(f=>{
    const context=factClaimContext(f),aspects=context.aspects,scope=evidenceScope(f),reference=verifiedReferenceContext(f);
    const point=aspects.includes('weather-signal'),planting=aspects.includes('planting-progress');
    const uses=new Set<string>(['canonical-fact-reference','monitor-reported-metric-in-original-scope']);
    const excludes=new Set<string>(['invented-values-or-dates','guaranteed-purchasing-outcome','uncited-metric-or-geography']);
    const relations:Relation[]=[];
    if(aspects.some(a=>['price-level','interval-change','sustained-price-trend'].includes(a))){
      uses.add('compare-dated-benchmark-or-indicative-offer-with-actual-supplier-quotation');
      uses.add('conditional-purchasing-action-after-commercial-offer-checks');
      if(aspects.includes('interval-change'))uses.add('interpret-only-the-defined-observed-interval');
      if(!aspects.includes('sustained-price-trend'))excludes.add('continued-or-uninterrupted-price-trend');
      excludes.add('futures-or-reference-offer-is-executable-physical-price');
    }
    if(point){
      uses.add('monitor-this-representative-point-and-measured-weather-window');
      for(const limit of ['national-or-region-wide-weather','future-weather-forecast-from-past-measurements','crop-response-or-damage','oil-output-or-processing-effects','weather-to-procurement-cost-causation'])excludes.add(limit);
    }
    if(planting){
      uses.add('compare-reported-planting-progress-only-with-verified-comparator');
      for(const limit of ['continental-supply-or-risk-premium-forecast','planting-progress-is-production-or-yield','unmeasured-crop-response'])excludes.add(limit);
    }
    if(aspects.some(a=>['inventory-level','inventory-change','stock-balance-forecast'].includes(a))){
      uses.add('monitor-next-release-of-the-same-stock-metric-and-scope');
      if(!aspects.includes('inventory-adequacy'))excludes.add('inventory-tightness-or-abundance');
      if(f.measure?.valueKind==='forecast'||aspects.includes('stock-balance-forecast'))excludes.add('annual-forecast-is-observed-monthly-stock-movement');
    }
    if(aspects.includes('consumption'))excludes.add('total-consumption-is-importer-specific-crush-demand');
    if(aspects.includes('crush-input'))uses.add('monitor-raw-input-volume-with-its-reported-member-or-country-coverage');
    if(aspects.includes('production-input-ratio')){uses.add('compare-defined-annual-output-input-mass-ratio');excludes.add('mass-ratio-is-observed-mill-efficiency');}
    if(aspects.includes('modeled-price-scenario')){uses.add('discuss-original-model-scenario-under-its-reported-assumptions');excludes.add('modeled-counterfactual-is-confirmed-outcome');}
    // A forecast supports a hypothetical revision scenario. A current directional
    // revision requires explicit reported revision evidence, not a level alone.
    for(const aspect of marketAspects)if(aspects.includes(aspect)&&f.measure?.valueKind==='forecast'&&f.measure.scope.trim()&&f.measure.benchmark&&f.measure.unit&&!point&&!planting){
      const requirements=['qualify-as-possible-not-observed-price-effect','same-commodity-and-scope','no-guarantee-or-physical-cost-inference'];
      for(const direction of ['increase','decrease'] as const){
        const outcome=aspect==='production'?(direction==='increase'?'downward':'upward'):(direction==='increase'?'upward':'downward');
        const relation:Relation={support:[{evidenceId:f.id,aspect}],scope,period:f.observedAt,mode:'hypothetical-forecast-revision',driver:`future-${aspect}-forecast-${direction}`,possibleOutcome:`possible-${outcome}-futures-market-pressure`,requirements};
        relations.push(relation);
        const revised=/전월|이전|prior|previous/i.test(f.text)&&(direction==='increase'?/상향|증가|raised|increas/i:/하향|감소|lowered|decreas/i).test(f.text);
        if(revised)relations.push({...relation,mode:'qualified-reported-revision',driver:`reported-${aspect}-forecast-${direction}`});
      }
    }
    if(f.measure?.valueKind==='forecast')excludes.add('annual-forecast-is-physical-procurement-price-prediction');
    if(!aspects.length)excludes.add('no-directional-analytical-capability-established');
    return {id:f.id,subject:context.subject,metric:f.measure?.metric??'not-typed',aspects,
      geography:{scope,coverage:point?'representative-point-only':planting?'reported-planting-area-only':f.measure?'exact-measure-scope':'unspecified',verifiedReferenceGeographies:reference.geographies},
      period:{observationOrRelease:f.observedAt,verifiedWindow:f.text.match(/20\d{2}-\d{2}-\d{2}~20\d{2}-\d{2}-\d{2}/)?.[0]??null,marketingYear:f.measure?.scope.match(/20\d{2}\/(?:20\d{2}|\d{2})/)?.[0]??null},
      benchmark:f.measure?.benchmark??null,unit:f.measure?.unit??null,valueKind:context.valueKind,
      source:{url:f.sourceUrl,recordSha256:f.recordSha256},comparison:f.comparison??null,referenceQualifiers:reference.qualifiers,
      permittedUses:[...uses],excludedExtensions:[...excludes],causalRelations:relations};
  });
  const jointRelations:Relation[]=[];
  for(const production of evidence.facts.filter(f=>factClaimContext(f).aspects.includes('production')&&f.measure?.valueKind==='forecast'))
    for(const consumption of evidence.facts.filter(f=>factClaimContext(f).aspects.includes('consumption')&&f.measure?.valueKind==='forecast'))
      if(production.id!==consumption.id&&production.measure?.scope&&production.measure?.scope===consumption.measure?.scope&&production.observedAt===consumption.observedAt&&production.measure?.benchmark===consumption.measure?.benchmark&&production.measure?.unit===consumption.measure?.unit)
        jointRelations.push({support:[{evidenceId:production.id,aspect:'production'},{evidenceId:consumption.id,aspect:'consumption'}],scope:evidenceScope(production),period:production.observedAt,mode:'joint-forecast-scenario',driver:'future-relative-production-and-consumption-forecast-revisions',possibleOutcome:'qualified-change-in-futures-market-supply-demand-pressure',requirements:['cite-both-metrics','do-not-infer-stock-adequacy','no-new-calculated-numbers','not-physical-procurement-costs']});
  return {version:'evidence-constrained-plan-v1',commodity:evidence.commodity,
    rules:['select-support-before-writing-each-analytical-segment','use-only-listed-relationships-for-directional-causal-outcomes','scope-does-not-expand-when-records-are-combined','monitoring-is-an-action-not-proof-of-a-future-outcome','all-claims-still-require-full-claim-contract-v5-validation'],
    records,jointRelations};
}
