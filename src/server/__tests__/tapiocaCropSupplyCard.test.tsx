import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {TapiocaCropSupplyCard} from '../../components/TapiocaCropSupplyCard.tsx';
import {readThaiCassavaSupply} from '../../utils/thaiCassavaSupply.ts';
import {createGeminiApiMiddleware} from '../geminiApi.ts';
import {dailyFreeSourceJobs} from '../freeDailyJobs.ts';
import {withSavedDataRead} from '../freeRefreshNetwork.ts';
import {parseThaiCassavaSurvey,refreshStarchOriginSupply,readSavedThaiCassavaSupply,THAI_CASSAVA_SURVEYS,AFSIS_ACO_INDEX} from '../starchOriginSupplyRefresh.ts';

const now=new Date(),year=now.getUTCFullYear();
const month=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(now);
const period=(y:number)=>y+'/'+String(y+1).slice(-2);
const digest='a'.repeat(64);
function table(y:number,options:{production?:number;details?:boolean;wrongUnits?:boolean;badYield?:boolean}={}){
 const p=options.production??20_000_000;
 return '<h5>CASSAVA CROP SURVEYS</h5><table>'+
  '<tr><th>Year (A.D.)</th><td>'+period(y-1)+'</td><td>*'+period(y)+'</td></tr>'+
  (options.details?(
   '<tr><td>Harvesting Acreage ('+(options.wrongUnits?'Hectare':'Rai')+')</td><td>6,000,000</td><td>8,000,000</td></tr>'+
   '<tr><td>Yield Per Rai (Ton/Rai)</td><td>3.000</td><td>'+(
     options.badYield?'8.999':(p/8_000_000).toFixed(3))+'</td></tr>'
  ):'')+
  '<tr><td>Total Production (Ton)</td><td>18,000,000</td><td>'+p.toLocaleString('en-US')+'</td></tr>'+
  '</table><p>Remark: *Tapioca Crop Survey in '+month+' '+y+'</p>';
}

test('same dated table supplies current and previous harvest area and yield without deriving missing values',()=>{
 const [r]=parseThaiCassavaSurvey(table(year,{details:true}),now);
 assert.equal(r.reportingYear,period(year));assert.equal(r.estimateStatus,'forecast');
 assert.equal(r.productionTonnes,20_000_000);assert.equal(r.harvestedAreaRai,8_000_000);assert.equal(r.yieldTonnesPerRai,2.5);
 assert.equal(r.previous?.reportingYear,period(year-1));assert.equal(r.previous?.harvestedAreaRai,6_000_000);
 assert.equal(r.previous?.yieldTonnesPerRai,3);
 assert.equal(parseThaiCassavaSurvey(table(year,{details:true,wrongUnits:true}),now)[0].harvestedAreaRai,undefined);
 const [conflict]=parseThaiCassavaSurvey(table(year,{details:true,badYield:true}),now);
 assert.equal(conflict.harvestedAreaRai,undefined);assert.equal(conflict.yieldTonnesPerRai,undefined);
 assert.equal(conflict.productionTonnes,20_000_000);
 const future=table(year+1,{details:true});assert.deepEqual(parseThaiCassavaSurvey(future,now),[]);
});

test('saved-only supply route reads the scheduled crop packet; new season and duplicate recovery preserve trust',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-cassava-card-'));
 const oldCwd=process.cwd(),oldHistory=process.env.RMS_HISTORY_ROOT;
 try{
  process.chdir(root);
  process.env.RMS_HISTORY_ROOT=root;
  fs.mkdirSync('src/data',{recursive:true});
  fs.writeFileSync('src/data/cache_tapioca.json','{}');
  // No valid FOB quote is required to publish a valid crop supply packet.
  const middleware=createGeminiApiMiddleware();
  const read=()=>withSavedDataRead(()=>new Promise<any>((resolve,reject)=>{
   const req={url:'/api/starch/tapioca-supply',method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}};
   const res={statusCode:0,setHeader(){},end(value:string){resolve({status:this.statusCode,...JSON.parse(value)});}};
   void middleware(req as any,res as any,()=>reject(Error('Saved route not handled')));
  }));
  const existing=dailyFreeSourceJobs().find(j=>j.key==='starch-origin-supply-tapioca-starch');
  assert(existing);
  let html=table(year-1),fail=false,sourceReads=0;
  const fetcher:typeof fetch=async input=>{
   sourceReads++;if(String(input)===AFSIS_ACO_INDEX)return new Response('<p>No matching fixture</p>');
   assert.equal(String(input),new URL(THAI_CASSAVA_SURVEYS).href);
   return fail?new Response('',{status:503}):new Response(html);
  };
  const refresh=()=>refreshStarchOriginSupply('tapioca-starch',{root,now,fetcher});
  await refresh();
  const saved=await read();
  assert.equal(saved.status,200);
  assert.equal(saved.exportSupply,null);
  assert.equal(saved.cropSupply.current.reportingYear,period(year-1));
  assert.equal(saved.cropSupply.current.harvestedAreaRai,undefined);

  html=table(year-1,{details:true});await refresh();
  assert.equal(readSavedThaiCassavaSupply(root,now)?.current.harvestedAreaRai,8_000_000,'production-only legacy record is upgraded');
  html=table(year-1);await refresh();
  assert.equal(readSavedThaiCassavaSupply(root,now)?.current.harvestedAreaRai,8_000_000,'same release cannot erase verified area/yield');

  html=table(year,{details:true,production:24_000_000});await refresh();
  const beforeRead=sourceReads;
  const newer=await read();
  assert.equal(sourceReads,beforeRead);
  assert.equal(newer.cropSupply.current.reportingYear,period(year));
  assert.equal(newer.cropSupply.current.productionTonnes,24_000_000);
  assert.equal(newer.cropSupply.current.yieldTonnesPerRai,3);
  assert.equal(newer.cropSupply.previous.reportingYear,period(year-1));
  fail=true;assert((await refresh()).includes('thai-survey'));
  assert.deepEqual((await read()).cropSupply,newer.cropSupply);
  fail=false;html=table(year-1);await refresh();
  assert.deepEqual((await read()).cropSupply,newer.cropSupply,'older release never rolls the live card backwards');

  const $=load(renderToStaticMarkup(createElement(TapiocaCropSupplyCard,{crop:newer.cropSupply,exports:newer.exportSupply})));
  assert.equal($('[data-supply-year]').text(),'Market Year: '+period(year));
  assert.match($.text(),/24\.00 MMT/);assert.match($.text(),/8,000 kRAI/);assert.match($.text(),/3\.000 MT\/Rai/);
  const sourceFooter=$('.rms-source-group');
  assert.equal(sourceFooter.find('a').length,1);
  assert.equal(sourceFooter.find('a').first().attr('href'),newer.cropSupply.source.url);
  assert.doesNotMatch($.text(),/TTSA 시세|FOB BKK|2\.85 MMT|1\.15 MMT/);
  assert.equal($('[data-supply-grid="current"] > div').length,3);
 }finally{
  process.chdir(oldCwd);
  if(oldHistory===undefined)delete process.env.RMS_HISTORY_ROOT;else process.env.RMS_HISTORY_ROOT=oldHistory;
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('saved reader rejects unverified origin and never substitutes nonmatching prior crop-year figures',()=>{
 const source={name:'TTTA',url:THAI_CASSAVA_SURVEYS,sha256:digest,reportDate:now.toISOString().slice(0,7),retrievedAt:now.toISOString()};
 const packet={scope:'thailand-cassava',estimateStatus:'actual',source,
  current:{reportingYear:period(year),productionTonnes:20_000_000},
  previous:{reportingYear:period(year-2),productionTonnes:19_000_000,harvestedAreaRai:7_000_000}};
 const accepted=readThaiCassavaSupply(packet,now);
 assert(accepted);assert.equal(accepted.previous,undefined);assert.equal(accepted.current.harvestedAreaRai,undefined);
 assert.equal(readThaiCassavaSupply({...packet,source:{...source,url:'https://other.example.org/survey'}},now),null);
 assert.equal(readThaiCassavaSupply({...packet,source:{...source,sha256:''}},now),null);
 assert.equal(readThaiCassavaSupply({...packet,source:{...source,reportDate:'2026-02-31'}},now),null);
});
