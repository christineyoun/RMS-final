import fs from 'node:fs';import assert from 'node:assert/strict';import {mock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {OriginRadar,originWeatherDisplayStatus} from '../../components/OriginRadar';
import {isVisibleWeatherStatus,visibleWeatherLabels} from '../../utils/weatherStatusPresentation';

for(const label of ['판정 보류','자료 부족','특이 없음','','neutral','expired'])assert.deepEqual(visibleWeatherLabels(label),[]);
for(const label of ['양호','고온 주의','저온 주의','강수 부족 주의','강수 과다 주의'])assert(isVisibleWeatherStatus(label));
assert.deepEqual(visibleWeatherLabels('고온 주의 · 강수 집중 · 판정 보류'),['고온 주의','강수 과다 주의']);
const now=new Date('2026-10-26T00:00:00Z');
mock.timers.enable({apis:['Date'],now});
try{
 // Existing certified-adapter presentation contract: no new weather screening or production data.
 const origin:any={region:'OFFLINE display fixture',weatherSource:'Open-Meteo',weatherDataKind:'archived-model',weatherAsOf:'2026-10-25',weatherValidUntil:new Date(+now+3600000).toISOString(),weatherPills:[{label:'특이 없음',basis:'OFFLINE previously supported assessment'}],weatherScreening:{complete:true,scope:'OFFLINE certified screen',limitations:[],sources:[]}};
 const render=(o:any)=>load(renderToStaticMarkup(<OriginRadar commodityId="soybean" origins={[o]}/>));
 assert.equal(originWeatherDisplayStatus(origin).label,'양호');assert.equal(render(origin)('[data-weather-pills]').text(),'양호');
 for(const label of ['고온 주의','저온 주의','강수 부족 주의','강수 과다 주의']){
  const warning={...origin,weatherPills:[{label,basis:'OFFLINE supported retained screen'}],weatherValidUntil:new Date(+now+3600000).toISOString()};
  assert.equal(render(warning)('[data-weather-pills]').text(),label);
 }
 for(const neutral of [{...origin,weatherPills:[{label:'판정 보류',basis:'OFFLINE deferred'}]},{...origin,weatherEvidence:[{rainfallDays:6,precip7mm:null}]},{...origin,weatherValidUntil:new Date(+now-1).toISOString(),weatherCropContext:undefined}]){
  assert.equal(originWeatherDisplayStatus(neutral).level,'판정 보류');const $=render(neutral);assert.equal($('[data-weather-pills]').length,0);assert(!$('.origin-card').text().includes('판정 보류'));
 }
 const backup='.rms-backups/weather-neutral-height-2026-10-26/src/components/';
 const before=fs.readFileSync(backup+'OriginRadar.tsx','utf8'),after=fs.readFileSync('src/components/OriginRadar.tsx','utf8');
 const assessments=(s:string)=>s.slice(s.indexOf('export function originWeatherDisplayStatus'),s.indexOf('export const originRadarDisplayText'));
 assert.equal(assessments(after),assessments(before),'assessment, expiry and diagnostic functions untouched');
 const detailBefore=fs.readFileSync(backup+'CommodityDetail.tsx','utf8'),detailAfter=fs.readFileSync('src/components/CommodityDetail.tsx','utf8');
 assert.equal(detailAfter,detailBefore.replace('              {(isSoybean||isSoybeanOil||isSugar) && <p className="text-[10px] text-[#6b7280] leading-snug">관측 최저가 0% · 최고가 100% 기준의 가격 위치입니다.</p>}\n',''),'only 52-week explanatory sentence removed');
 console.log('PASS deferred/partial/expired badges absent, supported green/four warnings retained, multi-status display, original assessment and range calculations unchanged.');
}finally{mock.timers.reset();}
