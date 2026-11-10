import assert from 'node:assert/strict';
import test from 'node:test';
import {parseIndustryIndex} from '../additionalNewsDiscovery.ts';
import {parsePotatoStarchTagIndex} from '../potatoStarchTagDiscovery.ts';

const now=new Date('2026-11-05T00:00:00Z');

test('PotatoPro index: date adjacent BEFORE link supplies candidate metadata',()=>{
  const html=`<body><div class="date">October 08, 2026</div>
    <div class="content"><a href="/news/2026/starch-factory-expands-production-capacity">Lyckeby Expands Modified Potato Starch Production Capacity</a></div></body>`;
  const results=parseIndustryIndex(html,'potato-starch',now);
  assert.equal(results.length,1);
  assert.equal(results[0].publishedAt,'2026-10-08');
  assert.equal(results[0].originalUrl,'https://www.potatopro.com/news/2026/starch-factory-expands-production-capacity');
  assert.equal(results[0].rawSnippet,'');
});

test('PotatoPro rejects stale articles and URLs outside original publisher',()=>{
  const html=`<body>September 08, 2026 <a href="/news/2026/potato-starch-output-falls">Potato Starch Output Falls on Drought</a>
  October 09, 2026 <a href="https://untrusted.example/news/2026/potato-starch-output">Potato Starch Output Reduced</a></body>`;
  assert.equal(parseIndustryIndex(html,'potato-starch',now).length,0);
});

test('Potatoes.News tag: neighboring date after headline is accepted',()=>{
  const html=`<body><h2><a href="/global-starch-potatoes-hold-industrial-demand/">Global: Starch Potatoes Hold Their Niche in Industrial Markets</a></h2>
  <p>20.10.2026</p></body>`;
  const results=parsePotatoStarchTagIndex(html,now);
  assert.equal(results.length,1);
  assert.equal(results[0].publishedAt,'2026-10-20');
  assert.equal(results[0].rawSnippet,'');
});

test('Potatoes.News tag still rejects undated and old index links',()=>{
 const html=`<body><a href="/undated-starch-potato-contract-shortage/">Starch Potatoes Contract Shortage Prices Rising</a>
 <a href="/starch-potato-freight-costs/">Potato Starch Freight Costs Rise on Shortage</a> 01.09.2026</body>`;
 assert.deepEqual(parsePotatoStarchTagIndex(html,now),[]);
});


test('PotatoPro never borrows a later, newer date for an old article',()=>{
 const html=`<body>September 08, 2026 <a href="/news/2026/starch-output-shortfall">Potato Starch Output Falls on Drought</a>
 October 09, 2026 <a href="https://untrusted.example/news/2026/starch-trade">Potato Starch Trade Higher</a></body>`;
 assert.deepEqual(parseIndustryIndex(html,'potato-starch',now),[]);
});

test('PotatoPro does not reuse an earlier article date for an undated headline',()=>{
 const html=`<body><span>November 04, 2026</span><a href="/news/2026/starch-prices-rise">Potato Starch Prices Rise on Demand</a>
 <a href="/news/2026/starch-production-update">Potato Starch Production Faces New Constraints</a></body>`;
 const rows=parseIndustryIndex(html,'potato-starch',now);
 assert.equal(rows.length,1);
 assert.match(rows[0].originalUrl,/starch-prices-rise/);
});

test('PotatoPro index supports new calendar years, without a year-specific URL rule',()=>{
 const nextYear=new Date('2027-01-06T00:00:00Z');
 const html=`<body><div>January 04, 2027</div><div><a href="/news/2027/potato-starch-prices-update">Potato Starch Prices Change on Supply Conditions</a></div></body>`;
 const rows=parseIndustryIndex(html,'potato-starch',nextYear);
 assert.equal(rows.length,1);
 assert.equal(rows[0].publishedAt,'2027-01-04');
});

test('PotatoPro never accepts another publisher or unrelated paths',()=>{
 const html=`<body><div>November 04, 2026</div>
 <a href="https://untrusted.example/news/2026/potato-starch-report">Potato Starch Prices and Shortages</a>
 <a href="/news/not-a-year/potato-starch-report">Potato Starch Markets Under Pressure</a></body>`;
 assert.deepEqual(parseIndustryIndex(html,'potato-starch',now),[]);
});


test('PotatoPro live card: empty overlay anchor uses publisher title attribute and local date',()=>{
 const html=`<body><div class="node node--type-article node--view-mode-tiles ds-1col">
   <div><div class="field field--name-dynamic-token-fieldnode-url-for-tiles">
    <a id="content-176574" href="/news/2026/lyckeby-begins-construction-new-tank-facility-expand-modified-potato-starch-capacity"
       class="main-link-wrap" title="Lyckeby Begins Construction of New Tank Facility to Expand Modified Potato Starch Capacity"></a>
   </div><div class="field"><span>October 08, 2026</span></div>
   <h3><a href="/news/2026/lyckeby-begins-construction-new-tank-facility-expand-modified-potato-starch-capacity">Lyckeby Begins Construction of New Tank Facility to Expand Modified Potato Starch Capacity</a></h3>
   </div></div></body>`;
 const articles=parseIndustryIndex(html,'potato-starch',now);
 assert.equal(articles.length,1);
 assert.equal(articles[0].publishedAt,'2026-10-08');
 assert.match(articles[0].rawTitle,/Modified Potato Starch Capacity/);
 assert.match(articles[0].originalUrl,/^https:\/\/www\.potatopro\.com\/news\/2026\/lyckeby/);
 assert.equal(articles[0].rawSnippet,'');
});

test('PotatoPro title-only overlay does not inherit date from adjacent article card',()=>{
 const html=`<body><div class="node node--view-mode-tiles"><div>
   <a href="/news/2026/undated-potato-starch" title="Potato Starch Production Change Under Review"></a>
   </div></div>
   <div class="node node--view-mode-tiles"><div><p>November 04, 2026</p>
   <a href="/news/2026/new-potato-starch" title="Potato Starch Capacity Expansion Approved"></a>
   </div></div></body>`;
 const articles=parseIndustryIndex(html,'potato-starch',now);
 assert.equal(articles.length,1);
 assert.match(articles[0].originalUrl,/new-potato-starch/);
});
