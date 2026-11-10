import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePotatoMarketCategory,discoverPotatoMarketCategory,POTATO_MARKET_INDEX} from '../potatoMarketCategoryDiscovery.ts';
const now=new Date('2026-11-04T01:00:00Z');
const article=(title:string,url:string,date:string)=>'<article><a href="'+url+'"><h3>'+title+'</h3></a><div>'+date+'</div></article>';
test('publisher archive suggests dated original articles, no auto approval',()=>{
 const html=article('Northwest EU Potatoes: Smaller Dutch Crop, Firm Prices and Stable Indices',
  '/northwest-eu-potatoes-smaller-dutch-crop-firm-prices-and-stable-indices','Oct 30, 2026')+
  article('Tight EU Crop Keeps PotatoNL Firm While Starch Prices Hold Flat',
  '/tight-eu-crop-keeps-potatonl-firm-while-starch-prices-hold-flat','Oct 27, 2026')+
  article('Potato processor appoints new CEO','/potato-processor-appoints-new-ceo','Oct 30, 2026')+
  article('Potato starch supply outlook changes','https://evil.example.org/unsafe','Nov 3, 2026')+
  article('Potato starch supplies in Europe','/potato-starch-supplies-in-europe','Sep 3, 2026');
 const result=parsePotatoMarketCategory(html,now);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(a=>a.publishedAt),['2026-10-30','2026-10-27']);
 assert.equal(result[0].originalUrl,'https://commodity-board.com/northwest-eu-potatoes-smaller-dutch-crop-firm-prices-and-stable-indices');
 assert.equal(result[0].rawSnippet,'');
});
test('fetch failure preserves saved data by returning no candidates',async()=>{
 const fetcher=async()=>new Response('',{status:503});
 const result=await discoverPotatoMarketCategory(fetcher as typeof fetch,now);
 assert.equal(result.candidates.length,0);
 assert.match(result.errors[0],/HTTP 503/);
});
test('HTML archive is not original article approval',async()=>{
 const html=article('Potato starch prices firm on reduced harvest',
   '/potato-starch-prices-firm-on-reduced-harvest','November 3, 2026');
 const fetcher=async (url:string|URL|Request)=>{
   assert.equal(String(url),POTATO_MARKET_INDEX);
   return new Response(html,{status:200,headers:{'content-type':'text/html'}});
 };
 const result=await discoverPotatoMarketCategory(fetcher as typeof fetch,now);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].rawSnippet,'');
});
