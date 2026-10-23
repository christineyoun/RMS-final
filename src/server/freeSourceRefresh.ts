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
export interface FreeSourceJob {key:string;run:()=>Promise<any>}
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
function freeSourceJobs():FreeSourceJob[]{return [
  {key:'palm-page',run:async()=>{const r=await refreshPalmPageSources();return {...r,lastError:r.results.some(j=>j.status!=='completed')?'Some Palm sources unavailable; saved observations retained':undefined};}},
  {key:'tapioca-history',run:()=>refreshPublicHistory('tapioca-starch')},
  {key:'potato-production-history',run:()=>refreshPotatoProductionHistory()},
  {key:'potato-production-regions',run:()=>refreshRegionalPotatoProduction()},
  potatoExportQuoteRefreshJob,
  soybeanPriceRefreshJob,
  soybeanOilPriceRefreshJob,
  soybeanNewsRefreshJob,
  soybeanOilNewsRefreshJob,
  ...Object.keys(ORIGIN_MVP).filter(id=>id!=='palm-oil').map(id=>({key:'origin-'+id,run:()=>loadAll8OriginRadar(id,true)})),
];}
/** Injectable clock/storage/jobs let offline tests exercise the actual scheduler without touching other commodities. */
export function createFreeSourceRunner(options:{directory?:string;now?:()=>Date;jobs?:()=>FreeSourceJob[]}={}){
  const directory=options.directory||root(),now=options.now||(()=>new Date()),jobs=options.jobs||freeSourceJobs;
  const readRun=(file:string)=>{try{return JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));}catch{return null;}};
  const save=(value:any)=>{fs.mkdirSync(directory,{recursive:true});const dest=path.join(directory,'free-source-refresh.json'),temp=dest+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,dest);};
  let active:Promise<any>|null=null;
  const refresh=async()=>{
    if(active)return active;
    active=(async()=>{
      const run:any={day:freeRefreshDay(now()).day,startedAt:now().toISOString(),kind:'free-public-sources',status:'running',jobs:[]};
      fs.mkdirSync(directory,{recursive:true});
      const previous=readRun('free-source-refresh.json');if(previous)fs.appendFileSync(path.join(directory,'free-source-refresh-history.jsonl'),JSON.stringify(previous)+'\n');
      save(run);
      run.jobs=await Promise.all(jobs().map(async job=>{
        try{const result:any=await job.run();return {key:job.key,status:result.lastError?'cached':'completed',error:result.lastError,
          ...((job.key==='soybean-history'||job.key==='soybean-oil-history'||job.key==='potato-export-quote')?{observationDate:result.observationDate,refresh:result.refresh}:{})};}
        catch(e){return {key:job.key,status:'failed',error:String((e as Error).message)};}
      }));
      run.status=run.jobs.some((j:any)=>j.status!=='completed')?'partial':'completed';run.finishedAt=now().toISOString();save(run);return run;
    })();try{return await active;}finally{active=null;}
  };
  const check=()=>{
    const cfg=readRun('settings.json')||{},settings={enabled:cfg.freeAutoEnabled===true,hourKST:Number.isInteger(cfg.scheduleHourKST)?cfg.scheduleHourKST:9};
    return !active&&freeRefreshDue(now(),settings,readRun('free-source-refresh.json')?.day||'')?refresh():Promise.resolve(null);
  };
  return {refresh,check};
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
