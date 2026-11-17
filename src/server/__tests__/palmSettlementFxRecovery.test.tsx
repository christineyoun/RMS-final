import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {CommodityDetail} from '../../components/CommodityDetail.tsx';
import {COMMODITIES} from '../../data/commoditiesData.ts';
import {palmSettlementAwaitingFx} from '../../utils/palmPriceIntegrity.ts';
import {palmSettlementFxGap,refreshPalmDatedFx} from '../palmPricePolicy.ts';
import {PRICE_SOURCES,savePublicHistory,type PublicHistory,type PublicPricePoint} from '../publicPriceHistory.ts';
import {savedGraphHistoryResponse} from '../savedGraphHistory.ts';

const dates=['2026-11-11','2026-11-12','2026-11-13'];
const point=(index:number,value:number):PublicPricePoint=>({
  benchmark:'palm-cpo',observationKind:'exchange-settlement',contractMonth:'2027-01',
  date:dates[index],value,unit:'MYR/MT',sourceUrl:PRICE_SOURCES.mpocCpo,provenance:'source-verified',
});
const priorFx={rate:4.0735,rateDate:dates[0],sourceUrl:'https://api.frankfurter.dev/v1/2026-11-11?base=USD&symbols=MYR',checkedAt:'2026-11-12T00:00:00.000Z'};
const history:PublicHistory={version:1,points:[point(0,4410),point(1,4440),point(2,4462)],datedFx:{[dates[0]]:priorFx}};
const url='/api/history?commodity=palm-oil&timeframe=5Y';

test('a timeout retries once, fills both settlements, and does not alter the prior rates or native data',async()=>{
  let calls=0;
  const recovered=await refreshPalmDatedFx(history,async(input,options)=>{
    assert.match(String(input),/\/2026-11-05\.\.2026-11-13\?base=USD&symbols=MYR$/);
    assert(options?.signal);
    if(++calls===1)throw new DOMException('test timeout','TimeoutError');
    return Response.json({base:'USD',rates:{
      '2026-11-12':{MYR:4.064},'2026-11-13':{MYR:4.05},'2026-11-14':{MYR:99}
    }});
  });
  assert.equal(calls,2);
  assert.equal(recovered.fxError,undefined);
  assert.equal(palmSettlementFxGap(recovered),null);
  assert.deepEqual(recovered.points,history.points);
  assert.deepEqual(recovered.datedFx?.[dates[0]],priorFx);
  assert.equal(recovered.datedFx?.[dates[1]].rate,4.064);
  assert.equal(recovered.datedFx?.[dates[2]].rate,4.05);
  assert(!recovered.datedFx?.['2026-11-14']);
});

test('bounded outage keeps native dates, the old chart close and a distinct explanation',async()=>{
  let calls=0;
  const retained=await refreshPalmDatedFx(history,async()=>{
    calls++;
    return new Response('',{status:503});
  });
  assert.equal(calls,2);
  assert.match(retained.fxError||'',/503/);
  assert.deepEqual(retained.datedFx,history.datedFx);
  assert.deepEqual(retained.points,history.points);
  assert.equal(palmSettlementFxGap(retained)?.observationDate,dates[2]);

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-palm-verified-fx-'));
  const root=process.env.RMS_HISTORY_ROOT;
  try{
    process.env.RMS_HISTORY_ROOT=temp;
    savePublicHistory('palm-oil',retained);
    const saved=await savedGraphHistoryResponse(url);
    assert.equal(saved?.status,200);
    assert.equal(saved?.payload.cpoObservationDate,dates[2]);
    assert.equal(saved?.payload.priceMyr,4462);
    assert.equal(saved?.payload.cpoUsdMt,null);
    assert.equal(saved?.payload.data.find((p:any)=>p.date===dates[1]).cpoUsd,undefined);
    assert.equal(saved?.payload.data.find((p:any)=>p.date===dates[2]).cpoUsd,undefined);
    assert.deepEqual(palmSettlementAwaitingFx(saved?.payload.data),{date:dates[2],myr:4462,convertedDate:dates[0]});
    const render=(payload:any)=>{
      const commodity={...COMMODITIES.find(c=>c.id==='palm-oil')!,_canonicalHistorySnapshot:payload};
      const html=renderToStaticMarkup(<CommodityDetail commodity={commodity} currency="USD" onNavigateBack={()=>{}} onRefreshGemini={()=>{}} isSyncing={false}/>);
      return load(html);
    };
    const $=render(saved?.payload);
    assert.match($('p').text(),/2026\.11\.13 · 4,462 MYR\/MT · 관측일 기준 환율 확인 대기 \(차트 마지막 환산 시세 2026\.11\.11\)/);
    assert.match($('[data-chart-endpoint-label="fcpo"]').text(),/1,082\.61/);

    const recovered=await refreshPalmDatedFx(history,async()=>Response.json({base:'USD',rates:{'2026-11-12':{MYR:4.064},'2026-11-13':{MYR:4.05}}}));
    savePublicHistory('palm-oil',recovered);
    const fresh=await savedGraphHistoryResponse(url);
    const updated=render(fresh?.payload);
    assert.equal(palmSettlementAwaitingFx(fresh?.payload.data),null);
    assert.doesNotMatch(updated('p').text(),/관측일 기준 환율 확인 대기/);
    assert.match(updated('[data-chart-endpoint-label="fcpo"]').text(),/1,101\.73/);
  }finally{
    if(root===undefined)delete process.env.RMS_HISTORY_ROOT;else process.env.RMS_HISTORY_ROOT=root;
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('no retry for permanent HTTP errors, no future or invalid FX',async()=>{
  let blocked=0;
  await refreshPalmDatedFx(history,async()=>{blocked++;return new Response('',{status:403});});
  assert.equal(blocked,1);
  const stale=await refreshPalmDatedFx(history,async()=>Response.json({base:'USD',rates:{
    '2026-11-01':{MYR:4},'2026-11-12':{MYR:0},'2026-11-14':{MYR:4},'2026-10-32':{MYR:4}
  }}));
  assert.deepEqual(stale.datedFx,history.datedFx);
  assert.match(stale.fxError||'',/no verified FX/);
});
