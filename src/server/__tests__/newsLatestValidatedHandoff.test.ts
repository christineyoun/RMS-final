import test from 'node:test';
import assert from 'node:assert/strict';
import {includeNewestValidatedNews} from '../newsLatestValidatedHandoff.ts';
const commodities=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const a=(n:number,day:string)=>({originalUrl:`https://source${n}.example.org/report`,publishedAt:day});
for(const commodity of commodities){
 test(`${commodity}: latest already approved source is offered to the final selector`,()=>{
  const older=[a(1,'2026-11-19'),a(2,'2026-11-18'),a(3,'2026-11-17'),a(4,'2026-11-16')];
  const newest=a(5,'2026-11-22');
  const preferred=includeNewestValidatedNews(older,[...older,newest]);
  assert.equal(preferred.length,5,'this helper does not publish five cards');
  assert.equal(preferred[4],newest);
  assert.equal(older.length,4,'no source mutation');
  assert.deepEqual(includeNewestValidatedNews(older,older),older);
 });
}
test('an older rejected or unaccepted article is never introduced by this function',()=>{
 const old=a(1,'2026-11-19'),rejected=a(2,'2026-11-22');
 assert.deepEqual(includeNewestValidatedNews([old],[old]),[old]);
 assert.deepEqual(includeNewestValidatedNews([old],[old,a(3,'2026-11-18')]),[old]);
 assert.deepEqual(includeNewestValidatedNews([old],[]),[old]);
 void rejected;
});
