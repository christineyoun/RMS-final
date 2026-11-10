/** STEP 7 input routing: STOP -> step4+step5, SEARCH -> step4+step5+step6. */
import fs from 'node:fs';
import path from 'node:path';
import {nextStage,selectDecision,filesAt,kstDate} from './step6-core.ts';
import {checkProcurementScope} from './step7-scope.ts';

const clean=(s:unknown,n=300):string=>typeof s==='string'?s.replace(/\s+/g,' ').trim().slice(0,n):'';
export type EvidenceSource={id:string;grade:string;title:string;url:string|null;citationUrl:string|null;date:string|null;
  excerpts:Array<{id:string;topic:string;text:string}>};

export function buildFinalData(
  dir:string,
  date=process.env.RMS_RESEARCH_RUN_DAY ?? kstDate(new Date())
){
  const selected=selectDecision(dir);
  const decision=selected.data;
  const route=nextStage(decision);
  if(route==='manual-review')throw Error('STEP5 decision uncertain or invalid. Cannot auto-create market outlook.');
  const filenames=decision.inputFiles;
  if(!filenames?.step4||!filenames?.step5Graded)throw Error('Missing prior file references in decision.');
  for(const name of [filenames.step4,filenames.step5Graded])
    if(name.includes('/')||name.includes('\\')||!fs.existsSync(path.join(dir,name)))throw Error(`Missing prior source file ${name}`);
  const prev=JSON.parse(fs.readFileSync(path.join(dir,filenames.step4),'utf8'));
  const round1=JSON.parse(fs.readFileSync(path.join(dir,filenames.step5Graded),'utf8'));
  if(!Array.isArray(prev.analysis?.originalInventory)||!Array.isArray(round1.review)||
    round1.stage!=='additional-google-original-verification-round1')throw Error('Prior A/B inventory invalid');
  const commodity=decision.commodity||prev.commodity||round1.commodity;
  if(!commodity||[prev.commodity,round1.commodity].some(x=>x&&x!==commodity))throw Error('Commodity mismatch');
  const oldAssess=prev.analysis.candidateAssessments||[];
  const byEvidence=new Map(oldAssess.map((e:any)=>[e.id,e.original]));
  const old:EvidenceSource[]=prev.analysis.originalInventory.map((x:any)=>({
    id:x.id,grade:x.grade,title:clean(x.googleTitle||x.publisherHost,120),url:x.publisherUrl||null,
    citationUrl:x.googleCitationUrl||null,date:x.publishedAt||null,
    excerpts:(x.evidence||[]).map((e:any)=>({id:e.id,topic:clean(e.theme,35),
      text:clean((byEvidence.get(e.id) as any)?.exactExcerpt||e.exactExcerpt,550)})),
  }));
  const toSources=(review:any[]):EvidenceSource[]=>review.map((x:any)=>({
    id:x.id,grade:x.grade,title:clean(x.googleTitle,120),url:x.publisherUrl||null,
    citationUrl:x.googleCitationUrl||null,date:x.publishedAt||null,
    excerpts:(x.grade==='A'?x.evidence||[]:[]).map((e:any)=>({id:e.id,topic:clean(e.theme,35),text:clean(e.exactExcerpt,550)})),
  }));
  const files={step4:filenames.step4,step5Graded:filenames.step5Graded,step5Decision:selected.file,step6Graded:null as string|null};
  const all=[...old,...toSources(round1.review)];
  if(route==='step6-search'){
    // A SEARCH decision requires completed, verified second-round sources.
    const gradedName=filesAt(dir,/^step6-round2-graded-.*\.json$/).at(-1);
    if(!gradedName)throw Error('STEP5 recommended SEARCH: run STEP6 Google search and verification before STEP7.');
    const round2=JSON.parse(fs.readFileSync(path.join(dir,gradedName),'utf8'));
    if(round2.stage!=='additional-google-original-verification-round2'||round2.round!==2||
      round2.decisionFile!==selected.file||round2.commodity!==commodity||!Array.isArray(round2.review)||
      round2.inputFiles?.step4!==filenames.step4||round2.inputFiles?.step5Graded!==filenames.step5Graded)
      throw Error('STEP6 verification does not match this decision or commodity.');
    files.step6Graded=gradedName;
    all.push(...toSources(round2.review));
  }
  if(new Set(all.map(x=>x.id)).size!==all.length)throw Error('Duplicate source IDs; cannot assemble final report.');
  const excerpts=all.flatMap(x=>x.excerpts);
  if(new Set(excerpts.map(x=>x.id)).size!==excerpts.length)throw Error('Duplicate evidence IDs');
  if(!excerpts.length)throw Error('No evidence excerpts for final analysis.');
  const counts={sources:all.length,A:all.filter(x=>x.grade==='A').length,
    B:all.filter(x=>x.grade==='B').length,EXCLUDED:all.filter(x=>x.grade==='EXCLUDED').length,
    excerpts:excerpts.length};
  return {commodity,date,route:route==='step7-final'?'stop-after-round1':'after-round2',
    files,counts,sources:all,priorFindings:prev.analysis.findings||[],
    decision:decision.decision!, priorGaps:prev.analysis.researchGaps||[]};
}

/** One shared English prompt for eight commodities. Commodity and evidence are runtime data. */
export function buildFinalPrompt(data:ReturnType<typeof buildFinalData>){
  const payload={date:data.date,commodity:data.commodity,counts:data.counts,
    priorFindings:data.priorFindings,decision:data.decision,sources:data.sources};
  return `Date: ${data.date} (KST)\nCommodity: ${data.commodity}\n\nYou are a senior commodity market analyst advising a professional procurement team. Produce an independent, forward-looking market outlook and actionable buying strategy from the supplied evidence. Use the SAME instructions for every commodity. Evaluate supply, demand, prices, weather, trade, policy, logistics and substitution ONLY when material for the supplied commodity; never follow a commodity-specific checklist.\n\nREASONING AND EVIDENCE:\n- Separate observed data, official forecasts, third-party estimates, commitments and your own scenarios. Never call a forecast or preliminary crop figure a finalized result. Never equate a purchase pledge with executed contracts or shipments.\n- Compare bullish and bearish effects, including timing, magnitude and transmission to physical procurement prices where evidence permits. Explain why one direction outweighs the other; avoid a mere catalog of numbers.\n- Cite the original evidence source IDs and link 3-6 material claims to real excerpt IDs in the internal claimEvidence metadata. A means publisher text was readable, NOT independent fact verification. B is useful qualified context, not verified numeric proof; EXCLUDED is never evidence. Multiple articles repeating the same underlying announcement or data do not establish independent confirmation.\n- Disagreements or incomplete evidence should be qualified in the prose, not silently discarded. Do not invent dates, figures, citations, source IDs or excerpt IDs. Give reference dates, units and contract months for futures quotes. Do not confuse futures benchmarks, FOB offers and landed purchase prices.\n\nPURCHASING SCOPE (MANDATORY FOR ALL COMMODITIES):\n- The ONLY item for which you may advise buying, hedging, stocking, sourcing, contracting or ordering is the item named in Commodity. Every action in procurementStrategy must have THAT item as its purchasing object.\n- Related products, by-products and substitutes can affect demand, pricing and processing margins, so discuss them as market drivers. NEVER recommend purchasing or signing contracts for a different item, even when its prices or margins are material.\n- If related products are mentioned in procurementStrategy, clearly distinguish their market impact from the actual buying action for the selected commodity. Do not mix purchasing recommendations for multiple commodities in one item card.\n\nPURCHASING ADVICE:\n- Make a clear conditional procurement decision that follows from your market outlook. Describe timing, phased buying, supplier/origin comparison, contract approaches, risks or observable decision triggers when actually relevant. Do not default to vague 'monitor and negotiate' language.\n- Never invent numerical purchase percentages, absolute volumes, price support/resistance levels, buying thresholds or numeric hedging targets. A current market quote is NOT a justified purchase trigger. If the supplied evidence lacks verified purchasing constraints (stock, open contracts, actual supplier offers, demand forecast) or a documented price-trigger calculation, use specific observable conditions WITHOUT made-up numbers. Do not use plausible-looking percentages. Define the observation and action together (e.g., which actual offer, lead time or shipment condition would change the buying decision) without fabricating a threshold.\n- Any material forecast uncertainty belongs in marketOutlook; actionable follow-ups belong in monitoringFactors. Put uncertainty in the existing monitoringFactors list, not a new UI section. There is NO new uncertainty card in the existing RMS UI. The uncertainties field is internal review metadata only.\n\nFORMAT:\nWrite naturally and precisely in Korean. The headline is decisive and <=40 Korean characters. marketOutlook is ONE substantial, readable paragraph (~8-10 Korean lines) presenting the price outlook and its causal evidence. procurementStrategy is ONE separate concise paragraph (~2-3 Korean lines) containing implementable actions. Factor texts are <=70 characters each, with 1-3 items per list. Avoid repeating the market-outlook paragraph in the factor lists.\nReturn a concise VALID JSON object ONLY; no markdown or extra text:\n{\n  "headline":"<=40 Korean characters",\n  "marketOutlook":"one evidence-led Korean paragraph with directional assessment",\n  "procurementStrategy":"one actionable Korean paragraph without invented numeric thresholds",\n  "bullishFactors":[{"text":"<=70 characters","sourceIds":["G001"]}],\n  "bearishFactors":[{"text":"<=70 characters","sourceIds":["G100"]}],\n  "monitoringFactors":[{"text":"<=70 characters","sourceIds":["G111"]}],\n  "sourceIds":["G001","G100"],\n  "uncertainties":["unresolved issue, internal only"],\n  "claimEvidence":[{"claim":"material factual claim summarized","sourceIds":["G001"],"excerptIds":["G001-E1"],"evidenceType":"direct"}],\n  "procurementRisk":{"level":"안정|주의|경계|판정 보류","summary":"Korean supply risk rationale, about 100 Korean characters and maximum 120","sourceIds":["G001"]}\n}\nclaimEvidence must contain 3-6 important claims. For procurementRisk, assess PHYSICAL supply and procurement disruption exposure independently of price direction, using the SAME source evidence and market outlook. Choose 안정, 주의, 경계, or 판정 보류; use 판정 보류 when supply evidence is insufficient. Explain relevant supply signals, buffers, and uncertainties in Korean, approximately 100 characters, maximum 120 characters. Cite actual supporting source IDs. Treat B-grade sources as qualified context, never verified numeric proof. Use crop and weather indicators for processed commodities when relevant but distinguish raw material conditions from confirmed finished-product shortages. Reserve 경계 for actual supported supply interruptions, not speculative price movements. This additional field belongs to the EXISTING SCM procurement risk strip, not another card. Produce it in the SAME synthesis call without a new search. Do not change the requested headline, outlook, procurement strategy, factors, claimEvidence or uncertainty content. Use only REAL source and excerpt IDs included below; direct means a readable original excerpt supports the statement, inference means your interpretation, and qualified means evidence is incomplete, ambiguous or B-only. For inference/qualified, still cite real source IDs; an empty excerptIds list is allowed ONLY if no publisher excerpt exists. Never label B-only evidence direct. Do NOT invent extra search rounds. Do not submit another market report inside claimEvidence.\n\nEVIDENCE DATA (publisher excerpts may be short, provisional or extracted from PDF fragments):\n${JSON.stringify(payload)}`;
}

export type ClaimEvidence={claim:string;sourceIds:string[];excerptIds:string[];evidenceType:'direct'|'inference'|'qualified'};
export type AiProcurementRisk={level:'안정'|'주의'|'경계'|'판정 보류';summary:string;sourceIds:string[]};
export type FinalResult={headline:string;marketOutlook:string;procurementStrategy:string;
  bullishFactors:Array<{text:string;sourceIds:string[]}>;
  bearishFactors:Array<{text:string;sourceIds:string[]}>;
  monitoringFactors:Array<{text:string;sourceIds:string[]}>;
  sourceIds:string[];uncertainties:string[];claimEvidence?:ClaimEvidence[];procurementRisk?:AiProcurementRisk};

export function parseFinalResult(raw:string):FinalResult|null{
  let value:any;
  try{value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return null;}
  const factors=['bullishFactors','bearishFactors','monitoringFactors'];
  if(!value||typeof value.headline!=='string'||typeof value.marketOutlook!=='string'||
    typeof value.procurementStrategy!=='string'||!Array.isArray(value.sourceIds)||
    !Array.isArray(value.uncertainties)||!value.sourceIds.every((x:any)=>typeof x==='string')||
    !value.uncertainties.every((x:any)=>typeof x==='string')||
    !factors.every(k=>Array.isArray(value[k])&&value[k].length>=1&&value[k].length<=3&&
      value[k].every((x:any)=>typeof x?.text==='string'&&Array.isArray(x.sourceIds)&&
        x.sourceIds.every((y:any)=>typeof y==='string'))))return null;
  if(value.claimEvidence!==undefined&&(!Array.isArray(value.claimEvidence)||
    !value.claimEvidence.every((c:any)=>typeof c?.claim==='string'&&
      Array.isArray(c.sourceIds)&&c.sourceIds.every((x:any)=>typeof x==='string')&&
      Array.isArray(c.excerptIds)&&c.excerptIds.every((x:any)=>typeof x==='string')&&
      ['direct','inference','qualified'].includes(c.evidenceType))))return null;
  // Optional extension: invalid risk must not invalidate the existing market report.
  const pr=value.procurementRisk;
  const procurementRisk:AiProcurementRisk|undefined=pr&&
    ['안정','주의','경계','판정 보류'].includes(pr.level)&&
    typeof pr.summary==='string'&&pr.summary.trim()&&
    [...pr.summary.trim()].length<=120&&Array.isArray(pr.sourceIds)&&
    pr.sourceIds.every((id:unknown)=>typeof id==='string')
    ? {level:pr.level,summary:pr.summary.trim(),sourceIds:pr.sourceIds}:undefined;
  return {headline:value.headline,marketOutlook:value.marketOutlook,
    procurementStrategy:value.procurementStrategy,
    bullishFactors:value.bullishFactors,bearishFactors:value.bearishFactors,
    monitoringFactors:value.monitoringFactors,sourceIds:value.sourceIds,uncertainties:value.uncertainties,
    claimEvidence:value.claimEvidence||[],...(procurementRisk?{procurementRisk}:{})};
}

/** Suspicious numeric BUY advice is held for review, not removed from the report.
 * A market quotation near a generic recommendation is not itself an executable buy target.
 */
export function quantitativeBuyingFlags(text:string):string[]{
  const flags:string[]=[];
  // Existing percentage safety guard intentionally unchanged.
  if(/\d[\d,.]*(?:\s*[~～\-–]\s*\d[\d,.]*)?\s*%/.test(text))
    flags.push('purchase-percentage-or-percentage-trigger: requires documented buying constraints');

  // Quote units may follow (605 USD/MT) or precede (USD 605/MT) the number.
  // Require a *local, executable price instruction*, not two unrelated words
  // somewhere in the procurement strategy paragraph.
  const quantity=String.raw`\d[\d,.]*(?:\s*[~～\-–]\s*\d[\d,.]*)?`;
  const unit=String.raw`(?:센트|달러|유로|원|USD|EUR|KRW|€|\$)`;
  const suffix=String.raw`(?:\s*\/\s*(?:MT|M\.?T\.?|톤|kg|bu|bushel))?`;
  const money=String.raw`(?:${quantity}\s*${unit}${suffix}|(?:USD|EUR|KRW|€|\$)\s*${quantity}${suffix})`;
  const action=String.raw`(?:매수|매입|구매|헤지|발주|확약|계약|매도|(?:선)?확보)`;
  const within=(n:number)=>String.raw`[^.!?。;\n]{0,${n}}`;
  const nearPriceConditions=String.raw`(?:이하|이상|초과|미만|하회|상회|돌파|근접|도달|까지|\btrigger\b|\btarget\b|되면|일\s*때)`;
  const executablePricePatterns=[
    // At/below an executable price, buy or hedge: "620달러 이하에서 매수".
    new RegExp(`${money}${within(22)}${nearPriceConditions}${within(45)}${action}`,'i'),
    // Direct price and action linkage: "620달러에 계약" / "620달러에서 헤지".
    new RegExp(`${money}\\s*(?:(?:수준|부근)\\s*)?(?:에|에서|로|선에서)${within(18)}${action}`,'i'),
    // Explicit purchase-price objective: "매수가격 620달러" / "계약단가 USD 620".
    new RegExp(`${action}${within(14)}${money}`,'i'),
    // Conditional executable instruction, not 'check offers before contracting'.
    new RegExp(`${money}(?:인\\s*경우|일\\s*때)${within(28)}${action}(?:하라|하십시오|한다|권고|할\\s*것|진행)`,'i'),
  ];
  if(executablePricePatterns.some(pattern=>pattern.test(text)))
    flags.push('numeric-buy-or-hedge-price: requires a documented calculation and executable basis');
  return flags;
}

export function auditFinalResult(result:FinalResult,data:ReturnType<typeof buildFinalData>){
  const known=new Map(data.sources.map(x=>[x.id,x]));
  const factorItems=[...result.bullishFactors,...result.bearishFactors,...result.monitoringFactors];
  const trace=result.claimEvidence||[];
  const allRefs=[...result.sourceIds,...factorItems.flatMap(x=>x.sourceIds),...trace.flatMap(x=>x.sourceIds)];
  const invalidSourceIds=[...new Set(allRefs.filter(x=>typeof x!=='string'||!known.has(x)||known.get(x)?.grade==='EXCLUDED'))];
  const tooLongFactors=factorItems.filter(x=>[...x.text].length>70).map(x=>x.text);
  const invalidExcerptIds:string[]=[];
  const traceFlags:string[]=[];
  for(const claim of trace){
    if(!claim.claim.trim()||!claim.sourceIds.length)traceFlags.push('empty claim or source IDs');
    for(const id of claim.excerptIds){
      const linked=data.sources.filter(s=>claim.sourceIds.includes(s.id));
      if(!linked.some(s=>s.grade==='A'&&s.excerpts.some(e=>e.id===id)))invalidExcerptIds.push(id);
    }
    if(claim.evidenceType==='direct'&&(!claim.excerptIds.length||
      !claim.excerptIds.some(id=>data.sources.some(s=>claim.sourceIds.includes(s.id)&&s.grade==='A'&&s.excerpts.some(e=>e.id===id)))))
      traceFlags.push('direct claim without A-grade original excerpt');
  }
  const quantitativeStrategyFlags=quantitativeBuyingFlags(result.procurementStrategy);
  const procurementScopeFlags=checkProcurementScope(result.procurementStrategy,data.commodity);
  const forecastFinalityFlags:string[]=[];
  const marketAndFactors=[result.marketOutlook,...factorItems.map(x=>x.text)].join(' ');
  if(/(?:생산량|수확량|기말재고|총생산량|생산 전망).{0,38}확정(?!되지|전|여부|할 수 없)/.test(marketAndFactors)||
     /사상 최대 (?:생산량|수확량|수확)을? (?:확정|기록 중)/.test(marketAndFactors))
    forecastFinalityFlags.push('production/stock forecast may be stated as finalized actual');
  if(/(?:생산량|총생산량|수확량).{0,85}사상\s*(?:최대|최고)(?:치)?(?:를|을)?\s*(?:경신|기록)/.test(marketAndFactors) &&
     !/(?:생산량|총생산량|수확량).{0,85}사상\s*(?:최대|최고)(?:치)?(?:를|을)?\s*(?:경신|기록)\s*(?:할|할\s*것으로|할\s*전망|예상)/.test(marketAndFactors))
    forecastFinalityFlags.push('forecast may be framed as an achieved record; check forecast versus finalized output');
  if(/(?:약정|공약).{0,24}(?:의무 구매|집행 완료|수입 완료)/.test(marketAndFactors))
    forecastFinalityFlags.push('purchase pledge may be represented as executed/guaranteed trade');
  const reviewReasons:string[]=[];
  if(invalidSourceIds.length)reviewReasons.push('unknown or excluded source IDs');
  if(invalidExcerptIds.length)reviewReasons.push('unmatched evidence excerpt IDs');
  if(tooLongFactors.length)reviewReasons.push('overlong factor text');
  if([...result.headline].length>40)reviewReasons.push('overlong headline');
  if(!result.headline.trim()||!result.marketOutlook.trim()||!result.procurementStrategy.trim())reviewReasons.push('empty required prose');
  if(factorItems.some(x=>!x.text.trim()||!x.sourceIds.length))reviewReasons.push('factor without text or source IDs');
  if(trace.length<3||trace.length>6)reviewReasons.push('claimEvidence must contain 3-6 traced claims');
  if(traceFlags.length)reviewReasons.push(...traceFlags);
  if(quantitativeStrategyFlags.length)reviewReasons.push(...quantitativeStrategyFlags);
  if(procurementScopeFlags.length)reviewReasons.push('cross-commodity-procurement: buying or contracting a different item requires review');
  if(forecastFinalityFlags.length)reviewReasons.push(...forecastFinalityFlags);
  return {invalidSourceIds,invalidExcerptIds:[...new Set(invalidExcerptIds)],tooLongFactors,
    headlineTooLong:[...result.headline].length>40,sourcesQuoted:allRefs.length,
    claimEvidenceCount:trace.length,quantitativeStrategyFlags,procurementScopeFlags,forecastFinalityFlags,
    reviewReasons:[...new Set(reviewReasons)]};
}

export function renderFinal(data:ReturnType<typeof buildFinalData>,r:FinalResult){
  return `# ${r.headline}\n\n${r.marketOutlook}\n\n${r.procurementStrategy}\n\n## 상승 요인\n${r.bullishFactors.map(x=>`- ${x.text} (${x.sourceIds.join(', ')})`).join('\n')}\n\n## 하락 요인\n${r.bearishFactors.map(x=>`- ${x.text} (${x.sourceIds.join(', ')})`).join('\n')}\n\n## 모니터링\n${r.monitoringFactors.map(x=>`- ${x.text} (${x.sourceIds.join(', ')})`).join('\n')}\n\n## 불확실성\n${r.uncertainties.map(x=>`- ${x}`).join('\n')}\n\n${r.procurementRisk?`## 조달 리스크\n- ${r.procurementRisk.level}: ${r.procurementRisk.summary} (${r.procurementRisk.sourceIds.join(', ')})\n\n`:''}---\n자료 경로: ${data.route} / 참고 출처 ${data.counts.sources}건 / 원문 발췌 후보 ${data.counts.excerpts}개.\n이 보고서는 독립 테스트 산출물이며 기존 RMS에 게시되지 않았습니다.`;
}
