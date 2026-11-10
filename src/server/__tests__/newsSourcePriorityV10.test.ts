
import test from 'node:test';
import assert from 'node:assert/strict';
import {focusOnFreshVerifiedNews} from '../newsFreshEvidencePolicy.ts';

const now=new Date('2026-11-04T03:00:00Z');
const a=(title:string,sourceName:string,date='2026-11-03')=>({
 rawTitle:title,sourceName,publishedAt:date
});

test('Corn excludes sugar-only headlines',()=>{
 const items=[
  a('Corn exports rise','Commodity Board'),
  a('India Ethanol Pivot Reshapes Sugar Market Balance','Commodity Board'),
  a('Corn drying disruption','AHDB'),
  a('Corn and sugar compete for ethanol demand','World Grain')
 ];

 const result=focusOnFreshVerifiedNews(items,now,2,'corn');

 assert.equal(result.length,3);
 assert.ok(result.some(x=>x.rawTitle.startsWith('Corn and sugar')));
 assert.ok(!result.some(x=>x.rawTitle.includes('Reshapes Sugar')));
});

test('Diverse publishers precede repeat articles',()=>{
 const items=[
  a('Corn one','A'),
  a('Corn two','A'),
  a('Corn three','B'),
  a('Corn four','C')
 ];

 assert.deepEqual(
  focusOnFreshVerifiedNews(items,now,2,'corn')
   .map(x=>x.sourceName),
  ['A','B','C','A']
 );
});

test('Single-source Soybean coverage is not fabricated',()=>{
 const items=[
  a('Soybeans one','Commodity Board'),
  a('Soybeans two','Commodity Board')
 ];
 assert.deepEqual(
  focusOnFreshVerifiedNews(items,now,2,'soybean'),
  items
 );
});

test('Older reports retained to fill four when recent coverage is sparse',()=>{
 const items=[
  a('Corn recent A','A'),
  a('Corn recent B','B'),
  a('Corn older','C','2026-10-14')
 ];

 assert.equal(
  focusOnFreshVerifiedNews(items,now,2,'corn').length,
  3
 );
});
