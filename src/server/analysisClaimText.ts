import {validAnalysisFact,type AnalysisEvidence} from './analysisEvidence.ts';
import {ANALYSIS_SECTIONS_FORMAT,compileAnalysisSections} from './analysisSections.ts';
/** Single-source wire representation for claim-contract-v5. No prose repair.
 * Legacy responses retain their exact text/map validation, including diagnostics.
 */
export const CLAIM_TEXT_FORMAT='typed-segments-v1';
export const VERIFIED_FACT_BINDING='verified-records-v1';
const singles=['deskRecommendation','executiveSummary'];
const lists=['bullishFactors','bearishFactors','watchItems'];
/** Canonical reference records remain in the audit; section prose alone is visible.
 * Legacy typed-segment reports keep their original rendering contract. */
export function visibleClaimText(segments:any[],sections=false):string {
 const visible=segments.filter(s=>!sections||s.kind!=='fact'&&!s.auditOnly);
 return visible.map((s,i)=>(i&&s.paragraph!==undefined&&s.paragraph!==visible[i-1].paragraph?'\n\n':i?' ':'')+s.text).join('');
}
export function materializeClaimText(data:any,evidence?:AnalysisEvidence,now=new Date()):any {
 if(data?.outputFormat===ANALYSIS_SECTIONS_FORMAT){
  const compiled=compileAnalysisSections(data,evidence,now);
  const result=materializeClaimText(compiled.data,evidence,now);
  for(const claim of result.evidenceClaims){
   const text=visibleClaimText(claim.segments,true),[field,index]=claim.field.split('.');
   if(index===undefined)result[field]=text;else result[field][Number(index)]=text;
  }
  return {...result,sectionFormat:ANALYSIS_SECTIONS_FORMAT,...(data.reportStyle?{reportStyle:data.reportStyle}:{}),omittedSections:compiled.omitted,sectionCoverage:compiled.coverage};
 }
 if(!data||typeof data!=='object'||Array.isArray(data)||data.outputFormat===undefined)return data;
 if(data.outputFormat!==CLAIM_TEXT_FORMAT)throw Error('unknown-claim-text-format');
 const allowed=new Set(['outputFormat','evidenceContractVersion','confidenceScore','evidenceClaims','factBinding']);
 if(Object.keys(data).some(k=>!allowed.has(k)))throw Error('mixed-or-extra-claim-text-fields');
 if(data.evidenceContractVersion!==4||!Array.isArray(data.evidenceClaims))throw Error('invalid-claim-text-envelope');
 if(data.factBinding!==undefined){
  if(data.factBinding!==VERIFIED_FACT_BINDING||!evidence||evidence.facts.some(f=>!validAnalysisFact(f,evidence.commodity,now)))throw Error('invalid-or-unverified-fact-binding');
  const facts=new Map(evidence.facts.map(f=>[f.id,f]));if(facts.size!==evidence.facts.length)throw Error('duplicate-fact-binding-evidence');
  // Work on a separate object. Retained provider output is never mutated.
  data=structuredClone(data);
  for(const claim of Array.isArray(data.evidenceClaims)?data.evidenceClaims:[])for(const segment of Array.isArray(claim?.segments)?claim.segments:[]){
   if(segment?.kind!=='fact')continue;
   // New requests require a text slot for every kind. An empty fact slot is
   // only a reference placeholder; older omitted slots remain replayable.
   if(segment.text!==undefined&&segment.text!=='')throw Error('model-factual-text-in-reference-mode');
   if(!Array.isArray(segment.evidenceIds)||segment.evidenceIds.length!==1||!facts.has(segment.evidenceIds[0])||!Array.isArray(segment.support)||segment.support.length)throw Error('invalid-canonical-fact-reference');
   segment.text=facts.get(segment.evidenceIds[0])!.text;
  }
 }
 const mapped=new Map<string,string>();
 for(const claim of data.evidenceClaims){
  if(!claim||typeof claim.field!=='string'||mapped.has(claim.field)||!Array.isArray(claim.segments)||!claim.segments.length||
    claim.segments.some((s:any)=>!s||typeof s.text!=='string'||!s.text.trim()))throw Error('invalid-or-duplicate-claim-text-field');
  mapped.set(claim.field,claim.segments.map((s:any)=>s.text).join(' '));
 }
 const result={...data};
 for(const name of singles){if(!mapped.has(name))throw Error('missing-claim-text-field:'+name);result[name]=mapped.get(name);mapped.delete(name);}
 for(const name of lists){const items:string[]=[];for(let i=0;i<3;i++){const field=name+'.'+i;if(!mapped.has(field))break;items.push(mapped.get(field)!);mapped.delete(field);}if(items.length<(data.factBinding===VERIFIED_FACT_BINDING?0:2))throw Error('missing-claim-text-items:'+name);result[name]=items;}
 if(mapped.size)throw Error('unknown-or-noncontiguous-claim-text-field');
 return result; // All text, IDs/aspects and every segment still pass the existing validator.
}
