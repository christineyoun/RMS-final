import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {OriginRadar,type OriginItem} from '../../components/OriginRadar';
import {COMMODITY_IDS} from '../../services/commodityQuoteSource';

const render=(commodityId:string,origin:OriginItem)=>load(renderToStaticMarkup(<OriginRadar commodityId={commodityId} origins={[origin]}/>));

test('only starch pages identify the crop in the production pill across the eight commodities',()=>{
  const origin={region:'검증 산지',marketYear:'2030',production:'12.34M MT',exports:'5.67M MT'};
  const before=JSON.stringify(origin);
  for(const id of COMMODITY_IDS){
    const $=render(id,origin);
    const label=id==='potato-starch'?'2030 감자 생산':id==='tapioca-starch'?'카사바 생산':'국가 생산';
    assert.equal($('[data-origin-production]').text(),label+' 12.34M MT',id);
    assert.match($('.origin-card').text(),/국가 수출 5\.67M MT/);
  }
  assert.equal(JSON.stringify(origin),before);
});

test('EU scope, potato estimate status, and unavailable data remain explicit',()=>{
  assert.equal(render('wheat',{region:'유럽연합 (EU-27)',production:'25.01M MT'})('[data-origin-production]').text(),'EU 생산 25.01M MT');
  assert.equal(render('potato-starch',{region:'폴란드',marketYear:'2030',production:'12.34M MT (2030 추정)'})('[data-origin-production]').text(),'2030 감자 생산 추정 12.34M MT');
  assert.equal(render('tapioca-starch',{region:'태국',production:'12.34M MT (2030/31 전망)'})('[data-origin-production]').text(),'카사바 생산 12.34M MT');
  assert.equal(render('tapioca-starch',{region:'태국',production:''})('[data-origin-production]').length,0);
});
