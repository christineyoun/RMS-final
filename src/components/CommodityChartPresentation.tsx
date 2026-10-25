import type {HTMLAttributes,ReactNode} from 'react';

/** Presentation extracted from the established Wheat chart. No commodity calculations here. */
export const chartPresentation={
 section:'w-full bg-white p-5 rounded-lg shadow-sm border border-[#e5e7eb] space-y-4 pdf-section-block print:p-3 print:mt-4 overflow-visible',
 header:'flex items-center justify-between w-full mb-4',
 controls:'flex items-center gap-1 bg-[#f3f4f6] p-0.5 rounded border border-[#e5e7eb] shrink-0 self-start pdf-hide',
 canvas:'@container/chart h-68 sm:h-76 w-full bg-[#fafbfc] border border-[#f3f4f6] rounded-lg p-4 flex flex-col justify-between relative overflow-visible select-none',
 legend:'sm:@max-[640px]/chart:h-8 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#6b7280] font-mono gap-3 relative z-10 bg-[#fafbfc] w-full',
 legendItems:'flex items-center gap-3 shrink-0',
 legendLabel:'flex items-center gap-1 font-semibold text-slate-700',
 plot:'sm:@max-[640px]/chart:my-0 relative h-48 sm:h-52 w-full flex items-center justify-center my-2 cursor-crosshair group',
 axis:'absolute right-1 top-0 bottom-0 w-20 pointer-events-none z-0',
 axisLabel:'absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0',
 xAxis:'flex items-center justify-between text-[11px] text-[#9ca3af] font-mono border-t border-[#e5e7eb] pt-2',
};
export const chartButtonClass=(active:boolean)=>`px-2.5 py-1 text-xs font-bold rounded transition-colors ${active?'bg-white text-[#DF0029] shadow-xs':'text-[#6b7280] hover:text-[#111827]'}`;
export function ChartCanvas(props:HTMLAttributes<HTMLDivElement>){return <div {...props} className={chartPresentation.canvas}/>;}
export function ChartSummaryCard({color,label,description,badge,value,unit,metrics,...props}:{color:string;label:string;description?:string;badge:ReactNode;value:ReactNode;unit:string;metrics:ReactNode}&HTMLAttributes<HTMLDivElement>){
 return <div {...props} className="@container/summary bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
  <div className="flex items-center justify-between"><div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:color}}/><span className="text-xs font-bold text-slate-900 font-mono">{label}</span>{description&&<span className="@max-[220px]/summary:hidden text-[11px] text-slate-500">{description}</span>}</div><span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">{badge}</span></div>
  <div className="@max-[220px]/summary:flex-col @max-[220px]/summary:gap-2 flex items-baseline justify-between pt-0.5"><div><div className="text-lg sm:text-xl font-bold font-mono text-slate-900">{value}<span className="text-xs font-semibold text-slate-500 ml-1">{unit}</span></div></div><div className="@max-[220px]/summary:self-end text-right space-y-1">{metrics}</div></div>
 </div>;
}
export function ChartTooltip({xPct,children,...props}:{xPct:number;children:ReactNode}&HTMLAttributes<HTMLDivElement>){return <div {...props} className="absolute top-2 pointer-events-none z-30 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded p-2.5 text-xs font-mono space-y-1" style={{left:xPct>55?'12px':'auto',right:xPct>55?'auto':'12px',...props.style}}>{children}</div>;}
export function ChartRedGradient({id}:{id:string}){return <defs><linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#DF0029" stopOpacity="0.15"/><stop offset="100%" stopColor="#DF0029" stopOpacity="0.0"/></linearGradient></defs>;}
export function chartSmoothPath(points:{x:number;y:number}[]){if(points.length<2)return '';let path=`M ${points[0].x},${points[0].y}`;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],mid=Math.round((a.x+b.x)/2);path+=` C ${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`;}return path;}

/** Wheat's common linear display scale; values and commodity calculations are untouched. */
export function chartValueBounds(values:number[]){const min=Math.min(...values),max=Math.max(...values),pad=(max-min)*.08||max*.08||1;return {low:Math.max(0,min-pad),high:max+pad};}
