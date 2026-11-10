/**
 * Single-execution Brent-only refresh, suitable for an external 15-minute clock.
 * Installation does NOT start a scheduler. This local worker intentionally refuses
 * direct Cloud execution until wired to the existing versioned GCS publication flow.
 *
 *   node --import tsx scripts/brent/refresh-15m.mjs --preview
 *   node --import tsx scripts/brent/refresh-15m.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {YAHOO_BRENT_URL,planBrentQuoteUpdate,brentOnlyPublication} from './brent15Core.mjs';
import {readFreeJson,writeFreeJson} from '../../src/server/freeDailyPublication.ts';

const mode=process.argv.includes('--apply')?'--apply':process.argv.includes('--preview')?'--preview':null;
if(!mode||process.argv.some(a=>a.startsWith('--')&&!['--apply','--preview'].includes(a))||
   process.argv.includes('--apply')&&process.argv.includes('--preview'))
  throw Error('Specify exactly --preview or --apply');
if(process.env.K_SERVICE||process.env.CLOUD_RUN_JOB||process.env.RMS_PUBLICATION_BUCKET)
  throw Error('CLOUD MODE BLOCKED: this local worker must first be wired into the versioned GCS publication/lease pipeline at deployment');

const root=path.resolve('.rms-stage3');
const lock=path.join(root,'free-source-refresh.lock');
const files=['free-energy.json','free-daily-publication.json'];
let nonce=null;
if(mode==='--apply'){
  fs.mkdirSync(root,{recursive:true});
  nonce=randomUUID();
  try{fs.writeFileSync(lock,JSON.stringify({pid:process.pid,nonce}),{flag:'wx',mode:0o600});}
  catch{throw Error('Free-source refresh already running (or lock needs inspection): no Brent update');}
}else if(fs.existsSync(lock)){
  throw Error('Free-source refresh already running: preview postponed');
}

try{
  const oldEnergy=readFreeJson(files[0]),oldPub=readFreeJson(files[1]);
  if(!oldEnergy||!oldPub?.data?.energy)throw Error('Existing saved Brent and published Overview required');
  let latest;
  if(mode==='--preview'){
    // Bypass receipt-writing collector in preview; parse the same Yahoo payload in memory.
    const {parseYahooBrentDaily}=await import('../../src/server/geminiApi.ts');
    const response=await fetch(YAHOO_BRENT_URL,{signal:AbortSignal.timeout(12_000)});
    if(!response.ok)throw Error('Yahoo Brent HTTP '+response.status);
    const checkedAt=new Date().toISOString();
    latest={...parseYahooBrentDaily(await response.json(),checkedAt),sourceUrl:YAHOO_BRENT_URL};
  }else{
    const {fetchLiveCrudeOilData}=await import('../../src/server/geminiApi.ts');
    latest=await fetchLiveCrudeOilData('BZ=F',0);
  }
  const now=new Date(),plan=planBrentQuoteUpdate(latest,oldEnergy,oldPub,now);
  console.log('RMS BRENT 15-MINUTE WORKER');
  console.log(JSON.stringify({mode,source:'Yahoo Finance BZ=F',...plan,checkedAt:now.toISOString()},null,2));
  if(mode==='--preview'){
    console.log('PREVIEW ONLY — no saved-data, publication, Gemini or Cloud writes.');
  }else if(!plan.shouldWrite){
    console.log('BRENT UNCHANGED — no publication revision or data rewrite.');
  }else{
    const backup=path.join(os.homedir(),'Desktop/RMS_MI_backups','brent-15m-'+Date.now());
    fs.mkdirSync(backup,{recursive:true});
    for(const f of files)fs.copyFileSync(path.join(root,f),path.join(backup,f));
    try{
      const {saveVerifiedEnergy}=await import('../../src/server/freeDailyJobs.ts');
      const saved=saveVerifiedEnergy(latest);
      const publication=brentOnlyPublication(oldPub,saved,new Date().toISOString(),randomUUID());
      writeFreeJson(files[1],publication);
      const verified=readFreeJson(files[1]);
      if(verified?.revision!==publication.revision ||
         verified?.data?.energy?.quoteDisplay?.observationDate!==plan.observationDate ||
         verified?.data?.energy?.quoteDisplay?.price!==plan.latestQuote)
        throw Error('Brent-only publication verification failed');
      console.log('BRENT 15M LOCAL APPLY PASS — backup:',backup);
      console.log('No other publication fields, Gemini, MI, or Cloud changes.');
    }catch(e){
      for(const f of files)fs.copyFileSync(path.join(backup,f),path.join(root,f));
      throw Error('ROLLED BACK Brent saved data: '+e.message);
    }
  }
}finally{
  if(nonce){
    try{const held=JSON.parse(fs.readFileSync(lock,'utf8'));
      if(held.nonce===nonce)fs.unlinkSync(lock);
    }catch(e){if(e.code!=='ENOENT')console.error('Inspect Brent lock:',e.message);}
  }
}
