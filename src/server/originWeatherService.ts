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
export async function getOriginWeather(point:WeatherPoint,options:{force?:boolean;savedOnly?:boolean;historyDays?:number;minimumTemperature?:boolean;cacheDir?:string;now?:Date;fetcher?:typeof fetch}={}):Promise<SharedWeatherEvidence|null> {
 const now=options.now||new Date(),historyDays=options.historyDays||7,url=openMeteoWeatherUrl(point,historyDays,options.minimumTemperature);
 const dir=options.cacheDir||path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'shared-openmeteo-v1');
 // Identity is the configured location, not incidental caller properties/order.
 const identity={key:point.key,label:point.label,lat:point.lat,lon:point.lon};
 const id=hash({point:identity,url:publicUrl(url),historyDays}),file=path.join(dir,id+'.json');
 const complete=(e:SharedWeatherEvidence)=>e.rainfallDays===7&&e.temperatureDays===7&&(!options.minimumTemperature||e.minimumTemperatureDays===7)&&
  e.history.length===historyDays&&e.history.every(d=>d.precipMm!==null);
 const valid=(raw:SharedWeatherEvidence)=>!!raw&&
  (raw.sourceUrl===publicUrl(url)||raw.sourceUrl===publicUrl(openMeteoWeatherUrl(point,historyDays,false)))&&
  currentSharedWeather(raw,point,new Date(raw.checkedAt));
 // The current index may predate a good receipt, use a legacy key, or be a failed
 // marker. Recover the latest successful source record without any requests.
 const candidates:SharedWeatherEvidence[]=[];
 try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(valid(raw)){if(options.savedOnly&&complete(raw)&&!raw.retrievalFailed&&currentSharedWeather(raw,point,now))return raw;candidates.push(raw);}}catch{}
 try{for(const name of fs.readdirSync(path.join(dir,'receipts')).filter(n=>n.endsWith('.json'))){
  try{const raw=JSON.parse(fs.readFileSync(path.join(dir,'receipts',name),'utf8'));if(valid(raw))candidates.push(raw);}catch{}
 }}catch{}
 candidates.sort((a,b)=>b.lastDay.localeCompare(a.lastDay)||Number(complete(b))-Number(complete(a))||Number(!!a.retrievalFailed)-Number(!!b.retrievalFailed)||b.checkedAt.localeCompare(a.checkedAt));
 const prior=candidates[0]||null;
 if(options.savedOnly)return prior;
 if(!options.force&&prior&&currentSharedWeather(prior,point,now)&&!prior.retrievalFailed&&now.getTime()-Date.parse(prior.checkedAt)<(complete(prior)?3*3600000:20*60000))return prior;
 const lock=file;if(pending.has(lock))return pending.get(lock)!;
 const task=(async()=>{
  let evidence:SharedWeatherEvidence|null=null,error='',attempts=0,receivedStatus='failed';
  for(let attempt=0;attempt<2;attempt++){
   attempts++;
   try{const r=await(options.fetcher||fetch)(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Open-Meteo HTTP '+r.status);
    const candidate=parseSharedOpenMeteo(await r.json(),point,now.toISOString(),historyDays,options.minimumTemperature);
    if(!candidate)throw Error('Open-Meteo source, coordinates, units, timezone or daily arrays invalid');
    evidence=candidate;receivedStatus=complete(candidate)?'complete':'partial';
    if(complete(candidate)){error='';break;}
    error='Incomplete daily coverage';
   }catch(e){error=e instanceof Error?e.message:String(e);}
   if(attempt===0)await new Promise(resolve=>setTimeout(resolve,500));
  }
  fs.mkdirSync(path.join(dir,'receipts'),{recursive:true});
  if(evidence){
   const receipt=path.join(dir,'receipts',hash(evidence)+'.json');if(!fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify(evidence,null,2),{mode:0o600});
   // Never replace a complete successful receipt with failure or a partial
   // response for the same window. Newer partial windows remain truthful.
   const published=prior&&prior.lastDay===evidence.lastDay&&complete(prior)&&!complete(evidence)?prior:evidence;
   const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(published,null,2),{mode:0o600});fs.renameSync(tmp,file);
   evidence=published;
  }
  // Diagnostics are separate from the last good publication. Its observation
  // dates stay unchanged, so an older retained week can never certify current.
  fs.writeFileSync(file+'.attempt.json',JSON.stringify({point:identity,url:publicUrl(url),lastAttemptAt:now.toISOString(),attempts,
   status:receivedStatus,error:error||undefined,retained:!!prior&&(!evidence||evidence===prior)},null,2),{mode:0o600});
  if(!evidence)evidence=prior;
  return evidence;
 })();pending.set(lock,task);try{return await task;}finally{pending.delete(lock);}
}
export function sharedWeatherScreen(points:SharedWeatherEvidence[],configured:ReadonlyArray<WeatherPoint>,policy:{heatDays:number;rainMm?:number},now=new Date()):WeatherScreen {
 const current=points.filter(p=>{const c=configured.find(c=>c.key===p.key&&c.label===p.location);return !!c&&currentSharedWeather(p,c,now);});
 const screen=screenObservedWeather(current.map(p=>({location:p.location,lastDay:p.lastDay,checkedAt:p.checkedAt,rainfallDays:p.rainfallDays,temperatureDays:p.temperatureDays,
   precipMm:p.precip7mm,
   hotDays:p.hotDays,retrievalFailed:p.retrievalFailed})),{locations:configured.map(p=>p.label),heatDays:policy?.heatDays,observationAgeDays:3,independentlyCurrentLocalWindows:true},now.getTime());
 // Preserve the existing 90mm event screen, but require a complete same-point
 // comparison and at least twice the preceding 3-week weekly average. This is
 // concentrated modeled rainfall, not a diagnosis of waterlogging or damage.
 if(policy.rainMm!==undefined)for(const p of current){
  const baseline=p.history.length===28&&p.history.slice(0,21).every(d=>d.precipMm!==null)?p.history.slice(0,21).reduce((n,d)=>n+d.precipMm!,0)/3:null;
  if(p.precip7mm!==null&&baseline!==null&&baseline>0&&p.precip7mm>=policy.rainMm&&p.precip7mm>=2*baseline){
   screen.weatherPills=screen.weatherPills.filter(p=>p.label!=='특이 없음');
   screen.weatherPills.push({label:'강수 과다 주의',basis:p.location+' 현지 완료 7일 '+p.precip7mm+'mm / 직전 3주 주평균 '+baseline.toFixed(1)+'mm · 기존 '+policy.rainMm+'mm 및 2배 편차 기준 동시 충족 · 침수·작물 피해 판정 아님'});
  }
 }
 screen.weatherPills=screen.weatherPills.map(p=>({...p,basis:p.basis.replaceAll('관측','모델 자료')+' · Open-Meteo 과거 모델 자료, 실측·재분석 아님'}));
 const ends=current.map(p=>weatherWindowExpiry(now,p.timeZone));
 if(ends.length)screen.weatherValidUntil=new Date(Math.min(Date.parse(screen.weatherValidUntil||'9999-01-01'),...ends)).toISOString();
 screen.weatherScreening={scope:`대표 지점의 35°C 이상 ${policy.heatDays}일 반복 고온${policy.rainMm?` 및 현지 7일 ${policy.rainMm}mm 이상·직전 3주 주평균 2배 이상 누적 강수`:''} 선별`,
  complete:current.length===configured.length&&configured.length>0&&current.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&p.minimumTemperatureDays===7&&!p.retrievalFailed&&p.history.length===28&&p.history.every(d=>d.precipMm!==null)),
  limitations:['기존 RMS 기상 사건 선별 기준이며 생육 피해 임계값이 아님','품종·생육단계별 저온·가뭄·침수 노출은 미평가','재배 생육단계·토양수분·관개·포장 피해·조달 안전은 판정하지 않음'],sources:current.map(p=>p.sourceUrl)};
 if(!screen.weatherScreening.complete&&!screen.weatherPills.some(p=>p.label==='자료 부족')){
  screen.weatherPills=screen.weatherPills.filter(p=>p.label!=='특이 없음');
  screen.weatherPills.push({label:'자료 부족',basis:'최근 7일 강수·최고·최저기온 또는 직전 21일 비교 강수의 완전한 원자료 확인 필요'});
 }
 return screen;
}

/** Crop-specific, deliberately partial thermal exposure screens. A 2m freezing
 * event does not establish canopy/soil frost or damage. A completed limited screen may report no event; it never certifies general
 * crop safety, crop stage or water balance.
 * Cassava's whole-day Tmax <=10C check follows FAO's growth-stop temperature;
 * it does not equate a single cool night with sustained growth inhibition.
 */
export function screenCropWeatherEvents(id:string,e:SharedWeatherEvidence|undefined,point:WeatherPoint,now=new Date()):WeatherScreen {
 const crops:Record<string,{name:string;sources:string[]}>={
  sugar:{name:'사탕수수',sources:['https://www.fao.org/4/i2800e/i2800e.pdf']},
  'potato-starch':{name:'감자',sources:['https://www.bamis.gov.bd/en/crops/view/52/']},
  'tapioca-starch':{name:'카사바',sources:['https://www.fao.org/4/x5032e/x5032e01.htm']}
 };
 const crop=crops[id];if(!crop)return {weatherPills:[{label:'판정 보류',basis:'품목별 사건 선별 근거 없음'}]};
 const current=!!e&&currentSharedWeather(e,point,now),daily=current?e.daily:[];
 const complete=current&&!e.retrievalFailed&&e.rainfallDays===7&&e.temperatureDays===7&&e.minimumTemperatureDays===7&&e.history.length===28&&e.history.every(d=>d.precipMm!==null);
 const cold=daily.filter(d=>d.tMinC!=null&&d.tMinC<=0),coolDay=id==='tapioca-starch'?daily.filter(d=>d.tMaxC!=null&&d.tMaxC<=10):[];
 const limitations=[`${crop.name} 생육·수확 단계와 포장별 노출 미확인`,
  '2m 모델 기온은 지표·토양·괴경 온도나 작물 피해 측정이 아님',
  '강수 적정성은 토양수분·배수·관개·증발산 근거가 없어 선별하지 않음',
  id==='potato-starch'?`${[8,9,10].includes(now.getUTCMonth())?'가을 수확기 맥락 · ':''}해당 포장의 미수확 여부·보관 상태 미확인`:'열대 작물의 생육·수확이 혼재하며 특정 정식 시기 미확인'];
 const coverage=`강수 ${current?e.rainfallDays:0}/7 · 최고기온 ${current?e.temperatureDays:0}/7 · 최저기온 ${current?e.minimumTemperatureDays||0:0}/7 · 비교 강수 ${current?e.history.filter(d=>d.precipMm!==null).length:0}/28`;
 const basis=cold.length?`${point.label} ${crop.name}: 현지 완료 7일 중 모델 일최저기온 0°C 이하 ${cold.length}일 · 지표 서리·작물 피해 판정 아님`:
  coolDay.length?`${point.label} 카사바: 모델 일최고기온 10°C 이하 ${coolDay.length}일 · FAO 생육 정지 온도 부근의 종일 저온 노출 선별, 피해 판정 아님`:
  `${point.label}: ${current?'확인한 저온 사건 없음':'최근 현지 완료 7일 자료 미확인'} · ${coverage} · ${limitations.join(' · ')}`;
 return {weatherPills:[{label:cold.length||coolDay.length?'저온 주의':complete?'특이 없음':'판정 보류',basis}],
  ...(current?{weatherValidUntil:new Date(Math.min(weatherWindowExpiry(now,e.timeZone),Date.parse(e.checkedAt)+3*WEATHER_DAY)).toISOString()}:{}),
  weatherScreening:{scope:`${crop.name} 2m 빙점 노출${id==='tapioca-starch'?' 및 종일 10°C 이하 저온':''} 제한된 사건 선별`,complete,limitations,sources:crop.sources}};
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
 return {...base,weatherPills:pills,...(!complete&&base.weatherScreening?{weatherScreening:{...base.weatherScreening,complete:false}}:{}),...(until!==undefined?{weatherValidUntil:new Date(until).toISOString()}:{})};
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
   riskWeather:sharedWeatherSummary(points.filter(p=>expected.some(c=>c.label===p.location))),weatherSource:'Open-Meteo',weatherAsOf:points.filter(p=>expected.some(c=>c.label===p.location)).map(p=>p.lastDay).sort()[0],weatherDataKind:'archived-model',weatherEvidence:points.filter(p=>expected.some(c=>c.label===p.location)),
   statusBasis:'대표 지점의 과거 모델 기상 선별. 실측·재분석·국가 작황·피해·조달 안전 판정 아님. '+valid.map(p=>`${p.location}: ${p.windowStart}~${p.lastDay} ${p.timeZone}; ${p.sourceUrl}; 확인 ${p.checkedAt}`).join('; ')};
 }),sourceFooterText:[...new Set([radar.sourceFooterText?.replace(/ · NASA POWER(?:\(기상\))?/g,''),'Open-Meteo'].filter(Boolean))].join(' · ')};
}
