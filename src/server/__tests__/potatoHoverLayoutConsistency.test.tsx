import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {ChartTooltip} from '../../components/CommodityChartPresentation.tsx';
import {PotatoProductionChartView,potatoHoverTitle} from '../../components/PotatoProductionChart.tsx';
import type {PotatoChartRegion,PotatoChartSnapshot,PotatoObservationStatus} from '../../utils/potatoProductionChart.ts';

assert.equal(potatoHoverTitle(2026,true),'2026 Estimate');
assert.equal(potatoHoverTitle(2025,false),'2025');

// The potato hover uses the existing shared tooltip UI, but stays pinned to
// the top-left open space so the 2026 endpoint badges on the right stay visible.
const tooltip=load(renderToStaticMarkup(createElement(ChartTooltip,{
  xPct:30,style:{left:'12px',right:'auto'},children:createElement('span',null,potatoHoverTitle(2026,true))
})));
assert.match(tooltip('div').first().attr('style')||'',/left:12px/);
assert.match(tooltip('div').first().attr('style')||'',/right:auto/);
assert.equal(tooltip.text(),'2026 Estimate');

function point(region:PotatoChartRegion,year:number,value:number,status:PotatoObservationStatus){
 return {region,year,productionMMT:value,status,
  sourceUrl:'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table',
  publishedAt:'2026-10-01',publicationDateKind:'dataset-update' as const,
  verifiedAt:'2026-11-01T00:00:00Z',crop:'R1000' as const,unit:'MMT' as const,flags:''};
}
const observations=[
  point('DE',2025,13.871,'Actual'),point('NL',2025,7.551,'Actual'),point('DK',2025,3.631,'Actual'),
  point('DE',2026,10.347,'Derived Estimate'),point('NL',2026,6.124,'Derived Estimate'),point('DK',2026,3.037,'Derived Estimate')
];
const snapshot={version:2 as const,points:observations,areas:[] as PotatoChartSnapshot['areas']};
const $=load(renderToStaticMarkup(createElement(PotatoProductionChartView,{snapshot})));
const endpoints=$('[data-chart-endpoint-label]').map((_,element)=>$(element).text()).get();
assert.equal(endpoints.length,3);
for(const label of endpoints){
 assert(label.includes(' MMT'),label);
 assert(!label.includes('추정')&&!label.includes('Estimate'),label);
}
assert.equal($('[data-summary]').length,3);
for(const name of ['Germany','Netherlands','Denmark']){
 assert($('[data-summary]').text().includes(name),'missing bilingual summary '+name);
 assert($('[data-legend]').text().includes('('+name+')'),'missing parenthesized chart legend '+name);
}
assert.equal($('[data-summary]').filter((_,el)=>$(el).text().includes('2026 추정')).length,3,
 '2026 estimate provenance remains visible on summary cards');

const source=fs.readFileSync('src/components/PotatoProductionChart.tsx','utf8');
assert(source.includes("style={{left:'12px',right:'auto'}} role=\"tooltip\" data-potato-tooltip"));
assert(source.includes('potatoHoverTitle(selectedYear,isEstimateYear)'));
assert(!source.includes("'산출 추정':'Actual'} · MMT"));
assert(!source.includes('JRC MARS 단수 × Eurostat 동년 면적'),
 'forecast formulas must not clutter the tooltip');
assert(!source.includes("bases.get(region)?.year+'=100'"),
 'baseline-year explanation must not clutter the indexed tooltip');
assert(source.includes('point.formula||'),
 'forecast formulas remain available in accessible point metadata');
assert(source.includes('SourceAttribution entries='),
 'official source attribution remains visible');
assert(source.includes('description={REGION_ENGLISH[region]}'),
 'summary-card muted country translation remains intact');
console.log('PASS Potato chart legend parentheses, concise forecast and index tooltips, and preserved estimation provenance');
