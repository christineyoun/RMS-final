import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractNewsQuantities,newsNumbersIssue} from '../newsEvidenceQuality.ts';
import {newsSourceEvidence,newsSourceBindingIssue} from '../newsSourceFacts.ts';

const original='Thai tapioca starch prices: the TTTA domestic starch band stood at 20.00-20.30 THB/kg and USD 620-630/tonne from USD 635-640 (TTTA, 29 Oct).';
const korean='태국 타피오카 전분은 국내 kg당 20.00-20.30 THB, 수출 FOB 톤당 620-630 USD(기존 635-640 USD)를 기록했습니다.';

test('range endpoints have matching units',()=>{
 const source=extractNewsQuantities(original),summary=extractNewsQuantities(korean);
 for(const n of [620,630]){
  assert(source.some(q=>q.n===n&&q.unit==='dollar'&&q.denominator==='tonne'));
  assert(summary.some(q=>q.n===n&&q.unit==='dollar'&&q.denominator==='tonne'));
 }
 for(const n of [635,640]){
  assert(source.some(q=>q.n===n&&q.unit==='dollar'));
  assert(summary.some(q=>q.n===n&&q.unit==='dollar'));
 }
 for(const n of [20,20.3]){
  assert(source.some(q=>q.n===n&&q.unit==='baht'&&q.denominator==='kilogram'));
  assert(summary.some(q=>q.n===n&&q.unit==='baht'&&q.denominator==='kilogram'));
 }
 assert.equal(newsNumbersIssue(korean,original,{strictUnits:true,exactValues:true}),null);
});

test('evidence-bound price ranges validate',()=>{
 const input={rawId:'fixture',originalUrl:'https://example.org/tapioca',rawSnippet:original};
 assert.equal(newsSourceBindingIssue(input,newsSourceEvidence(input).map(p=>p.evidenceId),korean),null);
});

test('unsupported facts and changed units remain rejected',()=>{
 const check=s=>newsNumbersIssue(s,original,{strictUnits:true,exactValues:true});
 assert.match(check(korean.replace('620-630','620-631'))||'',/unsupported-number:631/);
 assert.match(check(korean+' 톤당 700 USD를 기록했습니다.')||'',/unsupported-number:700/);
 assert.match(check(korean.replace('620-630 USD','620-630 THB'))||'',/unsupported-number/);
 assert.match(check(korean.replace('톤당 620-630','kg당 620-630'))||'',/unsupported-number/);
 assert.match(check(korean+' 5% 하락했습니다.')||'',/unsupported-number:5/);
});

test('unselected evidence cannot support additional prices',()=>{
 const input={rawId:'two',originalUrl:'https://example.org/tapioca',rawSnippet:'Thai cassava starch: USD 620-630/tonne.\nThai cassava starch: USD 635-640/tonne.'};
 const ids=newsSourceEvidence(input).map(x=>x.evidenceId);
 assert.equal(newsSourceBindingIssue(input,[ids[0]],'수출 FOB 톤당 620-630 USD'),null);
 assert.match(newsSourceBindingIssue(input,[ids[0]],'수출 FOB 톤당 635-640 USD')||'',/unsupported-number/);
 assert.equal(newsSourceBindingIssue(input,[ids[1]],'수출 FOB 톤당 635-640 USD'),null);
});
