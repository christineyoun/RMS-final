import {SourceAttribution} from './SourceAttribution';
import React from 'react';
import {POTATO_JRC_NAMES,retainedPotatoJrcPublication,type PotatoJrcPublication} from '../utils/potatoJrcPublication';

const releaseDateLabel=(date:string)=>date.slice(5).replace('-','.');

export function PotatoRawSupplyCard({data,history=[],className='',publication=retainedPotatoJrcPublication()}:{data:any;history?:any[];className?:string;publication?:PotatoJrcPublication}) {
  const current=publication?.current,previous=publication?.previous;
  return <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid ${className}`} data-potato-raw-supply>
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
        <span className="material-symbols-outlined text-[18px] text-slate-800">inventory_2</span>
        <h3 className="text-base font-bold text-slate-900 break-keep">글로벌 수급 밸런스 (Global S&D Balance)</h3>
      </div>
      <div className="text-xs text-slate-500" data-supply-year="current">Market Year: {data?.harvestYear||'—'}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-supply-grid="current">
        {[
          ['원료감자 생산량 (Raw Potato Production)',data?data.productionMMT.toFixed(2)+' MMT':'—'],
          ['재배 면적 (Cultivated Area)',data?data.area1000HA.toFixed(1)+' kHA':'—'],
          ['면적가중 단수 (Area-weighted Yield)',data?data.weightedYieldMTHA.toFixed(2)+' t/ha':'—'],
        ].map(([label,value])=><div key={label} className="p-2.5 bg-gray-50 rounded border border-gray-200"><span className="text-[10px] text-gray-500 block break-keep">{label}</span><span className="font-mono text-sm font-bold text-gray-900 block mt-0.5">{value}</span><span className="text-[10px] text-gray-500">{value==='—'?'—':'4국 · Eurostat '+data.harvestYear}</span></div>)}
      </div>
      {current&&<section className="space-y-2" aria-label="헥타르당 감자 수확량 (Potato Yield)">
      <h4 className="text-[11px] font-medium text-slate-600">헥타르당 감자 수확량 (Potato Yield) · t/ha</h4>
      <table className="w-full text-[11px] text-right tabular-nums" data-jrc-potato-table>
        <colgroup span={2}/><colgroup span={previous?2:1}/>{previous&&<colgroup span={1}/>}
        <thead className="text-gray-500 border-b border-gray-100">
          <tr>
            <th scope="col" rowSpan={2} className="text-left py-1">지역</th>
            <th scope="col" rowSpan={2}>{current.forecastYear-1} 실적</th>
            <th scope="colgroup" colSpan={previous?2:1} className="text-center py-1">{current.forecastYear} 전망</th>
            {previous&&<th scope="col" rowSpan={2}>수정률</th>}
          </tr>
          <tr>
            {[previous,current].flatMap(issue=>issue?[<th key={issue.publishedAt} scope="col" className="pb-1 font-medium"><time dateTime={issue.publishedAt}>{releaseDateLabel(issue.publishedAt)}</time> 발표</th>]:[])}
          </tr>
        </thead>
        <tbody>{current.rows.map(r=>{
          const prior=previous?.rows.find(p=>p.code===r.code)?.forecast;
          const pct=prior?Math.round((r.forecast/prior-1)*1000)/10:null;
          return <tr key={r.code} className="border-b border-gray-50">
            <th scope="row" className="text-left py-1 font-semibold text-slate-700">{POTATO_JRC_NAMES[r.code]}</th>
            <td>{r.previousYear.toFixed(1)}</td>
            {previous&&<td>{prior?.toFixed(1)??'—'}</td>}
            <td className="font-semibold">{r.forecast.toFixed(1)}</td>
            {previous&&<td>{pct===null?'—':(pct>0?'+':'')+pct+'%'}</td>}
          </tr>;
        })}</tbody>
      </table>
      </section>}

    </div>
    <SourceAttribution data-potato-sources className="mt-auto pt-3 justify-end text-right" entries={[{label:'Eurostat',url:'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en'},...[previous,current].flatMap(s=>s?[{label:'JRC '+releaseDateLabel(s.publishedAt),url:s.sourceUrl}]:[])]}/>
  </div>;
}
