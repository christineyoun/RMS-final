import test from 'node:test';
import assert from 'node:assert/strict';
import {quantitativeBuyingFlags,auditFinalResult,buildFinalPrompt} from './step7-core.ts';

const PRICE='numeric-buy-or-hedge-price:';
const PCT='purchase-percentage-or-percentage-trigger:';
const has=(text,reason)=>quantitativeBuyingFlags(text).some(s=>s.startsWith(reason));
const actualTapiocaStrategy='타피오카 전분 스팟 가격의 추가 급락 가능성이 제한적이므로 원료 출하가 늘어나는 11월 전반기까지는 1~2개월 소요분의 단기 현물 위주로 분할 조달하십시오. 베트남산 오퍼(605~645 USD/MT)가 태국 슈퍼 프리미엄 대비 톤당 35~75달러가량 유리하므로 일반 공업·식품용은 베트남산 비중을 확대하고, 태국산은 규격별(TTSA 고시 대비 실거래 밴드) 네고를 통해 선적 월을 분산 계약하는 접근이 바람직합니다.';

const safeQuotes=[
 actualTapiocaStrategy,
 '베트남산 오퍼는 605~645 USD/MT이며, 계약 시 공급처별 가격을 비교한다.',
 '현재 오퍼 605~645 USD/MT인 경우 계약 전 가격을 비교한다.',
 '태국 고시가격은 680 USD/MT이고, 11월 물량은 분할 구매를 검토한다.',
 '폴란드 FCA 0.625 EUR/kg와 다른 공급선을 비교하여 계약 시기를 분산한다.',
 '대두 선물은 1,242.75센트/bu이며, 단기 필요량을 분할 매수한다.',
 '원물 가격이 전년 대비 20% 상승했지만 공급처와 협상한다.',
 '태국산 680 USD/MT와 베트남산 605~645 USD/MT의 차액은 35~75달러다. 단기 물량은 단계적으로 계약한다.',
];
for(const [i,s] of safeQuotes.entries())test(`market quote / price comparison is not an executable price target ${i+1}`,()=>{
 assert.equal(has(s,PRICE),false,s);
});

const executableTargets=[
 '620달러 이하에서 매수한다.',
 '620달러에 계약한다.',
 '605~645 USD/MT 수준에서 분할 매수한다.',
 '1,230~1,250센트/bu 부근에서 대두를 50~60% 매수한다.',
 '가격이 620달러를 하회하면 타피오카전분을 매입한다.',
 '매수가격 USD 620을 목표로 한다.',
 '계약단가 620달러를 목표로 공급사와 협상한다.',
 '가격이 620달러가 되면 물량을 확보한다.',
 '620달러인 경우 계약하라.',
];
for(const [i,s] of executableTargets.entries())test(`specific executable price rule still held ${i+1}`,()=>{
 assert.equal(has(s,PRICE),true,s);
});
test('invented purchase percentages still held and months not misread as percentages',()=>{
 assert.equal(has('필수 물량의 50~60%를 확약한다.',PCT),true);
 assert.equal(has(actualTapiocaStrategy,PCT),false);
});

const S={id:'G001',grade:'A',title:'Publisher',url:'https://publisher.org/research',citationUrl:null,date:null,
 excerpts:[{id:'G001-E1',topic:'crop',text:'Report confirms current crop figures.'}]};
const makeReport=(strategy)=>({headline:'수급 전망과 분할 구매',marketOutlook:'원료 및 제품 시장전망.',procurementStrategy:strategy,
 bullishFactors:[{text:'원료 공급 감소',sourceIds:['G001']}],bearishFactors:[{text:'신작 공급',sourceIds:['G001']}],
 monitoringFactors:[{text:'생산량',sourceIds:['G001']}],sourceIds:['G001'],uncertainties:[],
 claimEvidence:[1,2,3].map(i=>({claim:`근거 사실 ${i}`,sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'}))});
const eight=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
for(const commodity of eight)test(`full validator keeps other checks for ${commodity}`,()=>{
 const data={commodity,sources:[S]};
 const report=makeReport('조사된 시장 오퍼는 605~645 USD/MT 수준이며, 공급선별 조건을 비교하여 분할 계약한다.');
 const audit=auditFinalResult(report,data);
 assert.deepEqual(audit.quantitativeStrategyFlags,[]);
 assert.deepEqual(audit.invalidSourceIds,[]);
 assert.deepEqual(audit.invalidExcerptIds,[]);
 assert.equal(audit.claimEvidenceCount,3);
 assert.deepEqual(audit.reviewReasons,[]);
 const flagged=auditFinalResult({...report,procurementStrategy:'620달러 이하에서 매수한다.'},data);
 assert(flagged.reviewReasons.some(x=>x.startsWith(PRICE)));
});
test('invalid source IDs remain blocked',()=>{
 const report=makeReport('원료별 가격을 비교하고 분할 계약한다.');
 const audit=auditFinalResult({...report,sourceIds:['G999']},{commodity:'tapioca-starch',sources:[S]});
 assert(audit.reviewReasons.includes('unknown or excluded source IDs'));
});
test('original market prompt still contains sourcing and procurement safeguards',()=>{
 const p=buildFinalPrompt({date:'2026-10-31',commodity:'tapioca-starch',counts:{},priorFindings:[],decision:{},sources:[]});
 assert.match(p,/Do not invent dates, figures, citations/);
 assert.match(p,/Never invent numerical purchase percentages/);
 assert.match(p,/procurementRisk/);
});
