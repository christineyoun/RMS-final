import fs from 'node:fs';import assert from 'node:assert/strict';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {potatoProductionRange} from '../../utils/potatoProductionRange';
import {PotatoProductionRange} from '../../components/PotatoProductionRange';
import type {PotatoChartPoint} from '../../utils/potatoProductionChart';
const data=JSON.parse(fs.readFileSync('.rms-price-history/potato-production-regions-v2.json','utf8'));
const before=JSON.stringify(data),$=load(renderToStaticMarkup(createElement(PotatoProductionRange,{points:data.points})));
for(const region of ['DE','NL','DK']as const){
 const r=potatoProductionRange(data.points,region);assert.deepEqual(r.actuals.map(p=>p.year),[2021,2022,2023,2024,2025]);assert.equal(r.period,'2021–2025');assert(r.actuals.every(p=>p.status==='Actual'));assert.equal(r.estimate?.status,'Derived Estimate');assert(r.bar>=0&&r.bar<=100);
 const card=$(`[data-production-range-country=${region}]`);assert(card.text().includes(r.low!.toFixed(3))&&card.text().includes(r.high!.toFixed(3))&&card.text().includes(r.value!.toFixed(3)));assert.equal(card.find('[data-production-range-bar]').parent().attr('class'),'w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden');
 if(region!=='DK'){assert.equal(r.status,'과거 최저 하회');assert.equal(r.bar,0);assert(r.position!<0);}else{assert.equal(r.status,'밴드 53% 위치');assert(Math.abs(r.position!-52.726079)<.001);}
 console.log(region,{period:r.period,low:r.low,estimate:r.value,high:r.high,status:r.status,position:r.position});
}
const sample=data.points.find((p:PotatoChartPoint)=>p.region==='DE'&&p.year===2026);
const high=potatoProductionRange(data.points.map((p:PotatoChartPoint)=>p===sample?{...p,productionMMT:50}:p),'DE');assert.equal(high.status,'과거 최고 상회');assert.equal(high.bar,100);
const fewer=data.points.filter((p:PotatoChartPoint)=>p.region==='DE'&&[2022,2024,2025,2026].includes(p.year));const r=potatoProductionRange(fewer,'DE');assert.equal(r.actuals.length,3);assert.equal(r.period,'2022, 2024–2025');assert.equal(r.low,Math.min(...fewer.filter((p:PotatoChartPoint)=>p.status==='Actual').map((p:PotatoChartPoint)=>p.productionMMT)));
const provisional=fewer.map((p:PotatoChartPoint)=>p.year===2025?{...p,status:'Provisional' as const}:p);assert(!potatoProductionRange(provisional,'DE').actuals.some(p=>p.year===2025));
const constant=fewer.map((p:PotatoChartPoint)=>({...p,productionMMT:10}));assert.equal(potatoProductionRange(constant,'DE').status,'과거 범위 일치');assert.equal(potatoProductionRange(constant,'DE').position,null);
assert.equal(potatoProductionRange([],'DE').value,null);assert.equal(potatoProductionRange(data.points.filter((p:PotatoChartPoint)=>p.year!==2026),'DE').status,'—');
assert.equal(JSON.stringify(data),before);
const p='src/components/PotatoProductionChart.tsx',current=fs.readFileSync(p,'utf8'),old=fs.readFileSync('.rms-backups/potato-production-range-2026-10-26/PotatoProductionChart.tsx','utf8');assert.equal(current,old.replace("import {SourceAttribution}","import {PotatoProductionRange} from './PotatoProductionRange';\nimport {SourceAttribution}").replace('  </ChartCanvas>','  </ChartCanvas>\n  <PotatoProductionRange points={all}/>'),'only add the section after the unchanged chart');
const wheat=fs.readFileSync('src/components/CommodityDetail.tsx','utf8');for(const cls of ['p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3','grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1','flex items-center justify-between text-[10px] font-mono text-slate-400'])assert(wheat.includes(cls)&&$(`[class="${cls}"]`).length);
console.log('PASS latest five actuals only, truthful out-of-range labels, bounded bars, available/gapped years, flat/missing ranges, Wheat styling and existing chart preservation.');
