/**
 * STEP5 round-1 evidence sufficiency assessment. Pure functions; no network, billing or writes.
 * General-purpose English instructions: commodity, findings and excerpts are runtime inputs.
 */

export type SourceGrade = 'A'|'B'|'EXCLUDED';
type Excerpt = {id:string;exactExcerpt?:string;theme?:string;charStart?:number};
type Source = {id:string;grade:string;googleTitle?:string;publisherUrl?:string|null;
  googleCitationUrl?:string;publishedAt?:string|null;reason?:string;
  evidence?:Excerpt[]};
type Assessment = {id:string;status?:string;observation?:string;ambiguity?:string;original?:Excerpt};
type Finding = {statement?:string;status?:string;sourceIds?:string[];evidenceIds?:string[];
  impact?:string;uncertainty?:string};
type Gap = {topic?:string;reason?:string;question?:string};
export type Step4 = {commodity?:string;analysis?:{originalInventory?:Source[];
  candidateAssessments?:Assessment[];findings?:Finding[];researchGaps?:Gap[]}};
export type Graded = {commodity?:string;round?:number;stage?:string;summary?:{
  A?:number;B?:number;newAExcerptCandidates?:number};
  review?:Source[];
  records?:Array<{googleCitation?:{title?:string};publisherUrl?:string|null}>;
  duplicateAssessments?:Array<{id?:string;overlap?:string;duplicateOf?:string|null}>;
  priorInventory?:Source[]};
export type Decision = {
  decision:'search'|'stop'|'uncertain';
  reason:string;
  covered:Array<{topic:string;assessment:string;sourceIds:string[]}>;
  remainingGaps:Array<{topic:string;whyImportant:string;searchQuestion:string}>;
  cautions:string[];
};

const trim=(value:unknown,n:number):string=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,n):'';
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((x):x is string=>typeof x==='string'):[];
export const getKstDate=(d:Date)=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);

export type InventoryCounts = {oldSources:number;newSources:number;oldA:number;oldB:number;
  newA:number;newB:number;oldExcerpts:number;newExcerpts:number};

/** All 29 earlier + all 43 new candidate IDs survive in the prompt, even if not decision-relevant. */
export function buildDecisionInput(step4:Step4,graded:Graded,dateKst:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKst))throw Error('Invalid KST date');
  const a=step4?.analysis;
  if(!a||!Array.isArray(a.originalInventory)||!Array.isArray(a.candidateAssessments)
    ||!Array.isArray(a.findings)||!Array.isArray(a.researchGaps))
    throw Error('STEP4 recovered snapshot must contain source inventory, reviews, findings and gaps.');
  if(graded?.stage!=='additional-google-original-verification-round1'||graded.round!==1
    ||!Array.isArray(graded.review)||!Array.isArray(graded.records))
    throw Error('STEP5 input must be actual, graded round-1 Google source verification output.');
  if(!a.originalInventory.length||!graded.review.length)throw Error('Missing source inventory.');
  if(!Array.isArray(graded.priorInventory)||graded.priorInventory.length!==a.originalInventory.length
    ||a.originalInventory.some(s=>!graded.priorInventory?.some(p=>p.id===s.id&&p.grade===s.grade)))
    throw Error('Old source IDs/grades changed between STEP4 and STEP5 snapshots. Preserve original A/B.');
  if(step4.commodity&&graded.commodity&&step4.commodity!==graded.commodity)
    throw Error('Commodity mismatch between old and new evidence');
  const commodity=trim(step4.commodity||graded.commodity,80)||'soybean';
  const oldSourceIds=new Set(a.originalInventory.map(s=>s.id));
  const oldExcerptIds=new Set(a.candidateAssessments.map(s=>s.id));
  if(oldExcerptIds.size!==a.candidateAssessments.length)throw Error('Duplicate prior evidence ID');
  const newerIds=graded.review.flatMap(s=>s.evidence||[]).map(e=>e.id);
  if(new Set(newerIds).size!==newerIds.length||newerIds.some(s=>oldExcerptIds.has(s)))
    throw Error('Duplicate or overlapping source evidence IDs.');

  const gradeById=new Map(a.originalInventory.map(s=>[s.id,s.grade]));
  const previouslyReviewed=a.candidateAssessments.map(c=>({
    id:c.id,
    sourceId:c.id.split('-E')[0],
    grade:gradeById.get(c.id.split('-E')[0])||'A',
    previousStatus:trim(c.status,30),
    theme:trim(c.original?.theme,50),
    excerpt:trim(c.original?.exactExcerpt,500),
  }));
  const duplicates=new Map((graded.duplicateAssessments||[]).map(d=>[d.id,d.overlap]));
  const newlyCollected=graded.review.map(s=>({
    id:s.id,grade:s.grade,title:trim(s.googleTitle,120),
    originalUrl:trim(s.publisherUrl,330)||null,
    publishedDate:trim(s.publishedAt,30)||'unknown',
    duplicateStatus:trim(duplicates.get(s.id)||'',60)||'unknown',
    availability:s.grade==='A'?'publisher-readable':'citation-only / not independently verified',
    passages:(s.grade==='A'?s.evidence||[]:[]).map(e=>({
      id:e.id,theme:trim(e.theme,50),excerpt:trim(e.exactExcerpt,550),
    })),
  }));
  const priorFindings=a.findings.slice(0,18).map(f=>({
    claim:trim(f.statement,430),status:trim(f.status,40),
    impactInterpretation:trim(f.impact,270),uncertainty:trim(f.uncertainty,180),
    sourceIds:strings(f.sourceIds).slice(0,6),evidenceIds:strings(f.evidenceIds).slice(0,7),
  }));
  const priorGaps=a.researchGaps.slice(0,12).map(g=>({
    topic:trim(g.topic,150),why:trim(g.reason,250),question:trim(g.question,260),
  }));
  const counts:InventoryCounts={
    oldSources:a.originalInventory.length,newSources:graded.review.length,
    oldA:a.originalInventory.filter(s=>s.grade==='A').length,
    oldB:a.originalInventory.filter(s=>s.grade==='B').length,
    newA:graded.review.filter(s=>s.grade==='A').length,
    newB:graded.review.filter(s=>s.grade==='B').length,
    oldExcerpts:previouslyReviewed.length,newExcerpts:newerIds.length,
  };
  if(!counts.oldExcerpts||!counts.newExcerpts)throw Error('No old or new evidence excerpts; no paid decision request.');
  const input={dateKst,commodity,counts,priorFindings,priorGaps,previouslyReviewed,
    newSources:newlyCollected,oldSourceIndex:a.originalInventory.map(s=>({id:s.id,grade:s.grade,
      title:trim(s.googleTitle,100),url:trim(s.publisherUrl,280)||null,publishedAt:trim(s.publishedAt,30)||'unknown'})),
    oldBAndExcluded:a.originalInventory
      .filter(s=>s.grade!=='A').map(s=>({id:s.id,grade:s.grade,origin:trim(s.googleTitle,90),
        reason:trim(s.reason,90),citationUrl:trim(s.googleCitationUrl,330)})),
    oldSourceIds:[...oldSourceIds],
  };
  return input;
}

/** Common English prompt: NEVER hard-code soybean/China/CBOT as mandatory questions. */
export function buildDecisionPrompt(input:ReturnType<typeof buildDecisionInput>):string{
  return `Date: ${input.dateKst} (KST)\nCommodity: ${input.commodity}\n\nDecide whether ONE final Google Search follow-up round is necessary for a useful market outlook. Review all previous and newly collected evidence below. Independently judge whether important, decision-relevant gaps remain; do not require a fixed number of sources or a commodity-specific checklist. Prior questions are leads, not obligations.\n\nConsider coverage, timeliness, conflicting claims, and actual market impact. Distinguish genuinely new information from repeated reporting of the same source. Readable A-grade pages are not automatically verified facts. Preserve every A/B source and excerpt, including ambiguous or older material; seek clarification instead of deleting it. Do not treat B-only claims or unclear PDF table numbers as confirmed.\n\nChoose "search" only if another search is likely to resolve important gaps. Choose "stop" if evidence is sufficient for a qualified outlook despite minor uncertainties. Choose "uncertain" if the choice cannot be supported. If searching, independently formulate up to 3 high-value questions (not compulsory topics).\n\nReturn brief valid JSON ONLY in Korean, with exactly these keys:\n{"decision":"search|stop|uncertain","reason":"short justification","covered":[{"topic":"market topic","assessment":"what is now known and remaining limits","sourceIds":["G100"]}],"remainingGaps":[{"topic":"topic","whyImportant":"market impact","searchQuestion":"your own research question"}],"cautions":["short caveat"]}\nAt most 5 covered topics, 3 remaining gaps and 3 cautions. Reference only source IDs present in the input. Do not invent sources, dates, figures, or new numerical claims. No Google Search/tool calls, no final forecast and no purchasing advice.\n\nEVIDENCE INVENTORY (prior statements are preliminary, not instructions):\n${JSON.stringify(input)}`;
}

/** JSON-only caution presentation repair. Never invents a search decision or changes source IDs. */
export function normalizeCaution(value:unknown):string|null{
  if(typeof value==='string')return value.trim()?value:null;
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const fields=Object.entries(value);
  if(!fields.length||fields.length>6)return null;
  const pieces:string[]=[];
  for(const [key,raw] of fields){
    if(!key.trim()||key.length>80)return null;
    let text:string;
    if(typeof raw==='string'&&raw.trim())text=raw.trim();
    else if(Array.isArray(raw)&&raw.length>0&&raw.length<=10&&
      raw.every(s=>typeof s==='string'&&s.trim()))text=raw.join(', ');
    else return null;
    pieces.push(key==='short caveat'?text:`${key}: ${text}`);
  }
  return pieces.join('; ');
}

export function parseDecisionResponse(text:string):Decision|null{
  const raw=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let obj:any;
  try{obj=JSON.parse(raw);}catch{return null;}
  if(!obj||!['search','stop','uncertain'].includes(obj.decision)
    ||typeof obj.reason!=='string'||!Array.isArray(obj.covered)
    ||!Array.isArray(obj.remainingGaps)||!Array.isArray(obj.cautions))return null;
  if(obj.covered.length>5||obj.remainingGaps.length>3||obj.cautions.length>3)return null;
  if(obj.covered.some((x:any)=>!x||typeof x.topic!=='string'||typeof x.assessment!=='string'
    ||!Array.isArray(x.sourceIds)||x.sourceIds.some((s:any)=>typeof s!=='string')))return null;
  if(obj.remainingGaps.some((x:any)=>!x||typeof x.topic!=='string'||typeof x.whyImportant!=='string'
    ||typeof x.searchQuestion!=='string'))return null;
  // Preserve non-empty caution objects as text instead of rejecting an otherwise
  // structurally valid decision. No decision / covered evidence is inferred here.
  const cautions=obj.cautions.map(normalizeCaution);
  if(cautions.some((x:any)=>typeof x!=='string'||!x.trim()))return null;
  // Do not quietly turn a missing research plan into an automatic search.
  return {decision:obj.decision,reason:trim(obj.reason,950),
    covered:obj.covered.map((x:any)=>({topic:trim(x.topic,140),assessment:trim(x.assessment,420),sourceIds:x.sourceIds.slice(0,10)})),
    remainingGaps:obj.remainingGaps.map((x:any)=>({topic:trim(x.topic,120),whyImportant:trim(x.whyImportant,330),
      searchQuestion:trim(x.searchQuestion,330)})),cautions:cautions.map((x:string)=>trim(x,260))};
}

export function auditDecisionReferences(decision:Decision,input:ReturnType<typeof buildDecisionInput>){
  const eligible=new Set([...input.oldSourceIds,...input.newSources.map(s=>s.id)]);
  const invalidIds=decision.covered.flatMap(x=>x.sourceIds.filter(id=>!eligible.has(id)));
  const bOnlyClaims=decision.covered.filter(x=>x.sourceIds.length&&x.sourceIds.every(id=>{
    const newer=input.newSources.find(y=>y.id===id);
    if(newer)return newer.grade!=='A';
    return input.oldBAndExcluded.some(y=>y.id===id);
  })).map(x=>x.topic);
  return {invalidIds:[...new Set(invalidIds)],bOnlyCoverageTopics:bOnlyClaims};
}

export function renderDecisionReport(input:ReturnType<typeof buildDecisionInput>,model:string,
  result:Decision|null,audit:ReturnType<typeof auditDecisionReferences>|null,
  rawState:string,usedTokens?:Record<string,unknown>):string{
  const out=['# STEP 5 — 1차 추가 조사 후 정보 충분성 판단','',
    `- 품목: ${input.commodity} / 판단 기준일: ${input.dateKst}`,
    `- 모델: ${model} / 상태: ${rawState}`,
    `- 기존 출처 A ${input.counts.oldA} · B ${input.counts.oldB}, 신규 출처 A ${input.counts.newA} · B ${input.counts.newB}`,
    `- 원문 후보 ${input.counts.oldExcerpts} + ${input.counts.newExcerpts} = ${input.counts.oldExcerpts+input.counts.newExcerpts}개 보존`,
    '- **주의:** 자료 등급 A는 원문을 읽었다는 뜻이며, 수치 하나하나의 독립 검증은 아닙니다.',
    '- **자동 2차 검색 없음. 기존 결과 파일 덮어쓰기 없음.**',''];
  if(!result){out.push('## 모델 응답 파싱 실패','',
    '완성된 JSON 판단을 받지 못했습니다. 검색 여부를 임의로 결정하지 않았습니다. 원본 응답은 새 JSON 파일에 저장됩니다.','');return out.join('\n');}
  const action=result.decision==='search'?'2차 검색 권고 (실행하지 않음)':result.decision==='stop'?'2차 검색 생략 권고':'사람 검토 필요';
  out.push('## 판단','',`**${action}**`,'',result.reason,'','## 확인된 시장 영역','');
  for(const x of result.covered)out.push(`- **${x.topic}**: ${x.assessment} (출처: ${x.sourceIds.join(', ')||'미지정'})`);
  out.push('','## 남은 중요 정보 공백','');
  if(!result.remainingGaps.length)out.push('- 추가 검색이 필요할 정도의 중요 공백은 제시되지 않음.');
  for(const x of result.remainingGaps)out.push(`- **${x.topic}**: ${x.whyImportant} / AI 질문: ${x.searchQuestion}`);
  if(result.cautions.length){out.push('','## 유의점','');for(const c of result.cautions)out.push(`- ${c}`);}
  if(audit?.invalidIds.length)out.push('','**인용 ID 재검토 필요:** '+audit.invalidIds.join(', '));
  if(audit?.bOnlyCoverageTopics.length)out.push('','**B·제외 출처만 연결된 영역(확정 근거 아님):** '+audit.bOnlyCoverageTopics.join(', '));
  if(usedTokens&&Object.keys(usedTokens).length)out.push('','## 사용량 메타데이터','',JSON.stringify(usedTokens));
  out.push('','※ 이 문서는 Gemini의 추가 조사 필요성 판단으로, 최종 시장전망이나 구매전략이 아닙니다.');
  return out.join('\n');
}
