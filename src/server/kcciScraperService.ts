import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseKcciTimeseries,KOBC_KCCI_URL,type KcciObservation} from './kcciTimeseriesParser.ts';
export {KOBC_KCCI_URL} from './kcciTimeseriesParser.ts';
import {readFreeJson,writeFreeJson} from './freeDailyPublication.ts';

/** Licensed as unrestricted/free by the Korea public data portal, dataset 15131881. */
export const KOBC_KCCI_SUMMARY_URL='https://kobc.or.kr/ebz/shippinginfo/kcci/gridList.do?mId=0304000000';
const CACHE='free-kcci.json';
export type SavedKcci={indexIdentity:'KOBC KCCI Composite Index';source:string;sourceUrl:string;
  kcciPoints:number;observationDate:string;previousPoints:number;previousObservationDate:string;changePct:number;
  updatedAt:string;receiptPath:string;receiptSha256:string;history:(KcciObservation&{receiptSha256:string;receiptPath:string})[];lastError?:string};
function validDate(s:unknown,now=new Date()){
 if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&d.getTime()<=now.getTime();
}
export function readVerifiedKcci():SavedKcci|null {
 const record=readFreeJson(CACHE) as SavedKcci|null;
 return record?.indexIdentity==='KOBC KCCI Composite Index'&&record.sourceUrl===KOBC_KCCI_URL&&
  typeof record.kcciPoints==='number'&&Number.isFinite(record.kcciPoints)&&record.kcciPoints>0&&
  typeof record.previousPoints==='number'&&Number.isFinite(record.previousPoints)&&record.previousPoints>0&&
  validDate(record.observationDate)&&validDate(record.previousObservationDate)&&record.previousObservationDate<record.observationDate&&
  typeof record.receiptSha256==='string'&&/^[a-f0-9]{64}$/.test(record.receiptSha256)&&
  typeof record.receiptPath==='string'&&record.receiptPath.startsWith('.rms-stage3/evidence/kcci/')&&
  Array.isArray(record.history)&&fs.existsSync(path.resolve(record.receiptPath))?record:null;
}
function kstToday(now:Date):string {
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(key:string)=>p.find(v=>v.type===key)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
/** KCCI releases Mondays at 14:00 KST. The existing 09:00 weekday RMS job
 * performs a network refresh from Tuesday onward until the week's data is seen.
 * Once current-week evidence is saved, subsequent daily runs are cache-only.
 */
export function kcciNeedsWeeklyFetch(previous:SavedKcci|null,now=new Date()){
 if(!previous)return true;
 const today=kstToday(now),weekday=new Date(today+'T00:00:00Z').getUTCDay();
 const monday=new Date(today+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-((weekday+6)%7));
 const currentMonday=monday.toISOString().slice(0,10);
 return weekday!==1 && previous.observationDate<currentMonday;
}
export async function refreshVerifiedKcci(force=false):Promise<SavedKcci&{lastError?:string}> {
 const before=readVerifiedKcci(),now=new Date();
 if(!force&&!kcciNeedsWeeklyFetch(before,now))return before!;
 const lock=path.resolve('.rms-stage3/free-kcci-refresh.lock');
 fs.mkdirSync(path.dirname(lock),{recursive:true});
 let lockFd:number;
 try{
  lockFd=fs.openSync(lock,'wx',0o600);
 }catch(err){
  // A crashed process must not block future weekly refreshes indefinitely.
  try{
   if(Date.now()-fs.statSync(lock).mtimeMs>120_000){fs.rmSync(lock);lockFd=fs.openSync(lock,'wx',0o600);}
   else throw err;
  }catch{

  // Do not let simultaneous scheduled refreshes race to replace saved history.
  if(before)return {...before,lastError:'KCCI refresh already in progress; last verified retained'};
  throw Error('KCCI refresh already in progress; no saved data to publish');
  }
 }
 try{
  const prior=readVerifiedKcci(); // Recheck under lock after another job may have committed.
  if(!force&&!kcciNeedsWeeklyFetch(prior,now))return prior!;
  try{
  const response=await fetch(KOBC_KCCI_URL,{headers:{accept:'text/html'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('KOBC HTTP '+response.status);
  const contentType=response.headers.get('content-type')||'';
  if(!/text\/html/i.test(contentType))throw Error('KOBC returned non-HTML content');
  const html=await response.text();
  if(html.length<1000||html.length>3_000_000)throw Error('Unexpected KOBC HTML size');
  const parsed=parseKcciTimeseries(html,now);
  const receiptSha256=createHash('sha256').update(html).digest('hex');
  const receiptPath='.rms-stage3/evidence/kcci/'+receiptSha256+'.json';
  const current=(prior?.history||[]);
  const byDate=new Map(current.map(r=>[r.observationDate,r]));
  for(const row of parsed.history){
   const previous=byDate.get(row.observationDate);
   if(previous&&previous.kcciPoints!==row.kcciPoints)throw Error('KOBC revised previously verified KCCI date; original retained for review');
   if(!previous)byDate.set(row.observationDate,{...row,receiptPath,receiptSha256});
  }
  const combined=[...byDate.values()].sort((a,b)=>a.observationDate.localeCompare(b.observationDate));
  if(prior&&combined.length===current.length) return prior; // No new source observation: do not re-date or republish.
  const latest=combined.at(-1),previous=combined.at(-2);
  if(!latest||!previous)throw Error('Insufficient cumulative KCCI history');
  // Do not let a transient older publisher window roll back the last publication.
  const effective=latest.observationDate>=parsed.observationDate?latest:parsed.history.at(-1)!;
  const value:SavedKcci={indexIdentity:'KOBC KCCI Composite Index',source:'Korea Ocean Business Corporation (KOBC)',
   sourceUrl:KOBC_KCCI_URL,kcciPoints:effective.kcciPoints,observationDate:effective.observationDate,
   previousPoints:previous.kcciPoints,previousObservationDate:previous.observationDate,
   changePct:(effective.kcciPoints/previous.kcciPoints-1)*100,updatedAt:now.toISOString(),
   receiptSha256:latest.receiptSha256,receiptPath:latest.receiptPath,history:combined};
  // Receipt is saved BEFORE the observation is published; hashes are immutable.
  const target=path.resolve(receiptPath);fs.mkdirSync(path.dirname(target),{recursive:true});
  if(!fs.existsSync(target)){
   const temp=target+'.'+randomUUID()+'.tmp';
   fs.writeFileSync(temp,JSON.stringify({sourceUrl:KOBC_KCCI_URL,retrievedAt:now.toISOString(),status:response.status,
     sha256:receiptSha256,body:html},null,2),{flag:'wx',mode:0o600});
   fs.renameSync(temp,target);
  }
  writeFreeJson(CACHE,value);
  return value;
  }catch(err){
   if(prior)return {...prior,lastError:(err as Error).message};
   throw err;
  }
 }finally{
  fs.closeSync(lockFd);
  fs.rmSync(lock,{force:true});
 }
}
