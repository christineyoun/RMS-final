/** One optionally billable Gemini decision request. GOOGLE SEARCH DISABLED. Never auto-search. */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI} from '@google/genai';
import {loadDecisionContext} from './step5-decision-local.ts';
import {parseDecisionResponse,auditDecisionReferences,renderDecisionReport,STEP5_DECISION_RESPONSE_JSON_SCHEMA} from './step5-decision-core.ts';

const c=loadDecisionContext(); // fail before API usage
const priorRuns=fs.readdirSync(c.dir).filter(f=>/^step5-round1-decision-.*\.json$/.test(f));
if(priorRuns.length&&!process.argv.includes('--force-new'))throw Error('STEP5 decision already requested. Existing output preserved; inspect it instead of paying twice.');
dotenv.config();
const key=process.env.GEMINI_API_KEY?.trim();
if(!key)throw Error('Missing GEMINI_API_KEY in .env. Do not paste the key into chat.');
const model=process.env.RMS_SOYBEAN_ANALYSIS_MODEL?.trim()||process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
console.log('[STEP5 DECISION] ONE Gemini analysis call; Google Search DISABLED; never automatically run round 2.');
console.log('[STEP5 DECISION] Input:',c.prior,'+',c.graded);
console.log('[STEP5 DECISION] Model:',model);
console.log('[STEP5 DECISION] Old/new evidence candidates:',c.input.counts.oldExcerpts,c.input.counts.newExcerpts);
const ai=new GoogleGenAI({apiKey:key});
let response:any;
try{
  response=await ai.models.generateContent({model,contents:c.prompt,config:{
    responseMimeType:'application/json',responseJsonSchema:STEP5_DECISION_RESPONSE_JSON_SCHEMA,
    maxOutputTokens:6200,temperature:0.25,
  }});
}catch(e){
  const error=e instanceof Error ? e : new Error(String(e));
  const cause=(error as Error & {cause?:unknown}).cause;

  console.error('[STEP5 DECISION] API error:',error.message);
  console.error('[STEP5 DECISION] Error type:',error.name);
  console.error(
    '[STEP5 DECISION] Underlying cause:',
    cause instanceof Error ? cause.message : String(cause ?? 'unknown')
  );

  if(cause && typeof cause==='object' && 'code' in cause){
    console.error('[STEP5 DECISION] Network error code:',cause.code);
  }

  process.exitCode=2;
}
if(response){
  const rawText=typeof response.text==='string'?response.text:'';
  const decision=parseDecisionResponse(rawText);
  const audit=decision?auditDecisionReferences(decision,c.input):null;
  const status=!decision?'model-json-invalid':
    audit?.invalidIds.length?'decision-references-need-review':
    decision.decision==='search'&&!decision.remainingGaps.length?'search-plan-needs-review':'decision-recorded';
  const usage=response.usageMetadata||null;
  const finish=response.candidates?.[0]?.finishReason;
  const modelFinishReason=typeof finish==='string'&&/^(?:STOP|MAX_TOKENS|SAFETY|RECITATION|OTHER)$/.test(finish)?finish:null;
  const save={stage:'round1-evidence-sufficiency-decision',recordedAt:new Date().toISOString(),
    commodity:c.input.commodity,model,status,
    inputFiles:{step4:c.prior,step5Graded:c.graded},counts:c.input.counts,
    decision,referenceAudit:audit,rawText,usageMetadata:usage,modelFinishReason,
    protected:{oldSourcesPreserved:true,allPreviousExcerptsPreserved:true,allNewExcerptsPreserved:true,
      googleSearchDisabled:true,round2SearchExecuted:false,marketOutlookGenerated:false,
      oldFilesOverwritten:false,rmsAndCloudRunUntouched:true}};
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const jsonFile=path.join(c.dir,`step5-round1-decision-${stamp}.json`);
  const mdFile=path.join(c.dir,`step5-round1-decision-${stamp}.md`);
  fs.writeFileSync(jsonFile,JSON.stringify(save,null,2),{encoding:'utf8',flag:'wx',mode:0o600});
  fs.writeFileSync(mdFile,renderDecisionReport(c.input,model,decision,audit,status,usage||undefined),
    {encoding:'utf8',flag:'wx',mode:0o600});
  console.log('[STEP5 DECISION] Status:',status);
  console.log('[STEP5 DECISION] Finish reason:',modelFinishReason||'not-recorded');
  console.log('[STEP5 DECISION] Recommendation:',decision?.decision||'none — model output invalid');
  console.log('[STEP5 DECISION] Remaining material gaps:',decision?.remainingGaps.length??'unknown');
  console.log('[STEP5 DECISION] Old/new candidates preserved:',c.input.counts.oldExcerpts,c.input.counts.newExcerpts);
  console.log('[STEP5 DECISION] Saved JSON:',jsonFile);
  console.log('[STEP5 DECISION] Saved review:',mdFile);
  console.log('[STEP5 DECISION] NO second-round search; previous files unchanged.');
  if(status!=='decision-recorded')process.exitCode=2;
}
