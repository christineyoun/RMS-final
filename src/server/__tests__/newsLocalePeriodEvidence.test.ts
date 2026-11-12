import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractNewsQuantities,newsNumbersIssue} from '../newsEvidenceQuality.ts';
import {newsSourceBindingIssue,newsSourceEvidence} from '../newsSourceFacts.ts';

const exact=(claim:string,source:string)=>newsNumbersIssue(claim,source,{exactValues:true,strictUnits:true});

test('source-spelled reporting periods support equal Korean numeric year periods',()=>{
  const source='Output declined 28% below the five-year average.';
  assert.equal(exact('생산량은 5년 평균 대비 28% 감소했다.',source),null);
  assert.match(exact('생산량은 6년 평균 대비 28% 감소했다.',source)||'',/unsupported-number:6/);
  assert.match(exact('생산량은 5톤 감소했다.',source)||'',/unsupported-number:5/);
  assert.match(exact('생산량은 5년 평균 대비 29% 감소했다.',source)||'',/unsupported-number:29/);
  const input={rawId:'source-one',originalUrl:'https://example.org/a',rawSnippet:source};
  assert.equal(newsSourceBindingIssue(input,newsSourceEvidence(input).map(x=>x.evidenceId),'5년 평균 대비 28% 감소'),null);
});

test('European decimal commas and thousands groups are distinct quantities',()=>{
  const source='The A-volume fell from 4,75 to 4,25 tonnes per share. The crop yielded 5,000 tonnes.';
  const amounts=extractNewsQuantities(source);
  assert(amounts.some(x=>x.n===4.75));
  assert(amounts.some(x=>x.n===4.25&&x.unit==='tonne'));
  assert(amounts.some(x=>x.n===5000&&x.unit==='tonne'));
  assert.equal(exact('4.25톤',source),null);
  assert.match(exact('4.75톤',source)||'',/unsupported-number:4.75/); // Do not infer a unit across clauses.
  assert.match(exact('4.25kg',source)||'',/unsupported-number:4.25/);
});

test('numeric validation rejects unsupported currency/denominator and source-mismatched figures',()=>{
  const source='The output was 3.2 million tonnes and price was 0.625 / kg in the table.';
  assert.match(exact('가격은 0.625 EUR/kg',source)||'',/unsupported-number:0.625/);
  assert.match(exact('생산량은 3.3 million tonnes',source)||'',/unsupported-number:3.3/);
});
