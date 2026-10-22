import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import fixture from './fixtures/origin-weather-minima-all8-v1.json';
import {parseSharedOpenMeteo,currentSharedWeather,getOriginWeather,sharedWeatherScreen} from '../originWeatherService.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rms-minimums-OFFLINE-'));
try {
 assert.equal(fixture.records.length,46);assert.equal(new Set(fixture.records.map(r=>r.commodity)).size,8);
 for(const {commodity,point,evidence} of fixture.records){const now=new Date(evidence.checkedAt),e=parseSharedOpenMeteo(evidence.rawResponse,point,evidence.checkedAt,evidence.history.length,true)!;assert(e);assert.equal(e.minimumTemperatureDays,7);assert(currentSharedWeather(e,point,now));assert.deepEqual(e.daily,evidence.daily);assert(new URL(e.sourceUrl).searchParams.get('daily')!.includes('temperature_2m_min'));
  const invalid=structuredClone(evidence.rawResponse);invalid.daily_units.temperature_2m_min='°F';const missing=parseSharedOpenMeteo(invalid,point,evidence.checkedAt,evidence.history.length,true)!;assert.equal(missing.minimumTemperatureDays,0);assert.equal(missing.rainfallDays,e.rainfallDays);assert.equal(missing.temperatureDays,e.temperatureDays);
  if(['wheat','corn','soybean','soybean-oil','potato-starch'].includes(commodity)){const synthetic=structuredClone(evidence.rawResponse);synthetic.daily.temperature_2m_min.fill(-1);const cold=parseSharedOpenMeteo(synthetic,point,evidence.checkedAt,evidence.history.length,true)!;const screen=sharedWeatherScreen([cold],[point],{heatDays:3,...(['wheat','corn'].includes(commodity)?{rainMm:90}:{})},now);assert(!screen.weatherPills.some(p=>p.label==='저온 주의'),'new Tmin evidence does not activate an unapproved cold policy');}
 }
 const {point,evidence}=fixture.records[0],now=new Date(evidence.checkedAt);let calls=0;const legacy=structuredClone(evidence.rawResponse);delete (legacy.daily as any).temperature_2m_min;delete (legacy.daily_units as any).temperature_2m_min;
 await getOriginWeather(point,{cacheDir:dir,now,fetcher:async()=>{calls++;return Response.json(legacy);}});assert.equal(calls,1);
 const upgraded=await getOriginWeather(point,{cacheDir:dir,now,minimumTemperature:true,fetcher:async()=>{calls++;return Response.json(evidence.rawResponse);}});assert.equal(calls,2);assert.equal(upgraded!.minimumTemperatureDays,7);
 await getOriginWeather(point,{cacheDir:dir,now,minimumTemperature:true,fetcher:async()=>{throw Error('complete cache must avoid network');}});
 let retries=0;const partial=await getOriginWeather(point,{cacheDir:path.join(dir,'partial'),now,minimumTemperature:true,fetcher:async()=>{retries++;return Response.json(legacy);}});assert.equal(retries,2);assert.equal(partial!.minimumTemperatureDays,0);
 const oil=fixture.records.find(r=>r.commodity==='soybean-oil'&&r.point.key==='brazil')!;assert.deepEqual(oil.evidence.coordinates,[-12.55,-55.72]);
 console.log('PASS 46 genuine Tmin records/all eight commodities; original dates, units, raw provenance and Oil coordinates; no unapproved cold rules; missing minima preserve other variables; isolated legacy cache upgrade, cache hit and bounded retries.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
