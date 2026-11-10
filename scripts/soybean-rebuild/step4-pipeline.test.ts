import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrompt,integrate,parseJsonReply,summarizeTextContext,toMarkdown} from './step4-pipeline.ts';
import type {ReviewItem,EvidenceWindow} from './step3-evidence.ts';

const e1:EvidenceWindow={id:'G001-E1',sourceId:'G001',theme:'supply',exactExcerpt:'Soybean ending stocks are projected at 315 million bushels in 2026/27.',containsNumber:true,charStart:0,reviewStatus:'candidate-not-fact-checked'};
const e2:EvidenceWindow={id:'G001-E2',sourceId:'G001',theme:'prices',exactExcerpt:'Soybean oil and meal indices are listed in a difficult PDF table 32 22 5.',containsNumber:true,charStart:81,reviewStatus:'candidate-not-fact-checked'};
function item(id:string,grade:'A'|'B'|'EXCLUDED',reason:string,ev:EvidenceWindow[]=[]):ReviewItem{return {
  id,grade,reason,googleTitle:'USDA Report',googleCitationUrl:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x',
  publisherUrl:'https://www.usda.gov/soybean',publisherHost:'www.usda.gov',publishedAt:null,documentType:'pdf',
  extractedCharacters:500,eligibility:grade==='A'?'document-readable-needs-fact-review':grade==='B'?reason==='publisher-unrelated'?'retained-not-usable-as-soybean-evidence':'citation-only-needs-verification':'excluded',
  warnings:[],evidence:ev};}
const items=[item('G001','A','verified-pdf',[e1,e2]),item('G002','B','publisher-content-unreadable'),item('G003','B','publisher-unrelated'),item('G004','EXCLUDED','non-primary-background')];

test('STEP4 keeps all original A/B/excluded records unchanged and all evidence when model returns nothing',()=>{
  const before=JSON.stringify(items);
  const result=integrate(items,{candidateReviews:[],findings:[],researchGaps:[]});
  assert.equal(JSON.stringify(items),before);
  assert.equal(result.originalInventory.length,4);
  assert.equal(result.candidateAssessments.length,2);
  assert.equal(result.audit.autoPreservedUnreviewed,2);
  assert.equal(result.audit.statusCounts.unreviewed,2);
  assert.equal(result.originalInventory.find(x=>x.id==='G002')?.grade,'B');
});
test('STEP4 labels all candidate IDs, preserves unknown/unreviewed even if Gemini omits entries',()=>{
  const result=integrate(items,{candidateReviews:[{id:'G001-E1',status:'confirmed',observation:'315m bushels'},{id:'MADE-UP',status:'confirmed'}],findings:[],researchGaps:[]});
  assert.deepEqual(result.candidateAssessments.map(x=>x.status),['confirmed','unreviewed']);
  assert.deepEqual(result.audit.unknownReviewIds,['MADE-UP']);
});
test('STEP4 B-only numeric claims can never be confirmed (but remain in result)',()=>{
  const result=integrate(items,{candidateReviews:[],findings:[{statement:'Claim from inaccessible source',status:'confirmed',sourceIds:['G002'],figure:'999 tonnes'}],researchGaps:[]});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].status,'needs-clarification');
  assert.ok(result.findings[0].auditNotes.some(s=>s.includes('숫자')));
});
test('STEP4 unrelated B and invented evidence reference cause downgrade, not discard',()=>{
  const result=integrate(items,{candidateReviews:[],findings:[{statement:'Bogus',status:'confirmed',sourceIds:['G003'],evidenceIds:['G999-E1']}],researchGaps:[]});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].status,'needs-clarification');
  assert.deepEqual(result.audit.unknownFindingEvidenceIds,['G999-E1']);
});
test('STEP4 numeric figure absent from publisher excerpt remains marked uncertain instead of rejected',()=>{
  const result=integrate(items,{candidateReviews:[],findings:[{statement:'Volume claim',status:'confirmed',evidenceIds:['G001-E1'],figure:'888 million bushels'}],researchGaps:[]});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].status,'needs-clarification');
  assert.ok(result.findings[0].auditNotes.length>0);
});
test('STEP4 315 million from original excerpt is retained with source association',()=>{
  const result=integrate(items,{candidateReviews:[],findings:[{statement:'Soybean stocks 315m',status:'provisional',evidenceIds:['G001-E1'],figure:'315 million bushels',period:'2026/27'}],researchGaps:[]});
  assert.equal(result.findings[0].status,'provisional');
  assert.deepEqual(result.findings[0].sourceIds,['G001']);
  assert.equal(result.findings[0].auditNotes.length,0);
});
test('STEP4 prompt preserves all A passages, B metadata, and no tool-enabled search',()=>{
  const prompt=buildPrompt(items,{'G001':e1.exactExcerpt+' '+e2.exactExcerpt},'2026-10-30');
  assert.ok(prompt.includes('G001-E1'));
  assert.ok(prompt.includes('G001-E2'));
  assert.ok(prompt.includes('G002'));
  assert.ok(prompt.includes('G003'));
  assert.ok(prompt.includes('Do NOT use Google Search'));
  assert.ok(!prompt.includes('Bing Search'));
});
test('STEP4 invalid JSON is not silently passed',()=>{
  assert.equal(parseJsonReply('not-json'),null);
  assert.equal(parseJsonReply('{"candidateReviews":[]}'),null);
  const p=parseJsonReply('```json\n{"candidateReviews":[],"findings":[],"researchGaps":[]}\n```');
  assert.ok(p);
});
test('STEP4 source context is sourced verbatim from the local extracted document',()=>{
  assert.equal(summarizeTextContext('Soybean ending stocks rose.',{...e1,charStart:0},5),'Soybean ending stocks rose.');
  assert.equal(summarizeTextContext(null,e1),e1.exactExcerpt);
});
test('STEP4 report shows all original B sources and preservation counts',()=>{
  const result=integrate(items,{candidateReviews:[],findings:[],researchGaps:[]});
  const md=toMarkdown(result,{model:'gemini-3.8-flash',step3File:'fixture.json',apiStatus:'review-generated'});
  assert.ok(md.includes('B 2건'));
  assert.ok(md.includes('G002'));
  assert.ok(md.includes('G003'));
  assert.ok(md.includes('G001-E1'));
});
