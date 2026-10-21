/**
 * Wheat-only Origin Radar screening based on Open-Meteo daily modeled weather.
 * Reuses the same Open-Meteo forecast API family already used elsewhere in RMS.
 * Two representative wheat-growing points per origin are sampled once per KST weekday.
 * This is NOT a national crop condition, shipping, or trade-policy risk assessment.
 * No Gemini SDK, paid Gemini requests, or invented weather fallback data.
 * Open-Meteo free API requires non-commercial use; obtain a commercial license for
 * use within a company. See https://open-meteo.com/en/pricing .
 */
import fs from 'node:fs';
import {screenObservedWeather,validWeatherDay} from '../utils/originWeatherPills.ts';
import path from 'node:path';
import type { OriginRadarResponse, OriginItemDetail } from './originRadarService.ts';
import { wheatOriginSupplyTrendService } from './wheatOriginSupplyTrendService.ts';

type Key = OriginItemDetail['originKey'];
type Source = 'Open-Meteo';
export type PointEvidence = {
  key: Key;
  location: string;
  checkedAt: string;
  mostRecentDay: string;
  days: number;
  precipLast7Mm: number;
  hotDays: number;
  source: Source;
  retrievalFailed?:boolean;lastAttemptAt?:string;
  status: 'monitor' | 'no-signal';
};
export type RiskCache = {
  version: 3;
  checkedDay: string;
  evidence: Partial<Record<Key, PointEvidence[]>>;
};

type Point = { key: Key; label: string; lat: number; lon: number };
const POINTS: ReadonlyArray<Point> = [
  { key:'usa', label:'캔자스(HRW)', lat:38.5, lon:-98.3 },
  { key:'usa', label:'일리노이 남부(SRW)', lat:38.35, lon:-89.4 },
  { key:'australia', label:'서호주', lat:-32.0, lon:117.2 },
  { key:'australia', label:'뉴사우스웨일스', lat:-33.3, lon:147.4 },
  { key:'canada', label:'서스캐처원', lat:51.5, lon:-106.5 },
  { key:'canada', label:'앨버타', lat:51.9, lon:-112.1 },
  { key:'eu', label:'프랑스 보스', lat:48.2, lon:1.5 },
  { key:'eu', label:'독일 작센안할트', lat:52.0, lon:11.0 },
  { key:'russia', label:'크라스노다르', lat:45.1, lon:39.0 },
  { key:'russia', label:'로스토프', lat:47.2, lon:39.7 },
];
const CACHE_DIR = process.env.RMS_ORIGIN_CACHE_DIR || path.join(process.cwd(), '.rms-origin-verified');
const CACHE_FILE = path.join(CACHE_DIR, 'wheat-openmeteo-risk-v3.json');
const REQUEST_TIMEOUT_MS = 8500;
const MS_DAY = 86400000;

function todayKst(now:Date=new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function dayShift(day:string,delta:number):string {
  return new Date(Date.parse(`${day}T12:00:00Z`)+delta*MS_DAY).toISOString().slice(0,10);
}
function validRain(v:unknown):v is number { return typeof v==='number' && Number.isFinite(v) && v>=0 && v<500; }
function validTemp(v:unknown):v is number { return typeof v==='number' && Number.isFinite(v) && v>=-65 && v<=65; }

/** Only accept dated past daily arrays, never forecast rows or fabricated zeros. */
export function parseOpenMeteoEvidence(body:unknown,key:Key,location:string,checkedAt:string):PointEvidence|null {
  if (!body || typeof body!=='object') return null;
  const d=(body as any).daily;
  if (!Array.isArray(d?.time) || !Array.isArray(d?.precipitation_sum) || !Array.isArray(d?.temperature_2m_max)) return null;
  const today=todayKst(new Date(checkedAt));
  const cutoff=dayShift(today,-11);
  const rows=d.time.map((day:unknown,index:number)=>({
    day, rain:d.precipitation_sum[index], high:d.temperature_2m_max[index],
  })).filter((row:{day:unknown;rain:unknown;high:unknown})=>
    validWeatherDay(row.day) &&
    row.day<today && row.day>=cutoff && validRain(row.rain) && validTemp(row.high)
  ).sort((a:{day:string},b:{day:string})=>a.day.localeCompare(b.day));
  const unique=new Map<string,{day:string;rain:number;high:number}>();
  for(const row of rows) unique.set(row.day,row);
  const dates=Array.from(unique.values());
  const mostRecent=dates.at(-1)?.day;
  if(!mostRecent || mostRecent<dayShift(today,-4)) return null;
  const recent=dates.filter(row=>row.day>=dayShift(mostRecent,-6));
  if(recent.length<5) return null;
  const total=recent.reduce((sum,row)=>sum+row.rain,0);
  const hotDays=recent.filter(row=>row.high>=35).length;
  if(total>2000 || hotDays>7) return null;
  // Screening thresholds, not a scientifically validated crop damage estimate.
  const status=total>=90 || hotDays>=3 ? 'monitor':'no-signal';
  return {key,location,checkedAt,mostRecentDay:mostRecent,days:recent.length,
    precipLast7Mm:Math.round(total*10)/10,hotDays,source:'Open-Meteo',status};
}

function loadCache():RiskCache|null {
  try {
    const value=JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
    return value?.version===3 && typeof value.checkedDay==='string' &&
      value.evidence && typeof value.evidence==='object' ? value as RiskCache : null;
  } catch{return null;}
}
function saveCache(data:RiskCache):void {
  try {
    fs.mkdirSync(CACHE_DIR,{recursive:true,mode:0o700});
    const tmp=`${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});
    fs.renameSync(tmp,CACHE_FILE);
  }catch(err){ console.warn('[Wheat Risk] Could not save Open-Meteo evidence:',String(err)); }
}
function makeUrl(point:Point):string {
  const commercialKey=(process.env.RMS_OPEN_METEO_API_KEY||'').trim();
  const host=commercialKey?'https://customer-api.open-meteo.com':'https://api.open-meteo.com';
  const url=new URL('/v1/forecast',host);
  url.searchParams.set('latitude',String(point.lat));
  url.searchParams.set('longitude',String(point.lon));
  url.searchParams.set('daily','precipitation_sum,temperature_2m_max');
  url.searchParams.set('past_days','8');
  url.searchParams.set('forecast_days','1');
  url.searchParams.set('timezone','auto');
  if(commercialKey) url.searchParams.set('apikey',commercialKey);
  return url.toString();
}
async function fetchPoint(point:Point,now:string):Promise<PointEvidence|null> {
  try {
    const response=await fetch(makeUrl(point),{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if(!response.ok) return null;
    return parseOpenMeteoEvidence(await response.json(),point.key,point.label,now);
  }catch(err){
    console.warn('[Wheat Risk] Open-Meteo unavailable for',point.key,point.label,String(err).slice(0,100));
    return null;
  }
}
function recentEnough(point:PointEvidence):boolean {
  return point?.source==='Open-Meteo' &&
    Date.now()-Date.parse(point.checkedAt)<3*MS_DAY &&
    Date.now()-Date.parse(`${point.mostRecentDay}T00:00:00Z`)<7*MS_DAY;
}
// Display every independently verified location, rather than a min–max range.
// A zero day-count for extreme heat is deliberately omitted for readability.
// Heat-day counts remain in the verified evidence and screening logic.
const rainfallText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}mm`;

export function formatWheatWeatherSummary(_key: Key, points: PointEvidence[]): string {
  if (!points.length) return '기상 자료 확인 중';
  const cleanPoints = points.filter(point =>
    point.source === 'Open-Meteo' &&
    Number.isFinite(point.precipLast7Mm) && point.precipLast7Mm >= 0 &&
    Number.isInteger(point.hotDays) && point.hotDays >= 0 && point.hotDays <= 7 &&
    Boolean(point.location?.trim())
  );
  if (!cleanPoints.length) return '기상 자료 확인 중';

  // Values are per-location 7-day totals, not national averages.
  const rainfall = cleanPoints.map(point => `${point.location} ${rainfallText(point.precipLast7Mm)}${point.days<7?' ('+point.days+'/7일)':''}${point.retrievalFailed?' · 저장 기상(재확인 실패)':''}`).join(' · ');
  const heated = cleanPoints.filter(point => point.hotDays > 0);
  const heatSummary = heated.length
    ? ` · 35°C 이상: ${heated.map(point => `${point.location} ${point.hotDays}일`).join(' · ')}`
    : '';
  const sampled = cleanPoints.length === 1 ? ' (1지점만 확인)' : '';
  return `기상(최근 7일 강수): ${rainfall}${heatSummary}${sampled}`;
}

/** Risk status for monitored indicators ONLY, not all-country logistics clearance.
 * Essential coverage: official supply figures + two recent growing-location samples.
 * A verified warning is visible even when other coverage is incomplete.
 * Thresholds below are screening heuristics, not crop-yield predictions.
 */
export type WheatScreenStatus = '양호' | '모니터링' | '주의' | '자료 부족';
export type WheatScreenInput = {
  sourceReportDate: string;
  dataFreshness: 'live' | 'cached' | 'unavailable' | string;
  production: string;
  exports: string;
  endingStocks: string;
  points: PointEvidence[];
  exportYoYPct?: number;
  externalWatch?: boolean;
};
export function classifyWheatScreen(input: WheatScreenInput, today: string = todayKst()): WheatScreenStatus {
  const validPoints = input.points.filter(recentEnough);
  const weatherSignal = validPoints.some(p => p.status === 'monitor');
  const seriousExportDecline = Number.isFinite(input.exportYoYPct) &&
    (input.exportYoYPct as number) <= -15; // Latest official prior-year PSD row (up to 2 months older), with visible vintage disclosure.
  if (weatherSignal || seriousExportDecline || input.externalWatch) return '모니터링';

  const published = /^(\d{4})-(\d{2})$/.exec(input.sourceReportDate || '');
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(today) && published !== null;
  const age = dateValid ?
    (Number(today.slice(0, 4)) - Number(published![1])) * 12 +
    Number(today.slice(5, 7)) - Number(published![2]) : Infinity;
  const supplyVerified = input.dataFreshness !== 'unavailable' &&
    age >= 0 && age <= 2 &&
    /^\d+(?:\.\d+)?M MT$/.test(input.production) &&
    /\d+(?:\.\d+)?M MT$/.test(input.exports) &&
    /\d+(?:\.\d+)?M MT$/.test(input.endingStocks);
  if (!supplyVerified || validPoints.length < 2) return '자료 부족';
  // This badge means only that the monitored supply/weather indicators show no alert.
  // We do NOT assert all ports, freight lanes and trade policies are safe.
  return '양호';
}

export class WheatOriginRiskService {
  private running:Promise<RiskCache>|null=null;
  private previous:RiskCache|null=null;

  private async getRiskData():Promise<RiskCache> {
    const today=todayKst();
    if(this.previous?.checkedDay===today) return this.previous;
    const stored=loadCache();
    if(stored?.checkedDay===today){this.previous=stored;return stored;}
    const weekday=new Date(`${today}T03:00:00Z`).getUTCDay();
    if(weekday===0 || weekday===6){
      this.previous={version:3,checkedDay:today,evidence:stored?.evidence||{}};
      return this.previous;
    }
    if(this.running) return this.running;
    this.running=(async()=>{
      const now=new Date().toISOString();
      const hits=await Promise.all(POINTS.map(p=>fetchPoint(p,now)));
      const evidence:RiskCache['evidence']={};
      for (const hit of hits){
        if(hit){(evidence[hit.key] ||= []).push(hit);}
      }
      // Preserve previously verified recent rows when the API temporarily fails.
      for(const key of ['usa','australia','canada','eu','russia'] as Key[]){
        if(!evidence[key]?.length && stored?.evidence[key]){
          const prior=stored.evidence[key]!.filter(recentEnough);
          if(prior.length) evidence[key]=prior.map(p=>({...p,retrievalFailed:true,lastAttemptAt:now}));
        }
      }
      const result:RiskCache={version:3,checkedDay:today,evidence};
      saveCache(result);
      this.previous=result;
      return result;
    })();
    try{return await this.running;} finally{this.running=null;}
  }

  async enrich(input:OriginRadarResponse):Promise<OriginRadarResponse> {
    const risk=await this.getRiskData();
    const origins=input.origins.map(origin=>{
      const points=(risk.evidence[origin.originKey]||[]).filter(recentEnough);
      const short=points.length
        ? formatWheatWeatherSummary(origin.originKey,points)
        : '기상 자료 확인 중';
      return {...origin,
        // Interim value; the final screening is determined after official export and optional US freight evidence.
        status:'자료 부족' as const,
        statusColor:'gray' as const,
        riskWeather:short,
        weatherSource:points.length?'Open-Meteo':undefined,
        weatherAsOf:points.length?points.map(p=>p.mostRecentDay).sort().at(-1):undefined,
        riskAssessment:'',
      };
    });
    // Cross-check the prior-year supply trend without fabricating missing rows.
    const supply = await wheatOriginSupplyTrendService.enrich({...input, origins});
    // Deliberately limited to supply + weather. Optional international freight/policy monitoring is not enabled.
    return {...supply,origins:supply.origins.map(origin=>{
      const points=(risk.evidence[origin.originKey]||[]).filter(recentEnough);
      const status=classifyWheatScreen({
        sourceReportDate:origin.sourceReportDate,
        dataFreshness:origin.dataFreshness,
        production:origin.production,
        exports:origin.exports,
        endingStocks:origin.endingStocks,
        points,
        exportYoYPct:origin.exportYoYPct,
      });
      return {...origin,
        ...screenObservedWeather(points.map(p=>({location:p.location,lastDay:p.mostRecentDay,checkedAt:p.checkedAt,rainfallDays:p.days,temperatureDays:p.days,precipMm:p.precipLast7Mm,hotDays:p.hotDays,retrievalFailed:p.retrievalFailed})),
          {locations:POINTS.filter(p=>p.key===origin.originKey).map(p=>p.label),heatDays:3,rainMm:90,observationAgeDays:7}),
        status,
        statusColor:status==='양호'?'green' as const:status==='모니터링'?'yellow' as const:
          status==='주의'?'red' as const:'gray' as const,
        statusBasis:status==='양호'
          ? '공식 USDA 수급 자료와 2개 밀 재배지역의 최근 기상 지표 기준. 항만 운영과 모든 통상 위험이 안전하다는 뜻은 아닙니다.'
          : status==='자료 부족'
            ? '필수 공식 수급 자료 또는 최신 기상 관측지점 정보가 부족합니다.'
            : 'USDA 수출 전망 비교 또는 밀 재배지역의 최근 기상 지표에 모니터링 신호가 있습니다. 전년 비교는 수정월이 다를 수 있습니다.',
      };
    })};
  }
}
export const wheatOriginRiskService=new WheatOriginRiskService();
