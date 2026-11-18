import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {OverviewTerminal} from '../../components/OverviewTerminal';
import {CommodityWasdeCard} from '../../components/CommodityWasdeCard';
import {COMMODITIES} from '../../data/commoditiesData';

test('overview card and section headings use the commodity card type scale',()=>{
  const detail=load(renderToStaticMarkup(<CommodityWasdeCard commodityId="wheat"/>));
  const size=detail('h3').attr('class')?.split(' ').find(c=>c==='text-base');
  assert.equal(size,'text-base');
  const $=load(renderToStaticMarkup(<OverviewTerminal commodities={COMMODITIES} macroDrivers={[]} marketIssues={[]}
    currency="KRW" onRefreshGemini={()=>{}} onNavigate={()=>{}} isSyncing={false}/>));
  const primary=$('#wasde-weather-grid h3, #macro-drivers-section h2, .overview-page-2 h2');
  assert.equal(primary.length,5);
  assert.equal(primary.not('.'+size).length,0);
  assert.equal($('.commodity-category-section > div:first-child.'+size).length,3);
  const commodityTitles=$('.commodity-card h3');
  assert.equal(commodityTitles.length,COMMODITIES.length);
  assert.equal(commodityTitles.filter((_,el)=>$(el).hasClass('text-[15px]')).length,COMMODITIES.length);
  for(const id of ['fx','energy','freight','policy']){
    const card=$('#driver-'+id);
    assert.equal(card.find('span.font-bold').filter((_,el)=>$(el).hasClass('text-[15px]')).length,1);
    assert.equal(card.find('span.material-symbols-outlined').filter((_,el)=>$(el).hasClass('[@media_screen]:!text-[18px]')).length,1);
  }
  const movers=$('span').filter((_,el)=>$(el).text().trim()==='오늘의 주요 원자재 변동률 (Portfolio Top Movers)');
  assert.equal(movers.length,1);
  assert(movers.hasClass('text-[15px]'));
  assert(movers.hasClass('font-bold'));
  const desk = $('span').filter((_, el) => $(el).text().trim() === '데스크 구매 지침 (DESK DIRECTIVE)');
  assert.equal(desk.length, 1);
  assert(desk.hasClass('text-[11px]'));
  assert(desk.hasClass('py-1'));
  assert.equal($('#external-pipeline-section h3').text().trim(),'주요 생산지 기상 레이더 (Weather Radar)');
});
