import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVerifiedNewsDisplay} from '../newsDisplayPolicy.ts';
import {focusOnFreshVerifiedNews} from '../newsFreshEvidencePolicy.ts';
import {selectProcurementNews} from '../newsProcurementSelection.ts';
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
test('the latest eligible material story survives a handoff with four higher-scoring saved cards',()=>{
 const make=(n:number,publishedAt:string,title:string,summary:string,sourceType='news')=>({
  originalUrl:`https://news-${n}.example.org/market`,sourceName:`Publisher ${n}`,sourceType,publishedAt,title,summary,
 });
 const earlier=Array.from({length:4},(_,i)=>make(i,'2026-11-02',`밀 공급 및 수출 여건 변화 ${i}`,
  '밀 수확량과 재고가 늘면서 수출 호가가 하락했습니다. 주요 항구의 선적 여건과 수요 변화를 구매 조건에 반영해야 합니다.','official'));
 const latest=make(4,'2026-11-04','밀 현물 시세 하락',
  '주요 거래 지역에서 밀 현물 시세가 하락했습니다. 구매 담당자는 최근 밀 가격과 거래 호가의 변화를 비교할 필요가 있습니다.');
 const output=selectProcurementNews('wheat',[...earlier,latest],+now);
 assert.equal(output.length,4);
 assert.equal(output[0]?.originalUrl,latest.originalUrl);
 const reviewedScore=(article:(typeof output)[number])=>{
  assert.ok('procurementReview' in article,'selection should attach review metadata');
  const review=article.procurementReview;
  assert.ok(review&&typeof review==='object'&&'score' in review&&typeof review.score==='number',
   'review metadata should contain a numeric score');
  return review.score;
 };
 assert(reviewedScore(output[0])<reviewedScore(output[1]),'the fixture reproduces displacement by higher scores');
 const laterDuplicate={...latest,originalUrl:'https://example.org/copy',publishedAt:'2026-11-03'};
 const ineligible={...latest,originalUrl:'https://example.org/non-market',publishedAt:'2026-11-05',sourceHeadline:'Company appoints a new CEO'};
 const guarded=selectProcurementNews('wheat',[...earlier,latest,laterDuplicate,ineligible],+now);
 assert.equal(guarded.length,4);
 assert(guarded.some(a=>a.originalUrl===latest.originalUrl));
 assert(!guarded.some(a=>a.originalUrl===laterDuplicate.originalUrl||a.originalUrl===ineligible.originalUrl));
});
test('news labels always present; verified source metadata authoritative',()=>{
 const article={title:'태국 타피오카 가격 하락',summary:'베트남 생산량이 감소했습니다.'};
 const verified=marketNewsCardMetadata({...article,sourceEvidenceOnly:true});
 assert.equal(verified.affectedRegion,'미확인', 'Verified MI cannot invent a region from an AI-generated title or summary');
 assert(verified.category);
 assert.equal(marketNewsCardMetadata({...article,affectedRegion:'태국·베트남',sourceEvidenceOnly:true}).affectedRegion,'태국·베트남','Previously approved multi-region metadata is preserved');
 assert.deepEqual(marketNewsCardMetadata({title:'China palm oil stocks',summary:'가격 하락',category:'공급 전망',affectedRegion:'동아시아',sourceEvidenceOnly:true}),{category:'공급 전망',affectedRegion:'동아시아'});
 assert.equal(marketNewsCardMetadata({title:'옥수수 가격',summary:'옥수수 가격 변동',sourceEvidenceOnly:true}).affectedRegion,'미확인');
 // Preserve the separate legacy presentational helper contract. A title country
 // has priority over a different background country mentioned only in a summary.
 assert.equal(marketNewsCardMetadata(article).affectedRegion,'태국');
});
