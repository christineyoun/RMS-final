/** Local-only scheduled paid STEP1-7 -> 7-1 -> 7-2 adapter.
 * Reuses the original research-verified-runner and its max 6 paid STEP calls,
 * plus at most one evidence review. No cloud capability, no publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {COMMODITIES,researchDir,inspect} from '../soybean-rebuild/research-pipeline-runner.mjs';
import {validatedLocalCard,validatedLocalRiskCard} from '../soybean-rebuild/step7-local-card-status.mjs';

const args=process.argv.slice(2),idx=args.indexOf('--commodity');
const commodity=idx===0?args[1]:undefined;
const cloud=args[2]==='--paid-cloud';
if(args.length!==3||!['--paid-local','--paid-cloud'].includes(args[2])||!COMMODITIES.includes(commodity))throw Error('Only --commodity <known> --paid-local/--paid-cloud accepted');
if(cloud){
 if(!process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.RMS_CLOUD_FREE_JOB!=='1'||process.env.RMS_STEP7_CLOUD_EXECUTION!=='YES'||process.env.RMS_STEP7_SCHEDULE_MODE!=='paid-cloud'||process.env.RMS_STEP7_CLOUD_APPROVED!=='YES')throw Error('Explicit private-job Cloud STEP approval required');
}else if(process.env.NODE_ENV==='production'||process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.RMS_STEP7_SCHEDULE_MODE!=='paid-local'||process.env.RMS_STEP7_PAID_APPROVED!=='YES')throw Error('Explicit local paid authorization required');
const day=process.env.RMS_RESEARCH_RUN_DAY;
if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('Valid daily execution date is required');
const root=process.cwd(),dir=researchDir(root,commodity);
const runner=fileURLToPath(new URL('../soybean-rebuild/research-verified-runner.mjs',import.meta.url));
const before=inspect(root,commodity);
const paidAttemptCount=()=>fs.existsSync(path.join(root,'.rms-research-runner',commodity,'daily',day))?
  fs.readdirSync(path.join(root,'.rms-research-runner',commodity,'daily',day)).filter(n=>/^paid-(?:step1|step4|step5search|step5decision|step6search|step7)\.json$/.test(n)).length:0;
const reviewAttempts=()=>fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^step7-fact-attempt-[a-f0-9]{20}(?:-retry-v1)?\.json$/.test(n)).length:0;
const attempts=()=>paidAttemptCount()+reviewAttempts();
const report=(action,stage,failureCode)=>{
 const summary={commodity,action,stage:stage||undefined,paidCalls:attempts()};
 if(failureCode)summary.failureCode=failureCode;
 console.log('RMS_SCHEDULED_STEP7_JSON='+JSON.stringify(summary));
};
// A previously accepted review-incomplete card is also a valid *local* best-effort result,
// provided its critical audits passed and its exact report+receipt hashes match.
if(await validatedLocalRiskCard(dir,commodity)){
 report('done','existing-verified-step7-risk-card');process.exit(0);
}
// A legacy market report cannot be called a complete STEP7 SCM result.
// Do not make a second paid call against an already completed synthesis here.
if(validatedLocalCard(dir,commodity)){
 report('stop','existing-reviewed-card-missing-ai-risk','risk-field-missing');process.exit(0);
}
// A missing API key must NOT reserve a paid-attempt marker and block retries.
if(!process.env.GEMINI_API_KEY){
  try{const dotenv=await import('dotenv');dotenv.config({path:path.join(root,'.env')});}catch{}
}
if(!process.env.GEMINI_API_KEY?.trim())throw Error('GEMINI_API_KEY missing (no paid attempt made)');
// Original per-stage token caps, paid-attempt markers and no-auto-retry logic apply.
const child=spawn(process.execPath,[runner,'--commodity',commodity,'--run-paid','--approve-paid','--max-paid','6','--allow-review-paid'],
 {cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});

// Retain only bounded process output in RAM for classification. Never print or save
// raw Gemini responses, prompts, URLs or API exception messages to diagnostics.
const tail=(old,chunk)=>(old+chunk.toString('utf8')).slice(-32768);
let childOut='',childErr='',spawnError=false;
child.stdout.on('data',chunk=>{childOut=tail(childOut,chunk);});
child.stderr.on('data',chunk=>{childErr=tail(childErr,chunk);});
const code=await new Promise(resolve=>{
 child.on('error',()=>{spawnError=true;resolve(1);});
 child.on('close',n=>resolve(n??1));
});
if(await validatedLocalRiskCard(dir,commodity)){
 report('done','local-reviewed-step7-risk-card');process.exit(0);
}
if(validatedLocalCard(dir,commodity)){
 report('stop','new-reviewed-card-missing-ai-risk','risk-field-missing');process.exit(0);
}
let stage='unverified-or-incomplete';
try {
  const current=inspect(root,commodity);
  if(typeof current.stage==='string'&&current.stage!=='stop')stage=current.stage;
  else {
    // When inspect() stops on a saved invalid artifact, `action` is merely
    // `stop`. Report the LAST RECORDED checkpoint instead of pretending it is
    // the failed request. The artifact's status remains the authority.
    const allowed=new Set(['step1','step2','step3','step4','step5search','step5graded',
      'step5decision','step6search','step6graded','step7']);
    const progress=Array.isArray(current.progress)?current.progress:[];
    const last=progress.map(x=>typeof x==='string'?x.split(':',1)[0]:'').filter(x=>allowed.has(x)).at(-1);
    if(last)stage='last-recorded:'+last;
  }
}catch{}
// Allowlisted error categories only; no user or provider text leaks to logs.
const outcome=childOut+'\n'+childErr;
let failureCode='unclassified-incomplete';
if(spawnError)failureCode='runner-spawn-failed';
else if(/Previous paid attempt recorded|previous paid attempt|paid attempt already/i.test(outcome))failureCode='prior-paid-attempt-reserved';
else if(/429|RESOURCE_EXHAUSTED|quota exceeded|rate.limit/i.test(outcome))failureCode='provider-rate-limited';
else if(/401|403|PERMISSION_DENIED|invalid api.key|API_KEY_INVALID/i.test(outcome))failureCode='provider-auth-rejected';
else if(/503|502|UNAVAILABLE|overloaded|internal server error/i.test(outcome))failureCode='provider-temporarily-unavailable';
else if(/ETIMEDOUT|ECONNRESET|network error|timed out/i.test(outcome))failureCode='provider-network-or-timeout';
else if(/MAX_TOKENS|invalid-or-incomplete-json|model-json-invalid/i.test(outcome))failureCode='response-truncated-or-invalid';
else if(/No actual Google grounding citations|no-google-citations|no grounded sources/i.test(outcome))failureCode='missing-google-grounding';
else if(/Google search call failed|generateContent.*failed/i.test(outcome))failureCode='provider-call-failed';
else if(/exited 0 but did not create|snapshot.*missing/i.test(outcome))failureCode='snapshot-not-created';
else if(code!==0)failureCode='runner-exited-nonzero';
// This metadata never authorizes a retry or erases the paid-attempt reservation.
try{
 const diagnosticDir=path.join(root,'.rms-research-runner',commodity,'daily',day);
 fs.mkdirSync(diagnosticDir,{recursive:true});
 const item={version:1,recordedAt:new Date().toISOString(),commodity,day,
   status:'incomplete',stage,runnerExitCode:code,failureCode,paidAttemptMarkers:attempts(),
   safeForAutomaticRetry:false,originalResultRetained:true,
   message:'Check stage snapshots and paid-attempt reservation before any manual retry. Raw provider errors were not stored.'};
 fs.writeFileSync(path.join(diagnosticDir,'scheduled-worker-diagnostic.json'),JSON.stringify(item,null,2),{mode:0o600});
}catch{console.error('[STEP7 DIAGNOSTIC] unable-to-save-safe-status');}
console.log('[STEP7 DIAGNOSTIC]',commodity,stage,failureCode,'exitCode='+code);
report('stop',stage,failureCode);
// A nonzero result means no verified card; this is not a retry authorization.
if(code!==0)console.log('[STEP7 PAID LOCAL] Underlying runner stopped; last accepted preview is retained.');
