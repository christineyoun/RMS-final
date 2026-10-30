/** Offline regression: newly discovered oil news goes through original-page
 * validation. An index link or dated feed entry is NEVER approved by itself. */
import assert from 'node:assert/strict';
import {parseAdditionalIndex,parseAdditionalFeed,discoverAdditionalNews} from '../additionalNewsDiscovery.ts';
import {verifyOtherCommodityArticles} from '../all8ArticleVerification.ts';
const now=new Date('2026-10-30T09:00:00Z');
const palmUrl='https://commodity-board.com/palm-oil-futures-slide-as-heavy-stocks-build';
const oilUrl='https://commodity-board.com/soybean-oil-futures-rise-on-demand-concerns';
const sugarUrl='https://commodity-board.com/india-sugar-market-price-rises-on-stocks';
const index=`<html><body>
 <a href="${palmUrl}">Palm Oil Futures Slide as Heavy Stocks Build</a>
 <a href="${oilUrl}">Soybean Oil Futures Rise on Demand Concerns</a>
 <a href="${sugarUrl}">India Sugar Market Price Rises on Stocks</a>
 <a href="https://evil.example/palm-oil-futures-are-falling">Palm Oil Futures Are Falling Fast</a>
 <a href="/category/palm-oil-market-news-prices-global-supply-demand-outlook">Palm Oil Market News and Outlook</a>
 <a href="${palmUrl}">Palm Oil Futures Slide as Heavy Stocks Build</a>
 </body></html>`;
const candidate= parseAdditionalIndex(index,'palm-oil','https://commodity-board.com/',now);
assert.equal(candidate.length,1,'Index must filter off-host, categories, duplicates and other crops');
assert.equal(candidate[0].publishedAt,'','Index does not establish article publication date');
const oilCandidate=parseAdditionalIndex(index,'soybean-oil','https://commodity-board.com/',now);
assert.equal(oilCandidate.length,1);
const sugarCandidate=parseAdditionalIndex(index,'sugar','https://commodity-board.com/',now);
assert.equal(sugarCandidate.length,1);
const rss=`<rss><channel><item><title>Palm oil stocks and exports update</title><link>${palmUrl}</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
const src={url:'https://commodity-board.com/feed/',host:'commodity-board.com',publisher:'Commodity Board',sourceType:'news'};
assert.equal(parseAdditionalFeed(rss,'palm-oil',src,now).length,1);
const fakeFetch=async (url:string|URL|Request)=>new Response(String(url).includes('/feed/')?rss:index,{headers:{'content-type':String(url).includes('/feed/')?'application/rss+xml':'text/html'}});
const discovered=await discoverAdditionalNews('palm-oil',fakeFetch as typeof fetch,now);
assert.equal(discovered.candidates.filter(x=>x.originalUrl===palmUrl).length,1,'Dedup RSS and HTML index');
const priorFetch=globalThis.fetch;
const sourceHtml=(date:string,title='Palm Oil Futures Slide as Heavy Stocks Build')=>`<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${date}"></head><body><main><article><h1>${title}</h1><p>${title}. Prices and inventories changed as exports increased and market demand shifted during the latest trading week.</p></article></main></body></html>`;
try{
 globalThis.fetch=async()=>new Response(sourceHtml('2026-10-29'),{headers:{'content-type':'text/html'}});
 const verified=await verifyOtherCommodityArticles(candidate,'palm-oil',now);
 assert.equal(verified.length,1,'Original verified date and market body are required');
 assert.equal(verified[0].publishedAt,'2026-10-29');
 globalThis.fetch=async()=>new Response(sourceHtml('2026-10-29','Soybean Oil Futures Rise on Demand Concerns'),{headers:{'content-type':'text/html'}});
 assert.equal((await verifyOtherCommodityArticles(oilCandidate,'soybean-oil',now)).length,1,'Commodity Board original pages allowed for Soybean Oil');
 globalThis.fetch=async()=>new Response(sourceHtml(''),{headers:{'content-type':'text/html'}});
 assert.equal((await verifyOtherCommodityArticles(candidate,'palm-oil',now)).length,0,'Missing original date must fail');
 globalThis.fetch=async()=>new Response(sourceHtml('2026-12-01'),{headers:{'content-type':'text/html'}});
 assert.equal((await verifyOtherCommodityArticles(candidate,'palm-oil',now)).length,0,'Future article dates must fail');
 globalThis.fetch=async()=>new Response('<html><body>Unavailable</body></html>',{status:403,headers:{'content-type':'text/html'}});
 assert.equal((await verifyOtherCommodityArticles(candidate,'palm-oil',now)).length,0,'403 must not turn a discovered link into news');
}finally{globalThis.fetch=priorFetch;}
console.log('PASS free index/RSS discovery, strict commodity/host/dedup checks, independent original date/body verification, 403 retention (no AI calls).');
