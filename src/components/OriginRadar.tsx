import React from 'react';
import {insufficientWeather,WEATHER_PILL_LABELS,type WeatherPill} from '../utils/originWeatherPills.ts';
import { Globe } from 'lucide-react';

export interface OriginItem {
  country?:string;region?:string;share?:string;production?:string;exports?:string;endingStocks?:string;
  riskAssessment?:string;status?:string;statusColor?:'green'|'yellow'|'red'|'gray';riskWeather?:string;sourcingInsight?:string;
  weatherPills?:WeatherPill[];weatherValidUntil?:string;
  exportComparison?:string;exportComparisonBasis?:string;statusBasis?:string;weatherSource?:string;weatherAsOf?:string;
  freightDays?:number;leadTimeRisk?:string;sourceName?:string;sourceOrg?:string;sourceReportDate?:string;sourceUrl?:string;
  retrievedAt?:string;unit?:string;isLive?:boolean;dataFreshness?:'live'|'cached'|'unavailable';marketYear?:string;
}
interface OriginRadarProps {commodityId?:string;origins?:OriginItem[];title?:string;className?:string;sourceFooterText?:string;}
const compact=(value?:string)=>String(value||'').replace(/\s+/g,' ').trim();
export const originRadarDisplayText=(value:string,commodity:'corn'|'wheat'|'other'):string=>{
  const text=value.replace(/기상\(최근 확인 7일 강수,\s*20\d{2}-\d{2}-\d{2}\s*기준\)/g,'기상(최근 7일 강수)')
    .replace(/기상\(최근 확인 7일 강수\)/g,'기상(최근 7일 강수)')
    .replace(/\s*\(20\d{2}-\d{2}\s*→\s*20\d{2}-\d{2}\)/g,'')
    .replace(/\(전년값\s*\d{1,2}월\)/g,'(전년 기준)');
  return text.replace(/\s*\((?:전월|전년|전기) 비교 자료 없음\)/g,'').replace(/^(?:전월|전년|전기) 비교 자료 없음$/,'').replace(/(?:20\d{2}[-./]\d{2}[-./]\d{2}\s*(?:기준|관측)?)/g,'').replace(/\s+/g,' ').trim();
};
const sourceLabel=(value:string)=>/USDA.*PSD|USDA FAS/i.test(value)?'USDA FAS PSD':/USDA.*WASDE/i.test(value)?'USDA WASDE':value.replace(/\(기상\)/g,'').trim();
export const OriginRadar:React.FC<OriginRadarProps>=({origins=[],title,commodityId,className=''})=>{
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
          const weather=originRadarDisplayText(compact(origin.riskWeather),isCorn?'corn':isWheat?'wheat':'other');
          // Legacy supply/risk statuses never imply a weather signal.
          const allowed:readonly string[]=WEATHER_PILL_LABELS;
          const weatherPills=origin.weatherPills?.length&&origin.weatherPills.every(p=>allowed.includes(p.label))&&(origin.weatherPills.every(p=>p.label==='자료 부족')||origin.weatherValidUntil&&Date.parse(origin.weatherValidUntil)>Date.now())
            ? [...new Map(origin.weatherPills.map(p=>[p.label,p])).values()]:insufficientWeather().weatherPills;
          const provenance=[origin.sourceReportDate&&`국가 수급 ${origin.sourceReportDate}`,origin.weatherAsOf&&`지역 기상 ${origin.weatherAsOf}`,origin.exportComparisonBasis,origin.retrievedAt].filter(Boolean).join(' · ');
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
                const style=pill.label==='특이 없음'?'rms-status-positive bg-green-50 border-green-200 text-green-700':pill.label==='자료 부족'?'bg-slate-100 border-slate-200 text-slate-500':'rms-status-warning bg-[#FFF7ED] border-[#FED7AA] text-[#EC870C]';
                return <span key={pill.label} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${style}`} title={pill.basis}>{pill.label==='특이 없음'?'이상 없음':pill.label}</span>;
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
