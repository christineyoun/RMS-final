#!/usr/bin/env node
/** Read-only comparison of approved local MI and a Cloud VIEWER or immutable public bundle.
 * No Gemini, writes, GCP IAM, storage mutations, or article count overrides. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const opts=Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith('--')&&s.includes('=')).map(s=>s.slice(2).split(/=(.*)/s).slice(0,2)));
if(process.argv.includes('--help')){
 console.log('node --import tsx scripts/mi/potato-cloud-parity.mjs [--local-url=http://127.0.0.1:5173] [--cloud-url=https://YOUR-CLOUD-RUN-URL] [--cloud-bundle=/path/bundle.json] [--cloud-pointer=/path/current.json]');
 process.exit(0);
}
if(opts['cloud-url']&&opts['cloud-bundle'])throw Error('Choose one Cloud source');
const route='/api/market-intelligence?commodity=potato-starch';
const readJson=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
const describe=(body,origin,detail={})=>{
 const parsed=body?.payload?.articles?body.payload:body;
 const raw=parsed?.articles;
 if(!Array.isArray(raw))return {origin,status:'unavailable-or-not-a-news-payload',...detail};
 const articles=raw.map(a=>({
  url:String(a?.originalUrl||a?.url||''),
  publishedAt:String(a?.publishedAt||''),
  title:String(a?.title||a?.title_kr||''),
  verified:a?.linkStatus==='verified'&&!a?.unavailable
 }));
 return {origin,status:'read',count:articles.length,verified:articles.filter(a=>a.verified).length,articles,...detail};
};
const get=async(base)=>{
 const u=new URL(route,base);if(!['https:','http:'].includes(u.protocol))throw Error('Invalid URL protocol');
 const r=await fetch(u,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('HTTP '+r.status+' ('+u.host+')');
 return await r.json();
};
let local;
if(opts['local-url']){
 try{local=describe(await get(opts['local-url']),'local-live-viewer');}
 catch(e){local={origin:'local-live-viewer',status:'unavailable',error:String(e.message)};}
}else{
 try{
  const {readScheduledContent}=await import('../../src/server/scheduledContent.ts');
  const saved=readScheduledContent('news-potato-starch');
  local=saved?describe(saved,'local-verified-scheduled-content'):{origin:'local-verified-scheduled-content',status:'unavailable'};
 }catch(e){local={origin:'local-verified-scheduled-content',status:'unavailable',error:String(e.message)};}
 if(local.status!=='read'){
  const fallback=readJson('.rms-stage3/snapshots/news-potato-starch.json');
  if(fallback)local=describe(fallback,'local-legacy-snapshot (not separately approved by this auditor)');
 }
}
let cloud={origin:'cloud',status:'NOT CHECKED — supply --cloud-url or --cloud-bundle'};
if(opts['cloud-url']){
 try{cloud=describe(await get(opts['cloud-url']),'cloud-live-viewer');}
 catch(e){cloud={origin:'cloud-live-viewer',status:'unavailable — no Cloud parity claim',error:String(e.message)};}
}
if(opts['cloud-bundle']){
 const filename=path.resolve(opts['cloud-bundle']),bytes=fs.readFileSync(filename);
 const bundle=JSON.parse(bytes.toString());
 let verifiedPointer=false;
 if(opts['cloud-pointer']){
  const pointer=readJson(path.resolve(opts['cloud-pointer']));
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(!pointer?.bundle||pointer.bundle.sha256!==digest||pointer.bundle.key!=='public/'+digest+'.json'||pointer.revision!==bundle.revision||pointer.publishedAt!==bundle.publishedAt)throw Error('Cloud bundle does not match versioned current.json pointer; abort.');
  verifiedPointer=true;
 }
 const entry=bundle?.responses?.[route];
 cloud=describe(entry?.payload,'cloud-versioned-bundle',{
  revision:bundle?.revision||null,publishedAt:bundle?.publishedAt||null,
  httpStatus:entry?.status??null,pointerHashVerified:verifiedPointer
 });
}
const unique=a=>[...new Set(a)];
const cloudUrls=new Set((cloud.articles||[]).map(a=>a.url).filter(Boolean));
const localUrls=new Set((local.articles||[]).map(a=>a.url).filter(Boolean));
const comparison=local.status==='read'&&cloud.status==='read'?{
  common:unique([...localUrls].filter(u=>cloudUrls.has(u))),
  localOnly:unique([...localUrls].filter(u=>!cloudUrls.has(u))),
  cloudOnly:unique([...cloudUrls].filter(u=>!localUrls.has(u))),
  sameArticleSet:localUrls.size===cloudUrls.size&&[...localUrls].every(u=>cloudUrls.has(u))
 }:null;
console.log('RMS POTATO STARCH MI PARITY — READ ONLY');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),local,cloud,comparison},null,2));
if(!comparison)console.log('CLOUD PARITY NOT VERIFIED: connect to the actual Cloud viewer or supply its captured publication bundle.');
else if(!comparison.sameArticleSet)console.log('CLOUD PARITY MISMATCH: inspect missing URLs and immutable publication revision before any promotion.');
else console.log('CLOUD PARITY ARTICLE URL SET MATCHES (other publication checks still required).');
console.log('No data, publications, providers, AI or Cloud resources modified.');
