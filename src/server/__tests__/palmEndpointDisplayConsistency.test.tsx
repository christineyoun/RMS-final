import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {CommodityDetail} from '../../components/CommodityDetail';
import {COMMODITIES} from '../../data/commoditiesData';
import {mapCommodityForDisplay} from '../../services/commodityQuoteSource';
import {parseDatedDisplayFx} from '../../utils/soybeanPriceSnapshot';

// All observations are test fixtures; no market, FX, or Gemini calls.
const inputs=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-commodity-quotes.json',import.meta.url),'utf8'));
const history=inputs['/api/history?commodity=palm-oil&timeframe=5Y'];
const packet=inputs['/api/rms/free-fx'];
const fx=parseDatedDisplayFx(packet.raw,packet.verifiedAt)!;
const commodity=COMMODITIES.find(c=>c.id==='palm-oil')!;
const original=JSON.stringify(history);

for(const currency of ['USD','EUR','KRW'] as const){
  const display=mapCommodityForDisplay({...commodity,_canonicalHistorySnapshot:history},currency,fx);
  const html=renderToStaticMarkup(createElement(CommodityDetail,{
    commodity:display,currency,onNavigateBack(){},onRefreshGemini(){},isSyncing:false
  }));
  const $=load(html);
  const red=$('[data-chart-endpoint-label="cpo"]').text();
  const blue=$('[data-chart-endpoint-label="olein"]').text();
  assert.match(red,/^FCPO .+\/MT$/,`${currency}: red floating badge shows FCPO plus /MT`);
  assert.match(blue,/^RBD Olein .+\/MT$/,`${currency}: blue floating badge shows full RBD Olein plus /MT`);
  assert(!/\s\/MT$/.test(red)&&!/\s\/MT$/.test(blue),`${currency}: no space before /MT`);
  assert(html.includes('FCPO (팜유 선물)'),`${currency}: chart and percentile legends identify FCPO`);
  assert(html.includes('RBD Olein (정제 올레인)'),`${currency}: blue legends identify RBD Olein`);
  assert(!html.includes('> CPO (원유 팜유)'),`${currency}: generic CPO chart legend removed`);
}
assert.equal(JSON.stringify(history),original,'price and FX observations are unchanged');
const source=fs.readFileSync(new URL('../../components/CommodityDetail.tsx',import.meta.url),'utf8');
assert(source.includes('</span> FCPO:'), 'tooltip uses FCPO');
assert(source.includes('</span> RBD Olein:'), 'tooltip uses RBD Olein');
console.log('PASS Palm FCPO and RBD Olein chart labels, /MT in both badges across USD/EUR/KRW, tooltip and 52-week naming, immutable data.');
