import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatSignedCurrencyPerMt} from '../../utils/currencyFormatting';
import {CommodityDetail} from '../../components/CommodityDetail';
import {COMMODITIES} from '../../data/commoditiesData';
import {mapCommodityForDisplay} from '../../services/commodityQuoteSource';
import {parseDatedDisplayFx,soybeanDisplayFactor} from '../../utils/soybeanPriceSnapshot';
import {latestCommonPalmSpread} from '../../utils/palmPriceIntegrity';

assert.equal(formatSignedCurrencyPerMt(37588,'KRW'),'+₩37,588 /MT');
assert.equal(formatSignedCurrencyPerMt(-23085,'KRW'),'−₩23,085 /MT');
for (const [currency,symbol] of [['USD','$'],['EUR','€'],['KRW','₩']] as const) {
  const decimals=currency==='KRW'?'':'.00';
  assert.equal(formatSignedCurrencyPerMt(1234,currency),`+${symbol}1,234${decimals} /MT`);
  assert.equal(formatSignedCurrencyPerMt(-1234,currency),`−${symbol}1,234${decimals} /MT`);
  for(const value of [0,-0,0.001,-0.001]) assert.equal(formatSignedCurrencyPerMt(value,currency),`${symbol}0${decimals} /MT`);
  for(const value of [NaN,Infinity,-Infinity]) assert.equal(formatSignedCurrencyPerMt(value,currency),'--');
}
assert.equal(formatSignedCurrencyPerMt(12.345,'EUR'),'+€12.35 /MT');
assert.equal(formatSignedCurrencyPerMt(-12.345,'USD'),'−$12.35 /MT');
assert.equal(formatSignedCurrencyPerMt(12.6,'KRW'),'+₩13 /MT');

const inputs=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const history=inputs['/api/history?commodity=palm-oil&timeframe=5Y'];
const packet=inputs['/api/rms/free-fx'],fx=parseDatedDisplayFx(packet.raw,packet.verifiedAt)!;
assert.ok(history?.data?.length);
const before=JSON.stringify(history),spread=latestCommonPalmSpread(history.data)!;
for(const currency of ['USD','EUR','KRW'] as const){
  const commodity=mapCommodityForDisplay({...COMMODITIES.find(c=>c.id==='palm-oil')!,_canonicalHistorySnapshot:history},currency,fx);
  const html=renderToStaticMarkup(createElement(CommodityDetail,{commodity,currency,onNavigateBack(){},onRefreshGemini(){},isSyncing:false}));
  assert.ok(html.includes('정규화 벤치마크 차이: '+formatSignedCurrencyPerMt(spread.usdPerMT*soybeanDisplayFactor(currency,fx),currency)));
  assert.ok(!html.includes('정규화 벤치마크 차이('));
}
assert.equal(JSON.stringify(history),before,'rendering preserves source observations and timestamps');
// Hover-only output uses exactly the formatter tested above without changing its subtraction.
const source=fs.readFileSync(new URL('../../components/CommodityDetail.tsx',import.meta.url),'utf8');
assert.ok(source.includes('formatSignedCurrencyPerMt(palmCrosshairState.oleinPrice - palmCrosshairState.cpoPrice, currency)'));
console.log('PASS Palm signed spreads, zero/rounding/unavailable formatting, date-free rendered labels, tooltip formatter wiring and immutable observations.');
