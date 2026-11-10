
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractNewsQuantities,newsNumbersIssue} from '../newsEvidenceQuality.ts';
import {newsSourceEvidence,newsSourceBindingIssue} from '../newsSourceFacts.ts';

test('international quantity abbreviations and Korean equivalents',()=>{
 const source='Consumption fell from 1.69 bln lb to 1.40 bln lb. Inventories reached 1.5 mln tons. Exports reached 800 thsd tons.';
 const found=extractNewsQuantities(source);
 assert(found.some(q=>q.n===1400000000&&q.unit==='pound'));
 assert(found.some(q=>q.n===1500000&&q.unit==='tonne'));
 assert(found.some(q=>q.n===800000&&q.unit==='tonne'));
 assert.equal(newsNumbersIssue('소비량은 14억 파운드, 재고는 150만 톤, 수출은 80만 톤입니다.',source,{strictUnits:true,exactValues:true}),null);
 assert.match(newsNumbersIssue('재고는 160만 톤입니다.',source,{strictUnits:true,exactValues:true})||'',/unsupported-number/);
 assert.match(newsNumbersIssue('재고는 150만 파운드입니다.',source,{strictUnits:true,exactValues:true})||'',/unsupported-number/);
});

test('only selected publisher evidence can support numbers',()=>{
 const article={rawId:'test',originalUrl:'https://example.org/news',rawSnippet:'Consumption was 1.40 bln lb.\nInventories reached 1.5 mln tons.'};
 const passages=newsSourceEvidence(article);
 assert(passages[0].quantities.some(q=>q.koreanEquivalent==='14억 파운드'));
 assert(passages[1].quantities.some(q=>q.koreanEquivalent==='150만 톤'));
 assert.equal(newsSourceBindingIssue(article,passages.map(p=>p.evidenceId),'소비량 14억 파운드, 재고 150만 톤'),null);
 assert.match(newsSourceBindingIssue(article,[passages[0].evidenceId],'소비량 14억 파운드, 재고 150만 톤')||'',/unsupported-number:150만/);
});
