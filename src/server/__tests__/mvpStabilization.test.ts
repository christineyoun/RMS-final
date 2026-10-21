import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { observedPriceChanges } from '../../utils/observedPriceChanges.ts';
import { quoteFromResponse, COMMODITY_IDS } from '../../services/commodityQuoteSource.ts';
import { snapshotIssues } from '../mvpEvidence.ts';
import { ORIGIN_MVP, parseVerifiedPsd, parseMeteoWeather, loadAll8OriginRadar } from '../all8OriginRadarService.ts';
import { parseOfficialTtsaHtml, fetchOfficialTapiocaQuote } from '../officialTapiocaQuoteService.ts';
import { fetchHistoricalData } from '../historicalPriceService.ts';
import { GoogleGenAI } from '../paidGeminiGuard.ts';
import { createStage3Gateway } from '../stage3DailyUpdates.ts';
import { createHash } from 'node:crypto';

const protectedFiles=['.rms-stage3/ledger.json','.rms-stage3/usage.jsonl','.rms-stage3/all8-remaining-mvp.json',
  ...fs.readdirSync('.rms-stage3/snapshots').map(f=>'.rms-stage3/snapshots/'+f)];
const fingerprint=()=>protectedFiles.map(f=>f+':'+createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join('\n');
const originalEvidence=fingerprint();

const testRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mvp-routes-'));
process.env.RMS_ALL8_ORIGIN_CACHE_DIR=testRoot;
const originalFetch=globalThis.fetch;
let upstreamCalls=0;
globalThis.fetch=async()=>{upstreamCalls++;throw Error('External network disabled in offline MVP tests');};
try {
  assert.throws(()=>new GoogleGenAI({apiKey:'fixture'}),/blocked outside/);
  assert.equal(ORIGIN_MVP['palm-oil'].code,'4243000');
  const rows=[28,88,176].map((attributeId,i)=>({commodityCode:'4243000',countryCode:'MY',marketYear:'2026',month:'10',unitId:8,attributeId,value:[20000,10000,2000][i]}));
  assert.equal(parseVerifiedPsd(rows,'4243000','MY','2026')?.production,20);
  assert.equal(parseVerifiedPsd(rows.map(({commodityCode,...r})=>r),'4243000','MY','2026'),null,'identity may not be inferred');
  assert.equal(parseVerifiedPsd(rows,'4221000','MY','2026'),null);
  assert.equal(parseMeteoWeather({daily:{time:[],precipitation_sum:[]}}),null);
  for(const id of Object.keys(ORIGIN_MVP)){
    const radar=await loadAll8OriginRadar(id);
    assert.equal(radar.origins.length,4);
    assert.ok(radar.origins.every(o=>!o.production && o.status==='자료 부족'),'outage cannot invent supply/weather');
  }
  const today=new Date().toISOString().slice(0,10);
  const day=(ago:number)=>new Date(Date.parse(today)-ago*86400000).toISOString().slice(0,10);
  const points=[{date:day(30),usdPerMT:80},{date:day(7),usdPerMT:100},{date:today,usdPerMT:110}];
  for(const id of COMMODITY_IDS.filter(id=>id!=='wheat'&&id!=='potato-starch')){
    const q=quoteFromResponse(id,{success:true,...(id==='soybean-oil'?{commodity:id,symbol:'ZL=F',quoteUnit:'US¢/lb',priceUnit:'USD/MT'}:{}),data:[...points,{date:day(-2),usdPerMT:999},{date:today,usdPerMT:999,isSynthetic:true}]});
    assert.equal(q?.changeWoW,10,id+' weekly actual observations');
    assert.equal(q?.changeMoM,37.5,id+' monthly actual observations');
    assert.equal(q?.changeWoWUsdMt,10);
  }
  assert.equal(observedPriceChanges([points[0],points[2]]).wow.pct,null,'sparse data is not a weekly move');
  const html='<table><tr><td>20 Oct 2026</td><td>22</td><td>700</td></tr><tr><td>1 Sep 2026</td><td>22</td><td>600</td></tr></table>';
  assert.equal(parseOfficialTtsaHtml(html,new Date('2026-10-20T12:00:00Z'))?.wowPct,null,'TTSA gap is not a weekly change');
  const quote=await fetchOfficialTapiocaQuote();
  assert.equal(quote.dataStatus,'last-verified','TTSA retains real disk evidence during outage');
  assert.equal(quoteFromResponse('potato-starch',{success:true,data:points}),null);
  const potato=await fetchHistoricalData('potato-starch','1Y');
  assert.equal(potato.data.length,0);assert.equal(potato.success,false);
  assert.deepEqual(snapshotIssues('analysis-sugar',{success:false,error:'executiveSummary too short'}),['executiveSummary too short']);
  assert.deepEqual(snapshotIssues('news-sugar',{success:true,articles:[]}),['no-publishable-articles-after-source-and-summary-validation']);
  const gateway=createStage3Gateway();
  const request=async(url:string)=>{
    let code=0,body:any;
    const res:any={setHeader(){},end(v:string){body=JSON.parse(v);},set statusCode(v:number){code=v;},get statusCode(){return code;}};
    gateway({url,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}} as any,res,()=>{throw Error('Unexpected paid backend access: '+url);});
    for(let i=0;i<30&&!body;i++)await new Promise(r=>setTimeout(r,1));
    assert.ok(body,url+' responds');return {code,body};
  };
  for(const id of COMMODITY_IDS){
    const ai=await request('/api/ai-analysis/'+id);
    assert.ok([200,503].includes(ai.code));
    if(id==='potato-starch')assert.equal(ai.code,503);
    if(['soybean','soybean-oil','palm-oil','sugar'].includes(id))assert.equal(ai.code,503);
    const news=await request('/api/market-intelligence?commodity='+id);
    assert.equal(news.code,200);assert.ok(Array.isArray(news.body.articles));
  }
  const detail=fs.readFileSync('src/components/CommodityDetail.tsx','utf8');
  assert.ok(detail.includes('id="commodity-pdf-page-1"')&&detail.includes('id="commodity-pdf-page-2"'));
  assert.equal((detail.match(/pdf\.addPage\(/g)||[]).length,1,'two-page export preserved');
  assert.equal(fingerprint(),originalEvidence,'runtime snapshots and paid refresh history remain byte-identical');
  console.log('PASS: eight AI routes; eight news routes; all price adapters; source gates; PDF structure; unchanged snapshots/history; zero paid API calls.');
}finally{globalThis.fetch=originalFetch;delete process.env.RMS_ALL8_ORIGIN_CACHE_DIR;fs.rmSync(testRoot,{recursive:true,force:true});}
