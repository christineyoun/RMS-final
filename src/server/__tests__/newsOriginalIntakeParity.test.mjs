import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDynamicNewsIntake, compareWithPublishedNews,assignVerifiedOriginalIds} from '../newsVerifiedSourceIntake.ts';
const at = new Date('2026-11-09T00:00:00Z');
const meta=(url,source='Provider')=>({rawId:url,rawTitle:'Material market update',rawSnippet:'',originalUrl:url,publishedAt:'2026-11-06',sourceName:source,sourceType:'news',retrievedAt:at.toISOString()});
test('shared intake preserves previously verified free sources even when paid suggestions are empty',async()=>{
 const a=meta('https://one.example/reports/a');
 const verified=await verifyDynamicNewsIntake('sample',{saved:[a],discovered:[]},async items=>items,at);
 assert.equal(verified.verified.length,1);
 assert.equal(verified.verified[0].originalUrl,a.originalUrl);
});
test('supplemental and discovery sources pass exactly one same verifier; rejects are exposed',async()=>{
 const a=meta('https://one.example/news/a');
 const b=meta('https://two.example/news/b');
 let calls=0;
 const result=await verifyDynamicNewsIntake('sample',{saved:[],discovered:[b],supplemental:[a]},async(items,key,onReject)=>{
  calls++; assert.equal(key,'sample');
  onReject({url:b.originalUrl,reason:'publisher-date-not-established'});
  return [a];
 },at);
 assert.equal(calls,1);
 assert.equal(result.candidates.length,2);
 assert.equal(result.verified.length,1);
 assert.deepEqual(result.rejected,[{url:b.originalUrl,reason:'publisher-date-not-established'}]);
});
test('published URL comparison does not count tracking parameter variants as new coverage',()=>{
 const a=meta('https://one.example/news/a?utm_source=feed');
 const b=meta('https://two.example/news/b');
 const result=compareWithPublishedNews([a,b],[{originalUrl:'https://one.example/news/a'}]);
 assert.deepEqual(result.newVerified.map(x=>x.originalUrl),[b.originalUrl]);
});
test('no substitute content is generated when discovery returns no verified articles',async()=>{
 const r=await verifyDynamicNewsIntake('sample',{discovered:[meta('https://one.example/news/a')]},async(items,key,onReject)=>{onReject({url:items[0].originalUrl,reason:'not-an-article'});return []},at);
 assert.equal(r.verified.length,0);
 assert.equal(r.rejected[0].reason,'not-an-article');
});

test('different original articles with identical provisional RSS IDs receive distinct stable evidence IDs',()=>{
 const first={...meta('https://one.example/news/a'),rawId:'rss-result-0'};
 const second={...meta('https://two.example/news/b'),rawId:'rss-result-0'};
 assignVerifiedOriginalIds([first,second]);
 assert.notEqual(first.rawId,second.rawId);
 assert.equal(first.rawId,assignVerifiedOriginalIds([{...first,rawId:'another-feed-0'}])[0].rawId);
 assert.match(first.rawId,/^original-[a-f0-9]{64}$/);
});
