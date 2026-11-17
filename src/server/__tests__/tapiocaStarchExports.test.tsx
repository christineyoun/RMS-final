import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {TapiocaCropSupplyCard} from '../../components/TapiocaCropSupplyCard.tsx';
import {readThaiStarchExports,TTSA_ANNUAL_EXPORTS} from '../../utils/thaiStarchExports.ts';
import {createGeminiApiMiddleware} from '../geminiApi.ts';
import {withSavedDataRead} from '../freeRefreshNetwork.ts';
import {dailyFreeSourceJobs} from '../freeDailyJobs.ts';
import {publicRouteKey,publicCaptureRoutes} from '../publicDeploymentRoutes.mjs';
import {parseThaiStarchExports,readSavedThaiStarchExports,refreshThaiStarchExports} from '../thaiStarchExportRefresh.ts';

const now=new Date(),year=now.getUTCFullYear();
const dataRow=(y:number,n='4,400,000',m='1,200,000')=>`<tr><td>${y}</td><td>88,000</td><td>${m}</td><td>7,000</td><td>${n}</td></tr>`;
function exportPage(rows:string,note=''){
  // Reorder both product groups and volume/value columns to exercise header mapping.
  return `<table id="tbl_tpc_export"><thead>
  <tr><th rowspan="3">Year</th><th colspan="2">2</th><th colspan="2">1</th></tr>
  <tr><th colspan="2">Modeified Starch</th><th colspan="2">Native Starch</th></tr>
  <tr><th>Value<br/>(M.Baht)</th><th>Volume<br/>(Ton)</th><th>Value<br/>(M.Baht)</th><th>Volume<br/>(Ton)</th></tr>
  </thead><tbody>${rows}</tbody></table><div><p>${note}</p><p>Source: Thai Customs Department</p></div>`;
}

test('TTSA parser reads the correct tonne columns and refuses current, future, partial, and ambiguous years',()=>{
  const raw=exportPage(dataRow(year+1)+dataRow(year)+dataRow(year-1)+dataRow(year-2,'4,000,000','1,500,000'));
  const p=parseThaiStarchExports(raw,now);
  assert.deepEqual(p?.current,{calendarYear:year-1,nativeTonnes:4_400_000,modifiedTonnes:1_200_000});
  assert.equal(p?.previous?.calendarYear,year-2);
  assert.equal(parseThaiStarchExports(raw.replaceAll('(Ton)','(Kg)'),now),null);
  assert.equal(parseThaiStarchExports(raw.replace('Thai Customs Department','Unrelated source'),now),null);
  assert.equal(parseThaiStarchExports(exportPage(dataRow(year-1)+dataRow(year-1)),now),null);
  assert.equal(parseThaiStarchExports(exportPage(dataRow(year-1,'4,2')),now),null);
  assert.equal(parseThaiStarchExports(exportPage(dataRow(year-1)+dataRow(year-2),`Note: ${year-1} Data from January to September`),now)?.current.calendarYear,year-2);
  assert.equal(parseThaiStarchExports(exportPage(dataRow(year-1)+dataRow(year-3)),now)?.previous,undefined);
  assert.equal(readThaiStarchExports({...p,unit:'kMT'},now),null);
  assert.equal(readThaiStarchExports({...p,current:{...p?.current,calendarYear:year}},now),null);
});

test('the annual job retains verified exports on outages and old responses, and accepts each new completed year',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-tapioca-exports-'));
  try{
    const job=dailyFreeSourceJobs().find(x=>x.key==='tapioca-starch-exports');
    assert.equal(job?.commodity,'tapioca-starch');
    assert.equal(job?.cadenceHours,24);
    let html=exportPage(dataRow(year-2)+dataRow(year-3)),status=200;
    const fetcher:typeof fetch=async (url,init)=>{
      assert.equal(url,TTSA_ANNUAL_EXPORTS);
      assert.equal(init?.redirect,'error');
      return new Response(html,{status});
    };
    const check=()=>refreshThaiStarchExports({root,now,fetcher});
    const first=(await check()).data;
    assert.equal(first?.current.calendarYear,year-2);
    html=exportPage(dataRow(year-1)+dataRow(year-2));
    const second=(await check()).data;
    assert.equal(second?.current.calendarYear,year-1);
    status=503;
    const outage=await check();
    assert.deepEqual(outage.data,second);
    assert.match(outage.lastError??'',/503/);
    status=200;html=exportPage(dataRow(year-2));
    assert.deepEqual((await check()).data,second);
    html=exportPage(dataRow(year-1));
    assert.deepEqual((await check()).data,second,'a partial response cannot remove the prior-year comparison');
    assert.deepEqual(readSavedThaiStarchExports(root,now),second);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('exact Cloud-saved GET exposes independently verified annual rows without pulling the price quote',async()=>{
  const route='/api/starch/tapioca-supply';
  assert.equal(publicRouteKey(route),route);
  assert.equal(publicRouteKey(route+'?force=true'),null);
  assert(publicCaptureRoutes().includes(route));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-tapioca-export-reader-')),oldRoot=process.cwd();
  try{
    process.chdir(root);
    const {data}=await refreshThaiStarchExports({now,fetcher:async()=>new Response(exportPage(dataRow(year-1)+dataRow(year-2,'4,000,000','1,500,000')))});
    assert(data);
    const middleware=createGeminiApiMiddleware();
    const payload=await withSavedDataRead(()=>new Promise<any>((resolve,reject)=>{
      const req={url:route,method:'GET',headers:{},socket:{remoteAddress:'127.0.0.1'}};
      const res={statusCode:0,setHeader(){},end(body:string){resolve({status:this.statusCode,...JSON.parse(body)});}};
      Promise.resolve(middleware(req as any,res as any,()=>reject(Error('Saved route not handled')))).catch(reject);
    }));
    assert.equal(payload.status,200);
    assert.equal(payload.cropSupply,null);
    assert.equal(payload.quote,undefined);
    assert.deepEqual(payload.exportSupply,data);
    const $=load(renderToStaticMarkup(createElement(TapiocaCropSupplyCard,{crop:null,exports:payload.exportSupply})));
    assert.equal($('[data-supply-grid="exports"] h4').text(),`태국 수출 · ${year-1}년`);
    assert.deepEqual($('tbody td').map((_,el)=>$(el).text()).get(),['4.40 MMT','+10.0%','1.20 MMT','-20.0%']);
    assert.equal($('.rms-source-group a').attr('href'),TTSA_ANNUAL_EXPORTS);
    assert.doesNotMatch($.text(),/FOB BKK|TTSA 시세|WoW/);
  }finally{process.chdir(oldRoot);fs.rmSync(root,{recursive:true,force:true});}
});
