import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {archiveState,restoreState,publish} from '../../../scripts/cloud/publication.ts';
import {sha256,loadPublicBundle,validatePublicationPointer} from '../cloudPublication.ts';
import {publicCaptureRoutes,publicRouteKey} from '../publicDeploymentRoutes.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'rms-state-test-'));
await fs.mkdir(path.join(root,'.rms-price-history'),{recursive:true});
await fs.mkdir(path.join(root,'.rms-stage3'),{recursive:true});
const originalHistory='{"date":"2025-10-24","price":100}\n{"date":"2026-10-23","price":110}\n';
await fs.writeFile(path.join(root,'.rms-price-history/verified.refresh.jsonl'),originalHistory);
await fs.writeFile(path.join(root,'.rms-stage3/settings.json'),'{"autoEnabled":false,"freeAutoEnabled":true}');
await fs.writeFile(path.join(root,'.rms-stage3/free-daily-publication.json'),JSON.stringify({revision:'one',publishedAt:'2026-10-25T15:00:00Z'}));
await fs.writeFile(path.join(root,'.rms-stage3/admin-token.json'),'not-for-transfer');
const state=await archiveState(root),restored=await fs.mkdtemp(path.join(os.tmpdir(),'rms-state-restored-'));
await restoreState(state,restored);
assert.equal(await fs.readFile(path.join(restored,'.rms-price-history/verified.refresh.jsonl'),'utf8'),originalHistory);
await assert.rejects(fs.access(path.join(restored,'.rms-stage3/admin-token.json')));
await assert.rejects(restoreState(gzipSync(JSON.stringify({version:1,files:{'src/data/../../escape.json':'eA=='}})),restored),/Unsafe/);

// Exercise the actual promotion code against an offline generation-aware GCS fixture.
const quotes=JSON.parse(await fs.readFile(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const responses:any=Object.fromEntries(publicCaptureRoutes().map(r=>[publicRouteKey(r),{status:200,payload:{}}]));
for(const [route,payload]of Object.entries(quotes)){const key=publicRouteKey(route);if(key&&responses[key])responses[key].payload=payload;}
responses['/api/rms/free-publication'].payload={revision:'one',publishedAt:'2026-10-25T15:00:00Z',data:{}};
const first:any={version:1,revision:'one',publishedAt:'2026-10-25T15:00:00Z',responses};
const second=structuredClone(first);second.revision='two';second.publishedAt='2026-10-26T15:00:00Z';Object.assign(second.responses['/api/rms/free-publication'].payload,{revision:second.revision,publishedAt:second.publishedAt});
await fs.writeFile(path.join(root,'.rms-stage3/free-daily-publication.json'),JSON.stringify({revision:second.revision,publishedAt:second.publishedAt}));
const secondState=await archiveState(root);
const savedEnv={...process.env},fetchBefore=globalThis.fetch,objects=new Map<string,{bytes:Buffer;generation:string}>();let serial=0,failPointer=false;
process.env.RMS_PUBLICATION_BUCKET='pub';process.env.RMS_STATE_BUCKET='state';delete process.env.RMS_PUBLICATION_FILE;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));if(u.hostname==='metadata.google.internal')return Response.json({access_token:'offline',expires_in:3600});
 const upload=u.pathname.startsWith('/upload/'),bucket=u.pathname.split('/b/')[1].split('/')[0],name=upload?u.searchParams.get('name')!:decodeURIComponent(u.pathname.split('/o/')[1]);const key=bucket+'/'+name;
 if(init?.method==='POST'){
  if(failPointer&&name==='current.json')return new Response('',{status:503});
  const expected=u.searchParams.get('ifGenerationMatch'),prior=objects.get(key);
  if(expected!==(prior?.generation||'0'))return new Response('',{status:412});
  const record={bytes:Buffer.from(init.body as any),generation:String(++serial)};objects.set(key,record);return Response.json({generation:record.generation});
 }
 const item=objects.get(key);return item?new Response(item.bytes,{headers:{'x-goog-generation':item.generation}}):new Response('',{status:404});
};
try{
 await publish(first,state,'0');const initial=objects.get('pub/current.json')!;
 assert.equal((await loadPublicBundle()).revision,'one');
 const pointer=JSON.parse(initial.bytes.toString());validatePublicationPointer(pointer);
 assert.equal(sha256(objects.get('state/'+pointer.state.key)!.bytes),pointer.state.sha256);
 await assert.rejects(publish(second,state,initial.generation),/publication mismatch/);
 failPointer=true;await assert.rejects(publish(second,secondState,initial.generation),/503/);
 assert.equal(objects.get('pub/current.json'),initial,'failed promotion leaves previous publication and state pointer intact');
 assert.equal((await loadPublicBundle()).revision,'one');
 failPointer=false;await publish(second,secondState,initial.generation);
 assert.equal((await loadPublicBundle()).revision,'two','existing viewer follows a complete promoted publication');
 await assert.rejects(publish(first,state,initial.generation),/412/);
 assert.equal((await loadPublicBundle()).revision,'two','stale writer cannot overwrite newer publication');
 const {cloudScheduledJournal}=await import('../scheduledAi.ts');const firstJournal=cloudScheduledJournal('2026-10-26');assert.equal(await firstJournal.read(),null);
 const record:any={version:2,day:'2026-10-26',policyHash:'offline-only',budget:{fxDate:null,verifiedUsdKrw:null,fxFloorKrwPerUsd:1500,fxSafetyMarginPct:20,safetyKrwPerUsd:null},requests:[{phase:'news-wheat',attempt:1,model:'offline',reservedUsd:0.25,reservedKrw:450}],phases:{'news-wheat':{status:'started'}}};await firstJournal.save(record);
 const restarted=cloudScheduledJournal('2026-10-26');assert.deepEqual(await restarted.read(),record,'Cloud restart retains reservations even without publication promotion');await restarted.save({...record,phases:{'news-wheat':{status:'retained-previous'}}});await assert.rejects(firstJournal.save(record),/412/);
 console.log('PASS durable KRW daily journal survives restart/failed publication and rejects stale reservation writes.');
 process.env.K_SERVICE='deployed-viewer';process.env.RMS_PUBLICATION_FILE='/tmp/local-only.json';
 await assert.rejects(loadPublicBundle(),/persistent bucket/);
 assert.throws(()=>validatePublicationPointer({...pointer,state:{...pointer.state,key:'../state'}}),/object identity/);
 console.log('PASS exact JSONL history/state round-trip, credential/path exclusion, atomic promotion, failed publication retention, stale-writer rejection and Cloud Run persistence requirement (offline).');
}finally{globalThis.fetch=fetchBefore;for(const k of ['RMS_PUBLICATION_BUCKET','RMS_STATE_BUCKET','RMS_PUBLICATION_FILE','K_SERVICE']){if(savedEnv[k]===undefined)delete process.env[k];else process.env[k]=savedEnv[k];}}
