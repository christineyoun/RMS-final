/** A separate weekday catch-up mode. No scheduled AI runner or research is called. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {gcsRead,readCloudPointer,sha256,withCloudPublicationLease,type PublicBundle} from '../../src/server/cloudPublication.ts';
import {publicRouteKey,PUBLIC_TIMEFRAMES} from '../../src/server/publicDeploymentRoutes.mjs';

export function previousWeekday(day:string) {
 const date=new Date(day+'T00:00:00Z');
 if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==day)throw Error('Invalid schedule day');
 do {date.setUTCDate(date.getUTCDate()-1);} while([0,6].includes(date.getUTCDay()));
 return date.toISOString().slice(0,10);
}

export function applyPalmHistory(bundle:PublicBundle, history:Record<string,any>){
 const responses={...bundle.responses};
 for(const timeframe of PUBLIC_TIMEFRAMES){
  const key=publicRouteKey('/api/history?commodity=palm-oil&timeframe='+timeframe)!;
  if(responses[key]?.status!==200||!history[timeframe]?.data?.length)throw Error('Missing saved Palm Oil history '+timeframe);
  responses[key]={status:200,payload:history[timeframe]};
 }
 const key='/api/rms/free-publication',saved=responses[key];
 if(saved?.status!==200||!saved.payload?.data?.prices)throw Error('Missing saved free publication');
 responses[key]={...saved,payload:{...saved.payload,data:{...saved.payload.data,prices:{...saved.payload.data.prices,'palm-oil':history['5Y']}}}};
 return {...bundle,responses};
}

export async function runPalmPriceCatchup(){
 if(!process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.RMS_CLOUD_FREE_JOB!=='1')
  throw Error('Palm price catch-up requires the private Cloud Run job');
 const {freeRefreshDay}=await import('../../src/server/freeSourceRefresh.ts');
 const {day,hour,weekday}=freeRefreshDay();
 if(!weekday||hour<10){console.log('Palm price catch-up is outside its weekday window');return;}
 const expected=previousWeekday(day);
 await withCloudPublicationLease(async()=>{
  const {pointer,generation}=await readCloudPointer();
  const [publicObject,stateObject]=await Promise.all([
   gcsRead(process.env.RMS_PUBLICATION_BUCKET!,pointer.bundle.key),
   gcsRead(process.env.RMS_STATE_BUCKET!,pointer.state.key)
  ]);
  if(sha256(publicObject.bytes)!==pointer.bundle.sha256||sha256(stateObject.bytes)!==pointer.state.sha256)
   throw Error('Saved publication integrity check failed');
  const bundle:PublicBundle=JSON.parse(Buffer.from(publicObject.bytes).toString());
  const state=JSON.parse(gunzipSync(stateObject.bytes).toString());
  if(bundle.revision!==pointer.revision||bundle.publishedAt!==pointer.publishedAt)
   throw Error('Publication identity changed');
  const ledger=JSON.parse(Buffer.from(state.files['.rms-stage3/free-source-refresh.json'],'base64').toString());
  if(ledger.day!==day||!['completed','partial'].includes(ledger.status)){
   console.log('Palm price catch-up skipped: no completed morning run for this day');return;
  }
  const old=bundle.responses['/api/history?commodity=palm-oil&timeframe=5Y']?.payload;
  const prior=lastConvertedSettlement(old?.data);
  if(prior&&prior>=expected){console.log('Palm price catch-up skipped: latest expected settlement is already plotted');return;}
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'rms-palm-catchup-'));
  const originalCwd=process.cwd(),oldRoot=process.env.RMS_HISTORY_ROOT;
  try {
   const {restoreState,publish,archiveState}=await import('./publication.ts');
   await restoreState(stateObject.bytes,workspace);
   process.chdir(workspace);
   process.env.RMS_HISTORY_ROOT=workspace;
   const {refreshPublicHistory}=await import('../../src/server/publicPriceHistory.ts');
   const {fetchHistoricalData}=await import('../../src/server/historicalPriceService.ts');
   await refreshPublicHistory('palm-oil');
   const history=Object.fromEntries(await Promise.all(PUBLIC_TIMEFRAMES.map(async timeframe=>[timeframe,await fetchHistoricalData('palm-oil',timeframe,false)])));
   const after=lastConvertedSettlement(history['5Y']?.data);
   if(!after||after<expected||after<=(prior||'')){
    console.log('Palm price catch-up: no newer verified converted settlement; published data retained');return;
   }
   const updated=applyPalmHistory(bundle,history);
   const disk=JSON.parse(gunzipSync(await archiveState(workspace)).toString());
   const priceFile='.rms-price-history/palm-oil.json',dailyFile='.rms-stage3/free-daily-publication.json';
   if(!disk.files[priceFile])throw Error('FCPO ledger was not saved');
   state.files[priceFile]=disk.files[priceFile];
   for(const [key,value] of Object.entries(disk.files)){
    if(/^\.rms-price-history\/source-evidence\/publisher-[a-f0-9]{64}\.(?:json|html)$/.test(key)&&!state.files[key])
     state.files[key]=value;
   }
   const daily=JSON.parse(Buffer.from(state.files[dailyFile],'base64').toString());
   if(daily.revision!==pointer.revision||daily.publishedAt!==pointer.publishedAt||!daily.data?.prices)
    throw Error('Private publication identity changed');
   daily.data.prices['palm-oil']=history['5Y'];
   state.files[dailyFile]=Buffer.from(JSON.stringify(daily)).toString('base64');
   await publish(updated,gzipSync(JSON.stringify(state)),generation);
   console.log('Palm price catch-up published verified settlement:',after);
  } finally {
   process.chdir(originalCwd);
   if(oldRoot===undefined)delete process.env.RMS_HISTORY_ROOT;
   else process.env.RMS_HISTORY_ROOT=oldRoot;
   await fs.rm(workspace,{recursive:true,force:true});
  }
 });
}

export function lastConvertedSettlement(rows:unknown):string|null{
 if(!Array.isArray(rows))return null;
 return rows.filter(p=>p?.cpoPriceType==='exchange-settlement'&&p.cpoFxStatus==='dated'&&
   /^20\d\d-\d\d-\d\d$/.test(p.date||'')&&/^20\d\d-(0[1-9]|1[0-2])$/.test(p.cpoContractMonth||'')&&
   Number.isFinite(p.cpoUsd)&&p.cpoUsd>0).map(p=>p.date).sort().at(-1)||null;
}
