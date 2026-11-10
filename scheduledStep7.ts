/**
 * STEP 1-7-1-7-2 SCHEDULE INTEGRATION — phase 2, safe runner invocation.
 * Called by the UNCHANGED scripts/cloud/publication.ts phase-1 hook.
 *
 * Modes, all explicitly local-only:
 *   off         (default): no execution
 *   inspect     invoke all eight real research runner inspectors (zero Gemini)
 *   free        invoke all eight real runners with --run-free only (zero Gemini)
 *   paid-local  opt-in local trial of STEP1-7 -> 7-1 -> 7-2 for selected
 *               commodities, enforcing ORIGINAL runner per-stage limits.
 *
 * No Cloud Run, no production publication, and no silent 8-commodity paid run.
 * Do not enable production until durable state + publication are implemented.
 */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const STEP7_COMMODITIES = [
  'wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch',
] as const;
export type ScheduledStep7Mode='off'|'inspect'|'free'|'paid-local';
export type ScheduledStep7Result={
  commodity:string;
  action:'done'|'execute'|'stop'|'error';
  stage?:string;
  paidCalls:number;
  code:number;
};
export type ScheduledStep7State={
  status:'not-enabled'|'complete'|'retained-previous';
  day:string;
  reason?:string;
  results?:ScheduledStep7Result[];
};

const isCloud=()=>Boolean(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production');
const workerFile=fileURLToPath(new URL('./step7ScheduledWorker.mjs',import.meta.url));
const paidWorkerFile=fileURLToPath(new URL('./step7PaidLocalWorker.mjs',import.meta.url));

async function invokeWorker(commodity:string,mode:'inspect'|'free'|'paid-local',day:string):Promise<ScheduledStep7Result>{
  const args=mode==='paid-local'?[paidWorkerFile,'--commodity',commodity,'--paid-local']:[workerFile,'--commodity',commodity,mode==='inspect'?'--inspect':'--free'];
  // This opt-in is passed only to the research worker; existing free/news
  // collection and local/manual STEP execution keep their original paths.
  const env={...process.env,RMS_RESEARCH_RUN_DAY:day};
  // Read-only/free workers never receive paid API credentials. Local paid is
  // enabled ONLY by two explicit switches and an explicit commodity selection.
  if(mode!=='paid-local')for(const name of ['GEMINI_API_KEY','GOOGLE_API_KEY','RMS_GEMINI_API_KEY_FILE','RMS_GEMINI_API_KEY'])delete env[name];
  const timeoutMs=mode==='paid-local'?30*60*1000:mode==='free'?120000:15000;
  return await new Promise<ScheduledStep7Result>((resolve)=>{
    const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
    let output='';
    let completed=false;
    const finish=(r:ScheduledStep7Result)=>{if(completed)return;completed=true;clearTimeout(timer);resolve(r);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish({commodity,action:'error',paidCalls:0,code:124});},timeoutMs);
    child.stdout.on('data',(chunk:Buffer)=>{output=(output+chunk.toString()).slice(-12000);});
    // Do not echo raw provider/network errors to public job logs.
    child.stderr.on('data',()=>{});
    child.on('error',()=>finish({commodity,action:'error',paidCalls:0,code:1}));
    child.on('close',(code)=>{
      const line=output.split(/\r?\n/).filter(x=>x.startsWith('RMS_SCHEDULED_STEP7_JSON=')).at(-1);
      if(code===0&&line){
        try{
          const r=JSON.parse(line.slice('RMS_SCHEDULED_STEP7_JSON='.length));
          if(r.commodity===commodity&&Number.isSafeInteger(r.paidCalls)&&r.paidCalls>=0&&r.paidCalls<=(mode==='paid-local'?7:0)&&['done','execute','stop'].includes(r.action)){
            finish({commodity,action:r.action,stage:typeof r.stage==='string'?r.stage:undefined,paidCalls:r.paidCalls,code:0});return;
          }
        }catch{}
      }
      finish({commodity,action:'error',paidCalls:0,code:code??1});
    });
  });
}

export async function runScheduledStep7({day}:{day:string}):Promise<ScheduledStep7State>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return {status:'retained-previous',day,reason:'invalid-run-day'};
  const mode=process.env.RMS_STEP7_SCHEDULE_MODE||'off';
  // Production is deliberately blocked even if someone sets the mode: the
  // research, review and local preview scripts explicitly refuse Cloud Run.
  if(isCloud())return {status:'not-enabled',day,reason:'cloud-run-paid-execution-not-yet-approved'};
  if(mode==='off')return {status:'not-enabled',day,reason:'set RMS_STEP7_SCHEDULE_MODE=inspect for a free local wiring check'};
  if(mode!=='inspect'&&mode!=='free'&&mode!=='paid-local')return {status:'retained-previous',day,reason:'unsupported-step7-schedule-mode'};
  let targets:readonly string[]=STEP7_COMMODITIES;
  if(mode==='paid-local'){
    if(process.env.RMS_STEP7_PAID_APPROVED!=='YES')return {status:'not-enabled',day,reason:'paid-local-requires-RMS_STEP7_PAID_APPROVED=YES'};
    const raw=process.env.RMS_STEP7_PAID_COMMODITIES?.trim()||'';
    if(!raw)return {status:'not-enabled',day,reason:'paid-local-requires-explicit-commodity-selection'};
    const selected=raw.split(',').map(x=>x.trim());
    if(selected.some(x=>!STEP7_COMMODITIES.includes(x as typeof STEP7_COMMODITIES[number]))||new Set(selected).size!==selected.length)
      return {status:'retained-previous',day,reason:'invalid-paid-local-commodity-list'};
    targets=selected;
  }

  const results:ScheduledStep7Result[]=[];
  for(const commodity of targets){
    const result=await invokeWorker(commodity,mode,day);
    results.push(result);
    console.log('[STEP7 scheduled runner]',commodity,result.action,result.stage||'',`code=${result.code}`,`paidCalls=${result.paidCalls}`);
  }
  const failures=results.filter(x=>x.action==='error').length;
  // A local verified preview is NOT a Cloud Run publication. Never claim
  // production success for a local paid run, even when all cards are verified.
  return {status:'retained-previous',day,results,
    reason:failures?`local-${mode}-runner-errors:${failures}`:`local-${mode}-executed-no-cloud-publication`};
}
