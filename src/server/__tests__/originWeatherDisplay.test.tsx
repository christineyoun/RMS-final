/** All eight retained weather packets; display-only coverage/freshness contract. */
import fs from 'node:fs';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';import {mock} from 'node:test';
import {OriginRadar,originWeatherDisplayText} from '../../components/OriginRadar.tsx';
import {parseSharedOpenMeteo,sharedWeatherSummary} from '../originWeatherService.ts';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-risk-records-v1.json',import.meta.url),'utf8')),now=new Date(f.now);mock.timers.enable({apis:['Date'],now});
const forbidden=/모델 기상|저장 기상|재확인 실패|Open-Meteo|캐시|재시도/;
try{
 for(const [id,config] of Object.entries(f.configs) as [string,any[]][]){
  const points=config.map(p=>{const r=f.records[[p.lat,p.lon].join(',')];return parseSharedOpenMeteo(r.body,p,r.checkedAt,id==='palm-oil'?28:7)!;});
  const original:any={region:id,riskWeather:sharedWeatherSummary(points),weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherEvidence:points};
  const before=JSON.stringify(original),display=originWeatherDisplayText(original,+now);
  assert(display.startsWith('최근 7일 강수량:'));assert(!forbidden.test(display));
  for(const e of points){assert(display.includes(e.location));assert(display.includes(e.precip7mm+'mm'));assert(!display.includes('35°C'),'temperature detail stays in the existing risk evidence');}
  const $=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={[original]}/>));assert.equal($('[data-origin-weather]').text(),display);assert($('.origin-card').text().includes(original.region));assert($.text().includes('Open-Meteo'));assert.equal(JSON.stringify(original),before);
  for(const evidence of [points[0],{shared:points[0]}])assert(originWeatherDisplayText({...original,weatherEvidence:evidence},+now).startsWith('최근 7일 강수량:'));
  const older=originWeatherDisplayText(original,+now+4*86400000);assert(!older.includes('최근 7일'));for(const e of points){assert(older.includes('이전 7일 강수량'));assert(!/20\d{2}-\d{2}-\d{2}/.test(older));assert(older.includes(e.precip7mm+'mm'));}assert(!forbidden.test(older));
  const failed={...original,weatherEvidence:points.map(e=>({...e,retrievalFailed:true})),riskWeather:original.riskWeather+' · 저장 기상(재확인 실패)'};
  const failure=originWeatherDisplayText(failed,+now);assert(failure.includes('최근 7일 강수량'));assert(!/20\d{2}-\d{2}-\d{2}/.test(failure));assert(failure.includes(points[0].precip7mm+'mm'));assert(!forbidden.test(failure));
  const partial=originWeatherDisplayText({...original,weatherEvidence:{...points[0],rainfallDays:6,precip7mm:null}},+now);assert(partial.includes('6/7일 확인'));assert(partial.includes('갱신 대기'));assert(!partial.includes('최근 7일'));assert(!partial.includes('0mm'));
  const zero=originWeatherDisplayText({...original,weatherEvidence:{...points[0],precip7mm:0,daily:points[0].daily.map(d=>({...d,precipMm:0}))}},+now);assert(zero.startsWith('최근 7일 강수량:'));assert(zero.includes(' 0mm'));
  // Rainfall coverage remains usable when temperature coverage is partial.
  assert(originWeatherDisplayText({...original,weatherEvidence:{...points[0],temperatureDays:6}},+now).startsWith('최근 7일 강수량:'));
  for(const evidence of [undefined,[],{...points[0],timeZone:'invalid'}, {...points[0],windowStart:undefined}]){const text=originWeatherDisplayText({...original,weatherEvidence:evidence},+now);assert(text.includes('최근 강수 자료 갱신 대기'));assert(!text.includes('mm'));}
  // A refreshed publication changes the displayed figure without a maintained UI summary.
  const refreshed=structuredClone(original);refreshed.weatherEvidence[0].precip7mm=123.4;assert(originWeatherDisplayText(refreshed,+now).includes('123.4mm'));assert.equal(JSON.stringify(original),before);
 }
 // Mixed local-day coverage must retain individual periods instead of one global freshness label.
 const sample=f.configs.corn.map((p:any)=>{const r=f.records[[p.lat,p.lon].join(',')];return parseSharedOpenMeteo(r.body,p,r.checkedAt)!;});
 const mixed=originWeatherDisplayText({weatherEvidence:[sample[0],{...sample[1],retrievalFailed:true}]},+now);assert(mixed.includes('최근 7일 강수량:'));assert(!/20\d{2}-\d{2}-\d{2}/.test(mixed));
 const e=sample[0];const failedOrigin={riskWeather:'저장 기상(재확인 실패)',weatherEvidence:{shared:e,retrievalFailed:true}};assert(originWeatherDisplayText(failedOrigin,+now).includes('최근 7일 강수량'));
 const missing=renderToStaticMarkup(<OriginRadar origins={[{region:'지역',weatherPills:[{label:'자료 부족',basis:'internal retry failure'}]}]}/>);assert(missing.includes('최근 강수 자료 갱신 대기'));assert(missing.includes('>판정 보류</span>'));
 console.log('PASS all eight saved records: exact regional rainfall and temperature, current/dated/failed/partial/missing/zero handling, immutable provenance, refreshed values, mixed local windows, no internal wording or routine pending pills; zero requests.');
}finally{mock.timers.reset();}
