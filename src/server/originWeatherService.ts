/** Shared extension of Wheat's existing Open-Meteo /v1/forecast integration.
 * Past-days output is archived MODEL weather, never station observations or reanalysis.
 * Free endpoint: laptop prototype evaluation only, not ongoing corporate permission.
 * https://open-meteo.com/en/pricing · https://open-meteo.com/en/terms
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {screenObservedWeather,validWeatherDay,weatherLocalDay as localWeatherDay,type WeatherScreen} from '../utils/originWeatherPills.ts';
export const WEATHER_DAY=86400000;
export type WeatherPoint={key:string;label:string;lat:number;lon:number};
export type WeatherDay={date:string;precipMm:number|null;tMaxC:number|null;tMinC?:number|null};
export type SharedWeatherEvidence={
 version:1;key:string;location:string;coordinates:[number,number];source:'Open-Meteo';sourceUrl:string;
 dataKind:'archived-model';timeZone:string;checkedAt:string;lastDay:string;windowStart:string;
 daily:WeatherDay[];history:WeatherDay[];rawResponse:any;rainfallDays:number;temperatureDays:number;
 precip7mm:number|null;hotDays:number|null;minimumTemperatureDays?:number;retrievalFailed?:boolean;lastAttemptAt?:string;
};
const shift=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*WEATHER_DAY).toISOString().slice(0,10);
export {weatherLocalDay as localWeatherDay} from '../utils/originWeatherPills.ts';
export const weatherWindowEnd=(now:Date,zone:string)=>shift(localWeatherDay(now,zone),-1);
/** First instant the completed local-day window changes, including DST/half-hour zones. */
export function weatherWindowExpiry(now:Date,zone:string):number {
 const end=weatherWindowEnd(now,zone);let before=now.getTime(),after=before+2*WEATHER_DAY;
 while(after-before>1){const middle=Math.floor((before+after)/2);
  if(weatherWindowEnd(new Date(middle),zone)===end)before=middle;else after=middle;
 }
 return after;
}
const numeric=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function openMeteoWeatherUrl(point:WeatherPoint,historyDays=7,minimumTemperature=false):string {
 const key=(process.env.RMS_OPEN_METEO_API_KEY||'').trim();
 const base=process.env.RMS_OPEN_METEO_BASE_URL||(key?'https://customer-api.open-meteo.com':'https://api.open-meteo.com');
 const url=new URL(base.replace(/\/$/,'')+'/v1/forecast');
 for(const [k,v] of Object.entries({latitude:String(point.lat),longitude:String(point.lon),daily:'precipitation_sum,temperature_2m_max'+(minimumTemperature?',temperature_2m_min':''),past_days:String(historyDays+1),forecast_days:'0',timezone:'auto',precipitation_unit:'mm',temperature_unit:'celsius'}))url.searchParams.set(k,v);
 if(key)url.searchParams.set('apikey',key);return url.toString();
}
const publicUrl=(url:string)=>{const u=new URL(url);u.searchParams.delete('apikey');return u.toString();};
export function parseSharedOpenMeteo(body:any,point:WeatherPoint,checkedAt:string,historyDays=7,minimumTemperature=false):SharedWeatherEvidence|null {
 const now=new Date(checkedAt),d=body?.daily;
 if(!Number.isFinite(now.getTime())||!Array.isArray(d?.time)||new Set(d.time).size!==d.time.length||
 !Array.isArray(d.precipitation_sum)||!Array.isArray(d.temperature_2m_max)||d.time.length!==d.precipitation_sum.length||d.time.length!==d.temperature_2m_max.length||
 body.daily_units?.precipitation_sum!=='mm'||body.daily_units?.temperature_2m_max!=='°C'||body.daily_units?.time!=='iso8601'||
 !numeric(body.latitude,-90,90)||!numeric(body.longitude,-180,180)||Math.abs(body.latitude-point.lat)>.3||Math.abs(body.longitude-point.lon)>.3||
 typeof body.timezone!=='string'||!numeric(body.utc_offset_seconds,-14*3600,14*3600)||d.time.some((v:unknown)=>!validWeatherDay(v)))return null;
 let lastDay:string;try {
  const offsetLabel=new Intl.DateTimeFormat('en-US',{timeZone:body.timezone,timeZoneName:'longOffset'}).formatToParts(now).find(p=>p.type==='timeZoneName')!.value;
  const m=offsetLabel.match(/^GMT([+-])(\d{2}):(\d{2})$/),offset=offsetLabel==='GMT'?0:m?(m[1]==='-'?-1:1)*(+m[2]*3600+ +m[3]*60):NaN;
  if(offset!==body.utc_offset_seconds)return null;
  lastDay=weatherWindowEnd(now,body.timezone);
 }catch{return null;}
 // Always the exact previous seven LOCAL calendar days, including missing rows.
 // Never shift to an older complete week, discard a date, or coerce null to zero.
 const validMinimum=minimumTemperature&&Array.isArray(d.temperature_2m_min)&&d.temperature_2m_min.length===d.time.length&&body.daily_units?.temperature_2m_min==='°C';
 const history=Array.from({length:historyDays},(_,i)=>{const date=shift(lastDay,i-historyDays+1),index=d.time.indexOf(date);
  const tMaxC=numeric(d.temperature_2m_max[index],-65,65)?d.temperature_2m_max[index]:null;
  const tMinC=validMinimum&&numeric(d.temperature_2m_min[index],-65,65)&&(tMaxC===null||d.temperature_2m_min[index]<=tMaxC)?d.temperature_2m_min[index]:null;
  return {date,precipMm:numeric(d.precipitation_sum[index],0,500)?d.precipitation_sum[index]:null,tMaxC,...(minimumTemperature?{tMinC}:{})};});
 const daily=history.slice(-7),rainfallDays=daily.filter(r=>r.precipMm!==null).length,temperatureDays=daily.filter(r=>r.tMaxC!==null).length;
 return {version:1,key:point.key,location:point.label,coordinates:[point.lat,point.lon],source:'Open-Meteo',sourceUrl:publicUrl(openMeteoWeatherUrl(point,historyDays,minimumTemperature)),dataKind:'archived-model',timeZone:body.timezone,checkedAt,lastDay,windowStart:daily[0].date,daily,history,rawResponse:body,rainfallDays,temperatureDays,...(minimumTemperature?{minimumTemperatureDays:daily.filter(r=>r.tMinC!==null).length}:{}),
 precip7mm:rainfallDays===7?Math.round(daily.reduce((n,r)=>n+r.precipMm!,0)*10)/10:null,
 hotDays:temperatureDays?daily.filter(r=>r.tMaxC!==null&&r.tMaxC>=35).length:null};
}
export function currentSharedWeather(e:SharedWeatherEvidence,point:WeatherPoint,now=new Date()):boolean {
 if(!e||e.source!=='Open-Meteo'||e.dataKind!=='archived-model'||e.version!==1||e.key!==point.key||e.location!==point.label||e.coordinates?.[0]!==point.lat||e.coordinates?.[1]!==point.lon||
 !Number.isFinite(Date.parse(e.checkedAt))||Date.parse(e.checkedAt)>now.getTime()+60000||now.getTime()-Date.parse(e.checkedAt)>=3*WEATHER_DAY)return false;
 try{if(e.lastDay!==weatherWindowEnd(now,e.timeZone))return false;}catch{return false;}
 const parsed=parseSharedOpenMeteo(e.rawResponse,point,e.checkedAt,e.history?.length||7,e.minimumTemperatureDays!==undefined);
 return !!parsed&&(['lastDay','windowStart','sourceUrl','timeZone','daily','history','rainfallDays','temperatureDays','precip7mm','hotDays','minimumTemperatureDays'] as const).every(k=>JSON.stringify(e[k])===JSON.stringify(parsed[k]));
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const pending=new Map<string,Promise<SharedWeatherEvidence|null>>();
/** Shared persistent read-through cache; old provider caches and raw records stay intact. */
export async function getOriginWeather(point:WeatherPoint,options:{force?:boolean;historyDays?:number;minimumTemperature?:boolean;cacheDir?:string;now?:Date;fetcher?:typeof fetch}={}):Promise<SharedWeatherEvidence|null> {
 const now=options.now||new Date(),historyDays=options.historyDays||7,url=openMeteoWeatherUrl(point,historyDays,options.minimumTemperature);
 const dir=options.cacheDir||path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'shared-openmeteo-v1');
 const id=hash({point,url:publicUrl(url),historyDays}),file=path.join(dir,id+'.json');let prior:SharedWeatherEvidence|null=null;
 try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(currentSharedWeather(raw,point,now))prior=raw;}catch{}
 const complete=prior&&prior.rainfallDays===7&&prior.temperatureDays===7&&(!options.minimumTemperature||prior.minimumTemperatureDays===7)&&!prior.retrievalFailed;
 if(!options.force&&prior&&now.getTime()-Date.parse(prior.lastAttemptAt||prior.checkedAt)<(complete?3*3600000:20*60000))return prior;
 const lock=file;if(pending.has(lock))return pending.get(lock)!;
 const task=(async()=>{
  let evidence:SharedWeatherEvidence|null=null,failed=false;
  for(let attempt=0;attempt<2;attempt++){
   try{const r=await(options.fetcher||fetch)(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Open-Meteo HTTP '+r.status);
    evidence=parseSharedOpenMeteo(await r.json(),point,now.toISOString(),historyDays,options.minimumTemperature);failed=false;
    // A valid partial response is preserved; never fill it from another provider/window.
    if(evidence&&((evidence.rainfallDays===7&&evidence.temperatureDays===7&&(!options.minimumTemperature||evidence.minimumTemperatureDays===7))||attempt===1))break;
   }catch{failed=true;}
  }
  if(!evidence&&failed&&prior)evidence={...prior,retrievalFailed:true,lastAttemptAt:now.toISOString()};
  if(evidence){fs.mkdirSync(path.join(dir,'receipts'),{recursive:true});
   const receipt=path.join(dir,'receipts',hash(evidence)+'.json');if(!fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify(evidence,null,2),{mode:0o600});
   const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(evidence,null,2),{mode:0o600});fs.renameSync(tmp,file);
  }else if(fs.existsSync(file)){
   // Keep the old receipt, but replace the current index so invalid new data cannot certify green.
   fs.writeFileSync(file,JSON.stringify({unavailable:true,lastAttemptAt:now.toISOString()}),{mode:0o600});
  }
  return evidence;
 })();pending.set(lock,task);try{return await task;}finally{pending.delete(lock);}
}
export function sharedWeatherScreen(points:SharedWeatherEvidence[],configured:ReadonlyArray<WeatherPoint>,policy:{heatDays:number;rainMm?:number},now=new Date()):WeatherScreen {
 const current=points.filter(p=>{const c=configured.find(c=>c.key===p.key&&c.label===p.location);return !!c&&currentSharedWeather(p,c,now);});
 const screen=screenObservedWeather(current.map(p=>({location:p.location,lastDay:p.lastDay,checkedAt:p.checkedAt,rainfallDays:p.rainfallDays,temperatureDays:p.temperatureDays,
   // The sum of verified days is a lower bound, not a fabricated complete week.
   // It can prove a rain threshold was exceeded while coverage stays incomplete.
   precipMm:p.precip7mm??(p.rainfallDays?Number(p.daily.filter(d=>d.precipMm!==null).reduce((sum,d)=>sum+d.precipMm!,0).toFixed(6)):null),
   hotDays:p.hotDays,retrievalFailed:p.retrievalFailed})),{locations:configured.map(p=>p.label),heatDays:policy?.heatDays,rainMm:policy?.rainMm,observationAgeDays:3,independentlyCurrentLocalWindows:true},now.getTime());
 screen.weatherPills=screen.weatherPills.map(p=>({...p,basis:p.basis.replaceAll('관측','모델 자료')+' · Open-Meteo 과거 모델 자료, 실측·재분석 아님'}));
 const ends=current.map(p=>weatherWindowExpiry(now,p.timeZone));
 if(ends.length)screen.weatherValidUntil=new Date(Math.min(Date.parse(screen.weatherValidUntil||'9999-01-01'),...ends)).toISOString();
 return screen;
}
/** Conservative modeled freezing exposure for tropical perennial crops only.
 * FAO meteorological freezing definition: https://www.fao.org/4/y7223e/y7223e07.htm
 * Crop context/sources and excluded annual-crop phenology are documented in the coverage report.
 * This does not diagnose surface frost, exposure duration, crop damage or supply loss.
 */
export const TROPICAL_FREEZING_CROPS:Readonly<Record<string,string>>=Object.freeze({'palm-oil':'기름야자',sugar:'사탕수수','tapioca-starch':'카사바'});
export function withSharedFreezingRisk(id:string,base:WeatherScreen,e:SharedWeatherEvidence|undefined,point:WeatherPoint,now=new Date()):WeatherScreen {
 if(!TROPICAL_FREEZING_CROPS[id])return base;
 const valid=!!e&&currentSharedWeather(e,point,now),known=valid?e.daily.filter(d=>typeof d.tMinC==='number'&&Number.isFinite(d.tMinC)):[];
 const freezing=known.filter(d=>d.tMinC!<=0),complete=valid&&e.minimumTemperatureDays===7&&!e.retrievalFailed;
 let pills=base.weatherPills.filter(p=>p.label!=='특이 없음'||complete&&!freezing.length);
 if(freezing.length)pills=[{label:'저온 주의',basis:`${point.label} ${TROPICAL_FREEZING_CROPS[id]} 대표 지점 · 최근 현지 완료 7일 중 2m 모델 일최저기온 0°C 이하 ${freezing.length}일, 최저 ${Math.min(...freezing.map(d=>d.tMinC!))}°C · 포장 서리·생육 피해·국가 공급 차질 판정 아님`},...pills];
 if(!complete){
  const reasons=pills.filter(p=>p.label==='자료 부족'||p.label==='판정 보류').map(p=>p.basis);
  pills=pills.filter(p=>p.label!=='자료 부족'&&p.label!=='판정 보류');
  pills.push({label:'자료 부족',basis:[...reasons,`${point.label}: 일최저기온 ${valid?e.minimumTemperatureDays||0:0}/7일 · ${valid&&!e.retrievalFailed?'빙점 노출 선별에 필요한 기온 확인 필요':'최근 현지 기간·출처·재확인 상태 확인 필요'}`].join(' · ')});
 }
 const until=valid?Math.min(Date.parse(base.weatherValidUntil||'9999-01-01'),Date.parse(e.checkedAt)+3*WEATHER_DAY,weatherWindowExpiry(now,e.timeZone)):undefined;
 return {weatherPills:pills,...(until!==undefined?{weatherValidUntil:new Date(until).toISOString()}:{})};
}
export function sharedWeatherSummary(points:SharedWeatherEvidence[]):string {
 if(!points.length)return '모델 기상 자료 부족 (Open-Meteo)';
 return '모델 기상 · 현지 완료 7일: '+points.map(p=>`${p.location} ${p.precip7mm===null?`강수 ${p.rainfallDays}/7일 확인`:p.precip7mm+'mm'} (${p.windowStart}~${p.lastDay}, ${p.timeZone})`+(p.hotDays?` · 35°C 이상 ${p.hotDays}일`:'')+(p.temperatureDays<7?` · 기온 ${p.temperatureDays}/7일 확인`:'')+(p.retrievalFailed?' · 저장 기상(재확인 실패)':'')).join(' · ');
}

/** Common weather enrichment; commodity-specific supply figures and policies remain owned by their existing services. */
export function enrichSharedOriginWeather(radar:import('./originRadarService.ts').OriginRadarResponse,points:SharedWeatherEvidence[],configured:ReadonlyArray<WeatherPoint>,policy:{heatDays:number;rainMm?:number},now=new Date()) {
 return {...radar,origins:radar.origins.map(origin=>{
  const expected=configured.filter(p=>p.key===origin.originKey),valid=points.filter(p=>{const c=expected.find(c=>c.label===p.location);return !!c&&currentSharedWeather(p,c,now);});
  const screen=sharedWeatherScreen(valid,expected,policy,now),clear=screen.weatherPills.every(p=>p.label==='특이 없음'),alert=screen.weatherPills.some(p=>!['자료 부족','판정 보류','특이 없음'].includes(p.label));
  const supplyVerified=origin.dataFreshness!=='unavailable'&&!!origin.production&&!!origin.exports&&!!origin.endingStocks;
  return {...origin,...screen,status:alert?'모니터링' as const:clear&&supplyVerified?'양호' as const:'자료 부족' as const,statusColor:alert?'yellow' as const:clear&&supplyVerified?'green' as const:'gray' as const,
   riskWeather:sharedWeatherSummary(valid),weatherSource:'Open-Meteo',weatherAsOf:valid.map(p=>p.lastDay).sort()[0],weatherDataKind:'archived-model',weatherEvidence:valid,
   statusBasis:'대표 지점의 과거 모델 기상 선별. 실측·재분석·국가 작황·피해·조달 안전 판정 아님. '+valid.map(p=>`${p.location}: ${p.windowStart}~${p.lastDay} ${p.timeZone}; ${p.sourceUrl}; 확인 ${p.checkedAt}`).join('; ')};
 }),sourceFooterText:[...new Set([radar.sourceFooterText?.replace(/ · NASA POWER(?:\(기상\))?/g,''),'Open-Meteo'].filter(Boolean))].join(' · ')};
}
