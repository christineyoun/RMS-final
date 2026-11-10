/** Explicit, stage-by-stage owner-side recovery of missing STEP7 SCM risks.
 * Imports NO saved market facts. Creates NO fabricated risk assessments.
 * Never touches any commodity with an already accepted risk or cloud state.
 * 'status' is read-only; 'free' may verify publisher pages; each paid mode
 * requires separate explicit consent and allows at most one model call.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TARGETS,parseArgs,ensureCurrentDay,unreviewedAttemptFiles} from './two-risk-policy.mjs';
import {inspect,researchDir,run,runnerDir} from '../soybean-rebuild/research-pipeline-runner.mjs';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';
import {hasAcceptedStep7ProcurementRisk} from '../../src/server/step7CloudCard.ts';
import {validatedLocalRiskCard} from '../soybean-rebuild/step7-local-card-status.mjs';
import {buildFinalData} from '../soybean-rebuild/step7-core.ts';
import {assessStep7AiRisk} from '../soybean-rebuild/step7-ai-risk.ts';

const root=process.cwd();
const required='scripts/soybean-rebuild/research-pipeline-runner.mjs';
if(!fs.existsSync(path.join(root,required)))throw Error('Run from RMS_final_main project root');
const {mode,commodity}=parseArgs(process.argv.slice(2));
const day=ensureCurrentDay(process.env);
process.env.RMS_RESEARCH_RUN_DAY=day;
const tsxCli=path.join(root,'node_modules','tsx','dist','cli.mjs');
const safeNames=dir=>fs.existsSync(dir)?fs.readdirSync(dir):[];
const receiptInfo=async id=>{
  let saved=null;
  const previousPreviewFlag=process.env.RMS_STEP7_LOCAL_PREVIEW;
  try {
    process.env.RMS_STEP7_LOCAL_PREVIEW='1';
    saved=readStep7LocalPreview(id,'127.0.0.1',root);
  } catch {} finally {
    if(previousPreviewFlag===undefined)delete process.env.RMS_STEP7_LOCAL_PREVIEW;
    else process.env.RMS_STEP7_LOCAL_PREVIEW=previousPreviewFlag;
  }
  const accepted=Boolean(saved&&hasAcceptedStep7ProcurementRisk(saved,id));
  const dir=researchDir(root,id),todayAccepted=await validatedLocalRiskCard(dir,id);
  const stage=inspect(root,id);
  const journal=unreviewedAttemptFiles(safeNames(runnerDir(root,id)));
  const reviewAttempts=unreviewedAttemptFiles(safeNames(dir));
  return {id,accepted,todayAccepted,stage,journalCount:journal.length,reviewAttemptCount:reviewAttempts.length};
};
const display=r=>console.log(`[STEP7 RISK RECOVERY] ${r.id} existingRisk=${r.accepted?'ACCEPTED':'MISSING'} todayRisk=${r.todayAccepted?'ACCEPTED':'MISSING'} next=${r.stage.action}:${r.stage.stage||r.stage.reason||r.stage.message||'unknown'} paidMarkers=${r.journalCount+r.reviewAttemptCount}`);
async function ensureApiKeyBeforeReservation(){
  if(!process.env.GEMINI_API_KEY?.trim()){
    const {default:dotenv}=await import('dotenv');
    dotenv.config({path:path.join(root,'.env'),quiet:true});
  }
  if(!process.env.GEMINI_API_KEY?.trim())throw Error('GEMINI_API_KEY is missing; no paid attempt reserved');
}
const execute=(script,...args)=>{
  if(!fs.existsSync(tsxCli))throw Error('tsx CLI missing; project dependencies must be installed');
  const p=spawnSync(process.execPath,[tsxCli,path.join(root,'scripts/soybean-rebuild',script),'--commodity',commodity,...args],
    {cwd:root,env:process.env,stdio:'inherit',shell:false,windowsHide:true});
  if(p.error)throw p.error;
  if(p.status!==0)throw Error(`${script} exited ${p.status}; saved evidence retained, do not bypass attempt locks`);
};
async function maybeMap(){
  const before=await validatedLocalRiskCard(researchDir(root,commodity),commodity);
  if(before){console.log('[STEP7 RISK RECOVERY] Already source-backed and complete; no edits/calls');return true;}
  execute('step7-fact-to-rms.ts','--apply-local');
  const after=await validatedLocalRiskCard(researchDir(root,commodity),commodity);
  console.log('[STEP7 RISK RECOVERY] '+(after?'ACCEPTED source-backed procurement risk':'NOT ACCEPTED — no fabricated risk; older preview preserved'));
  if(!after)process.exitCode=2;
  return after;
}
function latestReport(dir){
  const files=safeNames(dir).filter(n=>/^step7-final-[a-zA-Z0-9.-]+\.json$/.test(n)).sort();
  if(!files.length)throw Error('No current-day STEP7 report; finish the staged research first');
  const name=files.at(-1);
  const bytes=fs.readFileSync(path.join(dir,name));
  const data=JSON.parse(bytes.toString('utf8'));
  if(data.commodity!==commodity||data.stage!=='final-market-outlook-and-procurement'||
     !['report-created','report-review-needed'].includes(data.status)||!data.result)
    throw Error('Current-day STEP7 report is not reviewable');
  return {name,bytes,data,digest:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function verifiedReceiptFor(dir,report){
  return safeNames(dir).filter(n=>/^step7-fact-verified-.*\.json$/.test(n)).sort().reverse().some(n=>{
    try{
      const x=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
      return x.sourceFile===report.name&&x.originalSha256===report.digest&&
        x.status==='verified'&&x.completionPolicy==='best-effort-v2'&&
        Array.isArray(x.criticalAuditReasons)&&x.criticalAuditReasons.length===0;
    }catch{return false;}
  });
}
if(mode==='status'){
 console.log(`[STEP7 RISK RECOVERY] READ ONLY / KST day=${day}; zero paid calls; source-only, no Cloud changes`);
 for(const id of TARGETS)display(await receiptInfo(id));
 process.exit(0);
}
let initial=await receiptInfo(commodity);
display(initial);
if(initial.todayAccepted||initial.accepted){
 console.log('[STEP7 RISK RECOVERY] Existing accepted SCM risk found; not regenerating this commodity.');
 process.exit(0);
}
if(mode==='free'){
 const result=run(root,{commodity,mode:'free',maxPaid:1,approve:false});
 console.log('[STEP7 RISK RECOVERY] FREE_RESULT='+JSON.stringify({action:result.action,stage:result.stage||null,paidCalls:result.paidCalls}));
 if(result.action==='stop')process.exitCode=2;
}else if(mode==='paid-one'){
 if(!fs.existsSync(path.join(root,'.env')))throw Error('Missing local .env (no paid attempt created)');
 await ensureApiKeyBeforeReservation();
 // Never move a STEP7-1 review into the same command as a paid research stage.
 const result=run(root,{commodity,mode:'paid',maxPaid:1,approve:true});
 if(result.paidCalls>1)throw Error('INTERNAL SAFETY FAILURE: more than one research paid attempt');
 console.log('[STEP7 RISK RECOVERY] PAID_STAGE_RESULT='+JSON.stringify({action:result.action,stage:result.stage||null,paidCalls:result.paidCalls,reason:result.action==='stop'?result.reason:undefined}));
 if(result.action==='stop')process.exitCode=2;
}else if(mode==='map'){
 const dir=researchDir(root,commodity),report=latestReport(dir);
 if(!verifiedReceiptFor(dir,report))throw Error('No verified STEP7-1 receipt for current-day exact report; mapping refused');
 await maybeMap();
}else if(mode==='review-once'){
 if(!fs.existsSync(path.join(root,'.env')))throw Error('Missing local .env (no paid attempt created)');
 await ensureApiKeyBeforeReservation();
 const dir=researchDir(root,commodity),report=latestReport(dir);
 const evidence=buildFinalData(dir);
 if(evidence.commodity!==commodity)throw Error('Review evidence commodity mismatch');
 const riskCheck=assessStep7AiRisk(commodity,report.data.result.procurementRisk,evidence.sources);
 if(!riskCheck.risk)throw Error('STEP7 synthesis has no source-backed AI procurement risk; review cannot invent one. '+(riskCheck.warning||''));
 if(verifiedReceiptFor(dir,report)){
   console.log('[STEP7 RISK RECOVERY] Matching verified receipt already exists; mapping without Gemini');
   await maybeMap();
 }else{
   const marker=`step7-fact-attempt-${report.digest.slice(0,20)}.json`;
   if(safeNames(dir).includes(marker))throw Error('Prior paid STEP7-1 attempt marker exists. Inspect saved receipt before any retry.');
   execute('step7-fact-review.ts','--verify-paid','--approve-review-paid');
   if(!verifiedReceiptFor(dir,report))throw Error('STEP7-1 did not produce an accepted review. Original card preserved.');
   await maybeMap();
 }
}
const final=await receiptInfo(commodity);
display(final);
if(final.todayAccepted)console.log('[STEP7 RISK RECOVERY] COMPLETE: existing source-backed risk accepted; NO Cloud publication or other commodity changes.');
