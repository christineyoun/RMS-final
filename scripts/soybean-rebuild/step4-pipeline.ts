/**
 * STEP 4: one Gemini review over already collected soybean source text.
 * NO search, fetching, changing earlier files, publication, or hard rejection gates.
 * All original STEP 3 items and all candidate excerpts survive unchanged in outputs.
 */
import type {ReviewItem, EvidenceWindow} from './step3-evidence.ts';
import {type Commodity,COMMODITY_NAMES,COMMODITY_KO} from './commodity-config.ts';

export type ReviewStatus = 'confirmed'|'provisional'|'needs-clarification'|'unreviewed';
export type RawCandidateAssessment = {
  id:string;
  status?: string;
  observation?: string;
  ambiguity?: string;
};
export type RawFinding = {
  statement?:string;
  evidenceIds?:string[];
  sourceIds?:string[];
  status?:string;
  period?:string|null;
  figure?:string|null;
  impact?:string;
  uncertainty?:string;
};
export type RawAssessment={
  candidateReviews?:RawCandidateAssessment[];
  findings?:RawFinding[];
  researchGaps?:Array<{topic?:string;reason?:string;question?:string}>;
  coverage?:string;
};
export type AuditCandidate = {id:string; status:ReviewStatus; observation:string; ambiguity:string; reviewedByModel:boolean; original:EvidenceWindow};
export type Finding = {
  statement:string; evidenceIds:string[]; sourceIds:string[]; status:ReviewStatus;
  period:string|null; figure:string|null; impact:string; uncertainty:string;
  auditNotes:string[];
};
export type IntegratedResult={
  originalInventory:ReviewItem[];
  candidateAssessments:AuditCandidate[];
  findings:Finding[];
  researchGaps:Array<{topic:string;reason:string;question:string}>;
  coverage:string;
  audit:{candidateCount:number;modelReviewedCount:number;autoPreservedUnreviewed:number;unknownReviewIds:string[];unknownFindingEvidenceIds:string[];sourceCounts:{A:number;B:number;EXCLUDED:number};statusCounts:Record<ReviewStatus,number>;policy:string};
};

function safeText(s:unknown,max:number=1000):string {return typeof s==='string'?s.trim().slice(0,max):'';}
function status(s:unknown): ReviewStatus {
  return s==='confirmed'||s==='provisional'||s==='needs-clarification'?s:'needs-clarification';
}
export function summarizeTextContext(fullText:string|null,ev:EvidenceWindow,contextExtra=360):string{
  if(!fullText)return ev.exactExcerpt;
  const normalized=fullText.replace(/\s+/g,' ').trim();
  const start=Math.max(0,ev.charStart-contextExtra);
  const end=Math.min(normalized.length,ev.charStart+ev.exactExcerpt.length+contextExtra);
  return normalized.slice(start,end);
}
export function buildPrompt(items:ReviewItem[],textBySource:Record<string,string|null>,koreaDate:string,commodity:Commodity='soybean'):string {
  const evidence=items.filter(x=>x.grade==='A').map(x=>({
    id:x.id,sourceGrade:'A',title:x.googleTitle,originalUrl:x.publisherUrl,publicationDate:x.publishedAt||'unknown',
    warnings:x.warnings,
    passages:x.evidence.map(e=>({evidenceId:e.id,theme:e.theme,exactExcerpt:e.exactExcerpt,
      adjacentOriginalContext:summarizeTextContext(textBySource[x.id]||null,e)})),
  }));
  const b=items.filter(x=>x.grade==='B').map(x=>({id:x.id,sourceGrade:'B',title:x.googleTitle,
    googleCitationUrl:x.googleCitationUrl,originalUrl:x.publisherUrl,availability:x.eligibility,
    publicationDate:x.publishedAt||'unknown',reason:x.reason}));
  const prompt=`You are a careful ${COMMODITY_NAMES[commodity]} commodity research analyst. Today: ${koreaDate} KST.
Review the following ALREADY COLLECTED research. Do NOT use Google Search, invent sources, invent numbers, or produce final forecasts/procurement recommendations.

RULES:
1. Preserve every evidence candidate. For each A evidenceId, classify as confirmed (explicit source text, clear unit/period), provisional (supported but qualification needed), or needs-clarification (e.g. garbled PDF tables, unclear period/unit). Unreviewed candidates will be retained by code.
2. Do NOT discard evidence just because it is incomplete, old, undated, ambiguous, contradictory, or repetitive. Explain limits and what would resolve them. Dates missing from metadata may sometimes be stated inside the source context, but never guess dates.
3. For each meaningful market finding, keep sourceIds and/or evidenceIds, numeric figures and exact units/period only when unambiguously bound in the provided publisher text. Otherwise describe the qualitative information and flag uncertainty. Do not treat a fragment of a PDF table as a validated row.
4. B sources are preserved and can inform open questions ONLY within the Google-cited title/metadata given below. Do NOT make B-only numeric or detailed factual assertions. B publisher-unrelated is NOT ${COMMODITY_NAMES[commodity]} evidence.
5. Clearly separate reported facts from YOUR possible market implications, and describe information gaps for later research. Source age and differences between agencies are context, not automatic rejection reasons.
6. Respond in Korean using valid JSON ONLY with these keys:
{"candidateReviews":[{"id":"G001-E1","status":"confirmed|provisional|needs-clarification","observation":"brief factual point","ambiguity":"reason or empty"}],"findings":[{"statement":"fact in Korean","evidenceIds":["G001-E1"],"sourceIds":["G001"],"status":"confirmed|provisional|needs-clarification","period":"2026/27 or null","figure":"optional exact numeric phrase or null","impact":"your reasoned possible market effect, clearly labeled as interpretation","uncertainty":"limits or empty"}],"researchGaps":[{"topic":"topic","reason":"what remains unclear","question":"concrete later-search question"}],"coverage":"short overview of covered and missing themes"}.
No minimum facts or confirmed count. Prioritize meaningful, verifiable coverage over quotas. Aim for compact candidateReviews covering ALL given IDs. Up to 12 distinct findings and 8 research gaps.

A ORIGINAL PUBLISHER EXCERPTS (not independently number-verified):
${JSON.stringify(evidence)}

B RETAINED GOOGLE-CITED SOURCES (not original-content verified):
${JSON.stringify(b)}

Other sources marked EXCLUDED stay in the archived inputs and must not be treated as verified evidence.`;
  return prompt;
}

/** Treat the model as an annotator, never as an authority that may delete source material. */
export function integrate(items:ReviewItem[],raw:RawAssessment,commodity:Commodity='soybean'):IntegratedResult {
  const originals=structuredClone(items);
  const candidates=items.flatMap(x=>x.evidence.map(e=>({source:x,evidence:e})));
  const candidateMap=new Map(candidates.map(({source,evidence})=>[evidence.id,{source,evidence}]));
  const sourceMap=new Map(items.map(x=>[x.id,x]));
  const reviews=Array.isArray(raw?.candidateReviews)?raw.candidateReviews:[];
  const reviewMap=new Map<string,RawCandidateAssessment>();const unknownReviewIds:string[]=[];
  for(const r of reviews){
    if(!r||typeof r.id!=='string')continue;
    if(!candidateMap.has(r.id)){unknownReviewIds.push(r.id);continue;}
    if(!reviewMap.has(r.id))reviewMap.set(r.id,r);
  }
  const assessed=candidates.map(({source,evidence})=>{
    const r=reviewMap.get(evidence.id);
    // A source excerpt is only machine-selected, not independently fact-checked.
    let result:ReviewStatus=r?status(r.status):'unreviewed';
    // The model may request 'confirmed' only for explicit, unambiguous source-context observations.
    // Actual numerical validation is still a separate evidence-binding task.
    if(source.grade!=='A')result='needs-clarification';
    return {id:evidence.id,status:result,observation:safeText(r?.observation,550),
      ambiguity:safeText(r?.ambiguity,550),reviewedByModel:Boolean(r),original:structuredClone(evidence)} satisfies AuditCandidate;
  });
  const unknownFindingEvidenceIds:string[]=[];
  const findings:Finding[]=(Array.isArray(raw?.findings)?raw.findings:[]).slice(0,80).map(entry=>{
    const f=(entry&&typeof entry==='object')?entry:{} as RawFinding;
    const requestedIds=Array.isArray(f.evidenceIds)?f.evidenceIds.filter(x=>typeof x==='string'):[];
    const evidenceIds=requestedIds.filter(id=>candidateMap.has(id));
    for(const id of requestedIds)if(!candidateMap.has(id))unknownFindingEvidenceIds.push(id);
    const sourceIds=Array.isArray(f.sourceIds)?f.sourceIds.filter(x=>typeof x==='string'&&sourceMap.has(x)):[];
    for(const id of evidenceIds){const sourceId=candidateMap.get(id)?.source.id;if(sourceId&&!sourceIds.includes(sourceId))sourceIds.push(sourceId);}
    const notes:string[]=[];
    let st=status(f.status);
    if(requestedIds.length!==evidenceIds.length){st='needs-clarification';notes.push('모델이 존재하지 않는 발췌 ID를 인용함. 원본 증거는 보존됨.');}
    if(!sourceIds.length){st='needs-clarification';notes.push('출처가 연결되지 않아 사실 확정 불가.');}
    const bSources=sourceIds.filter(id=>sourceMap.get(id)?.grade==='B');
    const bUnrelated=bSources.filter(id=>sourceMap.get(id)?.eligibility==='retained-not-usable-as-soybean-evidence');
    if(bUnrelated.length){st='needs-clarification';notes.push(`${COMMODITY_KO[commodity]} 관련성을 확인하지 못한 B 출처가 포함됨.`);}
    if(!evidenceIds.length&&bSources.length){
      if(st==='confirmed')st='provisional';
      notes.push('Google 인용 B 출처만 존재: 원문 숫자·구체적 사실 확정 금지.');
    }
    if(!evidenceIds.length&&!bSources.length){st='needs-clarification';notes.push('확인된 A 발췌문 또는 B 인용 근거가 없음.');}
    const figure=safeText(f.figure,150)||null;
    if(figure){
      if(!evidenceIds.length){st='needs-clarification';notes.push('숫자에 연결된 A등급 원문 발췌가 없음.');}
      else {
        const excerptText=evidenceIds.map(id=>candidateMap.get(id)?.evidence.exactExcerpt||'').join(' ');
        const numerals=figure.match(/\d[\d,.]*/g)||[];
        const missing=numerals.filter(n=>!excerptText.includes(n));
        if(missing.length){st='needs-clarification';notes.push(`제시한 숫자 중 발췌문에서 찾지 못한 값: ${missing.join(', ')}`);}
      }
    }
    return {statement:safeText(f.statement,750),evidenceIds,sourceIds,status:st,
      period:safeText(f.period,100)||null,figure,impact:safeText(f.impact,800),
      uncertainty:safeText(f.uncertainty,500),auditNotes:notes};
  });
  const researchGaps=(Array.isArray(raw?.researchGaps)?raw.researchGaps:[]).slice(0,30).map(entry=>{
    const g=(entry&&typeof entry==='object')?entry:{} as {topic?:string;reason?:string;question?:string};
    return {topic:safeText(g.topic,220),reason:safeText(g.reason,550),question:safeText(g.question,450)};
  });
  const statusCounts:Record<ReviewStatus,number>={'confirmed':0,'provisional':0,'needs-clarification':0,'unreviewed':0};
  for(const a of assessed)statusCounts[a.status]++;
  return {originalInventory:originals,candidateAssessments:assessed,findings,researchGaps,coverage:safeText(raw?.coverage,1200),
    audit:{candidateCount:candidates.length,modelReviewedCount:assessed.filter(x=>x.reviewedByModel).length,
      autoPreservedUnreviewed:assessed.filter(x=>!x.reviewedByModel).length,unknownReviewIds,
      unknownFindingEvidenceIds,sourceCounts:{A:items.filter(x=>x.grade==='A').length,
        B:items.filter(x=>x.grade==='B').length,EXCLUDED:items.filter(x=>x.grade==='EXCLUDED').length},
      statusCounts,policy:'Do not delete originals. Source-level A/B remains unchanged; uncertain findings are retained but flagged, not silently discarded.'}};
}

export function parseJsonReply(text:string):RawAssessment|null {
  const stripped=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const begin=stripped.indexOf('{'),end=stripped.lastIndexOf('}');
  if(begin<0||end<=begin)return null;
  try {
    const obj=JSON.parse(stripped.slice(begin,end+1));
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
    if(!Array.isArray(obj.candidateReviews)||!Array.isArray(obj.findings)||!Array.isArray(obj.researchGaps))return null;
    return obj;
  }catch{return null;}
}
export function toMarkdown(result:IntegratedResult,metadata:{model:string;step3File:string;apiStatus:string;notes?:string;commodity?:Commodity}):string {
  const {audit}=result;const out=[
    `# ${COMMODITY_KO[metadata.commodity||'soybean']} STEP 4 — Gemini 원문 사실 검토 (최종 시황 분석 아님)`,'',
    `- 상태: ${metadata.apiStatus}`,
    `- 모델: ${metadata.model}`,
    `- 입력: ${metadata.step3File}`,
    `- 원본 출처: A ${audit.sourceCounts.A}건 / B ${audit.sourceCounts.B}건 / 제외 ${audit.sourceCounts.EXCLUDED}건 (모두 보존)`,
    `- 원문 발췌 후보: ${audit.candidateCount}개 (모두 보존) / Gemini 분류: ${audit.modelReviewedCount}개 / 미분류 자동보존: ${audit.autoPreservedUnreviewed}개`,
    `- 판단: 확정 ${audit.statusCounts.confirmed} / 잠정 ${audit.statusCounts.provisional} / 추가확인 ${audit.statusCounts['needs-clarification']} / 미검토 ${audit.statusCounts.unreviewed}`,
    '', '**주의:** 여기서 ‘확정’은 제공된 원문 문맥이 명확하다는 Gemini의 판정이지, 모든 수치를 독립적으로 재검산했다는 뜻이 아닙니다.',
    '',`**검토 메모:** ${metadata.notes||'모든 원문 발췌는 별도의 JSON 결과에 그대로 들어 있습니다.'}`,'',
    '## Gemini가 정리한 핵심 사실 후보','',
  ];
  if(!result.findings.length)out.push('- 추출된 해석이 없더라도 모든 원본 후보는 아래에 보존되어 있습니다.');
  for(const f of result.findings){
    out.push(`### [${f.status}] ${f.statement||'(내용 미기재)'}`,
      `- 출처: ${f.sourceIds.join(', ')||'미확인'} / 증거: ${f.evidenceIds.join(', ')||'미연결'}`,
      `- 기준: ${f.period||'미확인'} / 수치: ${f.figure||'없음'}`);
    if(f.impact)out.push(`- 해석(시장 영향 가능성): ${f.impact}`);
    if(f.uncertainty)out.push(`- 불확실성: ${f.uncertainty}`);
    for(const note of f.auditNotes)out.push(`- 추가 점검: ${note}`);
    out.push('');
  }
  out.push('## 원문 발췌 후보 보존 및 검토 현황','', '| ID | 상태 | 원문 주제 | Gemini 판단 |','|---|---|---|---|');
  const cell=(s:string)=>s.replace(/\|/g,'\\|').replace(/\r?\n/g,' ').slice(0,210);
  for(const x of result.candidateAssessments){out.push(`| ${x.id} | ${x.status} | ${x.original.theme} | ${cell(x.observation||x.ambiguity||'원문을 유지하고 추가 검토')} |`);}
  out.push('','## B등급 출처 (미삭제)','', '| ID | 출처 | 현재 이용 상태 |','|---|---|---|');
  for(const s of result.originalInventory.filter(x=>x.grade==='B'))out.push(`| ${s.id} | ${cell(s.googleTitle)} | ${s.eligibility} |`);
  out.push('','## 추가 조사 필요 항목 (다음 단계에서만 검색)','');
  if(!result.researchGaps.length)out.push('- 아직 Gemini의 추가 질문 없음.');
  for(const x of result.researchGaps)out.push(`- **${x.topic||'미지정'}:** ${x.reason}${x.question?` / 질문: ${x.question}`:''}`);
  out.push('','## 전체 평가','',result.coverage||'(Gemini 분석 없음)','',
    '**자동 검색·추가 Gemini 호출·RMS 게시 없음.** 모델의 판단과 관계없이 원본 A/B/제외 자료 및 발췌 100% 보존.','');
  return out.join('\n');
}
