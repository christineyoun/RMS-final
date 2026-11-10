import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkProcurementScope} from './step7-scope.ts';
import {auditFinalResult,buildFinalPrompt,type FinalResult} from './step7-core.ts';

const fakeData={
 commodity:'soybean',date:'2026-10-31',route:'stop-after-round1',
 sources:[
 {id:'G001',grade:'A',title:'Original crop data',url:'https://example.org/one',citationUrl:null,date:null,
  excerpts:[{id:'G001-E1',topic:'supply',text:'Production is forecast higher'}]},
 {id:'G100',grade:'A',title:'Original trade data',url:'https://example.org/two',citationUrl:null,date:null,
  excerpts:[{id:'G100-E1',topic:'trade',text:'Exports were strong'}]},
 ],counts:{sources:2,A:2,B:0,EXCLUDED:0,excerpts:2},decision:'stop',priorFindings:[],
} as any;
const clean:FinalResult={
 headline:'공급 압력 속 대두 분할 구매',
 marketOutlook:'대두 공급은 증가할 전망이며 대두유 가공 수요는 대두 가격을 지지할 수 있습니다.',
 procurementStrategy:'대두는 실제 공급사 오퍼와 도입 납기를 비교한 뒤 실수요분부터 분할 계약합니다.',
 bullishFactors:[{text:'수출 수요 증가',sourceIds:['G100']}],
 bearishFactors:[{text:'생산 확대 전망',sourceIds:['G001']}],
 monitoringFactors:[{text:'대두유 가공 마진 변화',sourceIds:['G100']}],
 sourceIds:['G001','G100'],uncertainties:['생산량 전망 변동 가능'],
 claimEvidence:[
  {claim:'생산 확대 전망',sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'},
  {claim:'수출 수요 증가',sourceIds:['G100'],excerptIds:['G100-E1'],evidenceType:'direct'},
  {claim:'상대적으로 안정적',sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'inference'},
 ],
};

test('shared prompt explicitly restricts purchasing to the active commodity',()=>{
 const inst=buildFinalPrompt(fakeData).split('EVIDENCE DATA')[0];
 assert.match(inst,/The ONLY item for which you may advise buying/);
 assert.match(inst,/NEVER recommend purchasing or signing contracts for a different item/);
 assert.match(inst,/Commodity: soybean/);
 assert.doesNotMatch(inst,/CBOT|Brazil|Chinese buyer|soybean meal|WASDE/i);
});
test('current Oct 31 soybean report cross-commodity contract recommendation is flagged',()=>{
 const text='미·중 합의로 관세 인하 대상에 포함된 대두박·대두유 등 가공 부산물은 제품 마진을 활용해 선도 계약 비중 확대를 검토하되, 원물 대두는 브라질 기상 전개 및 헤알화 환율 추이를 확인하며 계약 시점을 분산 집행한다.';
 const flags=checkProcurementScope(text,'soybean');
 assert.ok(flags.some(x=>x.relatedCommodity==='soybean-oil'),JSON.stringify(flags));
 assert.ok(flags.some(x=>x.action.includes('계약')));
 const report=structuredClone(clean);report.procurementStrategy=text;
 const audit=auditFinalResult(report,fakeData);
 assert.ok(audit.reviewReasons.some(x=>x.includes('cross-commodity-procurement')));
 assert.equal(report.procurementStrategy,text,'evidence must be preserved');
});
test('related item may appear as a market driver in outlook and monitoring without a buy recommendation',()=>{
 assert.deepEqual(checkProcurementScope('대두유 가격 상승으로 대두 실수요 물량은 분할 계약하고 대두박 가공 수요를 모니터링합니다.','soybean'),[]);
 assert.deepEqual(auditFinalResult(clean,fakeData).reviewReasons,[]);
});
test('different commodity procurement flags detect no hardcoded soybean rule',()=>{
 assert.ok(checkProcurementScope('소맥전분은 신규 공급사와 계약하고 감자전분은 리드타임을 확인합니다.','potato-starch').length);
 assert.ok(checkProcurementScope('옥수수전분을 구매하고 옥수수 원곡은 상황을 지켜봅니다.','corn').length);
 assert.ok(checkProcurementScope('대두를 비축하고 대두유는 조달조건을 비교합니다.','soybean-oil').length);
});
test('target-specific purchase is allowed in all 8 RMS commodity identifiers',()=>{
 const examples:Record<string,string>={
  'wheat':'소맥 계약 물량을 납기에 맞춰 분산합니다.',
  'corn':'옥수수 실수요를 분할 발주합니다.',
  'soybean':'대두를 공급사별로 분할 매수합니다.',
  'soybean-oil':'대두유 공급 물량을 확보합니다.',
  'palm-oil':'팜유 계약 일정을 검토합니다.',
  'sugar':'설탕 도입 물량을 분할 구매합니다.',
  'potato-starch':'감자전분을 복수 공급사에서 확보합니다.',
  'tapioca-starch':'타피오카전분의 선적을 확인하고 발주합니다.',
 };
 for(const [id,txt] of Object.entries(examples))
  assert.deepEqual(checkProcurementScope(txt,id),[],id);
});
test('buying both target and a related commodity together is not overlooked',()=>{
 const flags=checkProcurementScope('대두유와 대두를 함께 구매합니다.','soybean');
 assert.ok(flags.some(x=>x.relatedCommodity==='soybean-oil'),JSON.stringify(flags));
});
test('"대두유 구매수요" is a market driver rather than procurement advice',()=>{
 assert.deepEqual(checkProcurementScope('대두유 구매수요 증가에 따라 대두 계약 시점을 분산합니다.','soybean'),[]);
});
test('new source of evidence: forecast record stated as achieved output merits review',()=>{
 const data=structuredClone(clean);
 data.marketOutlook='미국 2026/27년도 대두 생산량이 45억 6,200만 부셸로 사상 최고치를 경신했으며 공급 압력이 커지고 있습니다.';
 const result=auditFinalResult(data,fakeData);
 assert.ok(result.forecastFinalityFlags.some(x=>x.includes('achieved record')),JSON.stringify(result));
});
test('do not flag a properly qualified record production forecast',()=>{
 const data=structuredClone(clean);
 data.marketOutlook='미국 대두 생산량이 사상 최고치를 경신할 전망이지만 최종 생산 실적은 아직 확정되지 않았습니다.';
 assert.deepEqual(auditFinalResult(data,fakeData).forecastFinalityFlags,[]);
});
test('no silent deletion and no automatic report rejection without actionable outside purchase',()=>{
 const s='대두박 가격과 대두유 마진을 참고해 대두의 현물 구매 시점을 분산합니다.';
 assert.deepEqual(checkProcurementScope(s,'soybean'),[]);
});
