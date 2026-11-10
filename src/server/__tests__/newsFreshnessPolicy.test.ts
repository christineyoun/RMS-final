import test from 'node:test';
import assert from 'node:assert/strict';
import {recentMarketArticles} from '../newsFreshnessPolicy.ts';

test('MI 7-day and 30-day limits',()=>{
 const now=new Date('2026-11-03T08:00:00Z');
 const items=['2026-10-27','2026-10-04','2026-10-03','2026-11-04']
   .map(publishedAt=>({publishedAt}));
 assert.deepEqual(
  recentMarketArticles(items,7,now).map(x=>x.publishedAt),
  ['2026-10-27']
 );
 assert.deepEqual(
  recentMarketArticles(items,30,now).map(x=>x.publishedAt),
  ['2026-10-27','2026-10-04']
 );
});
