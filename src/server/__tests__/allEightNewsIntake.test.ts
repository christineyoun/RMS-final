import test from 'node:test';
import assert from 'node:assert/strict';
import {otherCommodityVerificationPool} from '../otherCommodityNewsPool.ts';
import {recentMarketArticles} from '../newsFreshnessPolicy.ts';
import {chooseVerifiedNewsDisplay} from '../newsDisplayPolicy.ts';

const commodities=['wheat','corn','soybean','soybean-oil','palm-oil',
  'sugar','potato-starch','tapioca-starch'];
const now=new Date('2026-11-05T02:00:00Z');

for(const commodity of commodities){
 test(`${commodity}: shared intake deduplicates, prioritizes fresh publishers, and refuses future URLs`,()=>{
  const fresh={originalUrl:`https://publisher-one.example/${commodity}/latest`,publishedAt:'2026-11-04',sourceName:'Publisher One'};
  const recent={originalUrl:`https://publisher-two.example/${commodity}/supply`,publishedAt:'2026-11-03',sourceName:'Publisher Two'};
  const stale={originalUrl:`https://publisher-two.example/${commodity}/older`,publishedAt:'2026-10-12',sourceName:'Publisher Two'};
  const future={originalUrl:`https://publisher-three.example/${commodity}/future`,publishedAt:'2026-11-30',sourceName:'Publisher Three'};
  const candidates=otherCommodityVerificationPool([stale,fresh],[recent,{...fresh,originalUrl:fresh.originalUrl+'/'}],[future],now);
  assert.deepEqual(candidates.map(x=>x.originalUrl),[fresh.originalUrl,recent.originalUrl,stale.originalUrl]);
  assert.deepEqual(recentMarketArticles(candidates,7,now).map(x=>x.originalUrl),[fresh.originalUrl,recent.originalUrl]);
 });
}

for(const commodity of commodities){
 test(`${commodity}: shared display uses fresh news without erasing approved older records`,()=>{
  const fresh=[{publishedAt:'2026-11-04',id:'new1'}, {publishedAt:'2026-11-03',id:'new2'}];
  const older={publishedAt:'2026-10-19',id:'old'};
  const saved=[...fresh,older];
  const current=chooseVerifiedNewsDisplay(saved,now);
  assert.equal(current.sourceStatus,'verified-current-selection');
  assert.deepEqual(current.articles.map(x=>x.id),['new1','new2','old']);
  assert.equal(saved.length,3,'display selection must not mutate saved publication');
  const insufficient=chooseVerifiedNewsDisplay([fresh[0],older],now);
  assert.deepEqual(insufficient.articles.map(x=>x.id),['new1','old']);
  assert.equal(insufficient.sourceStatus,'verified-current-selection');
  const stale=chooseVerifiedNewsDisplay([older],new Date('2026-12-20T02:00:00Z'));
  assert.equal(stale.sourceStatus,'verified-retained-stale');
  assert.equal(stale.articles[0],older);
 });
}
