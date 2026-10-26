import fs from 'node:fs/promises';
import {quoteFromResponse,COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {parseDatedDisplayFx} from '../utils/soybeanPriceSnapshot.ts';
import {createHash} from 'node:crypto';
import {publicRouteKey,PUBLIC_COMMODITIES,publicCaptureRoutes} from './publicDeploymentRoutes.mjs';
import {dailyPublicationIssue} from '../utils/dailyPublicationIssue.ts';
export type SavedResponse={status:number;payload:any};
export type PublicBundle={version:1;publishedAt:string;revision:string;responses:Record<string,SavedResponse>};
export const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function validatePublicBundle(bundle:PublicBundle) {
 const pub=bundle?.responses?.['/api/rms/free-publication'];
 if(bundle?.version!==1||pub?.status!==200||!dailyPublicationIssue(pub.payload)||bundle.publishedAt!==pub.payload.publishedAt||bundle.revision!==pub.payload.revision)throw Error('Saved publication identity/Issue unavailable');
 for(const [route,response] of Object.entries(bundle.responses))if(publicRouteKey(route)!==route||!response||!Number.isInteger(response.status)||response.status<200||response.status>599)throw Error('Unreviewed or invalid saved response: '+route);
 for(const route of publicCaptureRoutes()){if(!bundle.responses[publicRouteKey(route)!])throw Error('Required saved response missing: '+route);}
 const fx=bundle.responses['/api/rms/free-fx']?.payload;if(!parseDatedDisplayFx(fx?.raw,fx?.verifiedAt))throw Error('Verified saved display FX missing');
 for(const id of COMMODITY_IDS){
  // Preserve the existing readers' approved/unavailable states. Deployment
  // transport must not introduce another AI or editorial acceptance gate.
  const quote=id==='wheat'?'/api/uswheat/price-history':id==='potato-starch'?'/api/starch/potato-export-quote':['soybean','soybean-oil','sugar'].includes(id)?'/api/'+id+'/price-snapshot':publicRouteKey('/api/history?commodity='+id+'&timeframe=5Y');
  if(bundle.responses[quote!]?.status!==200||!quoteFromResponse(id,bundle.responses[quote!].payload))throw Error('Saved benchmark missing: '+id);
 }
 return bundle;
}
/** Capture existing saved readers; no source collection, rewriting or calculations. */
export async function capturePublicBundle(base:string):Promise<PublicBundle>{
 const origin=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Capture requires the private loopback saved-data server');
 const responses:Record<string,SavedResponse>={};
 const read=async(route:string)=>{const r=await fetch(new URL(route,origin),{signal:AbortSignal.timeout(30000)});const payload=await r.json();responses[publicRouteKey(route)!]={status:r.status,payload};};
 const start=await fetch(new URL('/api/rms/free-publication',origin)).then(r=>r.json());
 for(const route of publicCaptureRoutes())await read(route);
 for(const id of PUBLIC_COMMODITIES.filter(s=>!s.includes('starch'))){const data=responses['/api/usda/'+id]?.payload?.data;const year=Number(data?.marketYear)-1;if(Number.isInteger(year))await read('/api/usda/'+id+'?marketYear='+year);}
 const end=responses['/api/rms/free-publication'].payload;
 const after=await fetch(new URL('/api/rms/free-publication',origin)).then(r=>r.json());
 if(start.revision!==end.revision||after.revision!==end.revision)throw Error('Publication changed during capture; retry after writer completes');
 responses['/api/rms/refresh-status']={status:200,payload:{freeSources:{enabled:true,running:false,hourKST:9,lastPublicationAt:end.publishedAt},autoEnabled:false,timezone:'Asia/Seoul'}};
 return validatePublicBundle({version:1,publishedAt:end.publishedAt,revision:end.revision,responses});
}
let token:{value:string;expires:number}|null=null;
async function cloudToken(){
 if(token&&token.expires>Date.now()+60000)return token.value;
 const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('Attached Google service-account identity unavailable');const j=await r.json();token={value:j.access_token,expires:Date.now()+j.expires_in*1000};return token.value;
}
export async function gcsRead(bucket:string,key:string){
 const r=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?alt=media`,{headers:{Authorization:'Bearer '+await cloudToken()},signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('Cloud publication read failed: HTTP '+r.status);let bytes=new Uint8Array(await r.arrayBuffer());let generation=r.headers.get('x-goog-generation');if(!generation){const metadata=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}`,{headers:{Authorization:'Bearer '+await cloudToken()},signal:AbortSignal.timeout(30000)});if(!metadata.ok)throw Error('Cloud publication generation unavailable');generation=(await metadata.json()).generation;if(!generation)throw Error('Cloud object generation missing');const pinned=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?alt=media&generation=${encodeURIComponent(generation)}`,{headers:{Authorization:'Bearer '+await cloudToken()},signal:AbortSignal.timeout(60000)});if(!pinned.ok)throw Error('Version-bound cloud object read failed');bytes=new Uint8Array(await pinned.arrayBuffer());}return {bytes,generation};
}
export async function gcsWrite(bucket:string,key:string,bytes:Uint8Array,generation:string='0'){
 const r=await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(key)}&ifGenerationMatch=${generation}`,{method:'POST',headers:{Authorization:'Bearer '+await cloudToken(),'Content-Type':'application/octet-stream'},body:bytes as any,signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error('Cloud publication write failed: HTTP '+r.status);return r.json();
}
export type PublicationPointer={version:1;bundle:{key:string;sha256:string};state:{key:string;sha256:string};publishedAt:string;revision:string};
export function validatePublicationPointer(pointer:PublicationPointer){
 if(pointer?.version!==1||!pointer.revision||!Number.isFinite(Date.parse(pointer.publishedAt)))throw Error('Invalid publication pointer');
 for(const [entry,prefix,suffix] of [[pointer.bundle,'public/','.json'],[pointer.state,'state/','.json.gz']] as const){
  if(!entry||! /^[a-f0-9]{64}$/.test(entry.sha256)||entry.key!==prefix+entry.sha256+suffix)throw Error('Invalid publication pointer object identity');
 }
 return pointer;
}
export async function readCloudPointer(){const bucket=process.env.RMS_PUBLICATION_BUCKET;if(!bucket)throw Error('RMS_PUBLICATION_BUCKET missing');const result=await gcsRead(bucket,'current.json');return {pointer:validatePublicationPointer(JSON.parse(Buffer.from(result.bytes).toString())),generation:result.generation};}
let cachedCloud:{key:string;hash:string;bundle:PublicBundle}|null=null;
export async function loadPublicBundle(){
 if(process.env.RMS_PUBLICATION_FILE){if(process.env.K_SERVICE)throw Error('Cloud Run requires persistent bucket publications, not RMS_PUBLICATION_FILE');return validatePublicBundle(JSON.parse(await fs.readFile(process.env.RMS_PUBLICATION_FILE,'utf8')));}
 const {pointer}=await readCloudPointer();
 if(cachedCloud?.key===pointer.bundle.key&&cachedCloud.hash===pointer.bundle.sha256&&cachedCloud.bundle.revision===pointer.revision&&cachedCloud.bundle.publishedAt===pointer.publishedAt)return cachedCloud.bundle;
 const r=await gcsRead(process.env.RMS_PUBLICATION_BUCKET!,pointer.bundle.key);if(sha256(r.bytes)!==pointer.bundle.sha256)throw Error('Public publication integrity mismatch');
 const bundle=validatePublicBundle(JSON.parse(Buffer.from(r.bytes).toString()));if(bundle.revision!==pointer.revision||bundle.publishedAt!==pointer.publishedAt)throw Error('Publication pointer identity mismatch');cachedCloud={key:pointer.bundle.key,hash:pointer.bundle.sha256,bundle};return bundle;
}

export async function withCloudPublicationLease<T>(action:()=>Promise<T>):Promise<T>{
 const bucket=process.env.RMS_STATE_BUCKET;if(!bucket)throw Error('Private state bucket missing');
 const key='locks/free-refresh.json',bytes=Buffer.from(JSON.stringify({execution:process.env.CLOUD_RUN_EXECUTION,expiresAt:Date.now()+7200000}));
 let lease:any;
 try{lease=await gcsWrite(bucket,key,bytes);}catch{
  const old=await gcsRead(bucket,key),record=JSON.parse(Buffer.from(old.bytes).toString());
  if(!Number.isFinite(record.expiresAt)||record.expiresAt>Date.now()||!old.generation)throw Error('Another free refresh owns the publication lease');
  await gcsDelete(bucket,key,old.generation);lease=await gcsWrite(bucket,key,bytes);
 }
 try{return await action();}finally{await gcsDelete(bucket,key,String(lease.generation));}
}
async function gcsDelete(bucket:string,key:string,generation:string){
 const r=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?ifGenerationMatch=${generation}`,{method:'DELETE',headers:{Authorization:'Bearer '+await cloudToken()},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Publication lease release failed: HTTP '+r.status);
}
