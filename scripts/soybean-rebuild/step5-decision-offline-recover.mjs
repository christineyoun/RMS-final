/**
 * Offline, add-only recovery of STEP5 model output with a narrow schema discrepancy.
 * No Gemini, no publisher traffic, no mutation of old evidence, no RMS publication.
 * Defaults to inspect mode. Explicit --apply-reviewed to create new STEP5 decision.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const COMMODITIES = Object.freeze(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
const FILE_RX=/^step5-round1-decision-[\w-]+\.json$/;
const NAME_RX=/^[a-z0-9][\w-]*\.json$/i;
const allowedDecision=['stop','search','uncertain'];
const isString=(x)=>typeof x==='string';
const isObject=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const normal=(s,n)=>s.replace(/\s+/g,' ').trim().slice(0,n);
function safeFile(dir,filename){
  if(!NAME_RX.test(filename))throw Error(`Unsafe filename: ${String(filename)}`);
  const full=path.join(dir,filename);
  if(!fs.existsSync(full)||!fs.statSync(full).isFile())throw Error(`Missing file: ${filename}`);
  if(fs.statSync(full).size>40*1024*1024)throw Error(`Oversized file: ${filename}`);
  return JSON.parse(fs.readFileSync(full,'utf8'));
}
/** Same bounded caution normalization as STEP5 decision parser. */
export function normalizeCaution(value){
  if(isString(value))return value.trim()?value:null;
  if(!isObject(value))return null;
  const fields=Object.entries(value);
  if(!fields.length||fields.length>6)return null;
  const pieces=[];
  for(const [key,raw] of fields){
    if(!key.trim()||key.length>80)return null;
    let text;
    if(isString(raw)&&raw.trim())text=raw.trim();
    else if(Array.isArray(raw)&&raw.length>0&&raw.length<=10&&
      raw.every(s=>isString(s)&&s.trim()))text=raw.join(', ');
    else return null;
    pieces.push(key==='short caveat'?text:`${key}: ${text}`);
  }
  return pieces.join('; ');
}

export function normalizeAndValidate(rawText){
  let body;
  try{body=JSON.parse(rawText.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
  catch(e){return {ok:false,reason:`RAW JSON invalid: ${e.message}`};}
  if(!isObject(body)||!allowedDecision.includes(body.decision)||!isString(body.reason)||
    !Array.isArray(body.covered)||!Array.isArray(body.remainingGaps)||!Array.isArray(body.cautions))
    return {ok:false,reason:'Invalid decision keys, types, or decision value.'};
  if(body.covered.length>5||body.remainingGaps.length>3||body.cautions.length>3)
    return {ok:false,reason:'Exceeds prompt limits for covered, remainingGaps or cautions.'};
  if(body.covered.some(x=>!isObject(x)||!isString(x.topic)||!isString(x.assessment)||
      !Array.isArray(x.sourceIds)||x.sourceIds.some(y=>!isString(y))))
    return {ok:false,reason:'Covered topics have invalid structure.'};
  if(body.remainingGaps.some(x=>!isObject(x)||!isString(x.topic)||!isString(x.whyImportant)||!isString(x.searchQuestion)))
    return {ok:false,reason:'Remaining gaps have invalid structure.'};
  // Recover presentation-only deviations; keep all textual caution content.
  // Structural decision, covered evidence, source IDs and search questions remain gated.
  let corrected=0;
  const cautions=[];
  for(const item of body.cautions){
    const parsed=normalizeCaution(item);
    if(parsed===null)return {ok:false,reason:'Unexpected cautions shape; no automatic recovery.'};
    cautions.push(parsed);
    if(!isString(item))corrected++;
  }
  if(!corrected)return {ok:false,reason:'No caution-object discrepancy; no automatic recovery.'};
  const decision={decision:body.decision,reason:normal(body.reason,950),
    covered:body.covered.map(x=>({topic:normal(x.topic,140),assessment:normal(x.assessment,420),sourceIds:x.sourceIds.slice(0,10)})),
    remainingGaps:body.remainingGaps.map(x=>({topic:normal(x.topic,120),whyImportant:normal(x.whyImportant,330),searchQuestion:normal(x.searchQuestion,330)})),
    cautions:cautions.map(x=>normal(x,260))};
  if(decision.decision==='search'&&!decision.remainingGaps.some(g=>g.searchQuestion.trim()))
    return {ok:false,reason:'SEARCH has no actionable follow-up question.'};
  return {ok:true,decision,corrected};
}
export function auditReferences(decision,step4,graded){
  const old=step4.analysis.originalInventory;
  const newer=graded.review;
  const all=[...old,...newer];
  const gradeById=new Map(all.map(s=>[s.id,s.grade]));
  if(gradeById.size!==all.length)throw Error('Duplicate source IDs among STEP4 and STEP5 inputs.');
  const referenced=decision.covered.flatMap(c=>c.sourceIds);
  const invalidIds=[...new Set(referenced.filter(id=>!gradeById.has(id)||gradeById.get(id)==='EXCLUDED'))];
  const bOnlyCoverageTopics=decision.covered.filter(c=>c.sourceIds.length&&c.sourceIds.every(id=>gradeById.get(id)==='B')).map(x=>x.topic);
  return {invalidIds,bOnlyCoverageTopics};
}
export function inspectSaved(root,commodity){
  if(!COMMODITIES.includes(commodity))throw Error(`Unknown commodity ${commodity}`);
  const dir=path.join(root,commodity==='soybean'?'.rms-soybean-rebuild':path.join('.rms-research',commodity));
  if(!fs.existsSync(dir))throw Error('Research directory missing.');
  const candidates=fs.readdirSync(dir).filter(s=>FILE_RX.test(s)).sort();
  if(!candidates.length)throw Error('No STEP5 decision output saved.');
  // Only look at most recent record; refuse recovering an earlier one if a later decision exists.
  const filename=candidates.at(-1);
  const saved=safeFile(dir,filename);
  if(saved.stage!=='round1-evidence-sufficiency-decision'||saved.commodity!==commodity)
    throw Error('Saved stage or commodity mismatch.');
  if(saved.status!=='model-json-invalid'||saved.decision!==null)
    throw Error(`Latest decision is not eligible for recovery: ${String(saved.status)}.`);
  if(!isString(saved.rawText)||!saved.rawText.trim())throw Error('No raw Gemini response to inspect.');
  const check=normalizeAndValidate(saved.rawText);
  if(!check.ok)return {dir,filename,saved,check};
  const in4=saved.inputFiles?.step4,ing=saved.inputFiles?.step5Graded;
  if(!in4||!ing)throw Error('Saved decision lacks original input file references.');
  const step4=safeFile(dir,in4),graded=safeFile(dir,ing);
  if(step4.commodity&&step4.commodity!==commodity)throw Error('STEP4 commodity mismatch.');
  if(graded.commodity!==commodity||graded.stage!=='additional-google-original-verification-round1'||graded.round!==1)
    throw Error('Graded source commodity/stage mismatch.');
  if(!Array.isArray(step4.analysis?.originalInventory)||!Array.isArray(step4.analysis?.candidateAssessments)||!Array.isArray(graded.review))
    throw Error('Incomplete evidence inventory.');
  const audit=auditReferences(check.decision,step4,graded);
  if(audit.invalidIds.length)check.ok=false,check.reason=`Unknown or excluded source IDs: ${audit.invalidIds.join(', ')}`;
  return {dir,filename,saved,check,audit};
}
function writeReview(item,model){
  const out=['# STEP5 결정: 저장된 Gemini 응답 오프라인 형식 복구','',
    `- 원본: ${item.filename} (원본 보존)`,`- 품목: ${item.saved.commodity}`,
    `- 모델: ${model}`,`- 복구 범위: cautions의 비표준 텍스트 객체 ${item.check.corrected}개를 문자열로 변환`,
    '- 외부 검색/Gemini API 재호출 없음. 기존 STEP1~5 자료 및 RMS 게시물 변경 없음.',
    '- 주의: 포맷 검증은 시장 사실이나 수치의 진위를 검증한 것이 아닙니다.',
    '',`## 모델 판단: ${item.check.decision.decision}`,'',item.check.decision.reason,'',
    '## 확보된 영역', ...item.check.decision.covered.map(x=>`- ${x.topic}: ${x.assessment} [${x.sourceIds.join(', ')}]`),
    '','## 남은 공백',...item.check.decision.remainingGaps.map(x=>`- ${x.topic}: ${x.whyImportant} / 질문: ${x.searchQuestion}`),
    '','## 유의점',...item.check.decision.cautions.map(x=>`- ${x}`),
    '','## 출처 감사',`- 무효/제외 ID: ${item.audit.invalidIds.join(', ')||'없음'}`,
    `- B출처 단독 영역: ${item.audit.bOnlyCoverageTopics.join(', ')||'없음'}`,''];
  return out.join('\n');
}
export function applyReviewed(item){
  if(!item.check.ok)throw Error('Recovery not eligible.');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const base=`step5-round1-decision-${stamp}`;
  const outJson=path.join(item.dir,base+'.json');
  const outMd=path.join(item.dir,base+'.md');
  const data={...item.saved,recordedAt:new Date().toISOString(),status:'decision-recorded',
    decision:item.check.decision,referenceAudit:item.audit,
    formatRecovery:{sourceFile:item.filename,kind:'cautions.text-object-to-string',
      normalizedCount:item.check.corrected,approvedForResume:true,
      note:'Schema+reference audit only, not factual verification; original rawText preserved.'}};
  // Save the human-review document FIRST; save JSON LAST because the pipeline uses JSON as checkpoint.
  fs.writeFileSync(outMd,writeReview(item,item.saved.model),{encoding:'utf8',flag:'wx',mode:0o600});
  fs.writeFileSync(outJson,JSON.stringify(data,null,2),{encoding:'utf8',flag:'wx',mode:0o600});
  return {outJson,outMd};
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  try{
    const args=process.argv.slice(2);
    let commodity=null,apply=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--commodity')commodity=args[++i];
      else if(args[i]==='--inspect')apply=false;
      else if(args[i]==='--apply-reviewed')apply=true;
      else throw Error(`Unexpected argument ${args[i]}`);
    }
    if(!commodity)throw Error('Use --commodity potato-starch --inspect');
    const item=inspectSaved(process.cwd(),commodity);
    console.log('[STEP5 OFFLINE RECOVERY] NO API, NO network, NO existing file edits, NO publication.');
    console.log('[STEP5 OFFLINE RECOVERY] Original:',item.filename);
    console.log('[STEP5 OFFLINE RECOVERY] Saved status:',item.saved.status);
    if(!item.check.ok){
      console.log('[STEP5 OFFLINE RECOVERY] NOT RECOVERABLE:',item.check.reason);
      // Output only JSON field names and value types. Never print full model output.
      try{
        const parsed=JSON.parse(item.saved.rawText.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
        const shape=Array.isArray(parsed.cautions)?parsed.cautions.map(x=>
          isObject(x)?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Array.isArray(v)?'array':typeof v])):
          (Array.isArray(x)?'array':typeof x)):'not-array';
        console.log('[STEP5 OFFLINE RECOVERY] Cautions field types:',JSON.stringify(shape));
      }catch{}
      process.exitCode=2;
    }
    else{
      const d=item.check.decision;
      console.log('[STEP5 OFFLINE RECOVERY] Parsed Gemini raw JSON: valid.');
      console.log('[STEP5 OFFLINE RECOVERY] Cautions object correction:',item.check.corrected);
      console.log('[STEP5 OFFLINE RECOVERY] Decision:',d.decision,'| covered:',d.covered.length,'| remaining gaps:',d.remainingGaps.length);
      console.log('[STEP5 OFFLINE RECOVERY] Model reason:',d.reason);
      for(const gap of d.remainingGaps)console.log('[STEP5 OFFLINE RECOVERY] Remaining gap:',gap.topic,'|',gap.searchQuestion);
      console.log('[STEP5 OFFLINE RECOVERY] Reference audit:',JSON.stringify(item.audit));
      if(!apply)console.log('[STEP5 OFFLINE RECOVERY] INSPECT ONLY. No files written. Review decision and then explicitly use --apply-reviewed if acceptable.');
      else{
        const r=applyReviewed(item);
        console.log('[STEP5 OFFLINE RECOVERY] New decision JSON:',r.outJson);
        console.log('[STEP5 OFFLINE RECOVERY] New review MD:',r.outMd);
        console.log('[STEP5 OFFLINE RECOVERY] Original failed file preserved. Next use runner --preview, not --run-paid.');
      }
    }
  }catch(e){console.error('[STEP5 OFFLINE RECOVERY] REFUSED:',e.message);process.exitCode=2;}
}
