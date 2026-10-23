import {getOriginWeather,enrichSharedOriginWeather,type SharedWeatherEvidence} from './originWeatherService.ts';
/** Soybean-only NASA POWER screening. Country PSD totals and point-level reanalysis comparison
 * weather remain separate. Primary radar weather uses the shared Open-Meteo adapter. No crop damage, soil moisture or phenology is inferred. */
import fs from 'node:fs';
import {screenObservedWeather} from '../utils/originWeatherPills.ts';
import path from 'node:path';
import type { OriginRadarResponse, OriginItemDetail } from './originRadarService.ts';

export type SoybeanCountry='usa'|'brazil'|'argentina'|'paraguay';
type Point={key:SoybeanCountry;label:string;lat:number;lon:number};
type DailyWeather={date:string;precipMm:number|null;tMaxC:number|null};
export type SoybeanWeatherEvidence={
  version:2;key:SoybeanCountry;location:string;source:'NASA POWER';sourceUrl:string;checkedAt:string;
  lastDay:string;retrievalFailed?:boolean;lastAttemptAt?:string;days:number;rainfallDays:number;temperatureDays:number;
  precip7mm:number|null;observedRainMm:number|null;hotDays:number|null;daily:DailyWeather[];
};
export type SoybeanWeatherCache={version:2;checkedAt:string;points:SoybeanWeatherEvidence[]};
export const SOYBEAN_WEATHER_POINTS:ReadonlyArray<Point>=[
  {key:'usa',label:'아이오와',lat:42.02,lon:-93.62},
  {key:'usa',label:'일리노이',lat:40.11,lon:-89.25},
  {key:'brazil',label:'마투그로수',lat:-13.50,lon:-56.10},
  {key:'brazil',label:'파라나',lat:-24.50,lon:-51.50},
  {key:'argentina',label:'코르도바',lat:-31.42,lon:-64.18},
  {key:'argentina',label:'산타페',lat:-31.60,lon:-60.70},
  {key:'paraguay',label:'알토파라나',lat:-25.53,lon:-54.63},
  {key:'paraguay',label:'이타푸아',lat:-26.89,lon:-55.67},
];
/** Soybean flowering guidance discusses heat above 90–95 F. The three-day
 * persistence rule below is an RMS monitoring policy, NOT a validated damage
 * threshold. Without crop stage/soil moisture, rainfall alone is not a risk test.
 * https://soybeanresearchinfo.com/wp-content/uploads/2022/01/Science-for-Success-Soybean-Growth-Stages-V2-220106.pdf
 * https://extension.umn.edu/agriculture/crop-production/soybean/flooded-soybean
 */
export const SOYBEAN_HEAT_SCREEN={temperatureC:35,minObservedDays:3} as const;
const DAY=86400000,MAX_FETCH_AGE=20*3600000,FAILURE_RETRY=20*60000,MAX_EVIDENCE_AGE=8*DAY;
// Keep the lossy legacy v1 aggregate cache intact; it cannot establish missing-value safety.
const CACHE_PATH=path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'soybean-nasa-power-comparison-v3.json');
const iso=(date:Date)=>date.toISOString().slice(0,10);
const advance=(date:string,n:number)=>iso(new Date(Date.parse(date+'T00:00:00Z')+n*DAY));
const validDay=(date:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&iso(new Date(date))===date;
const rainValue=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<500?v:null;
const heatValue=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=-65&&v<=65?v:null;
export function soybeanWeatherUrl(p:Point,now:number):string {
  const end=iso(new Date(now+Math.round(p.lon/15)*3600000-DAY)),start=advance(end,-29);
  const u=new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  u.search=new URLSearchParams({parameters:'PRECTOTCORR,T2M_MAX',community:'AG',longitude:String(p.lon),latitude:String(p.lat),start:start.replaceAll('-',''),end:end.replaceAll('-',''),format:'JSON','time-standard':'LST'}).toString();
  return u.toString();
}
function aggregate(daily:DailyWeather[]) {
  const rainfallDays=daily.filter(d=>d.precipMm!==null).length,temperatureDays=daily.filter(d=>d.tMaxC!==null).length;
  const observedRainMm=rainfallDays?Math.round(daily.reduce((sum,d)=>sum+(d.precipMm??0),0)*10)/10:null;
  return {days:daily.filter(d=>d.precipMm!==null&&d.tMaxC!==null).length,rainfallDays,temperatureDays,
    observedRainMm,precip7mm:rainfallDays===7?observedRainMm:null,
    hotDays:temperatureDays?daily.filter(d=>d.tMaxC!==null&&d.tMaxC>=SOYBEAN_HEAT_SCREEN.temperatureC).length:null};
}
export function parseNasaSoybeanWeather(body:unknown,point:Point,checkedAt:string):SoybeanWeatherEvidence|null {
  if(!body||typeof body!=='object'||!Number.isFinite(Date.parse(checkedAt)))return null;
  const j=body as any,params=j.properties?.parameter,coordinates=j.geometry?.coordinates;
  if(!SOYBEAN_WEATHER_POINTS.some(p=>p.key===point.key&&p.label===point.label&&p.lat===point.lat&&p.lon===point.lon)||
    !Array.isArray(coordinates)||!Number.isFinite(coordinates[0])||!Number.isFinite(coordinates[1])||Math.abs(coordinates[0]-point.lon)>.01||Math.abs(coordinates[1]-point.lat)>.01||
    j.header?.time_standard!=='LST')return null;
  const rain=j.parameters?.PRECTOTCORR?.units==='mm/day'?params?.PRECTOTCORR:null;
  const heat=j.parameters?.T2M_MAX?.units==='C'?params?.T2M_MAX:null;
  if(!rain&&!heat)return null;
  const today=iso(new Date(Date.parse(checkedAt)+Math.round(point.lon/15)*3600000));
  const last=advance(today,-1);
  // Exact seven completed LST days; provider latency remains missing, never an older replacement week.
  const daily=Array.from({length:7},(_,i)=>{const date=advance(last,i-6),raw=date.replaceAll('-','');
    return {date,precipMm:rainValue(rain?.[raw]),tMaxC:heatValue(heat?.[raw])};});
  if(daily.every(d=>d.precipMm===null&&d.tMaxC===null))return null;
  return {version:2,key:point.key,location:point.label,source:'NASA POWER',sourceUrl:soybeanWeatherUrl(point,Date.parse(checkedAt)),checkedAt,lastDay:last,daily,...aggregate(daily)};
}
export function isRecentSoybeanWeather(p:SoybeanWeatherEvidence,now=Date.now()):boolean {
  if(p?.version!==2||p.source!=='NASA POWER'||!Number.isFinite(Date.parse(p.checkedAt))||
    now-Date.parse(p.checkedAt)<-60000||now-Date.parse(p.checkedAt)>=3*DAY||!validDay(p.lastDay)||
    now-Date.parse(p.lastDay+'T00:00:00Z')<0||now-Date.parse(p.lastDay+'T00:00:00Z')>=MAX_EVIDENCE_AGE||
    !SOYBEAN_WEATHER_POINTS.some(x=>x.key===p.key&&x.label===p.location)||!Array.isArray(p.daily)||p.daily.length!==7)return false;
  const point=SOYBEAN_WEATHER_POINTS.find(x=>x.key===p.key&&x.label===p.location)!;
  if(p.sourceUrl!==soybeanWeatherUrl(point,Date.parse(p.checkedAt)))return false;
  if(p.daily.some((d,i)=>d.date!==advance(p.lastDay,i-6)||(d.precipMm!==null&&rainValue(d.precipMm)===null)||(d.tMaxC!==null&&heatValue(d.tMaxC)===null)))return false;
  const expected=aggregate(p.daily);
  return (expected.rainfallDays>0||expected.temperatureDays>0)&&Object.entries(expected).every(([k,v])=>p[k]===v);
}
function cacheRead():SoybeanWeatherCache|null {try{const s=JSON.parse(fs.readFileSync(CACHE_PATH,'utf8'));return s?.version===2&&Array.isArray(s.points)&&Number.isFinite(Date.parse(s.checkedAt))?s:null;}catch{return null;}}
function cacheWrite(entry:SoybeanWeatherCache){try{fs.mkdirSync(path.dirname(CACHE_PATH),{recursive:true,mode:0o700});const tmp=CACHE_PATH+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(entry,null,2),{mode:0o600});fs.renameSync(tmp,CACHE_PATH);}catch(e){console.warn('[Soybean Weather] cache write failed:',String(e).slice(0,140));}}
async function fetchPoint(point:Point,now:number):Promise<{evidence:SoybeanWeatherEvidence|null;failed:boolean}> {
  try{const res=await fetch(soybeanWeatherUrl(point,now),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});if(!res.ok)throw Error('HTTP '+res.status);return {evidence:parseNasaSoybeanWeather(await res.json(),point,new Date(now).toISOString()),failed:false};}
  catch(e){console.warn('[Soybean Weather] '+point.label+' unavailable:',String(e).slice(0,100));return {evidence:null,failed:true};}
}
const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1);
export function enrichSoybeanWithEvidence(radar:OriginRadarResponse,points:SoybeanWeatherEvidence[],now=Date.now()):OriginRadarResponse {
  const valid=[...new Map(points.filter(p=>isRecentSoybeanWeather(p,now)).sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).map(p=>[p.key+':'+p.location,p])).values()];
  const origins=radar.origins.map(origin=>{
    const pair=valid.filter(p=>p.key===origin.originKey),monitored=pair.some(p=>p.hotDays!==null&&p.hotDays>=SOYBEAN_HEAT_SCREEN.minObservedDays);
    const month=origin.sourceReportDate||'',n=new Date(now),reportAge=/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)?(n.getUTCFullYear()-Number(month.slice(0,4)))*12+n.getUTCMonth()+1-Number(month.slice(5)):Infinity;
    const supplyVerified=origin.dataFreshness!=='unavailable'&&reportAge>=0&&reportAge<=2&&Number.isFinite(origin.productionNumericMMT)&&origin.productionNumericMMT!>0&&!!origin.exports&&!!origin.endingStocks;
    const complete=pair.length===2&&pair.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&!p.retrievalFailed)&&pair[0].lastDay===pair[1].lastDay;
    const status:OriginItemDetail['status']=monitored?'모니터링':supplyVerified&&complete?'양호':'자료 부족';
    const descriptions=pair.map(p=>`${p.location} ${p.precip7mm!==null?fmt(p.precip7mm)+'mm':p.rainfallDays?`강수 ${p.rainfallDays}/7일 확인`:'강수 미확인'}`+
      (p.hotDays!==null&&p.hotDays>0?` · 35°C 이상 ${p.hotDays}일`:'')+(p.temperatureDays<7?` · 기온 ${p.temperatureDays}/7일 확인`:'')+(p.retrievalFailed?' · 저장 기상(재확인 실패)':''));
    const periods=pair.map(p=>`${p.location} ${p.daily[0].date}~${p.lastDay} (LST), 확인 ${p.checkedAt}`).join('; ');
    const basis=status==='모니터링'?'35°C 이상 일최고기온이 확인된 3일 이상인 지점의 반복 고온 점검 신호입니다. 3일은 RMS 선별 기준이며 대두 생육단계·토양수분·피해는 확인되지 않았습니다.':status==='양호'?'두 지점의 같은 7일 강수·일최고기온과 국가 수급 자료가 확인되었으며 반복 고온 신호가 없습니다. 강수량만으로 가뭄·침수나 작황을 판정하지 않습니다. 생육단계·토양수분·피해는 미확인입니다.':'국가 수급 또는 같은 기간 두 지점의 7일 강수·일최고기온 자료가 부족합니다. 누락값을 0으로 대체하지 않습니다.';
    return {...origin,...screenObservedWeather(pair.map(p=>({location:p.location,lastDay:p.lastDay,checkedAt:p.checkedAt,rainfallDays:p.rainfallDays,temperatureDays:p.temperatureDays,precipMm:p.precip7mm,hotDays:p.hotDays,retrievalFailed:p.retrievalFailed})),
      {locations:SOYBEAN_WEATHER_POINTS.filter(p=>p.key===origin.originKey).map(p=>p.label),heatDays:SOYBEAN_HEAT_SCREEN.minObservedDays,observationAgeDays:8},now),status,statusColor:status==='양호'?'green' as const:status==='모니터링'?'yellow' as const:'gray' as const,
      riskWeather:pair.length?'기상(최근 7일): '+descriptions.join(' · ')+(!complete?' · 일부 기상 자료 부족':''):'기상 자료 미확인 (NASA POWER)',
      weatherSource:pair.length?'NASA POWER':undefined,weatherAsOf:pair.length?pair.map(p=>p.lastDay).sort()[0]:undefined,
      statusBasis:basis+(periods?' '+periods:''),sourcingInsight:origin.sourcingInsight||'USDA 국가 전망 · NASA POWER 대표 지점 관측',
    };
  });
  return {...radar,origins,sourceFooterText:[...new Set([radar.sourceFooterText,...(origins.some(o=>o.weatherSource==='NASA POWER')?['NASA POWER']:[])].filter(Boolean))].join(' · ')};
}
export class NasaSoybeanComparisonService {
  private pending:Promise<SoybeanWeatherEvidence[]>|null=null;
  private checkedAt=0;
  private last:SoybeanWeatherEvidence[]=[];
  async getEvidence(force=false):Promise<SoybeanWeatherEvidence[]> {
    const now=Date.now();
    if(!this.last.length){const stored=cacheRead();if(stored&&now-Date.parse(stored.checkedAt)<3*DAY){this.last=stored.points.filter(p=>isRecentSoybeanWeather(p,now));if(this.last.length)this.checkedAt=Date.parse(stored.checkedAt);}}
    const complete=this.last.length===SOYBEAN_WEATHER_POINTS.length&&this.last.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&!p.retrievalFailed);
    if(!force&&this.checkedAt&&now-this.checkedAt<(complete?MAX_FETCH_AGE:FAILURE_RETRY))return this.last.filter(p=>isRecentSoybeanWeather(p,now));
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      const responses=await Promise.all(SOYBEAN_WEATHER_POINTS.map(p=>fetchPoint(p,now)));
      // Transport outages may retain dated, recent verified evidence. A successful
      // partial observation replaces its location rather than hiding new missing data.
      const known=new Map(this.last.filter(p=>isRecentSoybeanWeather(p,now)).map(p=>[p.key+':'+p.location,p]));
      for(let i=0;i<responses.length;i++){const {evidence,failed}=responses[i],point=SOYBEAN_WEATHER_POINTS[i],key=point.key+':'+point.label;
        if(evidence)known.set(key,evidence);
        else if(failed&&known.has(key))known.set(key,{...known.get(key)!,retrievalFailed:true,lastAttemptAt:new Date(now).toISOString()});
        else known.delete(key);
      }
      const result=[...known.values()];this.last=result;this.checkedAt=now;
      cacheWrite({version:2,checkedAt:new Date(now).toISOString(),points:result});return result;
    })();try{return await this.pending;}finally{this.pending=null;}
  }
  async enrich(radar:OriginRadarResponse,force=false):Promise<OriginRadarResponse>{return enrichSoybeanWithEvidence(radar,await this.getEvidence(force));}
}
export class SoybeanOriginConditionsService {
 async getEvidence(force=false,savedOnly=false):Promise<SharedWeatherEvidence[]> {return (await Promise.all(SOYBEAN_WEATHER_POINTS.map(p=>getOriginWeather(p,{historyDays:28,force,savedOnly,minimumTemperature:true})))).filter((p):p is SharedWeatherEvidence=>!!p);}
 async enrich(radar:OriginRadarResponse,force=false,savedOnly=false):Promise<OriginRadarResponse>{return enrichSharedOriginWeather(radar,await this.getEvidence(force,savedOnly),SOYBEAN_WEATHER_POINTS,{heatDays:SOYBEAN_HEAT_SCREEN.minObservedDays});}
}
export const soybeanOriginConditionsService=new SoybeanOriginConditionsService();
