import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {mock as testClock} from 'node:test';
import {GoogleGenAI as SDK} from '@google/genai';
import {GoogleGenAI} from '../paidGeminiGuard.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from '../stage3Runtime.ts';
import {hasOutstandingPaidRequest,acquirePaidLease} from '../paidJobLease.ts';
import {approveStandaloneRun,runStandaloneAnalysis,standaloneContext,standalonePreflight,standaloneStatus} from '../standaloneAnalysis.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import type {AnalysisEvidence} from '../analysisEvidence.ts';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-paid-controls-'));
const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Real network prohibited');};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let serial=0;
const setup=(deadline=200)=>{
  const root=path.join(temp,String(++serial));process.env.RMS_STAGE3_RUNTIME_ROOT=root;process.env.RMS_ANALYSIS_RECOVERY_ROOT=root;
  const ctx:Stage3RunContext={runId:'offline-'+serial,permitted:true,attempts:0,successfulCalls:0,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:0.25,
    abortController:new AbortController(),requestDeadlineMs:deadline,deadlineAt:Date.now()+1000};
  return {root,ctx};
};
const events=(root:string)=>fs.readFileSync(path.join(root,'.rms-stage3/paid-requests.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const reply=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'offline fixture'}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20}}),{status:200,headers:{'content-type':'application/json'}});
const run=(ctx:Stage3RunContext,fetch:any,config:any={})=>withAuthorizedStage3Run(ctx,()=>{
  const client=new GoogleGenAI({apiKey:'SECRET_OFFLINE_TEST',httpOptions:{fetch,retryOptions:{attempts:5}}});
  return client.models.generateContent({model:'gemini-3.8-flash',contents:'OFFLINE TEST ONLY',config:{...config,httpOptions:{...config.httpOptions,retryOptions:{attempts:5}}}});
});
const payload={success:true,data:{status:'live',executiveSummary:'OFFLINE ONLY: '.repeat(20),deskRecommendation:'OFFLINE ONLY',
  bullishFactors:['offline','fixture'],bearishFactors:['offline','fixture'],watchItems:['offline','fixture'],generatedAt:new Date().toISOString(),sources:[{url:'https://example.org/offline',title:'Offline'}]}};
try{
  assert.throws(()=>new GoogleGenAI({apiKey:'offline'}),/blocked outside/);
  // Installed SDK behavior, not an inference from its default constant.
  for(const enabled of [false,true]){
    let requests=0;
    const client=new SDK({apiKey:'offline',httpOptions:{fetch:async()=>{requests++;return new Response('{"error":{"message":"offline","code":503}}',{status:503});},
      ...(enabled?{retryOptions:{initialDelay:0.001,maxDelay:0.001,jitter:0}}:{})}});
    await assert.rejects(client.models.generateContent({model:'gemini-3.8-flash',contents:'offline'}));
    assert.equal(requests,enabled?5:1,'omitted retryOptions means one; options with omitted attempts mean five');
  }
  {
    const {root,ctx}=setup();let requests=0;
    const result=await run(ctx,async(_url:any,init:any)=>{requests++;assert.ok(init.signal instanceof AbortSignal);assert.equal(init.redirect,'error');await delay(5);return reply();});
    assert.equal(result.text,'offline fixture');assert.equal(requests,1);assert.equal(ctx.successfulCalls,1);assert.equal(hasOutstandingPaidRequest(),false);
    const log=events(root);assert.equal(log[0].phase,'started');assert.equal(log[0].httpAttempts,0);assert.equal(log[0].reservedEstimatedUsd,0.12);
    assert.equal(log.find(x=>x.phase==='http-response').responseStatus,200);assert.ok(log.some(x=>x.phase==='usage'&&x.usageAvailable));
    await assert.rejects(run(ctx,async()=>reply()),/budget limit/);
    assert.ok(!fs.readFileSync(path.join(root,'.rms-stage3/paid-requests.jsonl'),'utf8').includes('SECRET_OFFLINE_TEST'));
  }
  for(const status of [429,503]){
    const {root,ctx}=setup();let requests=0;
    await assert.rejects(run(ctx,async()=>{requests++;return new Response(JSON.stringify({error:{code:status,message:'SECRET_OFFLINE_TEST'}}),{status});}),new RegExp('HTTP '+status));
    assert.equal(requests,1,'SDK and request-level attempt overrides cannot trigger retries');assert.equal(ctx.successfulCalls,0);
    const failed=events(root).find(x=>x.phase==='failed');assert.equal(failed.responseStatus,status);assert.equal(failed.httpAttempts,1);
    assert.equal(hasOutstandingPaidRequest(),false);
    assert.ok(!fs.readFileSync(path.join(root,'.rms-stage3/usage.jsonl'),'utf8').includes('SECRET_OFFLINE_TEST'));
  }
  {
    const {ctx}=setup();let requests=0;
    const result=await run(ctx,async()=>{requests++;return new Response(JSON.stringify({candidates:[{finishReason:'CONTINUATION',content:{parts:[{text:'unfinished offline'}]}}],continuationToken:'OFFLINE_CONTINUATION'}),{status:200});},
      {automaticContinuation:true,automaticFunctionCalling:{disable:false}});
    assert.equal(requests,1,'automatic continuation cannot send another HTTP request');assert.equal(result.candidates?.[0].finishReason,'CONTINUATION');
  }
  {
    const {root,ctx}=setup(15);let cancelled=false;
    await assert.rejects(run(ctx,async(_url:any,init:any)=>new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('Abort','AbortError'));},{once:true});
    })),/request-deadline-exceeded/);
    await delay(5);assert.equal(cancelled,true);assert.equal(ctx.cancelled,true);assert.equal(hasOutstandingPaidRequest(),false);
    assert.ok(events(root).some(x=>x.phase==='failed'&&x.reason==='request-deadline-exceeded'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/usage.jsonl'),'utf8')).estimatedUsd,null,'timeout charge is unknown, not fabricated');
  }
  {
    const {ctx}=setup(200);let cancelled=false;
    const pending=run(ctx,async(_url:any,init:any)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{cancelled=true;reject(Error('cancelled'));})));
    await delay(5);ctx.abortController!.abort();await assert.rejects(pending,/job-aborted/);assert.equal(cancelled,true);
  }
  {
    const {ctx}=setup(200);const caller=new AbortController();let cancelled=false;
    const pending=run(ctx,async(_url:any,init:any)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{cancelled=true;reject(Error('cancelled'));})),{abortSignal:caller.signal});
    await delay(5);caller.abort();await assert.rejects(pending,/caller-aborted/);assert.equal(cancelled,true);
  }
  {
    const {root,ctx}=setup(15);let bodyAborted=false;
    await assert.rejects(run(ctx,async(_url:any,init:any)=>new Response(new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode('{"candidates":['));
      init.signal.addEventListener('abort',()=>{bodyAborted=true;controller.error(new DOMException('Abort','AbortError'));});
    }}),{status:200})),/request-deadline-exceeded/);
    await delay(5);assert.equal(bodyAborted,true,'deadline covers body consumption, not only response headers');
    assert.equal(events(root).find(x=>x.phase==='failed').responseStatus,200);
  }
  {
    const {root,ctx}=setup(15);let requests=0;
    // Mock deliberately violates AbortSignal. It must not release the lease or
    // deliver a late successful result to validation/cache/persistence.
    const failed=run(ctx,async()=>{requests++;await delay(70);return reply();});
    await assert.rejects(failed,/request-deadline-exceeded/);assert.equal(hasOutstandingPaidRequest(),true);
    const concurrent:Stage3RunContext={...ctx,runId:'concurrent',attempts:0,cancelled:false,abortController:new AbortController(),estimatedUsd:0};
    await assert.rejects(run(concurrent,async()=>{requests++;return reply();}),/lease requires review/);assert.equal(requests,1);
    assert.throws(()=>standalonePreflight('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-pending-transport'),/Outstanding paid request lease/);
    await delay(100);assert.equal(hasOutstandingPaidRequest(),false);assert.ok(events(root).some(x=>x.phase==='late-response-discarded'));
    assert.equal(ctx.successfulCalls,0);
  }
  {
    const {root}=setup();approveStandaloneRun('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-late-persist','Explicit OFFLINE-MOCK approval for deadline persistence test.');const ctx=standaloneContext('late-persist');ctx.deadlineAt=Date.now()+5;
    const runResult=await runStandaloneAnalysis('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-late-persist',ctx,async()=>{await delay(20);return payload;});
    assert.equal(runResult.status,'failed');assert.match(runResult.failed[0].error,/deadline-exceeded/);
    assert.equal(fs.existsSync(path.join(root,'.rms-stage3/snapshots/analysis-soybean.json')),false);
    assert.throws(()=>standalonePreflight('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-late-persist'),/already attempted/);
  }
  {
    const {root}=setup();let complete!:()=>void;
    approveStandaloneRun('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-first','Explicit OFFLINE-MOCK approval for concurrent job test.');const ctx=standaloneContext('first');
    const one=runStandaloneAnalysis('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-first',ctx,async()=>{await new Promise<void>(r=>complete=r);ctx.attempts=ctx.successfulCalls=1;return payload;});
    await assert.rejects(runStandaloneAnalysis('soybean','soybean-publisher-search-v1','OFFLINE-MOCK-simultaneous',standaloneContext('other'),async()=>payload),/running|attempted|lease requires review/);
    const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',
      `import {acquirePaidLease} from './src/server/paidJobLease.ts';try{acquirePaidLease('analysis-job','child');process.exit(2)}catch{process.exit(0)}`],{cwd:process.cwd(),env:{...process.env},encoding:'utf8'});
    assert.equal(child.status,0,'exclusive job lease holds across Node processes');
    complete();assert.equal((await one).status,'completed');assert.equal(standaloneStatus().runs.length,1);
    const release=acquirePaidLease('request','stale-fixture');assert.ok(hasOutstandingPaidRequest());release();
    assert.equal(fs.existsSync(path.join(root,'.rms-stage3/paid-analysis-job.lock')),false);
  }
  // Request-control contract, independent of ignored runtime receipts and cwd.
  // Keep authentic archived dates; freeze only this pure builder check, after
  // all real-clock deadline/lease tests. Source verification has separate tests.
  const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));
  const evidence:AnalysisEvidence=structuredClone(frozen.packets['palm-oil']);
  testClock.timers.enable({apis:['Date'],now:new Date(frozen.checkedAt)});
  try{
    const bounded=buildRecoveryAnalysisRequest('gemini-3.8-flash','palm-oil',evidence,frozen.checkedAt.slice(0,10),'verified-only');
    assert.deepEqual(bounded.config.tools,[]);assert.equal(bounded.config.maxOutputTokens,8192);assert.ok(bounded.contents.includes('No live Search'));
    assert.throws(()=>buildRecoveryAnalysisRequest('gemini-3.8-flash','palm-oil',{commodity:'palm-oil',facts:[],failures:['unavailable']},'2026-10-20','verified-only'),/no paid request made/);
  }finally{testClock.timers.reset();}
  console.log('PASS: installed SDK defaults; exactly one mock HTTP attempt on 429/503; deadline and caller/job/body abort; late-result discard; unknown timeout cost; per-run budget; cross-process and repeated-job locks; verified-only/no-Search profile; zero network/paid calls.');
}finally{globalThis.fetch=nativeFetch;delete process.env.RMS_STAGE3_RUNTIME_ROOT;delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;fs.rmSync(temp,{recursive:true,force:true});}
