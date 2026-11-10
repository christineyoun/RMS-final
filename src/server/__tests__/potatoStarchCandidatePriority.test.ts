import assert from 'node:assert/strict';
import test from 'node:test';
import {prioritizePotatoStarchCandidates,potatoStarchCandidatePriority} from '../potatoStarchCandidatePriority.ts';
test('direct starch supply news precedes generic table potato even when older',()=>{
 const rows=[
  {rawTitle:'European table potatoes tighter as frost approaches',publishedAt:'2026-11-04',originalUrl:'https://commodity-board.com/table-potato'},
  {rawTitle:'Potato starch feedstock contracts rise at European processors',publishedAt:'2026-10-26',originalUrl:'https://potatoes.news/starch-contracts'},
  {rawTitle:'Potato prices edge up across spot markets',publishedAt:'2026-11-03',originalUrl:'https://commodity-board.com/spot-potato'}
 ];
 const result=prioritizePotatoStarchCandidates(rows);
 assert.equal(result[0],rows[1]);
 assert.equal(result.length,3);
});
test('independent publishers come before a third story from one source',()=>{
 const rows=[
  ...[0,1,2].map(i=>({rawTitle:'Potato starch production shortages and costs rise',publishedAt:'2026-11-04',originalUrl:'https://same.example/news-'+i})),
  {rawTitle:'Avebe starch potato contract price increased',publishedAt:'2026-11-03',originalUrl:'https://other.example/report'}
 ];
 const r=prioritizePotatoStarchCandidates(rows);
 assert.equal(r[2],rows[3]);
 assert.equal(r[3],rows[2]);
});
test('marketing and awards cannot jump ahead of supply evidence',()=>{
 assert.ok(potatoStarchCandidatePriority({rawTitle:'Avebe wins innovation award for potato starch'})<0);
 assert.equal(potatoStarchCandidatePriority({rawTitle:'Starch potatoes harvest shortage raises contract prices'}),3);
});
