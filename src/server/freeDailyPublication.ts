import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
export const freeRoot=()=>path.join(process.cwd(),'.rms-stage3');
export function readFreeJson(file:string,directory=freeRoot()):any{try{return JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));}catch{return null;}}
export function writeFreeJson(file:string,value:any,directory=freeRoot()){
 fs.mkdirSync(directory,{recursive:true});const dest=path.join(directory,file),temp=dest+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,dest);
}
const volatile=new Set(['lastSuccessAt','lastAttempt','lastAttemptTime','lastSuccessTime','lastObservationUpdateAt','sourceChecks','refreshId','finishedAt','startedAt','checkedDay','checkedAt','retrievedAt','verifiedAt','lastUpdated','lastCheckedAt','lastSuccessfulFetchAt','lastRetrievalTime','sourceLastCheckedAt','sourceLastVerifiedAt','fetchedAt','refreshMetadata','refresh','lastError','error','isCached','dataFreshness','dataStatus','status','lastAttemptAt','firstRetrievedAt','lastRetrievedAt']);
export function observationFingerprint(value:any):string{
 const clean=(v:any):any=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!volatile.has(k)).map(k=>[k,clean(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(clean(value))??'null').digest('hex');
}
export function readFreePublication(){return readFreeJson('free-daily-publication.json');}
export function freeRefreshStatus(directory=freeRoot()){
 const run=readFreeJson('free-source-refresh.json',directory),history=readFreeJson('free-source-observations.json',directory)||{};
 return {running:run?.status==='running',lastAttempt:run,lastSuccessfulRefreshAt:history.lastSuccessfulRefreshAt||null,lastPublicationAt:history.lastPublicationAt||null,automaticPaidAI:false};
}
