/** Original all-eight weather records; offline mutations never touch saved observations. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {mock as clock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import {parseSharedOpenMeteo,sharedWeatherScreen,sharedWeatherSummary,type SharedWeatherEvidence,type WeatherPoint} from '../originWeatherService.ts';
import {screenObservedWeather,type WeatherScreen} from '../../utils/originWeatherPills.ts';
import {withOriginWeatherPills} from '../all8OriginRadarService.ts';import {OriginRadar} from '../../components/OriginRadar.tsx';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/origin-weather-risk-records-v1.json',import.meta.url),'utf8'));
const now=new Date(fixture.now);clock.timers.enable({apis:['Date'],now});const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('OFFLINE: no network or Gemini');};
const labels=(v:any)=>v.weatherPills.map((p:any)=>p.label);
const rendered=(screen:any,id='corn')=>load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={[{region:'OFFLINE screen check',...screen}]}/>));
const pills=($:ReturnType<typeof load>)=>{
 const pending=$('[data-weather-assessment]');
 for(const el of pending.toArray()){
  const node=$(el),classes=(node.attr('class')||'').split(/\s+/);
  assert.equal(node.text(),'판정 보류');assert(node.attr('aria-description'),'assessment reason remains available');
  assert(!classes.some(c=>/^(?:bg-|border(?:-|$)|rounded|px-|py-|font-semibold|rms-status-)/.test(c)),'pending assessment must be plain neutral text');
 }
 assert.equal($('[data-weather-pills] span:not([data-weather-assessment])').filter((_,p)=>$(p).text()==='판정 보류').length,0,'pending must never be a status pill');
 return $('[data-weather-pills] span').map((_,p)=>$(p).text()).get();
};
const parse=(point:WeatherPoint,historyDays=7)=>{const r=fixture.records[[point.lat,point.lon].join(',')];assert(r,point.label);const e=parseSharedOpenMeteo(r.body,point,r.checkedAt,historyDays);assert(e,point.label);return e;};
try{
 const ids=Object.keys(fixture.configs);assert.equal(ids.length,8);assert.equal(Object.values(fixture.configs).flat().length,46);
 for(const id of ids){
  const configured:WeatherPoint[]=fixture.configs[id],points=configured.map(p=>parse(p,id==='palm-oil'?28:7));
  assert(points.every(p=>p.rainfallDays===7&&p.temperatureDays===7),id+' actual complete records');
  const origins=[...new Set(configured.map(p=>p.key))].map(key=>{const c=configured.filter(p=>p.key===key),e=points.filter(p=>p.key===key);
   const screen:Partial<WeatherScreen>=['wheat','corn','soybean','soybean-oil'].includes(id)?sharedWeatherScreen(e,c,{heatDays:3,...(['wheat','corn'].includes(id)?{rainMm:90}:{})},now):{};
   const w=e[0];return {originKey:key,region:key,...screen,riskWeather:sharedWeatherSummary(e),weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherEvidence:id==='palm-oil'?{shared:w,model:true,retrievedAt:w.checkedAt,recent:w.daily.map(d=>({day:d.date,mm:d.precipMm})),baseline:w.history.slice(0,-7).map(d=>({day:d.date,mm:d.precipMm}))}:w};});
  const radar=['palm-oil','sugar','potato-starch','tapioca-starch'].includes(id)?withOriginWeatherPills(id,{success:true,origins} as any):{origins};
  const minimumMissing=['palm-oil','sugar','tapioca-starch'].includes(id),deferred=minimumMissing||id==='potato-starch';
  for(const o of radar.origins){assert.deepEqual(labels(o),[minimumMissing?'자료 부족':deferred?'판정 보류':'특이 없음'],id+':'+o.originKey);if(minimumMissing){assert(o.weatherPills![0].basis.includes('일최저기온 0/7일'),'old saved observations cannot silently pass a newly enabled variable');}else if(deferred){assert(o.weatherPills![0].basis.includes('기상 7일 확인'));assert(o.weatherPills![0].basis.includes('기준 미확정'));}}
  const $=load(renderToStaticMarkup(<OriginRadar commodityId={id} origins={radar.origins as any}/>));
  assert.deepEqual(pills($),id==='tapioca-starch'?[]:radar.origins.map(()=>'판정 보류'),id+' complete weather alone does not establish crop-stage safety');assert.equal($('[data-weather-assessment]').length,id==='tapioca-starch'?0:radar.origins.length);assert.equal($('[data-weather-pills] span:not([data-weather-assessment])').length,0);assert(!$.text().includes('자료 부족'));assert(!$.text().includes('2026-10-14~2026-10-20'));assert(!/America\/|Australia\/|Europe\/|Asia\//.test($('.origin-card').text()));assert($.text().includes('최근 7일 강수량:'));assert(radar.origins.every(o=>o.riskWeather.includes('2026-10-14~2026-10-20')),'original weather dates remain internal');assert($.text().includes('Open-Meteo'));
 }
 const corn:WeatherPoint[]=fixture.configs.corn,point=corn.find(p=>p.label==='마투그로수')!,actual=parse(point);
 assert.equal(actual.hotDays,1);assert.deepEqual(actual.daily.filter(d=>d.tMaxC!>=35).map(d=>[d.date,d.tMaxC]),[['2026-10-14',35.3]]);assert.equal(actual.daily.at(-1)!.tMaxC,34.9);
 const old=fixture.legacyCorn.points.find((p:any)=>p.location===point.label);assert.equal(old.hotDays,4);assert.equal(old.daily.filter((d:any)=>d.tMaxC>=35&&d.date<actual.windowStart).length,3,'three former hot days rolled out');assert.equal(old.daily.filter((d:any)=>d.tMaxC>=35&&d.date>=actual.windowStart).length,1);
 const raw=fixture.records[[point.lat,point.lon].join(',')],body=()=>({...structuredClone(raw.body),daily:{time:actual.daily.map(d=>d.date),precipitation_sum:Array(7).fill(3),temperature_2m_max:Array(7).fill(25)}});
 const check=(b:any,policy:any={heatDays:3,rainMm:90})=>{const e=parseSharedOpenMeteo(b,point,raw.checkedAt)!;assert(e);return {e,screen:sharedWeatherScreen([e],[point],policy,now)};};
 for(let n=0;n<=3;n++){const b=body();b.daily.temperature_2m_max=Array.from({length:7},(_,i)=>i<n?35:34.9);assert.deepEqual(labels(check(b).screen),[n>=3?'고온 주의':'특이 없음']);}
 const exact=body();exact.daily.precipitation_sum=[90,0,0,0,0,0,0];assert.deepEqual(labels(check(exact).screen),['강수 집중']);exact.daily.precipitation_sum[0]=89.9;assert.deepEqual(labels(check(exact).screen),['특이 없음']);
 const heavy=body();heavy.daily.precipitation_sum=[20,20,20,null,20,20,20] as any;const incomplete=check(heavy);assert.equal(incomplete.e.precip7mm,null);assert.equal(incomplete.e.rainfallDays,6);assert.deepEqual(labels(incomplete.screen),['강수 집중','자료 부족']);assert.deepEqual(pills(rendered(incomplete.screen)),['강수 과다 주의']);
 const lowPartial=body();lowPartial.daily.precipitation_sum[0]=null as any;assert.deepEqual(labels(check(lowPartial).screen),['자료 부족']);assert.deepEqual(pills(rendered(check(lowPartial).screen)),['판정 보류']);
 const hotPartial=body();hotPartial.daily.temperature_2m_max=[35,36,35,null,null,null,null] as any;hotPartial.daily.precipitation_sum.fill(null as any);assert.deepEqual(labels(check(hotPartial).screen),['고온 주의','자료 부족']);assert.deepEqual(pills(rendered(check(hotPartial).screen)),['고온 주의']);
 for(const value of [null,undefined,'0',false,-999,NaN,Infinity])for(const metric of ['precipitation_sum','temperature_2m_max']){const b=body();(b.daily as any)[metric].fill(value);const s=check(b).screen;assert(!labels(s).includes('특이 없음'));assert(pills(rendered(s)).includes('판정 보류'));}
 const absent=body();delete (absent.daily as any).temperature_2m_max;assert.equal(parseSharedOpenMeteo(absent,point,raw.checkedAt),null);
 const zero=body();zero.daily.precipitation_sum.fill(0);zero.daily.temperature_2m_max.fill(0);assert.deepEqual(labels(check(zero).screen),['특이 없음'],'actual zero remains valid');
 for(const policy of [{},{heatDays:NaN},{heatDays:0},{heatDays:8},{heatDays:3,rainMm:NaN}]){const s=check(body(),policy).screen;assert.deepEqual(labels(s),['판정 보류'],'unconfigured/invalid policy must fail closed');assert(!rendered(s)('[data-weather-pills] span').hasClass('rms-status-warning'));}
 assert.deepEqual(labels(screenObservedWeather([],{locations:['x'],heatDays:undefined as any,observationAgeDays:3},+now)),['판정 보류']);
 const failed=sharedWeatherScreen([{...actual,retrievalFailed:true}],[point],{heatDays:3,rainMm:90},now);assert(!labels(failed).includes('특이 없음'));assert.deepEqual(pills(rendered(failed)),['판정 보류']);
 const duplicate=sharedWeatherScreen([actual,actual],corn.filter(p=>p.key==='brazil'),{heatDays:3,rainMm:90},now);assert(!labels(duplicate).includes('특이 없음'));
 for(const id of ['sugar','potato-starch','tapioca-starch']){const p=fixture.configs[id][0],e=parse(p),base:any={success:true,origins:[{originKey:p.key,region:p.label,weatherEvidence:e}]};
  const missingRaw=structuredClone(e.rawResponse);missingRaw.daily.temperature_2m_max.fill(null);const missing=parseSharedOpenMeteo(missingRaw,p,e.checkedAt)!;const result=withOriginWeatherPills(id,{...base,origins:[{...base.origins[0],weatherEvidence:missing}]});assert(labels(result.origins[0]).includes('자료 부족'));assert(result.origins[0].weatherPills![0].basis.includes('일최고기온 0/7일'));assert(!result.origins[0].weatherPills![0].basis.includes('기상 7일 확인'));
 }
 const legacy=rendered({weatherPills:[{label:'자료 부족',basis:'강수 6/7일 확인 · 재확인 필요'}]});assert.deepEqual(pills(legacy),['판정 보류']);assert(legacy.text().includes('최근 강수 자료 갱신 대기'));assert(!legacy('[data-weather-pills] span').hasClass('rms-status-warning'));
 console.log('PASS: actual records at 46 configured points across eight commodities; Corn heat/window explanation; exact unchanged thresholds; partial-rain warning retained; missing policy fails closed; missing variables never clear; neutral reasons distinguish complete data/unconfigured policy from incomplete data; dates/sources and warning styles preserved.');
}finally{globalThis.fetch=native;clock.timers.reset();}
