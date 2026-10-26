/** Consolidated refresh regression: classification stays intact, badges never render. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {mock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {OriginRadar,originWeatherDisplayStatus,originWeatherDisplayText} from '../../components/OriginRadar';
import {OverviewTerminal} from '../../components/OverviewTerminal';
import {COMMODITY_IDS} from '../../services/commodityQuoteSource';
const now=new Date('2026-10-26T00:00:00Z');mock.timers.enable({apis:['Date'],now});
try{
 const origin:any={region:'OFFLINE display fixture',production:'12.34M MT',riskWeather:'이전 7일 강수량: 15.0mm',weatherSource:'Open-Meteo',weatherDataKind:'archived-model',weatherAsOf:'2026-10-25',weatherValidUntil:new Date(+now+3600000).toISOString(),weatherPills:[{label:'특이 없음',basis:'OFFLINE previously supported assessment'}],weatherScreening:{complete:true,scope:'OFFLINE certified screen',limitations:[],sources:[]}};
 assert.equal(originWeatherDisplayStatus(origin).label,'양호','Green assessment remains available internally');
 const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-presentation-current.json',import.meta.url),'utf8'));
 let cases=0;
 const unchanged=(o:any,id:string)=>{
  const before=JSON.stringify(o),$=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={[o]}/>));
  assert.equal($('[data-weather-pills], [data-weather-assessment], .origin-card .rms-status-positive, .origin-card .rms-status-warning, .origin-card .rms-status-negative').length,0);
  assert.equal($('.origin-card').length,1);assert($('.origin-card').text().includes(o.region));
  const weather=originWeatherDisplayText(o);if(weather)assert.equal($('[data-origin-weather]').text(),weather);
  assert.equal(JSON.stringify(o),before,'Observations, status evidence and production are never rewritten');cases++;
 };
 for(const id of COMMODITY_IDS){
  for(const o of saved[id])unchanged(o,id);
  for(const label of ['특이 없음','양호','고온 주의','저온 주의','강수 부족 주의','강수 과다 주의','주의','위험','자료 부족','판정 보류'])unchanged({...origin,weatherPills:[{label,basis:'OFFLINE changed daily assessment'}]},id);
  unchanged({...origin,weatherValidUntil:new Date(+now-1).toISOString(),weatherCropContext:undefined},id);
  unchanged({...origin,weatherEvidence:[{rainfallDays:6,precip7mm:null}]},id);
 }
 const overview=load(renderToStaticMarkup(<OverviewTerminal {...{commodities:[],currency:'KRW',onSelectCommodity:()=>{},onNavigate:()=>{},isSyncing:false} as any}/>));
 const weather=overview('#external-pipeline-section');assert(weather.length);assert.equal(weather.find('[data-weather-pills], [data-weather-assessment], .rms-status-positive, .rms-status-warning, .rms-status-negative').length,0);
 const after=fs.readFileSync('src/components/OriginRadar.tsx','utf8');
 assert.equal(originWeatherDisplayStatus(origin).label,'양호','Retained screening still computes green internally');
 assert(!after.includes('data-weather-pills'));assert(!after.includes('isVisibleWeatherStatus'));
 console.log(`PASS ${cases} actual/changed/expired/partial cases across all eight Origin Radars, Overview badge-free, unchanged weather text and assessments.`);
}finally{mock.timers.reset();}
