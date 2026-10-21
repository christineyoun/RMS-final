import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const paidRuntimeRoot=()=>path.join(process.env.RMS_STAGE3_RUNTIME_ROOT||process.env.RMS_ANALYSIS_RECOVERY_ROOT||process.cwd(),'.rms-stage3');
export function hasOutstandingPaidRequest(){return fs.existsSync(path.join(paidRuntimeRoot(),'paid-request.lock'));}
/** Exclusive across processes. Crash leftovers fail closed; never steal a lease. */
export function acquirePaidLease(kind:'request'|'analysis-job',runId:string){
  const file=path.join(paidRuntimeRoot(),`paid-${kind}.lock`),nonce=randomUUID();
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try{fs.writeFileSync(file,JSON.stringify({runId,pid:process.pid,nonce,startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});}
  catch{throw Error(`Another paid ${kind} is active or an unresolved lease requires review.`);}
  return ()=>{
    // Never remove another process's lock, even after operator intervention.
    try{if(JSON.parse(fs.readFileSync(file,'utf8')).nonce===nonce)fs.unlinkSync(file);}catch{/* fail closed */}
  };
}
