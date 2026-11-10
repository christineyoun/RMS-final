import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {PotatoProductionChartView} from '../../components/PotatoProductionChart.tsx';
import type {PotatoChartRegion,PotatoChartSnapshot} from '../../utils/potatoProductionChart.ts';

const rows: Array<[PotatoChartRegion,number]> = [['DE',10.347],['NL',6.124],['DK',3.037]];
const snapshot: PotatoChartSnapshot = {
  version:2,
  points: rows.map(([region,productionMMT])=>({
    region, year:2026, productionMMT, status:'Derived Estimate',
    sourceUrl:'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table',
    publishedAt:'2026-10-01',publicationDateKind:'dataset-update',
    verifiedAt:'2026-11-01T00:00:00Z',crop:'R1000',unit:'MMT',flags:''
  })),
  areas:[]
};
const $=load(renderToStaticMarkup(createElement(PotatoProductionChartView,{snapshot})));
for(const [id,label] of [
  ['DE','독일 (Germany)'],
  ['NL','네덜란드 (Netherlands)'],
  ['DK','덴마크 (Denmark)']
] as const){
  const legend=$(`[data-legend="${id}"]`);
  assert.equal(legend.length,1,`${id} legend exists`);
  assert.equal(legend.text(),label,`${id} translation is in parentheses`);
  assert.match(legend.attr('class')||'',/\bfont-semibold\b/,`${id} has shared wheat-style legend weight`);
  assert.equal(legend.find('span').length,1,`${id} has no separately styled country-name span`);
  assert.equal(legend.find('.text-slate-500,.text-slate-400,.font-normal,.font-medium').length,0,
    `${id} country translation does not inherit muted or smaller typography`);
}
assert.equal($('[data-summary]').length,3,'all summary cards retained');
for(const english of ['Germany','Netherlands','Denmark']) {
  assert($('[data-summary]').text().includes(english),'summary keeps muted translation '+english);
}
console.log('PASS Potato legend uses Wheat-like bold typography for Korean and parenthesized English, summary and data preserved');
