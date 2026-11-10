import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFinishedObjects,recoverSavedResponse} from './step4-recovery.ts';

test('complete response is parsed as whole',()=>{
  const result=recoverSavedResponse('{"candidateReviews":[{"id":"G001-E1","status":"confirmed"}],"findings":[],"researchGaps":[],"coverage":"ok"}');
  assert.equal(result.parseMode,'complete');
  assert.equal(result.counts.candidateReviews,1);
});
test('truncated array salvages only fully closed review objects',()=>{
  const result=recoverSavedResponse('{"candidateReviews":[{"id":"G001-E1","status":"confirmed"},{"id":"G001-E2","status":"provisional"},{"id":"G001-E3","status":"');
  assert.equal(result.parseMode,'partial-objects');
  assert.deepEqual(result.modelResult?.candidateReviews?.map(x=>x.id),['G001-E1','G001-E2']);
});
test('truncated output saves finished findings with nested evidence/source lists',()=>{
  const response='{"candidateReviews":[],"findings":[{"statement":"대두 재고","evidenceIds":["G001-E1"],"sourceIds":["G001"],"figure":"315 million bushels"},{"statement":"broken';
  const result=recoverSavedResponse(response);
  assert.equal(result.parseMode,'partial-objects');
  assert.equal(result.modelResult?.findings?.length,1);
  assert.deepEqual(result.modelResult?.findings?.[0].evidenceIds,['G001-E1']);
});
test('braces inside strings do not cause false recovery',()=>{
  const a=extractFinishedObjects('{"findings":[{"statement":"contains } and { braces", "evidenceIds":[]}]}','findings');
  assert.equal(a.length,1);
  assert.equal(a[0].statement,'contains } and { braces');
});
test('empty response has no fabricated analysis',()=>{
  const result=recoverSavedResponse('  ');
  assert.equal(result.parseMode,'none');
  assert.equal(result.modelResult,null);
});
test('incomplete object alone does not become evidence',()=>{
  const result=recoverSavedResponse('{"candidateReviews":[{"id":"G001-E1","status":');
  assert.equal(result.parseMode,'none');
  assert.deepEqual(result.counts,{candidateReviews:0,findings:0,researchGaps:0});
});
test('number of returned JSON objects is bounded',()=>{
  const many=Array.from({length:160},(_,i)=>JSON.stringify({id:`G001-E${i}`})).join(',');
  const arr=extractFinishedObjects(`{"candidateReviews":[${many}]}`,'candidateReviews');
  assert.equal(arr.length,150);
});
