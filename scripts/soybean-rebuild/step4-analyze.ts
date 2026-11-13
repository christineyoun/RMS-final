/**
 * STEP 4: SINGLE (potentially billable) Gemini call. It reads STEP2/STEP3
 * snapshots and writes *new* files ONLY in .rms-soybean-rebuild.
 * Does NOT use Google Search, other web providers, RMS state or publication.
 * Run: npx.cmd tsx scripts/soybean-rebuild/step4-analyze.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import type {ReviewItem,ReviewSource} from './step3-evidence.ts';
import {buildPrompt,integrate,parseJsonReply,toMarkdown,STEP4_OUTPUT_TOKEN_BUDGET} from './step4-pipeline.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';

dotenv.config();
const commodity=commodityFromArgv();
const apiKey=process.env.GEMINI_API_KEY?.trim();
if(!apiKey)throw Error('GEMINI_API_KEY was not found in local .env (do not paste it into chat).');
const model=process.env.RMS_RESEARCH_ANALYSIS_MODEL?.trim()||process.env.RMS_SOYBEAN_ANALYSIS_MODEL?.trim()||process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
const directory=resultFolder(commodity);
if(!fs.existsSync(directory))throw Error('Expected STEP1-3 result directory: '+directory);
const step3Name=fs.readdirSync(directory).filter(f=>/^step3-evidence-.*\.json$/.test(f)).sort().at(-1);
if(!step3Name)throw Error('STEP3 evidence JSON missing. Run scripts/soybean-rebuild/step3-extract.ts first.');
const step3=JSON.parse(fs.readFileSync(path.join(directory,step3Name),'utf8')) as {
  commodity:string;stage:string;items:ReviewItem[];step2File:string;
};
assertSnapshotCommodity(step3,commodity,'3');
if(step3.stage!=='source-text-evidence-review-only'||!Array.isArray(step3.items))throw Error('Invalid STEP3 JSON.');
const step2Name=path.basename(step3.step2File||'');
if(!/^step2-graded-.*\.json$/.test(step2Name))throw Error('Invalid STEP2 reference from STEP3.');
const step2=JSON.parse(fs.readFileSync(path.join(directory,step2Name),'utf8')) as {
  commodity:string;stage:string;records:ReviewSource[];
};
assertSnapshotCommodity(step2,commodity,'2');
if(step2.stage!=='source-resolution-and-grading'||!Array.isArray(step2.records))throw Error('Invalid STEP2 input.');
const sourceMap:Record<string,string|null>={};
for(const source of step2.records){
  const id=`G${String(source.googleCitation.index).padStart(3,'0')}`;
  if(source.grade==='A')sourceMap[id]=source.extractedText;
}
const candidateCount=step3.items.reduce((n,x)=>n+x.evidence.length,0);
if(!candidateCount)throw Error('STEP3 has no A-grade evidence candidates: not paying Gemini for an empty request. Original STEP3 is intact.');
const dateParts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).formatToParts(new Date());
const dateValue=(type:string)=>dateParts.find(p=>p.type===type)?.value||'';
const koreaDate=`${dateValue('year')}-${dateValue('month')}-${dateValue('day')}`;
const prompt=buildPrompt(step3.items,sourceMap,koreaDate,commodity);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const outJson=path.join(directory,`step4-analysis-${stamp}.json`);
const outMd=path.join(directory,`step4-review-${stamp}.md`);
console.log('[STEP 4] Existing A/B/source records are read-only.');
console.log(`[STEP 4] STEP3: ${step3Name}; evidence candidates: ${candidateCount}; A/B/EXCLUDED: ${step3.items.filter(x=>x.grade==='A').length}/${step3.items.filter(x=>x.grade==='B').length}/${step3.items.filter(x=>x.grade==='EXCLUDED').length}`);
console.log('[STEP 4] Gemini model:',model);
console.log('[STEP 4] ONE Gemini analysis call (potentially paid). Google Search DISABLED.');
let rawText='';let usage:unknown=null;let errorMessage:string|null=null;let modelFinishReason:string|null=null;
try {
  const ai=new GoogleGenAI({apiKey});
  const response=await ai.models.generateContent({
    model,contents:prompt,
    config:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:STEP4_OUTPUT_TOKEN_BUDGET},
  });
  rawText=typeof response.text==='string'?response.text:'';
  usage=response.usageMetadata||null;
  const finish=response.candidates?.[0]?.finishReason;
  modelFinishReason=typeof finish==='string'&&/^(?:STOP|MAX_TOKENS|SAFETY|RECITATION|OTHER)$/.test(finish)?finish:null;
}catch(e){errorMessage=e instanceof Error?e.message:String(e);}
const parsed=errorMessage?null:parseJsonReply(rawText);
const merged=integrate(step3.items,parsed||{candidateReviews:[],findings:[],researchGaps:[],coverage:''},commodity);
const status=errorMessage?'api-call-failed':parsed?'review-generated':'model-json-invalid';
const note=errorMessage?`Gemini 호출 오류: ${errorMessage}`:parsed?'원문 후보는 삭제되지 않습니다. Gemini가 분류하지 않은 후보도 미검토로 보관합니다.':'응답 JSON을 해석하지 못했으므로 모델 분석 없이 모든 원문 후보를 보관했습니다. 원문 응답 텍스트는 JSON에 보관했습니다.';
const result={recordedAt:new Date().toISOString(),commodity,stage:'gemini-evidence-review-only',
  status,model,step3File:step3Name,step2File:step2Name,usageMetadata:usage,modelFinishReason,error:errorMessage,
  rawModelResponse:rawText,analysis:merged,
  constraints:{googleSearch:false,additionalModelCalls:0,originalFilesRewritten:false,rmsModified:false,publication:false,
    warning:'Confirmed means Gemini judged the *provided* original text sufficiently explicit, not independent data cross-validation.'}};
fs.writeFileSync(outJson,JSON.stringify(result,null,2),{mode:0o600});
fs.writeFileSync(outMd,toMarkdown(merged,{model,step3File:step3Name,apiStatus:status,notes:note,commodity}),{mode:0o600});
console.log('[STEP 4] Status:',status);
console.log('[STEP 4] Finish reason:',modelFinishReason||'not-recorded');
console.log('[STEP 4] Preserved original candidates:',merged.audit.candidateCount);
console.log('[STEP 4] Reviewed candidates:',merged.audit.modelReviewedCount);
console.log('[STEP 4] Unreviewed but kept:',merged.audit.autoPreservedUnreviewed);
console.log('[STEP 4] Findings:',merged.findings.length,'| Research gaps:',merged.researchGaps.length);
console.log('[STEP 4] Status counts:',JSON.stringify(merged.audit.statusCounts));
console.log('[STEP 4] Saved JSON:',outJson);
console.log('[STEP 4] Saved report:',outMd);
if(status!=='review-generated'){
  console.error('[STEP 4] Review not completed. All sources preserved. Details in saved files.');
  process.exitCode=2;
}
