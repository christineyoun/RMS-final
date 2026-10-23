import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {snapshotIssues} from './mvpEvidence.ts';
import {AnalysisValidationError} from './groundedAnalysisResponse.ts';
import {getStage3RunContext} from './stage3Runtime.ts';
import {assertPaidRunActive} from './paidRequestTransport.ts';

/** Shared final persistence step, after the generation pipeline's factual checks. */
export interface RetainedPromotionAudit {
  kind:'retained-response-promotion-no-gemini';promotionId:string;authorizationId:string;promotedAt:string;
  originalRunId:string;originalGeneratedAt:string;diagnosticSha256:string;responseSha256:string;groundingSha256:string;
  reviewSha256:string;qualifications:string[];generationTimeBasis:string;sourceReceipts:unknown[];
  editorialReview?:unknown;
}
export function persistAnalysisSnapshot(root:string,id:string,runId:string,payload:any,promotionAudit?:RetainedPromotionAudit){
  assertPaidRunActive(getStage3RunContext());
  const issues=snapshotIssues('analysis-'+id,payload);
  if(issues.length)throw new AnalysisValidationError('schema',issues);
  if(payload?.data?.status!=='live')throw new AnalysisValidationError('response',['diagnostic-did-not-produce-live-analysis']);
  const file=path.join(root,'snapshots','analysis-'+id+'.json');
  if(promotionAudit&&(promotionAudit.originalRunId!==runId||promotionAudit.originalGeneratedAt!==payload.data.generatedAt))
    throw new AnalysisValidationError('persistence',['retained-generation-provenance-mismatch']);
  const body={updatedAt:new Date().toISOString(),runId,sourceStatus:promotionAudit?.editorialReview?'reviewed-editorial-derivative':'requires-human-review',payload,...(promotionAudit?{promotionAudit}:{})};
  const tmp=file+'.'+process.pid+'.tmp';
  let ownsTemp=false;
  try{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(tmp,JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});ownsTemp=true;
    assertPaidRunActive(getStage3RunContext());
    fs.linkSync(tmp,file); // Exclusive creation: never overwrite a saved analysis.
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(snapshotIssues('analysis-'+id,saved.payload).length)throw Error('Snapshot read-back validation failed');
    if(promotionAudit&&JSON.stringify(saved.promotionAudit)!==JSON.stringify(promotionAudit))throw Error('Promotion provenance read-back failed');
    return {id,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  }catch(e){throw new AnalysisValidationError('persistence',[String((e as Error).message)]);}
  finally{if(ownsTemp)fs.unlinkSync(tmp);}
}
