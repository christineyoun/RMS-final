/** Regression: an explicitly successful empty verified-news response must not
 * be replaced with previous Overview issues whose original receipts may have
 * been rejected, expired or lost. A failed API read may retain the prior bundle.
 * Non-paid and network-free. */
import assert from 'node:assert/strict';
import {loadOverviewIntelligence} from '../../utils/overviewIntelligence.ts';
const id='corn';
const previous={id,analysis:null,articles:[{title:'Old issue',summary:'과거 옥수수 생산 전망 하향',publishedAt:'2026-10-28',originalUrl:'https://example.com/old',linkStatus:'verified'}]};
const publication={version:1,data:{inputs:[previous]}};
const reply=(value:any)=>({ok:true,json:async()=>value});
async function test(news:any,failNews=false){
 const fetched:string[]=[];
 const fakeFetch=(async(url:string)=>{
  fetched.push(url);
  if(url==='/api/rms/free-publication')return reply(publication);
  if(url==='/api/ai-analysis/corn')return reply({success:true,data:null});
  if(url==='/api/market-intelligence?commodity=corn'){
   if(failNews)throw Error('news offline');return reply(news);
  }
  if(url.startsWith('/api/market-intelligence?commodity='))return reply({success:true,articles:[]});
  if(url.startsWith('/api/ai-analysis/'))return reply({success:true,data:null});
  if(url==='/api/overview/comparison')return {ok:false};
  throw Error('Unexpected '+url);
 }) as typeof fetch;
 const result=await loadOverviewIntelligence(fakeFetch);
 return {result,fetched};
}
const empty=await test({success:true,articles:[]});
assert.equal(empty.result.inputArticleCount,0,'explicitly empty verified API cannot revive previous news');
assert.equal(empty.result.distinctArticleCount,0);
const failed=await test(null,true);
assert.equal(failed.result.inputArticleCount,1,'unavailable news API may retain previously published bundle');
console.log('PASS Overview: successful empty verified news is authoritative, fetch failure retains published fallback');
