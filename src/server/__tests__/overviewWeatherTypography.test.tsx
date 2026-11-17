import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {OverviewTerminal} from '../../components/OverviewTerminal';

test('overview radar shares the dashboard typography and the Origin Radar globe',()=>{
  const $=load(renderToStaticMarkup(<OverviewTerminal commodities={[]} macroDrivers={[]} marketIssues={[]}
    currency="KRW" onRefreshGemini={()=>{}} onNavigate={()=>{}} isSyncing={false}/>));
  const radar=$('#external-pipeline-section');
  assert.equal(radar.find('h3').text().trim(),'주요 생산지 기상 레이더 (Weather Radar)');
  assert.equal(radar.find('svg.lucide-globe.text-slate-700[aria-hidden="true"]').length,1);
  for(const [id,label] of [
    ['weather-us-corn-belt','미국 콘벨트 (Iowa)'],
    ['weather-sa-soy-belt','남미 대두벨트 (Mato Grosso)'],
    ['weather-eu-crop-radar','프랑스 소맥 (France)'],
  ]){
    const measures=radar.find('#'+id);
    assert(measures.hasClass('tabular-nums'));
    assert.equal(measures.find('.font-mono').length,0);
    assert.equal(measures.children().first().text(),'—°C');
    assert.equal(measures.children().last().text(),'—mm');
    assert.equal(measures.prev().find('span.font-bold').text(),label);
  }
  assert.match(radar.find('.rms-source-group').text(),/Open-Meteo Agro-Climatic Radar/);
});
