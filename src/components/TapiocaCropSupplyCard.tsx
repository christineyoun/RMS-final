import React from 'react';
import {SourceAttribution} from './SourceAttribution';
import type {ThaiCassavaMetrics,ThaiCassavaSupply} from '../utils/thaiCassavaSupply';

export type TapiocaCardQuote={date:string;usdPerMt:number;wowPct:number|null};
const dateLabel=(s:string)=>s.replaceAll('-','.');
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

export function TapiocaCropSupplyCard({crop,quote,loading=false,className=''}:{
  crop:ThaiCassavaSupply|null;quote:TapiocaCardQuote|null;loading?:boolean;className?:string
}){
  const estimate=crop?.estimateStatus==='forecast'?'전망':crop?.estimateStatus==='estimated'?'추정':'실적';
  return <div className={('flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid '+className).trim()}>
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
        <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
        <h3 className="text-base font-bold text-slate-900 break-keep">글로벌 수급 밸런스 (Global S&D Balance)</h3>
      </div>
      <div className="text-xs text-slate-500" data-supply-year="current">
        {crop?'태국 카사바 · Market Year: '+crop.current.reportingYear+' · '+estimate+' · '+dateLabel(crop.source.reportDate)+' 조사':
          loading?'태국 카사바 수급 자료 확인 중':'태국 카사바 · 검증된 수급 자료 미확인'}
      </div>
      <div data-supply-grid="current" className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
        {metrics.map(([key,heading])=>metricTile(key,heading,crop))}
        {tile('천연전분 수출량 (Native Starch Exports)','—','검증된 별도 수출 통계 미연결')}
        {tile('변성전분 수출량 (Modified Starch Exports)','—','검증된 별도 수출 통계 미연결')}
        {tile('TTSA 기준시세 (FOB BKK)',quote?'$'+quote.usdPerMt.toFixed(2)+'/MT':'—',
          quote?('발표 '+dateLabel(quote.date)+(quote.wowPct===null?'':' · '+signed(quote.wowPct)+' WoW')):'공식 주간 시세 확인 불가',
          quote?.wowPct??undefined)}
      </div>
    </div>
    <SourceAttribution className="mt-auto pt-4 justify-end" entries={[
      ...(crop?[{label:crop.source.name,url:crop.source.url}]:[]),
      {label:'TTSA 시세',url:'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price'}
    ]}/>
  </div>;
}
