import {useEffect,useState} from 'react';
import {ChartCanvas,ChartSummaryCard,ChartTooltip,ChartRedGradient,chartSmoothPath,chartValueBounds,chartPresentation,chartButtonClass} from './CommodityChartPresentation';
import {ChartEndpointLabels} from './ChartEndpointLabels';
import {potatoChartDisplay,potatoPointYoY,REGION_LABELS,type PotatoChartSnapshot,type PotatoChartPeriod,type PotatoChartRegion,type PotatoChartMode} from '../utils/potatoProductionChart';

const COLORS:Record<PotatoChartRegion,string>={DE:'#DF0029',NL:'#EC870C',DK:'#2563EB',EU27_2020:'#64748b'};
const statusLabel=(status:string)=>status==='Derived Estimate'?'산출 추정':status==='Official Estimate'?'공식 추정':status==='Provisional'?'잠정':'Actual';
const signed=(v:number|null)=>v===null?'—':(v>=0?'+':'')+v.toFixed(1)+'%';
const EUROSTAT='https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en';

export function PotatoProductionChart({isSyncing=false}:{isSyncing?:boolean}){
 const [snapshot,setSnapshot]=useState<PotatoChartSnapshot|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const load=async()=>{try{
   const response=await fetch('/api/potato-starch/production-regions',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Unavailable');const body=await response.json();
   if(body.version!==2||!Array.isArray(body.points))throw Error('Invalid response');
   if(active){setSnapshot(body);setFailed(!!body.lastError);}
  }catch{if(active)setFailed(true);}};
  void load();const timer=setInterval(()=>void load(),30*60000);
  return()=>{active=false;controller.abort();clearInterval(timer);};
 },[isSyncing]);
 return <PotatoProductionChartView snapshot={snapshot} failed={failed}/>;
}

export function PotatoProductionChartView({snapshot,failed=false}:{snapshot:PotatoChartSnapshot|null;failed?:boolean}){
 const [period,setPeriod]=useState<PotatoChartPeriod>(5),[hover,setHover]=useState<number|null>(null),[mode,setMode]=useState<PotatoChartMode>('absolute');
 const all=snapshot?.points||[],{regions,years,rows,bases}=potatoChartDisplay(all,period,mode);
 const {low,high}=chartValueBounds(rows.length?rows.map(p=>p.displayValue):[0,1]);
 const first=years[0],last=years.at(-1)!,unit=mode==='absolute'?'MMT':'지수';
 // Wheat geometry: 500 × 150, with 25 units of padding above and below.
 const x=(year:number)=>years.length>1?(year-first)/(last-first)*500:250;
 const y=(value:number)=>125-(value-low)/(high-low)*100;
 const selectedYear=hover!==null&&years.includes(hover)?hover:null;
 const closeHover=()=>setHover(null);
 const choosePeriod=(value:PotatoChartPeriod)=>{setPeriod(value);setHover(null);};
 const chooseMode=(value:PotatoChartMode)=>{setMode(value);setHover(null);};
 const buttonClass=chartButtonClass;
 const ticks=Array.from({length:4},(_,i)=>high-(high-low)*i/3);
 const germanyActual=rows.filter(p=>p.region==='DE'&&(p.status==='Actual'||p.status==='Provisional')).sort((a,b)=>a.year-b.year);
 // Split at gaps: shading is restricted to contiguous observed points, never estimates.
 const actualRuns= germanyActual.reduce<(typeof germanyActual)[]>((runs,p)=>{const run=runs.at(-1);if(!run||p.year!==run.at(-1)!.year+1)runs.push([p]);else run.push(p);return runs;},[]);
 const latest=regions.map(region=>rows.filter(p=>p.region===region).sort((a,b)=>a.year-b.year).at(-1));
 const forecast=all.find(p=>regions.includes(p.region)&&p.status==='Derived Estimate');
 const tooltip=selectedYear!==null?<ChartTooltip xPct={x(selectedYear)/5} role="tooltip" data-potato-tooltip>
  <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 font-sans flex items-center justify-between gap-4"><span>{selectedYear}</span><span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-normal tracking-tight font-sans">{rows.some(p=>p.year===selectedYear&&p.status.includes('Estimate'))?'산출 추정':'Actual'} · MMT</span></div>
  {regions.map(region=>{const point=rows.find(p=>p.region===region&&p.year===selectedYear);return <div key={region} className="flex items-center justify-between gap-4" style={{color:COLORS[region]}}><span className="font-sans font-medium flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{backgroundColor:COLORS[region]}}/>{REGION_LABELS[region]}:</span><span className="font-bold" title={point?[statusLabel(point.status),point.productionMMT.toFixed(3)+' MMT',point.formula||'',point.sourceUrl,point.areaSourceUrl||''].join(' · '):''}>{point?point.productionMMT.toFixed(3)+' MMT':'—'}</span></div>;})}
  {rows.some(p=>p.year===selectedYear&&p.status.includes('Estimate'))&&<div className="text-[10px] text-slate-500 font-sans">JRC MARS 단수 × Eurostat 동년 면적<br/>{regions.map(region=>{const point=rows.find(p=>p.region===region&&p.year===selectedYear);return point?.formula?<div key={region}>{REGION_LABELS[region]}: {point.formula}{/p/i.test(point.flags)?' (잠정 면적)':''}</div>:null;})}</div>}
  {mode==='indexed'&&<div className="text-[10px] text-slate-500 font-sans">{regions.map(region=>REGION_LABELS[region]+' '+bases.get(region)?.year+'=100').join(' · ')}</div>}
 </ChartTooltip>:null;
 return <section className={chartPresentation.section} data-potato-production-chart data-mode={mode}>
  <style>{`@media(max-width:1100px){[data-potato-production-chart]>div:first-of-type{flex-wrap:wrap;gap:8px}[data-potato-production-chart] h3{flex-wrap:wrap}}@media screen and (max-width:767px){body:has([data-potato-production-chart]) aside{display:none}body:has([data-potato-production-chart]) main{margin-left:0;min-width:0}body:has([data-potato-production-chart]) header{left:0;overflow-x:auto;gap:12px}body:has([data-potato-production-chart]) header>div{flex-shrink:0}body:has([data-potato-production-chart]) header>div:first-child{width:12rem}body:has([data-potato-production-chart]) .CommodityDetail>.pdf-hide{flex-wrap:wrap;gap:8px}}`}</style>
  <div className={chartPresentation.header}>
   <div className="flex items-center gap-2 flex-wrap"><span className="material-symbols-outlined text-[18px] text-[#111827]">show_chart</span><div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap min-w-0"><h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">원료감자 생산량 추이 <span className="text-sm font-bold text-slate-900 ml-1">(Raw Potato Production Trend)</span></h3></div></div>
   <div className={chartPresentation.controls}>{([3,5,10,'all'] as const).map(value=><button key={value} type="button" aria-pressed={period===value} onClick={()=>choosePeriod(value)} className={buttonClass(period===value)}>{value==='all'?'전체':value+'년'}</button>)}</div>
  </div>
  <div className="flex justify-end"><div className={chartPresentation.controls}>{(['absolute','indexed'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>chooseMode(value)} className={buttonClass(mode===value)}>{value==='absolute'?'절대 생산량(MMT)':'변동률 비교(기준연도=100)'}</button>)}</div></div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
   {regions.map(region=>{
    const current=all.filter(p=>p.region===region).sort((a,b)=>a.year-b.year).at(-1),actual=all.filter(p=>p.region===region&&p.status==='Actual').sort((a,b)=>a.year-b.year).at(-1);
    const yoy=current?potatoPointYoY(current,all):null;
    return <ChartSummaryCard key={region} data-summary={region} color={COLORS[region]} label={REGION_LABELS[region]} badge={current?current.year+' '+(current.status.includes('Estimate')?'추정':statusLabel(current.status)):'미확보'} value={current?current.productionMMT.toFixed(3):'—'} unit="MMT" metrics={<>
      <div className="flex items-center justify-end gap-1"><span className="text-[10px] text-slate-400">YoY:</span><span className={'text-xs font-mono font-bold '+(yoy===null?'text-slate-400':yoy>=0?'text-[#059669]':'text-[#DF0029]')}>{signed(yoy)}</span></div>
      <div className="flex items-center justify-end gap-1"><span className="text-[10px] text-slate-400">{actual?actual.year+' Actual:':'Actual:'}</span><span className="text-xs font-mono font-bold text-slate-400">{actual?actual.productionMMT.toFixed(3):'—'}</span></div>
    </>}/>;
   })}
  </div>
  <ChartCanvas data-potato-chart-canvas>
   <div className={chartPresentation.legend}><div className={chartPresentation.legendItems}>{regions.map(region=><span key={region} data-legend={region} className={chartPresentation.legendLabel}><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:COLORS[region]}}/>{REGION_LABELS[region]}</span>)}</div></div>
   {rows.length?<>
    <div data-potato-plot className={chartPresentation.plot}
     onMouseLeave={closeHover} onMouseMove={event=>{const rect=event.currentTarget.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));setHover(Math.round(first+ratio*(last-first)));}}>
     <svg role="img" aria-label={`원료감자 생산량 ${unit} 비교`} data-potato-series data-axis-low={low} data-axis-high={high} viewBox="0 0 500 150" preserveAspectRatio="none" className="w-full h-full overflow-visible" fill="none">
      <ChartRedGradient id="grad-potato-germany"/>{actualRuns.filter(run=>run.length>1).map((run,i)=><path key={i} data-production-area data-last-actual-year={run.at(-1)!.year} d={chartSmoothPath(run.map(p=>({x:x(p.year),y:y(p.displayValue)})))+` L ${x(run.at(-1)!.year)},150 L ${x(run[0].year)},150 Z`} fill="url(#grad-potato-germany)"/>)}
      {ticks.map(tick=><line key={tick} x1="0" x2="500" y1={y(tick)} y2={y(tick)} stroke="#F1F5F9" strokeWidth="1"/>)}
      {mode==='indexed'&&<line x1="0" x2="500" y1={y(100)} y2={y(100)} stroke="#cbd5e1" strokeDasharray="3 3"/>}
      {regions.map(region=>{
       const series=rows.filter(p=>p.region===region).sort((a,b)=>a.year-b.year);
       return <g key={region} data-region={region}>
        {series.slice(1).map((point,index)=>{const previous=series[index];return point.year===previous.year+1?<path key={point.year} data-production-line data-from-year={previous.year} data-to-year={point.year} d={chartSmoothPath([{x:x(previous.year),y:y(previous.displayValue)},{x:x(point.year),y:y(point.displayValue)}])} stroke={COLORS[region]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={point.status.includes('Estimate')||previous.status.includes('Estimate')?'5 4':undefined}/>:null;})}
        {series.map(point=><circle key={point.year} data-year={point.year} data-display-value={point.displayValue} cx={x(point.year)} cy={y(point.displayValue)} r={point.status==='Actual'?0:3.5} fill={point.status==='Actual'?COLORS[region]:'white'} stroke={COLORS[region]} tabIndex={0} onFocus={()=>{setHover(point.year);}} onBlur={closeHover}><title>{[REGION_LABELS[region],point.year,statusLabel(point.status),point.productionMMT.toFixed(3)+' MMT',point.formula||'',point.sourceUrl].join(' · ')}</title></circle>)}
       </g>;
      })}
      {selectedYear!==null&&<g><line x1={x(selectedYear)} x2={x(selectedYear)} y1="0" y2="150" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3"/>{regions.map(region=>{const point=rows.find(p=>p.region===region&&p.year===selectedYear);return point?<circle key={region} cx={x(selectedYear)} cy={y(point.displayValue)} r="4.5" fill={COLORS[region]} stroke="#ffffff" strokeWidth="2"/>:null;})}</g>}
     </svg>
     <div className={chartPresentation.axis}>{ticks.map(tick=><span key={tick} data-chart-axis-label className={chartPresentation.axisLabel} style={{top:y(tick)/1.5+'%'}}>{tick.toFixed(1)} {unit}</span>)}</div>
     <ChartEndpointLabels labels={latest.flatMap(point=>point?[{id:point.region,text:REGION_LABELS[point.region]+' '+point.displayValue.toFixed(mode==='absolute'?3:1)+' '+unit+(point.status.includes('Estimate')?' · '+point.year+' 추정':''),color:COLORS[point.region],xPct:x(point.year)/5,yPct:y(point.displayValue)/1.5}]:[])}/>
     {tooltip}
     {selectedYear!==null&&<div className="absolute bottom-0 pointer-events-none z-20" style={{left:x(selectedYear)/5+'%',transform:x(selectedYear)/5<=5?'none':x(selectedYear)/5>=95?'translateX(-100%)':'translateX(-50%)'}}><span className="bg-[#0F172A] text-white font-mono text-[11px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap block font-semibold">{selectedYear}</span></div>}
    </div>
    <div className={chartPresentation.xAxis} data-year-labels>{years.filter((_,index)=>index===0||index===years.length-1||index===Math.floor(years.length/3)||index===Math.floor(years.length*2/3)).map(year=><span key={year} data-axis-year={year}>{year}</span>)}</div>
   </>:<p className="text-xs text-slate-500 p-4">{!snapshot&&!failed?'공식 생산량 데이터 조회 중…':'검증된 공식 생산량 데이터 미확보'}</p>}
  </ChartCanvas>
  <div className="rms-source text-gray-400">출처: <a className="text-slate-700 hover:underline" href={EUROSTAT} target="_blank" rel="noopener noreferrer">Eurostat ↗</a>{forecast&&<> · <a className="text-slate-700 hover:underline" href={forecast.sourceUrl} target="_blank" rel="noopener noreferrer">JRC MARS ↗</a></>}</div>
 </section>;
}
