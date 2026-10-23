import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {savedGraphHistoryResponse,validateSavedCornHistory,retainCornGraphHistory,rememberGraphRefresh} from '../savedGraphHistory.ts';

const files=['.rms-price-history/wheat.json','.rms-price-history/palm-oil.json','.rms-price-history/corn.json','.rms-price-history/soybean.json','.rms-price-history/soybean-oil.json','.rms-price-history/tapioca-starch.json','.rms-stage3/evidence/sugar-price.json'];
const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before=files.map(digest),original=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Graph GET must be saved-only');};
try{
 const {createGeminiApiMiddleware}=await import('../geminiApi.ts');const middleware=createGeminiApiMiddleware();
 for(const url of ['/api/uswheat/price-history','/api/history?commodity=corn&timeframe=5Y','/api/corn/price-history','/api/history/corn?timeframe=1M','/api/history?commodity=palm-oil&timeframe=5Y','/api/history?commodity=palmoil','/api/soybean/price-snapshot','/api/soybean-oil/price-snapshot','/api/sugar/price-snapshot','/api/history?commodity=tapioca-starch&timeframe=5Y']){
  let payload:any;const res:any={statusCode:0,setHeader(){},end(body:string){payload=JSON.parse(body);}};
  await middleware({url,method:'GET'} as any,res,()=>{throw Error('Graph route fell through');});
  assert.equal(res.statusCode,200,url);assert.equal(payload.success,true,url);assert(payload.data.length>1,url);
  assert(payload.data.every((p:any)=>!p.isSynthetic),url);
  if(url.includes('uswheat')){assert.equal(payload.reportDate,'October 16, 2026');assert.equal(payload.latestSourceType,'source-verified');assert.equal(payload.primaryUnit,'USD/MT');}
  if(url.includes('price-snapshot')&&url.includes('soybean')){
   const id=url.includes('soybean-oil')?'soybean-oil':'soybean';
   const saved=JSON.parse(fs.readFileSync('.rms-price-history/'+id+'.json','utf8'));
   assert.deepEqual(payload.data,saved.snapshot.data);assert.deepEqual(payload.procurementAnalysis,saved.snapshot.procurementAnalysis);
  }
 }
 assert.equal(await savedGraphHistoryResponse('/api/history?commodity=corn&force=true'),null,'explicit refresh path unchanged');
 assert.equal(await savedGraphHistoryResponse('/api/uswheat/price-history?force=true'),null);
 assert.equal(await savedGraphHistoryResponse('/api/market-intelligence?commodity=corn'),null,'unrelated APIs untouched');
 const corn=JSON.parse(fs.readFileSync('.rms-price-history/corn.json','utf8')).payload;
 assert.throws(()=>validateSavedCornHistory({...corn,commodity:'sugar'}));
 assert.throws(()=>validateSavedCornHistory({...corn,data:corn.data.map((p:any,i:number)=>i?p:{...p,usdPerMT:1})}));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-missing-corn-')),oldRoot=process.env.RMS_HISTORY_ROOT;
 try{
  process.env.RMS_HISTORY_ROOT=temp;const missing=await savedGraphHistoryResponse('/api/history?commodity=corn');assert.equal(missing?.status,503);assert.deepEqual(missing?.payload.data,[]);assert.match(missing?.payload.error,/저장된 CBOT/);
  retainCornGraphHistory(corn);
  await rememberGraphRefresh('corn',{...corn,data:corn.data.slice(-4)});
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'.rms-price-history/corn.json'),'utf8')).payload.data.length,corn.data.length,'short manual refresh cannot discard older observations');
 }finally{if(oldRoot===undefined)delete process.env.RMS_HISTORY_ROOT;else process.env.RMS_HISTORY_ROOT=oldRoot;fs.rmSync(temp,{recursive:true,force:true});}
 const sugar=JSON.parse(JSON.parse(fs.readFileSync('.rms-stage3/evidence/sugar-price.json','utf8')).body);
 await rememberGraphRefresh('sugar',{...sugar,manualRefreshTest:true});
 assert.equal((await savedGraphHistoryResponse('/api/sugar/price-snapshot'))?.payload.manualRefreshTest,true,'successful explicit refresh supersedes cold-start receipt in memory');
 assert.equal(calls,0);assert.deepEqual(files.map(digest),before,'all source files remain immutable across graph GETs');
 console.log('PASS all seven saved graph endpoints, wheat report/source dates, unchanged soybean procurement payloads, aliases/timeframes, source identity, explicit refresh bypass, honest missing data and zero fetch/writes');
}finally{globalThis.fetch=original;}
