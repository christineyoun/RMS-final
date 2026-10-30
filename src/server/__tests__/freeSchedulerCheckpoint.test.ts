import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createFreeSourceRunner,freeScheduleSettings} from '../freeSourceRefresh.ts';
import {freeRefreshStatus} from '../freeDailyPublication.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-clock-contract-'));
let now=new Date('2026-11-02T00:00:00Z'),count=0,fail=false,publicationFail=false;
const settings=(hour:number)=>fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({freeAutoEnabled:true,scheduleHourKST:hour}));
const read=(n:string)=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const options={directory:root,now:()=>now,jobs:()=>[{key:'price',run:async()=>{count++;if(fail)throw Error('offline outage');return {publication:{value:count},observationDate:'2026-10-30'};}}],publish:async()=>{if(publicationFail)throw Error('publication unavailable');return {changed:true,publishedAt:now.toISOString()};}};
try{
 settings(11);const a=createFreeSourceRunner(options);
 assert.equal(await a.check(),null,'09:00 must not ignore configured 11:00');assert.equal(count,0);
 await a.refresh('manual');assert.equal(count,1);assert(!fs.existsSync(path.join(root,'free-source-scheduled.json')));
 now=new Date('2026-11-02T02:00:00Z');await a.check();assert.equal(count,2,'manual cannot consume scheduled day');
 assert.equal(read('free-source-scheduled.json').trigger,'scheduled');await a.refresh('manual');await createFreeSourceRunner(options).check();assert.equal(count,3,'manual after schedule cannot erase completed-day checkpoint');
 now=new Date('2026-11-03T06:00:00Z');await createFreeSourceRunner(options).check();assert.equal(count,4,'late restart catches up current weekday');
 now=new Date('2026-11-04T02:00:00Z');fail=true;await a.check();assert.equal(count,5);assert.equal(read('free-source-scheduled.json').status,'partial');await a.check();assert.equal(count,5,'no minute-by-minute failed retries');
 fail=false;await a.retryFailed();assert.equal(count,6);assert.equal(read('free-source-scheduled.json').recoveryPasses,1);assert.equal(await a.retryFailed(),null);
 now=new Date('2026-11-05T02:00:00Z');publicationFail=true;const previousPublication=read('free-source-observations.json').lastPublicationAt;await a.check();assert.equal(read('free-source-scheduled.json').status,'partial');assert.equal(read('free-source-observations.json').lastPublicationAt,previousPublication,'failed publication never advances health date');
 const dead={day:'2026-11-06',trigger:'scheduled',scheduledDay:'2026-11-06',status:'running',startedAt:'2026-11-06T02:00:00Z',jobs:[]};
 for(const n of ['free-source-refresh.json','free-source-scheduled.json'])fs.writeFileSync(path.join(root,n),JSON.stringify(dead));
 fs.writeFileSync(path.join(root,'free-source-refresh.lock'),JSON.stringify({pid:2147483647,nonce:'dead'}));assert.equal(freeRefreshStatus(root).running,false);assert.equal(freeRefreshStatus(root).interrupted,true);
 now=new Date('2026-11-06T03:00:00Z');publicationFail=false;await createFreeSourceRunner(options).check();assert.equal(read('free-source-scheduled.json').status,'completed');assert.equal(freeRefreshStatus(root).interrupted,false);
 now=new Date('2026-11-07T04:00:00Z');assert.equal(await a.check(),null,'weekend');
 for(const h of [-1,24,1.5,'11'])assert.equal(freeScheduleSettings({scheduleHourKST:h}).hourKST,9);
 console.log('PASS configured KST hour, manual/scheduled isolation, late restart, same-day persistence, bounded recovery, publication health, abandoned owner, future dates/weekends');
}finally{fs.rmSync(root,{recursive:true,force:true});}
