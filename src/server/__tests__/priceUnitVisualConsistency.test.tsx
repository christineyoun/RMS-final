import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartSummaryCard} from '../../components/CommodityChartPresentation';
import {formatSignedCurrencyPerMt} from '../../utils/currencyFormatting';

const price=renderToStaticMarkup(createElement(ChartSummaryCard,{color:'#000',label:'Quote',badge:'2026',value:'₩100',unit:'/MT',metrics:null}));
const production=renderToStaticMarkup(createElement(ChartSummaryCard,{color:'#000',label:'Crop',badge:'2026',value:'3.037',unit:'MMT',metrics:null}));
assert.match(price,/₩100<span[^>]*>\/MT<\/span>/);
assert.match(production,/3\.037<span[^>]*ml-1[^>]*>MMT<\/span>/);
assert.equal(formatSignedCurrencyPerMt(12345,'KRW'),'+₩12,345/MT');
for(const file of ['CommodityDetail.tsx','OverviewTerminal.tsx']){
 const text=fs.readFileSync(new URL('../../components/'+file,import.meta.url),'utf8');
 assert(!text.includes('} {currencyLabel}'),file);
}
const detail=fs.readFileSync(new URL('../../components/CommodityDetail.tsx',import.meta.url),'utf8');
for(const kind of ['srw','hrw','hrs'])assert(detail.includes(`wheatChartData.latestPoint.${kind}Mt`));
assert(detail.includes('return `${prefixCurrency(formatted, currencySymbol)}${currencyLabel}`;'));
console.log('PASS price unit labels join amounts across eight commodities; physical-production MMT remains spaced; three Wheat chart endpoints retain unit.');
