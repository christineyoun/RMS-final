import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProcurementNews} from '../newsProcurementSelection.ts';
import {cloudCompatibleVerifiedSourcePool} from '../newsCloudSourceOrder.ts';

const now=new Date('2026-11-06T00:00:00Z');
const cropTerms:Record<string,string>={
  wheat:'밀',corn:'옥수수',soybean:'대두','soybean-oil':'대두유',
  'palm-oil':'팜유',sugar:'원당','potato-starch':'감자전분',
  'tapioca-starch':'타피오카'
};
for(const [id,crop] of Object.entries(cropTerms)){
  test(id+': Cloud relevance ranking is not overwhelmed by recency',()=>{
    const entries=[
      {
        originalUrl:'https://publisher-one.example.org/market/outlook',
        publishedAt:'2026-10-17',
        title:crop+' 생산 수출 재고 소비 가격 관세 물류 전망',
        sourceHeadline:crop+' production export stocks consumption prices tariffs logistics forecast',
        sourceName:'Publisher One',sourceType:'news',
        summary:crop+' 생산 감소, 소비 증가, 재고 부족, 수출 감소, 관세 상승, 운임 증가로 가격이 상승했다.'
      },
      {
        originalUrl:'https://publisher-two.example.org/market/price',
        publishedAt:'2026-11-05',
        title:crop+' 가격 동향',sourceHeadline:crop+' spot market prices',
        sourceName:'Publisher Two',sourceType:'news',
        summary:crop+' 가격은 안정세를 유지하고 있다.'
      }
    ];
    const chosen=selectProcurementNews(id,entries,now.getTime());
    assert.equal(chosen.length,2);
    assert.equal(chosen[0].originalUrl,entries[0].originalUrl,
      'the original Cloud evidence/relevance weight must decide this example');
  });
}
test('verified-source pipeline preserves Cloud ranking but still rejects a cross-crop headline',()=>{
  const entries=[
    {publishedAt:'2026-10-17',rawTitle:'Corn export stocks down',sourceName:'A'},
    {publishedAt:'2026-11-05',rawTitle:'Sugar price falls',sourceName:'B'},
    {publishedAt:'2026-11-04',rawTitle:'Maize crop market price',sourceName:'C'},
  ];
  assert.deepEqual(cloudCompatibleVerifiedSourcePool(entries,'corn',now),[entries[0],entries[2]]);
  assert.deepEqual(cloudCompatibleVerifiedSourcePool(entries,'wheat',now),entries);
});
