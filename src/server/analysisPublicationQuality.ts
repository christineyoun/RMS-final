/** Additional quality checks for canonical claim reports. These do not establish
 * factual correctness; the full evidence/claim validator must already have passed. */
const lists=['bullishFactors','bearishFactors','watchItems'];
const normalized=(text:string)=>text.normalize('NFC').replace(/\s+/g,' ').trim();
export function canonicalAnalysisQualityIssues(data:any):string[]{
 if(data?.factBinding!=='verified-records-v1')return [];
 if(!Array.isArray(data.evidenceClaims))return ['invalid-canonical-claim-map'];
 const issues:string[]=[],seenFields=new Set<string>();
 for(const claim of data.evidenceClaims||[]){
  if(!claim||!Array.isArray(claim.segments)||claim.segments.some((s:any)=>!s||typeof s.text!=='string')){issues.push('invalid-canonical-claim-map');continue;}
  const factual=claim.segments.filter((s:any)=>s.kind==='fact'),facts=factual.map((s:any)=>s.evidenceIds?.[0]);
  if(new Set(facts).size!==facts.length||new Set(factual.map((s:any)=>normalized(s.text))).size!==facts.length)issues.push('repeated-factual-premise:'+claim.field);
  if(claim.field==='executiveSummary'&&new Set(facts).size<2)issues.push('incomplete-summary-factual-coverage');
  const visibleFactual=data.sectionFormat==='evidence-sections-v1'?claim.segments.filter((s:any)=>s.kind==='reported-fact'):factual;
  if(claim.field==='executiveSummary'&&visibleFactual.length&&visibleFactual.every((s:any)=>/원문 인용:/.test(s.text)))issues.push('raw-evidence-only-summary');
  if(/^(?:bullishFactors|bearishFactors)\./.test(claim.field)&&!claim.segments.some((s:any)=>s.kind==='conditional'||s.kind==='interpretation'))issues.push('missing-supported-market-driver:'+claim.field);
  if(/^watchItems\./.test(claim.field)&&!claim.segments.some((s:any)=>s.kind==='recommendation'||s.kind==='conditional'))issues.push('missing-supported-monitoring-action:'+claim.field);
  const text=normalized(claim.segments.map((s:any)=>s.text).join(' '));
  if(seenFields.has(text))issues.push('repeated-claim-field:'+claim.field);
  seenFields.add(text);
 }
 return issues;
}
/** Retain a stronger saved report when a new canonical report drops entire
 * supported sections. Freshness alone is not a quality improvement. Never pad
 * unsupported sections to pass this guard: retain the previous report instead. */
export function analysisReplacementIssues(candidate:any,previous:any):string[]{
 if(candidate?.evidenceAudit?.factBinding!=='verified-records-v1'||!previous)return [];
 if(previous.evidenceAudit?.sectionCoverage?.priceOutlook===true&&candidate.evidenceAudit?.sectionCoverage?.priceOutlook!==true)return ['analysis-price-outlook-coverage-regression'];
 const items=(report:any)=>lists.map(k=>new Set((Array.isArray(report[k])?report[k]:[]).filter((s:any)=>typeof s==='string'&&s.trim()).map(normalized)).size);
 const next=items(candidate),prior=items(previous);
 if(next.filter(Boolean).length<prior.filter(Boolean).length)return ['analysis-section-coverage-regression'];
 return next.reduce((a,b)=>a+b,0)<prior.reduce((a,b)=>a+b,0)?['analysis-item-coverage-regression']:[];
}
