import test from 'node:test';
import assert from 'node:assert/strict';
import {shortlistVerifiedNewsForSummary} from '../newsSummarizationShortlist.ts';

const commodities=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const source=(id:number,date:string,publisher:string)=>({
  rawId:'verified-'+id,originalUrl:`https://${publisher}.example.org/report/${id}`,
  rawTitle:`Current market development ${id}`,rawSnippet:`Publisher excerpt ${id}`,
  publishedAt:date,sourceName:publisher,verified:true
});
for(const commodity of commodities){
 test(`${commodity}: newest two verified originals survive a crowded summarization batch`,()=>{
  const older=Array.from({length:14},(_,i)=>source(i,'2026-11-10',`p${i}`));
  const newer=source(99,'2026-11-22','specialist');
  const near=source(98,'2026-11-21','specialist');
  const inputs=[...older,newer,near];
  const result=shortlistVerifiedNewsForSummary(inputs);
  assert.equal(result.length,8);
  assert.deepEqual(result.slice(0,2),[newer,near]);
  assert(result.every(a=>inputs.includes(a)));
  assert.deepEqual(inputs.slice(-2),[newer,near],'no mutation to verified input');
 });
}
test('shortlist favors independent publishers after the latest two and backfills without requiring eight',()=>{
 const a=source(1,'2026-11-22','one'),b=source(2,'2026-11-21','one');
 const c=source(3,'2026-11-20','two'),d=source(4,'2026-11-19','two');
 const e=source(5,'2026-11-18','three');
 const result=shortlistVerifiedNewsForSummary([a,b,c,d,e],4);
 assert.deepEqual(result,[a,b,c,e]);
 assert.deepEqual(shortlistVerifiedNewsForSummary([a],8),[a]);
 assert.deepEqual(shortlistVerifiedNewsForSummary([a,b],0),[]);
});
test('same verified URL from two discovery paths consumes only one model slot',()=>{
 const a=source(1,'2026-11-22','one');
 const b=source(2,'2026-11-21','two');
 assert.deepEqual(shortlistVerifiedNewsForSummary([a,{...a,rawId:'another-feed-0'},b]),[a,b]);
});
