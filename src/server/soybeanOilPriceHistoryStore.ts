/** Durable Yahoo ZL=F soybean oil observations. No scheduler, FX conversion or paid API dependency. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {SoybeanOilPriceSnapshot} from '../utils/soybeanOilPriceSnapshot.ts';
import {centsPerLbToUsdPerMt} from '../utils/commodityConversions.ts';
import {acquireSoybeanHistoryLock} from './soybeanPriceHistoryStore.ts';

export const SOYBEAN_OIL_SOURCE_URL='https://query1.finance.yahoo.com/v8/finance/chart/ZL%3DF?range=5y&interval=1d';
export const SOYBEAN_OIL_HISTORY_FILE=()=>path.join(process.cwd(),'.rms-price-history','soybean-oil.json');
export type SoybeanOilRefreshTrigger='read'|'manual'|'scheduled';
export type SoybeanOilPoint=SoybeanOilPriceSnapshot['data'][number]&{sourceUrl?:string;firstRetrievedAt?:string;lastRetrievedAt?:string};
export interface SoybeanOilRefreshAttempt {
  id:string;trigger:SoybeanOilRefreshTrigger;startedAt:string;finishedAt?:string;
  status:'running'|'updated'|'unchanged'|'partial'|'failed';
  observationDate?:string;receivedLatestDate?:string;receivedCount?:number;storedCount?:number;
  added?:number;revised?:number;error?:string;
}
export interface SoybeanOilHistoryState {
  version:1;benchmark:'CBOT ZL=F';sourceUrl:string;
  snapshot:SoybeanOilPriceSnapshot|null;stocksToUsePct?:number;
  lastAttempt?:SoybeanOilRefreshAttempt;lastSuccessAt?:string;lastObservationUpdateAt?:string;
}
export const emptySoybeanOilHistory=():SoybeanOilHistoryState=>({version:1,benchmark:'CBOT ZL=F',sourceUrl:SOYBEAN_OIL_SOURCE_URL,snapshot:null});
function validDate(date:unknown,now=Date.now()):date is string {
  return typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&Date.parse(date)<=now;
}
export function validSoybeanOilPoint(p:any,now=Date.now()):boolean {
  return p&&validDate(p.date,now)&&!p.isSynthetic&&typeof p.isProvisional==='boolean'&&
    Number.isFinite(p.quoteValue)&&p.quoteValue>0&&p.centsPerBushel===p.quoteValue&&Number.isFinite(p.usdPerMT)&&p.usdPerMT>0&&
    Math.abs(p.usdPerMT-Number(centsPerLbToUsdPerMt(p.quoteValue).toFixed(2)))<=.02&&
    (p.quoteValue===undefined||p.quoteValue===p.centsPerBushel)&&
    (p.quoteUnit===undefined||p.quoteUnit==='US¢/lb');
}
function validIdentity(h:any){return h?.success===true&&h.commodity==='soybean-oil'&&/^ZL=F(?: \(CBOT Soybean Oil\))?$/.test(h.symbol)&&
  h.source==='CBOT / Yahoo Finance'&&h.quoteUnit==='US¢/lb'&&h.priceUnit==='USD/MT'&&Number.isFinite(Date.parse(h.fetchedAt));}
export function readSoybeanOilHistory(file:string):SoybeanOilHistoryState {
  if(!fs.existsSync(file))return emptySoybeanOilHistory();
  try {
    const s=JSON.parse(fs.readFileSync(file,'utf8')) as SoybeanOilHistoryState;
    if(s.version!==1||s.benchmark!=='CBOT ZL=F'||s.sourceUrl!==SOYBEAN_OIL_SOURCE_URL||
      s.snapshot!==null&&(!validIdentity(s.snapshot)||!Array.isArray(s.snapshot.data)||!s.snapshot.data.length||
        s.snapshot.data.some(p=>!validSoybeanOilPoint(p))||new Set(s.snapshot.data.map(p=>p.date)).size!==s.snapshot.data.length||
        s.snapshot.data.some((p,i)=>i>0&&p.date<=s.snapshot!.data[i-1].date)))throw Error('Invalid persisted Soybean Oil identity/observations');
    if(s.stocksToUsePct!==undefined&&(!Number.isFinite(s.stocksToUsePct)||s.stocksToUsePct<0))throw Error('Invalid saved procurement input');
    if(s.snapshot){const latest=s.snapshot.data.at(-1)!,b=s.snapshot.procurementAnalysis?.benchmarkPrice;
      if(!b||b.rawUnit!=='USc/lb'||b.rawPrice!==latest.quoteValue||b.usdPerMT!==latest.usdPerMT||b.observationDate!==latest.date)throw Error('Saved procurement/price observation mismatch');
      for(const p of s.snapshot.data as SoybeanOilPoint[])if(p.sourceUrl!==SOYBEAN_OIL_SOURCE_URL||!Number.isFinite(Date.parse(p.firstRetrievedAt||''))||!Number.isFinite(Date.parse(p.lastRetrievedAt||''))||Date.parse(p.firstRetrievedAt!)>Date.parse(p.lastRetrievedAt!)||Date.parse(p.lastRetrievedAt!)>Date.now()+60000)throw Error('Invalid saved ZL provenance');
    }
    return s;
  }catch(e){throw Error('Saved Soybean Oil history cannot be read safely: '+(e as Error).message);}
}
export function writeSoybeanOilHistory(file:string,state:SoybeanOilHistoryState){
  fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(state,null,2),{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
export function recordSoybeanOilAttempt(file:string,attempt:SoybeanOilRefreshAttempt){
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file+'.refresh.jsonl',JSON.stringify(attempt)+'\n');
}
/** Reject a questionable packet as a whole; never silently delete or invent observations. */
export function mergeSoybeanOilHistory(previous:SoybeanOilPriceSnapshot|null,incoming:any,now=Date.now()) {
  if(!validIdentity(incoming)||Date.parse(incoming.fetchedAt)>now+60_000||!Array.isArray(incoming.data)||!incoming.data.length||incoming.data.some((p:any)=>!validSoybeanOilPoint(p,now)))throw Error('Invalid Yahoo Soybean Oil benchmark, units, dates or price conversion');
  const received=new Map<string,SoybeanOilPoint>();
  for(const p of incoming.data){const other=received.get(p.date);if(other&&JSON.stringify(other)!==JSON.stringify(p))throw Error('Conflicting duplicate Yahoo Soybean Oil observation: '+p.date);received.set(p.date,p);}
  const points=new Map<string,SoybeanOilPoint>((previous?.data||[]).map(p=>[p.date,p]));let added=0,revised=0;
  const revisions:Array<{date:string;previous:SoybeanOilPoint;replacement:SoybeanOilPoint}>=[];
  for(const p of received.values()){
    const old=points.get(p.date);const changed=old&&(old.usdPerMT!==p.usdPerMT||old.centsPerBushel!==p.centsPerBushel||old.isProvisional!==p.isProvisional);
    // Older packets cannot regress a corrected quote or restore provisional status.
    if(old&&(Date.parse(incoming.fetchedAt)<Date.parse(old.lastRetrievedAt||previous!.fetchedAt)||!old.isProvisional&&p.isProvisional))continue;
    const next={...p,sourceUrl:SOYBEAN_OIL_SOURCE_URL,firstRetrievedAt:old?.firstRetrievedAt||incoming.fetchedAt,lastRetrievedAt:incoming.fetchedAt};
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
/** Reuse the existing owned filesystem lock, scoped to the independent ZL file. */
export async function acquireSoybeanOilHistoryLock(file:string){try{return await acquireSoybeanHistoryLock(file);}catch(e){throw Error((e as Error).message.replaceAll('Soybean','Soybean Oil'));}}
