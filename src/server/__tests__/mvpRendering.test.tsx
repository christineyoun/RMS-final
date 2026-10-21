import {originRadarDisplayText,OriginRadar} from '../../components/OriginRadar.tsx';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommodityDetail } from '../../components/CommodityDetail.tsx';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import { COMMODITIES } from '../../data/commoditiesData.ts';

for(const commodity of COMMODITIES){
  const html=renderToStaticMarkup(<CommodityDetail commodity={commodity} currency="USD" onNavigateBack={()=>{}} onRefreshGemini={()=>{}} isSyncing={false}/>);
  for(const section of ['commodity-pdf-page-1','commodity-pdf-page-2','scm-benchmark-price-card','Origin Radar','Market Intelligence','animate-pulse'])
    assert.ok(html.includes(section),commodity.id+' renders '+section);
  assert.ok(!html.includes('NaN')&&!html.includes('Infinity'),commodity.id+' has no invalid displayed values');
  if(commodity.id==='potato-starch'){
    assert.ok(!html.includes('EEX: PS'));
    assert.ok(html.includes('2021 Actual')&&html.includes('2026 Estimate'),'Potato opens with the full annual history');
  }

}
const redirect=renderToStaticMarkup(<AiRecommendation researchSources={[{title:'TTSA report',url:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/example'}]}/>);
assert.ok(redirect.includes('Google 중계 링크 (원문 미확인)'));
console.log('PASS: all eight commodity pages render every major section; PDF containers retained; original Potato production graph and redirect labels visible.');

assert.equal(originRadarDisplayText('수출 10M MT (전월 비교 자료 없음)','corn'),'수출 10M MT');
const footer=renderToStaticMarkup(<OriginRadar commodityId="corn" origins={[{region:'미국',sourceOrg:'USDA',weatherSource:'NASA POWER',exports:'수출 10M MT (전월 비교 자료 없음)'}]}/>);
assert.ok(!footer.includes('전월 비교 자료 없음'));assert.equal((footer.match(/USDA WASDE/g)||[]).length,1);
