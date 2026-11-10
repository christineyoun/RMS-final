import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdditionalFeed} from '../additionalNewsDiscovery.ts';

test('Potatoes.News original RSS article is a dated candidate, not an approval',()=>{
 const source={url:'https://potatoes.news/feed/',host:'potatoes.news',publisher:'Potatoes.News',sourceType:'news'};
 const item='<rss><channel><item>'+
  '<title>Avebe Raises Interim Potato Price as Drought Tightens Starch Market</title>'+
  '<link>https://potatoes.news/avebe-raises-interim-potato-price-by-e10-per-tonne-as-drought-tightens-starch-market/</link>'+
  '<pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate>'+
  '</item></channel></rss>';
 const found=parseAdditionalFeed(item,'potato-starch',source,new Date('2026-11-04T00:00:00Z'));
 assert.equal(found.length,1);
 assert.equal(found[0].sourceName,'Potatoes.News');
 assert.equal(found[0].publishedAt,'2026-10-12');
 assert.equal(found[0].rawSnippet,'');
});
