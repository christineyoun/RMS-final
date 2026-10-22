/** Visible-only weather cleanup; immutable backend evidence, values, quality flags and pills. */
import fs from 'node:fs';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';import {mock} from 'node:test';
import {OriginRadar,originWeatherDisplayText} from '../../components/OriginRadar.tsx';
import {parseSharedOpenMeteo,sharedWeatherSummary,sharedWeatherScreen} from '../originWeatherService.ts';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-risk-records-v1.json',import.meta.url),'utf8')),now=new Date(f.now);mock.timers.enable({apis:['Date'],now});
try{
 for(const [id,config] of Object.entries(f.configs) as [string,any[]][]){
  const points=config.map(p=>{const r=f.records[[p.lat,p.lon].join(',')];return parseSharedOpenMeteo(r.body,p,r.checkedAt,id==='palm-oil'?28:7)!;});
  const original:any={region:id,riskWeather:sharedWeatherSummary(points),weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherEvidence:points,...sharedWeatherScreen(points,config,{heatDays:3,rainMm:90},now)};
  const before=JSON.stringify(original),display=originWeatherDisplayText(original);
  assert(display.startsWith('모델 기상 · 최근 완료 7일:'));assert(!/20\d{2}[-./]\d{2}[-./]\d{2}|[A-Z][A-Za-z]+\//.test(display));
  for(const e of points){assert(display.includes(e.location));assert(display.includes(e.precip7mm+'mm'));if(e.hotDays)assert(display.includes(`35°C 이상 ${e.hotDays}일`));}
  const $=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={[original]}/>));assert($('.origin-card').text().includes(display));assert(!$('.origin-card').text().includes(points[0].timeZone));assert($('.origin-card').attr('title')!==undefined);assert.equal(JSON.stringify(original),before,'do not mutate raw dates/source/quality evidence');
  // The other shared shape (Palm wrapper and single-point Sugar/Potato/Tapioca) uses the same presentation.
  for(const evidence of [points[0],{shared:points[0]}]){const single={...original,weatherEvidence:evidence,riskWeather:`모델 기상(현지 ${points[0].windowStart}~${points[0].lastDay}, ${points[0].timeZone}): 12.3mm · 직전 3주 주평균 8.5mm`};assert.equal(originWeatherDisplayText(single),'모델 기상 · 최근 완료 7일: 12.3mm · 직전 3주 주평균 8.5mm');}
  for(const patch of [{rainfallDays:6},{temperatureDays:6},{retrievalFailed:true},{lastDay:'2026-10-10'},{checkedAt:'2026-10-01T00:00:00Z'},{timeZone:'bad'}]){const bad={...original,weatherEvidence:[{...points[0],...patch}]};assert(!originWeatherDisplayText(bad).includes('최근 완료 7일'),'incomplete/unverified/old records cannot be described as current complete weather');}
  assert(!originWeatherDisplayText({...original,weatherPills:[{label:'자료 부족',basis:'required point or source validation incomplete'}]}).includes('최근 완료 7일'),'backend quality failure cannot be advertised as complete');
  const failure={...original,riskWeather:original.riskWeather+' · 저장 기상(재확인 실패)'};const text=originWeatherDisplayText(failure);assert(text.includes('저장 기상(재확인 실패)'));assert(!text.includes('최근 완료 7일'));assert(text.includes(points[0].location));
  assert(!originWeatherDisplayText({...original,weatherEvidence:undefined}).includes('최근 완료 7일'));
  const upstream={...original,weatherEvidence:undefined,weatherAsOf:points[0].lastDay,riskWeather:'원료 대두 재배지 모델 기상 · 현지 2026-10-14~2026-10-20: 2.8mm · 35°C 이상 0일'};
  assert.equal(originWeatherDisplayText(upstream),'원료 대두 재배지 모델 기상 · 최근 완료 7일: 2.8mm · 35°C 이상 0일');
  for(const patch of [{weatherValidUntil:'2026-10-01T00:00:00Z'},{weatherPills:[{label:'자료 부족',basis:'partial'}]},{weatherPills:[{label:'판정 보류',basis:'unverified'}]}] as any[]){assert(!originWeatherDisplayText({...upstream,...patch}).includes('최근 완료 7일'));}
 }
 const partial=originWeatherDisplayText({riskWeather:'모델 기상 · 현지 완료 7일: 아이오와 강수 6/7일 확인 (2026-10-14~2026-10-20, America/Chicago) · 기온 5/7일 확인'});assert.equal(partial,'모델 기상: 아이오와 강수 6/7일 확인 · 기온 5/7일 확인');
 for(const text of ['모델 기상(현지 2026.10.14～2026.10.20, America/Argentina/Cordoba): 0.0mm · 35°C 이상 3일','모델 기상 · 2026-10-14~2026-10-20 America/Cuiaba · 12.3mm','모델 기상(2026-10-14~2026-10-20, UTC): 1.0mm']){const cleaned=originWeatherDisplayText({riskWeather:text});assert(!/2026|America\/|UTC|\(\s*\)/.test(cleaned));assert(cleaned.includes('mm'));}
 assert.equal(originWeatherDisplayText({riskWeather:'강수 2mm/day · 강수 집중 · 고온 주의'}),'강수 2mm/day · 강수 집중 · 고온 주의');
 console.log('PASS all eight original weather packets; no visible dates/IANA zones; exact values/regions/heat/baselines preserved; partial, failed and stale periods never called current complete; raw provenance immutable.');
}finally{mock.timers.reset();}
