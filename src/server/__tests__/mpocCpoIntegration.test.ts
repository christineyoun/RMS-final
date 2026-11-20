import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadPublicHistory,refreshPublicHistory,palmHistoryPayload,PRICE_SOURCES,mergePublicPrices,priorMalaysiaWeekday,type PublicPricePoint} from '../publicPriceHistory.ts';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-mpoc-ingestion-'));
const oldRoot=process.env.RMS_HISTORY_ROOT;
const oldFetch=globalThis.fetch;
const html=`<html><body><div>Palm OilPrice Today (Jan, 27 Contract)</div><h1>Daily Palm Oil Prices</h1><h2>CPO Prices</h2>
<table><thead><tr><th>Pricing Date</th><th>Settlement Price RM</th></tr></thead><tbody><tr><td>22 Oct 26</td><td>4792</td></tr><tr><td>4 Nov 26</td><td>4496</td></tr></tbody></table>
<p>Palm Oil Prices : Courtesy of Bursa Malaysia Berhad</p><h2>CPO, SFO and SBO Prices (US$/MT)</h2><table><tr><td>Date</td><td>CPO, BMD+3</td></tr></table>
</body></html>`;
try {
  process.env.RMS_HISTORY_ROOT=temp;
  const seeded=loadPublicHistory('palm-oil');
  const manualPoints=seeded.points.filter(p=>p.benchmark==='palm-cpo');
  const investing:PublicPricePoint={benchmark:'palm-cpo',sourceUrl:PRICE_SOURCES.cpoFcpo,date:'2026-10-19',value:4797,unit:'MYR/MT',usdPerMT:1175.02,provenance:'source-verified',observationKind:'publisher-close'};
  const pre=mergePublicPrices(seeded,[investing]).history;
  const file=path.join(temp,'.rms-price-history','palm-oil.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(pre));
  let calledInvestingCpo=false,calledOlein=false;
  globalThis.fetch=async(url:any)=>{
    if(String(url)===PRICE_SOURCES.mpocCpo)return new Response(html,{status:200,headers:{'content-type':'text/html'}});
    if(String(url)===PRICE_SOURCES.olein){calledOlein=true;return new Response('',{status:403});}
    if(String(url)===PRICE_SOURCES.cpoFcpo){calledInvestingCpo=true;throw Error('Unexpected blocked source request');}
    if(String(url).startsWith('https://api.frankfurter.dev/'))return Response.json({base:'USD',rates:{'2026-10-22':{MYR:4.25},'2026-11-04':{MYR:4.2}}});
    throw Error('Unexpected URL '+url);
  };
  const refreshed=await refreshPublicHistory('palm-oil');
  assert.equal(calledInvestingCpo,false,'no request to blocked Investing.com CPO URL');
  assert.equal(refreshed.sourceChecks?.[PRICE_SOURCES.mpocCpo]?.error,undefined);
  assert.equal(calledOlein,false,'retired Olein source is not requested');
  assert.equal(refreshed.lastError,undefined);
  assert.deepEqual(refreshed.points.filter(p=>p.benchmark==='palm-olein'),
    pre.points.filter(p=>p.benchmark==='palm-olein'),'legacy observations remain in private storage');
  const old=refreshed.points.find(p=>p.sourceUrl===PRICE_SOURCES.cpoFcpo&&p.date==='2026-10-19');
  assert.deepEqual(old,investing,'previous source-verified close unchanged');
  assert.deepEqual(refreshed.points.filter(p=>p.provenance==='manual-import'&&p.benchmark==='palm-cpo'),manualPoints,'all original manually imported CPO prices unchanged');
  const current=palmHistoryPayload(refreshed);
  assert.doesNotMatch(JSON.stringify(current),/olein/i,'active payload excludes retired benchmark');
  assert.equal(current.cpoSourceUrl,PRICE_SOURCES.mpocCpo);
  assert.equal(current.cpoObservationDate,'2026-11-04');
  assert.equal(current.priceMyr,4496);
  assert.equal(current.cpoPriceType,'exchange-settlement');
  assert.equal(current.cpoContractMonth,'2027-01');
  assert.equal(current.historicalSeries.find(p=>p.date==='2026-10-19')?.cpoMyr,4797);
  assert.equal(current.historicalSeries.find(p=>p.date==='2026-10-22')?.cpoSourceUrl,PRICE_SOURCES.mpocCpo);
  assert.equal(current.historicalSeries.find(p=>p.date==='2026-11-04')?.cpoContractMonth,'2027-01');
  assert.equal(current.historicalSeries.find(p=>p.date==='2026-11-04')?.cpoUsd,Number((4496/4.2).toFixed(2)));
  const saved=JSON.stringify(refreshed.points);
  const repeat=await refreshPublicHistory('palm-oil');
  assert.equal(JSON.stringify(repeat.points),saved,'repeated refresh never duplicates or reprices observations');
  globalThis.fetch=async()=>new Response('',{status:403});
  const failed=await refreshPublicHistory('palm-oil');
  assert.equal(JSON.stringify(failed.points),saved,'MPOC outage retains exactly the saved prices');
  assert.equal(priorMalaysiaWeekday(new Date('2026-11-23T00:00:00Z')),'2026-11-20');
  assert.equal(priorMalaysiaWeekday(new Date('2026-11-04T16:05:00Z')),'2026-11-04');

  const target='2026-11-05';
  const newer=html.replace('</tbody>','<tr><td>5 Nov 26</td><td>4500</td></tr></tbody>');
  let mpocCalls=0;
  let recheckResponse=html;
  let firstResponse=html;
  globalThis.fetch=async(url:any,options?:RequestInit)=>{
    if(String(url)===PRICE_SOURCES.mpocCpo){
      mpocCalls++;
      if(mpocCalls===1)return new Response(firstResponse);
      assert.equal(options?.cache,'no-cache');
      assert.equal(new Headers(options?.headers).get('Cache-Control'),'no-cache');
      return new Response(recheckResponse);
    }
    if(String(url).startsWith('https://api.frankfurter.dev/'))return Response.json({base:'USD',rates:{[target]:{MYR:4.2}}});
    throw Error('Unexpected URL '+url);
  };
  const morning=()=>refreshPublicHistory('palm-oil',undefined,{expectedMpocDate:target});
  const stale=await morning();
  assert.equal(mpocCalls,2,'only one recheck during the scheduled run');
  assert.equal(stale.sourceChecks?.[PRICE_SOURCES.mpocCpo]?.morningCheck?.recheck,'still-behind');
  assert.equal(palmHistoryPayload(stale).cpoObservationDate,'2026-11-04');
  assert.equal(stale.points.some(p=>p.date===target),false,'no synthesized holiday or delayed settlement');

  mpocCalls=0;recheckResponse=newer;
  const updated=await morning();
  assert.equal(mpocCalls,2);
  assert.deepEqual(updated.sourceChecks?.[PRICE_SOURCES.mpocCpo]?.morningCheck,
    {targetDate:target,firstObservationDate:'2026-11-04',recheck:'target-reached'});
  assert.equal(palmHistoryPayload(updated).cpoObservationDate,target);
  assert.equal(palmHistoryPayload(updated).historicalSeries.find(p=>p.date===target)?.cpoUsd,Number((4500/4.2).toFixed(2)));

  mpocCalls=0;firstResponse=newer;
  const alreadyFresh=await morning();
  assert.equal(mpocCalls,1);
  assert.equal(alreadyFresh.sourceChecks?.[PRICE_SOURCES.mpocCpo]?.morningCheck?.recheck,'not-needed');
  assert.deepEqual(alreadyFresh.points,updated.points);

  mpocCalls=0;firstResponse=html;recheckResponse='<html>not an MPOC table</html>';
  const badRecheck=await morning();
  assert.equal(mpocCalls,2);
  assert.equal(badRecheck.sourceChecks?.[PRICE_SOURCES.mpocCpo]?.morningCheck?.recheck,'unavailable');
  assert.deepEqual(badRecheck.points,updated.points,'an invalid recheck cannot erase verified settlements');
  console.log('PASS: same-run FCPO recheck, fresh first response, missing settlement, and invalid recheck.');
  console.log('PASS: MPOC scheduled feed, no Olein requests, closed/settlement source identity, dated FX, old verified prices and manual history retained, no CPO 403 retries, no duplicate or invented observations.');
} finally {
  globalThis.fetch=oldFetch;
  if(oldRoot===undefined)delete process.env.RMS_HISTORY_ROOT;else process.env.RMS_HISTORY_ROOT=oldRoot;
  fs.rmSync(temp,{recursive:true,force:true});
}
