import React from 'react';
import {insufficientWeather,weatherLocalDay,WEATHER_PILL_LABELS,type WeatherPill} from '../utils/originWeatherPills.ts';
import { Globe } from 'lucide-react';

interface WeatherDescriptionEvidence {
  rainfallDays?:number;temperatureDays?:number;timeZone?:string;lastDay?:string;checkedAt?:string;retrievalFailed?:boolean;
}
export interface OriginItem {
  country?:string;region?:string;share?:string;production?:string;exports?:string;endingStocks?:string;
  riskAssessment?:string;status?:string;statusColor?:'green'|'yellow'|'red'|'gray';riskWeather?:string;sourcingInsight?:string;
  weatherPills?:WeatherPill[];weatherValidUntil?:string;
  weatherEvidence?:WeatherDescriptionEvidence[]|(WeatherDescriptionEvidence&{shared?:WeatherDescriptionEvidence});
  exportComparison?:string;exportComparisonBasis?:string;statusBasis?:string;weatherSource?:string;weatherDataKind?:string;weatherAsOf?:string;
  freightDays?:number;leadTimeRisk?:string;sourceName?:string;sourceOrg?:string;sourceReportDate?:string;sourceUrl?:string;
  retrievedAt?:string;unit?:string;isLive?:boolean;dataFreshness?:'live'|'cached'|'unavailable';marketYear?:string;
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
/** Presentation only: retain the original weather text/evidence and remove repeated calendar metadata. */
export function originWeatherDisplayText(origin:OriginItem,now=Date.now()):string {
  const original=compact(origin.riskWeather),complete=originWeatherObservationsComplete(origin,now);
  const date='(?:19|20)\\d{2}[-./]\\d{2}[-./]\\d{2}',zone='\\b(?:(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc|US|Canada|Brazil|Mexico|Chile)(?:/[A-Za-z0-9_+.-]+)+|UTC|GMT)\\b';
  const calendar=new RegExp(`${date}|${zone}`);
  return original.replace(/\s*\([^()]*\)/g,part=>calendar.test(part)?'':part)
    .replace(new RegExp(`${date}\\s*[~～〜–—→-]\\s*${date}`,'g'),'')
    .replace(new RegExp(`${date}|${zone}`,'g'),'')
    .replace(/모델 기상(?:\s*·\s*(?:(?:현지|최근) 완료 7일|현지))?\s*:/,complete?'모델 기상 · 최근 완료 7일:':'모델 기상:')
    .replace(/\s+/g,' ').trim();
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
  if(origin.weatherValidUntil)return origin.weatherValidUntil;
  if(!originWeatherObservationsComplete(origin,now))return '';
  const e=origin.weatherEvidence,points=Array.isArray(e)?e:e?[e.shared||e]:[];
  const ends=points.flatMap(p=>{
    if(!p.timeZone||!p.checkedAt)return [];
    const zone=p.timeZone,day=weatherLocalDay(new Date(now),zone);let before=now,after=now+2*86400000;
    while(after-before>1){const middle=Math.floor((before+after)/2);if(weatherLocalDay(new Date(middle),zone)===day)before=middle;else after=middle;}
    return [after,Date.parse(p.checkedAt)+3*86400000];
  });
  return ends.length?new Date(Math.min(...ends)).toISOString():'';
}
export const originRadarDisplayText=(value:string,commodity:'corn'|'wheat'|'other'):string=>{
  const text=value.replace(/기상\(최근 확인 7일 강수,\s*20\d{2}-\d{2}-\d{2}\s*기준\)/g,'기상(최근 7일 강수)')
    .replace(/기상\(최근 확인 7일 강수\)/g,'기상(최근 7일 강수)')
    .replace(/\s*\(20\d{2}-\d{2}\s*→\s*20\d{2}-\d{2}\)/g,'')
    .replace(/\(전년값\s*\d{1,2}월\)/g,'(전년 기준)');
  return text.replace(/\s*\((?:전월|전년|전기) 비교 자료 없음\)/g,'').replace(/^(?:전월|전년|전기) 비교 자료 없음$/,'').replace(/(?:20\d{2}[-./]\d{2}[-./]\d{2}\s*(?:기준|관측)?)/g,'').replace(/\s+/g,' ').trim();
};
const sourceLabel=(value:string)=>/USDA.*PSD|USDA FAS/i.test(value)?'USDA FAS PSD':/USDA.*WASDE/i.test(value)?'USDA WASDE':value.replace(/\(기상\)/g,'').trim();
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
  const sources=[...new Set(origins.flatMap(o=>[o.sourceOrg||o.sourceName||'',o.weatherSource||'']).filter(Boolean).map(v=>v==='USDA'?(isCorn?'USDA WASDE':'USDA FAS PSD'):sourceLabel(v)))];
  const primary=isCorn?'USDA WASDE':isWheat?'USDA FAS PSD':null;
  const footer=[...new Set([...(primary?[primary]:[]),...sources])].join(' · ');
  const stale=origins.some(o=>o.dataFreshness==='cached'&&((o.retrievedAt&&Date.now()-Date.parse(o.retrievedAt)>86400000)||(o.weatherAsOf&&Date.now()-Date.parse(o.weatherAsOf)>10*86400000)||(o.sourceReportDate&&Date.now()-Date.parse(o.sourceReportDate)>75*86400000)));
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
          const weatherPills=originWeatherDisplayPills(origin);
          const provenance=[origin.sourceReportDate&&`국가 수급 ${origin.sourceReportDate}`,origin.weatherAsOf&&`지역 기상 ${origin.weatherAsOf}`,origin.exportComparisonBasis,origin.statusBasis,origin.retrievedAt].filter(Boolean).join(' · ');
          return <div key={idx} title={provenance} className="origin-card bg-[#f9fafb] border border-[#e5e7eb] p-2.5 rounded flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-xs text-[#111827]">{origin.region||origin.country||'산지'}</span>
                {origin.production&&<span className="text-[10px] bg-white border border-[#e5e7eb] px-2 py-0.5 rounded-md font-sans font-medium text-[#374151]">{(commodityId==='palm-oil'||commodityId==='soybean'||commodityId==='soybean-oil')?'국가 생산':'생산'} <span className="font-mono font-bold">{origin.production}</span></span>}
              </div>
              {(supply||weather)&&<div className="text-[10px] text-[#6b7280] mt-1 font-sans break-keep whitespace-normal leading-snug">
                {supply&&<div>{(commodityId==='palm-oil'||commodityId==='soybean'||commodityId==='soybean-oil')?'국가 ':''}{originRadarDisplayText(supply,isCorn?'corn':isWheat?'wheat':'other')}</div>}
                {weather&&<div className="mt-0.5">{weather}</div>}
              </div>}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1" data-weather-pills>
              {weatherPills.map(pill=>{
                if(pill.label==='판정 보류')return <span key={pill.label} data-weather-assessment className="text-[10px] font-normal text-slate-500 whitespace-nowrap" title={pill.basis}>{pill.label}</span>;
                const style='rms-status-warning bg-[#FFF7ED] border-[#FED7AA] text-[#EC870C]';
                return <span key={pill.label} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${style}`} title={pill.basis}>{pill.label}</span>;
              })}
            </div>
          </div>;
        })}
      </div>
    </div>
    {footer&&<div className="mt-auto pt-4 flex justify-end text-xs text-gray-400"><span className="block w-full text-right break-keep">{stale?'일부 저장 자료 · ':''}출처: {footer}</span></div>}
  </div>;
};
export default OriginRadar;
