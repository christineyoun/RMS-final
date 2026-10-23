/** Exact local expiry regression using retained original Open-Meteo weather; no HTTP or writes. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {mock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {OriginRadar} from '../../components/OriginRadar.tsx';
import {parseSharedOpenMeteo,sharedWeatherScreen,weatherWindowEnd,weatherWindowExpiry} from '../originWeatherService.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-risk-records-v1.json',import.meta.url),'utf8'));
const now=new Date('2026-10-21T12:30:00Z'),p=fixture.configs.wheat.find((p:any)=>p.label==='뉴사우스웨일스'),raw=fixture.records[[p.lat,p.lon].join(',')];
const e=parseSharedOpenMeteo(raw.body,p,now.toISOString())!;assert(e);const policy={heatDays:3,rainMm:90};
const s=sharedWeatherScreen([e],[p],policy,now);assert.equal(s.weatherValidUntil,'2026-10-21T13:00:00.000Z','23:30 Sydney must remain valid until midnight, not expire immediately');assert.deepEqual(s.weatherPills.map(p=>p.label),['특이 없음']);
mock.timers.enable({apis:['Date'],now});try{
 const render=(screen:any)=>renderToStaticMarkup(<OriginRadar commodityId="wheat" origins={[{region:p.label,riskWeather:'Retained weather figures',weatherEvidence:e,...screen}]}/>);
 assert(!render(s).includes('>이상 없음</span>')&&render(s).includes('>판정 보류</span>'),'weather without crop-stage context does not invent favorable crop conditions');
 assert(render(s).includes('최근 7일 강수량:'));
 mock.timers.tick(30*60*1000);assert(render(s).includes('>판정 보류</span>'),'expired screen uses neutral text and dated weather coverage');
 assert(!render(s).includes('최근 7일 강수량:'));assert(render(s).includes('이전 7일 강수량'),'local midnight retains the values with a compact historical coverage label');
}finally{mock.timers.reset();}
for(const [start,zone,end] of [
 ['2026-10-21T12:30:00Z','Australia/Sydney','2026-10-21T13:00:00.000Z'],
 ['2026-10-21T17:42:13.123Z','Asia/Kolkata','2026-10-21T18:30:00.000Z'],
 ['2026-10-31T06:30:00Z','America/Chicago','2026-11-01T05:00:00.000Z'],
 ['2026-11-01T05:30:00Z','America/Chicago','2026-11-02T06:00:00.000Z'],
 ['2026-03-08T06:30:00Z','America/Chicago','2026-03-09T05:00:00.000Z']
]){const at=new Date(start),expiry=weatherWindowExpiry(at,zone);assert.equal(new Date(expiry).toISOString(),end);assert.equal(weatherWindowEnd(new Date(expiry-1),zone),weatherWindowEnd(at,zone));assert.notEqual(weatherWindowEnd(new Date(expiry),zone),weatherWindowEnd(at,zone));}
const failed=sharedWeatherScreen([{...e,retrievalFailed:true}],[p],policy,now);assert(!failed.weatherPills.some(p=>p.label==='특이 없음'),'transport failure still cannot certify all clear');
const stale=sharedWeatherScreen([e],[p],policy,new Date('2026-10-21T13:00:00Z'));assert(!stale.weatherPills.some(p=>p.label==='특이 없음'),'older window never becomes current');
console.log('PASS: confirmed premature-expiry regression, original Wheat data rendering, exact midnight, half-hour zones and DST; retrieval failures/stale windows still withhold green.');
