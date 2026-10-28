import type {ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

export type PrivateReaderFailureCode='startup-timeout'|'early-exit'|'spawn-error'|'cleanup-failed';
export class PrivateReaderStartupError extends Error{
 readonly code:PrivateReaderFailureCode;
 readonly elapsedMs:number;
 readonly exitCode:number|null;
 readonly signalCode:NodeJS.Signals|null;
 readonly hint:string;
 constructor(code:PrivateReaderFailureCode,elapsedMs:number,exitCode:number|null,signalCode:NodeJS.Signals|null,hint:string){
  super(`Private saved-reader startup ${code}; elapsedMs=${elapsedMs}; exitCode=${exitCode??'none'}; signal=${signalCode??'none'}; hint=${hint}`);
  this.name='PrivateReaderStartupError';
  this.code=code;this.elapsedMs=elapsedMs;this.exitCode=exitCode;this.signalCode=signalCode;this.hint=hint;
 }
}
/** Only emit a fixed diagnostic identifier; never expose arbitrary child logs or credentials. */
export function privateReaderStartupHint(output:string){
 if(/ERR_MODULE_NOT_FOUND|Cannot find module/i.test(output))return 'module-not-found';
 if(/EADDRINUSE/i.test(output))return 'port-in-use';
 if(/EACCES|EPERM/i.test(output))return 'permission-denied';
 if(/Failed to start server/i.test(output))return 'server-start-error';
 return 'unclassified';
}
const defaultProbe=async(port:number,signal:AbortSignal)=>{
 const response=await fetch(`http://127.0.0.1:${port}/api/rms/refresh-status`,{signal,redirect:'error'});
 if(response.status!==200)return false;
 const status=await response.json();
 return status?.stage==='weekday-snapshots'&&status?.timezone==='Asia/Seoul'&&status?.autoEnabled===false&&status?.paidGeminiCalls==='BLOCKED_ON_PAGE_VIEW';
};
/** A startup log alone is not readiness: the saved-only API must answer on loopback.
 * Failure is bounded, and a child that exits immediately is not mistaken for a timeout. */
export async function waitForPrivateReaderReady(child:ChildProcess,hasReadyLine:()=>boolean,spawnError:()=>unknown,port:number,options:{timeoutMs?:number;probe?:(port:number,signal:AbortSignal)=>Promise<boolean>;output?:()=>string}={}){
 const start=performance.now(),timeoutMs=options.timeoutMs??60000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid private-reader startup timeout');
 const probe=options.probe??defaultProbe;
 const failure=(code:PrivateReaderFailureCode)=>new PrivateReaderStartupError(code,Math.round(performance.now()-start),child.exitCode,child.signalCode,privateReaderStartupHint(options.output?.()??''));
 while(performance.now()-start<timeoutMs){
  if(spawnError())throw failure('spawn-error');
  if(child.exitCode!==null||child.signalCode!==null)throw failure('early-exit');
  if(hasReadyLine()){
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const deadline=new Promise<boolean>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(false);},Math.max(1,Math.min(1500,timeoutMs-(performance.now()-start))));});
    if(await Promise.race([Promise.resolve().then(()=>probe(port,controller.signal)),deadline])){if(spawnError())throw failure('spawn-error');if(child.exitCode!==null||child.signalCode!==null)throw failure('early-exit');if(performance.now()-start>=timeoutMs)throw failure('startup-timeout');return;}
   }
   catch(error){if(error instanceof PrivateReaderStartupError)throw error;/* wait for a healthy saved reader */}
   finally{if(timer)clearTimeout(timer);controller.abort();}
  }
  await delay(Math.min(200,Math.max(1,timeoutMs-(performance.now()-start))));
 }
 throw failure('startup-timeout');
}
/** Never hang final publication while waiting for a child that ignores SIGTERM. */
export async function stopPrivateReader(child:ChildProcess,graceMs=2500){
 if(!Number.isFinite(graceMs)||graceMs<1||graceMs>10000)throw Error('Invalid private-reader shutdown grace');
 const exited=()=>child.exitCode!==null||child.signalCode!==null;
 if(exited()||child.pid===undefined)return; // Failed spawn owns no process.
 const wait=()=>new Promise<void>(resolve=>{
  if(exited()){resolve();return;}
  const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};
  const timer=setTimeout(done,graceMs);child.once('exit',done);
 });
 const start=performance.now();
 try{child.kill('SIGTERM');}catch{}
 await wait();
 if(!exited()){
  try{child.kill('SIGKILL');}catch{}
  await wait();
 }
 if(!exited())throw new PrivateReaderStartupError('cleanup-failed',Math.round(performance.now()-start),child.exitCode,child.signalCode,'unclassified');
}
