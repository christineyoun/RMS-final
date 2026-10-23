import React from 'react';
import jrc from '../data/potato_jrc_monthly_verified.json';

export function PotatoRawSupplyCard({data,className=''}:{data:any;className?:string}) {
  return <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid ${className}`} data-potato-raw-supply>
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
        <span className="material-symbols-outlined text-[18px] text-slate-800">inventory_2</span>
        <h3 className="text-base font-bold text-slate-900 break-keep">글로벌 수급 밸런스 (Global S&D Balance - Raw Potatoes)</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['원료감자 생산량 · 4국',data ? `${data.productionMMT.toFixed(2)} MMT`:'N/A'],
          ['재배 면적 · 4국',data ? `${data.area1000HA.toFixed(1)} kHA`:'N/A'],
          ['면적가중 단수 · 4국',data ? `${data.weightedYieldMTHA.toFixed(2)} t/ha`:'N/A'],
        ].map(([label,value])=><div key={label} className="p-2.5 bg-gray-50 rounded border border-gray-200"><span className="text-[10px] text-gray-500 block">{label}</span><span className="font-mono text-sm font-bold text-gray-900 block mt-0.5">{value}</span><span className="text-[10px] text-gray-500">Eurostat {data?.harvestYear||'미확인'}</span></div>)}
      </div>
      <div className="text-[11px] text-slate-600">JRC MARS · {jrc.publishedAt} 발표 · 감자 단수 (t/ha)</div>
      <table className="w-full text-[11px] text-right tabular-nums" data-jrc-potato-table>
        <thead className="text-gray-500 border-b border-gray-100"><tr><th className="text-left py-1">지역</th><th>2025 실적</th><th>2026 전망</th><th>8월 전망</th><th>월간 수정</th></tr></thead>
        <tbody>{jrc.rows.map(r=><tr key={r.code} className="border-b border-gray-50"><td className="text-left py-1 text-slate-700">{r.country}</td><td>{r.previousYear.toFixed(1)}</td><td className="font-semibold">{r.forecast.toFixed(1)}</td><td>{r.previousForecast.toFixed(1)}</td><td>{r.monthlyRevisionPct>0?'+':''}{r.monthlyRevisionPct}%</td></tr>)}</tbody>
      </table>
      <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded border border-gray-200 leading-relaxed break-keep">EU 2026 단수 전망은 34.2 t/ha로 2021~2025년 평균 대비 7%, 전년 대비 12% 낮습니다. {jrc.conditions} EU·국가별 전망이며 세계 생산량이나 전분용 감자만의 수치가 아닙니다. Eurostat 4국은 독일·프랑스·네덜란드·덴마크 전체 감자(종자용 포함)입니다{data?.isEstimateOrProvisional?'(일부 잠정·추정치)':''}. 재고·소비·무역의 미확인 수치는 추정하지 않습니다.</p>
    </div>
    <div data-potato-sources className="rms-source mt-auto pt-3 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right text-xs text-gray-400 font-normal">
      <span className="font-normal text-gray-400 whitespace-nowrap">출처:</span>
      <a href="https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[#1e293b] font-semibold hover:text-[#DF0029] hover:underline">Eurostat ↗</a>
      {jrc.sources.map(s=><React.Fragment key={s.id}>
        <span className="font-normal text-gray-400">·</span>
        <a href={s.url+'#page=27'} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[#1e293b] font-semibold hover:text-[#DF0029] hover:underline">JRC {s.publishedAt.slice(5)} ↗</a>
      </React.Fragment>)}
    </div>
  </div>;
}
