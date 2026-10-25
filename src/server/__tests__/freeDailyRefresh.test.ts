import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createFreeSourceRunner,freeRefreshDay,freeRefreshDue} from '../freeSourceRefresh.ts';
import {withFreeNetwork,withSavedDataRead} from '../freeRefreshNetwork.ts';
import {observationFingerprint} from '../freeDailyPublication.ts';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rms-free-daily-'));
let clock=new Date('2026-10-26T00:00:00Z'),calls=0,published=0,fail=false;const cfg=path.join(directory,'settings.json');fs.writeFileSync(cfg,JSON.stringify({freeAutoEnabled:true,autoEnabled:false}));
const options={directory,now:()=>clock,jobs:()=>[{key:'test',source:'Official fixture',commodity:'wheat',run:async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(fail)throw Error('Offline fixture outage');return {publication:{price:100},observationDate:'2026-10-23'};}}],publish:async()=>{published++;return {consistent:true};}};
try{
 assert.equal(freeRefreshDay(new Date('2026-10-25T23:59:59Z')).hour,8);
 assert.equal(freeRefreshDue(new Date('2026-10-25T23:59:59Z'),{enabled:true,hourKST:9},''),false);
 for(const day of ['2026-10-24','2026-10-25'])assert.equal(freeRefreshDue(new Date(day+'T03:00:00Z'),{enabled:true,hourKST:9},''),false);
 const a=createFreeSourceRunner(options),b=createFreeSourceRunner(options);await Promise.all([a.check(),a.check(),b.check()]);assert.equal(calls,1);assert.equal(published,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'free-source-refresh.json'),'utf8')).jobs[0].status,'success');
 await createFreeSourceRunner(options).check();assert.equal(calls,1,'restart does not repeat finished day');
 clock=new Date('2026-10-27T05:00:00Z');await createFreeSourceRunner(options).check();assert.equal(calls,2,'late startup catch-up');assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'free-source-refresh.json'),'utf8')).jobs[0].status,'unchanged');
 clock=new Date('2026-10-28T00:00:00Z');fail=true;await createFreeSourceRunner(options).check();let run=JSON.parse(fs.readFileSync(path.join(directory,'free-source-refresh.json'),'utf8'));assert.equal(run.status,'partial');assert.equal(run.jobs[0].status,'retained-old-data');assert.equal(run.jobs[0].observationDate,'2026-10-23');assert(run.jobs[0].lastVerifiedAt);
 await createFreeSourceRunner(options).check();assert.equal(calls,3,'partial day is not retried on every tick');
 // A dead process with a running checkpoint resumes pending work, not completed jobs.
 clock=new Date('2026-10-29T01:00:00Z');fail=false;fs.writeFileSync(path.join(directory,'free-source-refresh.lock'),JSON.stringify({pid:2147483647,nonce:'dead'}));fs.writeFileSync(path.join(directory,'free-source-refresh.json'),JSON.stringify({day:'2026-10-29',status:'running',jobs:[{key:'test',status:'success'}],startedAt:'2026-10-29T00:00:00Z'}));await createFreeSourceRunner({...options,jobs:()=>[...options.jobs(),{key:'pending',run:async()=>{calls++;return {publication:{value:1},observationDate:'2026-10-28'};}}]}).check();assert.equal(calls,4);assert(!fs.existsSync(path.join(directory,'free-source-refresh.lock')));
 const partialDir=path.join(directory,'partial');const isolated=createFreeSourceRunner({directory:partialDir,now:()=>clock,jobs:()=>[{key:'good',run:async()=>({publication:{value:10},observationDate:'2026-10-28'})},{key:'failed',run:async()=>{throw Error('Deliberate isolated outage');}}],publish:async r=>{assert(r.jobs.some(j=>j.key==='good'&&j.status==='success'));return {committed:true};}});const partial=await isolated.refresh();assert.equal(partial.status,'partial');assert(partial.publication.committed);assert(JSON.parse(fs.readFileSync(path.join(partialDir,'free-source-observations.json'),'utf8')).jobs.good);
 assert.equal(observationFingerprint({price:1,checkedAt:'old'}),observationFingerprint({price:1,checkedAt:'new'}));assert.notEqual(observationFingerprint({price:1}),observationFingerprint({price:2}));
 await assert.rejects(withFreeNetwork(()=>fetch('https://generativelanguage.googleapis.com/v1/models')),/blocked/);
 await assert.rejects(withSavedDataRead(()=>fetch('https://api.open-meteo.com/v1/forecast')),/disabled/);
 assert.equal(JSON.parse(fs.readFileSync(cfg,'utf8')).autoEnabled,false);
 console.log('PASS KST 09:00 boundary, weekends, same-day/process locks, restart catch-up, retained failure, unchanged dates, crash recovery, publication ordering, paid/read transport blocks');
}finally{fs.rmSync(directory,{recursive:true,force:true});}
