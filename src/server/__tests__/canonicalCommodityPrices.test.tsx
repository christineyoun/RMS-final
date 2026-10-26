import fs from 'node:fs';import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {COMMODITY_IDS,fetchCommodityQuotes,quoteFromResponse,mapCommodityForDisplay,commodityBenchmarkDisplay,commodityComparisonDisplay} from '../../services/commodityQuoteSource';
import {parseDatedDisplayFx} from '../../utils/soybeanPriceSnapshot';
import {PotatoBenchmarkDisplay} from '../../components/PotatoBenchmarkValue';
import {PotatoPriceChangesDisplay} from '../../components/PotatoPriceChanges';
import type {Commodity} from '../../types';
const inputs=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const fxPacket=inputs['/api/rms/free-fx'],fx=parseDatedDisplayFx(fxPacket.raw,fxPacket.verifiedAt)!;
const endpoint=(id:string)=>id==='wheat'?'/api/uswheat/price-history':id==='potato-starch'?'/api/starch/potato-export-quote':['soybean','soybean-oil','sugar'].includes(id)?`/api/${id}/price-snapshot`:`/api/history?commodity=${id}&timeframe=5Y`;
const urls:string[]=[],originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async input=>{const url=String(input);urls.push(url);assert(!url.includes('force=')&&!url.includes('free-publication'));return Response.json(inputs[url]||{success:false});};
 const [batch,sameBatch]=await Promise.all([fetchCommodityQuotes(),fetchCommodityQuotes()]);assert.equal(batch,sameBatch);assert.equal(urls.length,8);
 for(const id of COMMODITY_IDS){const q=batch[id]!;assert(q,id);const raw={id,price:q.priceUsdMt,changeWoW:q.changeWoW,changeMoM:q.changeMoM,_potatoExportQuote:q.potatoSnapshot} as Commodity;
  const before=JSON.stringify(raw);
  for(const currency of ['KRW','USD','EUR'] as const){const mapped=mapCommodityForDisplay(raw,currency,fx),display=commodityBenchmarkDisplay(mapped,currency);
   const factor=currency==='KRW'?fx.USD_KRW:currency==='EUR'?1/fx.EUR_USD:1;
   const expected=id==='potato-starch'?q.potatoSnapshot!.data!.eurPerMT*(currency==='KRW'?fx.USD_KRW*fx.EUR_USD:currency==='USD'?fx.EUR_USD:1):q.priceUsdMt*factor;
   assert.equal(mapped.price,expected);assert.equal(display.unit,'/MT');assert.equal(mapped.changeWoW,q.changeWoW);assert.equal(mapped.changeMoM,q.changeMoM);
   if(id==='potato-starch'){const $=load(renderToStaticMarkup(createElement(PotatoBenchmarkDisplay,{quote:q.potatoSnapshot!,currency,fx})));assert.equal($('span').first().text(),display.value);assert.equal($('span').last().text(),display.unit);const changes=load(renderToStaticMarkup(createElement(PotatoPriceChangesDisplay,{quote:q.potatoSnapshot!,currency,fx})));assert(changes.text().includes(commodityComparisonDisplay(mapped,'mom')));assert.equal(changes('.grid > div').first().children('span').first().text(),'전월 (MoM)');assert.equal(changes('.grid > div').last().children('span').first().text(),'전년 동월 (YoY)');assert(changes('.grid > div').last().text().includes(commodityComparisonDisplay(mapped,'yoy')));assert(commodityComparisonDisplay(mapped,'yoy','YoY').endsWith('% YoY'));const alternate=structuredClone(mapped);alternate._potatoExportQuote!.changes!.yoy.pct=12.34;assert.equal(commodityComparisonDisplay(alternate,'yoy','YoY'),'+12.34% YoY');alternate._potatoExportQuote!.changes!.yoy.amountEurPerMT=null;assert.equal(commodityComparisonDisplay(alternate,'yoy'),'확인 불가');}
  }assert.equal(JSON.stringify(raw),before);
 }
 assert.equal(batch.wheat!.priceUsdMt,inputs[endpoint('wheat')].metrics.srw.latestPriceMt);
 const palm=structuredClone(inputs[endpoint('palm-oil')]);palm.data.at(-1).usdPerMT=9999;assert.equal(quoteFromResponse('palm-oil',palm)!.priceUsdMt,palm.data.at(-1).cpoUsd,'FCPO never replaced by Olein/generic field');
 for(const id of COMMODITY_IDS){const packet=inputs[endpoint(id)];if(id==='potato-starch')packet.data.eurPerMT+=1;else if(id==='wheat'){packet.metrics.srw.latestPriceMt+=1;packet.data.at(-1).srwMt+=1;}else{const latest=packet.data.at(-1);latest.usdPerMT+=1;if(id==='palm-oil')latest.cpoUsd+=1;}}
 const updated=await fetchCommodityQuotes();for(const id of COMMODITY_IDS){assert.notEqual(id==='potato-starch'?updated[id]!.potatoSnapshot!.data!.eurPerMT:updated[id]!.priceUsdMt,id==='potato-starch'?batch[id]!.potatoSnapshot!.data!.eurPerMT:batch[id]!.priceUsdMt,id+' saved reload');}
 const sparse=quoteFromResponse('corn',{success:true,data:[{date:'2026-10-23',usdPerMT:100}]})!;assert.equal(sparse.changeWoW,null);assert.equal(sparse.changeMoM,null);assert.equal(commodityComparisonDisplay({id:'corn',changeMoM:null} as Commodity,'mom'),'--%');
 const missingPotato={id:'potato-starch',price:0,changeMoM:null,_potatoExportQuote:batch['potato-starch']!.potatoSnapshot} as Commodity;
 const euroFallback=mapCommodityForDisplay(missingPotato,'USD',null);assert.equal(euroFallback._canonicalDisplayCurrency,'EUR');assert(commodityBenchmarkDisplay(euroFallback,'USD').value.startsWith('€'));assert.equal(commodityComparisonDisplay(missingPotato,'mom'),commodityComparisonDisplay(mapCommodityForDisplay(missingPotato,'EUR',null),'mom'));assert.equal(commodityComparisonDisplay({...missingPotato,_potatoExportQuote:undefined},'mom'),'확인 불가');
 assert.equal(mapCommodityForDisplay({id:'corn',price:100} as Commodity,'KRW',null).price,0);
 console.log('PASS all eight saved sources, SRW/FCPO selection, 24 currency views, shared Potato display/monthly comparisons, saved-data reload, concurrent-read deduplication and missing-data/FX behavior; no network.');
}finally{globalThis.fetch=originalFetch;}
