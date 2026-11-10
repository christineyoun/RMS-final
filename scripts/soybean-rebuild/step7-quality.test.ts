import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditFinalResult,buildFinalPrompt,parseFinalResult,quantitativeBuyingFlags,type FinalResult} from './step7-core.ts';

const evidence = {
  commodity:'potato-starch', date:'2026-10-31', route:'stop-after-round1',
  sources:[
    {id:'G001',grade:'A',title:'Original producer report',url:'https://domain.org/doc',citationUrl:null,date:null,
      excerpts:[{id:'G001-E1',topic:'production',text:'Area is projected to decline'}]},
    {id:'G100',grade:'A',title:'Original trade report',url:'https://another.org/doc',citationUrl:null,date:null,
      excerpts:[{id:'G100-E1',topic:'price',text:'Average price rose in October'}]},
    {id:'G101',grade:'B',title:'Reference',url:null,citationUrl:'https://google.com/abc',date:null,excerpts:[]},
    {id:'G999',grade:'EXCLUDED',title:'Not relevant',url:'https://other.org/doc',citationUrl:null,date:null,excerpts:[]},
  ],
  counts:{sources:4,A:2,B:1,EXCLUDED:1,excerpts:2},priorFindings:[],decision:'stop',
} as any;
const clean:FinalResult={
  headline:'단기 변동성 확대, 공급 확인 후 분할 구매',
  marketOutlook:'생산 면적 감소 전망에 따라 향후 공급 부담이 커질 수 있으나 실제 작황은 불확실합니다.',
  procurementStrategy:'공급사별 유효 오퍼와 리드타임을 비교하고 실제 선적 지연이 확인될 때 부족분을 우선 확보합니다.',
  bullishFactors:[{text:'생산 면적 감소 전망',sourceIds:['G001']}],
  bearishFactors:[{text:'가격 약세 가능성',sourceIds:['G100']}],
  monitoringFactors:[{text:'산지 작황과 실물 오퍼 변화',sourceIds:['G001','G101']}],
  sourceIds:['G001','G100'],uncertainties:['실제 생산량 미확정'],
  claimEvidence:[
    {claim:'생산 면적 감소 전망',sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'},
    {claim:'가격 변동',sourceIds:['G100'],excerptIds:['G100-E1'],evidenceType:'direct'},
    {claim:'주요 가격 영향은 제한적',sourceIds:['G001','G101'],excerptIds:['G001-E1'],evidenceType:'qualified'},
  ],
};

test('same English instructions work for non-soybean commodity and retain existing UI schema',()=>{
  const prompt=buildFinalPrompt(evidence);
  const inst=prompt.split('EVIDENCE DATA')[0];
  assert.match(inst,/Commodity: potato-starch/);
  assert.doesNotMatch(inst,/China|CBOT|Brazil|soybean|WASDE|Thai cassava/i);
  assert.match(inst,/claimEvidence/);
  assert.match(inst,/monitoringFactors list, not a new UI section/);
});
test('clean, traceable recommendation passes quality audit',()=>{
  const result=parseFinalResult(JSON.stringify(clean)); assert.ok(result);
  assert.deepEqual(auditFinalResult(result,evidence).reviewReasons,[]);
});
test('previous unsupported numerical buying strategy is preserved but marked review-needed',()=>{
  const old={...clean,procurementStrategy:'CBOT 부셸당 1,230~1,250센트에서 소요량 50~60% 분할 매수합니다.'};
  const flags=auditFinalResult(old,evidence);
  assert.equal(flags.quantitativeStrategyFlags.length,2);
  assert.ok(flags.reviewReasons.some(s=>s.includes('purchase-percentage')));
  assert.equal(old.procurementStrategy.includes('50~60%'),true);
});
test('date and duration are not mistaken for numeric price/volume triggers',()=>{
  assert.deepEqual(quantitativeBuyingFlags('2027년 1분기 도입 예정분은 선적일정 확인 후 분할 발주합니다.'),[]);
});
test('invented excerpt ID, excluded source and unsupported direct B evidence are flagged',()=>{
  const bad:FinalResult=structuredClone(clean);
  bad.claimEvidence![0].excerptIds=['G001-E99'];
  bad.claimEvidence![1].sourceIds=['G999'];
  bad.claimEvidence![2]={claim:'B-only source',sourceIds:['G101'],excerptIds:[],evidenceType:'direct'};
  const audit=auditFinalResult(bad,evidence);
  assert.deepEqual(audit.invalidExcerptIds,['G001-E99','G100-E1']);
  assert.deepEqual(audit.invalidSourceIds,['G999']);
  assert.ok(audit.reviewReasons.some(s=>s.includes('direct claim')));
});
test('forecast incorrectly stated as confirmed output gets a review flag',()=>{
  const bad={...clean,bearishFactors:[{text:'생산량 45억 부셸 확정',sourceIds:['G001']}]};
  assert.ok(auditFinalResult(bad,evidence).forecastFinalityFlags.length>0);
});
test('B-only qualified source remains usable and is not stripped',()=>{
  const result:FinalResult=structuredClone(clean);
  result.claimEvidence![2]={claim:'B-only news context',sourceIds:['G101'],excerptIds:[],evidenceType:'qualified'};
  assert.deepEqual(auditFinalResult(result,evidence).reviewReasons,[]);
});
test('missing evidence trace is review-needed, not JSON-invalid',()=>{
  const old={...clean}; delete old.claimEvidence;
  const parsed=parseFinalResult(JSON.stringify(old));assert.ok(parsed);
  assert.ok(auditFinalResult(parsed,evidence).reviewReasons.some(x=>x.includes('claimEvidence')));
});
test('bad factor citation cannot be silently accepted',()=>{
  const bad=structuredClone(clean);bad.bullishFactors=[{text:'근거 없는 원산지 주장',sourceIds:['G404']}];
  assert.deepEqual(auditFinalResult(bad,evidence).invalidSourceIds,['G404']);
});
