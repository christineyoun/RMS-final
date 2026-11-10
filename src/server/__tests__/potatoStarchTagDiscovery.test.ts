import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePotatoStarchTagIndex} from '../potatoStarchTagDiscovery.ts';
const now=new Date('2026-11-05T00:00:00Z');
test('tag index contributes dated original publisher URL hints, not approved news',()=>{
 const html=`<main><article><h2><a href="/starch-potato-contracts-are-rising/">Starch Potatoes Contract Prices Rise Across Europe</a></h2><span>20.10.2026</span></article>
 <article><a href="/award-ceremony/">Avebe wins innovation award for potato starch</a><span>04.11.2026</span></article>
 <article><a href="https://attacker.invalid/potato-starch-market/">Potato Starch Prices Rise on Shortages</a><span>03.11.2026</span></article>
 <article><a href="/starch-market-old/">Potato Starch Market Prices Rise on Demand</a><span>20.08.2026</span></article></main>`;
 const result=parsePotatoStarchTagIndex(html,now);
 assert.equal(result.length,1);
 assert.equal(result[0].publishedAt,'2026-10-20');
 assert.equal(result[0].originalUrl,'https://potatoes.news/starch-potato-contracts-are-rising/');
 assert.equal(result[0].rawSnippet,'');
});
