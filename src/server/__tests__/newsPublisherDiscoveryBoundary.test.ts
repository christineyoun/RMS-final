import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOtherCommodityArticles} from '../all8ArticleVerification.ts';

// Example domains and sample article text are TEST FIXTURES only, never used in live behavior.
const originalFetch = globalThis.fetch;
const date = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const article = {
  rawId: 'sample-one', rawTitle: 'Soybean oil stocks increase as crushing output rises',
  rawSnippet: '', sourceName: 'Independent Example', sourceType: 'news' as const,
  publishedAt: date, originalUrl: 'https://independent-example.org/markets/soybean-oil-crushing',
  retrievedAt: new Date().toISOString()
};
const paragraph = 'Soybean oil stocks increased after processors expanded crushing activity, while demand from biodiesel buyers remained uncertain. '.repeat(9);
const html = (heading: string) => `<html><head><meta property="article:published_time" content="${date}T09:00:00Z"></head><body><main><h1>${heading}</h1><article>${paragraph}</article></main></body></html>`;

test('unfamiliar HTTPS original publisher can pass independently verified source checks', async () => {
  globalThis.fetch = (async () => new Response(html(article.rawTitle), {status: 200, headers: {'content-type': 'text/html'}})) as typeof fetch;
  try {
    const verified = await verifyOtherCommodityArticles([article], 'soybean-oil');
    assert.equal(verified.length, 1);
    assert.equal(verified[0]?.originalUrl, article.originalUrl);
    assert.ok((verified[0]?.rawSnippet.length ?? 0) > 400);
  } finally {globalThis.fetch = originalFetch;}
});

test('original-page verification still rejects unrelated pages and blocked responses', async () => {
  for (const response of [
    new Response(html('CEO appointment and leadership update'), {status:200, headers:{'content-type':'text/html'}}),
    new Response('',{status:403, headers:{'content-type':'text/html'}}),
    new Response(html(article.rawTitle), {status:200, headers:{'content-type':'application/json'}})
  ]) {
    globalThis.fetch = (async () => response) as typeof fetch;
    try {assert.equal((await verifyOtherCommodityArticles([article], 'soybean-oil')).length,0);}
    finally {globalThis.fetch = originalFetch;}
  }
});
