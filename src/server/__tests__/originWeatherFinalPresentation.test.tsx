/** Final Origin Radar contract: real saved data, retained screens, zero view-time provider calls. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {mock} from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {originRadarService} from '../originRadarService.ts';
import {loadAll8OriginRadar,withOriginWeatherPills,ORIGIN_MVP,completeOriginRadar} from '../all8OriginRadarService.ts';
import {OriginRadar,originWeatherDisplayStatus,originWeatherDisplayText} from '../../components/OriginRadar.tsx';
import {parseSharedOpenMeteo,sharedWeatherScreen,getOriginWeather} from '../originWeatherService.ts';
import {createHash} from 'node:crypto';import os from 'node:os';import path from 'node:path';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
let calls=0;const native=fetch;globalThis.fetch=async()=>{calls++;throw Error('View/export provider request forbidden');};
const api:any={},protectedFiles=ids.map(id=>`.rms-stage3/snapshots/analysis-${id}.json`).concat('src/data/rmsAiEditorialOverlays.json','src/data/news_procurement_reviews.json','.rms-stage3/settings.json','.rms-stage3/paid-requests.jsonl');
const hashes=()=>protectedFiles.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'));const before=hashes();
try{
 for(const id of ids){const result=await(id==='wheat'?originRadarService.getWheatOriginRadar():id==='corn'?originRadarService.getCornOriginRadar():id==='soybean'?originRadarService.getSoybeanOriginRadar():loadAll8OriginRadar(id));api[id]=result;const raw=JSON.stringify(result),$=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={result.origins}/>));
  assert.equal($('.origin-card').length,id==='wheat'?5:4);assert.equal($('[data-weather-pills]').length,id==='tapioca-starch'?0:result.origins.length);
  for(const o of result.origins){const text=originWeatherDisplayText(o);assert(!/모델 기상|저장 기상|재확인 실패/.test(text));const e=Array.isArray(o.weatherEvidence)?o.weatherEvidence:[o.weatherEvidence?.shared||o.weatherEvidence];assert(e.filter(Boolean).length);if(e.length===1)assert(!text.includes(o.region));if(o.production)assert($.text().includes(['potato-starch','tapioca-starch'].includes(id)?o.production.match(/^\d+(?:\.\d+)?M MT/)![0]:o.production));if(o.exports)assert($.text().includes(o.exports));if(o.endingStocks)assert($.text().includes(o.endingStocks));}
  assert.equal(JSON.stringify(result),raw,'No mutation of saved evidence');
 }
 assert.equal(calls,0,'All eight real saved readers, including historical context, must make zero provider calls');
 assert.equal((await originRadarService.getSoybeanOilOriginRadar()).origins[0].production,api['soybean-oil'].origins[0].production,'Legacy oil route uses the same verified source');assert.equal(calls,0);
 const potato=api['potato-starch'].origins;assert(potato.every((o:any)=>o.supplyIndicators.some((s:any)=>s.source==='JRC MARS')));assert(potato.find((o:any)=>o.originKey==='poland').production==='7.01M MT (2025 추정)');assert(potato.filter((o:any)=>o.production&&o.originKey!=='poland').every((o:any)=>/전체 감자/.test(o.production)));assert(potato.every((o:any)=>originWeatherDisplayStatus(o,'potato-starch').label!=='주의'),'A JRC yield downgrade alone must not produce a generic weather warning');
 assert(api['tapioca-starch'].origins.find((o:any)=>o.originKey==='thailand').supplyIndicators[0].text.includes('50%'));assert(api['tapioca-starch'].origins.find((o:any)=>o.originKey==='vietnam').supplyIndicators[0].text.includes('베트남'));assert(api['tapioca-starch'].origins.every((o:any)=>o.production.includes('2026/27 전망')),'Only newly verified root forecasts become production badges');
 assert(api['palm-oil'].origins.some((o:any)=>originWeatherDisplayStatus(o,'palm-oil').level==='양호'));
 const potatoView=load(renderToStaticMarkup(<OriginRadar commodityId="potato-starch" origins={potato}/>));
 assert.equal(potatoView('.origin-card').length,4);
 for(const o of potato){const card=potatoView('.origin-card').filter((_,el)=>potatoView(el).text().includes(o.region));assert.equal(card.length,1);for(const indicator of o.supplyIndicators.filter((s:any)=>s.display!=='origin-summary'))assert(!card.text().includes(indicator.text),'Potato details remain in data and Global S&D, not duplicated in Origin Radar');assert.equal(card.find('[data-origin-weather]').text(),originWeatherDisplayText(o));assert.equal(card.find('[data-weather-pills]').text(),originWeatherDisplayStatus(o,'potato-starch').label);if(o.production)assert(card.text().includes('감자 생산')&&card.text().includes(o.production.match(/^\d+(?:\.\d+)?M MT/)[0]));else assert(!card.text().includes('국가 전체 감자 생산'),'No unverified Poland production badge');}
 for(const id of ids.filter(id=>id!=='potato-starch'&&id!=='tapioca-starch')){const view=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={api[id].origins}/>));for(const o of api[id].origins)for(const indicator of o.supplyIndicators||[])assert(view.text().includes(indicator.text),'Other seven Origin Radars retain their indicators');}
 const revisedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rms-jrc-revision-'));fs.mkdirSync(path.join(revisedRoot,'src/data'),{recursive:true});
 const revision=JSON.parse(fs.readFileSync('src/data/potato_jrc_monthly_verified.json','utf8'));for(const r of revision.rows)r.forecast=r.fiveYearMean+1;
 fs.writeFileSync(path.join(revisedRoot,'src/data/potato_jrc_monthly_verified.json'),JSON.stringify(revision));
 const revised=completeOriginRadar('potato-starch',api['potato-starch'],revisedRoot);assert(revised.origins.every(o=>!o.weatherCropContext?.warningSupported),'Refreshed JRC outlook removes the historical shortfall signal without a fixed country classification');
 // Existing thresholds and raw source parser drive display transitions; no new score.
 const fixture=JSON.parse(fs.readFileSync('src/server/__tests__/fixtures/origin-weather-risk-records-v1.json','utf8')),now=new Date(fixture.now);mock.timers.enable({apis:['Date'],now});
 try{
  const p=fixture.configs.soybean.find((p:any)=>p.label==='마투그로수'),r=fixture.records[[p.lat,p.lon].join(',')];
  const parse=(body:any)=>parseSharedOpenMeteo(body,p,r.checkedAt)!;
  const e=parse(r.body);const origin:any={region:'브라질',weatherSource:'Open-Meteo',weatherDataKind:'archived-model',weatherEvidence:[e],weatherCropContext:{clearSupported:true,basis:'OFFLINE retained normal planting evidence',sourceUrl:'https://example.org',publishedAt:'2026-10-19'},...sharedWeatherScreen([e],[p],{heatDays:3},now)};
  assert.equal(originWeatherDisplayStatus(origin,'soybean').level,'양호');
  const hotBody=structuredClone(r.body);for(const day of e.daily.slice(0,3)){hotBody.daily.temperature_2m_max[hotBody.daily.time.indexOf(day.date)]=35;}
  const hot=parse(hotBody),hotOrigin={...origin,weatherEvidence:[hot],...sharedWeatherScreen([hot],[p],{heatDays:3},now)};
  assert.equal(originWeatherDisplayStatus(hotOrigin,'soybean').level,'주의');
  assert.equal(originWeatherDisplayStatus({...origin,weatherCropContext:undefined},'soybean').level,'판정 보류','No warning alone is not affirmative crop evidence');
  assert.equal(originWeatherDisplayStatus({...origin,weatherEvidence:[{...e,retrievalFailed:true}]},'soybean').level,'판정 보류');
  assert.equal(originWeatherDisplayStatus({...origin,weatherEvidence:[{...e,rainfallDays:6,precip7mm:null}]},'soybean').level,'판정 보류');
  assert.equal(originWeatherDisplayStatus(origin,'soybean',+now+4*86400000).level,'판정 보류');
  const point=ORIGIN_MVP.sugar.points[0],record=fixture.records[[point.lat,point.lon].join(',')],body=structuredClone(record.body);body.daily.temperature_2m_min=body.daily.temperature_2m_max.map(()=>10);body.daily_units.temperature_2m_min='°C';body.daily.temperature_2m_min[body.daily.temperature_2m_min.length-2]=0;
  const cold=parseSharedOpenMeteo(body,{...point,label:point.region},record.checkedAt,7,true)!;assert(cold);const screened=withOriginWeatherPills('sugar',{success:true,origins:[{originKey:point.key,region:point.region,weatherEvidence:cold,weatherDataKind:'archived-model'}]} as any).origins[0];assert.equal(originWeatherDisplayStatus(screened,'sugar').level,'주의','Tropical freezing exposure is orange until severity is independently established');
  fs.mkdirSync('/tmp/rms-origin-final',{recursive:true});
  fs.writeFileSync('/tmp/rms-origin-final/status-fixtures.json',JSON.stringify({now:+now,cases:[{commodity:'soybean',origin,level:'양호'},{commodity:'soybean',origin:hotOrigin,level:'주의'},{commodity:'sugar',origin:screened,level:'주의'},{commodity:'soybean',origin:{...origin,weatherCropContext:undefined},level:'판정 보류'}]},null,2));
  assert.equal(originWeatherDisplayStatus({...origin,weatherHistoricalContext:{points:[{agriculturalRepresentativeness:'unverified: terrain'}]}},'soybean').level,'판정 보류');
  // Ordinary saved reads retain a failed index’s dated last successful receipt.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rms-origin-final-'));fs.mkdirSync(path.join(dir,'receipts'));fs.writeFileSync(path.join(dir,'receipts','record.json'),JSON.stringify(e));
  const saved=await getOriginWeather(p,{savedOnly:true,cacheDir:dir,now:new Date(+now+4*86400000)});assert(saved);assert.equal(saved.precip7mm,e.precip7mm);assert(!originWeatherDisplayText({weatherEvidence:[saved]},+now+4*86400000).includes('최근 7일'));assert.equal(calls,0);
  const index=path.join(dir,createHash('sha256').update(JSON.stringify({point:p,url:e.sourceUrl,historyDays:7})).digest('hex')+'.json');
  fs.writeFileSync(index,JSON.stringify({unavailable:true,lastAttemptAt:now.toISOString()}));
  const failedIndex=await getOriginWeather(p,{savedOnly:true,cacheDir:dir,now});assert(failedIndex?.retrievalFailed);assert.equal(failedIndex.precip7mm,e.precip7mm);assert(originWeatherDisplayText({weatherEvidence:[failedIndex]},+now).includes('최근 7일 강수량'),'Failed retry does not relabel a still-current complete retained week');
  fs.writeFileSync(index,JSON.stringify({...e,coordinates:[0,0]}));assert((await getOriginWeather(p,{savedOnly:true,cacheDir:dir,now}))?.retrievalFailed,'Invalid replacement cannot make retained weather falsely current');
  fs.writeFileSync(index,JSON.stringify(hot));const published=await getOriginWeather(p,{savedOnly:true,cacheDir:dir,now});assert(published&&!published.retrievalFailed);assert.equal(published.hotDays,3,'A successful saved publication replaces the failed state and updates the retained screen');assert.equal(calls,0);
 }finally{mock.timers.reset();}
 assert.deepEqual(hashes(),before);
 console.log('PASS all eight real saved readers, 33 cards, national/crop scope, Eurostat/JRC and cassava source linkage, green/orange/red/neutral transitions from retained rules, stale/partial/failed handling, legacy oil consistency, zero provider calls and protected files unchanged.');
}finally{globalThis.fetch=native;}
