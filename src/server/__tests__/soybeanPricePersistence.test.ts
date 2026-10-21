import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SoybeanIntelligenceService} from '../soybeanIntelligenceService.ts';
import {mergeSoybeanHistory,readSoybeanHistory,writeSoybeanHistory,SOYBEAN_SOURCE_URL,acquireSoybeanHistoryLock} from '../soybeanPriceHistoryStore.ts';
import {createFreeSourceRunner,freeRefreshDue,soybeanPriceRefreshJob} from '../freeSourceRefresh.ts';
import {quoteFromResponse} from '../../services/commodityQuoteSource.ts';
import {parseDatedDisplayFx,soybeanDisplayFactor} from '../../utils/soybeanPriceSnapshot.ts';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-persistence-'));const file=path.join(temp,'soybean.json');
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('OFFLINE: no real source or paid requests');};
const today=new Date().toISOString().slice(0,10),date=(days:number)=>new Date(Date.parse(today)-days*86400000).toISOString().slice(0,10);
const points=[[400,1300],[31,1328],[7,1283.75],[0,1255.75]].map(([days,raw])=>({date:date(days),centsPerBushel:raw,quoteValue:raw,usdPerMT:Number((raw/100*36.7437).toFixed(2)),isProvisional:days===0}));
let calls=0,worldCalls=0,fail=false,worldFail=false,selection=points;
const world:any={success:true,status:'last-verified',checkedAt:new Date().toISOString(),data:JSON.parse(fs.readFileSync('src/data/usda_world_last_verified_soybean.json','utf8')).data};
const fixture=()=>({success:true,commodity:'soybean',symbol:'ZS=F (CBOT Soybean)',source:'CBOT / Yahoo Finance',quoteUnit:'US¢/bu',priceUnit:'USD/MT',fetchedAt:new Date().toISOString(),data:structuredClone(selection)});
const sources:any={history:async()=>{calls++;await new Promise(r=>setTimeout(r,40));if(fail)throw Error('Yahoo HTTP 503');return fixture();},world:async()=>{worldCalls++;if(worldFail)throw Error('USDA unavailable');return world;}};
try{
 const a=new SoybeanIntelligenceService(sources,{file});const b=new SoybeanIntelligenceService(sources,{file});
 const [first,concurrent,ordinary]=await Promise.all([a.getSoybeanPriceSnapshot(true),b.getSoybeanPriceSnapshot(true,'scheduled'),a.getSoybeanPriceSnapshot()]);
 assert.equal(calls,1,'two instances and simultaneous manual/scheduled/read share one fetch');assert.deepEqual(first,concurrent);assert.equal(first,ordinary);
 assert.equal(first.data.length,4);assert.equal(first.data.at(-1)?.isProvisional,true);assert.equal(first.refreshMetadata?.lastAttempt?.trigger,'manual');
 const stored=readSoybeanHistory(file);assert.equal(stored.sourceUrl,SOYBEAN_SOURCE_URL);assert.equal((stored.snapshot?.data[0] as any).sourceUrl,SOYBEAN_SOURCE_URL);
 assert.equal(stored.lastAttempt?.status,'updated');assert.equal(stored.lastAttempt?.added,4);
 // A genuinely new process reads disk with all network adapters made fatal: no disguised memory cache.
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';import {SoybeanIntelligenceService} from './src/server/soybeanIntelligenceService.ts';
 globalThis.fetch=async()=>{throw Error('Restart must not fetch');};
 const s=new SoybeanIntelligenceService({history:async()=>{throw Error('Unexpected Yahoo request');},world:async()=>{throw Error('Unexpected USDA request');}},{file:process.env.SOY_TEST_FILE});
 const result=await s.getSoybeanPriceSnapshot();assert.equal(result.data.length,4);assert.equal(result.stale,false);console.log('RESTART_PASS');
 `],{cwd:process.cwd(),env:{...process.env,SOY_TEST_FILE:file},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/RESTART_PASS/);
 const restart=new SoybeanIntelligenceService(sources,{file});const reopened=await restart.getSoybeanPriceSnapshot();assert.deepEqual(reopened,first);assert.equal(calls,1);
 selection=points.slice(-2);const shorter=await a.getSoybeanPriceSnapshot(true);assert.equal(shorter.data.length,4);assert.equal(shorter.refreshMetadata?.lastAttempt?.status,'unchanged');assert.equal(shorter.refreshMetadata?.lastObservationUpdateAt,first.refreshMetadata?.lastObservationUpdateAt);
 assert.equal(new Set(shorter.data.map(p=>p.date)).size,4,'deduplicate by fixed Yahoo/ZS=F source plus actual date');
 selection=points.slice(0,-1);const partial=await a.getSoybeanPriceSnapshot(true);assert.equal(partial.stale,true);assert.equal(partial.data.at(-1)?.date,today);assert.equal(partial.refreshMetadata?.lastAttempt?.receivedLatestDate,date(7));assert.match(partial.lastError!,/ends before/);assert.equal(partial.data.length,4);
 // Changing a provisional same-day bar revises it; does not append a fake refresh-date record.
 const revised={...points.at(-1)!,centsPerBushel:1256,quoteValue:1256,usdPerMT:Number((1256/100*36.7437).toFixed(2))};
 selection=[revised];const corrected=await a.getSoybeanPriceSnapshot(true);assert.equal(corrected.data.length,4);assert.equal(corrected.refreshMetadata?.lastAttempt?.revised,1);assert.equal(corrected.data.at(-1)?.usdPerMT,revised.usdPerMT);
 const log=fs.readFileSync(file+'.refresh.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l));assert.ok(log.some(l=>l.revision?.previous.centsPerBushel===1255.75&&l.revision.replacement.centsPerBushel===1256),'lossless correction audit');
 const q=quoteFromResponse('soybean',corrected)!;assert.equal(q.priceUsdMt,corrected.procurementAnalysis.benchmarkPrice.usdPerMT);assert.equal(q.changeWoW,corrected.procurementAnalysis.weeklyChange.wowPct);
 const fx=parseDatedDisplayFx({base:'USD',date:date(1),rates:{KRW:1329.49,EUR:.89087}})!;
 for(const c of ['USD','KRW','EUR'] as const)for(const months of [1,3,6,12]){
   const filtered=corrected.data.filter(p=>Date.parse(p.date)>=Date.parse(today)-months*31*86400000);
   assert.equal(filtered.at(-1)!.usdPerMT*soybeanDisplayFactor(c,fx),q.priceUsdMt*soybeanDisplayFactor(c,fx));
 }
 fail=true;const beforeFailure=readSoybeanHistory(file);const stale=await a.getSoybeanPriceSnapshot(true);assert.equal(stale.stale,true);assert.match(stale.lastError!,/Yahoo HTTP 503/);assert.deepEqual(stale.data,corrected.data);assert.equal(stale.fetchedAt,corrected.fetchedAt);assert.equal(stale.refreshMetadata?.lastSuccessAt,beforeFailure.lastSuccessAt);assert.equal(stale.refreshMetadata?.lastAttempt?.observationDate,today);
 const outageRestart=new SoybeanIntelligenceService(sources,{file});const attemptCount=calls;assert.deepEqual(await outageRestart.getSoybeanPriceSnapshot(),stale);assert.equal(calls,attemptCount,'failure cooldown survives restart');
 fail=false;worldFail=true;selection=[revised];const priceOnly=await a.getSoybeanPriceSnapshot(true);assert.equal(priceOnly.data.length,4);assert.match(priceOnly.lastError!,/USDA/);assert.equal(priceOnly.procurementAnalysis.procurementRisk.level,'자료 부족');
 const emptyFile=path.join(temp,'empty.json');fail=true;const empty=new SoybeanIntelligenceService(sources,{file:emptyFile});await assert.rejects(empty.getSoybeanPriceSnapshot(),/Yahoo HTTP 503/);const noDataCalls=calls;await assert.rejects(new SoybeanIntelligenceService(sources,{file:emptyFile}).getSoybeanPriceSnapshot(),/Yahoo HTTP 503/);assert.equal(calls,noDataCalls,'empty-store outage is also rate limited');fail=false;worldFail=false;
 const badPackets=[{...fixture(),symbol:'ZC=F'},{...fixture(),quoteUnit:'USD/bu'},{...fixture(),data:[{...revised,date:'2026-02-30'}]},
   {...fixture(),data:[{...revised,date:'2099-01-01'}]},{...fixture(),data:[{...revised,usdPerMT:9}]},
   {...fixture(),data:[{...revised,centsPerBushel:null}]},{...fixture(),data:[{...revised,isSynthetic:true}]},
   {...fixture(),data:[revised,{...revised,usdPerMT:revised.usdPerMT+.01}]},{...fixture(),data:[]}];
 for(const p of badPackets)assert.throws(()=>mergeSoybeanHistory(corrected,p),/Invalid|Conflicting/);
 assert.deepEqual(mergeSoybeanHistory(corrected,{...fixture(),data:[revised,revised]}).history.data.length,4,'identical duplicate is harmless');
 const settled={...fixture(),data:[{...revised,isProvisional:false}]};const settledHistory=mergeSoybeanHistory(corrected,settled).history;
 assert.equal(mergeSoybeanHistory(settledHistory,{...fixture(),data:[revised]}).history.data.at(-1)?.isProvisional,false,'do not regress final daily bar to provisional (still not official settlement)');
 const wrongState=path.join(temp,'wrong-state.json');fs.writeFileSync(wrongState,JSON.stringify({version:1,benchmark:'CBOT ZS=F',sourceUrl:SOYBEAN_SOURCE_URL,snapshot:false}));assert.throws(()=>readSoybeanHistory(wrongState),/cannot be read safely/);
 const corrupt=path.join(temp,'corrupt.json');fs.writeFileSync(corrupt,'{bad');assert.throws(()=>readSoybeanHistory(corrupt),/cannot be read safely/);assert.equal(fs.readFileSync(corrupt,'utf8'),'{bad');
 // Dead process locks recover without clearing live ones.
 const orphan=path.join(temp,'orphan.json');fs.writeFileSync(orphan+'.lock',JSON.stringify({pid:2147483647,token:'orphan'}));const lease=await acquireSoybeanHistoryLock(orphan);lease.release();assert.equal(fs.existsSync(orphan+'.lock'),false);
 // Real scheduler decision/runner; isolated day/settings, genuine Soybean service adapter, no other source jobs.
 const sched=path.join(temp,'clock');fs.mkdirSync(sched);fs.writeFileSync(path.join(sched,'settings.json'),JSON.stringify({freeAutoEnabled:true,scheduleHourKST:9,autoEnabled:false}));
 let now=new Date('2026-10-20T00:00:00Z');const scheduledFile=path.join(temp,'scheduled.json');const scheduledService=new SoybeanIntelligenceService(sources,{file:scheduledFile});
 const runner=createFreeSourceRunner({directory:sched,now:()=>now,jobs:()=>[{key:soybeanPriceRefreshJob.key,run:async()=>{const s=await scheduledService.getSoybeanPriceSnapshot(true,'scheduled');return {lastError:s.lastError,observationDate:s.data.at(-1)?.date,refresh:s.refreshMetadata};}}]});
 const prior=calls;const [scheduledRun,duplicateRun]=await Promise.all([runner.check(),runner.check()]);assert.equal(scheduledRun.status,'completed');assert.equal(duplicateRun,null);assert.equal(calls,prior+1);assert.equal(scheduledRun.jobs[0].refresh.lastAttempt.trigger,'scheduled');assert.equal(await runner.check(),null,'one scheduled day reservation');
 now=new Date('2026-10-21T00:00:00Z');await runner.check();assert.equal(calls,prior+2);assert.equal(fs.readFileSync(path.join(sched,'free-source-refresh-history.jsonl'),'utf8').trim().split('\n').length,1);
 for(const t of ['2026-10-20T23:59:00Z','2026-10-24T00:00:00Z'])assert.equal(freeRefreshDue(new Date(t),{enabled:true,hourKST:9},''),false);
 assert.equal(freeRefreshDue(now,{enabled:false,hourKST:9},''),false);
 const snapshotBefore=fs.readFileSync(file);const saved=readSoybeanHistory(file);writeSoybeanHistory(file,saved);assert.deepEqual(readSoybeanHistory(file),saved);assert.ok(snapshotBefore.length>0);
 console.log('PASS: durable full history; real child-process restart; two-instance single-flight; dedup/revisions; partial/failed source preservation; bad packets/corruption/locks; unchanged dated FX and current quote; actual scheduler gates and daily reservation. No real network or paid calls.');
 console.log('Isolated test artifacts: '+temp);
}finally{globalThis.fetch=native;}
