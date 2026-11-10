import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWideNews} from '../freeWideNewsDiscovery.ts';

const xml=items=>`<?xml version="1.0"?><rss version="2.0"><channel>${items.map(({title,url})=>`<item><title>${title}</title><link>${url}</link><pubDate>Sun, 08 Nov 2026 12:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;

test('all configured searches are inspected even when the first produces many unverified candidates', async()=>{
 const queries=[];
 const feed=xml(Array.from({length:20},(_,i)=>({
  title:`Soybean oil prices and export demand report ${i}`,
  url:`https://www.world-grain.com/articles/soybean-oil-${i}`
 })));
 const fetcher=async uri=>{
  const query=new URL(String(uri)).searchParams.get('q');
  queries.push(query);
  // A distinct second query must be considered even if the first has 20 hits.
  return new Response(query===queries[0]?feed:xml([{title:'Soybean oil export price outlook',url:'https://www.reuters.com/world/soy-oil-outlook'}]),{status:200});
 };
 const found=await discoverWideNews('soybean-oil',fetcher,new Date('2026-11-09T01:00:00Z'),0);
 assert.equal(queries.length,4);
 assert.ok(found.candidates.some(a=>a.originalUrl==='https://www.reuters.com/world/soy-oil-outlook'));
 assert.ok(found.candidates.length<=8);
 assert.ok(found.candidates.every(a=>a.rawSnippet===''));
});

test('failed provider stops searching rather than repeatedly retrying',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return new Response('blocked',{status:403})};
 const found=await discoverWideNews('soybean-oil',fetcher,new Date(),0);
 assert.equal(calls,1);
 assert.equal(found.candidates.length,0);
});
