/** Offline boundary tests; modified responses never enter published snapshots. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {parseSharedOpenMeteo,sharedWeatherScreen,screenCropWeatherEvents} from '../originWeatherService.ts';
import {OriginRadar,originWeatherDisplayStatus} from '../../components/OriginRadar.tsx';

const dir='.rms-research/weather-final-repair-2026-10-23';
const radar=JSON.parse(fs.readFileSync(dir+'/api-wheat.json','utf8'));
const original=radar.origins[0].weatherEvidence[0];
const point={key:original.key,label:original.location,lat:original.coordinates[0],lon:original.coordinates[1]};
const now=new Date(original.checkedAt),before=JSON.stringify(original),fixtures:any[]=[];
function evidence(change:(body:any)=>void=()=>{}){
 const body=structuredClone(original.rawResponse);change(body);
 const parsed=parseSharedOpenMeteo(body,point,original.checkedAt,28,true);assert(parsed);return parsed;
}
function verify(name:string,e:any,screen:any,expected:string){
 const origin={region:'OFFLINE FIXTURE: '+name,weatherEvidence:e,weatherDataKind:'archived-model',...screen};
 assert.equal(originWeatherDisplayStatus(origin,'wheat',+now).label,expected,name);
 const clock=Date.now;let html:string;try{Date.now=()=>+now;html=renderToStaticMarkup(<OriginRadar commodityId="wheat" origins={[origin]}/>);}finally{Date.now=clock;}const $=load(html);
 assert.equal($('[data-weather-pills]').text(),expected);assert.equal($('.rms-status-negative').length,0);
 if(expected==='양호')assert.equal($('.rms-status-positive').length,1);
 else if(expected!=='판정 보류')assert.equal($('.rms-status-warning').length,1);
 else assert.equal($('[data-weather-assessment]').length,1);
 fixtures.push({name,expected,html});
}
const normal=evidence(b=>{b.daily.temperature_2m_max.fill(24);b.daily.temperature_2m_min.fill(12);b.daily.precipitation_sum.fill(3);});
verify('complete limited screen',normal,sharedWeatherScreen([normal],[point],{heatDays:3,rainMm:90},now),'양호');
const heat=evidence(b=>{b.daily.temperature_2m_max.fill(24);b.daily.temperature_2m_min.fill(12);b.daily.temperature_2m_max.splice(-3,3,35,35,35);});
verify('three days at existing crop heat boundary',heat,sharedWeatherScreen([heat],[point],{heatDays:3},now),'고온 주의');
const cold=evidence(b=>{b.daily.temperature_2m_min[b.daily.time.indexOf(original.lastDay)]=0;});
verify('crop freezing exposure',cold,screenCropWeatherEvents('sugar',cold,point,now),'저온 주의');
const wet=evidence(b=>{b.daily.precipitation_sum.fill(5);b.daily.precipitation_sum.fill(20,b.daily.time.indexOf(original.windowStart));});
verify('140mm week against 35mm preceding weekly mean',wet,sharedWeatherScreen([wet],[point],{heatDays:3,rainMm:90},now),'강수 과다 주의');
const missing=evidence(b=>{const i=b.daily.time.indexOf(original.lastDay);b.daily.temperature_2m_min[i]=null;b.daily.precipitation_sum[i]=null;});
verify('genuine incomplete essential evidence',missing,sharedWeatherScreen([missing],[point],{heatDays:3},now),'판정 보류');
const dry=evidence(b=>{b.daily.precipitation_sum.fill(10);b.daily.precipitation_sum.fill(0,b.daily.time.indexOf(original.windowStart));b.daily.temperature_2m_max.fill(24);b.daily.temperature_2m_min.fill(12);});
const dryResult=sharedWeatherScreen([dry],[point],{heatDays:3,rainMm:90},now);
assert(!dryResult.weatherPills.some(p=>p.label==='강수 부족 주의'),'Zero rain/relative decline cannot invent a seasonal drought cutoff');
// Presentation contract only: this does NOT claim an operational deficit rule.
verify('deficit LABEL RENDERING ONLY; classifier unsupported',normal,{weatherPills:[{label:'강수 부족 주의',basis:'OFFLINE rendering fixture only'}],weatherValidUntil:normal.checkedAt.slice(0,10)+'T23:59:59Z'},'강수 부족 주의');
for(const id of ['sugar','potato-starch','tapioca-starch']){
 const screen=screenCropWeatherEvents(id,normal,point,now);assert(screen.weatherScreening?.complete);
 verify(id+' completed thermal screen without supply/news gates',normal,screen,'양호');
 const invalid={...normal,daily:normal.daily.map((d,i)=>i?d:{...d,precipMm:999})};
 assert.equal(screenCropWeatherEvents(id,invalid,point,now).weatherPills[0].label,'판정 보류','Edited daily data must fail original-response validation');
}
const zeroBaseline=evidence(b=>b.daily.precipitation_sum.fill(0));
assert(!sharedWeatherScreen([zeroBaseline],[point],{heatDays:3,rainMm:90},now).weatherPills.some(p=>p.label==='강수 과다 주의'||p.label==='강수 부족 주의'));
assert.equal(JSON.stringify(original),before);
fs.writeFileSync(dir+'/offline-fixtures.json',JSON.stringify({classifierStatuses:['양호','고온 주의','저온 주의','강수 과다 주의','판정 보류'],unsupportedClassifierStatuses:['강수 부족 주의'],fixtures},null,2));
console.log('PASS supported classification boundaries, real missing evidence, all six UI labels, source immutability and no false drought. Deficit classifier remains explicitly unsupported.');
