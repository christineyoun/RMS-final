import assert from 'node:assert/strict';
import {mock} from 'node:test';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runRefreshWorkflow} from '../../../scripts/cloud/publication.ts';
import {createFreeSourceRunner} from '../freeSourceRefresh.ts';
import {runScheduledAi} from '../scheduledAi.ts';
import {trackedGeminiGenerate,getStage3RunContext} from '../stage3Runtime.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
const policy=JSON.parse(fs.readFileSync('scripts/cloud/weekday-ai-policy.approved.json','utf8'));
const old=process.cwd(),env={...process.env},native=fetch,root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-isolation-'));
mock.timers.enable({apis:['Date'],now:new Date('2026-11-26T00:05:00Z')});
const body=(summary:string)=>({success:true,data:{executiveSummary:(summary+' 원문 근거 기반 공급 전망을 비교하고 실제 선적 조건을 확인합니다. ').repeat(8),deskRecommendation:'조건 확인 후 검토',bullishFactors:[],bearishFactors:[],watchItems:[],sources:[{title:'official source',url:'https://www.usda.gov/'}],generatedAt:new Date().toISOString(),status:'live'}});
let requests=0;
try{
 for(const freeSuccess of [true,false])for(const status of [200,402,429,503]){
  const dir=path.join(root,`${freeSuccess}-${status}`);fs.mkdirSync(path.join(dir,'.rms-stage3'),{recursive:true});process.chdir(dir);process.env.RMS_STAGE3_RUNTIME_ROOT=dir;
  fs.writeFileSync('.rms-stage3/settings.json',JSON.stringify({autoEnabled:false,freeAutoEnabled:true}));
  fs.writeFileSync('market.json',JSON.stringify({price:100}));publishScheduledContent({'analysis-wheat':body('previous')},'previous');
  const previous=readScheduledContent('analysis-wheat');
  let journal:any=null,overview=0;
  const runner=createFreeSourceRunner({now:()=>new Date(),jobs:()=>[{key:'offline-market',run:async()=>{if(!freeSuccess)throw Error('source unavailable');fs.writeFileSync('market.json',JSON.stringify({price:200}));return {publication:{price:200},observationDate:'2026-11-26'};}}],publish:async()=>({saved:true})});
  globalThis.fetch=async()=>{requests++;return Response.json(status===200?{}:{error:{code:status,status:status===429?'RESOURCE_EXHAUSTED':'FAILED_PRECONDITION',message:'billing or quota unavailable'}},{status});};
  const metered=()=>trackedGeminiGenerate({model:getStage3RunContext()!.analysisModel,contents:'offline',config:{}},async p=>{const r=await p.config.httpOptions.fetch('https://generativelanguage.googleapis.com/offline',{method:'POST'});if(!r.ok)throw Object.assign(Error('provider rejected'),{status:r.status});return {usageMetadata:{promptTokenCount:100,candidatesTokenCount:100}};});
  const result=await runRefreshWorkflow(policy,{read:async()=>journal,save:async j=>{journal=structuredClone(j);}},{runner,priorNews:{},runAi:async(p,s,o)=>runScheduledAi(p,s,{...o,news:async()=>{await metered();return [];},analysis:async()=>{await metered();return body('new accepted');}}),publishOverview:async()=>{overview++;return {saved:true} as any;}});
  assert.equal(JSON.parse(fs.readFileSync('market.json','utf8')).price,freeSuccess?200:100);
  assert.equal(result?.sourceError,!freeSuccess);assert.equal(overview,1);
  if(status===200)assert.notDeepEqual(readScheduledContent('analysis-wheat'),previous);
  else {assert.deepEqual(readScheduledContent('analysis-wheat'),previous);assert(journal.phases['analysis-wheat'].status==='retained-previous');}
  if(status===429)assert(fs.readFileSync('.rms-stage3/paid-requests.jsonl','utf8').includes('RESOURCE_EXHAUSTED'));
 }
 // Whole AI subsystem failure (e.g. journal outage) cannot stop free publication.
 const result=await runRefreshWorkflow(policy,undefined,{runner:{check:async()=>({day:'2026-11-26',status:'completed'}),retryFailed:async()=>null},priorNews:{},runAi:async()=>{throw Error('journal unavailable');},publishOverview:async()=>({saved:true} as any)});
 assert.equal(result?.sourceError,false);assert.equal(result?.aiError,true);
 // A source runner exception still permits accepted AI and overview publication.
 let attempted=false;
 await runRefreshWorkflow(policy,undefined,{runner:{check:async()=>{throw Error('source subsystem unavailable');},retryFailed:async()=>null},priorNews:{},runAi:async()=>{attempted=true;return {accepted:[],attempts:0,budget:{}} as any;},publishOverview:async()=>({saved:true} as any)});assert(attempted);
 assert(requests<=128,'One HTTP attempt per phase; no uncontrolled retries');
 console.log('PASS actual free runner + metered AI: independent success/failure matrix, 402/429/503 retention, journal/source exceptions, aggregation and bounded transport. No live calls.');
}finally{process.chdir(old);process.env=env;globalThis.fetch=native;mock.timers.reset();fs.rmSync(root,{recursive:true,force:true});}
