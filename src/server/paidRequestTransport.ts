import {captureProviderError,type ProviderErrorDiagnostic} from './providerErrorDiagnostic.ts';
import fs from 'node:fs';
import path from 'node:path';
import {acquirePaidLease,paidRuntimeRoot} from './paidJobLease.ts';
import type {Stage3RunContext} from './stage3Runtime.ts';

export const PAID_REQUEST_DEADLINE_MS=60000;
export class PaidRequestError extends Error {
  constructor(public code:string,public status?:number,public providerError?:ProviderErrorDiagnostic){super(`RMS paid request: ${code}${status?' (HTTP '+status+')':''}`);}
}
export function assertPaidRunActive(ctx:Stage3RunContext|undefined){
  if(ctx&&(ctx.cancelled||ctx.abortController?.signal.aborted||ctx.deadlineAt!==undefined&&Date.now()>=ctx.deadlineAt))
    throw new PaidRequestError('job-cancelled-or-deadline-exceeded');
}
/** Allowlisted telemetry only: no URL, headers, request body, credentials or raw errors. */
export function recordPaidRequestEvent(event:Record<string,unknown>){
  fs.mkdirSync(paidRuntimeRoot(),{recursive:true});
  fs.appendFileSync(path.join(paidRuntimeRoot(),'paid-requests.jsonl'),JSON.stringify({recordedAt:new Date().toISOString(),...event})+'\n',{mode:0o600});
}
export async function boundedPaidRequest<T>(params:any,invoke:(p:any)=>Promise<T>,ctx:Stage3RunContext,reservedUsd:number):Promise<T>{
  assertPaidRunActive(ctx);
  const release=acquirePaidLease('request',ctx.runId);
  const started=Date.now(),controller=new AbortController();
  const deadlineMs=Math.min(ctx.requestDeadlineMs??PAID_REQUEST_DEADLINE_MS,ctx.deadlineAt===undefined?Infinity:ctx.deadlineAt-started);
  let httpAttempts=0,status:number|null=null,rawSettled=false,discardLate=false;
  let providerError:ProviderErrorDiagnostic|undefined;
  const model=/^[\w./-]+$/.test(String(params.model))?String(params.model):'invalid-model';
  const base={runId:ctx.runId,attempt:ctx.attempts,model,sdkAttemptsLimit:1,automaticContinuation:false,automaticFunctionCalling:false,deadlineMs,reservedEstimatedUsd:reservedUsd};
  const emit=(phase:string,extra:Record<string,unknown>={})=>recordPaidRequestEvent({...base,phase,httpAttempts,responseStatus:status,elapsedMs:Date.now()-started,...extra});
  let rejectAbort:(reason:unknown)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const cancel=(code:string)=>{
    if(controller.signal.aborted)return;
    ctx.cancelled=true;controller.abort(new PaidRequestError(code));rejectAbort(new PaidRequestError(code));
  };
  const caller=params.config?.abortSignal as AbortSignal|undefined;
  const onCaller=()=>cancel('caller-aborted'),onJob=()=>cancel('job-aborted');
  let timer:ReturnType<typeof setTimeout>|undefined;
  const underlyingFetch=params.config?.httpOptions?.fetch||globalThis.fetch;
  const instrumentedFetch=async(input:any,init:any)=>{
    assertPaidRunActive(ctx);
    if(controller.signal.aborted)throw new PaidRequestError('request-aborted');
    if(httpAttempts>=1)throw new PaidRequestError('http-attempt-limit-exceeded');
    httpAttempts++;emit('http-started');
    const signal=init?.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal;
    const response=await underlyingFetch(input,{...init,signal,redirect:'error'});
    status=response.status;emit('http-response');
    if(!response.ok){const captured=await captureProviderError(response,params,init?.headers,input);providerError=captured.diagnostic;return captured.response;}
    return response;
  };
  try{
    emit('started'); // Persist before contacting the SDK/provider.
    caller?.addEventListener('abort',onCaller,{once:true});ctx.abortController?.signal.addEventListener('abort',onJob,{once:true});
    if(caller?.aborted)onCaller();if(ctx.abortController?.signal.aborted)onJob();
    timer=setTimeout(()=>cancel('request-deadline-exceeded'),Math.max(1,deadlineMs));
    const prepared={...params,config:{...params.config,automaticContinuation:false,automaticFunctionCalling:{disable:true},abortSignal:controller.signal,httpOptions:{...params.config?.httpOptions,
      retryOptions:{attempts:1},timeout:Math.max(1,deadlineMs),fetch:instrumentedFetch}}};
    const raw=Promise.resolve().then(()=>{assertPaidRunActive(ctx);return invoke(prepared);});
    // Keep the transport lease until the underlying operation settles, even if a
    // noncompliant fetch ignores abort. Its late result cannot reach the caller.
    void raw.then(()=>{rawSettled=true;if(discardLate)emit('late-response-discarded');release();},()=>{rawSettled=true;if(discardLate)emit('late-error-discarded');release();}).catch(()=>{});
    const result=await Promise.race([raw,aborted]);
    assertPaidRunActive(ctx);
    if(controller.signal.aborted||Date.now()-started>=deadlineMs)throw new PaidRequestError('request-deadline-exceeded');
    emit('completed');return result;
  }catch(error:any){
    discardLate=!rawSettled;
    const code=error instanceof PaidRequestError?error.code:controller.signal.aborted?'request-aborted':status?'provider-http-error':'transport-or-response-error';
    emit('failed',{reason:code,usageAvailable:false,estimatedCostUsd:null,underlyingPending:!rawSettled,...(providerError?{providerError}:{})});
    throw new PaidRequestError(code,typeof error?.status==='number'?error.status:status??undefined,providerError);
  }finally{
    if(timer)clearTimeout(timer);caller?.removeEventListener('abort',onCaller);ctx.abortController?.signal.removeEventListener('abort',onJob);
    // No raw operation exists if preflight/event persistence failed.
    if(httpAttempts===0&&!discardLate)release();
  }
}
