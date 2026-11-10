import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWideNews} from '../freeWideNewsDiscovery.ts';

const examples:Record<string,string>={
 wheat:'Wheat exports increase after harvest forecast',
 corn:'Corn production outlook and exports increase',
 soybean:'Soybean crushing production and prices increase',
 'soybean-oil':'Soybean oil inventories fall on biofuel demand',
 'palm-oil':'Palm oil futures prices fall as inventories rise',
 sugar:'Sugar prices increase after cane harvest falls',
 'potato-starch':'Potato starch production capacity rises in Europe',
 'tapioca-starch':'Tapioca starch export prices change in Thailand'
};
const xmlItem=(title:string,link:string,pub='Tue, 03 Nov 2026 12:00:00 GMT')=>
  `<item><title>${title}</title><link>${link.replace(/&/g,'&amp;')}</link><pubDate>${pub}</pubDate></item>`;
const publisher=(id:string)=>'https://www.world-grain.com/articles/source-'+id;
const wrapped=(id:string)=>'https://www.bing.com/news/apiclick.aspx?ref=sample&url='+encodeURIComponent(publisher(id));
const rss=(content:string)=>`<?xml version="1.0"?><rss version="2.0"><channel>${content}</channel></rss>`;

test('eight commodities: Bing publisher URL unwrapped, strict topic/date/host filtering',async()=>{
 const now=new Date('2026-11-04T00:00:00Z');
 for(const [id,title] of Object.entries(examples)){
  let calls=0;
  const feed=rss([
   xmlItem(title,wrapped(id)),
   xmlItem(title,'https://www.bing.com/news/apiclick.aspx?url='+encodeURIComponent('http://localhost/private')),
   xmlItem('Unrelated technology announcement','https://www.world-grain.com/articles/random'),
   xmlItem(title,'https://www.world-grain.com/articles/too-old','Tue, 01 Sep 2026 12:00:00 GMT')
  ].join(''));
  const fetcher=async (url:string|URL|Request)=>{
   const u=new URL(String(url));
   assert.equal(u.hostname,'www.bing.com');
   assert.equal(u.searchParams.get('format'),'rss');
   calls++;
   return new Response(feed,{status:200,headers:{'content-type':'application/rss+xml'}});
  };
  const found=await discoverWideNews(id,fetcher as typeof fetch,now,0);
  assert.equal(calls,id==='potato-starch'?7:['corn','soybean'].includes(id)?6:4,id);
  assert.deepEqual(found.errors,[],id);
  assert.equal(found.candidates.length,1,id);
  assert.equal(found.candidates[0].originalUrl,publisher(id));
  assert.equal(found.candidates[0].publishedAt,'2026-11-03');
  assert.equal(found.candidates[0].rawSnippet,'');
 }
});
test('blocked Bing RSS fails closed, without retry storm or fabricated articles',async()=>{
 let calls=0;
 const bad=async()=>{calls++;return new Response('Forbidden',{status:403});};
 const found=await discoverWideNews('palm-oil',bad as typeof fetch,new Date(),0);
 assert.equal(calls,1);
 assert.equal(found.candidates.length,0);
 assert.match(found.errors.join(' '),/HTTP 403/);
});
test('non-RSS body is an error, not a source of articles',async()=>{
 const fake=async()=>new Response('<html>Challenge</html>',{status:200});
 const found=await discoverWideNews('sugar',fake as typeof fetch,new Date(),0);
 assert.equal(found.candidates.length,0);
 assert.match(found.errors.join(' '),/invalid RSS feed/);
});

test('starch-potato supplier price coverage is a candidate only, not approval',async()=>{
 const original='https://potatoes.news/avebe-raises-starch-potato-price/';
 const feed=rss(xmlItem('Avebe raises interim starch potato prices on tight supply',original));
 const source=async()=>new Response(feed,{status:200});
 const found=await discoverWideNews('potato-starch',source as typeof fetch,new Date('2026-11-04T00:00:00Z'),0);
 assert.equal(found.errors.length,0);
 assert.equal(found.candidates.length,1);
 assert.equal(found.candidates[0].originalUrl,original);
 assert.equal(found.candidates[0].rawSnippet,'');
});


test('unlisted public HTTPS publisher is discoverable but not automatically verified',async()=>{
 const feed=rss(xmlItem('Soybean oil production prices rise amid export demand',
  'https://market-news.example.org/reports/soybean-oil-production-prices'));
 // The index only returns a candidate: the original publisher must still pass
 // separate original-page verification before any publication.
 const fetcher=async()=>new Response(feed,{status:200});
 const result=await discoverWideNews('soybean-oil',fetcher as typeof fetch,new Date('2026-11-04T00:00:00Z'),0);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].rawSnippet,'');
});

test('reject local, IP-literal, credentials, HTTP and publisher index links',async()=>{
 const headline='Soybean oil production prices rise amid export demand';
 const links=['https://127.0.0.1/private','https://localhost/private',
   'https://corp.internal/article','http://public-news.example.org/story',
   'https://user:pass@public-news.example.org/story',
   'https://public-news.example.org/category/soybean-oil'];
 const feed=rss(links.map(u=>xmlItem(headline,u)).join(''));
 const fetcher=async()=>new Response(feed,{status:200});
 const result=await discoverWideNews('soybean-oil',fetcher as typeof fetch,new Date('2026-11-04T00:00:00Z'),0);
 assert.equal(result.candidates.length,0);
});
