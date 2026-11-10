
import test from 'node:test';
import assert from 'node:assert/strict';
import {focusOnFreshVerifiedNews} from '../newsFreshEvidencePolicy.ts';

const now=new Date('2026-11-04T03:00:00Z');
const article=(date:string,id:string)=>({
  publishedAt:date,originalUrl:id
});

test('two recent reports keep older USDA article available to fill four',()=>{
  const items=[
    article('2026-10-30','india'),
    article('2026-10-30','harvest'),
    article('2026-10-14','usda')
  ];
  assert.deepEqual(
    focusOnFreshVerifiedNews(items,now).map(x=>x.originalUrl),
    ['india','harvest','usda']
  );
});

test('one recent article permits older background',()=>{
  const items=[
    article('2026-11-03','new'),
    article('2026-10-20','older')
  ];
  assert.equal(focusOnFreshVerifiedNews(items,now).length,2);
});

test('seven-day KST boundary is inclusive',()=>{
  const items=[
    article('2026-10-28','boundary'),
    article('2026-11-03','new'),
    article('2026-10-27','older')
  ];
  assert.deepEqual(
    focusOnFreshVerifiedNews(items,now).map(x=>x.originalUrl),
    ['boundary','new','older']
  );
});

test('does not invent articles or reorder current sources',()=>{
  const items=[
    article('2026-11-03','first'),
    article('2026-11-02','second')
  ];
  assert.deepEqual(focusOnFreshVerifiedNews(items,now),items);
});
