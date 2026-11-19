import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPalmHistory,lastConvertedSettlement,previousWeekday} from '../../../scripts/cloud/palmPriceCatchup.ts';
import {PUBLIC_TIMEFRAMES} from '../publicDeploymentRoutes.mjs';

test('later FCPO catch-up targets the prior weekday across a weekend',()=>{
 assert.equal(previousWeekday('2026-11-23'),'2026-11-20');
 assert.equal(previousWeekday('2026-11-19'),'2026-11-18');
});

const settlement={date:'2026-11-18',cpoUsd:1065.60,cpoPriceType:'exchange-settlement',cpoContractMonth:'2027-02',cpoFxStatus:'dated'};
test('catch-up requires both verified settlement identity and a dated FX value',()=>{
 assert.equal(lastConvertedSettlement([settlement]),settlement.date);
 assert.equal(lastConvertedSettlement([{...settlement,cpoFxStatus:'legacy-fixed-estimate'}]),null);
 assert.equal(lastConvertedSettlement([{...settlement,cpoUsd:null}]),null);
 assert.equal(lastConvertedSettlement([{...settlement,cpoContractMonth:null}]),null);
});

test('late price changes preserve all daily AI, news, other prices, and publication timestamps',()=>{
 const history=Object.fromEntries(PUBLIC_TIMEFRAMES.map(t=>[t,{data:[settlement]}]));
 const responses=Object.fromEntries(PUBLIC_TIMEFRAMES.map(t=>['/api/history?commodity=palm-oil&timeframe='+t,{status:200,payload:{data:[]}}]));
 const orig={version:1 as const,revision:'morning',publishedAt:'2026-11-19T00:38:19Z',responses:{
  ...responses,'/api/ai-analysis/palm-oil':{status:200,payload:{report:'retained'}},
  '/api/market-intelligence?commodity=palm-oil':{status:200,payload:{articles:['retained']}},
  '/api/rms/free-publication':{status:200,payload:{data:{prices:{'palm-oil':{},wheat:{same:true}},overview:{same:true}}}}
 }};
 const before=structuredClone(orig);
 const next=applyPalmHistory(orig,history);
 assert.deepEqual(orig,before);
 assert.equal(next.publishedAt,orig.publishedAt);
 assert.equal(next.revision,orig.revision);
 assert.equal(next.responses['/api/ai-analysis/palm-oil'],orig.responses['/api/ai-analysis/palm-oil']);
 assert.equal(next.responses['/api/market-intelligence?commodity=palm-oil'],orig.responses['/api/market-intelligence?commodity=palm-oil']);
 assert.deepEqual(next.responses['/api/rms/free-publication'].payload.data,
  {prices:{'palm-oil':history['5Y'],wheat:{same:true}},overview:{same:true}});
 assert.throws(()=>applyPalmHistory(orig,{}),/Missing saved Palm Oil history/);
});
