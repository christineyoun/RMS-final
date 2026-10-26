import {mock} from 'node:test';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runScheduledAi,validateScheduledPolicy,policyHash,type ScheduledAiPolicy,type DailyAiJournal} from '../scheduledAi.ts';
import {trackedGeminiGenerate,getStage3RunContext} from '../stage3Runtime.ts';
import {readScheduledContent,publishScheduledContent,acceptedScheduledNews} from '../scheduledContent.ts';
import {createStage3Gateway} from '../stage3DailyUpdates.ts';
import {parseAdditionalFeed} from '../additionalNewsDiscovery.ts';
mock.timers.enable({apis:['Date'],now:new Date('2026-10-26T00:05:00Z')});
const old=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-scheduled-fixture-'));const originalFetch=globalThis.fetch;
const policy:ScheduledAiPolicy={version:'weekday-ai-krw-v2',enabled:true,approvalId:'OFFLINE-TEST-APPROVAL',validFrom:'2026-10-01',validThrough:'2026-11-30',newsModel:'gemini-3.1-flash-lite',analysisModel:'gemini-3.8-flash',maxDailyCalls:24,maxDailyEstimatedKrw:5000,fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20};
fs.mkdirSync(path.join(root,'src/data'),{recursive:true});fs.mkdirSync(path.join(root,'.rms-stage3'),{recursive:true});fs.writeFileSync(path.join(root,'.rms-stage3/free-fx.json'),JSON.stringify({raw:{base:'USD',date:'2026-10-23',rates:{KRW:1324.45,EUR:0.9}},verifiedAt:'2026-10-26T00:00:00Z'}));fs.copyFileSync('src/data/news_procurement_reviews.json',path.join(root,'src/data/news_procurement_reviews.json'));
const saved=JSON.parse(fs.readFileSync('src/data/corn_news_verified.json','utf8')).articles[0];
const article={...saved,verifiedSourceEvidence:{originalUrl:saved.originalUrl,publishedAt:saved.publishedAt,sourceHeadline:saved.sourceHeadline,excerpt:'OFFLINE independently checked source excerpt. '.repeat(8),verifiedAt:new Date().toISOString()}};
let journal:DailyAiJournal|null=null,transports=0,fixturePrompt='';const store={read:async()=>structuredClone(journal),save:async(j:DailyAiJournal)=>{journal=structuredClone(j);}};
const metered=()=>trackedGeminiGenerate({model:getStage3RunContext()!.analysisModel,contents:fixturePrompt,config:{}},async p=>{
 const r=await p.config.httpOptions.fetch('https://generativelanguage.googleapis.com/offline-fixture',{method:'POST'});assert(r.ok);return {usageMetadata:{promptTokenCount:100,candidatesTokenCount:100}};
});
const body=(id:string)=>({success:true,data:{executiveSummary:('OFFLINE approved fixture '+id+' 원문 근거 기반 공급 전망을 비교하고 실제 선적 조건을 확인합니다. ').repeat(6),deskRecommendation:'OFFLINE 조건 확인 후 검토',bullishFactors:[],bearishFactors:[],watchItems:[],sources:[{title:'OFFLINE official source',url:'https://www.usda.gov/'}],generatedAt:new Date().toISOString(),status:'live'}});
try{
 process.chdir(root);process.env.RMS_STAGE3_RUNTIME_ROOT=root;
 globalThis.fetch=async()=>{assert(journal!.requests.length>transports,'Durable reservation must precede every transport');transports++;return Response.json({});};
 assert.throws(()=>validateScheduledPolicy({...policy,enabled:false}),/disabled/);
 const result=await runScheduledAi(policy,store,{root,news:async id=>{await metered();return id==='corn'?[article]:[];},analysis:async id=>{await metered();if(id==='sugar')throw Error('OFFLINE response rejection');return body(id);}});
 assert.equal(transports,16);assert(result.accepted.includes('news-corn'));assert(!result.accepted.includes('analysis-sugar'));
 assert(readScheduledContent('analysis-wheat',root));assert(readScheduledContent('news-corn',root));
 assert.equal(readScheduledContent('analysis-sugar',root),null,'failed output does not become accepted');
 const before=transports;await runScheduledAi(policy,store,{root,news:async()=>{throw Error('must not run again');},analysis:async()=>{throw Error('must not run again');}});assert.equal(transports,before);
 assert.equal(acceptedScheduledNews('corn',[{...article,linkStatus:'unverified'}]).length,0);
 assert.throws(()=>publishScheduledContent({'analysis-wheat':{success:false}},'bad',root));assert(readScheduledContent('analysis-wheat',root));
 // A cold reader uses the accepted manifest, rather than the old source-specific cards.
 const gateway=createStage3Gateway();let response:any;
 gateway({url:'/api/market-intelligence?commodity=corn',method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}} as any,{setHeader(){},end(v:string){response=JSON.parse(v);}} as any,()=>{});
 assert.equal(response.articles[0].originalUrl,article.originalUrl);
 const low={...policy,maxDailyCalls:1,maxDailyEstimatedKrw:500};journal=null;transports=0;
 await runScheduledAi(low,store,{root,news:async()=>{await metered();return [];},analysis:async()=>{await metered();return body('wheat');}});assert.equal(transports,1);
 const replay=structuredClone(journal);assert.equal(replay!.requests.length,1);assert.equal(replay!.policyHash,policyHash(low));
 journal=null;transports=0;await runScheduledAi({...policy,maxDailyEstimatedKrw:50},store,{root,news:async()=>{await metered();return [];},analysis:async()=>{await metered();return body('wheat');}});assert.equal(transports,0,'Estimated budget rejection happens before transport');
 journal={version:2,budget:{maxDailyEstimatedKrw:5000,fxDate:'2026-10-23',verifiedUsdKrw:1324.45,fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20,safetyKrwPerUsd:1800,maxEstimatedUsd:2.77},day:'2026-10-26',policyHash:policyHash(policy),requests:[{phase:'news-wheat',attempt:1,model:policy.newsModel,reservedUsd:0.05}],phases:{'news-wheat':{status:'started'}},accepted:{'analysis-corn':body('corn')}};
 let committed:any;await runScheduledAi({...policy},store,{root,news:async()=>[],analysis:async()=>body('corn'),commit:u=>{committed=u;}});assert(committed['analysis-corn'],'Accepted checkpoint survives publication retry without another request');
 journal=null;transports=0;fixturePrompt='x'.repeat(100000);const bounded=await runScheduledAi(policy,store,{root,news:async()=>{await metered();return [];},analysis:async()=>{await metered();return body('corn');}});assert(transports>0&&transports<24,'Budget must stop before the secondary call ceiling');assert(bounded.estimatedKrw<=5000);assert.equal(bounded.budget.maxEstimatedUsd,2.77);fixturePrompt='';
 const feed='<rss><item><title>Cassava starch export demand changes</title><link>https://commodity-board.com/cassava-starch-export-demand-changes</link><pubDate>2026-10-23</pubDate></item></rss>';
 assert.equal(parseAdditionalFeed(feed,'tapioca-starch',{url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',sourceType:'news'}).length,1);
 assert.equal(parseAdditionalFeed(feed,'sugar',{url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',sourceType:'news'}).length,0);
 console.log('PASS offline paid workflow: 8 commodity phases, metering before transport, shared accepted news reader, atomic manifest, rejected-output retention, daily replay/call/spend limits and bounded crop-specific discovery. Real provider calls: 0.');
}finally{globalThis.fetch=originalFetch;process.chdir(old);delete process.env.RMS_STAGE3_RUNTIME_ROOT;mock.timers.reset();}
