import test from 'node:test';
import assert from 'node:assert/strict';
import {canSummarizeWithoutPaidSearch} from '../newsFreeFirstPolicy.ts';
const now=new Date('2026-11-05T05:00:00Z');
const page=(host:string,i:number,date:string)=>({originalUrl:`https://${host}/news/${i}`,publishedAt:date});
const recent=[page('a.org',1,'2026-11-04'),page('b.org',2,'2026-11-03')];
const older=[page('c.org',3,'2026-10-28'),page('d.org',4,'2026-10-25')];
test('four independently verified originals including two recent may bypass paid Google Search',()=>{
  assert.equal(canSummarizeWithoutPaidSearch([...recent,...older],now),true);
});
test('one, two or three articles never trigger a four-article success assumption',()=>{
  for(let n=0;n<4;n++)assert.equal(canSummarizeWithoutPaidSearch([...recent,...older].slice(0,n),now),false);
});
test('four old articles still need fresh discovery',()=>{
  assert.equal(canSummarizeWithoutPaidSearch(older.map((a,i)=>({...a,originalUrl:`https://old.org/${i}`})).concat([page('old.org',5,'2026-10-22'),page('old.org',6,'2026-10-20')]),now),false);
});
test('duplicate URLs, malformed URLs, future dates and HTTP are not sufficient evidence',()=>{
  assert.equal(canSummarizeWithoutPaidSearch([...recent,{...recent[0]},{...older[0],originalUrl:'http://not-secure.org/news'}, {...older[1],publishedAt:'2026-11-20'}],now),false);
});
test('policy is commodity-agnostic and does not generate summaries or edit news',()=>{
  const samples=[...recent,...older];const before=JSON.stringify(samples);
  assert.equal(canSummarizeWithoutPaidSearch(samples,now),true);
  assert.equal(JSON.stringify(samples),before);
});
