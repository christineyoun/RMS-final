/** A simpler provider wire format, compiled into the EXISTING claim validator.
 * Factual prose, conditional interpretations and actions have distinct checks. */
import {validAnalysisFact,type AnalysisEvidence,type AnalysisFact} from './analysisEvidence.ts';
import {factClaimContext,type ClaimSupport} from './analysisClaimSupport.ts';
import {validateReportedFact} from './analysisReportedFact.ts';
import {validateConditionalReasoning} from './analysisReasoning.ts';
export const ANALYSIS_SECTIONS_FORMAT='evidence-sections-v1';
const fields=['marketAnalysis','priceOutlook','bullishFactors','bearishFactors','procurementStrategy','monitoringItems'];
/** Resolve the least sufficient verified support using the existing reasoning
 * checks. No model-supplied kind, per-sentence ID map or capability label. */
function bindText(text:string,available:AnalysisFact[],kind:'conditional'|'recommendation'){
 const factual=validateReportedFact(text,available);
 if(!factual.issues.length)return {kind:'reported-fact',text,evidenceIds:factual.evidenceIds,support:[]};
 if(kind==='conditional')for(const f of available)if(f.comparison&&f.interpretations?.includes(text))return {kind:'interpretation',text,evidenceIds:[f.id],support:[]};
 let checks=0;const reasons=new Set<string>(factual.issues);
 for(let size=1;size<=available.length;size++){
  const search=(start:number,refs:AnalysisFact[]):any=>{
   if(refs.length<size){for(let i=start;i<available.length;i++){const found=search(i+1,[...refs,available[i]]);if(found)return found;}return;}
   const choices=refs.map(f=>factClaimContext(f).aspects);if(choices.some(c=>!c.length))return;
   const choose=(i:number,support:ClaimSupport[]):any=>{
    if(checks>=256)return;
    if(i<refs.length){for(const aspect of choices[i]){const found=choose(i+1,[...support,{evidenceId:refs[i].id,aspect}]);if(found)return found;}return;}
    checks++;const verdict=validateConditionalReasoning(text,refs,{kind,support});
    if(!verdict.issues.length)return {kind,text,evidenceIds:refs.map(f=>f.id),support};
    verdict.issues.forEach(issue=>reasons.add(issue));
   };
   return choose(0,[]);
  };
  const found=search(0,[]);if(found)return found;if(checks>=256)break;
 }
 if(!checks)reasons.add('no-eligible-reasoning-aspect');
 throw Error('unsupported-section-analysis:'+Array.from(reasons).sort().join(','));
}
export function compileAnalysisSection(value:any,evidence:AnalysisEvidence,now:Date,kind:'conditional'|'recommendation',core=false){
  if(evidence.facts.some(f=>!validAnalysisFact(f,evidence.commodity,now)))throw Error('invalid-section-evidence');
  const known=new Map(evidence.facts.map(f=>[f.id,f]));
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['text','evidenceIds'].includes(k))||!Array.isArray(value.evidenceIds)||!value.evidenceIds.length||value.evidenceIds.length>8||new Set(value.evidenceIds).size!==value.evidenceIds.length||value.evidenceIds.some((id:any)=>typeof id!=='string'||!known.has(id))||typeof value.text!=='string')throw Error('invalid-section-evidence-reference');
  const refs:AnalysisFact[]=value.evidenceIds.map((id:string)=>known.get(id)!);
  if(core)refs.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  const facts=refs.map(f=>({kind:'fact',text:'',evidenceIds:[f.id],support:[]}));
  if(!value.text.trim()){if(core)return facts;throw Error('missing-section-analysis');}
  const sentences=value.text.trim().split(/(?<=[.!?])\s+(?=[가-힣])/);
  return [...facts,...sentences.flatMap((text:string,index:number)=>{try{return [bindText(text,refs,kind)];}catch(error){throw Error('sentence-'+index+':'+(error as Error).message);}})];
}
export function compileAnalysisSections(data:any,evidence:AnalysisEvidence|undefined,now:Date){
 if(!evidence||evidence.facts.some(f=>!validAnalysisFact(f,evidence.commodity,now)))throw Error('invalid-section-evidence');
 const known=new Map(evidence.facts.map(f=>[f.id,f]));
 if(known.size!==evidence.facts.length||Object.keys(data).some(k=>!['outputFormat','confidenceScore',...fields].includes(k)))throw Error('invalid-section-envelope');
 const omitted:Array<{section:string;reason:string}>=[];
 const coverage:Record<string,boolean|number>={marketAnalysis:true,procurementStrategy:true,priceOutlook:false,bullishFactors:0,bearishFactors:0,monitoringItems:0};
 const section=(value:any,kind:'conditional'|'recommendation',core=false)=>compileAnalysisSection(value,evidence,now,kind,core);
 const checked=(name:string,kind:'conditional'|'recommendation',core=false)=>{try{return section(data[name],kind,core);}catch(error){throw Error(name+':'+(error as Error).message);}};
 const claims:any[]=[{field:'executiveSummary',segments:checked('marketAnalysis','conditional',true)},{field:'deskRecommendation',segments:checked('procurementStrategy','recommendation')}];
 const used=new Set(claims.flatMap(c=>c.segments.filter((s:any)=>s.kind!=='fact').map((s:any)=>s.text)));
 const unique=(parts:any[])=>{const texts=parts.filter(s=>s.kind!=='fact').map(s=>s.text);if(new Set(texts).size!==texts.length||texts.some(t=>used.has(t)))throw Error('repeated-optional-analysis');for(const t of texts)used.add(t);};
 // Do not turn missing optional evidence into an affirmative neutral conclusion.
 if(data.priceOutlook!==undefined)try{
  const parts=section(data.priceOutlook,'conditional'),summary=claims[0].segments;unique(parts);
  for(const part of parts)if(part.kind!=='fact'||!summary.some((s:any)=>s.kind==='fact'&&s.evidenceIds[0]===part.evidenceIds[0]))summary.push(part);
  coverage.priceOutlook=true;
 }catch(error){omitted.push({section:'priceOutlook',reason:(error as Error).message});}
 for(const [input,output,kind]of [['bullishFactors','bullishFactors','conditional'],['bearishFactors','bearishFactors','conditional'],['monitoringItems','watchItems','recommendation']] as const){
  const list=data[input];if(list===undefined)continue;
  if(!Array.isArray(list)||list.length>3){omitted.push({section:input,reason:'invalid-optional-section'});continue;}
  let index=0;for(const item of list)try{const parts=section(item,kind);unique(parts);claims.push({field:output+'.'+index,segments:parts});index++;}catch(error){omitted.push({section:input+'.'+list.indexOf(item),reason:(error as Error).message});}
  coverage[input]=index;
 }
 return {data:{outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:data.confidenceScore,evidenceClaims:claims},omitted,coverage};
}
