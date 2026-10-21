import {PaidRequestError} from './paidRequestTransport.ts';
import fs from 'node:fs';
import path from 'node:path';
import {getStage3RunContext} from './stage3Runtime.ts';
import {AnalysisValidationError,analysisResponseText} from './groundedAnalysisResponse.ts';
import {searchGroundingDiagnostic} from './searchGroundingDiagnostic.ts';

/** Authorized jobs only. Retain provider output locally so downstream failures are diagnosable. */
export function recordAnalysisDiagnostic(id:string,model:string,response:any,error?:unknown,request?:Record<string,unknown>):void {
  try { writeDiagnostic(id,model,response,error,request); }
  catch(e){console.error('[RMS AI diagnostic persistence]',String((e as Error).message));}
}
function writeDiagnostic(id:string,model:string,response:any,error?:unknown,request?:Record<string,unknown>):void {
  const context=getStage3RunContext();if(!context?.permitted)return;
  const root=path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3');
  const validation=error instanceof AnalysisValidationError?{stage:error.stage,issues:error.issues}:null;
  const body={recordedAt:new Date().toISOString(),runId:context.runId,attempt:context.attempts,commodity:id,model,
    request,
    ...(error instanceof PaidRequestError&&error.providerError?{providerError:error.providerError}:{}),
    stage:validation?.stage||(error?'provider-or-integrity':'validated'),issues:validation?.issues||(error?[String((error as Error).message)]:[]),
    response:response?{text:analysisResponseText(response).slice(0,60000),promptFeedback:response.promptFeedback,usageMetadata:response.usageMetadata,
      searchDiagnostics:searchGroundingDiagnostic(response),
      candidates:response.candidates?.map((c:any)=>({finishReason:c.finishReason,safetyRatings:c.safetyRatings,groundingMetadata:c.groundingMetadata}))}:null};
  fs.mkdirSync(path.join(root,'diagnostics'),{recursive:true,mode:0o700});
  // Attempt records are append-only; latest pointer helps existing refresh logs.
  const name=[context.runId,context.attempts,id].join('-').replace(/[^a-z0-9_-]/gi,'_')+'.json';
  fs.writeFileSync(path.join(root,'diagnostics',name),JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});
  const latest=path.join(root,'analysis-'+id+'-diagnostic.json');const tmp=latest+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(body,null,2),{mode:0o600});fs.renameSync(tmp,latest);
}
