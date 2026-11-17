import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {CommodityWasdeCard} from '../../components/CommodityWasdeCard';
import {OverviewTerminal} from '../../components/OverviewTerminal';
import {dailyFreeSourceJobs} from '../freeDailyJobs';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar'];
const official='https://apps.fas.usda.gov/psdonline/app/index.html';

test('overview uses the dashboard font and shows the year only next to each commodity',()=>{
  const $=load(renderToStaticMarkup(<OverviewTerminal commodities={[]} macroDrivers={[]} marketIssues={[]} currency="KRW" onRefreshGemini={()=>{}} onNavigate={()=>{}} isSyncing={false}/>));
  const card=$('#wasde-weather-grid').children().first();
  assert.equal(card.find('h3').text().trim(),'글로벌 수급 밸런스 (Global S&D Balance)');
  assert.doesNotMatch(card.children().first().text(),/Market Year|품목별/);
  assert.equal(card.find('tbody tr').length,ids.length);
  assert.equal(card.find('tbody').text().match(/Market Year:/g)?.length,ids.length);
  assert(card.find('table').hasClass('tabular-nums'));
  assert.equal(card.find('tbody .font-mono').length,0);
  assert.equal(card.find('tbody tr:first-child td:last-child').hasClass('font-bold'),true);
  assert.equal(card.find('.rms-source-group a').text().trim(),'USDA FAS PSD');
  assert.equal(card.find('.rms-source-group a').attr('href'),official);
});

test('commodity USDA footer matches overview without touching the six scheduled free PSD jobs',()=>{
  for(const id of ids){
    const $=load(renderToStaticMarkup(<CommodityWasdeCard commodityId={id}/>));
    const source=$('.rms-source-group a');
    assert.equal(source.text().trim(),'USDA FAS PSD');
    assert.equal(source.attr('href'),official);
  }
  const jobs=dailyFreeSourceJobs().filter(j=>j.key.endsWith('-world'));
  assert.deepEqual(jobs.map(j=>j.commodity),ids);
  assert(jobs.every(j=>j.source==='USDA FAS PSD'&&j.cadenceHours===24));
});
