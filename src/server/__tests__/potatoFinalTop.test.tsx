import fs from 'node:fs';import assert from 'node:assert/strict';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {calculatePotatoExportChanges} from '../officialPotatoComextService';
import {PotatoProductionChartView} from '../../components/PotatoProductionChart';
const quote=JSON.parse(fs.readFileSync('.rms-price-history/potato-export-unit-value.json','utf8'));
for(const point of [quote.data,...quote.series])assert(Math.abs(point.eurPerMT-point.valueEur/point.netWeightMT)<1e-8);
const changes=calculatePotatoExportChanges(quote.data,quote.series);
assert.equal(changes.mom.currentPeriod,'2026-08');assert.equal(changes.mom.referencePeriod,'2026-07');assert.equal(changes.yoy.referencePeriod,'2025-08');
assert.equal(changes.mom.pct!.toFixed(2),'4.64');assert.equal(changes.yoy.pct!.toFixed(2),'-27.00');
const snapshot=JSON.parse(fs.readFileSync('.rms-price-history/potato-production-regions-v2.json','utf8'));
function check(data:any){const $=load(renderToStaticMarkup(createElement(PotatoProductionChartView,{snapshot:data})));for(const region of ['DE','NL','DK']){
 const rows=data.points.filter((p:any)=>p.region===region).sort((a:any,b:any)=>a.year-b.year),current=rows.at(-1),previous=rows.find((p:any)=>p.year===current.year-1),delta=current.productionMMT-previous.productionMMT;
 const card=$(`[data-summary=${region}]`);assert(card.text().includes(Math.abs(delta).toFixed(3)+' MMT'));assert(!card.text().includes('Actual:'));assert(card.text().includes('2026 추정'));
 }assert.equal($('[data-production-line][stroke-dasharray="5 4"]').length,3);assert.equal($('[data-production-area]').length,1);const source=$('.rms-source-group');assert.equal(source.length,1);assert(source.closest('[data-potato-production-chart]').length);assert.equal(source.find('a').length,2);}
check(snapshot);const revised=structuredClone(snapshot);revised.points.find((p:any)=>p.region==='DE'&&p.year===2026).productionMMT+=.1;check(revised);
const root='.rms-backups/potato-final-top-2026-10-26/src/components/';
const before=fs.readFileSync(root+'PotatoProductionChart.tsx','utf8'),after=fs.readFileSync('src/components/PotatoProductionChart.tsx','utf8');const canvas=(s:string)=>s.slice(s.indexOf('  <ChartCanvas'),s.indexOf('  </ChartCanvas>')+'  </ChartCanvas>'.length);assert.equal(canvas(after),canvas(before),'entire graph canvas, series, hover and geometry unchanged');
const current=fs.readFileSync('src/components/CommodityDetail.tsx','utf8'),old=fs.readFileSync(root+'CommodityDetail.tsx','utf8');assert.equal(current,old.replace(' style={isPotatoStarch?{minHeight:187.75}:undefined}','').replace('<PotatoBenchmarkValue isSyncing=','<PotatoBenchmarkValue currency={currency} isSyncing='),'shared file changes confined to Potato branch');
console.log('PASS saved original monthly trade calculations, dynamic production deltas, retained estimate badges/lines/gradient, one header source group and Potato-only shared wiring.');
