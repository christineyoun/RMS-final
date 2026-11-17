import React from 'react';
import {SourceAttribution} from './SourceAttribution';
import type {ThaiCassavaMetrics,ThaiCassavaSupply} from '../utils/thaiCassavaSupply';
import type {ThaiStarchExports} from '../utils/thaiStarchExports';

const signed=(n:number)=> (n>0?'+':'')+n.toFixed(1)+'%';
const formatters={
  productionTonnes:(n:number)=>(n/1e6).toFixed(2)+' MMT',
  harvestedAreaRai:(n:number)=>Math.round(n/1e3).toLocaleString('en-US')+' kRAI',
  yieldTonnesPerRai:(n:number)=>n.toFixed(3)+' MT/Rai',
};
const metrics=[
  ['productionTonnes','카사바 생산량 (Cassava Production)'],
  ['harvestedAreaRai','카사바 수확면적 (Harvested Area)'],
  ['yieldTonnesPerRai','카사바 평균단수 (Cassava Yield)'],
] as const;

function tile(heading:string,value:string,detail?:string,direction?:number){
  return <div key={heading} className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
    <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">{heading}</span>
    <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">{value}</span>
    {detail&&<span className={'text-[10px] font-mono font-semibold block mt-0.5 '+
      (direction==null||direction===0?'text-slate-500':direction>0?'text-[#059669]':'text-[#DF0029]')}>{detail}</span>}
  </div>;
}
function metricTile(key:keyof Omit<ThaiCassavaMetrics,'reportingYear'>,heading:string,supply:ThaiCassavaSupply|null){
  const value=supply?.current[key],previous=supply?.previous?.[key];
  const change=value!==undefined&&previous!==undefined?(value/previous-1)*100:undefined;
  return tile(heading,value!==undefined?formatters[key](value):'—',
    change!==undefined&&previous!==undefined
      ? 'vs '+supply!.previous!.reportingYear+': '+formatters[key](previous)+' ('+signed(change)+')'
      : supply&&value===undefined?'동일 조사 기간의 검증 자료 없음':undefined,change);
}

const exportedProducts=[['nativeTonnes','천연전분 (Native Starch)'],['modifiedTonnes','변성전분 (Modified Starch)']] as const;

function StarchExportRows({exports,loading}:{exports:ThaiStarchExports|null;loading:boolean}){
  return <section className="space-y-2" data-supply-grid="exports" aria-label="태국 수출">
    <h4 className="text-[11px] font-medium text-slate-600">태국 수출{exports?' · '+exports.current.calendarYear+'년':''}</h4>
    {exports?<table className="w-full text-[11px] text-right tabular-nums">
      <thead className="text-gray-500 border-b border-gray-100"><tr>
        <th scope="col" className="py-1"><span className="sr-only">품목 (Product)</span></th>
        <th scope="col" className="pl-2 py-1">수출량 (Export Volume)</th>
        <th scope="col" className="pl-2 py-1">전년 대비 (YoY)</th>
      </tr></thead>
      <tbody>{exportedProducts.map(([key,label])=>{
        const volume=exports.current[key],prior=exports.previous?.[key];
        const change=prior===undefined?null:(volume/prior-1)*100;
        const color=change===null||change===0?'text-slate-500':change>0?'text-[#059669]':'text-[#DF0029]';
        return <tr key={key} className="border-b border-gray-100">
          <th scope="row" className="text-left font-semibold text-slate-700 py-1.5">{label}</th>
          <td className="font-semibold whitespace-nowrap pl-2 py-1.5">{formatters.productionTonnes(volume)}</td>
          <td className={'whitespace-nowrap pl-2 py-1.5 '+color}>{change===null?'—':signed(change)}</td>
        </tr>;
      })}</tbody>
    </table>:<p className="text-[11px] text-slate-500">{loading?'수출 자료 확인 중':'검증된 연간 수출 통계 미확인'}</p>}
  </section>;
}

export function TapiocaCropSupplyCard({crop,exports,loading=false,className=''}:{
  crop:ThaiCassavaSupply|null;exports:ThaiStarchExports|null;loading?:boolean;className?:string
}){
  return <div className={('flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid '+className).trim()}>
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
        <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
        <h3 className="text-base font-bold text-slate-900 break-keep">글로벌 수급 밸런스 (Global S&D Balance)</h3>
      </div>
      <div className="text-xs text-slate-500" data-supply-year="current">
        {crop?'Market Year: '+crop.current.reportingYear:
          loading?'수급 자료 확인 중':'검증된 수급 자료 미확인'}
      </div>
      <div data-supply-grid="current" className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
        {metrics.map(([key,heading])=>metricTile(key,heading,crop))}
      </div>
      <StarchExportRows exports={exports} loading={loading}/>
    </div>
    <SourceAttribution className="mt-auto pt-4 justify-end" entries={[
      ...(crop?[{label:(new URL(crop.source.url).hostname==='ttta-tapioca.org'?'TTTA':'TTSA')+' 생산조사',url:crop.source.url}]:[]),
      ...(exports?[{label:'TTSA 수출통계',url:exports.source.url}]:[])
    ]}/>
  </div>;
}
