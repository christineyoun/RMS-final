import {mock} from 'node:test';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runScheduledAi,validateScheduledPolicy,policyHash,type ScheduledAiPolicy,type DailyAiJournal} from '../scheduledAi.ts';
import {trackedGeminiGenerate,getStage3RunContext} from '../stage3Runtime.ts';
import {readScheduledContent,publishScheduledContent,acceptedScheduledNews} from '../scheduledContent.ts';
import {createStage3Gateway} from '../stage3DailyUpdates.ts';
import {parseAdditionalFeed} from '../additionalNewsDiscovery.ts';
mock.timers.enable({apis:['Date'],now:new Date('2026-10-26T00:05:00Z')});
const old=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-scheduled-fixture-'));const originalFetch=globalThis.fetch;
const policy:ScheduledAiPolicy={version:'weekday-ai-prepaid-v3',enabled:true,approvalId:'OFFLINE-TEST-APPROVAL',newsModel:'gemini-3.1-flash-lite',analysisModel:'gemini-3.8-flash',monthlyOperatingBudgetKrw:100000,funding:'manual-prepaid',automaticTopUp:false,automaticPayment:false,fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20};
fs.mkdirSync(path.join(root,'src/data'),{recursive:true});fs.mkdirSync(path.join(root,'.rms-stage3'),{recursive:true});fs.writeFileSync(path.join(root,'.rms-stage3/free-fx.json'),JSON.stringify({raw:{base:'USD',date:'2026-10-23',rates:{KRW:1324.45,EUR:0.9}},verifiedAt:'2026-10-26T00:00:00Z'}));fs.copyFileSync('src/data/news_procurement_reviews.json',path.join(root,'src/data/news_procurement_reviews.json'));
const saved=JSON.parse(fs.readFileSync('src/data/corn_news_verified.json','utf8')).articles[0];
const article={...saved,verifiedSourceEvidence:{originalUrl:saved.originalUrl,publishedAt:saved.publishedAt,sourceHeadline:saved.sourceHeadline,excerpt:'OFFLINE-MOCK corn export market. '+saved.summary,verifiedAt:new Date().toISOString()}};
let journal:DailyAiJournal|null=null,transports=0,fixturePrompt='';const store={read:async()=>structuredClone(journal),save:async(j:DailyAiJournal)=>{journal=structuredClone(j);}};
const metered=()=>trackedGeminiGenerate({model:getStage3RunContext()!.analysisModel,contents:fixturePrompt,config:{}},async p=>{
 const r=await p.config.httpOptions.fetch('https://generativelanguage.googleapis.com/offline-fixture',{method:'POST'});assert(r.ok);return {usageMetadata:{promptTokenCount:100,candidatesTokenCount:100}};
});
const body=(id:string)=>({success:true,data:{executiveSummary:('OFFLINE approved fixture '+id+' 원문 근거 기반 공급 전망을 비교하고 실제 선적 조건을 확인합니다. ').repeat(6),deskRecommendation:'OFFLINE 조건 확인 후 검토',bullishFactors:[],bearishFactors:[],watchItems:[],sources:[{title:'OFFLINE official source',url:'https://www.usda.gov/'}],generatedAt:new Date().toISOString(),status:'live'}});
try{
 process.chdir(root);process.env.RMS_STAGE3_RUNTIME_ROOT=root;
 globalThis.fetch=async()=>{assert(journal!.requests.length>transports,'Durable reservation must precede every transport');transports++;return Response.json({});};
 assert.throws(()=>validateScheduledPolicy({...policy,enabled:false}),/disabled/);
 const result=await runScheduledAi(policy,store,{root,priorNews:{corn:[{...article,originalUrl:'https://example.org/offline-prior',publishedAt:'2026-10-01',title:'옥수수 선적 여건과 수출 수요 점검'}]},news:async id=>{await metered();return id==='corn'?[article]:[];},analysis:async id=>{if(id==='corn')assert(readScheduledContent('news-corn',root),'accepted news is published before later AI rejection');await metered();if(id==='sugar'||id==='corn')throw Error('OFFLINE response rejection');return body(id);}});
 assert.equal(transports,16);assert(result.accepted.includes('news-corn'));assert(!result.accepted.includes('analysis-sugar'));
 assert(readScheduledContent('analysis-wheat',root));assert(readScheduledContent('news-corn',root));assert.equal(readScheduledContent('analysis-corn',root),null,'rejected AI does not roll back independently accepted news or require four new stories');
 assert.equal(readScheduledContent('analysis-sugar',root),null,'failed output does not become accepted');
 const before=transports;await runScheduledAi(policy,store,{root,news:async()=>{throw Error('must not run again');},analysis:async()=>{throw Error('must not run again');}});assert.equal(transports,before);
 assert.equal(acceptedScheduledNews('corn',[{...article,linkStatus:'unverified'}]).length,0);
 assert.throws(()=>publishScheduledContent({'analysis-wheat':{success:false}},'bad',root));assert(readScheduledContent('analysis-wheat',root));
 // A cold reader uses the accepted manifest, rather than the old source-specific cards.
 const gateway=createStage3Gateway();let response:any;
 gateway({url:'/api/market-intelligence?commodity=corn',method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}} as any,{setHeader(){},end(v:string){response=JSON.parse(v);}} as any,()=>{});
 assert.equal(response.articles[0].originalUrl,article.originalUrl);
 // Existing successful analysis survives provider and validation failures byte-for-byte.
 const previous=fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8');
 const priorAnalysis=readScheduledContent('analysis-wheat',root);
 for(const failure of ['billing','quota','429','503','timeout','authentication','malformed','outage']){
  journal=null;
  await runScheduledAi(policy,store,{root,news:async()=>{throw Error(failure);},analysis:async()=>{await metered();throw Error(failure);}});
  assert.deepEqual(readScheduledContent('analysis-wheat',root),priorAnalysis);
  assert.equal(fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'),'utf8'),previous);
 }
 for(const invalid of [null,{}, {success:false}, {success:true,data:{...body('wheat').data,executiveSummary:''}}]){
  journal=null;await runScheduledAi(policy,store,{root,news:async()=>[],analysis:async()=>{await metered();return invalid;}});
  assert.deepEqual(readScheduledContent('analysis-wheat',root),priorAnalysis,'invalid response retains the actual previous snapshot');
 }
 // A ledger already beyond both former limits still permits all pending phases.
 journal={version:2,budget:{fxDate:null,verifiedUsdKrw:null,fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20,safetyKrwPerUsd:null},day:'2026-10-26',policyHash:policyHash(policy),requests:Array.from({length:25},(_,i)=>({phase:'historical-'+i,attempt:1,model:policy.newsModel,reservedUsd:10,reservedKrw:18000})),phases:{}};
 transports=0;fixturePrompt='x'.repeat(100000);
 const unbounded=await runScheduledAi(policy,store,{root,news:async()=>{await metered();return [];},analysis:async id=>{await metered();return body(id);}});
 assert.equal(transports,16);assert.equal(unbounded.attempts,41);assert(unbounded.estimatedKrw!>5000);fixturePrompt='';
 // Recover on the next scheduled weekday after the old expiry, even with stale FX.
 const beforeOutage=readScheduledContent('analysis-wheat',root);
 mock.timers.setTime(new Date('2026-11-26T00:05:00Z').getTime());journal=null;transports=0;
 await runScheduledAi(policy,store,{root,news:async()=>{await metered();throw Error('insufficient balance');},analysis:async()=>{await metered();throw Error('temporary quota failure');}});
 assert.deepEqual(readScheduledContent('analysis-wheat',root),beforeOutage);
 mock.timers.setTime(new Date('2026-11-27T00:05:00Z').getTime());journal=null;transports=0;
 const recovered=await runScheduledAi(policy,store,{root,news:async()=>{await metered();return [];},analysis:async id=>{await metered();return body(id);}});
 assert.equal(recovered.analysisResults.find(r=>r.commodity==='wheat')?.status,'Unchanged');assert.equal(transports,16);assert.equal(recovered.budget.safetyKrwPerUsd,null);
 assert.equal(readScheduledContent('analysis-wheat',root)?.payload.data.generatedAt,beforeOutage.payload.data.generatedAt,'identical prose and evidence retain their original generation date');
 // Final publication failure is distinct from generation/validation success.
 const stableManifest=fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json'));
 journal=null;transports=0;
 await assert.rejects(runScheduledAi(policy,store,{root,news:async()=>{await metered();return [];},analysis:async id=>{await metered();const p=body(id);p.data.executiveSummary+=' A separately validated offline revision.';return p;},commit:()=>{throw Error('OFFLINE publication storage failure');}}),(error:any)=>{
  assert.equal(error.code,'scheduled-content-publication-failed');assert.equal(error.analysisResults.length,8);
  const row=error.analysisResults.find((r:any)=>r.commodity==='wheat');assert.equal(row.generationSucceeded,true);assert.equal(row.validationSucceeded,true);assert.equal(row.publicationSucceeded,false);assert.equal(row.status,'Retained previous report');return true;
 });
 assert.deepEqual(fs.readFileSync(path.join(root,'.rms-stage3/scheduled-content-current.json')),stableManifest);
 mock.timers.setTime(new Date('2026-10-26T00:05:00Z').getTime());
 const feed='<rss><item><title>Cassava starch export demand changes</title><link>https://commodity-board.com/cassava-starch-export-demand-changes</link><pubDate>2026-10-23</pubDate></item></rss>';
 assert.equal(parseAdditionalFeed(feed,'tapioca-starch',{url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',sourceType:'news'}).length,1);
 assert.equal(parseAdditionalFeed(feed,'sugar',{url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',sourceType:'news'}).length,0);
 console.log('PASS offline paid workflow: 8 commodity phases, metering before transport, shared accepted news reader, atomic manifest, rejected-output retention, daily replay, removed daily call/spend gates, post-expiry recovery and bounded crop-specific discovery. Real provider calls: 0.');
}finally{globalThis.fetch=originalFetch;process.chdir(old);delete process.env.RMS_STAGE3_RUNTIME_ROOT;mock.timers.reset();}
