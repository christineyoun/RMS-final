import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {priceUnit,prefixCurrency} from '../../utils/currencyFormatting';
import {PotatoBenchmarkDisplay} from '../../components/PotatoBenchmarkValue';
for(const [currency,symbol]of [['KRW','₩'],['USD','$'],['EUR','€']]){
 assert.equal(priceUnit(currency,symbol),'/MT');assert.equal(priceUnit(currency),currency+'/MT');
 assert.equal(prefixCurrency('321,431',symbol)+priceUnit(currency,symbol),symbol+'321,431/MT');
 assert.equal(prefixCurrency('−245.50',symbol),'−'+symbol+'245.50');
}
assert.equal(priceUnit('CAD','$'),'CAD/MT');assert.equal(priceUnit('EUR','$'),'EUR/MT');
const quote={data:{eurPerMT:671.78}} as any;
const $=load(renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote,currency:'EUR'})));
assert.equal($('span').first().text(),'€671.78');assert.equal($('span').last().text(),'/MT');
const fallback=load(renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote,currency:'USD',fx:null})));
assert.equal(fallback('span').first().text(),'€671.78');assert.equal(fallback('span').last().text(),'/MT');
assert.equal(quote.data.eurPerMT,671.78);
console.log('PASS currency unit formatting, precision/sign preservation, code retention without matching symbols, Potato EUR and FX fallback.');
