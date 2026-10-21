/** Durable Yahoo ZS=F observations. No scheduler, FX conversion or paid API dependency. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {SoybeanPriceSnapshot} from '../utils/soybeanPriceSnapshot.ts';
import type {PsdOtherResult} from './usdaOtherCommoditiesLiveService.ts';

export const SOYBEAN_SOURCE_URL='https://query1.finance.yahoo.com/v8/finance/chart/ZS%3DF?range=5y&interval=1d';
export const SOYBEAN_HISTORY_FILE=()=>path.join(process.cwd(),'.rms-price-history','soybean.json');
export type SoybeanRefreshTrigger='read'|'manual'|'scheduled';
export type SoybeanPoint=SoybeanPriceSnapshot['data'][number]&{sourceUrl?:string;firstRetrievedAt?:string;lastRetrievedAt?:string};
export interface SoybeanRefreshAttempt {
  id:string;trigger:SoybeanRefreshTrigger;startedAt:string;finishedAt?:string;
  status:'running'|'updated'|'unchanged'|'partial'|'failed';
  observationDate?:string;receivedLatestDate?:string;receivedCount?:number;storedCount?:number;
  added?:number;revised?:number;error?:string;
}
export interface SoybeanHistoryState {
  version:1;benchmark:'CBOT ZS=F';sourceUrl:string;
  snapshot:SoybeanPriceSnapshot|null;world?:PsdOtherResult;
  lastAttempt?:SoybeanRefreshAttempt;lastSuccessAt?:string;lastObservationUpdateAt?:string;
}
export const emptySoybeanHistory=():SoybeanHistoryState=>({version:1,benchmark:'CBOT ZS=F',sourceUrl:SOYBEAN_SOURCE_URL,snapshot:null});
function validDate(date:unknown,now=Date.now()):date is string {
  return typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&Date.parse(date)<=now;
}
export function validSoybeanPoint(p:any,now=Date.now()):boolean {
  return p&&validDate(p.date,now)&&!p.isSynthetic&&typeof p.isProvisional==='boolean'&&
    Number.isFinite(p.centsPerBushel)&&p.centsPerBushel>0&&Number.isFinite(p.usdPerMT)&&p.usdPerMT>0&&
    Math.abs(p.usdPerMT-Number((p.centsPerBushel/100*36.7437).toFixed(2)))<=.011&&
    (p.quoteValue===undefined||p.quoteValue===p.centsPerBushel)&&
    (p.quoteUnit===undefined||p.quoteUnit==='US¢/bu');
}
function validIdentity(h:any){return h?.success===true&&h.commodity==='soybean'&&/^ZS=F(?: \(CBOT Soybean\))?$/.test(h.symbol)&&
  h.source==='CBOT / Yahoo Finance'&&h.quoteUnit==='US¢/bu'&&h.priceUnit==='USD/MT'&&Number.isFinite(Date.parse(h.fetchedAt));}
export function readSoybeanHistory(file:string):SoybeanHistoryState {
  if(!fs.existsSync(file))return emptySoybeanHistory();
  try {
    const s=JSON.parse(fs.readFileSync(file,'utf8')) as SoybeanHistoryState;
    if(s.version!==1||s.benchmark!=='CBOT ZS=F'||s.sourceUrl!==SOYBEAN_SOURCE_URL||
      s.snapshot!==null&&(!validIdentity(s.snapshot)||!Array.isArray(s.snapshot.data)||!s.snapshot.data.length||
        s.snapshot.data.some(p=>!validSoybeanPoint(p))||new Set(s.snapshot.data.map(p=>p.date)).size!==s.snapshot.data.length||
        s.snapshot.data.some((p,i)=>i>0&&p.date<=s.snapshot!.data[i-1].date)))throw Error('Invalid persisted Soybean identity/observations');
    return s;
  }catch(e){throw Error('Saved Soybean history cannot be read safely: '+(e as Error).message);}
}
export function writeSoybeanHistory(file:string,state:SoybeanHistoryState){
  fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(state,null,2),{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
export function recordSoybeanAttempt(file:string,attempt:SoybeanRefreshAttempt){
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file+'.refresh.jsonl',JSON.stringify(attempt)+'\n');
}
/** Reject a questionable packet as a whole; never silently delete or invent observations. */
export function mergeSoybeanHistory(previous:SoybeanPriceSnapshot|null,incoming:any,now=Date.now()) {
  if(!validIdentity(incoming)||Date.parse(incoming.fetchedAt)>now+60_000||!Array.isArray(incoming.data)||!incoming.data.length||incoming.data.some((p:any)=>!validSoybeanPoint(p,now)))throw Error('Invalid Yahoo Soybean benchmark, units, dates or price conversion');
  const received=new Map<string,SoybeanPoint>();
  for(const p of incoming.data){const other=received.get(p.date);if(other&&JSON.stringify(other)!==JSON.stringify(p))throw Error('Conflicting duplicate Yahoo Soybean observation: '+p.date);received.set(p.date,p);}
  const points=new Map<string,SoybeanPoint>((previous?.data||[]).map(p=>[p.date,p]));let added=0,revised=0;
  const revisions:Array<{date:string;previous:SoybeanPoint;replacement:SoybeanPoint}>=[];
  for(const p of received.values()){
    const old=points.get(p.date);const changed=old&&(old.usdPerMT!==p.usdPerMT||old.centsPerBushel!==p.centsPerBushel||old.isProvisional!==p.isProvisional);
    // Older packets cannot regress a corrected quote or restore provisional status.
    if(old&&(Date.parse(incoming.fetchedAt)<Date.parse(old.lastRetrievedAt||previous!.fetchedAt)||!old.isProvisional&&p.isProvisional))continue;
    const next={...p,sourceUrl:SOYBEAN_SOURCE_URL,firstRetrievedAt:old?.firstRetrievedAt||incoming.fetchedAt,lastRetrievedAt:incoming.fetchedAt};
    if(!old)added++;else if(changed){revised++;revisions.push({date:p.date,previous:old,replacement:next});}
    points.set(p.date,next);
  }
  const data=[...points.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const receivedLatestDate=[...received.keys()].sort().at(-1)!;
  const partial=receivedLatestDate<data.at(-1)!.date;
  const quote=incoming.latestMarketQuote;
  const previousQuote=previous?.latestMarketQuote;
  const latestMarketQuote=quote&&(!previousQuote?.asOf||Date.parse(quote.asOf)>=Date.parse(previousQuote.asOf))?quote:previousQuote||null;
  return {history:{...previous,...incoming,data,latestMarketQuote},added,revised,revisions,receivedLatestDate,partial};
}
/** Coordinate server instances as well as overlapping page/manual/scheduler requests. */
export async function acquireSoybeanHistoryLock(file:string):Promise<{waited:boolean;release:()=>void}> {
  fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+'.lock',token=randomUUID(),started=Date.now();let waited=false;
  while(true){
    try{fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}),{flag:'wx'});return {waited,release:()=>{
      if(fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock,'utf8')).token===token)fs.unlinkSync(lock);
    }};}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
    waited=true;
    try{const owner=JSON.parse(fs.readFileSync(lock,'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Invalid Soybean lock owner');
      try{process.kill(owner.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH'){fs.unlinkSync(lock);continue;}throw e;}
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
    if(Date.now()-started>60_000)throw Error('Soybean history refresh already running; lock wait deadline exceeded');
    await new Promise(r=>setTimeout(r,50));
  }
}
