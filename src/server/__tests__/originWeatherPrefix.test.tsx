import fs from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {OriginRadar,originWeatherDisplayText} from '../../components/OriginRadar.tsx';
import {parseSharedOpenMeteo} from '../originWeatherService.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-risk-records-v1.json',import.meta.url),'utf8'));
const now=Date.parse(fixture.now),expired=now+4*86400000;
for(const [id,config] of Object.entries(fixture.configs) as [string,any[]][]){
 const points=config.map(p=>{const record=fixture.records[[p.lat,p.lon].join(',')];return parseSharedOpenMeteo(record.body,p,record.checkedAt,id==='palm-oil'?28:7)!;});
 for(const crop of ['사탕수수','원료 대두','카사바','원료감자','밀','옥수수','팜','대두유']){
  const origin={region:'검증 산지',production:'123 MMT',riskWeather:crop+' 재배지',weatherEvidence:points};
  const before=JSON.stringify(origin);
  for(const time of [now,expired]){
   const expected=originWeatherDisplayText({...origin,riskWeather:undefined},time);
   assert.equal(originWeatherDisplayText(origin,time),expected);
   assert(expected.startsWith(time===now?'최근 7일 강수량:':'이전 7일 강수량:'));
   for(const point of points)assert(expected.includes(point.precip7mm+'mm'));
  }
  const $=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={[origin]}/>));
  const line=$('[data-origin-weather]').text();
  assert.equal(line,originWeatherDisplayText(origin));
  assert(!line.startsWith(crop+' · '));
  assert($('.origin-card').text().includes('검증 산지'));
  assert.equal(JSON.stringify(origin),before);
  const refreshed=structuredClone(origin);refreshed.weatherEvidence[0].precip7mm=123.4;
  assert(originWeatherDisplayText(refreshed,expired).startsWith('이전 7일 강수량:'));
  assert(originWeatherDisplayText(refreshed,expired).includes('123.4mm'));
 }
}
console.log('PASS all eight commodities: prefix-free shared weather formatter/rendering, rainfall and freshness preserved, immutable evidence and future refresh coverage.');
