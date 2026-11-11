import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFreeJson} from './freeDailyPublication.ts';
import {parseNlicScfiTable} from './nlicScfiParser.mjs';
export const SSE_SCFI_URL='https://www.sse.net.cn/index/singleIndex?indexType=scfi';
export const SSE_REUSE_TERMS='https://en.sse.net.cn/indices/agreetext.htm';
export const NLIC_SCFI_URL='https://www.nlic.go.kr/nlic/transInPortCt.action';
const SCFI_CACHE_FILE=path.join(process.cwd(),'src/data/cache_scfi.json');
export interface ScfiCachePayload {
 scfiPoints:number|null;observationDate?:string;previousPoints?:number;previousObservationDate?:string;changePct?:number;changeStr:string;updatedAt:string;source:string;sourceUrl:string;lastError?:string;receiptPath?:string;receiptSha256?:string;reuseAuthorization?:any;history?:any[];indexIdentity?:string;
}
/** Both dates come from the same official publication's prior/current columns,
 * respecting holiday-adjusted consecutive releases instead of assuming 7 days. */
export function parseScfiPublication(html:string,now=new Date()) {
 const $=cheerio.load(html);
 if(!/\bSCFI\b/i.test($('title').text())||/\bSCFIS\b|\bCCFI\b/i.test($('title').text()))throw Error('Not an SCFI publication');
 const table=$('table').filter((_,el)=>/综合指数\s*Comprehensive Index/i.test($(el).text())).first();
 if(!table.length)throw Error('Official SCFI composite table absent');
 const header=table.find('tr').first().find('th,td').map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get();
 const pi=header.findIndex(t=>/上期/.test(t)),ci=header.findIndex(t=>/本期/.test(t));
 const date=(i:number)=>header[i]?.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
 const previousObservationDate=date(pi),observationDate=date(ci);
 if(pi<0||ci<0||!previousObservationDate||!observationDate||previousObservationDate>=observationDate||!Number.isFinite(Date.parse(previousObservationDate))||new Date(previousObservationDate).toISOString().slice(0,10)!==previousObservationDate||!Number.isFinite(Date.parse(observationDate))||Date.parse(observationDate)>now.getTime()||new Date(observationDate).toISOString().slice(0,10)!==observationDate)throw Error('Original SCFI publication dates missing or invalid');
 const row=table.find('tr').filter((_,el)=>/^综合指数\s*Comprehensive Index$/i.test($(el).find('td').first().text().trim())).first();
 const cells=row.find('td').map((_,el)=>$(el).text().trim()).get();
 const number=(s:string)=>/^\d[\d,]*(?:\.\d+)?$/.test(s||'')?Number(s.replaceAll(',','')):NaN;
 const previousPoints=number(cells[pi]),scfiPoints=number(cells[ci]);
 if(!Number.isFinite(previousPoints)||!Number.isFinite(scfiPoints)||previousPoints<=0||scfiPoints<=0)throw Error('Dated SCFI composite values missing');
 const publishedDifference=Number(cells[ci+1]?.replaceAll(',',''));
 if(!Number.isFinite(publishedDifference)||Math.abs((scfiPoints-previousPoints)-publishedDifference)>.011)throw Error('SCFI point difference conflicts with original composite row');
 const changePct=(scfiPoints/previousPoints-1)*100;
 return {scfiPoints,previousPoints,observationDate,previousObservationDate,changePct,changeStr:(changePct>=0?'+':'')+changePct.toFixed(2)+'%',indexIdentity:'SCFI Composite Index',source:'Shanghai Shipping Exchange (SSE)',sourceUrl:SSE_SCFI_URL};
}
export function scfiReuseAuthorization() {
 const auth=readFreeJson('free-scfi-access.json')?.authorization;
 return auth?.writtenReference&&auth?.scope==='RMS-display-and-export'&&(!auth.expiresOn||Date.parse(auth.expiresOn+'T23:59:59Z')>=Date.now())?auth:null;
}
/** Both the original index owner's written permission and the data-page owner's
 * written automated access permission are required for a company dashboard.
 * This is intentionally separate from a normal read-only SCFI subscription.
 */
export function nlicScfiReuseAuthorization() {
 const grant=scfiReuseAuthorization();
 const auth=readFreeJson('free-scfi-access.json')?.authorization;
 if(!grant||auth?.approvedFeed!==NLIC_SCFI_URL||typeof auth.nlicWrittenReference!=='string'||!auth.nlicWrittenReference.trim())return null;
 return auth;
}
export function getScfiCache():ScfiCachePayload {
 let saved:any;try{saved=JSON.parse(fs.readFileSync(SCFI_CACHE_FILE,'utf8'));}catch{}
 const permitted=saved?.sourceUrl===NLIC_SCFI_URL?nlicScfiReuseAuthorization():saved?.sourceUrl===SSE_SCFI_URL?scfiReuseAuthorization():null;
 if(permitted&&saved?.scfiPoints>0&&saved.observationDate&&Number.isFinite(Date.parse(saved.observationDate))&&Date.parse(saved.observationDate)<=Date.now()&&saved.receiptSha256&&saved.indexIdentity==='SCFI Composite Index')return {...saved,reuseAuthorization:permitted};
 return {...saved,scfiPoints:null,changeStr:'',updatedAt:saved?.updatedAt||'',source:'SCFI (SSE original index)',sourceUrl:NLIC_SCFI_URL,lastError:!nlicScfiReuseAuthorization()?'Written SCFI reuse + NLIC automated access authorizations not recorded':'No verified, permissioned SCFI receipt available'};
}
export function updateScfiCache(data:ScfiCachePayload) {
 const tmp=SCFI_CACHE_FILE+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(SCFI_CACHE_FILE),{recursive:true});
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,SCFI_CACHE_FILE);}finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}
}
function currentRawCache(){try{return JSON.parse(fs.readFileSync(SCFI_CACHE_FILE,'utf8'));}catch{return null;}}
export async function scrapeLiveScfiIndex(_forceRefresh=false):Promise<ScfiCachePayload> {
 const prior=getScfiCache(),authorization=nlicScfiReuseAuthorization();
 // The public table is not a redistribution license. Do not fetch or store
 // SCFI index values in the app without an explicit recorded grant.
 if(!authorization)return prior;
 const lock=SCFI_CACHE_FILE+'.lock';let lockFd:number|undefined;
 try {
  try{lockFd=fs.openSync(lock,'wx',0o600);}catch(error){
   if((error as NodeJS.ErrnoException).code==='EEXIST')return {...prior,lastError:'SCFI refresh already running'};
   throw error;
  }
  const r=await fetch(NLIC_SCFI_URL,{headers:{Accept:'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('NLIC SCFI HTTP '+r.status);
  if(new URL(r.url).origin!=='https://www.nlic.go.kr')throw Error('NLIC SCFI redirect to unexpected host');
  if(!/text\/html/i.test(r.headers.get('content-type')||''))throw Error('NLIC SCFI unexpected response type');
  const body=await r.text(),updatedAt=new Date().toISOString();
  const rows=parseNlicScfiTable(body,new Date(updatedAt));
  const latest=rows[0],previous=rows[1];
  const existing=currentRawCache();
  if(existing?.sourceUrl===NLIC_SCFI_URL&&existing.observationDate>latest.date)throw Error('NLIC report older than stored verified SCFI');
  const priorRows=(existing?.history||[]) as any[];
  for(const row of rows){
   const conflicting=priorRows.some(old=>old.observationDate===row.date&&old.scfiPoints!==row.scfi);
   if(conflicting)throw Error('NLIC SCFI correction conflicts with saved verified observation '+row.date);
  }
  // A check with no new release is not a fresh observation or a new receipt.
  if(existing?.sourceUrl===NLIC_SCFI_URL&&existing.observationDate===latest.date&&existing.scfiPoints===latest.scfi)return {...prior,lastError:undefined};
  const receiptSha256=createHash('sha256').update(body).digest('hex');
  const receiptPath='.rms-stage3/evidence/scfi/nlic-'+receiptSha256+'.json';
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
  if(!fs.existsSync(receiptPath)){
   const t=receiptPath+'.'+process.pid+'.tmp';
   try{fs.writeFileSync(t,JSON.stringify({sourceUrl:NLIC_SCFI_URL,retrievedAt:updatedAt,status:r.status,body,sha256:receiptSha256},null,2),{flag:'wx',mode:0o600});fs.renameSync(t,receiptPath);}finally{if(fs.existsSync(t))fs.rmSync(t,{force:true});}
  }
  const imported=rows.map(x=>({observationDate:x.date,scfiPoints:x.scfi,sourceUrl:NLIC_SCFI_URL,receiptPath,receiptSha256}));
  const history=[...new Map([...priorRows,...imported].map(x=>[x.observationDate+'|'+x.sourceUrl+'|'+x.scfiPoints,x])).values()];
  const changePct=(latest.scfi/previous.scfi-1)*100;
  const value:ScfiCachePayload={scfiPoints:latest.scfi,previousPoints:previous.scfi,observationDate:latest.date,previousObservationDate:previous.date,changePct,changeStr:(changePct>=0?'+':'')+changePct.toFixed(2)+'%',updatedAt,source:'NLIC / KCLA (SSE SCFI Composite)',sourceUrl:NLIC_SCFI_URL,indexIdentity:'SCFI Composite Index',history,receiptPath,receiptSha256,reuseAuthorization:authorization};
  updateScfiCache(value);return value;
 }catch(error){return {...prior,lastError:(error as Error).message};}
 finally{if(lockFd!==undefined){fs.closeSync(lockFd);fs.rmSync(lock,{force:true});}}
}
