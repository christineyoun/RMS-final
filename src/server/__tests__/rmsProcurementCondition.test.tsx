/** OFFLINE replay only; no production promotion or new owner approval. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {RMS_PROCUREMENT_POLICY,RMS_PROCUREMENT_CONDITION} from '../../utils/rmsProcurementCondition.ts';
import {parsePublisherResearchResponse} from '../liveAiAnalysisService.ts';
import {publisherResearchIntegrityIssues} from '../cornAiQuality.ts';
import {wheatAiIntegrityIssues} from '../wheatAiQuality.ts';
import {persistAnalysisSnapshot} from '../analysisSnapshotPersistence.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from '../stage3Runtime.ts';

const p='.rms-stage3/diagnostics/standalone-soybean-a874e58ab620-1-soybean.json';
const protectedFiles=[p,'.rms-stage3/standalone-analysis.json','.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/settings.json',...fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n)];
const hashes=()=>protectedFiles.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'));const before=hashes();
const diagnostic=JSON.parse(fs.readFileSync(p,'utf8')),report=JSON.parse(diagnostic.response.text);
// Exact destinations independently resolved from the original seven provider
// URLs during this review. No URL is guessed from a title or model prose.
const destinations=[
 'https://biomassmagazine.com/articles/usda-october-wasde-maintains-forecast-for-2026-27-soybean-oil-use-in-biofuel',
 'https://www.global-agriculture.com/global-agriculture/usda-reports-record-soybean-yield-bigger-corn-crop-in-october-forecast/',
 'https://www.agrolatam.com/usa/news/chicago-grain-futures-close-lower-as-harvest-pressure-hits-corn-soybeans-and-wheat/',
 'https://commodity-board.com/soybeans-hold-firm-as-futures-edge-higher-and-by-products-stabilize',
 'https://www.fas.usda.gov/data/commodities/soybeans',
 'https://tradingeconomics.com/commodity/soybeans',
 'https://gfo.ca/market-trends/market-trends-report-october-november-2024/',
];
const chunks=diagnostic.response.candidates[0].groundingMetadata.groundingChunks;
const redirects=new Map<string,string>(chunks.map((c:any,i:number)=>[c.web.uri,destinations[i]]));const sources=destinations.slice(0,6).map((url,i)=>({url,title:chunks[i].web.title}));
const native=globalThis.fetch;let network=0;
globalThis.fetch=async(url:any)=>{network++;assert(redirects.has(String(url)),'Only retained grounding redirects may be mocked');return new Response(null,{status:302,headers:{location:redirects.get(String(url))!}});};
try {
 assert.deepEqual(publisherResearchIntegrityIssues(report,sources,'soybean'),['missing-buying-condition:supplier-quote']);
 const accepted=await parsePublisherResearchResponse(diagnostic.response,'soybean','gemini-3.8-flash');
 assert.equal(accepted.procurementConditionPolicy,RMS_PROCUREMENT_POLICY);
 for(const key of ['deskRecommendation','executiveSummary','bullishFactors','bearishFactors','watchItems'])assert.deepEqual((accepted as any)[key],report[key]);
 assert(!JSON.stringify(accepted).includes(RMS_PROCUREMENT_CONDITION),'Policy must not be appended to model prose');
 const html=renderToStaticMarkup(<AiRecommendation commodityId="soybean" researchStatus="cached" recommendedCoverage={accepted.deskRecommendation} executiveSummary={accepted.executiveSummary} bullishFactors={accepted.bullishFactors} bearishFactors={accepted.bearishFactors} watchItems={accepted.watchItems} researchSources={accepted.sources}/>);
 assert(!html.includes(RMS_PROCUREMENT_CONDITION));assert(!html.includes('RMS 구매 조건:'));assert(!html.includes('data-rms-procurement-condition'));
 // This is a mechanical acceptance replay, NOT a source-review approval.
 // The genuine eighth response is deliberately not persisted, even to temp.
 for(const deskRecommendation of ['견적 비교는 필요 없습니다. 즉시 전량 구매하세요.','현물 베이시스를 확인 없이 구매하세요.','수입 단가 하락을 보장합니다.','무조건 매수하세요.','전량 구매 확정'])
   assert(publisherResearchIntegrityIssues({...report,deskRecommendation},sources,'soybean',RMS_PROCUREMENT_POLICY).some(i=>i.startsWith('procurement-policy-contradiction')));
 assert.deepEqual(publisherResearchIntegrityIssues({...report,deskRecommendation:'공급사 견적 확인을 생략하지 마세요. 분할 매수를 검토합니다.'},sources,'soybean',RMS_PROCUREMENT_POLICY),[]);
 for(const bad of [
   {...report,executiveSummary:report.executiveSummary+' 미국의 마토그로소 지역입니다.'},
   {...report,executiveSummary:report.executiveSummary+' CBOT ZS=F 대두 선물은 US¢/lb 기준입니다.'},
 ])assert(publisherResearchIntegrityIssues(bad,sources,'soybean',RMS_PROCUREMENT_POLICY).length>0);
 assert(publisherResearchIntegrityIssues(report,[],'soybean',RMS_PROCUREMENT_POLICY).includes('at-least-two-independent-direct-publisher-links-required'));
 await assert.rejects(parsePublisherResearchResponse({text:diagnostic.response.text,candidates:[]},'soybean','OFFLINE'),/근거 링크/);
 const wheat=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-wheat.json','utf8')).payload.data;
 assert(!wheatAiIntegrityIssues({...wheat,deskRecommendation:'분할 매수를 검토합니다.'},wheat.sources,new Date('2026-10-21'),RMS_PROCUREMENT_POLICY).some(i=>i.startsWith('purchase-conditions-missing')));
 assert(wheatAiIntegrityIssues({...wheat,deskRecommendation:'실제 공급사 견적 비교는 필요 없습니다.'},wheat.sources,new Date('2026-10-21'),RMS_PROCUREMENT_POLICY).some(i=>i.startsWith('procurement-policy-contradiction')));
 for(const id of ['wheat','corn','tapioca-starch']){
   const saved=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-'+id+'.json','utf8')).payload.data;
   const h=renderToStaticMarkup(<AiRecommendation commodityId={id} researchStatus="cached" recommendedCoverage={saved.deskRecommendation} executiveSummary={saved.executiveSummary} researchSources={saved.sources}/>);
   assert(!h.includes(RMS_PROCUREMENT_CONDITION));assert(!h.includes('Gemini AI'));
 }
 // Separately labeled mock, using the existing exclusive persistence helper.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-procurement-OFFLINE-MOCK-'));
 const mock={...accepted,model:'OFFLINE-MOCK-NOT-GEMINI',executiveSummary:'OFFLINE-MOCK: 검증된 자료만을 검토하는 구매 데스크 테스트입니다. '.repeat(8),deskRecommendation:'OFFLINE-MOCK: 단기 소요 물량의 분할 구매를 검토합니다.'};
 const ctx:Stage3RunContext={runId:'OFFLINE-MOCK-policy',permitted:true,attempts:0,successfulCalls:0,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:.25,abortController:new AbortController(),deadlineAt:Date.now()+10000};
 withAuthorizedStage3Run(ctx,()=>persistAnalysisSnapshot(root,'soybean',ctx.runId,{success:true,data:mock}));
 assert.throws(()=>withAuthorizedStage3Run(ctx,()=>persistAnalysisSnapshot(root,'soybean',ctx.runId,{success:true,data:mock})),/EEXIST/);
 assert.deepEqual(hashes(),before);
 fs.writeFileSync(root+'/replay-result.json',JSON.stringify({originalMechanicalAcceptance:true,independentFactualReview:'separate; no promotion approval',genuineResponsePersisted:false,productionChanges:false,policy:RMS_PROCUREMENT_POLICY,mockedRedirectRequests:network},null,2));
 console.log('PASS separate RMS policy, exact eighth mechanical replay, unsafe/source/unit/geography rejection, isolated mock persistence and shared rendering. '+root);
} finally {globalThis.fetch=native;}
