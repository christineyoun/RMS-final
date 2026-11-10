import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProcurementNews} from '../newsProcurementSelection.ts';
const now=Date.parse('2026-11-04T03:00:00Z');
const summary='카사바 전분 공급과 수요가 변화해 원료 가격이 상승하고 수출 비용이 증가하였다.';
test('four sequential weekly reports do not fill all news cards',()=>{
 const articles=[28,21,14,7].map((day,i)=>({
  originalUrl:'https://tqindustry.com/en/news/test-'+i,
  publishedAt:'2026-10-'+String(day).padStart(2,'0'),
  sourceName:'TQ Industry Starch',
  sourceHeadline:'Thailand Cassava and Tapioca Starch Prices Week of '+day+' October 2026',
  title:'Thailand Cassava and Tapioca Starch Prices Week of '+day+' October 2026',
  summary
 }));
 const selected=selectProcurementNews('tapioca-starch',articles,now);
 assert.equal(selected.length,1);
 assert.equal(selected[0].publishedAt,'2026-10-28');
});
test('Corn permits multiple genuine developments but no more than two from one publisher',()=>{
 const articles=[0,1,2,3,4].map((n)=>({
  originalUrl:'https://commodity-board.com/corn-report-'+n,
  publishedAt:'2026-11-03',sourceName:'Commodity Board',
  title:'Corn '+['harvest exports fall','freight costs rise','stocks decline','production estimates fall','demand increases'][n],
  summary:'옥수수 수확량과 공급 전망이 악화되어 가격이 상승하고 구매 비용이 증가했다.'
 }));
 articles.push({originalUrl:'https://www.world-grain.com/articles/23400',publishedAt:'2026-11-02',sourceName:'World Grain',title:'Corn production forecast lowered in Argentina',summary:'옥수수 생산 전망이 감소해 공급이 축소되고 가격이 상승했다.'});
 const selected=selectProcurementNews('corn',articles,now);
 assert.equal(selected.length,3);
 assert.equal(selected.filter(a=>a.sourceName==='Commodity Board').length,2);
});
test('Potato Starch does not accept a table potato story based only on generated claims',()=>{
 const base={originalUrl:'https://example.com/german-table-potatoes',publishedAt:'2026-11-02',sourceName:'example.com',sourceHeadline:'German table potato prices rise',title:'독일 감자전분 가격 상승',summary:'독일 감자전분 생산량이 감소하면서 원료 가격이 상승하고 구매 부담이 커졌다.'};
 assert.equal(selectProcurementNews('potato-starch',[base],now).length,0);
 assert.equal(selectProcurementNews('potato-starch',[{...base,verifiedSourceEvidence:{excerpt:'Industrial potatoes for starch processing face higher prices due to shortage.'}}],now).length,1);
});
