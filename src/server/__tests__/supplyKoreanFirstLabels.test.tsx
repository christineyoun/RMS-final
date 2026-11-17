import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {SupplyMetricGrid} from '../../components/CommodityWasdeCard';
import {unavailableWasdeRecord} from '../../components/WasdeTerminal';
import {PotatoRawSupplyCard} from '../../components/PotatoRawSupplyCard';
import {TapiocaCropSupplyCard} from '../../components/TapiocaCropSupplyCard';
import {TTSA_ANNUAL_EXPORTS,type ThaiStarchExports} from '../../utils/thaiStarchExports';
import {retainedPotatoJrcPublication} from '../../utils/potatoJrcPublication';

const firstLabels=(html:string)=>{
  const $=load(html);
  return $('[data-supply-grid] > div > span:first-child').map((_,el)=>$(el).text()).get();
};

test('all six USDA commodity cards render Korean-first labels on both year grids',()=>{
  for(const id of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar']){
    const data={...unavailableWasdeRecord(id),stocksToUseRatio:32.5};
    for(const previous of [false,true]){
      const html=renderToStaticMarkup(<SupplyMetricGrid data={data} showSupplyFigures commodityId={id} previous={previous}/>);
      assert.deepEqual(firstLabels(html),['총생산 (Production)','총소비 (Domestic Consumption)','기말재고 (Ending Stocks)','총수출량 (Exports)',
        ...(id==='soybean-oil'?['연간 대두 압착량 전망 (Annual Soybean Crush Forecast)','생산/압착량 환산율 (Oil Output-to-Crush Ratio)']:
          ['수확 면적 (Area Harvested)','단수 (Yield)'])]);
      assert.match(html,/재고율 \(S\/U\) 32\.5%/);
    }
  }
});

test('both starch cards keep the same bilingual order and retain the meaning of the figures',()=>{
  const potato=renderToStaticMarkup(<PotatoRawSupplyCard data={{harvestYear:'2025',productionMMT:35.25,area1000HA:781.6,weightedYieldMTHA:45.11}}
    publication={retainedPotatoJrcPublication(new Date('2030-11-16T00:00:00Z'))}/>);
  assert.deepEqual(firstLabels(potato),['원료감자 생산량 (Raw Potato Production)','재배 면적 (Cultivated Area)','면적가중 단수 (Area-weighted Yield)']);
  assert.equal(load(potato)('[data-supply-grid]').text().match(/4국 · Eurostat 2025/g)?.length,3);
  const year=new Date().getUTCFullYear()-1;
  const exports:ThaiStarchExports={scope:'thailand-tapioca-starch-exports',unit:'tonnes',period:'calendar-year',
    current:{calendarYear:year,nativeTonnes:4_000_000,modifiedTonnes:1_100_000},
    source:{name:'TTSA',authority:'Thai Customs Department',url:TTSA_ANNUAL_EXPORTS,retrievedAt:new Date().toISOString(),sha256:'a'.repeat(64)}};
  const tapioca=renderToStaticMarkup(<TapiocaCropSupplyCard crop={null} exports={exports}/>),$=load(tapioca);
  assert.deepEqual(firstLabels(tapioca),['카사바 생산량 (Cassava Production)','카사바 수확면적 (Harvested Area)','카사바 평균단수 (Cassava Yield)']);
  assert.deepEqual($('[data-supply-grid="exports"] tbody th').map((_,el)=>$(el).text()).get(),['천연전분 (Native Starch)','변성전분 (Modified Starch)']);
  assert.deepEqual($('[data-supply-grid="exports"] tbody tr:first-child td').map((_,el)=>$(el).text()).get(),['4.00 MMT','—']);
  const reference=load(potato);
  for(const part of ['h4','table','thead'])assert.equal($(part).attr('class'),reference(part).attr('class'),part+' typography matches potato');
  assert.equal($('tbody th[scope="row"].font-semibold.text-slate-700').length,2);
  assert.equal(reference('tbody th[scope="row"].font-semibold.text-slate-700').length,6);
  assert($('tbody td').first().hasClass('font-semibold'));
  const withComparison=load(renderToStaticMarkup(<TapiocaCropSupplyCard crop={null} exports={{...exports,
    previous:{calendarYear:year-1,nativeTonnes:4_500_000,modifiedTonnes:1_000_000}}}/>));
  const changes=withComparison('tbody tr td:last-child');
  assert(changes.eq(0).hasClass('text-[#DF0029]'));
  assert(changes.eq(1).hasClass('text-[#059669]'));
  assert(!changes.is('.font-mono,.font-semibold'));
});
