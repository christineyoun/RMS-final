import {getOriginWeather,parseSharedOpenMeteo,currentSharedWeather,sharedWeatherScreen,sharedWeatherSummary,type SharedWeatherEvidence} from './originWeatherService.ts';
/**
 * Wheat Origin Radar screening using the shared adapter based on Open-Meteo daily modeled weather.
 * Reuses the same Open-Meteo forecast API family already used elsewhere in RMS.
 * Two representative wheat-growing points per origin; shared local-day cache and validation.
 * This is NOT a national crop condition, shipping, or trade-policy risk assessment.
 * No Gemini SDK, paid Gemini requests, or invented weather fallback data.
 * Open-Meteo free API requires non-commercial use; obtain a commercial license for
 * use within a company. See https://open-meteo.com/en/pricing .
 */
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
  shared?:SharedWeatherEvidence;
  retrievalFailed?:boolean;lastAttemptAt?:string;
  status: 'monitor' | 'no-signal';
};
export type RiskCache = {
  version: 3;
  checkedDay: string;
  evidence: Partial<Record<Key, PointEvidence[]>>;
};

type Point = { key: Key; label: string; lat: number; lon: number };
export const WHEAT_WEATHER_POINTS: ReadonlyArray<Point> = [
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
const POINTS=WHEAT_WEATHER_POINTS;

function todayKst(now:Date=new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Only accept dated past daily arrays, never forecast rows or fabricated zeros. */
export function parseOpenMeteoEvidence(body:unknown,key:Key,location:string,checkedAt:string):PointEvidence|null {
  const point=POINTS.find(p=>p.key===key&&p.label===location);if(!point)return null;
  const shared=parseSharedOpenMeteo(body,point,checkedAt);return shared?asWheatPoint(shared):null;
}
function asWheatPoint(shared:SharedWeatherEvidence):PointEvidence {return {key:shared.key as Key,location:shared.location,checkedAt:shared.checkedAt,mostRecentDay:shared.lastDay,days:Math.min(shared.rainfallDays,shared.temperatureDays),precipLast7Mm:shared.precip7mm??NaN,hotDays:shared.hotDays??0,source:'Open-Meteo',retrievalFailed:shared.retrievalFailed,status:(shared.precip7mm!==null&&shared.precip7mm>=90)||(shared.hotDays!==null&&shared.hotDays>=3)?'monitor':'no-signal',shared};}

function recentEnough(p:PointEvidence):boolean {const point=POINTS.find(c=>c.key===p.key&&c.label===p.location);return !!p.shared&&!!point&&currentSharedWeather(p.shared,point);}
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
  if (!supplyVerified || validPoints.length < 2 || validPoints.some(p=>p.days!==7||p.retrievalFailed)) return '자료 부족';
  // This badge means only that the monitored supply/weather indicators show no alert.
  // We do NOT assert all ports, freight lanes and trade policies are safe.
  return '양호';
}

export class WheatOriginRiskService {
  private async getRiskData(savedOnly=false,force=false):Promise<RiskCache> {
   const hits=await Promise.all(POINTS.map(p=>getOriginWeather(p,{historyDays:28,minimumTemperature:true,savedOnly,force})));
   const evidence:RiskCache['evidence']={};for(const hit of hits)if(hit)(evidence[hit.key as Key]||=[]).push(asWheatPoint(hit));
   return {version:3,checkedDay:todayKst(),evidence};
  }

  async enrich(input:OriginRadarResponse,savedOnly=false,force=false):Promise<OriginRadarResponse> {
    const risk=await this.getRiskData(savedOnly,force);
    const origins=input.origins.map(origin=>{
      const points=(risk.evidence[origin.originKey]||[]).filter(recentEnough);
      const short=points.length
        ? sharedWeatherSummary(points.flatMap(p=>p.shared?[p.shared]:[]))
        : '기상 자료 확인 중';
      return {...origin,
        // Interim value; the final screening is determined after official export and optional US freight evidence.
        status:'자료 부족' as const,
        statusColor:'gray' as const,
        riskWeather:sharedWeatherSummary((risk.evidence[origin.originKey]||[]).flatMap(p=>p.shared?[p.shared]:[])),
        weatherSource:'Open-Meteo',
        weatherAsOf:points.length?points.map(p=>p.mostRecentDay).sort().at(-1):undefined,
        riskAssessment:'',
      };
    });
    // Cross-check the prior-year supply trend without fabricating missing rows.
    const supply = await wheatOriginSupplyTrendService.enrich({...input, origins},savedOnly);
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
        ...sharedWeatherScreen(points.flatMap(p=>p.shared?[p.shared]:[]),POINTS.filter(p=>p.key===origin.originKey),{heatDays:3,rainMm:90}),
        weatherDataKind:'archived-model',weatherEvidence:(risk.evidence[origin.originKey]||[]).flatMap(p=>p.shared?[p.shared]:[]),
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
