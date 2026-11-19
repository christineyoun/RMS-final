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
  const badge=$('[data-chart-endpoint-label="fcpo"]').text();
  assert.match(badge,/\/MT$/,currency+': FCPO badge uses metric tonnes');
  assert(!/\s\/MT$/.test(badge),currency+': no space before /MT');
  assert(html.includes('Bursa FCPO'),currency+': active publisher label remains');
  assert.doesNotMatch(html,/RBD Palm Olein|RBD Olein|FPOLc1/i,currency+': legacy benchmark is not rendered');
}
assert.equal(JSON.stringify(history),original,'price and FX observations are unchanged');
const source=fs.readFileSync(new URL('../../components/CommodityDetail.tsx',import.meta.url),'utf8');
assert(source.includes('</span> FCPO:'), 'tooltip uses FCPO');
assert.doesNotMatch(source,/DISPLAY_PALM_OLEIN|RBD Palm Olein/i);
console.log('PASS: FCPO-only chart across USD/EUR/KRW with archived inputs left untouched.');
