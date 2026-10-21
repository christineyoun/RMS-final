import {verifiedReferenceContext} from './analysisReferenceContext.ts';
/** Conservative claim classification, not an unrestricted Korean entailment model.
 * Facts/interpretations must bind to original records; scenarios must actually
 * be conditional and cannot smuggle current trends into their premises. */
import type {AnalysisFact} from './analysisEvidence.ts';
import {validateClaimReferences,factClaimContext,claimMetrics,type ClaimSupport} from './analysisClaimSupport.ts';
export type ReasoningVerdict={classification:'conditional-scenario'|'purchasing-recommendation'|'monitoring-recommendation'|'unsupported-claim';issues:string[]};

export function validateConditionalReasoning(text:string,refs:AnalysisFact[],options:{kind?:'conditional'|'recommendation';support?:ClaimSupport[]}={}):ReasoningVerdict {
  const issues:string[]=[];
  // Prefer explicit 경우 so the food word 라면 cannot become an if-clause.
  // Concessions are valid scenarios too. A recommendation can instead state its
  // observed basis (상승을 고려해 ... 검토하는 것이 적절합니다).
  const divider=/(?:경우(?:에는|에)?)[,，]?\s+/.exec(text)||/(?:다면|으면|하면|되면|이라면|일 때|더라도|어도|아도)[,，]?\s+/.exec(text)||/라면[,，]\s+/.exec(text);
  const actionDomain=/(?:구매|매입|조달|분할|발주|계약|관망|견적|오퍼)/.test(text);
  // Roles come from the validated claim contract. Actions are semantic targets,
  // independent of honorifics, sentence endings or purchasing vocabulary.
  const actionIntent=/(?:확인|비교|검토|점검|모니터링|추적|관찰|대조|살펴|관망|분할|발주)/.test(text);
  const typedAdvice=options.kind==='recommendation'&&actionIntent;
  const action=typedAdvice||!!divider&&actionIntent||actionDomain&&actionIntent;
  const recommendation=options.kind==='recommendation'||action;
  const basis=!divider&&recommendation?/(?:고려(?:해|하여|할 때)|감안(?:해|하여|할 때)|바탕으로|토대로)[,，]?\s+/.exec(text):null;
  // A typed causal interpretation may introduce its evidenced forecast revision
  // as a topic/subject rather than an if-clause. The same revision, direction,
  // scope, qualification and consequence checks below remain mandatory.
  const revisionSubject=!divider&&!recommendation?[...text.matchAll(/(?:은|는|이|가)\s+/g)].find(m=>{
    const prefix=text.slice(0,m.index);
    return /전망|forecast/i.test(prefix)&&/상향|하향|증가|감소/.test(prefix)&&
      claimMetrics(prefix,refs).some(metric=>['production','consumption','exports'].includes(metric));
  }):null;
  const causal=!divider&&!recommendation?(/(?:에 따라|으로 인해|때문에|바탕으로|토대로)[,，]?\s+/.exec(text)||revisionSubject):null;
  const boundary=divider||basis||causal;
  const adviceOnly=!boundary&&typedAdvice;
  // A causal forecast needs a verified revision, not merely a forecast level,
  // plus a qualified market consequence. A modal alone confers no evidence.
  if(causal){
    const increasing=/(?:증가|상향)/.test(text.slice(0,causal.index+causal[0].length));
    const revisions=refs.filter(f=>f.measure?.valueKind==='forecast'&&factClaimContext(f).aspects.some(a=>['production','consumption','exports'].includes(a))&&
      /전월|이전|prior|previous/i.test(f.text)&&(increasing?/상향|증가|raised|increas/i:/하향|감소|lowered|decreas/i).test(f.text));
    if(!revisions.length||!/(?:증가|감소|상향|하향)/.test(text.slice(0,causal.index)))issues.push('unsupported-causal-forecast-premise');
    if(!/(?:선물|가격).{0,35}(?:압력|지지|부담|상승|하락)|(?:상방|하방|상승|하락).{0,20}(?:압력|가격)/.test(text.slice(causal.index+causal[0].length)))issues.push('unsupported-causal-consequence');
    const effect=text.slice(causal.index+causal[0].length);
    const down=/(?:하방|하락)\s*(?:압력|요인)|(?:상승|상방)\s*압력.{0,12}제한/.test(effect);
    const up=/(?:상방|상승)\s*(?:압력|요인)|가격\s*지지|(?:하락|하방)\s*압력.{0,12}제한/.test(effect);
    const supportedDirection=revisions.some(f=>factClaimContext(f).aspects.includes('production')?(increasing?down:up):(increasing?up:down));
    if(revisions.length&&!supportedDirection)issues.push('unsupported-causal-price-direction');
  }
  if(!boundary&&!adviceOnly)issues.push('unqualified-factual-or-predictive-statement');
  const antecedent=boundary?text.slice(0,boundary.index+boundary[0].length):text,consequence=boundary?text.slice(boundary.index+boundary[0].length):text;
  // A recommendation tag is not permission to hide an assertion/prediction in
  // an advice target. Such clauses need separate typed facts/scenario support.
  const assertionInAdvice=/(?:으므로|하므로|되므로|이므로|때문|인해|따라서|예상|전망(?:됩니다|이다|입니다)|할 것|될 것|오를|내릴|가능성|수 있습니다|수 있으|확정됐|확정된|발생했|증가했|감소했|상승했|하락했|기록했|이어질|이어지|보장)/;
  if((adviceOnly||basis)&&assertionInAdvice.test(adviceOnly?text:antecedent))issues.push('assertion-or-prediction-disguised-as-advice');
  // Bare advice targets are nominal questions/metrics, not uncited finite
  // market claims. Interrogatives such as 하락하는지/하락할지 remain questions.
  if(adviceOnly&&/(?:상승|하락|증가|감소|부족|풍부|견조|안정)(?:중|하고|하는(?!지)|하니|하며|하겠|할(?!지))|(?:오르|내리)(?:고|는(?!지)|니|며|겠)/.test(text))
    issues.push('assertion-or-prediction-disguised-as-advice');
  if(/[.!?]\s+\S/.test(text))issues.push('multiple-assertions-in-single-scenario');
  const qualified=/(?:가능성|가능하|수\s*있|여지|일\s*수|잠재적)/.test(consequence);
  if(!qualified&&!action)issues.push('unqualified-consequence');
  const premise=/(?:보고서|report).*(?:발표|release)/i.test(antecedent)?consequence:antecedent;
  issues.push(...validateClaimReferences(premise,refs,options.support,{adviceTarget:adviceOnly||!!basis,assertionScope:!!causal}));
  if(causal)issues.push(...validateClaimReferences(text,refs,options.support,{assertionScope:true}).filter(i=>/subject-mismatch|geography-mismatch|benchmark|futures-not-physical/.test(i)));
  if(basis&&/(?:도입\s*(?:원가|비용)|조달\s*(?:원가|비용)|실제\s*공급사\s*견적)/.test(antecedent)&&
    !refs.some(f=>f.measure?.scope.includes('verified-physical-procurement')))
    issues.push('unsupported-physical-cost-premise');
  if(options.kind==='recommendation'&&!action)issues.push('missing-actionable-recommendation');
  // Check all independent requirements even if the role/grammar was invalid.
  // Reporting periods are identifiers only when canonical text AND typed scope
  // agree; values, quantities and invented periods remain factual assertions.
  let numericText=text;
  // Duration is derived from BOTH comparison endpoint identities and their
  // canonical dated statement. Only past interval references in the premise
  // may consume that duration; this never authorizes future coverage/allocations.
  const durations=refs.filter(f=>f.comparison?.metric==='price'&&options.support?.some(s=>s.evidenceId===f.id&&s.aspect==='interval-change')).flatMap(f=>{
    const a=/(20\d{2}-\d{2}-\d{2})$/.exec(f.comparison!.baselineId)?.[1],b=/(20\d{2}-\d{2}-\d{2})$/.exec(f.comparison!.currentId)?.[1];
    if(!a||!b||f.observedAt!==b||!f.text.includes(a)||!f.text.includes(b))return [];
    const days=(Date.parse(b)-Date.parse(a))/86400000;
    return Number.isInteger(days)&&days>0?[days]:[];
  });
  if(durations.length){
    const scopedPremise=antecedent.replace(/(?:최근|지난|해당)\s*(\d+)\s*(주일|주|일)(?:간|동안)?/g,(phrase,n,unit)=>durations.includes(Number(n)*(unit==='일'?1:7))?'':phrase);
    numericText=scopedPremise+text.slice(antecedent.length);
  }
  for(const fact of refs)if(options.support?.some(s=>s.evidenceId===fact.id&&factClaimContext(fact).aspects.includes(s.aspect))){
    for(const match of fact.text.matchAll(/\b(20\d{2})\/(20\d{2}|\d{2})(?:년)?/g)){
      const year=match[1],next=match[2].length===2?year.slice(0,2)+match[2]:match[2];
      if(new RegExp(year+'/(?:'+next+'|'+next.slice(-2)+')(?=:|$)').test(fact.measure?.scope||''))
        numericText=numericText.replace(new RegExp(year+'/(?:'+next+'|'+next.slice(-2)+')(?!\\d)(?:년)?','g'),'');
    }
  }

  for(const fact of refs)for(const token of fact.text.match(/\b[A-Z][A-Za-z]*\d+\b/g)||[])numericText=numericText.replaceAll(token,'');
  for(const fact of refs)for(const q of verifiedReferenceContext(fact).qualifiers)
    if(options.support?.some(s=>s.evidenceId===fact.id&&s.aspect===q.aspect))numericText=numericText.replaceAll(q.phrase,'');
  if(/[\p{N}]|https?:\/\//u.test(numericText)||/(?:전량|절반|퍼센트|[일이삼사오육칠팔구십백천만억]+\s*(?:톤|개월분|달러|링깃))/.test(text))issues.push('unsupported-number-or-allocation');
  // These are assertions/presuppositions, not ordinary causal connective words.
  if(/(?:강세|상승세|하락세|약세|반등세).{0,12}(?:지속|유지|계속|이어)|(?:지속|계속).{0,8}(?:상승|하락)/.test(text)){
    const direction=/(?:하락세|약세|계속 하락)/.test(text)?'decrease':'increase';
    if(!refs.some(f=>factClaimContext(f).aspects.includes('sustained-price-trend')&&f.comparison?.direction===direction))issues.push('unsupported-observed-price-trend');
  }
  // A verified interval rise can motivate a buying decision without proving a
  // continued trend. A single quote cannot justify even that observed increase.
  if(/(?:최근|관측된|확인된|해당 기간).{0,25}(?:가격\s*)?(?:상승|하락|반등)|(?:가격\s*)?(?:상승|하락|반등)을\s*(?:고려|감안)/.test(antecedent)&&
    !refs.some(f=>f.comparison?.metric==='price'&&f.comparison.direction===((/하락/.test(antecedent))?'decrease':'increase')))issues.push('unsupported-observed-interval-change');
  // Lower than a prior forecast alone is NOT proof of scarcity/adequacy. No
  // absolute-stock-to-tightness rule exists; require a genuine adequacy baseline.
  const assumesTight=/(?:타이트한|빠듯한|부족한|풍부한)[^,.!?\n]{0,20}(?:기말)?재고.{0,18}(?:유지|지속)|(?:재고|공급).{0,12}(?:부족|타이트|빠듯|과잉|풍부).{0,12}(?:유지|지속)|(?:재고|공급).{0,8}(?:사상|역대)\s*최저/.test(text);
  if(assumesTight&&!refs.some(f=>f.comparison?.metric==='verified-inventory-adequacy'))issues.push('unsupported-inventory-adequacy');
  if((adviceOnly||basis)&&/(?:타이트한|빠듯한|부족한|풍부한|충분한).{0,12}재고|재고.{0,12}(?:부족|타이트|풍부|충분)/.test(antecedent)&&
    !refs.some(f=>f.comparison?.metric==='verified-inventory-adequacy'))issues.push('unsupported-inventory-adequacy');
  if(/(?:현재|이미|계속).{0,20}(?:재고|공급).{0,12}(?:부족|타이트|빠듯)|(?:재고|공급).{0,12}(?:부족하므로|타이트하므로|빠듯하므로)/.test(text)&&
    !refs.some(f=>f.comparison?.metric==='verified-inventory-adequacy'))issues.push('unsupported-inventory-adequacy');
  if(/(?:재고|공급).{0,15}(?:부족|타이트|빠듯).{0,20}(?:고려|감안|때문|인해)/.test(antecedent)&&
    !refs.some(f=>f.comparison?.metric==='verified-inventory-adequacy'))issues.push('unsupported-inventory-adequacy');
  if(/(?:수요|생산|수출|공급).{0,18}(?:견조|부진|증가세|감소세).{0,12}(?:지속|유지)/.test(text)&&
    !refs.some(f=>f.comparison&&['observed-demand','observed-production','observed-exports'].includes(f.comparison.metric)))issues.push('unsupported-observed-market-trend');
  if(/재고.{0,15}(?:감소세|감소 추세).{0,12}(?:지속|유지)/.test(text)&&!refs.some(f=>f.comparison?.metric==='observed-inventory'&&f.comparison.direction==='decrease'))issues.push('unsupported-observed-inventory-trend');
  if(/(?:현재|이미|최근|실제로).{0,25}(?:발표된|확정된|발생한|기록한|증가한|감소한)/.test(antecedent))issues.push('unverified-current-event-presupposition');
  if(/(?:발표했습니다|발표했고|확정했습니다|기록했습니다|증가했습니다|감소했습니다|상승했습니다|하락했습니다|관측됐습니다)/.test(consequence))issues.push('factual-assertion-inside-scenario');
  if(/(?:현재|이미|실제로).{0,25}(?:상승하고|증가하고|감소하고|부족하|타이트하)/.test(consequence))issues.push('factual-assertion-inside-scenario');
  if(/(?:현재|이미|실제로).{0,30}(?:수요|소비).{0,15}(?:견조|강하|강세|급증)/.test(text)&&
    !refs.some(f=>f.comparison?.metric==='observed-demand'))issues.push('unsupported-observed-market-trend');
  const capabilities=refs.flatMap(f=>factClaimContext(f).aspects);
  // Point observations do not confer crop-response or region-wide evidence.
  if(capabilities.includes('weather-signal')){
    if(/생육\s*(?:지연|피해)|작황\s*(?:악화|개선)|수확량\s*(?:감소|증가)|작물\s*피해/.test(text))issues.push('unsupported-weather-crop-response');
    if(/주요\s*산지|지역\s*전체|전역/.test(text)&&refs.some(f=>f.measure?.metric==='weather-screen'&&/grid|point/.test(f.measure.scope)))issues.push('point-weather-regional-generalization');
  }
  if(capabilities.includes('planting-progress')&&/남미|South America/i.test(text)&&!refs.some(f=>/South America|남미/i.test(f.measure?.scope||'')))issues.push('planting-regional-scope-mismatch');
  if(/(?:원가|도입\s*(?:비용|가격)|조달\s*(?:비용|단가)|현물\s*가격).{0,30}(?:하방|상방|상승|하락|안정|강세|약세)/.test(text)&&
    !refs.some(f=>f.measure?.scope.includes('verified-physical-procurement')))issues.push('unsupported-physical-cost-conclusion');
  if(/(?:가공|정제)\s*마진|refining\s*margin/i.test(text))issues.push('unsupported-cross-benchmark-margin');
  // A forecast/interval futures change cannot establish an existing physical
  // cost trend. No physical-cost trend capability exists in this contract.
  if(/(?:원가|도입\s*(?:비용|가격)|조달\s*(?:비용|단가)|현물\s*가격).{0,25}(?:상승|하락|하방|상방|안정|강세|약세).{0,15}(?:이어|유지|지속|계속)/.test(text))
    issues.push('unsupported-physical-cost-continuation');
  if(/(?:반드시|무조건|틀림없이|확실히|필연적으로).{0,50}(?:상승|하락|수익)|(?:수익|가격).{0,25}(?:보장|확정적)/.test(consequence))issues.push('unjustified-certainty');
  return {classification:issues.length?'unsupported-claim':recommendation?/(?:구매|매입|조달|분할|발주|계약|관망)/.test(text)?'purchasing-recommendation':'monitoring-recommendation':'conditional-scenario',issues:[...new Set(issues)]};
}
