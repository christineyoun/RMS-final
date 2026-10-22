/** Separate, dated ERA5 context. Never feeds current forecast-model warning pills. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import referenceData from '../data/originWeatherEra5Reference.v1.json';
import seedData from '../data/originWeatherEra5Seed.v1.json';
import {weatherLocalDay} from '../utils/originWeatherPills.ts';
import type {WeatherPoint} from './originWeatherService.ts';
import type {OriginRadarResponse} from './originRadarService.ts';
type Row={date:string;rain:number|null;max:number|null;min:number|null};
type ReferencePoint={coordinates:number[];nativeGrid:number[];timeZone:string;days:Record<string,number[]>};
export type Era5Receipt={product:'ERA5';model:'era5';coordinates:number[];retrievedAt:string;requestUrl:string;body:any;retrievalFailed?:boolean;lastAttemptAt?:string};
const REF=referenceData as unknown as {referenceId:string;years:number[];points:ReferencePoint[]},SEED=seedData as unknown as {retrievedAt:string;requestUrl:string;records:{coordinates:number[];body:any}[]};
const DAY=86400000,shift=(d:string,n:number)=>new Date(Date.parse(d+'T12:00Z')+n*DAY).toISOString().slice(0,10),key=(p:{lat:number;lon:number})=>p.lat+','+p.lon,hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00Z').toISOString().slice(0,10)===v;
const number=(v:unknown,lo:number,hi:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const pointRef=(p:{lat:number;lon:number})=>REF.points.find(r=>r.coordinates[0]===p.lat&&r.coordinates[1]===p.lon);
const sum=(a:number[])=>a.reduce((n,x)=>n+x,0),mean=(a:number[])=>sum(a)/a.length,rounded=(v:number)=>+v.toFixed(3);
export const HISTORICAL_WARNING_POLICIES=Object.freeze({
 rainfallDeficit:{active:false,reason:'Seasonal meteorological ranks available; crop exposure and independently labeled ordinary/event validation remain insufficient for an agricultural warning cutoff.'},
 seasonalExcessRain:{active:false,reason:'Localized station/grid rain disagreement and missing crop/drainage validation; no validated seasonal alert cutoff.'},
 persistentTemperature:{active:false,reason:'Calendar quantiles describe model anomalies; crop stage, duration and independent outcome validation do not justify a new warning rule.'},
 additionalCropCold:{active:false,reason:'Tmin is evidence only; crop type/stage, tissue or soil temperature and exposure duration are required. Existing three freezing rules remain separate.'}
});
function rank(a:number[],v:number){return rounded(100*(a.filter(x=>x<v).length+.5*a.filter(x=>x===v).length)/a.length);}
function quantile(a:number[],q:number){a=[...a].sort((a,b)=>a-b);const x=(a.length-1)*q,i=Math.floor(x);return a[i]+(x-i)*((a[i+1]??a[i])-a[i]);}
function sample(ref:ReferencePoint,end:string,count:number,excludeYear?:number){const ys=REF.years.filter(y=>y!==excludeYear),samples:number[][]=[];for(const y of ys){const e=y+end.slice(4);if(!validDate(e))return null;const values=Array.from({length:count},(_,i)=>ref.days[shift(e,i-count+1)]);if(values.some(v=>!v))return null;samples.push([sum(values.map(v=>v[0])),mean(values.map(v=>v[1])),mean(values.map(v=>v[2]))]);}return {years:ys,values:samples};}
/** Reject forecast products, changed grids, wrong units, coordinates and malformed daily arrays. */
export function parseEra5Receipt(receipt:Era5Receipt,p:{lat:number;lon:number},now=new Date()):Row[]|null {
 const ref=pointRef(p),b=receipt?.body,d=b?.daily;if(!ref||receipt.product!=='ERA5'||receipt.model!=='era5'||receipt.coordinates?.[0]!==p.lat||receipt.coordinates?.[1]!==p.lon||!Number.isFinite(Date.parse(receipt.retrievedAt))||Date.parse(receipt.retrievedAt)>+now+60000)return null;
 try{const u=new URL(receipt.requestUrl),lat=u.searchParams.get('latitude')!.split(',').map(Number),lon=u.searchParams.get('longitude')!.split(',').map(Number);if(u.pathname!=='/v1/archive'||u.hostname!=='archive-api.open-meteo.com'||u.searchParams.get('models')!=='era5'||u.searchParams.get('timezone')!=='auto'||u.searchParams.get('cell_selection')!=='nearest'||!u.searchParams.get('elevation')?.split(',').every(v=>v==='nan')||!lat.some((v,i)=>v===p.lat&&lon[i]===p.lon))return null;}catch{return null;}
 if(JSON.stringify([b.latitude,b.longitude,b.elevation])!==JSON.stringify(ref.nativeGrid)||b.timezone!==ref.timeZone||b.daily_units?.time!=='iso8601'||b.daily_units?.precipitation_sum!=='mm'||b.daily_units?.temperature_2m_max!=='°C'||b.daily_units?.temperature_2m_min!=='°C'||!Array.isArray(d?.time)||!d.time.length||new Set(d.time).size!==d.time.length||d.time.some((v:unknown)=>!validDate(v))||['precipitation_sum','temperature_2m_max','temperature_2m_min'].some(k=>!Array.isArray(d[k])||d[k].length!==d.time.length))return null;
 if(d.time.some((v:string,i:number)=>i&&v!==shift(d.time[i-1],1)))return null;
 return d.time.map((date:string,i:number)=>{const max=number(d.temperature_2m_max[i],-65,65)?d.temperature_2m_max[i]:null,min=number(d.temperature_2m_min[i],-65,65)&&(max===null||d.temperature_2m_min[i]<=max)?d.temperature_2m_min[i]:null;return{date,rain:number(d.precipitation_sum[i],0,500)?d.precipitation_sum[i]:null,max,min};});
}
export function evaluateEra5Context(receipt:Era5Receipt,p:{lat:number;lon:number},now=new Date(),excludeYear?:number,observationEnd?:string){
 const ref=pointRef(p),rows=parseEra5Receipt(receipt,p,now),base={schemaVersion:1,referenceId:REF.referenceId,product:'ERA5' as const,coordinates:[p.lat,p.lon],referenceYears:REF.years.filter(y=>y!==excludeYear),units:{rainfall:'mm',temperature:'°C'},canTriggerCurrentAlerts:false as const,operationalAlerts:[] as string[],policies:HISTORICAL_WARNING_POLICIES};
 if(!ref||!rows)return {...base,status:'unavailable',reason:'ERA5 source, units, grid, dates or provenance could not be validated'};
 const currentEnd=shift(weatherLocalDay(now,ref.timeZone),-1);if(observationEnd&&(!validDate(observationEnd)||observationEnd>currentEnd))return {...base,status:'unavailable',reason:'Historical replay endpoint must be a completed date'};
 const end=rows.filter(r=>r.date<=(observationEnd||currentEnd)&&r.rain!==null&&r.max!==null&&r.min!==null).at(-1)?.date;
 if(!end)return {...base,status:'incomplete',reason:'No complete dated ERA5 observation'};
 const period=(n:number)=>{const a=Array.from({length:n},(_,i)=>rows.find(r=>r.date===shift(end,i-n+1)));return a.every(r=>r&&r.rain!==null&&r.max!==null&&r.min!==null)?a as Row[]:null;};
 const metrics=(n:number)=>{const actual=period(n),climate=sample(ref,end,n,excludeYear);if(!actual)return {complete:false,reason:'Incomplete ERA5 period; older days not substituted'};if(!climate)return {complete:false,reason:'Calendar window outside retained reference coverage'};const rain=sum(actual.map(r=>r.rain!)),max=mean(actual.map(r=>r.max!)),min=mean(actual.map(r=>r.min!)),rains=climate.values.map(v=>v[0]),maxima=climate.values.map(v=>v[1]),minima=climate.values.map(v=>v[2]);return{complete:true,start:shift(end,1-n),end,days:n,referenceSamples:climate.years.length,rainfall:{total:rounded(rain),mean:rounded(mean(rains)),percentOfMean:mean(rains)>0?rounded(100*rain/mean(rains)):null,rank:rank(rains,rain),belowReferenceMinimum:rain<Math.min(...rains),aboveReferenceMaximum:rain>Math.max(...rains)},temperature:{tmaxMean:rounded(max),tminMean:rounded(min),tmaxDeparture:rounded(max-mean(maxima)),tminDeparture:rounded(min-mean(minima)),tmaxRank:rank(maxima,max),tminRank:rank(minima,min)},extremes:{maximum:Math.max(...actual.map(r=>r.max!)),minimum:Math.min(...actual.map(r=>r.min!)),daysAtLeast35:actual.filter(r=>r.max!>=35).length,daysAtOrBelow0:actual.filter(r=>r.min!<=0).length}};};
 const last7=period(7);let warm=0,cold=0,longestWarm=0,longestCold=0;const daily=last7?.map(r=>{const samples=REF.years.filter(y=>y!==excludeYear).flatMap(y=>{const e=y+r.date.slice(4);return validDate(e)?[-2,-1,0,1,2].map(i=>ref.days[shift(e,i)]):[];});if(samples.length!==(REF.years.length-(REF.years.includes(excludeYear!)?1:0))*5||samples.some(v=>!v))return null;const high=quantile(samples.map(v=>v[1]),.9),low=quantile(samples.map(v=>v[2]),.1);warm=r.max!>high?warm+1:0;cold=r.min!<low?cold+1:0;longestWarm=Math.max(warm,longestWarm);longestCold=Math.max(cold,longestCold);return{date:r.date,tmax:r.max,tmin:r.min,calendarTmax90:rounded(high),calendarTmin10:rounded(low)};});
 const week=metrics(7),fourWeeks=metrics(28);
 return {...base,evaluationMode:observationEnd?'historical-replay':'latest-reanalysis-context',status:week.complete&&fourWeeks.complete?'dated-context':'incomplete-context',timeZone:ref.timeZone,nativeGrid:ref.nativeGrid,asOf:end,currentPrimaryWindowEnd:currentEnd,lagDays:Math.round((Date.parse(currentEnd)-Date.parse(end))/DAY),retrievedAt:receipt.retrievedAt,retrievalFailed:!!receipt.retrievalFailed,lastAttemptAt:receipt.lastAttemptAt,sourceUrl:receipt.requestUrl,receiptSha256:hash(receipt),week,fourWeeks,sustainedTemperature:daily&&daily.every(Boolean)?{complete:true,windowDays:7,longestWarmRun:longestWarm,longestColdRun:longestCold,method:'Five-calendar-day pooled daily Tmax90/Tmin10; research diagnostics, not certified WSDI/CSDI or agricultural warning thresholds',daily}:{complete:false,reason:'Calendar temperature pool incomplete'},agriculturalRepresentativeness:p.lat===4.14&&p.lon===-73.63?'unverified: documented native-grid terrain mismatch':'point model context only; crop exposure and independent agricultural validation incomplete'};
}
export type HistoricalContext=ReturnType<typeof evaluateEra5Context>;
const inflight=new Map<string,Promise<HistoricalContext>>();
export async function getEra5Context(p:{lat:number;lon:number},options:{now?:Date;fetcher?:typeof fetch;cacheDir?:string;force?:boolean}={}):Promise<HistoricalContext>{
 const now=options.now||new Date(),ref=pointRef(p),seed=SEED.records.find(r=>r.coordinates[0]===p.lat&&r.coordinates[1]===p.lon),empty={product:'ERA5',model:'era5',coordinates:[p.lat,p.lon],retrievedAt:now.toISOString(),requestUrl:'',body:null} as Era5Receipt;
 if(!ref||!seed)return evaluateEra5Context(empty,p,now);
 let prior:Era5Receipt={product:'ERA5',model:'era5',coordinates:[p.lat,p.lon],retrievedAt:SEED.retrievedAt,requestUrl:SEED.requestUrl,body:seed.body};
 const dir=options.cacheDir||path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'era5-context-v1'),file=path.join(dir,hash(key(p))+'.json');
 try{const cached=JSON.parse(fs.readFileSync(file,'utf8'));if(parseEra5Receipt(cached,p,now))prior=cached;}catch{}
 // A future seed/incorrect clock never initiates historical backfill in a live request.
 const priorContext=evaluateEra5Context(prior,p,now),incompleteData=[priorContext['week'],priorContext['fourWeeks']].some(m=>m?.reason?.startsWith('Incomplete ERA5'));
 if(+now<Date.parse(SEED.retrievedAt)||!options.force&&+now-Date.parse(prior.lastAttemptAt||prior.retrievedAt)<(prior.retrievalFailed||incompleteData?20*60000:12*3600000))return priorContext;
 const lock=file;if(inflight.has(lock))return inflight.get(lock)!;
 const task=(async()=>{let result:Era5Receipt|null=null;const end=shift(weatherLocalDay(now,ref.timeZone),-1),url=new URL('https://archive-api.open-meteo.com/v1/archive');for(const[k,v]of Object.entries({latitude:String(p.lat),longitude:String(p.lon),start_date:shift(end,-41),end_date:end,daily:'precipitation_sum,temperature_2m_max,temperature_2m_min',models:'era5',timezone:'auto',elevation:'nan',cell_selection:'nearest',precipitation_unit:'mm',temperature_unit:'celsius'}))url.searchParams.set(k,v);
 for(let attempt=0;attempt<2;attempt++){try{const r=await(options.fetcher||fetch)(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('ERA5 HTTP '+r.status);const candidate:Era5Receipt={product:'ERA5',model:'era5',coordinates:[p.lat,p.lon],retrievedAt:now.toISOString(),requestUrl:url.toString(),body:await r.json()};if(parseEra5Receipt(candidate,p,now)){result=candidate;if(evaluateEra5Context(candidate,p,now).status==='dated-context'||attempt===1)break;}}catch{}}
 if(!result)result={...prior,retrievalFailed:true,lastAttemptAt:now.toISOString()};
 fs.mkdirSync(path.join(dir,'receipts'),{recursive:true});const receipt=path.join(dir,'receipts',hash(result)+'.json');if(!fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify(result),{mode:0o600});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(result),{mode:0o600});fs.renameSync(tmp,file);return evaluateEra5Context(result,p,now);
 })();inflight.set(lock,task);try{return await task;}finally{inflight.delete(lock);}
}
/** Add internal context only. Never edits weather pills, current figures, expiry or UI text. */
export async function withHistoricalWeatherContext(radar:OriginRadarResponse,configured:ReadonlyArray<WeatherPoint>,options:Parameters<typeof getEra5Context>[1]={}):Promise<OriginRadarResponse>{
 const contexts=await Promise.all(configured.map(async p=>({p,context:await getEra5Context(p,options)})));
 return {...radar,origins:radar.origins.map(o=>({...o,weatherHistoricalContext:{schemaVersion:1,role:'separate-lagged-reanalysis-context',canTriggerCurrentAlerts:false,points:contexts.filter(c=>c.p.key===o.originKey).map(c=>({location:c.p.label,...c.context}))}}))};
}
