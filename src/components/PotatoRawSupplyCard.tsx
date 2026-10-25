import {SourceAttribution} from './SourceAttribution';
import React from 'react';
import jrc from '../data/potato_jrc_monthly_verified.json';

export function PotatoRawSupplyCard({data,history=[],className=''}:{data:any;history?:any[];className?:string}) {
  return <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid ${className}`} data-potato-raw-supply>
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
        <span className="material-symbols-outlined text-[18px] text-slate-800">inventory_2</span>
        <h3 className="text-base font-bold text-slate-900 break-keep">글로벌 수급 밸런스 (Global S&D Balance)</h3>
      </div>
      <div className="text-xs text-slate-500" data-supply-year="current">Market Year: {data?.harvestYear||'—'}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-supply-grid="current">
        {[
          ['원료감자 생산량 · 4국',data?data.productionMMT.toFixed(2)+' MMT':'—'],
          ['재배 면적 · 4국',data?data.area1000HA.toFixed(1)+' kHA':'—'],
          ['면적가중 단수 · 4국',data?data.weightedYieldMTHA.toFixed(2)+' t/ha':'—'],
        ].map(([label,value])=><div key={label} className="p-2.5 bg-gray-50 rounded border border-gray-200"><span className="text-[10px] text-gray-500 block">{label}</span><span className="font-mono text-sm font-bold text-gray-900 block mt-0.5">{value}</span><span className="text-[10px] text-gray-500">{value==='—'?'—':'Eurostat '+data.harvestYear}</span></div>)}
      </div>
      <div className="text-[11px] text-slate-600">JRC MARS · {jrc.publishedAt} 발표 · 감자 단수 (t/ha)</div>
      <table className="w-full text-[11px] text-right tabular-nums" data-jrc-potato-table>
        <thead className="text-gray-500 border-b border-gray-100"><tr><th className="text-left py-1">지역</th><th>2025 실적</th><th>2026 전망</th><th>8월 전망</th><th>월간 수정</th></tr></thead>
        <tbody>{jrc.rows.map(r=><tr key={r.code} className="border-b border-gray-50"><td className="text-left py-1 text-slate-700">{r.country}</td><td>{r.previousYear.toFixed(1)}</td><td className="font-semibold">{r.forecast.toFixed(1)}</td><td>{r.previousForecast.toFixed(1)}</td><td>{r.monthlyRevisionPct>0?'+':''}{r.monthlyRevisionPct}%</td></tr>)}</tbody>
      </table>

    </div>
    <SourceAttribution data-potato-sources className="mt-auto pt-3 justify-end text-right" entries={[{label:'Eurostat',url:'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en'},...jrc.sources.map(s=>({label:'JRC '+s.publishedAt.slice(5),url:s.url+'#page=27'}))]}/>
  </div>;
}
