
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractNewsQuantities,newsNumbersIssue} from '../newsEvidenceQuality.ts';
import {newsSourceBindingIssue,newsSourceEvidence} from '../newsSourceFacts.ts';

const claims=(s:string)=>extractNewsQuantities(s);
const exact=(k:string,s:string)=>newsNumbersIssue(
  k,s,{strictUnits:true,exactValues:true}
);

test('Korean compound quantities retain full amount and unit',()=>{
 assert.deepEqual(claims('약 63만 5,000톤'),
  [{n:635000,unit:'tonne',original:'63만 5,000'}]);
 assert.deepEqual(claims('약 17만 3,000톤'),
  [{n:173000,unit:'tonne',original:'17만 3,000'}]);
 assert.deepEqual(claims('3억 8,100만 파운드').map(x=>[x.n,x.unit]),
  [[381000000,'pound']]);
 assert.deepEqual(claims('17만 톤').map(x=>[x.n,x.unit]),
  [[170000,'tonne']]);
 assert.equal(exact('약 63만 5,000톤, 17만 3,000톤',
  '635 thsd tonnes; 173 thsd tonnes'),null);
 assert.match(exact('약 63만 6,000톤','635 thsd tonnes')||'',
  /unsupported-number:63만 6,000/);
 assert.match(exact('약 63만 5,000파운드','635 thsd tonnes')||'',
  /unsupported-number/);
});

test('Korean month ranges are not quantities',()=>{
 for(const date of [
  '2026년 1~9월','2026년 1-9월',
  '2026년 1월~9월','2026년 1∼9월'
 ]) assert.deepEqual(claims(date),[],date);
 assert.deepEqual(claims('최대 1% 하락').map(x=>[x.n,x.unit]),
  [[1,'percent']]);
 assert.notEqual(exact('1~9% 감소','1% 감소'),null);
});

test('previously rejected Korean sentence patterns validate',()=>{
 const a={
  rawId:'one',
  originalUrl:'https://example.org/one',
  rawSnippet:'Consumption fell 17% from 1.69 bln lb to 1.40 bln lb (635 thsd tonnes). Canola usage increased 15.5% to 381 mln lb (173 thsd tonnes). Renewable diesel usage declined 28.2%.'
 };
 const b={
  rawId:'two',
  originalUrl:'https://example.org/two',
  rawSnippet:'Stock reached 1.5 mln tonnes, up 4.3%. Exports approached 800 thsd tonnes. Futures prices dropped 1%.'
 };
 const k1='2026년 8월 대두유 소비량은 17% 감소한 14억 파운드(약 63만 5,000톤)이며 카놀라유는 15.5% 증가해 3억 8,100만 파운드(약 17만 3,000톤)이고 재생디젤용은 28.2% 감소했습니다.';
 const k2='2026년 10월 30일 기준 150만 톤, 4.3% 증가했습니다. 2026년 1~9월 80만 톤, 선물은 11월 3일 1% 하락했습니다.';

 for(const [article,korean] of [[a,k1],[b,k2]] as const){
  const ids=newsSourceEvidence(article).map(p=>p.evidenceId);
  assert.equal(newsSourceBindingIssue(article,ids,korean),null);
 }
 assert.match(
  newsSourceBindingIssue(b,newsSourceEvidence(b).map(p=>p.evidenceId),
   '2026년 1~9월 90만 톤')||'',
  /unsupported-number:90만/
 );
});
