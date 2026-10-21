/** One pinned retained response; no SDK invocation, paid approval or automatic caller. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {acceptPublisherResearchReport} from './liveAiAnalysisService.ts';
import {isDirectCornAiSource} from './cornAiQuality.ts';
import {acquirePaidLease,hasOutstandingPaidRequest,paidRuntimeRoot} from './paidJobLease.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from './stage3Runtime.ts';
import {persistAnalysisSnapshot,type RetainedPromotionAudit} from './analysisSnapshotPersistence.ts';
import {RMS_PROCUREMENT_POLICY} from '../utils/rmsProcurementCondition.ts';

export const RETAINED_SOYBEAN_RUN='standalone-soybean-a874e58ab620';
export const RETAINED_PROMOTION_APPROVAL='soybean-eighth-retained-no-gemini-v1';
export const RETAINED_REVIEW_SHA256='accb47042bc432b3551ceca0e62d9ed6def13718a5ded58a891c444b8ca9f635';
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const root=()=>path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3');
const reviewDir=()=>path.join(root(),'retained-response-review','soybean-eighth');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
function writeOnce(p:string,value:unknown){fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});}
const grantFile=(id:string)=>path.join(root(),'retained-promotion-approvals',id+'.json');
const consumedFile=()=>path.join(root(),'retained-promotions',RETAINED_SOYBEAN_RUN+'.json');
function identity(approval:string,id:string){if(approval!==RETAINED_PROMOTION_APPROVAL||!/^[a-zA-Z0-9_-]{12,100}$/.test(id))throw Error('Explicit retained-promotion authorization required');}
function idle(){
  if(path.resolve(root())!==path.resolve(paidRuntimeRoot()))throw Error('Promotion/runtime root mismatch');
  if(hasOutstandingPaidRequest())throw Error('Outstanding paid request; promotion blocked');
  if(fs.existsSync(path.join(root(),'snapshots','analysis-soybean.json')))throw Error('Existing Soybean snapshot preserved');
  if(fs.existsSync(consumedFile()))throw Error('Retained response already attempted; no automatic retry');
}

/** Read-only readiness. All provenance comes from pinned, lossless records. */
export function reviewRetainedSoybeanPromotion(){
  const raw=fs.readFileSync(path.join(reviewDir(),'manifest.json'));
  if(hash(raw)!==RETAINED_REVIEW_SHA256)throw Error('Review manifest integrity failure');
  const review=JSON.parse(raw.toString());
  const diagnosticFile=path.join(root(),'diagnostics',RETAINED_SOYBEAN_RUN+'-1-soybean.json');
  const diagnosticRaw=fs.readFileSync(diagnosticFile),d=JSON.parse(diagnosticRaw.toString());
  if(hash(diagnosticRaw)!==review.diagnosticSha256||hash(d.response.text)!==review.responseSha256||
     hash(JSON.stringify(d.response.candidates[0].groundingMetadata))!==review.groundingSha256||
     d.runId!==RETAINED_SOYBEAN_RUN||d.commodity!=='soybean'||d.model!=='gemini-3.8-flash'||d.response.candidates[0].finishReason!=='STOP')throw Error('Original response/source integrity failure');
  const run=read(path.join(root(),'standalone-analysis.json')).runs.find((r:any)=>r.runId===RETAINED_SOYBEAN_RUN);
  const events=fs.readFileSync(path.join(root(),'paid-requests.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter((e:any)=>e.runId===RETAINED_SOYBEAN_RUN);
  if(!run||run.status!=='failed'||hash(JSON.stringify(run))!==review.originalRunSha256||
     hash(JSON.stringify(events))!==review.originalRequestEventsSha256||
     !events.some((e:any)=>e.phase==='completed'&&e.responseStatus===200&&e.httpAttempts===1&&e.recordedAt===review.originalGeneratedAt))throw Error('Original run/transport provenance failure');
  if(hash(JSON.stringify(review.qualifications))!==review.qualificationsSha256)throw Error('Review qualifications integrity failure');
  const chunks=d.response.candidates[0].groundingMetadata.groundingChunks;
  const sources=review.sources.map((s:any,i:number)=>{
    if(s.chunkIndex!==i||i>=6||s.title!==chunks[i]?.web?.title||!isDirectCornAiSource(s.url)||
       s.httpStatus!==200||s.receiptFile!=='source-'+i+'.html'||!Number.isFinite(Date.parse(s.verifiedAt))||
       hash(fs.readFileSync(path.join(reviewDir(),s.receiptFile)))!==s.sha256)throw Error('Retained publisher evidence integrity failure');
    return {url:s.url,title:s.title};
  });
  if(new Set(sources.map((s:any)=>new URL(s.url).hostname.replace(/^www\./,''))).size<2)throw Error('Two independent verified publisher hosts required');
  const report=acceptPublisherResearchReport(d.response.text,'soybean',d.model,sources,review.originalGeneratedAt);
  const original=JSON.parse(d.response.text);
  for(const k of ['confidenceScore','deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'])
    if(JSON.stringify((report as any)[k])!==JSON.stringify(original[k]))throw Error('Promotion must preserve exact Gemini report fields');
  if(report.procurementConditionPolicy!==RMS_PROCUREMENT_POLICY)throw Error('Separate RMS procurement policy required');
  return {review,report,reviewSha256:RETAINED_REVIEW_SHA256};
}

/** Local owner provisioning only, after a future explicit approval. Does not save or generate. */
export function approveRetainedSoybeanPromotion(approval:string,authorizationId:string,reviewSha256:string,acknowledgedQualificationsSha256:string,reason:string){
  identity(approval,authorizationId);const release=acquirePaidLease('analysis-job','approve-promotion-'+authorizationId);
  try{
    idle();const {review}=reviewRetainedSoybeanPromotion();
    if(reviewSha256!==RETAINED_REVIEW_SHA256||acknowledgedQualificationsSha256!==review.qualificationsSha256||reason.trim().length<20)throw Error('Owner must acknowledge exact reviewed provenance and qualifications');
    const grant={authorizationId,approval,purpose:'retained-response-promotion-no-gemini',originalRunId:RETAINED_SOYBEAN_RUN,reviewSha256,acknowledgedQualificationsSha256,maxOperations:1,
      approvedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+4*3600000).toISOString(),reason};
    writeOnce(grantFile(authorizationId),grant);return grant;
  }finally{release();}
}
export function retainedPromotionPreflight(approval:string,authorizationId:string){
  identity(approval,authorizationId);idle();
  const grant=read(grantFile(authorizationId)),now=Date.now();
  if(grant.authorizationId!==authorizationId||grant.approval!==approval||grant.purpose!=='retained-response-promotion-no-gemini'||
     grant.originalRunId!==RETAINED_SOYBEAN_RUN||grant.reviewSha256!==RETAINED_REVIEW_SHA256||grant.maxOperations!==1||
     !Number.isFinite(Date.parse(grant.approvedAt))||Date.parse(grant.approvedAt)>now||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now||
     Date.parse(grant.expiresAt)-Date.parse(grant.approvedAt)>4*3600000)throw Error('Invalid/expired retained-promotion grant');
  const prepared=reviewRetainedSoybeanPromotion();
  if(grant.acknowledgedQualificationsSha256!==prepared.review.qualificationsSha256)throw Error('Qualifications not acknowledged');
  return prepared;
}
/** No network. A separate immutable occurrence ledger leaves paid history untouched. */
export function promoteRetainedSoybeanResponse(approval:string,authorizationId:string){
  identity(approval,authorizationId);const promotionId='retained-soybean-'+randomUUID(),release=acquirePaidLease('analysis-job',promotionId);
  try{
    const {review,report}=retainedPromotionPreflight(approval,authorizationId),promotedAt=new Date().toISOString();
    writeOnce(consumedFile(),{promotionId,authorizationId,originalRunId:RETAINED_SOYBEAN_RUN,reviewSha256:RETAINED_REVIEW_SHA256,startedAt:promotedAt,purpose:'retained-response-promotion-no-gemini'});
    const ctx:Stage3RunContext={runId:promotionId,permitted:false,attempts:0,successfulCalls:0,maxCalls:0,estimatedUsd:0,maxEstimatedUsd:0,
      abortController:new AbortController(),deadlineAt:Date.now()+75000};
    const audit:RetainedPromotionAudit={kind:'retained-response-promotion-no-gemini',promotionId,authorizationId,promotedAt,
      originalRunId:RETAINED_SOYBEAN_RUN,originalGeneratedAt:review.originalGeneratedAt,diagnosticSha256:review.diagnosticSha256,
      responseSha256:review.responseSha256,groundingSha256:review.groundingSha256,reviewSha256:RETAINED_REVIEW_SHA256,
      qualifications:review.qualifications,generationTimeBasis:review.generationTimeBasis,sourceReceipts:review.sources};
    try{
      const saved=withAuthorizedStage3Run(ctx,()=>persistAnalysisSnapshot(root(),'soybean',RETAINED_SOYBEAN_RUN,{success:true,data:report},audit));
      const result={promotionId,status:'saved',saved,originalRunId:RETAINED_SOYBEAN_RUN,promotedAt,geminiHttpAttempts:0,estimatedPaidCostUsd:0};
      writeOnce(consumedFile()+'.result.json',result);return result;
    }catch(e){writeOnce(consumedFile()+'.result.json',{promotionId,status:'failed',error:String((e as Error).message),geminiHttpAttempts:0});throw e;}
    finally{ctx.cancelled=true;ctx.abortController!.abort();}
  }finally{release();}
}
