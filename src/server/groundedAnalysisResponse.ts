import {validateReportedFact} from './analysisReportedFact.ts';
import {materializeClaimText} from './analysisClaimText.ts';
import {canonicalAnalysisQualityIssues} from './analysisPublicationQuality.ts';
/** Pure response handling: never synthesizes prose, numbers or source URLs. */
import type { GroundedAiAnalysis, GroundedAiSource } from './liveAiAnalysisService.ts';
import {validAnalysisFact,type AnalysisEvidence} from './analysisEvidence.ts';
import {validateConditionalReasoning} from './analysisReasoning.ts';

export class AnalysisValidationError extends Error {
  constructor(public stage: 'response'|'parsing'|'schema'|'grounding'|'sources'|'persistence', public issues: string[]) {
    super(`RMS AI ${stage}: ${issues.join('; ')}`);
  }
}
export function analysisResponseText(response: any): string {
  // SDK .text is a getter; stored/mocked REST responses carry candidate parts instead.
  const candidate=response?.candidates?.[0];
  const parts=candidate?.content?.parts;
  const text=Array.isArray(parts)?parts.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join(''):'';
  return text || (typeof response?.text==='string'?response.text:'');
}
export function groundedResponseSources(response:any):GroundedAiSource[] {
  const metadata=response?.candidates?.[0]?.groundingMetadata;
  const map=new Map<string,GroundedAiSource>();
  for(const chunk of Array.isArray(metadata?.groundingChunks)?metadata.groundingChunks:[]) {
    try {
      const u=new URL(chunk?.web?.uri);
      if(u.protocol!=='https:'||u.username||u.password||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/.test(u.hostname)||/\.(local|internal)$/.test(u.hostname))continue;
      if(/^(www\.)?google\.[a-z.]+$/.test(u.hostname)||u.hostname==='news.google.com')continue;
      map.set(u.href,{url:u.href,title:String(chunk.web.title||u.hostname).trim()});
    }catch{/* One malformed URL must not discard other valid grounding chunks. */}
  }
  return [...map.values()];
}
function fields(data:any):Array<[string,string]> {
  return [['deskRecommendation',data.deskRecommendation],['executiveSummary',data.executiveSummary],
    ...['bullishFactors','bearishFactors','watchItems'].flatMap(field=>data[field].map((text:string,i:number)=>[`${field}.${i}`,text]))] as Array<[string,string]>;
}
/** Chunks alone are URLs, not citations. Require real spans into the returned text. */
function supportedSearchSources(response:any,data:any):GroundedAiSource[] {
  const metadata=response?.candidates?.[0]?.groundingMetadata;
  const raw=analysisResponseText(response),bytes=Buffer.from(raw,'utf8'),used=new Set<string>();
  const parts=response?.candidates?.[0]?.content?.parts;
  const spans=(Array.isArray(metadata?.groundingSupports)?metadata.groundingSupports:[]).flatMap((s:any)=>{
    if(!s||!Array.isArray(s.groundingChunkIndices))return [];
    let start=s.segment?.startIndex??0,end=s.segment?.endIndex;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start)return [];
    if(Array.isArray(parts)){
      const partIndex=s.segment?.partIndex??0,part=parts[partIndex];
      if(!part||part.thought||typeof part.text!=='string'||end>Buffer.byteLength(part.text,'utf8'))return [];
      const offset=parts.slice(0,partIndex).filter((p:any)=>!p.thought&&typeof p.text==='string').reduce((n:number,p:any)=>n+Buffer.byteLength(p.text,'utf8'),0);
      start+=offset;end+=offset;
    }
    if(end>bytes.length)return [];
    const segment=bytes.subarray(start,end).toString('utf8');
    if(Buffer.byteLength(segment,'utf8')!==end-start)return [];
    if(s.segment.text&&s.segment.text!==segment)return [];
    const sources=(s.groundingChunkIndices||[]).flatMap((i:any)=>Number.isInteger(i)&&i>=0?
      groundedResponseSources({candidates:[{groundingMetadata:{groundingChunks:[metadata.groundingChunks?.[i]]}}]}):[]);
    if(!sources.length)return [];
    return [{start,end,sources}];
  });
  const tokens=[...raw.matchAll(/"(?:\\.|[^"\\])*"/gs)];
  for(const [,text] of fields(data)){
    const matches=tokens.filter(token=>{try{return JSON.parse(token[0])===text;}catch{return false;}});
    const covered=matches.some(token=>{
      const start=Buffer.byteLength(raw.slice(0,token.index),'utf8')+1;
      const end=start+Buffer.byteLength(token[0].slice(1,-1),'utf8');
      let cursor=start;const urls=new Set<string>();
      for(const span of [...spans].sort((a:any,b:any)=>a.start-b.start))if(span.start<=cursor&&span.end>cursor){
        cursor=span.end;for(const source of span.sources)urls.add(source.url);
      }
      if(cursor<end)return false;
      for(const url of urls)used.add(url);return true;
    });
    if(!covered)return [];
  }
  return groundedResponseSources(response).filter(s=>used.has(s.url));
}
function suppliedEvidenceSources(data:any,evidence:AnalysisEvidence|undefined,now:Date):{sources:GroundedAiSource[];audit:any} {
  if(!evidence||evidence.facts.length<2)throw new AnalysisValidationError('grounding',['no-sufficient-verified-RMS-evidence']);
  const facts=new Map(evidence.facts.filter(f=>validAnalysisFact(f,evidence.commodity,now)).map(f=>[f.id,f]));
  if(facts.size!==evidence.facts.length||facts.size<2)throw new AnalysisValidationError('sources',['failed-source-verification']);
  if(!Array.isArray(data.evidenceClaims))throw new AnalysisValidationError('grounding',['missing-evidence-claim-map']);
  const used=new Set<string>(),issues:string[]=[],conditionalTexts=new Set<string>();
  const structured=data.evidenceContractVersion===4;
  if(data.evidenceContractVersion!==undefined&&!structured)issues.push('unsupported-evidence-contract-version');
  const expected=fields(data);
  if(data.evidenceClaims.length!==expected.length)issues.push('claim-map-field-count');
  for(const [field,value] of expected){
    const maps=data.evidenceClaims.filter((c:any)=>c?.field===field);
    if(maps.length!==1||!Array.isArray(maps[0].segments)||!maps[0].segments.length){issues.push('missing-claim-coverage:'+field);continue;}
    const segments=maps[0].segments;
    if(segments.map((s:any)=>s?.text).join(' ')!==value)issues.push('unmapped-material-assertion:'+field);
    let factual=false,actionable=false;
    for(const segment of segments){
      if(!segment||typeof segment.text!=='string'){issues.push('invalid-segment:'+field);continue;}
      const refs=Array.isArray(segment.evidenceIds)?segment.evidenceIds.map((id:string)=>facts.get(id)):[];
      if(!refs.length||refs.some((f:any)=>!f)){issues.push('unknown-or-fabricated-citation:'+field);continue;}
      if(new Set(segment.evidenceIds).size!==refs.length)issues.push('duplicate-evidence-reference:'+field);
      for(const f of refs)used.add(f!.id);
      if(segment.kind==='fact'){
        // Exact complete atomic statements bind metric, benchmark, date, geography,
        // unit and value together. Matching a number somewhere on a page is unsafe.
        if(refs.length!==1||segment.text!==refs[0]!.text)issues.push('unsupported-factual-claim:'+field);
        factual=true;
      }else if(segment.kind==='reported-fact'){
        const verdict=validateReportedFact(segment.text,refs as any);
        if(verdict.issues.length)issues.push(...verdict.issues.map(reason=>'unsupported-reported-fact:'+reason+':'+field));
        factual=true;
      }else if(segment.kind==='interpretation'){
        if(refs.length!==1||!refs[0]!.comparison||!refs[0]!.interpretations?.includes(segment.text))issues.push('unsupported-interpretation:'+field);
      }else if(segment.kind==='conditional'||segment.kind==='recommendation'){
        const text=String(segment.text||'');
        if(structured&&(!Array.isArray(segment.support)||!segment.support.length))issues.push('missing-structured-claim-support:'+field);
        const verdict=validateConditionalReasoning(text,refs as any,{kind:segment.kind,support:segment.support});
        if(verdict.issues.length){issues.push('unsupported-or-nonconditional-reasoning:'+field);issues.push(...verdict.issues.map(reason=>reason+':'+field));}
        if(conditionalTexts.has(text))issues.push('generic-repeated-recommendation:'+field);
        conditionalTexts.add(text);if(!verdict.issues.length&&verdict.classification!=='conditional-scenario')actionable=true;
      }else issues.push('unknown-claim-kind:'+field);
    }
    if(!factual)issues.push('missing-specific-factual-premise:'+field);
    // Ordinary fields may be verified factual summaries without speculation.
    // Only the Desk field requires a supported action; supplier quotes are optional.
    if(field==='deskRecommendation'&&!actionable)issues.push('unsupported-procurement-recommendation');
  }
  if(used.size<2)issues.push('insufficient-distinct-factual-premises');
  if(issues.length)throw new AnalysisValidationError('sources',issues);
  const selected=[...used].map(id=>facts.get(id)!);
  return {sources:[...new Map(selected.map(f=>[f.sourceUrl,{url:f.sourceUrl,title:f.sourceTitle}])).values()],
    audit:{path:'verified-rms-evidence',version:4,contractVersion:structured?4:'legacy',...(data.factBinding?{factBinding:data.factBinding}:{}),claims:data.evidenceClaims,facts:selected}};
}
export function parseGroundedAnalysis(response:any,model:string,now=new Date(),evidence?:AnalysisEvidence,options:{requiredContractVersion?:4;requiredFactBinding?:boolean}={}):GroundedAiAnalysis {
  const candidate=response?.candidates?.[0];
  if(response?.promptFeedback?.blockReason)throw new AnalysisValidationError('response',['prompt-blocked:'+response.promptFeedback.blockReason]);
  if(!candidate)throw new AnalysisValidationError('response',['no-candidate']);
  if(candidate.finishReason&&candidate.finishReason!=='STOP')throw new AnalysisValidationError('response',['finish-reason:'+candidate.finishReason]);
  const text=analysisResponseText(response).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  if(!text)throw new AnalysisValidationError('response',['empty-text']);
  let data:any;
  try{data=JSON.parse(text);}catch{throw new AnalysisValidationError('parsing',['invalid-json']);}
  const sectionResponse=data?.outputFormat==='evidence-sections-v1';
  try{data=materializeClaimText(data,evidence,now);}catch(error){throw new AnalysisValidationError('schema',[(error as Error).message]);}
  const issues:string[]=[];
  if(!data||typeof data!=='object'||Array.isArray(data))throw new AnalysisValidationError('schema',['expected-object']);
  if(options.requiredContractVersion&&data.evidenceContractVersion!==options.requiredContractVersion)issues.push('required-evidence-contract-version:4');
  if(options.requiredFactBinding&&data.factBinding!=='verified-records-v1')issues.push('required-verified-fact-binding');
  if(typeof data.confidenceScore!=='number'||!Number.isFinite(data.confidenceScore)||data.confidenceScore<0||data.confidenceScore>100)issues.push('confidenceScore: expected number 0–100');
  for(const [field,min] of [['deskRecommendation',4],['executiveSummary',sectionResponse?1:140]] as const)
    if(typeof data[field]!=='string'||data[field].trim().length<min)issues.push(`${field}: expected string length >= ${min}; received ${typeof data[field]==='string'?data[field].trim().length:typeof data[field]}`);
  for(const field of ['bullishFactors','bearishFactors','watchItems']) {
    if(!Array.isArray(data[field])||data[field].length<(data.factBinding==='verified-records-v1'?0:2)||data[field].length>3||data[field].some((x:any)=>typeof x!=='string'||x.trim().length<4))issues.push(field+': expected supported nonempty strings, up to 3 (legacy reports need at least 2)');
  }
  if(issues.length)throw new AnalysisValidationError('schema',issues);
  const qualityIssues=canonicalAnalysisQualityIssues(data);
  if(qualityIssues.length)throw new AnalysisValidationError('schema',qualityIssues);
  let sources=supportedSearchSources(response,data);
  let evidenceAudit:any={path:'google-search',version:2,groundingMetadata:candidate.groundingMetadata};
  if(!sources.length){
    try{const checked=suppliedEvidenceSources(data,evidence,now);sources=checked.sources;evidenceAudit=checked.audit;}
    catch(error){
      if(error instanceof AnalysisValidationError)throw new AnalysisValidationError(error.stage,[...error.issues,
        'search-query-count:'+(candidate.groundingMetadata?.webSearchQueries?.length||0)]);
      throw error;
    }
  }
  if(sectionResponse)evidenceAudit={...evidenceAudit,outputFormat:data.sectionFormat,omittedSections:data.omittedSections,sectionCoverage:data.sectionCoverage};
  // Model-invented source lists never become trusted source links.
  if(data.sources!==undefined&&(!Array.isArray(data.sources)||data.sources.some((s:any)=>!sources.some(v=>v.url===(typeof s==='string'?s:s?.url)))))
    throw new AnalysisValidationError('sources',['fabricated-or-unverified-source-url']);
  return {confidenceScore:Math.round(data.confidenceScore),deskRecommendation:data.deskRecommendation.trim(),executiveSummary:data.executiveSummary.trim(),
    bullishFactors:data.bullishFactors.map((s:string)=>s.trim()),bearishFactors:data.bearishFactors.map((s:string)=>s.trim()),watchItems:data.watchItems.map((s:string)=>s.trim()),
    sources,model,generatedAt:now.toISOString(),status:'live',evidenceAudit};
}
