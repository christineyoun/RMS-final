import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVerifiedNewsDisplay} from '../newsDisplayPolicy.ts';
import {focusOnFreshVerifiedNews} from '../newsFreshEvidencePolicy.ts';
import {marketNewsCardMetadata} from '../../utils/marketNewsPresentation.ts';
const now=new Date('2026-11-05T02:00:00Z');
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
for(const id of ids){
 test(id+': keeps up to four already approved articles including older ones',()=>{
  const articles=['2026-11-04','2026-11-03','2026-10-23','2026-10-19','2026-09-01']
   .map((publishedAt,i)=>({publishedAt,id:'a'+i}));
  assert.deepEqual(chooseVerifiedNewsDisplay(articles,now).articles.map(a=>a.id),['a0','a1','a2','a3']);
  assert.deepEqual(chooseVerifiedNewsDisplay(articles.slice(0,2),now).articles,articles.slice(0,2));
  assert.equal(articles.length,5,'no saved data mutation');
 });
}
test('evidence-stage source pool does not drop older candidate when two are recent',()=>{
 const articles=['2026-10-20','2026-11-04','2026-11-03','2026-10-25'].map((publishedAt,i)=>({publishedAt,sourceName:'Publisher '+i,originalUrl:'https://test.invalid/'+i}));
 assert.deepEqual(focusOnFreshVerifiedNews(articles,now).map(a=>a.originalUrl),[articles[1].originalUrl,articles[2].originalUrl,articles[0].originalUrl,articles[3].originalUrl]);
});
test('news labels always present; source metadata authoritative',()=>{
 const a=marketNewsCardMetadata({title:'태국 타피오카 가격 하락',summary:'베트남 생산량이 감소했습니다.'});
 assert.equal(a.affectedRegion,'태국·베트남');assert(a.category);
 assert.deepEqual(marketNewsCardMetadata({title:'China palm oil stocks',summary:'가격 하락',category:'공급 전망',affectedRegion:'동아시아'}),{category:'공급 전망',affectedRegion:'동아시아'});
 assert.equal(marketNewsCardMetadata({title:'옥수수 가격',summary:'옥수수 가격 변동'}).affectedRegion,'미확인');
});
