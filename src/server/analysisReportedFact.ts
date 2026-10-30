/** Bounded factual restatements of verified RMS records. This deliberately is
 * not a free-text entailment engine: every substantive token must occur as a
 * contiguous span in ONE original evidence sentence. Unknown paraphrases fail closed.
 * Inferences/actions continue through the existing reasoning validator. */
import {factualLanguage,splitAnalysisStatements} from './analysisStatementLanguage.ts';
import {supportedFactualProjection} from './analysisFactualPropositions.ts';
import type {AnalysisFact} from './analysisEvidence.ts';
import {newsNumbersIssue} from './newsEvidenceQuality.ts';
import {sourcePropositionSupport} from './analysisSourcePropositions.ts';

const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const forecast=/전망|예상|추정|forecast|expected|estimate/i;
const modal=/가능|우려|위험|수 있|may\b|could\b|potential|risk/i;
const negative=/아니|아닌|아닐|아닙|아님|않|없|어렵|불확실|미확인|미검증|not\b|never\b|cannot\b/i;
const limited=/잠정|참고|표본|provisional|indicative|proxy/i;
const conditional=/경우|다면|으면|하면|if\b|unless\b/i;
const particles=/(?:에서는|으로는|으로|에서|에는|은|는|이|가|을|를|의|와|과|로)$/;
function tokens(text:string){
 return factualLanguage(text).replace(/(?:입니다|이었습니다|였습니다|습니다|했습니다|합니다|이다|였다|라고|이라고|했다고|제시했습니다|기록했습니다)[.!?]?$/,'')
  .match(/[+−-]?[\p{L}\p{N}]+(?:[.,]\d+)?/gu)?.map(t=>t.toLowerCase().replace(particles,''))
  .filter(t=>t&&!['보고','보고서','보도','업데이트','기준','제시','기록','공표'].includes(t))||[];
}
/** Keep every sentence's own context. Do not join separate records or harvest
 * an unrelated number elsewhere on a publisher page to support an assertion. */
export function validateReportedFact(text:string,refs:AnalysisFact[]):{issues:string[];evidenceIds:string[]} {
 const sourced=sourcePropositionSupport(text,refs);
 if(sourced)return {issues:[],evidenceIds:sourced};
 const projected=supportedFactualProjection(text,refs);
 if(projected)return {issues:[],evidenceIds:projected};
 const statements=splitAnalysisStatements(text).flatMap(s=>s.split(/(?<=(?:이며|이고|반면),)\s+/));
 if(statements.length>1){
  const proofs=statements.map(statement=>validateReportedFact(statement,refs));
  return {issues:proofs.flatMap((p,i)=>p.issues.map(issue=>'statement-'+i+':'+issue)),evidenceIds:[...new Set(proofs.flatMap(p=>p.evidenceIds))]};
 }
 const claim=normalize(text),words=tokens(claim);
 if(words.length<3)return {issues:['insufficient-factual-proposition'],evidenceIds:[]};
 if(/https?:\/\/|반드시|무조건|보장|즉시\s*(?:매수|구매)|하십시오|권고|검토|점검|모니터링/.test(claim))return {issues:['not-a-factual-proposition'],evidenceIds:[]};
 const failures=new Set<string>();
 for(const f of refs){
  const mismatch=newsNumbersIssue(claim,f.text,{strictUnits:true,exactValues:true});
  if(mismatch){failures.add(mismatch);continue;}
  // Dates are identifiers, not free numerical values. A different reference
  // period must never pass just because the same amount appears in the source.
  const dates=factualLanguage(claim).match(/20\d{2}(?:[-/]\d{1,2}(?:[-/]\d{1,2})?|년(?:\s*\d{1,2}월(?:\s*\d{1,2}일)?)?)/g)||[];
  if(dates.some(d=>!factualLanguage(f.text+' '+f.observedAt).includes(d))){failures.add('factual-reference-period-mismatch');continue;}
  for(const sentence of normalize(f.text).split(/(?<=[.!?])\s+(?=[^\d])/)){
   let attributed=claim;
   const attribution=/^(.{2,40}?)(?:에 따르면|에 의하면)[,]?\s+/.exec(attributed);
   if(attribution&&factualLanguage(f.text+' '+f.sourceTitle).replace(/\s/g,'').includes(factualLanguage(attribution[1]).replace(/\s/g,'')))attributed=attributed.slice(attribution[0].length);
   const aligned=tokens(attributed),source=tokens(sentence);
   if(!source.some((_,start)=>aligned.every((word,i)=>source[start+i]===word)))continue;
   if((f.measure?.valueKind==='forecast'||forecast.test(sentence))&&!forecast.test(claim)){failures.add('forecast-presented-as-actual');continue;}
   if(modal.test(sentence)&&!modal.test(claim)){failures.add('source-uncertainty-lost');continue;}
   if(negative.test(sentence)&&!negative.test(claim)){failures.add('source-negation-lost');continue;}
   if(limited.test(sentence)&&!limited.test(claim)){failures.add('source-qualification-lost');continue;}
   if(conditional.test(sentence)&&!conditional.test(claim)){failures.add('source-condition-lost');continue;}
   return {issues:[],evidenceIds:[f.id]};
  }
 }
 return {issues:[...failures,'unverified-factual-prose'],evidenceIds:[]};
}
