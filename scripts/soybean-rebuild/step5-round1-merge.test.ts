import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalPublisherKey,validateStep5Round1,reconcilePublishers} from './step5-round1-merge.ts';
import type {GradeRecord} from './source-grade.ts';
const row=(id:number,uri:string,publisher:string|null,grade:GradeRecord['grade']='A'):GradeRecord=>({
  grade,reason:grade==='A'?'verified-html':'publisher-unreachable',
  googleCitation:{index:id,title:'publisher',uri},publisherUrl:publisher,publisherHost:null,httpStatus:grade==='A'?200:403,
  documentType:grade==='A'?'html':null,title:'x',publishedAt:null,extractedText:grade==='A'?'soybean supply':null,extractedCharacters:0,notes:''
});
const old=[{id:'G001',grade:'A',publisherUrl:'https://www.example.org/news/soybean?utm_source=google',googleCitationUrl:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/OLD'},
{id:'G002',grade:'B',publisherUrl:null,googleCitationUrl:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/B-OLD'}];
test('publisher dedup ignores www and tracking params, but keeps article-specific params',()=>{
  assert.equal(canonicalPublisherKey('https://www.EXAMPLE.org/news/soybean/?utm_source=x'),canonicalPublisherKey('https://example.org/news/soybean'));
  assert.notEqual(canonicalPublisherKey('https://example.org/?id=1'),canonicalPublisherKey('https://example.org/?id=2'));
});
test('duplicate Google redirects that resolve to same publisher page are labeled without dropping records',()=>{
  const rows=[row(100,'https://google.com/one','https://example.org/news/soybean'),
    row(101,'https://google.com/two','https://another.org/a'),
    row(102,'https://google.com/three','https://www.another.org/a?utm_medium=google')];
  const result=reconcilePublishers(old,rows);
  assert.deepEqual(result.records.map(x=>x.overlap),['same-publisher-as-prior','new-publisher-document','same-publisher-in-round']);
  assert.equal(result.records.length,3);
  assert.equal(result.summary.oldPublisherMatches,1);
  assert.equal(result.summary.newPublisherDistinct,1);
});
test('unresolved B stays B and recorded even if the publisher URL cannot be resolved',()=>{
  const rows=[row(100,'https://vertexaisearch.cloud.google.com/grounding-api-redirect/B-OLD',null,'B'),
    row(101,'https://vertexaisearch.cloud.google.com/grounding-api-redirect/other',null,'B')];
  const result=reconcilePublishers(old,rows);
  assert.equal(result.summary.B,2);
  assert.deepEqual(result.records.map(x=>x.overlap),['same-google-citation-as-prior','unresolved-publisher']);
});
test('same domain different article does not count as duplicate',()=>{
  const result=reconcilePublishers(old,[row(100,'https://google.com/x','https://example.org/news/another-soybean')]);
  assert.equal(result.summary.newPublisherDistinct,1);
});
test('invalid saved stage cannot be accepted as provider-grounded STEP5 result',()=>{
  const valid={commodity:'soybean',stage:'additional-google-discovery-round1',round:1,status:'google-citations-found',
    grounding:{sources:[{title:'x',uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/123'}]},
    priorSnapshot:{originalInventory:old}};
  assert.doesNotThrow(()=>validateStep5Round1(valid));
  assert.throws(()=>validateStep5Round1({...valid,stage:'unverified-model-text'}));
  assert.throws(()=>validateStep5Round1({...valid,priorSnapshot:{originalInventory:[]}}));
  assert.throws(()=>validateStep5Round1({...valid,grounding:{sources:[{title:'x',uri:'http://test.invalid'}]}}));
});
test('old source inventory unchanged by reconciliation',()=>{
  const before=JSON.stringify(old);
  reconcilePublishers(old,[row(100,'https://google.com/x','https://new.example.com/a')]);
  assert.equal(JSON.stringify(old),before);
});
