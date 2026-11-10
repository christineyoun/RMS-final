import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseVietBacMarketIndex} from '../additionalNewsDiscovery.ts';
const today=new Date('2026-11-04T08:00:00Z');
const link=(slug:string,title:string)=>'<a href="/en/posts/'+slug+'">'+title+'</a>';

test('publisher-index discovery captures recent original URL hints only',()=>{
 const result=parseVietBacMarketIndex('<main>'+[
  link('vietnam-cassava-market-update-november-2-2026','Vietnam Cassava Market Update – November 2, 2026'),
  link('cassava-market-reference-bulletin-october-19-2026','Cassava Market Reference Bulletin – October 19, 2026')
 ].join('')+'</main>',today);
 assert.deepEqual(result.map(x=>x.publishedAt),['2026-11-02','2026-10-19']);
 assert.equal(result[0].originalUrl,'https://vietbacagroimex.com/en/posts/vietnam-cassava-market-update-november-2-2026');
 assert.equal(result[0].rawSnippet,'');
});

test('promotions, unrelated crops, future dates and other hosts are refused',()=>{
 const result=parseVietBacMarketIndex('<main>'+[
  link('cassava-orders-november-3-2026','Cassava Starch Export Orders for Sale – November 3, 2026'),
  link('coffee-market-update-november-2-2026','Coffee Market Update – November 2, 2026'),
  link('cassava-market-update-december-2-2026','Cassava Market Update – December 2, 2026'),
  '<a href="https://other.example/en/posts/cassava-market-update-november-2-2026">Cassava Market Update – November 2, 2026</a>'
 ].join('')+'</main>',today);
 assert.equal(result.length,0);
});

test('undated and stale index entries are rejected',()=>{
 const result=parseVietBacMarketIndex('<main>'+[
  link('cassava-market-update-september-1-2026','Cassava Market Update – September 1, 2026'),
  link('cassava-market-update','Cassava Market Update – Latest')
 ].join('')+'</main>',today);
 assert.equal(result.length,0);
});


test('real Viet Bac article route passes original-page verification', async () => {
  const {verifyOtherCommodityArticles} =
    await import('../all8ArticleVerification.ts');

  const oldFetch = globalThis.fetch;
  const html = '<html><head><title>Vietnam Cassava Market Update – November 2, 2026</title></head><body><main><h1>Vietnam Cassava Market Update – November 2, 2026</h1> <p>Published: 02/11/2026 20:18</p><article><p>Fresh cassava supplies remained limited in Northern Vietnam and tapioca starch factories faced production pressure.</p><p>Vietnam tapioca starch export prices were reported at USD 600 to USD 640 per metric ton FOB Ho Chi Minh City.</p></article></main></body></html>';

  try {
    globalThis.fetch = async () =>
      new Response(html, {
        status: 200,
        headers: {'content-type':'text/html; charset=utf-8'}
      });

    const candidates = parseVietBacMarketIndex(
      '<main><a href="/en/posts/vietnam-cassava-market-update-november-2-2026">Vietnam Cassava Market Update – November 2, 2026</a></main>',
      today
    );

    assert.equal(candidates.length, 1);

    const verified = await verifyOtherCommodityArticles(
      candidates, 'tapioca-starch'
    );

    assert.equal(verified.length, 1);
    assert.equal(verified[0].publishedAt, '2026-11-02');
    assert.match(verified[0].rawSnippet, /USD 600 to USD 640/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
