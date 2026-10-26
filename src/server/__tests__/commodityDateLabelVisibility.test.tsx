import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {CommodityDetail} from '../../components/CommodityDetail';
import {COMMODITIES} from '../../data/commoditiesData';
import {COMMODITY_IDS,quoteFromResponse,mapCommodityForDisplay,commodityBenchmarkDisplay} from '../../services/commodityQuoteSource';
import {parseDatedDisplayFx} from '../../utils/soybeanPriceSnapshot';

const inputs=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const packet=inputs['/api/rms/free-fx'],fx=parseDatedDisplayFx(packet.raw,packet.verifiedAt)!;
const original=JSON.stringify(inputs);
for(const id of COMMODITY_IDS){
  const endpoint=id==='wheat'?'/api/uswheat/price-history':id==='potato-starch'?'/api/starch/potato-export-quote':['soybean','soybean-oil','sugar'].includes(id)?`/api/${id}/price-snapshot`:`/api/history?commodity=${id}&timeframe=5Y`;
  const q=quoteFromResponse(id,inputs[endpoint])!;
  assert.ok(q.asOf,id+' has a real observation timestamp in the fixture');
  const base={...COMMODITIES.find(c=>c.id===id)!,price:q.priceUsdMt,_canonicalQuoteDate:q.asOf,
    _potatoExportQuote:q.potatoSnapshot,_wheatPriceSnapshot:q.wheatSnapshot,_soybeanPriceSnapshot:q.soybeanSnapshot,
    _soybeanOilPriceSnapshot:q.soybeanOilSnapshot,_sugarPriceSnapshot:q.sugarSnapshot,
    _canonicalHistorySnapshot:['corn','palm-oil','tapioca-starch'].includes(id)?inputs[endpoint]:undefined};
  for(const currency of ['USD','EUR','KRW'] as const){
    const commodity=mapCommodityForDisplay(base,currency,fx),before=JSON.stringify(commodity);
    const $=load(renderToStaticMarkup(createElement(CommodityDetail,{commodity,currency,onNavigateBack(){},onRefreshGemini(){},isSyncing:false})));
    const card=$('#scm-benchmark-price-card');
    assert.equal(card.length,1);
    assert.ok(!/관측\s+\d{4}-\d{2}-\d{2}|환율\s+\d{4}-\d{2}-\d{2}/.test($.text()),id+' '+currency+' has no observation/FX metadata label');
    assert.equal(card.children().length,2,'only heading and price remain, with no empty metadata element');
    assert.equal(card.find('.font-mono').first().text(),commodityBenchmarkDisplay(commodity,currency).value);
    assert.equal(commodity._canonicalQuoteDate,q.asOf);
    assert.equal(commodity._canonicalDisplayFx?.observationDate,fx.observationDate);
    assert.equal(JSON.stringify(commodity),before,'rendering preserves timestamps, source metadata and values');
  }
}
assert.equal(JSON.stringify(inputs),original);
console.log('PASS observation/FX label absent in all eight dashboards × three currencies, no empty label element, unchanged benchmark values and source timestamps.');
