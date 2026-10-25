import {REGION_LABELS,type PotatoChartPoint} from '../utils/potatoProductionChart';
import {potatoProductionRange} from '../utils/potatoProductionRange';

/** The established Wheat range box, typography, grid, bar and value-row classes. */
export function PotatoProductionRange({points}:{points:PotatoChartPoint[]}){
 const ranges=(['DE','NL','DK'] as const).map(region=>({region,...potatoProductionRange(points,region)}));
 const sharedPeriod=ranges.every(r=>r.period===ranges[0].period)?ranges[0].period:'';
 const colors={DE:'#DF0029',NL:'#EC870C',DK:'#2563EB'};
 const value=(n:number|null)=>n===null?'—':n.toFixed(3);
 return <div data-potato-production-range className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3">
  <div className="flex items-center justify-between text-xs font-bold">
   <span className="text-[#6b7280]">5개년 생산량 범위 및 위치 분석 (5-Year Production Range)</span>
   <span className="font-mono text-[#111827]">{sharedPeriod?sharedPeriod+' Actual · ':''}MMT</span>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
   {ranges.map(r=><div key={r.region} data-production-range-country={r.region} className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
     <span className="font-bold text-slate-800 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{backgroundColor:colors[r.region]}}/>{REGION_LABELS[r.region]}{!sharedPeriod&&r.period?' ('+r.period+')':''}</span>
     <span className="font-mono text-slate-600 text-[11px]">{r.status}</span>
    </div>
    <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
     <div data-production-range-bar className="h-full rounded-full transition-all duration-300" style={{backgroundColor:colors[r.region],width:r.bar+'%'}}/>
    </div>
    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
     <span>저: {value(r.low)}</span><span className="font-bold text-slate-800">2026 추정: {value(r.value)}</span><span>고: {value(r.high)}</span>
    </div>
   </div>)}
  </div>
 </div>;
}
