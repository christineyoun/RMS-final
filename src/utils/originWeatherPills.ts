/** Weather-only labels. Supply, exports, crop damage and procurement risk are not inputs. */
// The shared adapter activates scoped tropical freezing checks; surface-frost, wind and seasonal rainfall-deficit checks remain inactive.
export const WEATHER_PILL_LABELS=['고온 주의','저온 주의','서리 주의','강수 집중','강수 증가','강수 감소','강수 부족','강풍 주의','특이 없음','자료 부족','판정 보류'] as const;
export type WeatherPillLabel=typeof WEATHER_PILL_LABELS[number];
export interface WeatherPill {label:WeatherPillLabel;basis:string}
export interface WeatherScreen {weatherPills:WeatherPill[];weatherValidUntil?:string}
export const insufficientWeather=(basis='검증된 기상 선별 근거 부족'):WeatherScreen=>({weatherPills:[{label:'자료 부족',basis}]});
export const deferredWeatherAssessment=(basis:string):WeatherScreen=>({weatherPills:[{label:'판정 보류',basis}]});
export interface ScreenPoint {
  location:string;lastDay:string;checkedAt:string;rainfallDays:number;temperatureDays:number;
  precipMm:number|null;hotDays:number|null;retrievalFailed?:boolean;
}
const DAY=86400000;
export function validWeatherDay(day:unknown):day is string {
  return typeof day==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
}
/** Local source calendar, shared by ingestion and model screening. */
export function weatherLocalDay(now:Date,zone:string):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=(t:string)=>parts.find(p=>p.type===t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Thresholds are passed explicitly by each existing crop-specific adapter. */
export function screenObservedWeather(points:ScreenPoint[],policy:{locations:string[];heatDays:number;rainMm?:number;observationAgeDays:number;independentlyCurrentLocalWindows?:boolean},now=Date.now()):WeatherScreen {
  if(!policy||!Number.isInteger(policy.heatDays)||policy.heatDays<1||policy.heatDays>7||
    policy.rainMm!==undefined&&(!Number.isFinite(policy.rainMm)||policy.rainMm<=0))
    return deferredWeatherAssessment('기상 선별 기준이 미설정되었거나 유효하지 않아 판정 보류');
  const valid=[...new Map(points.filter(p=>policy.locations.includes(p.location)&&validWeatherDay(p.lastDay)&&
    Date.parse(p.lastDay)<=now&&now-Date.parse(p.lastDay)<policy.observationAgeDays*DAY&&
    Number.isFinite(Date.parse(p.checkedAt))&&Date.parse(p.checkedAt)<=now+60_000&&now-Date.parse(p.checkedAt)<3*DAY&&
    Number.isInteger(p.rainfallDays)&&p.rainfallDays>=0&&p.rainfallDays<=7&&Number.isInteger(p.temperatureDays)&&p.temperatureDays>=0&&p.temperatureDays<=7&&
    (p.precipMm===null||Number.isFinite(p.precipMm)&&p.precipMm>=0&&p.precipMm<=3500)&&
    (p.hotDays===null||Number.isInteger(p.hotDays)&&p.hotDays>=0&&p.hotDays<=p.temperatureDays))
    .sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).map(p=>[p.location,p])).values()];
  const pills:WeatherPill[]=[];
  if(valid.some(p=>p.hotDays!==null&&p.hotDays>=policy.heatDays))pills.push({label:'고온 주의',basis:`일최고기온 35°C 이상 ${policy.heatDays}일 이상 확인 · 생육 피해 판정 아님`});
  if(policy.rainMm!==undefined&&valid.some(p=>p.precipMm!==null&&p.precipMm>=policy.rainMm!))pills.push({label:'강수 집중',basis:`최근 7일 이내 관측 강수 ${policy.rainMm}mm 이상 · 침수 판정 아님`});
  // Only the shared adapter enables independent windows, after validating each
  // point against its own current local calendar and original daily response.
  const complete=valid.length===policy.locations.length&&valid.length>0&&valid.every(p=>p.rainfallDays===7&&p.temperatureDays===7&&!p.retrievalFailed&&p.precipMm!==null&&p.hotDays!==null)&&(policy.independentlyCurrentLocalWindows||new Set(valid.map(p=>p.lastDay)).size===1);
  if(!complete)pills.push({label:'자료 부족',basis:policy.independentlyCurrentLocalWindows?'필수 지점의 최근 현지 7일 기상 관측이 불완전하거나 기간·출처 검증 또는 재확인 실패':'필수 지점의 동일한 7일 기상 관측이 불완전하거나 재확인 실패'});
  else if(!pills.length)pills.push({label:'특이 없음',basis:'확인한 기상 선별 지표에서 임계 신호 없음 · 작황·가뭄·침수 안전 보증 아님'});
  return {weatherPills:pills,weatherValidUntil:valid.length?new Date(Math.min(...valid.flatMap(p=>[Date.parse(p.checkedAt)+3*DAY,Date.parse(p.lastDay)+policy.observationAgeDays*DAY]))).toISOString():undefined};
}
export function screenPalmRain(evidence:any,now=Date.now()):WeatherScreen {
  const missing=()=>insufficientWeather('최근 7일 및 직전 21일의 연속된 지역 모델 강수 근거 부족');
  if(evidence?.retrievalFailed||evidence?.model!==true||!Array.isArray(evidence.recent)||evidence.recent.length!==7||!Array.isArray(evidence.baseline)||evidence.baseline.length!==21)return missing();
  const rows=[...evidence.baseline,...evidence.recent];
  let today=new Date(now).toISOString().slice(0,10);
  if(evidence.shared?.timeZone){try{today=weatherLocalDay(new Date(now),evidence.shared.timeZone);}catch{return missing();}}
  if(rows.some((r,i)=>!validWeatherDay(r?.day)||r.day>=today||typeof r.mm!=='number'||!Number.isFinite(r.mm)||r.mm<0||r.mm>500||i>0&&Date.parse(r.day)-Date.parse(rows[i-1].day)!==DAY)||
    !Number.isFinite(Date.parse(evidence.retrievedAt))||Date.parse(evidence.retrievedAt)>now+60_000||now-Date.parse(evidence.retrievedAt)>=3*DAY||now-Date.parse(rows.at(-1).day)>=4*DAY)return missing();
  const rain=evidence.recent.reduce((n:number,r:any)=>n+r.mm,0),base=evidence.baseline.reduce((n:number,r:any)=>n+r.mm,0)/3;
  // A zero baseline cannot establish a ratio or a crop-relevant increase threshold.
  if(base<=0)return insufficientWeather('직전 21일 강수 기준값이 0이므로 비율 편차 선별 불가');
  const label:WeatherPillLabel=rain>=2*base?'강수 증가':rain<=.25*base?'강수 감소':'특이 없음';
  return {weatherPills:[{label,basis:`최근 7일 ${rain.toFixed(1)}mm / 직전 3주 주평균 ${base.toFixed(1)}mm · 2배 이상/¼ 이하 편차 · 가뭄·침수 판정 아님`}],
    weatherValidUntil:new Date(Math.min(Date.parse(evidence.retrievedAt)+3*DAY,Date.parse(rows.at(-1).day)+4*DAY)).toISOString()};
}
