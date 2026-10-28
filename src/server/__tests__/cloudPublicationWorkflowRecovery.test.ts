import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runRefreshWorkflow,savedPriorNews,privateServer,publish} from '../../../scripts/cloud/publication.ts';
import {spawn} from 'node:child_process';
import {gzipSync} from 'node:zlib';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-cloud-workflow-'));
const previous=process.cwd();
const priorRoot=process.env.RMS_STAGE3_RUNTIME_ROOT,nativeFetch=globalThis.fetch;
try{
 process.chdir(root);
 process.env.RMS_STAGE3_RUNTIME_ROOT=root;
 globalThis.fetch=async()=>{throw Error('Real network forbidden in workflow recovery test');};
 fs.mkdirSync('.rms-stage3',{recursive:true});
 fs.writeFileSync('.rms-stage3/settings.json',JSON.stringify({autoEnabled:false,freeAutoEnabled:true}));
 const now=()=>new Date('2026-10-28T00:10:00Z');
 let readAttempts=0,aiCalls=0,publicationCalls=0;
 const outcome=await runRefreshWorkflow({} as any,undefined,{
  now,
  runner:{check:async()=>({day:'2026-10-28',status:'completed'} as any),retryFailed:async()=>null},
  loadPriorNews:async()=>{readAttempts++;throw Error('previous saved news unavailable');},
  runAi:async(_policy,_journal,options)=>{
   aiCalls++;assert.deepEqual(options?.priorNews,{});
   return {attempts:0,accepted:[],estimatedUsd:0,budget:{}} as any;
  },
  publishOverview:async()=>{publicationCalls++;return {changed:true} as any;}
 });
 assert.equal(readAttempts,1);
 assert.equal(aiCalls,1,'A failed prior-news read must not skip AI');
 assert.equal(publicationCalls,1,'Final aggregation must continue');
 assert.equal(outcome?.aiError,false);
 let failedAiCalls=0,retainedPublication=0;
 const failure=await runRefreshWorkflow({} as any,undefined,{
  now,priorNews:{},
  runner:{check:async()=>({day:'2026-10-28',status:'completed'} as any),retryFailed:async()=>null},
  runAi:async()=>{failedAiCalls++;throw Error('synthetic AI failure');},
  publishOverview:async()=>{retainedPublication++;return {changed:true} as any;}
 });
 assert.equal(failedAiCalls,1);assert.equal(retainedPublication,1);
 assert.equal(failure?.aiError,true,'AI exception is isolated from free-publication aggregation');
 // Each reader and each crop is isolated; a failed verified reader must not
 // discard the already approved content for that same crop.
 const reads:string[]=[];
 const prior=await savedPriorNews(root,{
  readApproved:id=>{if(id==='corn')throw Error('SECRET_APPROVED_READ');return [{id:'approved-'+id,publishedAt:'2026-10-26'}];},
  readVerified:id=>{reads.push(id);if(id==='wheat'||id==='corn')throw Error('SECRET_VERIFIED_READ');return [{id:'verified-'+id,publishedAt:'2026-10-27'}];},
  select:(id,articles)=>{if(id==='soybean')throw Error('SECRET_SELECTION');return articles;}
 });
 assert.equal(reads.length,8);assert.equal(Object.keys(prior).length,8);assert.equal(prior.wheat[0].id,'approved-wheat');assert.deepEqual(prior.corn,[]);assert.equal(prior.soybean[0].id,'approved-soybean');assert.equal(prior['tapioca-starch'].length,2);assert.equal(prior.wheat[0].publishedAt,'2026-10-26','original dates retained');
 const empty=await savedPriorNews(root);assert.equal(Object.keys(empty).length,8,'default saved-only readers work without private HTTP startup');
 let allCommodityAttempts:string[]=[];
 await runRefreshWorkflow({} as any,undefined,{now,runner:{check:async()=>({day:'2026-10-28',status:'completed'}),retryFailed:async()=>null},loadPriorNews:async()=>prior,runAi:async(_p,_s,o)=>{assert.equal(o?.priorNews,prior);allCommodityAttempts=Object.keys(o!.priorNews!);return {accepted:[],attempts:0,budget:{}} as any;},publishOverview:async()=>({changed:false} as any)});assert.equal(allCommodityAttempts.length,8);
 // Broken console and journal telemetry cannot block the AI/free paths.
 const warn=console.warn,error=console.error;let freeAfterLoggingFailure=0,aiAfterLoggingFailure=0;
 process.env.RMS_STAGE3_RUNTIME_ROOT=path.join(root,'broken-telemetry');fs.mkdirSync(path.join(process.env.RMS_STAGE3_RUNTIME_ROOT,'.rms-stage3/paid-requests.jsonl'),{recursive:true});
 try{console.warn=()=>{throw Error('logging unavailable');};console.error=()=>{throw Error('logging unavailable');};
  const result=await runRefreshWorkflow({} as any,undefined,{now,runner:{check:async()=>{throw Error('free collector failed');},retryFailed:async()=>null},loadPriorNews:async()=>{throw Error('SECRET_PRIOR_READ');},runAi:async()=>{aiAfterLoggingFailure++;throw new Proxy({}, {getPrototypeOf(){throw Error('SECRET_GETTER');}});},publishOverview:async()=>{freeAfterLoggingFailure++;return {} as any;}});assert.equal(result?.aiError,true);
 }finally{console.warn=warn;console.error=error;process.env.RMS_STAGE3_RUNTIME_ROOT=root;}
 assert.equal(freeAfterLoggingFailure,1);assert.equal(aiAfterLoggingFailure,1);
 // Final server/capture failure never invokes publication. An invalid final
 // bundle is refused by the real publish validator before any GCS transport.
 let writes=0,child:ReturnType<typeof spawn>|undefined;
 globalThis.fetch=async()=>{writes++;throw Error('Unexpected storage/network access');};
 const reader={spawnReader:(env:NodeJS.ProcessEnv)=>{child=spawn(process.execPath,['-e',`console.log('Server running on port ${env.PORT}');setInterval(()=>{},1000)`],{stdio:['ignore','pipe','pipe']});return child;},probe:async()=>true,timeoutMs:2000,shutdownGraceMs:100};
 await assert.rejects(privateServer(root,async()=>{await publish({version:1,responses:{}} as any,gzipSync('{}'),'0');},reader),/Saved publication identity/);
 assert.equal(writes,0);assert(child&&(child.exitCode!==null||child.signalCode!==null),'failed final validation stops its private reader');
 let captured=false;
 await assert.rejects(privateServer(root,async()=>{captured=true;},{...reader,spawnReader:()=>{child=spawn(process.execPath,['-e','process.exit(7)'],{stdio:['ignore','pipe','pipe']});return child;}}),/early-exit/);assert.equal(captured,false);assert.equal(writes,0);
 console.log('PASS private prior-news capture removed from AI prerequisites; failed reads and failed AI preserve free aggregation (offline)');
}finally{process.chdir(previous);globalThis.fetch=nativeFetch;if(priorRoot===undefined)delete process.env.RMS_STAGE3_RUNTIME_ROOT;else process.env.RMS_STAGE3_RUNTIME_ROOT=priorRoot;fs.rmSync(root,{recursive:true,force:true});}
