import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPotatoExportQuoteService} from '../officialPotatoComextService.ts';
// Offline only. Any accidental real source access fails the test immediately.
const originalFetch=globalThis.fetch;
globalThis.fetch=(async()=>{throw Error('Unexpected network access in offline test');}) as typeof fetch;
const {createFreeSourceRunner,createPotatoExportQuoteRefreshJob}=await import('../freeSourceRefresh.ts');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rms-potato-schedule-'));
try {
 let clock=new Date('2026-10-22T00:00:00Z'),calls=0,mode:'ok'|'http'|'invalid'='ok',month='2026-08';
 let release:(()=>void)|undefined;
 let delay:Promise<void>|undefined;
 function fixture(){
  const entries={freq:['M'],reporter:['EU27_2020'],partner:['KR'],product:['11081300'],flow:['2'],indicators:['VALUE_IN_EUROS','QUANTITY_IN_100KG'],time:['2026-08','2026-09']};
  return {id:Object.keys(entries),size:Object.values(entries).map(v=>v.length),dimension:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,{category:{index:Object.fromEntries(v.map((c,i)=>[c,i]))}}])),value:month==='2026-08'?{0:15000,2:120}:{0:15000,1:18000,2:120,3:150}};
 }
 const fetcher=(async()=>{calls++;if(delay)await delay;if(mode==='http')return new Response('',{status:503});return new Response(JSON.stringify(mode==='invalid'?{}:fixture()));}) as typeof fetch;
 const quoteFile=path.join(directory,'potato-export-unit-value.json');
 const store={read:()=>JSON.parse(fs.readFileSync(quoteFile,'utf8')),write:(receipt:any)=>{fs.writeFileSync(quoteFile,JSON.stringify(receipt));}};
 const makeService=()=>createPotatoExportQuoteService({fetcher,store,now:()=>clock});
 let service=makeService();
 const makeRunner=()=>createFreeSourceRunner({directory,now:()=>clock,jobs:()=>[createPotatoExportQuoteRefreshJob(force=>service.get(force))]});
 fs.writeFileSync(path.join(directory,'settings.json'),JSON.stringify({freeAutoEnabled:true,scheduleHourKST:9}));
 let runner=makeRunner();
 clock=new Date('2026-10-21T23:59:00Z');assert.equal(await runner.check(),null);assert.equal(calls,0,'before configured KST hour');
 clock=new Date('2026-10-22T00:00:00Z');
 delay=new Promise<void>(resolve=>{release=resolve;});
 const first=runner.check();assert.equal(await runner.check(),null,'overlapping scheduler check skipped');
 const manual=service.get(true);assert.equal(calls,1,'manual and scheduler share one request');
 release!();await manual;await first;delay=undefined;
 const ledger=()=>JSON.parse(fs.readFileSync(path.join(directory,'free-source-refresh.json'),'utf8'));
 assert.equal(ledger().jobs[0].key,'potato-export-quote');assert.equal(ledger().status,'completed');
 assert.equal(ledger().jobs[0].observationDate,'2026-08');assert.equal(ledger().jobs[0].refresh.lastSuccessfulFetchAt,clock.toISOString());
 await runner.check();assert.equal(calls,1,'once per weekday');
 service=makeService();runner=makeRunner();await runner.check();assert.equal(calls,1,'same-day restart uses persistent run ledger');
 clock=new Date('2026-10-23T00:00:00Z');month='2026-09';await runner.check();assert.equal(calls,2);assert.equal(ledger().jobs[0].observationDate,'2026-09');
 const successAt=clock.toISOString(),saved=fs.readFileSync(quoteFile,'utf8');
 clock=new Date('2026-10-24T00:00:00Z');await runner.check();assert.equal(calls,2,'Saturday skipped');
 clock=new Date('2026-10-25T00:00:00Z');await runner.check();assert.equal(calls,2,'Sunday skipped');
 clock=new Date('2026-10-26T00:00:00Z');mode='http';service=makeService();runner=makeRunner();await runner.check();
 assert.equal(calls,3);assert.equal(ledger().status,'partial');assert.match(ledger().jobs[0].error,/HTTP 503/);
 assert.equal(ledger().jobs[0].observationDate,'2026-09');assert.equal(ledger().jobs[0].refresh.lastSuccessfulFetchAt,successAt);
 assert.equal(ledger().jobs[0].refresh.checkedAt,clock.toISOString());assert.equal(fs.readFileSync(quoteFile,'utf8'),saved,'failure preserves durable verified receipt');
 await makeRunner().check();assert.equal(calls,3,'failed daily attempt is not repeated after restart');
 const fallback=await service.get(true);assert.equal(fallback.data?.period,'2026-09');assert.equal(fallback.verifiedAt,successAt);assert.ok(fallback.refreshFailed);
 clock=new Date('2026-10-27T00:00:00Z');mode='invalid';await runner.check();assert.match(ledger().jobs[0].error,/미확보/);assert.equal(fs.readFileSync(quoteFile,'utf8'),saved);
 clock=new Date('2026-10-28T00:00:00Z');mode='ok';await runner.check();assert.equal(ledger().status,'completed');assert.equal(ledger().jobs[0].refresh.lastSuccessfulFetchAt,clock.toISOString(),'unchanged statistic has a new successful query timestamp');
 fs.writeFileSync(path.join(directory,'settings.json'),JSON.stringify({freeAutoEnabled:false,scheduleHourKST:9}));clock=new Date('2026-10-29T00:00:00Z');const before=calls;await runner.check();assert.equal(calls,before,'disabled schedule remains disabled');
 console.log('PASS: offline scheduled KST execution, new publication, distinct observation/success/attempt dates, HTTP and validation failure retention, same-day/restart/concurrent/manual deduplication, weekends and disabled configuration');
} finally {
 globalThis.fetch=originalFetch;
 fs.rmSync(directory,{recursive:true,force:true});
}
