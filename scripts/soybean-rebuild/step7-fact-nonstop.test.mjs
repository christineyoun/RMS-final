import test from 'node:test';import assert from 'node:assert/strict';
import {finishFactReview} from './step7-fact-core.ts';
import {adaptStep7ToRms} from './step7-rms-adapter.ts';
const source={id:'G103',grade:'A',title:'Industry bulletin',url:'https://example.org',date:'2026-10-31',citationUrl:null,
 excerpts:[{id:'G103-E1',topic:'market',text:'The TTSA Bangkok tapioca starch quote reached USD 705/MT in August 2026.'},{id:'G103-E2',topic:'market',text:'The 2026 Thai cassava crop forecast was revised down due to smaller planted area.'}]};
const s2={id:'G104',grade:'A',title:'Crop bulletin',url:'https://example.org/2',date:'2026-10-30',citationUrl:null,excerpts:[{id:'G104-E1',topic:'output',text:'Thai 2026 cassava output forecast lower than 2025.'}]};
const r=()=>({headline:'공급 감소와 가격 비교',marketOutlook:'태국산 7월 고점(705 USD/MT)을 기록했습니다. 작황 불확실성은 지속됩니다.',
 procurementStrategy:'태국산 오퍼를 비교하여 단기 소요량 중심의 분할 구매를 검토합니다.',
 bullishFactors:[{text:'원료 공급 우려',sourceIds:['G103']}],bearishFactors:[{text:'현물 공급 여건',sourceIds:['G104']}],monitoringFactors:[{text:'추가 출하 확인',sourceIds:['G103']}],sourceIds:['G103','G104'],uncertainties:[],
 claimEvidence:[1,2,3].map(i=>({claim:'원료 및 가격 근거 '+i,sourceIds:['G103'],excerptIds:['G103-E1'],evidenceType:'direct'}))});
const edit=(before,after,overrides={})=>({field:'marketOutlook',oldText:before,newText:after,reason:'원문과 대조',sourceIds:['G103'],excerptIds:['G103-E1'],...overrides});
const dates=edit('7월 고점(705 USD/MT)','8월 고점(705 USD/MT)');
test('real situation: July to August is NOT treated as an invented price and STEP7-2 adapter accepts it',()=>{
 const original=r();const done=finishFactReview(original,{status:'checked',issues:[dates]},[source,s2],'tapioca-starch');
 assert.equal(done.publishable,true,JSON.stringify(done));assert.equal(done.fixes.length,1);
 assert.match(done.result.marketOutlook,/8월 고점\(705 USD\/MT\)/);
 assert.equal(done.result.procurementStrategy,original.procurementStrategy);
 const preview=adaptStep7ToRms({stage:'final-market-outlook-and-procurement',status:'report-created',commodity:'tapioca-starch',recordedAt:'2026-10-31',result:done.result},[source,s2]);
 assert.equal(preview.data.purchaseActions[0],original.procurementStrategy);
 assert.match(original.marketOutlook,/7월/);
});
test('unsupported month is softened, not report-stopped; adjacent statement stays',()=>{
 const evidence=[{...source,excerpts:[{...source.excerpts[0],text:'TTSA price reached USD 705/MT at an unspecified time'}]},s2];
 const out=finishFactReview(r(),{status:'checked',issues:[dates]},evidence,'tapioca-starch');
 assert.equal(out.publishable,true,JSON.stringify(out));assert.equal(out.fixes[0].kind,'cautious-fallback');
 assert.doesNotMatch(out.result.marketOutlook,/7월 고점/);assert.doesNotMatch(out.result.marketOutlook,/8월 고점/);
 assert.match(out.result.marketOutlook,/작황 불확실성은 지속됩니다/);
});
test('invented price is conservatively corrected, other facts and strategy untouched',()=>{
 const out=finishFactReview(r(),{status:'checked',issues:[edit('7월 고점(705 USD/MT)','확인된 고점(999 USD/MT)')]},[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true,JSON.stringify(out));assert.doesNotMatch(out.result.marketOutlook,/999/);assert.match(out.result.marketOutlook,/가격/);
 assert.match(out.result.marketOutlook,/작황 불확실성은 지속됩니다/);
 assert.equal(out.result.procurementStrategy,r().procurementStrategy);
});
test('invalid source cannot invent a price, but does not stop entire report',()=>{
 const out=finishFactReview(r(),{status:'checked',issues:[edit('7월 고점(705 USD/MT)','8월 고점(905 USD/MT)',{sourceIds:['G999']})]},[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true);assert.equal(out.fixes[0].kind,'cautious-fallback');assert.doesNotMatch(out.result.marketOutlook,/905/);
});
test('reviewer unavailable: distinct review-incomplete status and original preserved',()=>{
 const original=r();const out=finishFactReview(original,null,[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true);assert.equal(out.reviewComplete,false);assert.equal(out.quality,'review-incomplete');assert.deepEqual(out.result,original);
});
test('buying price threshold warning is advisory only',()=>{
 const original=r();original.procurementStrategy='타피오카전분을 620 USD/MT 이하에서 분할 구매합니다.';
 const out=finishFactReview(original,{status:'checked',issues:[]},[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true,JSON.stringify(out));assert.equal(out.result.procurementStrategy,original.procurementStrategy);
 assert(out.warnings.some(x=>x.includes('Advisory only')));
});
test('wrong purchasing commodity is corrected to same commodity, not allowed to pass unchanged',()=>{
 const original=r();original.procurementStrategy='옥수수전분을 계약합니다.';
 const out=finishFactReview(original,{status:'checked',issues:[]},[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true,JSON.stringify(out));assert.doesNotMatch(out.result.procurementStrategy,/옥수수/);
 assert.match(out.result.procurementStrategy,/해당 품목의 원산지별/);
});
test('good and flawed edits coexist without dropping good correction',()=>{
 const original=r();const out=finishFactReview(original,{status:'checked',issues:[dates,edit('작황 불확실성','999 생산량')]},[source,s2],'tapioca-starch');
 assert.equal(out.publishable,true,JSON.stringify(out));assert.match(out.result.marketOutlook,/8월/);assert.doesNotMatch(out.result.marketOutlook,/999/);
});
