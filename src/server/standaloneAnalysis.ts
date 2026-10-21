/** Manual single-commodity control. Importing/preparing this module authorizes nothing. */
import fs from 'node:fs';
import path from 'node:path';
import {acquirePaidLease,hasOutstandingPaidRequest} from './paidJobLease.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from './stage3Runtime.ts';
import {PaidRequestError,assertPaidRunActive} from './paidRequestTransport.ts';
import {AnalysisValidationError} from './groundedAnalysisResponse.ts';
import {persistAnalysisSnapshot} from './analysisSnapshotPersistence.ts';

// Future commodities require an explicit reviewed allowlist change and new owner approval.
export const STANDALONE_ANALYSIS_ALLOWLIST:readonly string[]=Object.freeze(['soybean']);
export const STANDALONE_ANALYSIS_REVISION='publisher-search-v1';
export const STANDALONE_ANALYSIS_CONFIG=Object.freeze({revision:STANDALONE_ANALYSIS_REVISION,acceptance:'wheat-corn-publisher-search',model:'gemini-3.8-flash',maxCalls:1,maxEstimatedUsd:0.25,
  requestDeadlineMs:60000,jobDeadlineMs:75000,maxOutputTokens:8192,thinking:'LOW',evidenceMode:'search',search:true});
const root=()=>path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3');
const ledger=()=>path.join(root(),'standalone-analysis.json');
function runs():any[]{
  if(!fs.existsSync(ledger()))return [];
  const body=JSON.parse(fs.readFileSync(ledger(),'utf8'));
  if(!Array.isArray(body.runs))throw Error('Standalone ledger invalid; review required.');
  return body.runs;
}
function save(value:any[]){const file=ledger(),tmp=file+'.'+process.pid+'.tmp';fs.mkdirSync(root(),{recursive:true});fs.writeFileSync(tmp,JSON.stringify({runs:value},null,2),{mode:0o600});fs.renameSync(tmp,file);}
const approvalFile=(authorizationId:string)=>path.join(root(),'manual-analysis-approvals',authorizationId+'.json');
function approvalIdentity(id:string,approval:string,authorizationId:string){
  if(!STANDALONE_ANALYSIS_ALLOWLIST.includes(id))throw Error('Standalone commodity is not allowlisted.');
  if(approval!==`${id}-${STANDALONE_ANALYSIS_REVISION}`||!/^[a-zA-Z0-9_-]{12,100}$/.test(authorizationId))
    throw Error('Explicit per-run owner approval and authorization ID required.');
}
/** Local owner provisioning only; no HTTP/scheduler caller. Does not execute Gemini.
 * An immutable approval authorizes one manual occurrence, not a pipeline revision.
 * Historical runs remain the consumption ledger, including pre-approval-file runs.
 */
export function approveStandaloneRun(id:string,approval:string,authorizationId:string,reason:string){
  approvalIdentity(id,approval,authorizationId);
  if(reason.trim().length<20)throw Error('Record the explicit owner approval reason.');
  const release=acquirePaidLease('analysis-job','approve-'+authorizationId);
  try{
    if(hasOutstandingPaidRequest()||runs().some(r=>r.status==='running'||r.authorizationId===authorizationId))throw Error('Authorization already attempted or paid job running.');
    if(fs.existsSync(path.join(root(),'snapshots','analysis-'+id+'.json')))throw Error('Existing snapshot preserved; generation blocked.');
    const grant={authorizationId,commodity:id,revision:STANDALONE_ANALYSIS_REVISION,purpose:'manual-diagnostic',maxAttempts:1,
      approvedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+4*60*60*1000).toISOString(),reason,config:STANDALONE_ANALYSIS_CONFIG};
    const file=approvalFile(authorizationId);fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify(grant,null,2),{flag:'wx',mode:0o600});return grant;
  }finally{release();}
}
export function standaloneStatus(){return {authorizationPolicy:'immutable-per-run-owner-approval',allowlist:STANDALONE_ANALYSIS_ALLOWLIST,config:STANDALONE_ANALYSIS_CONFIG,runs:runs()};}
export function standalonePreflight(id:string,approval:string,authorizationId:string){
  approvalIdentity(id,approval,authorizationId);
  if(hasOutstandingPaidRequest())throw Error('Outstanding paid request lease requires review.');
  if(fs.existsSync(path.join(root(),'snapshots','analysis-'+id+'.json')))throw Error('Existing snapshot preserved; generation blocked.');
  if(runs().some(r=>r.status==='running'||r.authorizationId===authorizationId))
    throw Error('Standalone job already attempted or running; no automatic retries.');
  const file=approvalFile(authorizationId);
  if(!fs.existsSync(file))throw Error('New explicit owner approval record required; no automatic retries.');
  const grant=JSON.parse(fs.readFileSync(file,'utf8'));
  if(grant.authorizationId!==authorizationId||grant.commodity!==id||grant.revision!==STANDALONE_ANALYSIS_REVISION||grant.purpose!=='manual-diagnostic'||grant.maxAttempts!==1||
    !Number.isFinite(Date.parse(grant.approvedAt))||Date.parse(grant.approvedAt)>Date.now()||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=Date.now()||
    Date.parse(grant.expiresAt)-Date.parse(grant.approvedAt)>4*60*60*1000||JSON.stringify(grant.config)!==JSON.stringify(STANDALONE_ANALYSIS_CONFIG))throw Error('Invalid or expired owner approval record.');
}
export function standaloneContext(runId:string,id='soybean'):Stage3RunContext{return {runId,analysisCommodity:id,analysisModel:STANDALONE_ANALYSIS_CONFIG.model,permitted:true,attempts:0,successfulCalls:0,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:0.25,
  deadlineAt:Date.now()+75000,requestDeadlineMs:60000,abortController:new AbortController(),evidenceMode:'search'};}

export async function runStandaloneAnalysis(id:string,approval:string,authorizationId:string,ctx:Stage3RunContext,generate:(id:string)=>Promise<any>){
  standalonePreflight(id,approval,authorizationId);
  if(!ctx.permitted||ctx.analysisCommodity!==id||ctx.analysisModel!==STANDALONE_ANALYSIS_CONFIG.model||ctx.maxCalls!==1||ctx.maxEstimatedUsd!==0.25||ctx.requestDeadlineMs!==60000||ctx.evidenceMode!=='search'||
    !ctx.abortController||ctx.attempts!==0||ctx.successfulCalls!==0||ctx.estimatedUsd!==0||!ctx.deadlineAt||ctx.deadlineAt>Date.now()+75000)
    throw Error('Standalone bounded controls are required.');
  assertPaidRunActive(ctx);
  const release=acquirePaidLease('analysis-job',ctx.runId);
  try{
    standalonePreflight(id,approval,authorizationId); // Recheck inside the cross-process lease.
    const previous=runs(),run:any={runId:ctx.runId,commodity:id,authorizationId,revision:STANDALONE_ANALYSIS_REVISION,approvalRecord:path.relative(root(),approvalFile(authorizationId)),purpose:'manual-diagnostic',status:'running',startedAt:new Date().toISOString(),saved:[],failed:[]};
    previous.push(run);save(previous); // Consume this approval before any source/provider work.
    let timer:ReturnType<typeof setTimeout>|undefined;
    const aborted=new Promise<never>((_,reject)=>{
      const cancel=()=>reject(new PaidRequestError('job-cancelled-or-deadline-exceeded'));
      ctx.abortController!.signal.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>{ctx.cancelled=true;ctx.abortController!.abort();},Math.max(1,ctx.deadlineAt!-Date.now()));
    });
    try{
      await withAuthorizedStage3Run(ctx,async()=>{
        const payload=await Promise.race([Promise.resolve().then(()=>generate(id)),aborted]);
        assertPaidRunActive(ctx);
        if(ctx.attempts!==1||ctx.successfulCalls!==1)throw Error('Expected exactly one successful tracked provider request.');
        if(ctx.estimatedUsd>ctx.maxEstimatedUsd)throw Error('Local estimated-cost guard exceeded.');
        run.saved.push(persistAnalysisSnapshot(root(),id,ctx.runId,payload));
      });
      run.status='completed';
    }catch(error){run.status='failed';run.failed.push({stage:error instanceof AnalysisValidationError?error.stage:'request',error:String((error as Error).message)});}
    finally{
      if(timer)clearTimeout(timer);ctx.cancelled=true;ctx.abortController!.abort();
      run.finishedAt=new Date().toISOString();run.elapsedMs=Date.parse(run.finishedAt)-Date.parse(run.startedAt);run.attempts=ctx.attempts;run.successfulCalls=ctx.successfulCalls;run.estimatedUsd=ctx.estimatedUsd;save(previous);
    }
    return run;
  }finally{release();}
}
