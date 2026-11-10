/**
 * STEP 4 read-only recovery helper. It parses only finished JSON objects that
 * are already present in a saved Gemini response. Never guesses missing text.
 * No network requests, Gemini calls, or writes to existing STEP 1–4 files.
 */
import {parseJsonReply} from './step4-pipeline.ts';
import type {RawAssessment, RawCandidateAssessment, RawFinding} from './step4-pipeline.ts';

type Gap={topic?:string;reason?:string;question?:string};
export type Recovery = {
  parseMode:'complete'|'partial-objects'|'none';
  modelResult:RawAssessment|null;
  counts:{candidateReviews:number;findings:number;researchGaps:number};
  warnings:string[];
};

/** Read complete JSON objects from a named top-level array even if the tail is truncated. */
export function extractFinishedObjects(source:string,key:'candidateReviews'|'findings'|'researchGaps'):Record<string,unknown>[] {
  const match=new RegExp('"'+key+'"\\s*:\\s*\\[').exec(source);
  if(!match)return [];
  const result:Record<string,unknown>[]=[];
  let inString=false,escaped=false,depth=0,start=-1;
  for(let i=match.index+match[0].length;i<source.length&&result.length<150;i++) {
    const c=source[i];
    if(inString){
      if(escaped)escaped=false;
      else if(c==='\\')escaped=true;
      else if(c==='"')inString=false;
      continue;
    }
    if(c==='"'){inString=true;continue;}
    if(c==='{' ){if(depth===0)start=i;depth++;continue;}
    if(c==='}' && depth>0){
      depth--;
      if(depth===0&&start>=0){
        const raw=source.slice(start,i+1);
        try{
          const obj:unknown=JSON.parse(raw);
          if(obj!==null&&typeof obj==='object'&&!Array.isArray(obj))result.push(obj as Record<string,unknown>);
        }catch{ /* A broken item is not proof; keep it in original raw response only. */ }
        start=-1;
      }
      continue;
    }
    if(c===']'&&depth===0)break;
  }
  return result;
}

export function recoverSavedResponse(raw:string):Recovery {
  if(typeof raw!=='string'||!raw.trim())return {
    parseMode:'none',modelResult:null,counts:{candidateReviews:0,findings:0,researchGaps:0},
    warnings:['모델 응답 텍스트가 비어 있음. 저장된 응답에서 복구할 사실이 없음.']};
  const complete=parseJsonReply(raw);
  if(complete)return {parseMode:'complete',modelResult:complete,
    counts:{candidateReviews:complete.candidateReviews?.length||0,findings:complete.findings?.length||0,researchGaps:complete.researchGaps?.length||0},warnings:[]};

  const reviews=extractFinishedObjects(raw,'candidateReviews').filter(x=>typeof x.id==='string') as RawCandidateAssessment[];
  const findings=extractFinishedObjects(raw,'findings').filter(x=>typeof x.statement==='string') as RawFinding[];
  const gaps=extractFinishedObjects(raw,'researchGaps').filter(x=>
    typeof x.topic==='string'||typeof x.reason==='string'||typeof x.question==='string') as Gap[];
  const counts={candidateReviews:reviews.length,findings:findings.length,researchGaps:gaps.length};
  if(!reviews.length&&!findings.length&&!gaps.length)return {parseMode:'none',modelResult:null,counts,
    warnings:['유효한 완성 객체가 없음. 응답이 잘렸거나 JSON이 아닌 형식일 수 있음. 원본 저장 데이터는 그대로 보존됨.']};
  return {parseMode:'partial-objects',modelResult:{candidateReviews:reviews,findings,researchGaps:gaps,coverage:''},counts,
    warnings:['복구 결과는 불완전한 모델 응답에서 **끝까지 닫힌 JSON 객체만** 모은 부분 결과임.',
      '누락 항목은 생성하지 않음. 원본 발췌문과 출처 보존은 기존 integrate 규칙을 따름.']};
}
