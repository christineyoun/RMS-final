/** Read-only by default. --apply updates only the saved ECB record and its Overview copy. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {readFreeJson,writeFreeJson} from '../../src/server/freeDailyPublication.ts';
import {buildVerifiedEcbSnapshot,verifiedEcbPrevious} from '../../src/server/ecbReferenceSnapshot.ts';

const mode=process.argv.includes('--apply')?'--apply':'--preview';
const base=path.resolve('.rms-stage3');
const url='https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,MYR';
const files=['free-fx.json','free-daily-publication.json'];
const lock=path.join(base,'free-source-refresh.lock');
if(fs.existsSync(lock))throw Error('RMS free refresh is locked. Do not overlap an active publication.');
const prior=readFreeJson(files[0]),published=readFreeJson(files[1]);
if(!prior?.raw||!published?.data?.fx?.raw)throw Error('Saved FX or Overview publication is missing; no modifications.');
const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
if(!response.ok)throw Error('Frankfurter HTTP '+response.status+'; saved FX retained');
const raw=await response.json();
const checkedAt=new Date().toISOString();
const snapshot=buildVerifiedEcbSnapshot(raw,checkedAt,prior);
const oldDate=prior.raw.date,newDate=snapshot.raw.date;
const oldRates=JSON.stringify(prior.raw.rates),newRates=JSON.stringify(snapshot.raw.rates);
const priorComparable=verifiedEcbPrevious(snapshot);
const report={mode,source:'ECB reference rates via Frankfurter',sourceDate:newDate,previousStoredDate:priorComparable?.raw.date||null,usdKrw:raw.rates.KRW,eurKrw:Number((raw.rates.KRW/raw.rates.EUR).toFixed(4)),changed:newDate!==oldDate||newRates!==oldRates};
console.log('RMS ECB REFERENCE RATE CHECK');
console.log(JSON.stringify(report,null,2));
if(mode==='--preview'){
 console.log('PREVIEW ONLY — no saved data, Gemini or Cloud modifications.');
 process.exit(0);
}
if(!report.changed){
 console.log('ECB ALREADY CURRENT — no writes.');
 process.exit(0);
}
if(fs.existsSync(lock))throw Error('Concurrent RMS refresh detected before save. No modifications.');
const backup=path.join(os.homedir(),'Desktop/RMS_MI_backups','ecb-only-'+Date.now());
fs.mkdirSync(backup,{recursive:true});
for(const file of files)fs.copyFileSync(path.join(base,file),path.join(backup,file));
try{
 if(fs.existsSync(lock))throw Error('Concurrent RMS refresh detected before publication.');
 // Do not modify unrelated published commodity, MI, AI, Brent or weather snapshots.
 writeFreeJson(files[0],snapshot);
 writeFreeJson(files[1],{
  ...published,revision:randomUUID(),publishedAt:checkedAt,lastCheckedAt:checkedAt,
  data:{...published.data,fx:snapshot}
 });
 const saved=readFreeJson(files[1]);
 if(saved?.data?.fx?.raw?.date!==newDate||saved?.data?.fx?.raw?.rates?.KRW!==raw.rates.KRW)
  throw Error('Publication verification failed');
 console.log('ECB REFRESH PASS — backup:',backup);
 console.log('No other publication fields, paid AI, or Cloud changes.');
}catch(error){
 for(const file of files)fs.copyFileSync(path.join(backup,file),path.join(base,file));
 console.error('ROLLED BACK:',error.message);
 process.exitCode=1;
}
