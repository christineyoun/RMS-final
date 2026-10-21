/** Soybean display contract; current weather evidence, never legacy supply status. */
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OriginRadar} from '../../components/OriginRadar.tsx';
import type {WeatherPillLabel} from '../../utils/originWeatherPills.ts';
for(const label of ['고온 주의','특이 없음','자료 부족'] as WeatherPillLabel[]){
 const html=renderToStaticMarkup(<OriginRadar commodityId="soybean" origins={[{region:'대표 지점',status:'양호',riskWeather:'최근 7일 21.5mm',sourceOrg:'USDA FAS',weatherSource:'NASA POWER',weatherPills:[{label,basis:'검증된 시험 근거'}],weatherValidUntil:new Date(Date.now()+3600000).toISOString()}]}/>);
 assert.ok(html.includes('>'+(label==='특이 없음'?'이상 없음':label)+'</span>'));assert.ok(html.includes('21.5mm'));assert.ok(html.includes('출처: USDA FAS PSD · NASA POWER'));
 for(const old of ['양호','모니터링','고온 특이 없음','기상 자료 부족'])assert.ok(!html.includes('>'+old+'</span>'));
}
console.log('PASS: compact Soybean weather-only labels, unchanged measurements and deduplicated footer.');
