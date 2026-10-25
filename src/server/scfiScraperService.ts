import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFreeJson} from './freeDailyPublication.ts';
export const SSE_SCFI_URL='https://www.sse.net.cn/index/singleIndex?indexType=scfi';
export const SSE_REUSE_TERMS='https://en.sse.net.cn/indices/agreetext.htm';
const SCFI_CACHE_FILE=path.join(process.cwd(),'src/data/cache_scfi.json');
export interface ScfiCachePayload {
 scfiPoints:number|null;observationDate?:string;previousPoints?:number;previousObservationDate?:string;changePct?:number;changeStr:string;updatedAt:string;source:string;sourceUrl:string;lastError?:string;receiptPath?:string;receiptSha256?:string;reuseAuthorization?:any;history?:any[];
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
export function getScfiCache():ScfiCachePayload {
 let saved:any;try{saved=JSON.parse(fs.readFileSync(SCFI_CACHE_FILE,'utf8'));}catch{}
 const auth=scfiReuseAuthorization();
 if(auth&&saved?.scfiPoints>0&&saved.observationDate&&Number.isFinite(Date.parse(saved.observationDate))&&Date.parse(saved.observationDate)<=Date.now()&&saved.sourceUrl===SSE_SCFI_URL&&saved.receiptSha256)return {...saved,reuseAuthorization:auth};
 return {...saved,scfiPoints:null,changeStr:'',updatedAt:saved?.updatedAt||'',source:'Shanghai Shipping Exchange (SSE)',sourceUrl:SSE_SCFI_URL,lastError:!auth?'SSE written authorization for RMS display/export is not recorded; standard subscription is read-only':'No original dated SCFI composite receipt available'};
}
export function updateScfiCache(data:ScfiCachePayload) {
 const tmp=SCFI_CACHE_FILE+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,SCFI_CACHE_FILE);
}
export async function scrapeLiveScfiIndex(_forceRefresh=false):Promise<ScfiCachePayload> {
 const prior=getScfiCache(),authorization=scfiReuseAuthorization();
 // Public accessibility is not permission to redistribute in a procurement app.
 // Keep the existing job, but make no repeated provider requests pending a grant.
 if(!authorization)return prior;
 try{
  const r=await fetch(SSE_SCFI_URL,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('SSE HTTP '+r.status);
  const body=await r.text(),updatedAt=new Date().toISOString(),parsed=parseScfiPublication(body,new Date(updatedAt));
  const receiptSha256=createHash('sha256').update(body).digest('hex'),receiptPath='.rms-stage3/evidence/scfi/'+receiptSha256+'.json';
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true});if(!fs.existsSync(receiptPath))fs.writeFileSync(receiptPath,JSON.stringify({sourceUrl:SSE_SCFI_URL,retrievedAt:updatedAt,status:r.status,body,sha256:receiptSha256},null,2));
  const rows=[{observationDate:parsed.previousObservationDate,scfiPoints:parsed.previousPoints,receiptPath,receiptSha256},{observationDate:parsed.observationDate,scfiPoints:parsed.scfiPoints,receiptPath,receiptSha256}];
  const history=[...new Map([...(prior.history||[]),...rows].map(r=>[r.observationDate+'|'+r.scfiPoints+'|'+r.receiptSha256,r])).values()];
  const value={...parsed,updatedAt,history,receiptPath,receiptSha256,reuseAuthorization:authorization};updateScfiCache(value);return value;
 }catch(error){return {...prior,lastError:(error as Error).message};}
}
