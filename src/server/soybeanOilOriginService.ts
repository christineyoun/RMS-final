import {getOriginWeather,openMeteoWeatherUrl,parseSharedOpenMeteo,weatherWindowEnd,sharedWeatherScreen} from './originWeatherService.ts';
/** Oil-specific national PSD with upstream soybean-growing-point weather.
 * No prices, global balance, paid models, schedules or crop-damage inference. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type {OriginRadarResponse,OriginItemDetail} from './originRadarService.ts';
import {soybeanOilMarketingYear} from '../lib/soybeanOilSupply.ts';
import {SOYBEAN_HEAT_SCREEN} from './soybeanOriginConditionsService.ts';
import {insufficientWeather,validWeatherDay} from '../utils/originWeatherPills.ts';
export const OIL_ORIGIN_POINTS=[
 {key:'argentina',region:'아르헨티나 (Rosario)',country:'AR',lat:-32.95,lon:-60.66},
 {key:'brazil',region:'브라질 (Mato Grosso)',country:'BR',lat:-12.55,lon:-55.72},
 {key:'usa',region:'미국 (Midwest)',country:'US',lat:41.59,lon:-93.62},
 {key:'paraguay',region:'파라과이 (Alto Paraná)',country:'PA',lat:-25.53,lon:-54.63}
] as const;
type Point=typeof OIL_ORIGIN_POINTS[number];
const DAY=86400000,PSD_URL='https://apps.fas.usda.gov/psdonline/app/index.html';
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export type OilCountryEvidence={country:string;commodityCode:'4232000';year:string;period:string;verifiedAt:string;sourceUrl:string;production:number;exports:number;stocks:number;rawRecords:any[];retrievalFailed?:boolean};
export function parseOilOriginPsd(rows:unknown,p:Point,now=new Date()):OilCountryEvidence|null{
 const year=String(soybeanOilMarketingYear(now));if(!Array.isArray(rows)||!rows.length)return null;
 if(rows.some(r=>!r||String(r.commodityCode)!=='4232000'||r.countryCode!==p.country||String(r.marketYear)!==year||!/^20\d{2}$/.test(String(r.calendarYear))||!/^\d{1,2}$/.test(String(r.month))||Number(r.month)<1||Number(r.month)>12))return null;
 const periods=new Set(rows.map(r=>`${r.calendarYear}-${String(r.month).padStart(2,'0')}`));if(periods.size!==1)return null;
 const period=[...periods][0],age=now.getTime()-Date.parse(period+'-01');if(!validWeatherDay(period+'-01')||period>now.toISOString().slice(0,7)||age>93*DAY)return null;
 const get=(id:number)=>{const matches=rows.filter(r=>r.attributeId===id);return matches.length===1&&matches[0].unitId===8&&number(matches[0].value,0,1e9)?matches[0].value/1000:null;};
 const production=get(28),exports=get(88),stocks=get(176);if(production===null||exports===null||stocks===null||production<=0)return null;
 return {country:p.country,commodityCode:'4232000',year,period,verifiedAt:now.toISOString(),sourceUrl:`https://api.fas.usda.gov/api/psd/commodity/4232000/country/${p.country}/year/${year}`,production,exports,stocks,rawRecords:rows};
}
export type OilWeatherEvidence={source:'Open-Meteo';location:string;coordinates:number[];sourceUrl:string;checkedAt:string;timeZone:string;lastDay:string;daily:{day:string;rainMm:number|null;maxC:number|null;minC?:number|null}[];rawResponse:any;retrievalFailed?:boolean};
/** Original saved-source URLs stay valid for historical provenance; never used for new primary requests. */
export function legacyOilWeatherUrl(p:Point){return `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=precipitation_sum,temperature_2m_max&past_days=8&forecast_days=1&timezone=auto`;}
export function oilWeatherUrl(p:Point){return openMeteoWeatherUrl({...p,label:p.region},7,true);}
export function oilWeatherSourceUrl(p:Point){const u=new URL(oilWeatherUrl(p));u.searchParams.delete('apikey');return u.toString();}
export function parseOilOriginWeather(body:any,p:Point,now=new Date(),minimumTemperature=true):OilWeatherEvidence|null {
 const e=parseSharedOpenMeteo(body,{...p,label:p.region},now.toISOString(),7,minimumTemperature);
 return e?{source:e.source,location:e.location,coordinates:e.coordinates,sourceUrl:e.sourceUrl,checkedAt:e.checkedAt,timeZone:e.timeZone,lastDay:e.lastDay,daily:e.daily.map(d=>({day:d.date,rainMm:d.precipMm,maxC:d.tMaxC,...(minimumTemperature?{minC:d.tMinC??null}:{})})),rawResponse:body}:null;
}

function previousSharedOilWeatherUrl(p:Point){const u=new URL(oilWeatherSourceUrl(p));u.searchParams.set('daily','precipitation_sum,temperature_2m_max');return u.toString();}
function validatedWeather(w:OilWeatherEvidence|undefined,p:Point,now:Date){
 if(!w||w.source!=='Open-Meteo'||w.location!==p.region||(w.sourceUrl!==legacyOilWeatherUrl(p)&&w.sourceUrl!==oilWeatherSourceUrl(p)&&w.sourceUrl!==previousSharedOilWeatherUrl(p))||w.coordinates?.[0]!==p.lat||w.coordinates?.[1]!==p.lon||!Number.isFinite(Date.parse(w.checkedAt))||Date.parse(w.checkedAt)>now.getTime()||now.getTime()-Date.parse(w.checkedAt)>=3*DAY)return null;
 const parsed=parseOilOriginWeather(w.rawResponse,p,new Date(w.checkedAt),w.daily.every(d=>d.minC!==undefined));if(!parsed||JSON.stringify(parsed.daily)!==JSON.stringify(w.daily)||parsed.lastDay!==w.lastDay||parsed.timeZone!==w.timeZone||w.lastDay!==weatherWindowEnd(now,w.timeZone))return null;return w;
}
function validatedSupply(s:OilCountryEvidence|undefined,p:Point,now:Date){if(!s||!Number.isFinite(Date.parse(s.verifiedAt))||Date.parse(s.verifiedAt)>now.getTime()||now.getTime()-Date.parse(s.verifiedAt)>45*DAY)return null;const parsed=parseOilOriginPsd(s.rawRecords,p,now);return parsed&&(['country','commodityCode','year','period','production','exports','stocks','sourceUrl'] as const).every(k=>parsed[k]===s[k])?s:null;}
export function buildOilOrigin(p:Point,s:OilCountryEvidence|undefined,w:OilWeatherEvidence|undefined,now=new Date(),prior?:OilCountryEvidence):OriginItemDetail{
 const supply=validatedSupply(s,p,now),weather=validatedWeather(w,p,now),rainDays=weather?.daily.filter(d=>d.rainMm!==null).length||0,tempDays=weather?.daily.filter(d=>d.maxC!==null).length||0;
 const hotDays=tempDays?weather!.daily.filter(d=>d.maxC!==null&&d.maxC>=SOYBEAN_HEAT_SCREEN.temperatureC).length:null;
 const sum=rainDays===7?weather!.daily.reduce((n,d)=>n+d.rainMm!,0):null;
 const shared=weather?parseSharedOpenMeteo(weather.rawResponse,{...p,label:p.region},weather.checkedAt,7,weather.daily.every(d=>d.minC!==undefined)):null;
 const screen=shared?sharedWeatherScreen([{...shared,retrievalFailed:weather?.retrievalFailed}],[{...p,label:p.region}],{heatDays:SOYBEAN_HEAT_SCREEN.minObservedDays},now):insufficientWeather('최근 7일 대표 지점 모델 기상 근거 부족');
 screen.weatherPills=screen.weatherPills.map(pill=>({...pill,basis:pill.basis+' · 원료 대두 대표 지점 모델 기상 · 반복 고온만 선별, 강수 적정성 미평가'}));
 const goodPrior=supply&&prior&&validatedSupply(prior,p,now)&&prior.year===supply.year&&Date.parse(supply.period+'-01')>Date.parse(prior.period+'-01')&&(+supply.period.slice(0,4)-+prior.period.slice(0,4))*12+(+supply.period.slice(5)-+prior.period.slice(5))===1?prior:null;
 const fmt=(n:number)=>n.toFixed(3)+'M MT';
 return {originKey:p.key,region:p.region,production:supply?fmt(supply.production):'',productionNumericMMT:supply?.production??null,unit:'MMT',marketYear:supply?`${supply.year}/${String(+supply.year+1).slice(-2)}`:'',exports:supply?'수출 '+fmt(supply.exports):'',endingStocks:supply?'기말재고 '+fmt(supply.stocks):'',exportComparison:goodPrior?`전월 ${fmt(goodPrior.exports)} · ${(supply!.exports-goodPrior.exports)>=0?'+':''}${(supply!.exports-goodPrior.exports).toFixed(3)}M MT`:undefined,exportComparisonBasis:goodPrior?`${goodPrior.period} → ${supply!.period}`:undefined,
 ...screen,status:'자료 부족',statusColor:'gray',statusBasis:'기상 표시는 원료 대두 재배지 대표 지점의 모델 자료입니다. 35°C 이상 3일은 기존 대두 RMS 선별 기준이며 생육단계·토양수분·작황 피해·대두유 생산 변화를 판정하지 않습니다.',riskAssessment:'USDA 국가 대두유 연간 수급 전망과 원료 대두 재배지 기상은 별도 근거입니다.',
 riskWeather:weather?`원료 대두 재배지 모델 기상 · 현지 ${shared?.windowStart}~${weather.lastDay}: ${sum!==null?sum.toFixed(1)+'mm':`강수 ${rainDays}/7일 확인`} · ${hotDays!==null?`35°C 이상 ${hotDays}일`:'기온 미확인'}${tempDays<7?` · 기온 ${tempDays}/7일 확인`:''}${weather.retrievalFailed?' · 저장 기상(재확인 실패)':''}`:'원료 대두 재배지 기상 자료 부족',
 weatherEvidence:shared?{...shared,retrievalFailed:weather?.retrievalFailed}:undefined,weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherAsOf:weather?.lastDay,primarySource:'USDA FAS PSD',sourceName:'USDA FAS PSD',sourceOrg:'USDA FAS PSD',sourceReportDate:supply?.period||'',sourceUrl:supply?.sourceUrl||PSD_URL,retrievedAt:supply?.verifiedAt||'',isLive:!!supply&&!supply.retrievalFailed,dataFreshness:supply?(supply.retrievalFailed?'cached':'live'):'unavailable',sourcingInsight:supply?.retrievalFailed?'저장 국가 수급 · 재확인 실패':undefined};
}
type State={version:1;supply:Record<string,OilCountryEvidence[]>;weather:Record<string,OilWeatherEvidence>;checkedAt:string;lastAttemptAt:string;minimumTemperatureUpgradeAttempted?:boolean};
export class SoybeanOilOriginService {
 private pending:Promise<OriginRadarResponse>|null=null;
 constructor(private options:{file?:string;fetcher?:typeof fetch;now?:()=>Date;key?:()=>string}={}){}
 private file(){return this.options.file||path.join(process.env.RMS_ALL8_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'soybean-oil-origin-v2.json');}
 async get(force=false){if(this.pending)return this.pending;this.pending=this.load(force);try{return await this.pending;}finally{this.pending=null;}}
 private async load(force:boolean):Promise<OriginRadarResponse>{
 const now=this.options.now?.()||new Date(),fetcher=this.options.fetcher||fetch;let state:State={version:1,supply:{},weather:{},checkedAt:'',lastAttemptAt:''};
 try{const saved=JSON.parse(await fs.readFile(this.file(),'utf8'));if(saved.version!==1||!saved.supply||!saved.weather)throw Error('Invalid oil origin cache');state=saved;}catch(e){if((e as any).code!=='ENOENT')throw e;}
 const needsMinimumUpgrade=Object.values(state.weather).some(w=>w.daily.some(d=>d.minC===undefined));
 const age=now.getTime()-Date.parse(state.lastAttemptAt),retryFailed=Object.values(state.weather).some(w=>w.retrievalFailed||w.daily.some(d=>d.minC==null))||Object.values(state.supply).some(rows=>rows[0]?.retrievalFailed);
 if(force||needsMinimumUpgrade&&!state.minimumTemperatureUpgradeAttempted||!Number.isFinite(age)||age<0||age>(retryFailed?20*60000:3*3600000)){
 const key=this.options.key?.()??(process.env.USDA_FAS_API_KEY||process.env.USDA_API_KEY||'').trim();
 await Promise.all(OIL_ORIGIN_POINTS.map(async p=>{
 const previous=state.supply[p.country]||[];
 try{if(!key)throw Error('USDA key unavailable');const r=await fetcher(`https://api.fas.usda.gov/api/psd/commodity/4232000/country/${p.country}/year/${soybeanOilMarketingYear(now)}`,{headers:{Accept:'application/json',API_KEY:key,'x-api-key':key},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('USDA HTTP '+r.status);const parsed=parseOilOriginPsd(await r.json(),p,now);if(!parsed)throw Error('Invalid oil country identity/period/units');state.supply[p.country]=[parsed,...previous.filter(v=>v.period!==parsed.period&&validatedSupply(v,p,now))].slice(0,4);}
 catch{state.supply[p.country]=previous.map(v=>({...v,retrievalFailed:true}));}
 try{const evidence=await getOriginWeather({...p,label:p.region},{minimumTemperature:true,force,now,fetcher,cacheDir:this.options.file?path.join(path.dirname(this.options.file),'shared-weather'):undefined});const parsed=evidence?parseOilOriginWeather(evidence.rawResponse,p,new Date(evidence.checkedAt)):null;if(!parsed){delete state.weather[p.key];}else state.weather[p.key]={...parsed,...(evidence?.retrievalFailed?{retrievalFailed:true}:{})};}
 catch{if(state.weather[p.key])state.weather[p.key]={...state.weather[p.key],retrievalFailed:true};}
 }));state.minimumTemperatureUpgradeAttempted=true;state.checkedAt=now.toISOString();state.lastAttemptAt=state.checkedAt;
 await fs.mkdir(path.dirname(this.file()),{recursive:true});const temp=this.file()+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(state,null,2));await fs.rename(temp,this.file());
 }
 const origins=OIL_ORIGIN_POINTS.map(p=>{const rows=state.supply[p.country]||[];return buildOilOrigin(p,rows[0],state.weather[p.key],now,rows[1]);});
 return {success:true,statusCode:200,lastUpdated:state.checkedAt,origins,sourcesUsed:origins.map(o=>({origin:o.region,primarySource:o.primarySource,sourceOrg:o.sourceOrg,sourceReportDate:o.sourceReportDate,sourceUrl:o.sourceUrl,status:o.dataFreshness})),sourceFooterText:'USDA FAS PSD · Open-Meteo'};
 }
}
export const soybeanOilOriginService=new SoybeanOilOriginService();
