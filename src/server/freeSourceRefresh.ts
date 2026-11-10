import {dailyFreeSourceJobs,publishDailyOverview} from './freeDailyJobs.ts';
import {withFreeNetwork} from './freeRefreshNetwork.ts';
import {readFreeJson,writeFreeJson,observationFingerprint} from './freeDailyPublication.ts';
import {randomUUID} from 'node:crypto';
import {fetchOfficialPotatoExportQuote} from './officialPotatoComextService.ts';
import {refreshSoybeanOilNews} from './soybeanOilVerifiedNews.ts';
/** Independent free-source clock. It never imports or authorizes Gemini. */
import fs from 'node:fs';
import {refreshSoybeanNews} from './soybeanNewsPersistence.ts';
import {refreshPalmNews} from './palmVerifiedNews.ts';
import path from 'node:path';
import { refreshPublicHistory } from './publicPriceHistory.ts';
import { refreshPotatoProductionHistory,refreshRegionalPotatoProduction } from './potatoProductionHistory.ts';
import { loadAll8OriginRadar, ORIGIN_MVP } from './all8OriginRadarService.ts';
import {soybeanOilIntelligenceService} from './soybeanOilIntelligenceService.ts';
import {soybeanIntelligenceService} from './soybeanIntelligenceService.ts';

const root=()=>path.join(process.cwd(),'.rms-stage3');
function read(file:string):any {try{return JSON.parse(fs.readFileSync(path.join(root(),file),'utf8'));}catch{return null;}}
let palmActive:Promise<any>|null=null;
export function refreshPalmPageSources(){
  if(palmActive)return palmActive;
  palmActive=(async()=>{const results=await Promise.allSettled([refreshPublicHistory('palm-oil'),refreshPalmNews(),loadAll8OriginRadar('palm-oil',true)]);return {success:true,kind:'free-palm-sources',results:results.map((r,i)=>({source:['prices','news','origins'][i],status:r.status==='fulfilled'?(r.value.lastError?'cached':'completed'):'failed',error:r.status==='fulfilled'?r.value.lastError:String(r.reason?.message||'Source failed')}))};})().finally(()=>{palmActive=null;});return palmActive;
}
export function freeRefreshSettings(){const cfg=read('settings.json')||{};return {enabled:cfg.freeAutoEnabled===true,hourKST:Number.isInteger(cfg.scheduleHourKST)?cfg.scheduleHourKST:9};}
export function freeRefreshDay(now=new Date()){
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {day:`${values.year}-${values.month}-${values.day}`,hour:Number(values.hour),weekday:!['Sat','Sun'].includes(values.weekday)};
}
export function freeRefreshDue(now=new Date(),settings=freeRefreshSettings(),lastDay=read('free-source-refresh.json')?.day){const t=freeRefreshDay(now);return settings.enabled&&t.weekday&&t.hour>=settings.hourKST&&t.day!==lastDay;}
export interface FreeSourceJob {key:string;commodity?:string;source?:string;cadenceHours?:number;retryable?:boolean;run:()=>Promise<any>}
export const soybeanPriceRefreshJob:FreeSourceJob={key:'soybean-history',run:async()=>{
  const snapshot=await soybeanIntelligenceService.getSoybeanPriceSnapshot(true,'scheduled');
  return {lastError:snapshot.lastError,observationDate:snapshot.data.at(-1)?.date,refresh:snapshot.refreshMetadata};
}};
export const soybeanOilPriceRefreshJob:FreeSourceJob={key:'soybean-oil-history',run:async()=>{const s=await soybeanOilIntelligenceService.getSoybeanOilPriceSnapshot(true,'scheduled');return {lastError:s.lastError,observationDate:s.data.at(-1)?.date,refresh:s.refreshMetadata};}};
export const soybeanNewsRefreshJob:FreeSourceJob={key:'soybean-news',run:()=>refreshSoybeanNews()};
export const soybeanOilNewsRefreshJob:FreeSourceJob={key:'soybean-oil-news',run:()=>refreshSoybeanOilNews()};
/** Uses the same quote singleton as page/manual requests, including in-flight deduplication. */
export function createPotatoExportQuoteRefreshJob(fetchQuote:typeof fetchOfficialPotatoExportQuote=fetchOfficialPotatoExportQuote):FreeSourceJob {
  return {key:'potato-export-quote',run:async()=>{
    const quote=await fetchQuote(true);
    return {lastError:quote.lastError||(!quote.success||quote.refreshFailed?'Eurostat 감자전분 기준시세 조회 실패':undefined),
      observationDate:quote.data?.period,
      refresh:{checkedAt:quote.checkedAt,lastSuccessfulFetchAt:quote.verifiedAt,dataStatus:quote.dataStatus,refreshFailed:quote.refreshFailed}};
  }};
}
export const potatoExportQuoteRefreshJob=createPotatoExportQuoteRefreshJob();
export const freeSourceJobs=dailyFreeSourceJobs;
/** Injectable clock/storage/jobs let offline tests exercise the actual scheduler without touching other commodities. */
export function createFreeSourceRunner(options:{directory?:string;now?:()=>Date;jobs?:()=>FreeSourceJob[];publish?:(run:any)=>Promise<any>}={}){
 const directory=options.directory||root(),now=options.now||(()=>new Date()),jobs=options.jobs||freeSourceJobs;
 const readRun=(file:string)=>readFreeJson(file,directory),save=(v:any)=>writeFreeJson('free-source-refresh.json',v,directory);
 let active:Promise<any>|null=null;
 const refresh=(trigger='manual'):Promise<any>=>{
  if(active)return active;
  active=(async()=>{
   fs.mkdirSync(directory,{recursive:true});const lock=path.join(directory,'free-source-refresh.lock'),nonce=randomUUID();
   const live=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code!=='ESRCH';}};
   try{fs.writeFileSync(lock,JSON.stringify({pid:process.pid,nonce}),{flag:'wx'});}catch{
    const recovery=lock+'.recovery';
    try{fs.writeFileSync(recovery,JSON.stringify({pid:process.pid,nonce}),{flag:'wx'});}catch{const stale=readRun('free-source-refresh.lock.recovery');if(stale&&!live(stale.pid)&&readRun('free-source-refresh.lock.recovery')?.nonce===stale.nonce)try{fs.unlinkSync(recovery);}catch{}return null;}
    try{const old=readRun('free-source-refresh.lock');if(!old||live(old.pid))return null;fs.renameSync(lock,lock+'.abandoned-'+nonce);fs.writeFileSync(lock,JSON.stringify({pid:process.pid,nonce}),{flag:'wx'});}catch{return null;}finally{if(readRun('free-source-refresh.lock.recovery')?.nonce===nonce)fs.unlinkSync(recovery);}
   }
   try{
    const day=freeRefreshDay(now()).day,previous=readRun('free-source-refresh.json');
    if(trigger==='scheduled'&&previous?.day===day&&previous.status!=='running')return null;
    const recovering=trigger==='recovery';
    if(recovering&&(!previous||previous.day!==day||previous.status==='running'||(previous.recoveryPasses||0)>=1))return null;
    const retryKeys=new Set(recovering?previous.jobs.filter((j:any)=>['failed','retained-old-data'].includes(j.status)&&j.retryable!==false&&!/HTTP 403|permission|authorization|licensed|written authorization/i.test(j.error||'')).map((j:any)=>j.key):[]);
    if(recovering&&!retryKeys.size)return null;
    const resumed=previous?.day===day&&previous.status==='running';
    if(previous&&!resumed)fs.appendFileSync(path.join(directory,'free-source-refresh-history.jsonl'),JSON.stringify(previous)+'\n');
    const run:any=recovering?{...previous,status:'running',recoveryPasses:(previous.recoveryPasses||0)+1,recoveryStartedAt:now().toISOString(),jobs:previous.jobs.filter((j:any)=>!retryKeys.has(j.key))}:resumed?{...previous,id:previous.id||nonce,resumedAt:now().toISOString()}:{day,id:nonce,trigger,startedAt:now().toISOString(),kind:'free-public-sources',status:'running',jobs:[]};save(run);
    const observations=readRun('free-source-observations.json')||{jobs:{}},oldJobs=observations.jobs||{};
    const tasks=jobs().filter(j=>!recovering||retryKeys.has(j.key));let next=0;
    const worker=async()=>{while(next<tasks.length){const job=tasks[next++];if(resumed&&run.jobs.some((r:any)=>r.key===job.key))continue;
     const prior=oldJobs[job.key],startedAt=now().toISOString();let row:any={key:job.key,commodity:job.commodity||job.key,source:job.source||job.key,attemptedAt:startedAt,retryable:job.retryable!==false};
     if(job.cadenceHours&&prior?.lastVerifiedAt&&Date.parse(startedAt)-Date.parse(prior.lastVerifiedAt)<job.cadenceHours*3600000){row={...row,status:'unchanged',reason:'Verified publication retained within source check cadence',observationDate:prior.observationDate,lastVerifiedAt:prior.lastVerifiedAt};}
     else try{const value=await job.run(),publication=value.publication??value;
      const error=value.lastError||value.refreshFailed&&value.message||value.success===false&&value.message||value.stale&&value.lastError;
      const observationDate=value.observationDate||value.data?.at?.(-1)?.date||value.data?.period||value.reportDate||value.quote?.date||null;
      const fingerprint=observationFingerprint(publication),changed=!prior||prior.fingerprint!==fingerprint;
      row={...row,...(value.refresh?{refresh:value.refresh}:{}),status:error?(observationDate||prior?'retained-old-data':'failed'):changed?'success':'unchanged',observationDate:observationDate||prior?.observationDate||null,lastVerifiedAt:error?prior?.lastVerifiedAt||value.verifiedAt||null:value.verifiedAt||startedAt,error:error||undefined};
      if(!error)oldJobs[job.key]={fingerprint,observationDate,lastVerifiedAt:value.verifiedAt||startedAt,lastPublishedAt:changed?startedAt:prior?.lastPublishedAt};
     }catch(e){row={...row,status:prior?'retained-old-data':'failed',observationDate:prior?.observationDate||null,lastVerifiedAt:prior?.lastVerifiedAt||null,error:(e as Error).message};}
     row.finishedAt=now().toISOString();run.jobs.push(row);save(run);writeFreeJson('free-source-observations.json',{...observations,jobs:oldJobs},directory);
    }};
    const network=await withFreeNetwork(async()=>{await Promise.all([worker(),worker(),worker()]);return null;},row=>fs.appendFileSync(path.join(directory,'free-source-requests.jsonl'),JSON.stringify({runId:run.id,...row})+'\n'));run.requests=network.requests;
    run.status=run.jobs.some((j:any)=>j.status==='failed'||j.status==='retained-old-data')?'partial':'completed';
    run.completed=run.jobs.filter((j:any)=>j.status==='success'||j.status==='unchanged').map((j:any)=>j.key);run.finishedAt=now().toISOString();
    try{run.publication=await(options.publish||(options.jobs?async()=>null:publishDailyOverview))(run);}catch(e){run.status='partial';run.publicationError=(e as Error).message;}
    const changed=run.jobs.some((j:any)=>j.status==='success');
    writeFreeJson('free-source-observations.json',{...observations,jobs:oldJobs,lastSuccessfulRefreshAt:run.completed.length?run.finishedAt:observations.lastSuccessfulRefreshAt,lastPublicationAt:changed?run.finishedAt:observations.lastPublicationAt},directory);save(run);return run;
   }finally{if(readRun('free-source-refresh.lock')?.nonce===nonce)fs.unlinkSync(lock);}
  })();active=active.finally(()=>{active=null;});return active;
 };
 const check=()=>{const cfg=readRun('settings.json')||{},s={enabled:cfg.freeAutoEnabled===true,hourKST:9},last=readRun('free-source-refresh.json');
  return !active&&freeRefreshDue(now(),s,last?.status==='running'?'':last?.day||'')?refresh('scheduled'):Promise.resolve(null);};
 return {refresh,check,retryFailed:()=>refresh('recovery')};
}
const runner=createFreeSourceRunner();
export const refreshFreeSources=runner.refresh;
let timer:ReturnType<typeof setInterval>|null=null;
export function startFreeSourceScheduler(){
  if(timer)return;
  const check=()=>{void runner.check().catch(e=>console.error('[RMS free sources]',e));};
  timer=setInterval(check,60_000);timer.unref?.();setTimeout(check,2000).unref?.();
  console.log('[RMS free sources] Schedule',freeRefreshSettings().enabled?'ON':'OFF','at',freeRefreshSettings().hourKST,':00 KST; Gemini authorization: NONE');
}
