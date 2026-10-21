/**
 * Corn Origin Radar, freely retrieved NASA POWER daily weather at eight indicative
 * agricultural locations. NASA observations/reanalysis are gridded, not station
 * readings, national averages, crop yields or port operational assessments.
 * No Gemini requests, invented weather data, or fixed procurement risk labels.
 * The official WASDE origin service owns all country-level supply numbers.
 */
import fs from 'node:fs';
import {screenObservedWeather,validWeatherDay} from '../utils/originWeatherPills.ts';
import path from 'node:path';
import type { OriginRadarResponse, OriginItemDetail } from './originRadarService.ts';

export type CornCountry = 'usa'|'brazil'|'argentina'|'ukraine';
export type CornWeatherEvidence = {
  key:CornCountry; location:string; source:'NASA POWER'; checkedAt:string;
  version:2;lastDay:string;days:number;precip7mm:number|null;hotDays:number|null;
  rainfallDays:number;temperatureDays:number;observedRainMm:number|null;retrievalFailed?:boolean;lastAttemptAt?:string;
  daily:Array<{date:string;precipMm:number|null;tMaxC:number|null}>;sourceUrl:string;
};
export type CornWeatherCache = {version:2; checkedAt:string; points:CornWeatherEvidence[]};
type Point = {key:CornCountry; label:string; lat:number; lon:number};
export const CORN_WEATHER_POINTS:ReadonlyArray<Point> = [
  {key:'usa',label:'아이오와',lat:42.02,lon:-93.62},
  {key:'usa',label:'일리노이',lat:40.11,lon:-89.25},
  {key:'brazil',label:'마투그로수',lat:-13.50,lon:-56.10},
  {key:'brazil',label:'파라나',lat:-24.50,lon:-51.50},
  {key:'argentina',label:'코르도바',lat:-31.42,lon:-64.18},
  {key:'argentina',label:'산타페',lat:-31.60,lon:-60.70},
  {key:'ukraine',label:'폴타바',lat:49.59,lon:34.55},
  {key:'ukraine',label:'빈니차',lat:49.23,lon:28.47},
];
const POINTS=CORN_WEATHER_POINTS;
const DAY=86400000;
const CACHE_PATH=path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'corn-nasa-power-v2.json');
const MAX_FETCH_AGE=20*60*60*1000;
const FAILURE_RETRY=20*60*1000;
const MAX_EVIDENCE_AGE=8*DAY;
const iso=(d:Date)=>d.toISOString().slice(0,10);
const advance=(date:string,n:number)=>iso(new Date(Date.parse(date+'T00:00:00Z')+n*DAY));

const rainValue=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<500?v:null;
const heatValue=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=-65&&v<=65?v:null;
function aggregate(daily:CornWeatherEvidence['daily']){
  const rainfallDays=daily.filter(d=>d.precipMm!==null).length,temperatureDays=daily.filter(d=>d.tMaxC!==null).length;
  const observedRainMm=rainfallDays?Math.round(daily.reduce((n,d)=>n+(d.precipMm??0),0)*10)/10:null;
  return {days:daily.filter(d=>d.precipMm!==null&&d.tMaxC!==null).length,rainfallDays,temperatureDays,observedRainMm,
    precip7mm:rainfallDays===7?observedRainMm:null,hotDays:temperatureDays?daily.filter(d=>d.tMaxC!==null&&d.tMaxC>=35).length:null};
}
export function parseNasaCornWeather(body:unknown,point:Point,checkedAt:string):CornWeatherEvidence|null {
  const j=body as any,params=j?.properties?.parameter,coordinates=j?.geometry?.coordinates;
  if(!Number.isFinite(Date.parse(checkedAt))||j?.header?.time_standard!=='LST'||!Array.isArray(coordinates)||!coordinates.slice(0,2).every((n:any)=>typeof n==='number'&&Number.isFinite(n))||
    Math.abs(coordinates[0]-point.lon)>.6||Math.abs(coordinates[1]-point.lat)>.6)return null;
  const rain=j.parameters?.PRECTOTCORR?.units==='mm/day'?params?.PRECTOTCORR:null;
  const heat=j.parameters?.T2M_MAX?.units==='C'?params?.T2M_MAX:null;
  if(!rain&&!heat)return null;
  const today=iso(new Date(checkedAt));
  const dates=[...new Set([...Object.keys(rain||{}),...Object.keys(heat||{})])].filter(raw=>/^20\d{6}$/.test(raw)).map(raw=>raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8))
    .filter(day=>validWeatherDay(day)&&day<today&&day>=advance(today,-32)).sort();
  const last=dates.filter(day=>{const raw=day.replaceAll('-','');return rainValue(rain?.[raw])!==null||heatValue(heat?.[raw])!==null;}).at(-1);
  if(!last||Date.parse(today)-Date.parse(last)>MAX_EVIDENCE_AGE)return null;
  const daily=Array.from({length:7},(_,i)=>{const date=advance(last,i-6),raw=date.replaceAll('-','');return {date,precipMm:rainValue(rain?.[raw]),tMaxC:heatValue(heat?.[raw])};});
  return {version:2,key:point.key,location:point.label,source:'NASA POWER',sourceUrl:weatherUrl(point,Date.parse(checkedAt)),checkedAt,lastDay:last,daily,...aggregate(daily)};
}
function cacheRead():CornWeatherCache|null {
  try {
    const value=JSON.parse(fs.readFileSync(CACHE_PATH,'utf8'));
    return value?.version===2 && Array.isArray(value.points) && Number.isFinite(Date.parse(value.checkedAt))
      ? value as CornWeatherCache:null;
  } catch{return null;}
}
function cacheWrite(entry:CornWeatherCache):void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH),{recursive:true,mode:0o700});
    const tmp=CACHE_PATH+'.'+process.pid+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(entry,null,2),{mode:0o600});
    fs.renameSync(tmp,CACHE_PATH);
  }catch(error){console.warn('[Corn Weather] cache write failed:',String(error).slice(0,140));}
}
export function isRecentCornWeather(p:CornWeatherEvidence,now=Date.now()):boolean {
  const point=POINTS.find(x=>x.key===p?.key&&x.label===p.location);
  if(!point||p.version!==2||p.source!=='NASA POWER'||!Number.isFinite(Date.parse(p.checkedAt))||Date.parse(p.checkedAt)>now+60000||
    now-Date.parse(p.checkedAt)>=3*DAY||!validWeatherDay(p.lastDay)||Date.parse(p.lastDay)>now||now-Date.parse(p.lastDay)>=MAX_EVIDENCE_AGE||
    p.sourceUrl!==weatherUrl(point,Date.parse(p.checkedAt))||!Array.isArray(p.daily)||p.daily.length!==7)return false;
  if(p.daily.some((d,i)=>d.date!==advance(p.lastDay,i-6)||(d.precipMm!==null&&rainValue(d.precipMm)===null)||(d.tMaxC!==null&&heatValue(d.tMaxC)===null)))return false;
  const expected=aggregate(p.daily);
  return (expected.rainfallDays>0||expected.temperatureDays>0)&&Object.entries(expected).every(([k,v])=>p[k]===v);
}
function weatherUrl(p:Point,now:number):string {
  const end=iso(new Date(now-DAY));
  const start=advance(end,-29);
  const u=new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  for(const [key,v] of Object.entries({parameters:'PRECTOTCORR,T2M_MAX',community:'AG',
    longitude:String(p.lon),latitude:String(p.lat),start:start.replaceAll('-',''),end:end.replaceAll('-',''),format:'JSON','time-standard':'LST'})) u.searchParams.set(key,v);
  return u.toString();
}
async function fetchPoint(p:Point,now:number):Promise<{evidence:CornWeatherEvidence|null;failed:boolean}> {
  try {
    const res=await fetch(weatherUrl(p,now),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
    if(!res.ok) throw Error('HTTP '+res.status);
    return {evidence:parseNasaCornWeather(await res.json(),p,new Date(now).toISOString()),failed:false};
  }catch(error){
    console.warn('[Corn Weather] '+p.label+' unavailable:',String(error).slice(0,100));
    return {evidence:null,failed:true};
  }
}
const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1);
export function enrichCornWithEvidence(radar:OriginRadarResponse,points:CornWeatherEvidence[],now:number=Date.now()):OriginRadarResponse {
  const valid=[...new Map(points.filter(p=>isRecentCornWeather(p,now)).sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).map(p=>[p.key+':'+p.location,p])).values()];
  const origins=radar.origins.map(origin=>{
    const pair=valid.filter(p=>p.key===origin.originKey);
    const monitored=pair.some(p=>(p.observedRainMm!==null&&p.observedRainMm>=90)||(p.hotDays!==null&&p.hotDays>=3));
    const reportMonth = /^20\d\d-\d\d$/.test(origin.sourceReportDate) ? origin.sourceReportDate : '';
    const nowMonth = new Date(now).toISOString().slice(0,7);
    const reportAge = reportMonth ? (Number(nowMonth.slice(0,4))-Number(reportMonth.slice(0,4)))*12+Number(nowMonth.slice(5))-Number(reportMonth.slice(5)) : Infinity;
    const supplyVerified=origin.dataFreshness!=='unavailable' && reportAge>=0 && reportAge<=2 &&
      Number.isFinite(origin.productionNumericMMT) &&
      !!origin.exports && !!origin.endingStocks;
    // Serious observed weather signals are reported even when only one point is accessible.
    const status:OriginItemDetail['status']= monitored ? '모니터링'
      : supplyVerified && pair.length===2 && pair.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&!p.retrievalFailed)&&pair[0].lastDay===pair[1].lastDay ? '양호' : '자료 부족';
    const rainText=pair.length
      ? '기상(최근 확인 7일 강수, '+pair.map(p=>p.lastDay).sort().at(-1)+' 기준): '+
          pair.map(p=>`${p.location} ${p.observedRainMm!==null?fmt(p.observedRainMm)+'mm'+(p.rainfallDays<7?' ('+p.rainfallDays+'/7일)':''):'강수 미확인'}${p.temperatureDays<7?' · 기온 '+p.temperatureDays+'/7일 확인':''}${p.retrievalFailed?' · 저장 기상(재확인 실패)':''}`).join(' · ')+
          (pair.some(p=>p.hotDays>0) ? ' · 35°C 이상: '+pair.filter(p=>p.hotDays>0).map(p=>`${p.location} ${p.hotDays}일`).join(' · '):'')+
          (pair.length===1?' (1지점만 확인)':'')
      : '기상 자료 확인 중 (NASA POWER)';
    return {...origin,
      riskWeather:rainText,
      weatherSource:pair.length?'NASA POWER':undefined,
      weatherAsOf:pair.length?pair.map(p=>p.lastDay).sort().at(-1):undefined,
      // An incomplete weather feed must not hide a verified monthly export trend.
      sourcingInsight:origin.sourcingInsight || '수급 동향: USDA WASDE 공식 전망 참조',
      ...screenObservedWeather(pair.map(p=>({location:p.location,lastDay:p.lastDay,checkedAt:p.checkedAt,rainfallDays:p.rainfallDays,temperatureDays:p.temperatureDays,precipMm:p.observedRainMm,hotDays:p.hotDays,retrievalFailed:p.retrievalFailed})),
        {locations:POINTS.filter(p=>p.key===origin.originKey).map(p=>p.label),heatDays:3,rainMm:90,observationAgeDays:8},now),
      status,
      statusColor:status==='양호'?'green' as const:status==='모니터링'?'yellow' as const:'gray' as const,
      statusBasis:status==='양호'
        ? 'USDA 국가 수급 전망과 두 재배지역의 최근 NASA POWER 7일 강수·고온 스크리닝 결과. 항만·운임·통상위험의 안전 보증은 아닙니다.'
        : status==='모니터링'
          ? '대표 재배지역에서 7일 누적 강수 90mm 이상 또는 35°C 이상 고온 3일 이상을 관측했습니다. 농작물 피해 확정이 아닌 예비 신호입니다.'
          : '공식 수급 또는 최근 2개 재배지역의 기상 근거가 충분하지 않습니다. 확인된 값은 계속 표시합니다.',
    };
  });
  const withWeather=origins.some(o=>o.weatherSource==='NASA POWER');
  return {...radar,origins,
    sourceFooterText:radar.sourceFooterText+(withWeather?' · NASA POWER(기상)':''),
  };
}

export class CornOriginConditionsService {
  private pending:Promise<CornWeatherEvidence[]>|null=null;
  private checkedAt=0;
  private last: CornWeatherEvidence[]=[];
  async getEvidence(force=false):Promise<CornWeatherEvidence[]> {
    const now=Date.now();
    if (!this.last.length) {
      const stored=cacheRead();
      if(stored && now-Date.parse(stored.checkedAt)<3*DAY) this.last=stored.points.filter(p=>isRecentCornWeather(p,now));
      if(stored && this.last.length) this.checkedAt=Date.parse(stored.checkedAt);
    }
    const interval=this.last.length===POINTS.length&&this.last.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&!p.retrievalFailed)?MAX_FETCH_AGE:FAILURE_RETRY;
    if(!force && this.checkedAt && now-this.checkedAt<interval) return this.last.filter(p=>isRecentCornWeather(p,now));
    if(this.pending) return this.pending;
    this.pending=(async()=>{
      const responses=await Promise.all(POINTS.map(point=>fetchPoint(point,now)));
      const known=new Map(this.last.filter(p=>isRecentCornWeather(p,now)).map(p=>[p.key+':'+p.location,p]));
      responses.forEach(({evidence,failed},i)=>{
        const p=POINTS[i],key=p.key+':'+p.label;
        if(evidence)known.set(key,evidence);
        else if(failed&&known.has(key))known.set(key,{...known.get(key)!,retrievalFailed:true,lastAttemptAt:new Date(now).toISOString()});
        else known.delete(key);
      });
      const result=[...known.values()];this.last=result;this.checkedAt=now;
      cacheWrite({version:2,checkedAt:new Date(now).toISOString(),points:result});
      return result;
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
  async enrich(radar:OriginRadarResponse,force=false):Promise<OriginRadarResponse> {
    const points=await this.getEvidence(force);
    return enrichCornWithEvidence(radar,points);
  }
}
export const cornOriginConditionsService=new CornOriginConditionsService();
