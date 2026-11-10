import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidenceReview,extractEvidenceCandidates,sourceId} from './step3-evidence.ts';
const doc='United States soybean production is projected at 4.3 billion bushels for marketing year 2026/27, according to the original report. Brazil soybean exports were revised to 110 million tonnes in the same table. Global soybean stocks may change as yields fluctuate in southern growing regions.';
const base={googleCitation:{index:2,title:'USDA soybean report',uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/foo'},publisherUrl:'https://www.usda.gov/soybean',publisherHost:'www.usda.gov',httpStatus:200,documentType:'html' as const,title:'Soybean report',publishedAt:'2026-10-01',extractedText:doc,extractedCharacters:doc.length};
test('STEP3 A outputs exact raw publisher excerpts without synthesizing facts',()=>{
 const a=buildEvidenceReview([{...base,grade:'A',reason:'verified-html'}])[0];
 assert.equal(a.eligibility,'document-readable-needs-fact-review');
 assert.ok(a.evidence.length>0);
 for(const e of a.evidence){assert.equal(e.reviewStatus,'candidate-not-fact-checked');assert.ok(doc.includes(e.exactExcerpt));assert.equal(e.sourceId,'G002');}
});
test('STEP3 B 403 is preserved but no numeric statements are manufactured',()=>{
 const b=buildEvidenceReview([{...base,grade:'B',reason:'publisher-http-error',httpStatus:403,extractedText:null}])[0];
 assert.equal(b.grade,'B');assert.equal(b.evidence.length,0);assert.equal(b.eligibility,'citation-only-needs-verification');
});
test('STEP3 B unrelated publisher page is retained but excluded from market evidence',()=>{
 const b=buildEvidenceReview([{...base,grade:'B',reason:'publisher-unrelated',extractedText:null}])[0];
 assert.equal(b.grade,'B');assert.equal(b.eligibility,'retained-not-usable-as-soybean-evidence');assert.equal(b.evidence.length,0);
});
test('STEP3 older or undated official originals remain candidates without being labeled current news',()=>{
 const a=buildEvidenceReview([{...base,grade:'A',reason:'verified-html',publishedAt:null}])[0];
 assert.ok(a.evidence.length>0);assert.ok(a.warnings.some(x=>x.includes('발행일 미확인')));
});
test('STEP3 excludes B and unverified URLs from factual excerpt extraction',()=>{
 const items=buildEvidenceReview([{...base,grade:'EXCLUDED',reason:'non-primary-background'}]);
 assert.equal(items[0].evidence.length,0);assert.equal(items[0].eligibility,'excluded');
});
test('STEP3 does not invent soybean information if no relevant passage exists',()=>{
 assert.deepEqual(extractEvidenceCandidates('There were no relevant agricultural facts in this document.','G001'),[]);
 assert.equal(sourceId(14),'G014');
});
