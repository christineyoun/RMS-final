import assert from 'node:assert/strict';import fs from 'node:fs';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {CommodityDetail} from '../../components/CommodityDetail';import {OverviewTerminal} from '../../components/OverviewTerminal';
import {COMMODITIES} from '../../data/commoditiesData';
import {COMMODITY_IDS,quoteFromResponse,mapCommodityForDisplay,commodityBenchmarkDisplay} from '../../services/commodityQuoteSource';
import {fetchLiveFxRates} from '../../services/currencyService';
import {parseDatedDisplayFx,soybeanDisplayFactor} from '../../utils/soybeanPriceSnapshot';
import {formatCurrencyAmount,prefixCurrency} from '../../utils/currencyFormatting';
import type {Commodity,Currency,UsWheatPriceHistoryResponse} from '../../types';
const inputs=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const packet=inputs['/api/rms/free-fx'],fx=parseDatedDisplayFx(packet.raw,packet.verifiedAt)!;
const wheat:UsWheatPriceHistoryResponse=structuredClone(inputs['/api/uswheat/price-history']);
// Reproduce the reported observation in a test copy, never change stored market data.
wheat.metrics.srw.latestPriceMt=229.64;wheat.data.at(-1)!.srwMt=229.64;
const original=JSON.stringify(wheat),native=globalThis.fetch;let reads=0;
const view=(commodity:Commodity,currency:Currency)=>load(renderToStaticMarkup(createElement(CommodityDetail,{commodity,currency,onNavigateBack(){},onOpenExportModal(){},onRefreshGemini(){},isSyncing:false})));
const q=quoteFromResponse('wheat',wheat)!;
assert.equal(q.wheatSnapshot,wheat,'quote retains the complete canonical source response');
const contradictory=structuredClone(wheat);contradictory.metrics.srw.latestPriceMt+=1;assert.equal(quoteFromResponse('wheat',contradictory),null,'contradictory summary/series prices cannot enter the SSOT');
const raw:Commodity={...COMMODITIES.find(c=>c.id==='wheat')!,price:q.priceUsdMt,changeWoW:q.changeWoW,changeMoM:q.changeMoM,_canonicalWowUsdMt:q.changeWoWUsdMt,_canonicalMomUsdMt:q.changeMoMUsdMt,_canonicalQuoteDate:q.asOf,_wheatPriceSnapshot:q.wheatSnapshot};
try{
 // A competing cached rate must not influence the parent-owned Wheat snapshot.
 globalThis.fetch=async()=>{reads++;return Response.json({...packet,raw:{...packet.raw,rates:{...packet.raw.rates,EUR:.75}}});};await fetchLiveFxRates(true);
 for(const currency of ['USD','EUR','KRW'] as const){
  const mapped=mapCommodityForDisplay(raw,currency,fx),$=view(mapped,currency),symbol=currency==='USD'?'$':currency==='EUR'?'€':'₩',factor=soybeanDisplayFactor(currency,fx);
  const amount=(value:number)=>prefixCurrency(formatCurrencyAmount(value*factor,currency),symbol);
  const benchmark=commodityBenchmarkDisplay(mapped,currency);
  assert.equal($('#scm-benchmark-price-card .font-mono').first().text(),amount(229.64));
  const overview=load(renderToStaticMarkup(createElement(OverviewTerminal,{commodities:[mapped],macroDrivers:[],marketIssues:[],onNavigate(){},currency,onRefreshGemini(){},isSyncing:false,usdKrwRate:fx.USD_KRW})));
  assert.equal(overview('#ticker-price').text(),benchmark.value,'Overview and detail share the same value');
  for(const kind of ['srw','hrw','hrs'] as const){const metric=wheat.metrics[kind],card=$(`[data-wheat-class="${kind}"]`);
   assert.equal(card.length,1);assert(card.text().includes(amount(metric.latestPriceMt)+'/MT'));
   assert(card.text().includes(amount(Math.abs(metric.wowChangeMt))),'weekly amount uses canonical FX');
   assert(card.text().includes(amount(Math.abs(metric.momChangeMt))),'monthly amount uses canonical FX');
   assert.equal($(`[data-chart-endpoint-label="${kind}"]`).text(),kind.toUpperCase()+' '+amount(metric.latestPriceMt));
   assert($.text().includes('현: '+amount(metric.latestPriceMt)),'52-week current matches the same observation');
  }
  assert($('#scm-weekly-change-card').text().includes(amount(Math.abs(wheat.metrics.srw.wowChangeMt))));
  assert($('#scm-weekly-change-card').text().includes(amount(Math.abs(wheat.metrics.srw.momChangeMt))));
  assert.equal(mapped._canonicalDisplayFx,fx);assert.equal(mapped._canonicalQuoteDate,q.asOf);
  if(currency==='EUR'){assert.equal(benchmark.value,'€205.16');assert(!$('[data-wheat-class="srw"]').text().includes('€212.63'));}
 }
 assert.equal(reads,1,'rendering performs no independent market/FX requests');
 assert.equal(JSON.stringify(wheat),original,'prices, history and original changes remain intact');
 // All eight summary selectors retain their established conversion results.
 for(const id of COMMODITY_IDS){const endpoint=id==='wheat'?'/api/uswheat/price-history':id==='potato-starch'?'/api/starch/potato-export-quote':['soybean','soybean-oil','sugar'].includes(id)?`/api/${id}/price-snapshot`:`/api/history?commodity=${id}&timeframe=5Y`;
  const quote=quoteFromResponse(id,inputs[endpoint])!,base={...COMMODITIES.find(c=>c.id===id)!,price:quote.priceUsdMt,_potatoExportQuote:quote.potatoSnapshot,_wheatPriceSnapshot:quote.wheatSnapshot,_soybeanPriceSnapshot:quote.soybeanSnapshot,_soybeanOilPriceSnapshot:quote.soybeanOilSnapshot,_sugarPriceSnapshot:quote.sugarSnapshot,_canonicalHistorySnapshot:['corn','palm-oil','tapioca-starch'].includes(id)?inputs[endpoint]:undefined};
  for(const currency of ['USD','EUR','KRW'] as const){const mapped=mapCommodityForDisplay(base,currency,fx),factor=id==='potato-starch'?(currency==='EUR'?1:currency==='USD'?fx.EUR_USD:fx.EUR_USD*fx.USD_KRW):soybeanDisplayFactor(currency,fx),price=id==='potato-starch'?quote.potatoSnapshot!.data!.eurPerMT:quote.priceUsdMt;
   assert.equal(mapped.price,price*factor);const expected=commodityBenchmarkDisplay(mapped,currency);assert.equal(expected.unit,'/MT');const detail=view(mapped,currency);assert.equal(detail('#scm-benchmark-price-card .font-mono').first().text(),expected.value,id+' actual detail value');
  }
  for(const currency of ['EUR','KRW'] as const){const missingFx=view(mapCommodityForDisplay(base,currency,null),currency);assert(!missingFx.html().includes('NaN')&&!missingFx.html().includes('Infinity'),id+' valid observation without FX has explicit unavailable display '+missingFx.html().match(/.{0,80}(?:NaN|Infinity).{0,80}/)?.[0]);}
 }
 // Source outage: every commodity/currency renders unavailable rather than seeded values.
 for(const metadata of COMMODITIES)for(const currency of ['USD','EUR','KRW'] as const){
  const missing=mapCommodityForDisplay(metadata,currency,null),html=view(missing,currency);
  assert(!html.html().includes('NaN')&&!html.html().includes('Infinity'),metadata.id+' missing data has no invalid numeric UI');
  assert.equal(html('#scm-benchmark-price-card .font-mono').first().text(),metadata.id==='potato-starch'?'데이터 미확보':'--');
 }
 // A later canonical FX packet changes all Wheat surfaces together.
 const nextFx=parseDatedDisplayFx({...packet.raw,date:'2026-10-26',rates:{...packet.raw.rates,EUR:.8}},'2026-10-26T00:05:00Z')!;
 const next=mapCommodityForDisplay(raw,'EUR',nextFx),nextView=view(next,'EUR');assert.equal(commodityBenchmarkDisplay(next,'EUR').value,'€183.71');assert(nextView('[data-wheat-class="srw"]').text().includes('€183.71/MT'));
 console.log('PASS actual Wheat Overview/detail/class cards, weekly/monthly amounts, chart endpoints and 52-week current across USD/EUR/KRW; competing cache isolation, canonical FX update, immutable observations and all-eight rendered dashboard audit.');
}finally{globalThis.fetch=native;}
