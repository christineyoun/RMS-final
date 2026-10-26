import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicCaptureRoutes,publicRouteKey,PUBLIC_COMMODITIES} from '../publicDeploymentRoutes.mjs';
import {denyPublicRequest} from '../publicDeploymentGuard.mjs';
import {validatePublicBundle,gcsRead,gcsWrite,withCloudPublicationLease} from '../cloudPublication.ts';
import {startPublicViewer} from '../publicViewer.ts';
const initialEnv={...process.env};
try{
 process.env.RMS_PUBLIC_READONLY='1';process.env.RMS_DISABLE_SCHEDULERS='1';delete process.env.RMS_PUBLIC_DATA_READY;
 await assert.rejects(startPublicViewer(),/not certified/);
 process.env.RMS_DISABLE_SCHEDULERS='0';await assert.rejects(startPublicViewer(),/disabled local schedulers/);
 process.env.RMS_DISABLE_SCHEDULERS='1';process.env.RMS_PUBLIC_DATA_READY='1';process.env.GEMINI_API_KEY='offline-credential';
 await assert.rejects(startPublicViewer(),/credentials/);
}finally{for(const k of ['RMS_PUBLIC_READONLY','RMS_DISABLE_SCHEDULERS','RMS_PUBLIC_DATA_READY','GEMINI_API_KEY']){if(initialEnv[k]===undefined)delete process.env[k];else process.env[k]=initialEnv[k];}}
for(const route of publicCaptureRoutes())assert(publicRouteKey(route),route);
for(const route of ['/api/gemini/live-market-data','/api/rms/control/refresh','/api/history?commodity=corn&timeframe=6M&force=false','/api/history?commodity=corn&commodity=sugar&timeframe=6M','/api/usda/corn?marketYear=2025&token=x'])assert(denyPublicRequest('GET',route));
assert(denyPublicRequest('POST','/api/rms/free-publication'));
const quotes=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const responses:any={};for(const route of publicCaptureRoutes())responses[publicRouteKey(route)!]={status:200,payload:{}};
for(const [route,payload]of Object.entries(quotes)){const key=publicRouteKey(route);if(key&&responses[key])responses[key].payload=payload;}
responses['/api/rms/free-publication'].payload={revision:'fixture',publishedAt:'2026-10-25T15:00:00Z',data:{}};
for(const id of PUBLIC_COMMODITIES){responses['/api/ai-analysis/'+id].payload={data:{approved:true}};responses['/api/market-intelligence?commodity='+id].payload={articles:[{originalUrl:'https://example.org/report'}]};}
const bundle:any={version:1,revision:'fixture',publishedAt:'2026-10-25T15:00:00Z',responses};assert.equal(validatePublicBundle(bundle),bundle);
const bad=structuredClone(bundle);delete bad.responses['/api/ai-analysis/wheat'];assert.throws(()=>validatePublicBundle(bad),/missing/);
assert.throws(()=>validatePublicBundle({...bundle,revision:'wrong'}),/identity/);
const unavailable=structuredClone(bundle);unavailable.responses['/api/ai-analysis/wheat']={status:503,payload:{data:null}};unavailable.responses['/api/market-intelligence?commodity=wheat'].payload={articles:[]};assert.equal(validatePublicBundle(unavailable),unavailable,'transport preserves existing unavailable AI/news states');
const unsafe=structuredClone(bundle);unsafe.responses['/api/rms/control/refresh']={status:200,payload:{}};assert.throws(()=>validatePublicBundle(unsafe),/Unreviewed/);
// Exercise conditional cloud writes and overlap rejection with an offline REST fixture.
const original=globalThis.fetch,bucket=process.env.RMS_STATE_BUCKET;process.env.RMS_STATE_BUCKET='private-fixture';let lock:any=null,generation=1;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));if(u.hostname==='metadata.google.internal')return Response.json({access_token:'offline-fixture',expires_in:3600});
 const method=init?.method||'GET';
 if(method==='POST'){if(lock)return new Response('',{status:412});lock=JSON.parse(Buffer.from(init?.body as any).toString());return Response.json({generation:String(generation)});}
 if(method==='DELETE'){assert.equal(u.searchParams.get('ifGenerationMatch'),String(generation));lock=null;generation++;return new Response(null,{status:204});}
 return Response.json(lock,{headers:{'x-goog-generation':String(generation)}});
};
try{await withCloudPublicationLease(async()=>{await assert.rejects(withCloudPublicationLease(async()=>{}),/Another free refresh/);});assert.equal(lock,null);}finally{globalThis.fetch=original;if(bucket===undefined)delete process.env.RMS_STATE_BUCKET;else process.env.RMS_STATE_BUCKET=bucket;}
console.log('PASS exact saved GET allowlist, denied mutations/paid routes, publication identity, missing records and exclusive cloud lease (offline).');

// Cloud publication reads: cold start, pointer promotion, hash rejection and CAS failure.
const oldBucket=process.env.RMS_PUBLICATION_BUCKET,oldFile=process.env.RMS_PUBLICATION_FILE;
process.env.RMS_PUBLICATION_BUCKET='public-fixture';delete process.env.RMS_PUBLICATION_FILE;
const {loadPublicBundle,sha256}=await import('../cloudPublication.ts');
let body=Buffer.from(JSON.stringify(bundle));let pointer:any={version:1,revision:bundle.revision,publishedAt:bundle.publishedAt,bundle:{key:'public/'+sha256(body)+'.json',sha256:sha256(body)},state:{key:'state/'+sha256('state')+'.json.gz',sha256:sha256('state')}};
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));
 if(u.hostname==='metadata.google.internal')return Response.json({access_token:'offline-fixture',expires_in:3600});
 if(init?.method==='POST')return new Response('',{status:412});
 if(decodeURIComponent(u.pathname).endsWith('/current.json'))return Response.json(pointer,{headers:{'x-goog-generation':'1'}});
 return new Response(body,{headers:{'x-goog-generation':'1'}});
};
try{
 assert.equal((await loadPublicBundle()).revision,'fixture');
 const next=structuredClone(bundle);next.revision='next';next.responses['/api/rms/free-publication'].payload.revision='next';next.publishedAt='2026-10-26T15:00:00Z';next.responses['/api/rms/free-publication'].payload.publishedAt=next.publishedAt;
 body=Buffer.from(JSON.stringify(next));pointer={...pointer,revision:next.revision,publishedAt:next.publishedAt,bundle:{key:'public/'+sha256(body)+'.json',sha256:sha256(body)}};
 assert.equal((await loadPublicBundle()).revision,'next');
 pointer={...pointer,bundle:{key:'public/'+sha256('corrupt')+'.json',sha256:sha256('corrupt')}};await assert.rejects(loadPublicBundle(),/integrity/);
 await assert.rejects(gcsWrite('public-fixture','current.json',Buffer.from('{}'),'old-generation'),/412/);
 console.log('PASS cold cloud read, next publication, corrupt-object rejection and stale promotion CAS rejection (offline).');
}finally{globalThis.fetch=original;if(oldBucket===undefined)delete process.env.RMS_PUBLICATION_BUCKET;else process.env.RMS_PUBLICATION_BUCKET=oldBucket;if(oldFile===undefined)delete process.env.RMS_PUBLICATION_FILE;else process.env.RMS_PUBLICATION_FILE=oldFile;}
