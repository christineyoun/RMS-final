import test from 'node:test';
import assert from 'node:assert/strict';
import {rankOverviewIssues,overviewMarketDevelopmentStrength} from '../overviewIssueRanking.ts';
import {overviewIssuePriority} from '../overviewIssuePriority.ts';

const now=Date.parse('2026-11-23T06:00:00Z');
const issue=(url,date,title,{priority=4,sourceType='news',commodities=['wheat'],theme='market-development',summary='',score=16}={})=>({url:'https://example.org/'+url,publishedAt:date,title,summary,priority,theme,commodities,sourceType,procurementReview:{score}});

test('newer concrete supply disruption can outrank older official background even with two-commodity coverage',()=>{
  const old=issue('old','2026-11-16','글로벌 밀 생산 전망 상향으로 곡물 가격 상승세 제한',{sourceType:'official',commodities:['wheat','corn'],score:15});
  const fresh=issue('new','2026-11-22','러시아 수출 항만 공격으로 밀 수출 리스크 프리미엄 상승');
  assert.equal(rankOverviewIssues([old,fresh],1,now)[0].url,fresh.url);
});
test('recent verified stock revision can beat older broad coverage when materiality is comparable',()=>{
  const old=issue('old','2026-11-16','글로벌 밀 생산 전망 상향으로 곡물 가격 상승세 제한',{sourceType:'official',commodities:['wheat','corn'],score:15});
  const fresh=issue('new','2026-11-19','미국 옥수수 재고 하향 조정',{commodities:['corn']});
  assert.equal(rankOverviewIssues([old,fresh],1,now)[0].url,fresh.url);
});
test('new council rename and machinery export do not displace material market developments just by being new',()=>{
  const old=issue('supply','2026-11-16','미국 대두 생산량 상향 전망',{sourceType:'official',commodities:['soybean']});
  const name=issue('rename','2026-11-23','밀 식품 위원회 명칭 변경',{commodities:['wheat'],summary:'관련 산업 단체 발표'});
  const equipment=issue('machine','2026-11-23','중국 감자 가공 장비 수출 확대',{commodities:['potato-starch']});
  assert.equal(overviewMarketDevelopmentStrength(name),0);
  assert.equal(overviewMarketDevelopmentStrength(equipment),0);
  assert.equal(rankOverviewIssues([name,equipment,old],1,now)[0].url,old.url);
});
test('a direct trade restriction is not ignored because the source is nonofficial and a day newer',()=>{
  const old=issue('old','2026-11-16','미국 대두 생산량 상향 전망',{sourceType:'official',commodities:['soybean'],priority:4,score:15});
  const fresh=issue('fresh','2026-11-22','인도네시아 대두 수입 규제 강화',{commodities:['soybean'],priority:3,score:14});
  assert.equal(rankOverviewIssues([old,fresh],1,now)[0].url,fresh.url);
});
test('only saved candidates are used; four maximum, URL dedup, multiple commodities when comparable',()=>{
  const a=issue('a','2026-11-22','밀 수출 차질',{commodities:['wheat']});
  const aDuplicate={...a,commodities:['corn']};
  const b=issue('b','2026-11-21','옥수수 재고 감소',{commodities:['corn']});
  const c=issue('c','2026-11-20','대두 가격 상승',{commodities:['soybean']});
  const d=issue('d','2026-11-20','원당 수요 증가',{commodities:['sugar']});
  const e=issue('e','2026-11-20','팜유 수출 차질',{commodities:['palm-oil']});
  const result=rankOverviewIssues([a,aDuplicate,b,c,d,e],10,now);
  assert.equal(result.length,4);
  assert.equal(new Set(result.map(x=>x.url)).size,4);
  assert.equal(rankOverviewIssues([a],4,now).length,1);
  assert.deepEqual(rankOverviewIssues([],4,now),[]);
});
test('published prior review priority works without a reviewedAt timestamp; malformed review is ignored',()=>{
  assert.equal(overviewIssuePriority({title:'공급 관련 기사',procurementReview:{priority:1}}),1);
  assert.equal(overviewIssuePriority({title:'공급 관련 기사',procurementReview:{priority:0}}),0);
  assert.equal(overviewIssuePriority({title:'재고 감소'}),4);
  assert.equal(overviewIssuePriority({title:'중립적인 행사',procurementReview:{priority:'4'}}),2);
});
test('older high-impact item may outrank a new but indirect story; ranking remains deterministic',()=>{
  const a=issue('meaningful','2026-11-14','전 세계 밀 재고 감소',{sourceType:'official',priority:4});
  const b=issue('newer','2026-11-23','대두 관련 협회 명칭 변경',{commodities:['soybean'],priority:2});
  const once=rankOverviewIssues([a,b],4,now).map(x=>x.url);
  const reversed=rankOverviewIssues([b,a],4,now).map(x=>x.url);
  assert.deepEqual(once,reversed);
  assert.equal(once[0],a.url);
});
