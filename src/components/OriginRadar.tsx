import {SourceAttribution} from './SourceAttribution';
import React from 'react';
import potatoJrc from '../data/potato_jrc_monthly_verified.json';
import {insufficientWeather,weatherLocalDay,WEATHER_PILL_LABELS,type WeatherPill} from '../utils/originWeatherPills.ts';
import { Globe } from 'lucide-react';

interface WeatherDescriptionEvidence {
  rainfallDays?:number;temperatureDays?:number;timeZone?:string;lastDay?:string;checkedAt?:string;retrievalFailed?:boolean;
  location?:string;windowStart?:string;precip7mm?:number|null;hotDays?:number|null;
  daily?:{date:string;precipMm:number|null;tMaxC:number|null}[];
  history?:{date:string;precipMm:number|null}[];
}
export interface OriginItem {
  country?:string;region?:string;share?:string;production?:string;exports?:string;endingStocks?:string;
  riskAssessment?:string;status?:string;statusColor?:'green'|'yellow'|'red'|'gray';riskWeather?:string;sourcingInsight?:string;
  weatherPills?:WeatherPill[];weatherValidUntil?:string;
  weatherEvidence?:WeatherDescriptionEvidence[]|(WeatherDescriptionEvidence&{shared?:WeatherDescriptionEvidence});
  exportComparison?:string;exportComparisonBasis?:string;statusBasis?:string;weatherSource?:string;weatherDataKind?:string;weatherAsOf?:string;
  freightDays?:number;leadTimeRisk?:string;sourceName?:string;sourceOrg?:string;sourceReportDate?:string;sourceUrl?:string;
  retrievedAt?:string;unit?:string;isLive?:boolean;dataFreshness?:'live'|'cached'|'unavailable';marketYear?:string;
  supplyIndicators?:Array<{text:string;source:string;url:string;period:string;display?:'origin-summary'}>;
  weatherCropContext?:{clearSupported?:boolean;warningSupported?:boolean;basis:string;sourceUrl:string;publishedAt:string};
  weatherHistoricalContext?:{points:Array<{agriculturalRepresentativeness?:string}>};
  weatherScreening?:import('../utils/originWeatherPills.ts').WeatherScreen['weatherScreening'];
}
interface OriginRadarProps {commodityId?:string;origins?:OriginItem[];title?:string;className?:string;sourceFooterText?:string;}
const compact=(value?:string)=>String(value||'').replace(/\s+/g,' ').trim();
/** Existing presentation completeness check; never changes backend screening. */
function originWeatherObservationsComplete(origin:OriginItem,now:number):boolean {
  const original=compact(origin.riskWeather),evidence=origin.weatherEvidence;
  const points=Array.isArray(evidence)?evidence:evidence?[evidence.shared||evidence]:[];
  // Some existing adapters expose their validated screen instead of the full daily evidence.
  const certified=points.length===0&&origin.weatherDataKind==='archived-model'&&origin.weatherSource==='Open-Meteo'&&
    !!origin.weatherAsOf&&!!origin.weatherValidUntil&&Date.parse(origin.weatherValidUntil)>now&&!!origin.weatherPills?.length&&
    origin.weatherPills.every(p=>WEATHER_PILL_LABELS.includes(p.label)&&!['자료 부족','판정 보류'].includes(p.label));
  const complete=(certified||!!origin.weatherDataKind&&points.length>0&&!(!Array.isArray(evidence)&&evidence?.retrievalFailed)&&
    !/재확인 실패|저장 기상/.test(original)&&points.every(p=>{
      if(p.rainfallDays!==7||p.temperatureDays!==7||p.retrievalFailed||!p.timeZone||!p.lastDay||!p.checkedAt)return false;
      const checked=Date.parse(p.checkedAt);
      if(!Number.isFinite(checked)||checked>now+60000||now-checked>=3*86400000)return false;
      try{return new Date(Date.parse(weatherLocalDay(new Date(now),p.timeZone)+'T12:00:00Z')-86400000).toISOString().slice(0,10)===p.lastDay;}catch{return false;}
    }))&&(!origin.weatherValidUntil||Date.parse(origin.weatherValidUntil)>now)&&!/재확인 실패|저장 기상/.test(original)&&!origin.weatherPills?.some(p=>p.label==='자료 부족');
  return complete;
}
/** Display published coverage, not provider processing state. No requests or risk calculations. */
export function originWeatherDisplayText(origin:OriginItem,now=Date.now()):string {
  const evidence=origin.weatherEvidence;
  const points=Array.isArray(evidence)?evidence:evidence?[evidence.shared||evidence]:[];
  if(!points.length)return '최근 강수 자료 갱신 대기';
  const groups=new Map<string,string[]>();
  for(const p of points){
    const name=points.length===1?'':compact(p.location||origin.region||origin.country);
    const start=Date.parse((p.windowStart||'')+'T12:00:00Z'),end=Date.parse((p.lastDay||'')+'T12:00:00Z');
    let completedEnd=NaN;
    try{completedEnd=Date.parse(weatherLocalDay(new Date(now),p.timeZone||'')+'T12:00:00Z')-86400000;}catch{}
    const dated=Number.isFinite(start)&&Number.isFinite(end)&&end-start===6*86400000&&end<=completedEnd;
    const complete=p.rainfallDays===7&&typeof p.precip7mm==='number'&&Number.isFinite(p.precip7mm)&&p.precip7mm>=0;
    const checked=Date.parse(p.checkedAt||'');
    // A failed retry does not change the retained observation period or its age.
    const current=dated&&complete&&end===completedEnd&&Number.isFinite(checked)&&checked<=now+60000&&now-checked<3*86400000;
    const heading=current?'최근 7일 강수량':dated&&complete?'이전 7일 강수량':'최근 강수 자료 갱신 대기';
    let detail=(dated&&complete?`${name} ${p.precip7mm}mm`:dated?`${name} ${p.rainfallDays??0}/7일 확인 · 갱신 대기`:name).trim();
    const baseline=p.history?.slice(0,-7);
    if(dated&&complete&&baseline?.length===21&&baseline.every(d=>typeof d.precipMm==='number'&&Number.isFinite(d.precipMm)))
      detail+=` · 직전 3주 주평균 ${(baseline.reduce((sum,d)=>sum+d.precipMm!,0)/3).toFixed(1)}mm`;
    groups.set(heading,[...(groups.get(heading)||[]),detail]);
  }
  return [...groups].map(([heading,details])=>`${heading}: ${details.filter(Boolean).join(' · ')}`).join(' / ');
}
/** Present the source-screened WEATHER EVENT, not a generic market-risk level.
 * A rain deviation alone (Palm 28-day ratio) or a JRC yield revision cannot
 * certify drought, excessive rain, or crop damage. Never upgrade a cold flag
 * to red without a separately validated severity rule.
 */
export function originWeatherDisplayStatus(origin:OriginItem,commodityId?:string,now=Date.now()):{level:'양호'|'주의'|'판정 보류';label:string;basis:string} {
  const screened=originWeatherDisplayPills(origin,now);
  const supported=screened.find(p=>['고온 주의','저온 주의','강수 부족 주의','강수 과다 주의','강수 집중'].includes(p.label));
  if(supported){
    const label=supported.label==='강수 집중'?'강수 과다 주의':supported.label;
    return {level:'주의',label,basis:supported.basis};
  }
  // Historical/relative rain change is a weather observation, not an agronomic alert.
  // National JRC crop-yield forecasts belong to Global S&D, not weather-pill color.
  const complete=originWeatherObservationsComplete(origin,now);
  const unrepresentative=origin.weatherHistoricalContext?.points.some(p=>p.agriculturalRepresentativeness?.startsWith('unverified:'));
  if(complete&&!unrepresentative&&origin.weatherPills?.some(p=>p.label==='특이 없음')&&
     origin.weatherScreening?.complete)
    return {level:'양호',label:'양호',basis:[origin.weatherScreening.scope,origin.weatherPills.find(p=>p.label==='특이 없음')!.basis,...origin.weatherScreening.limitations].filter(Boolean).join(' · ')};
  return {level:'판정 보류',label:'판정 보류',basis:unrepresentative?'대표 지점의 재배지 대표성을 확인하지 못했습니다.':origin.weatherPills?.find(p=>p.label==='판정 보류'||p.label==='자료 부족')?.basis||origin.weatherScreening?.limitations.join(' · ')||(complete?'해당 생육기의 작황·노출 근거가 부족합니다.':'최근 현지 7일의 필수 지점·기상 항목을 모두 확인하지 못했습니다.')};
}
/** Display policy only. Keep source classifications and their reasons intact. */
export function originWeatherDisplayPills(origin:OriginItem,now=Date.now()):WeatherPill[] {
  const expired=!!origin.weatherValidUntil&&Number.isFinite(Date.parse(origin.weatherValidUntil))&&Date.parse(origin.weatherValidUntil)<=now;
  const selected=!expired&&origin.weatherPills?.length&&origin.weatherPills.every(p=>WEATHER_PILL_LABELS.includes(p.label))&&(origin.weatherPills.every(p=>p.label==='자료 부족'||p.label==='판정 보류')||origin.weatherValidUntil&&Date.parse(origin.weatherValidUntil)>now)
    ? [...new Map(origin.weatherPills.map(p=>[p.label,p])).values()]:insufficientWeather(expired?'기상 선별 유효기간 경과 · 최신 현지 기간의 기상 재확인 필요':undefined).weatherPills;
  return selected.flatMap(p=>{
    if(p.label==='특이 없음')return [];
    // Missing crop policy is retained internally, not repeated as a weather-data notice.
    if(p.label==='판정 보류'&&/선별 기준 미확정|선별 기준이 미설정/.test(p.basis)){
      if(originWeatherObservationsComplete(origin,now))return [];
      return [{label:'판정 보류' as const,basis:'최근 현지 7일 모델 기상의 기간·완전성 또는 재확인 상태 확인 필요'}];
    }
    return [{...p,label:p.label==='자료 부족'?'판정 보류' as const:p.label}];
  });
}
/** Evidence-only rows also reevaluate when their current local window ends. */
function originWeatherDisplayExpiry(origin:OriginItem,now:number):string {
  const e=origin.weatherEvidence,points=Array.isArray(e)?e:e?[e.shared||e]:[];
  const ends=points.flatMap(p=>{
    if(!p.timeZone||!p.checkedAt)return [];
    const zone=p.timeZone;let day:string;
    try{day=weatherLocalDay(new Date(now),zone);}catch{return [];}
    let before=now,after=now+2*86400000;
    while(after-before>1){const middle=Math.floor((before+after)/2);if(weatherLocalDay(new Date(middle),zone)===day)before=middle;else after=middle;}
    return [after,Date.parse(p.checkedAt)+3*86400000];
  });
  const future=[...ends,Date.parse(origin.weatherValidUntil||'')].filter(t=>Number.isFinite(t)&&t>now);
  return future.length?new Date(Math.min(...future)).toISOString():'';
}
export const originRadarDisplayText=(value:string,commodity:'corn'|'wheat'|'other'):string=>{
  const text=value.replace(/기상\(최근 확인 7일 강수,\s*20\d{2}-\d{2}-\d{2}\s*기준\)/g,'기상(최근 7일 강수)')
    .replace(/기상\(최근 확인 7일 강수\)/g,'기상(최근 7일 강수)')
    .replace(/\s*\(20\d{2}-\d{2}\s*→\s*20\d{2}-\d{2}\)/g,'')
    .replace(/\(전년값\s*\d{1,2}월\)/g,'(전년 기준)');
  return text.replace(/\s*\((?:전월|전년|전기) 비교 자료 없음\)/g,'').replace(/^(?:전월|전년|전기) 비교 자료 없음$/,'').replace(/(?:20\d{2}[-./]\d{2}[-./]\d{2}\s*(?:기준|관측)?)/g,'').replace(/\s+/g,' ').trim();
};
const sourceLabel=(value:string)=>/저장 자료|저장 기상|cache|revalidat|retry|재확인|처리 중/i.test(value)?'':/USDA.*WASDE/i.test(value)?'USDA WASDE':/USDA.*PSD|USDA FAS|USDA Foreign Agricultural Service/i.test(value)?'USDA FAS PSD':/^Eurostat/.test(value)?'Eurostat':/^TTSA/.test(value)?'TTSA':value.replace(/\(기상\)/g,'').trim();
export const OriginRadar:React.FC<OriginRadarProps>=({origins=[],title,commodityId,className=''})=>{
  const [,reevaluate]=React.useReducer((n:number)=>n+1,0);
  const validitySchedule=origins.map(o=>originWeatherDisplayExpiry(o,Date.now())).join('|');
  React.useEffect(()=>{
    const expiries=validitySchedule.split('|').map(Date.parse).filter(Number.isFinite);
    let timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
    const schedule=()=>{
      clearTimeout(timer);
      const now=Date.now(),next=Math.min(...expiries.filter(t=>t>now));
      if(Number.isFinite(next))timer=setTimeout(()=>{
        if(disposed)return;
        reevaluate();schedule();
      },Math.min(next-now,2_147_483_647));
    };
    // A suspended tab may miss its deadline; recheck when it becomes active.
    const resume=()=>{if(!disposed){reevaluate();schedule();}};
    schedule();window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return ()=>{disposed=true;clearTimeout(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[validitySchedule]);
  const isCorn=commodityId==='corn',isWheat=commodityId==='wheat';
  const isPotato=commodityId==='potato-starch',isTapioca=commodityId==='tapioca-starch';
  const sources=[...new Set(origins.flatMap(o=>[o.sourceName||o.sourceOrg||'',o.weatherSource||'',...(o.supplyIndicators||[]).filter(s=>isPotato?s.display==='origin-summary'||s.source==='JRC MARS':!isTapioca||!/^원료·가공:/.test(s.text)).map(s=>s.source)]).filter(Boolean).map(v=>v==='USDA'?(isCorn?'USDA WASDE':'USDA FAS PSD'):sourceLabel(v)).filter(Boolean))];
  const primary=isCorn?'USDA WASDE':isWheat?'USDA FAS PSD':null;
  const publishers=[...new Set([...(primary?[primary]:[]),...sources])];
  if(isTapioca)publishers.sort((a,b)=>['TTSA','AFSIS','Open-Meteo'].indexOf(a)-['TTSA','AFSIS','Open-Meteo'].indexOf(b));
  return <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className}`.trim()}>
    <div className="flex-1 flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-1">
        <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-slate-700 shrink-0"/><h3 className="text-base font-bold text-slate-900 break-keep">{title||'주요 산지 수급 및 기상 현황 (Origin Radar)'}</h3></div>
      </div>
      <div className="flex flex-col gap-3">
        {origins.length===0?<p className="text-xs text-[#6b7280]">산지 자료를 불러오는 중입니다.</p>:origins.map((origin,idx)=>{
          const comparison=origin.exportComparison&&!/없음|미확인|자료 부족/.test(origin.exportComparison)?origin.exportComparison:'';
          const exports=origin.exports?(/^수출\s/.test(origin.exports)?origin.exports:`수출 ${origin.exports}`):'';
          const supply=[exports+(exports&&comparison?` (${comparison})`:''),origin.endingStocks?(/^기말재고\s/.test(origin.endingStocks)?origin.endingStocks:`기말재고 ${origin.endingStocks}`):''].filter(Boolean).join(' · ');
          const weather=originWeatherDisplayText(origin);
          const production=isPotato||isTapioca?origin.production?.match(/^\d+(?:\.\d+)?M MT/)?.[0]||origin.production:origin.production;
          const supplyLabel=(s:NonNullable<OriginItem['supplyIndicators']>[number])=>{
            if((!isPotato&&!isTapioca)||s.display!=='origin-summary')return s.text;
            if(isPotato){
              const row=potatoJrc.rows.find(r=>r.country===origin.country||origin.region?.startsWith(r.country+' '));
              const history=origin.marketYear?`${origin.marketYear}년 생산${origin.production?.includes('추정')?'(추정)':''}`:'';
              if(row&&row.previousYear>0&&Number.isFinite(row.forecast)){
                const change=(row.forecast/row.previousYear-1)*100;
                return `${history}${history?' · ':''}${potatoJrc.forecastYear}년 단수 전망 ${row.forecast.toFixed(1)}t/ha (${potatoJrc.previousYear}년 대비 ${change<0?'−':change>0?'+':''}${Math.abs(change).toFixed(1)}%)`;
              }
              return history||s.text;
            }
            const change=s.text.match(/[+-]?\d+(?:\.\d+)?%$/)?.[0];
            const previousYear=isPotato&&/^\d{4}$/.test(s.period)?String(Number(s.period)-1):isTapioca?s.text.match(/^\d{4}\/\d{2}/)?.[0]:undefined;
            if(!change||!previousYear)return s.text;
            const estimate=isPotato&&origin.production?.includes('추정')?` · ${origin.marketYear}년 추정`:'';
            return `${previousYear}년 (전년) 대비 ${change}${estimate}`;
          };
          const weatherStatus=originWeatherDisplayStatus(origin,commodityId);
          const provenance=[origin.sourceReportDate&&`국가 수급 ${origin.sourceReportDate}`,origin.weatherAsOf&&`지역 기상 ${origin.weatherAsOf}`,origin.exportComparisonBasis,origin.statusBasis,origin.retrievedAt].filter(Boolean).join(' · ');
          return <div key={idx} aria-description={commodityId==='tapioca-starch'?[provenance,weatherStatus.basis].filter(Boolean).join(' · '):provenance} className="origin-card bg-[#f9fafb] border border-[#e5e7eb] p-2.5 rounded flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-xs text-[#111827]">{origin.region||origin.country||'산지'}</span>
                {origin.production&&<span className="text-[10px] bg-white border border-[#e5e7eb] px-2 py-0.5 rounded-md font-sans font-medium text-[#374151]">{commodityId==='soybean-oil'?'국가 대두유 생산':isPotato?'감자 생산':isTapioca?'카사바 생산':commodityId==='sugar'?'국가 설탕 생산':origin.region?.includes('유럽연합')?'EU 생산':'국가 생산'} <span className="font-mono font-bold">{production}</span></span>}
              </div>
              {(supply||weather)&&<div className="text-[10px] text-[#6b7280] mt-1 font-sans break-keep whitespace-normal leading-snug">
                {supply&&<div>{origin.region?.includes('유럽연합')?'EU':'국가'} {originRadarDisplayText(supply,isCorn?'corn':isWheat?'wheat':'other')}</div>}
                {origin.supplyIndicators?.filter(s=>commodityId==='potato-starch'?s.display==='origin-summary':commodityId!=='tapioca-starch'||!/^원료·가공:/.test(s.text)).map((s,i)=><div key={i} aria-description={`${s.source} · ${s.period} · ${s.url}${isPotato&&s.display==='origin-summary'?` · JRC MARS · ${potatoJrc.publishedAt} · ${potatoJrc.sources[0].url}`:''}`}>{supplyLabel(s)}</div>)}
                {weather&&<div data-origin-weather className="mt-0.5">{weather}</div>}
              </div>}
            </div>
          </div>;
        })}
      </div>
    </div>
    {publishers.length>0&&<SourceAttribution data-origin-sources className="mt-auto pt-4 justify-end text-right" entries={publishers.map(label=>({label}))}/>}
  </div>;
};
export default OriginRadar;
