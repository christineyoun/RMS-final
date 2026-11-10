import test from 'node:test';import assert from 'node:assert/strict';
import {applyFactReview,parseReview,numerals,factReviewPrompt} from './step7-fact-core.ts';
import {adaptStep7ToRms} from './step7-rms-adapter.ts';
const commodities=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const s={id:'G001',grade:'A',title:'Official report',url:'https://publisher.org/market/report',citationUrl:null,date:'2026-10-31',
 excerpts:[{id:'G001-E1',topic:'market',text:'Oct 2026 Thailand FOB tapioca starch 680 USD/MT; 2026 volume forecast 23 million tonnes, 2025 actual 30 million tonnes.'}]};
const s2={id:'G002',grade:'A',title:'Export report',url:'https://agency.org/crops/data',citationUrl:null,date:'2026-10-25',
 excerpts:[{id:'G002-E1',topic:'outlook',text:'2026 new crop output forecast lower due to drought and lower planting area.'}]};
const sources=[s,s2];
const report=()=>({headline:'원료 수급과 가격 비교',marketOutlook:'2026년 태국 타피오카 가격은 780 USD/MT이며 공급 우려가 있습니다.',
 procurementStrategy:'태국산 오퍼를 비교하고 단기 소요량을 분할 조달합니다.',
 bullishFactors:[{text:'원료 공급 제약',sourceIds:['G002']}],bearishFactors:[{text:'수확기 공급',sourceIds:['G001']}],
 monitoringFactors:[{text:'작황 점검',sourceIds:['G001']}],sourceIds:['G001','G002'],uncertainties:[],
 claimEvidence:[1,2,3].map(i=>({claim:`기본 근거 ${i}`,sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'}))});
const edit=(field,oldText,newText,extra={})=>({field,oldText,newText,reason:'원문 가격 대조',sourceIds:['G001'],excerptIds:['G001-E1'],...extra});
for(const commodity of commodities)test(`targeted cited correction leaves market recommendation intact: ${commodity}`,()=>{
 const r=report();const review={status:'checked',issues:[edit('marketOutlook','780 USD/MT','680 USD/MT')]};
 const done=applyFactReview(r,review,sources,commodity);
 assert.equal(done.verified,true,JSON.stringify(done));assert.match(done.result.marketOutlook,/680 USD\/MT/);
 assert.equal(done.result.procurementStrategy,r.procurementStrategy);
 assert.match(r.marketOutlook,/780/);assert.equal(done.audit.reviewReasons.length,0);
});
test('zero edits retains existing report and produces eligible local card',()=>{
 const r=report();const done=applyFactReview(r,{status:'checked',issues:[]},sources,'tapioca-starch');
 assert.equal(done.verified,true);assert.deepEqual(done.result,r);
 const output=adaptStep7ToRms({stage:'final-market-outlook-and-procurement',status:'report-created',commodity:'tapioca-starch',recordedAt:'2026-10-31T11:19:50Z',result:done.result},sources);
 assert.equal(output.data.purchaseActions[0],r.procurementStrategy);assert.equal(output.data.sources.length,2);
});
test('invalid invented number from no source is blocked',()=>{
 const r=report();const x=applyFactReview(r,{status:'checked',issues:[edit('marketOutlook','780 USD/MT','999 USD/MT')]},sources,'tapioca-starch');
 assert.equal(x.verified,false);assert(x.errors.some(e=>e.includes('Unverified new numeric')));
 assert.match(x.result.marketOutlook,/780/);
});
test('unknown ID or B-only source cannot certify a correction',()=>{
 const r=report();const a=applyFactReview(r,{status:'checked',issues:[edit('marketOutlook','780 USD/MT','680 USD/MT',{sourceIds:['G999']})]},sources,'tapioca-starch');
 assert.equal(a.verified,false);
 const b=applyFactReview(r,{status:'checked',issues:[edit('marketOutlook','780 USD/MT','680 USD/MT',{sourceIds:['G003'],excerptIds:['G003-E1']})]},[...sources,{...s,id:'G003',grade:'B',excerpts:[{id:'G003-E1',text:'680 USD/MT'}]}],'tapioca-starch');
 assert.equal(b.verified,false);
});
test('no editing invisible or multiple occurrences',()=>{
 const r=report();assert.equal(applyFactReview(r,{status:'checked',issues:[edit('marketOutlook','not in report','680 USD/MT')]},sources,'tapioca-starch').verified,false);
 const twice={...r,marketOutlook:'780 USD/MT 그리고 780 USD/MT'};
 assert.equal(applyFactReview(twice,{status:'checked',issues:[edit('marketOutlook','780 USD/MT','680 USD/MT')]},sources,'tapioca-starch').verified,false);
});
test('index needed for factors, no deleting a factor item',()=>{
 const r=report();const a=applyFactReview(r,{status:'checked',issues:[edit('bullishFactors','원료 공급 제약','원료 공급 완화')]},sources,'tapioca-starch');assert.equal(a.verified,false);
 const b=applyFactReview(r,{status:'checked',issues:[edit('bullishFactors','원료 공급 제약','',{index:0})]},sources,'tapioca-starch');assert.equal(b.verified,false);
});
test('report JSON grammar, bounded array, prompt preservation',()=>{
 assert.deepEqual(parseReview('```json\n{"status":"checked","issues":[]}\n```'),{status:'checked',issues:[]});
 assert.equal(parseReview('{invalid'),null);assert.equal(parseReview(JSON.stringify({status:'checked',issues:Array(13).fill({})})),null);
 const p=factReviewPrompt('tapioca-starch',report(),sources);
 assert.match(p,/only specific demonstrably wrong/i);assert.match(p,/not to change a sound commodity market outlook/i);
 assert.match(p,/PUBLISHER EVIDENCE/);
});
test('existing procurement target and invalid claimEvidence remain rejected',()=>{
 const r=report();r.procurementStrategy='옥수수전분을 계약한다.';
 const out=applyFactReview(r,{status:'checked',issues:[]},sources,'tapioca-starch');assert.equal(out.verified,false);
 const r2=report();r2.claimEvidence[0].excerptIds=['fabricated'];
 assert.equal(applyFactReview(r2,{status:'checked',issues:[]},sources,'tapioca-starch').verified,false);
});
test('numbers with thousand separators normalize',()=>{assert(numerals('3,000만 톤').includes('3000'));});
