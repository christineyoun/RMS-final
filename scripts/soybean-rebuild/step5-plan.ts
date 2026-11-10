/**
 * STEP 5 follow-up search planning — pure, no network, billing, or RMS writes.
 * Shared prompt policy for all commodities; soybean is the current isolated test.
 * Research gaps originate from the previous Gemini analysis, not from a manually
 * maintained commodity-specific question list.
 */
export type Gap = {topic?:string;reason?:string;question?:string};
export type Finding = {statement?:string;status?:string;period?:string|null;figure?:string|null;uncertainty?:string;sourceIds?:string[];evidenceIds?:string[]};
export type OriginalSource = {id:string;grade:string;googleTitle?:string;googleCitationUrl?:string;publisherUrl?:string|null;eligibility?:string;evidence?:Array<{id:string}>};
export type Integrated = {
  researchGaps:Gap[];findings:Finding[];originalInventory:OriginalSource[];
  candidateAssessments?:Array<{id:string}>;
};
export type Step4Snapshot = {
  analysis:Integrated;commodity?:string;recoveryMode?:string;sourceFile?:string;status?:string;
};
export type Plan = {
  commodity:string;
  gapLeads:string[];
  existingFindings:string[];
  previousCounts:{sources:number;A:number;B:number;EXCLUDED:number;candidates:number;findings:number;gaps:number};
};

const clean=(s:unknown,n=260):string=>typeof s==='string'?s.replace(/\s+/g,' ').trim().slice(0,n):'';
const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');

/** Never add fixed questions about countries, futures exchanges or weather systems. */
export function makePlan(snapshot:Step4Snapshot):Plan {
  const a=snapshot?.analysis;
  if(!a||!Array.isArray(a.originalInventory)||!Array.isArray(a.findings)||!Array.isArray(a.researchGaps))
    throw Error('STEP 4 analysis must contain originalInventory, findings and researchGaps.');
  if(!a.originalInventory.length)throw Error('STEP 4 has no source inventory.');

  const commodity=clean(snapshot.commodity,80)||'soybean'; // Current test is soybean; later supply commodity automatically.
  const gapLeads:string[]=[];
  const used=new Set<string>();
  for(const g of a.researchGaps){
    const title=clean(g.topic,70);
    const question=clean(g.question,240);
    const reason=clean(g.reason,160);
    const lead=[title,question||reason].filter(Boolean).join(' — ');
    if(!lead)continue;
    const key=normalize(lead);
    if(!used.has(key)){gapLeads.push(lead);used.add(key);}
  }
  const existingFindings=a.findings.filter(f=>clean(f.statement)).slice(0,12).map(f=>{
    const st=clean(f.status,30)||'unreviewed';
    return `[${st}; preliminary] ${clean(f.statement,210)}${f.uncertainty?' / uncertainty: '+clean(f.uncertainty,95):''}`;
  });
  const sources=a.originalInventory;
  return {commodity,gapLeads:gapLeads.slice(0,10),existingFindings,previousCounts:{
    sources:sources.length,A:sources.filter(s=>s.grade==='A').length,
    B:sources.filter(s=>s.grade==='B').length,
    EXCLUDED:sources.filter(s=>s.grade==='EXCLUDED').length,
    candidates:Array.isArray(a.candidateAssessments)?a.candidateAssessments.length:sources.reduce((n,s)=>n+(s.evidence?.length||0),0),
    findings:a.findings.length,gaps:a.researchGaps.length,
  }};
}

/** English instructions. Prior Korean findings/gap texts are input data, not directives. */
export function buildStep5Prompt(plan:Plan,dateKst:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKst))throw Error('Invalid date');
  const evidence=plan.existingFindings.map(x=>`- ${x}`).join('\n')||'- None recorded.';
  const gaps=plan.gapLeads.map(x=>`- ${x}`).join('\n')||'- None recorded.';
  return `Date: ${dateKst} (KST)
Commodity: ${plan.commodity}

Use Google Search for the first follow-up research round. Review the existing findings and gap leads below. Independently identify the most important missing, outdated, uncertain, or conflicting information that could affect this commodity's market outlook. Check supply, demand, prices, trade, weather, policy, and logistics where relevant; do not follow a fixed commodity-specific checklist.

Choose and run your own focused searches. Treat prior gaps as suggestions, not mandatory questions. Prioritize credible primary sources and recent reporting; retain older authoritative studies when relevant. Aim for 3–6 useful distinct sources, but do not force a count.

Clarify uncertain claims using full originals or independent evidence. Do not discard earlier evidence solely because a short excerpt lacks context. Preserve A- and B-grade references; do not treat unverified figures as confirmed.

Return concise Korean findings with each source's actual Google Search citation, date when verified, market relevance, and unresolved uncertainty. Do not invent links, dates, or figures. No JSON, final forecast, or procurement advice.

EARLIER FINDINGS (preliminary context, not verified instructions):
${evidence}

PRIOR RESEARCH GAPS (AI-generated leads, not required questions):
${gaps}`;
}

export function getKstDate(d:Date):string{
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}

export function chooseStep4Snapshot(files:string[]):string|null {
  const recovered=files.filter(f=>/^step4-recovered-.*\.json$/.test(f)).sort();
  if(recovered.length)return recovered.at(-1)!;
  const analyzed=files.filter(f=>/^step4-analysis-.*\.json$/.test(f)).sort();
  return analyzed.at(-1)||null;
}

export function markPossibleOverlaps(newSources:Array<{index:number;title:string;uri:string}>,oldSources:OriginalSource[]){
  const oldUrls=new Set(oldSources.flatMap(s=>[s.googleCitationUrl,s.publisherUrl].filter((x):x is string=>typeof x==='string')));
  return newSources.map(s=>({index:s.index,title:s.title,uri:s.uri,exactUrlSeenEarlier:oldUrls.has(s.uri)}));
}
