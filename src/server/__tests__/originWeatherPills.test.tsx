import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {screenObservedWeather,screenPalmRain,WEATHER_PILL_LABELS} from '../../utils/originWeatherPills.ts';
import {OriginRadar} from '../../components/OriginRadar.tsx';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-weather-pills-test-'));process.env.RMS_ORIGIN_CACHE_DIR=temp;process.env.RMS_ALL8_ORIGIN_CACHE_DIR=temp;
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline test: no real or paid network requests');};
const {parseNasaCornWeather,enrichCornWithEvidence,CORN_WEATHER_POINTS,CornOriginConditionsService}=await import('../cornOriginConditionsService.ts');
const {parseNasaSoybeanWeather,enrichSoybeanWithEvidence,SOYBEAN_WEATHER_POINTS}=await import('../soybeanOriginConditionsService.ts');
const {parseOpenMeteoEvidence,classifyWheatScreen,WheatOriginRiskService}=await import('../wheatOriginRiskService.ts');
const {withOriginWeatherPills,loadAll8OriginRadar}=await import('../all8OriginRadarService.ts');
const now=Date.now(),checkedAt=new Date(now).toISOString(),date=(n:number)=>new Date(now-n*86400000).toISOString().slice(0,10);
const time=Array.from({length:7},(_,i)=>date(9-i));
const nasa=(p:any,rain:unknown[]=Array(7).fill(3),heat:unknown[]=Array(7).fill(25))=>({header:{time_standard:'LST'},geometry:{coordinates:[p.lon,p.lat]},parameters:{PRECTOTCORR:{units:'mm/day'},T2M_MAX:{units:'C'}},properties:{parameter:{PRECTOTCORR:Object.fromEntries(time.map((d,i)=>[d.replaceAll('-',''),rain[i]])),T2M_MAX:Object.fromEntries(time.map((d,i)=>[d.replaceAll('-',''),heat[i]]))}}});
const base:any={success:true,statusCode:200,lastUpdated:checkedAt,origins:[{originKey:'usa',region:'미국',status:'양호',production:'124.1M MT',productionNumericMMT:124.1,exports:'46.1M MT',endingStocks:'8.6M MT',dataFreshness:'live',sourceReportDate:date(0).slice(0,7),sourceOrg:'USDA FAS',weatherSource:'NASA POWER'}]};
const labels=(v:any)=>v.weatherPills.map((p:any)=>p.label);
const point=(location:string)=>({location,lastDay:date(3),checkedAt,rainfallDays:7,temperatureDays:7,precipMm:21,hotDays:0});
const policy={locations:['A','B'],heatDays:3,rainMm:90,observationAgeDays:8};
try{
 assert.deepEqual(labels(screenObservedWeather([point('A'),point('B')],policy)),['특이 없음']);
 assert.deepEqual(labels(screenObservedWeather([{...point('A'),hotDays:2,precipMm:89.9},point('B')],policy)),['특이 없음'],'thresholds not broadened');
 assert.deepEqual(labels(screenObservedWeather([{...point('A'),hotDays:3,precipMm:90},point('B')],policy)),['고온 주의','강수 집중']);
 for(const invalid of [null,undefined,'',false,'0',-999,NaN,Infinity]){
   assert.equal(parseNasaCornWeather(nasa(CORN_WEATHER_POINTS[0],Array(7).fill(invalid),Array(7).fill(invalid)),CORN_WEATHER_POINTS[0],checkedAt),null);
 }
 const points=CORN_WEATHER_POINTS.filter(p=>p.key==='usa').map(p=>parseNasaCornWeather(nasa(p),p,checkedAt)!);
 assert.deepEqual(labels(enrichCornWithEvidence(base,points).origins[0]),['특이 없음']);
 assert.deepEqual(labels(enrichCornWithEvidence({...base,origins:[{...base.origins[0],dataFreshness:'unavailable',exports:'',endingStocks:''}]},points).origins[0]),['특이 없음'],'weather ignores supply availability');
 const zero=parseNasaCornWeather(nasa(CORN_WEATHER_POINTS[0],Array(7).fill(0),Array(7).fill(0)),CORN_WEATHER_POINTS[0],checkedAt)!;assert.equal(zero.precip7mm,0);assert.equal(zero.hotDays,0);
 const partial=parseNasaCornWeather(nasa(CORN_WEATHER_POINTS[0],[3,3,null,3,3,3,3]),CORN_WEATHER_POINTS[0],checkedAt)!;assert.equal(partial.precip7mm,null);assert.equal(partial.observedRainMm,18);assert.equal(partial.temperatureDays,7);
 assert.deepEqual(labels(enrichCornWithEvidence(base,[partial,points[1]]).origins[0]),['자료 부족']);
 assert.deepEqual(labels(enrichCornWithEvidence(base,[points[0],points[0]]).origins[0]),['자료 부족']);
 const shifted={...points[1],lastDay:date(4),daily:points[1].daily.map(d=>({...d,date:new Date(Date.parse(d.date)-86400000).toISOString().slice(0,10)}))};
 assert.deepEqual(labels(enrichCornWithEvidence(base,[points[0],shifted]).origins[0]),['자료 부족']);
 const hot=parseNasaCornWeather(nasa(CORN_WEATHER_POINTS[0],Array(7).fill(null),[35,36,35,null,null,null,null]),CORN_WEATHER_POINTS[0],checkedAt)!;
 assert.equal(hot.precip7mm,null);assert.equal(hot.hotDays,3);assert.deepEqual(labels(enrichCornWithEvidence(base,[hot]).origins[0]),['고온 주의','자료 부족']);
 assert.deepEqual(labels(enrichCornWithEvidence(base,points.map(p=>({...p,checkedAt:new Date(now-4*86400000).toISOString()}))).origins[0]),['자료 부족']);
 assert.deepEqual(labels(enrichCornWithEvidence(base,points.map(p=>({...p,checkedAt:new Date(now+3600000).toISOString()}))).origins[0]),['자료 부족']);
 assert.deepEqual(labels(enrichCornWithEvidence(base,points.map(p=>({...p,retrievalFailed:true}))).origins[0]),['자료 부족']);
 // Corn real ingestion/cache failure branches with mocked source bodies, never production paths.
 globalThis.fetch=async(input:any)=>{const u=new URL(String(input)),p=CORN_WEATHER_POINTS.find(p=>String(p.lat)===u.searchParams.get('latitude')&&String(p.lon)===u.searchParams.get('longitude'))!;return Response.json(nasa(p));};
 const cornService=new CornOriginConditionsService();const complete=await cornService.getEvidence(true);assert.equal(complete.length,8);
 globalThis.fetch=async()=>{throw Error('simulated source outage');};const retained=await cornService.getEvidence(true);assert.equal(retained.length,8);assert.ok(retained.every(p=>p.retrievalFailed&&p.checkedAt===complete.find(x=>x.location===p.location)!.checkedAt));assert.deepEqual(labels(enrichCornWithEvidence(base,retained).origins[0]),['자료 부족']);
 globalThis.fetch=async()=>Response.json({});assert.deepEqual(await cornService.getEvidence(true),[],'new invalid source cannot preserve previous clear badge');
 // Soybean keeps heat-only policy. High rainfall does not become an invented concentration/flooding rule.
 const soy=SOYBEAN_WEATHER_POINTS.filter(p=>p.key==='usa').map(p=>parseNasaSoybeanWeather(nasa(p,Array(7).fill(30)),p,checkedAt)!);
 assert.deepEqual(labels(enrichSoybeanWithEvidence(base,soy).origins[0]),['특이 없음']);
 const soyHot=parseNasaSoybeanWeather(nasa(SOYBEAN_WEATHER_POINTS[0],Array(7).fill(3),Array(7).fill(35)),SOYBEAN_WEATHER_POINTS[0],checkedAt)!;
 assert.deepEqual(labels(enrichSoybeanWithEvidence(base,[soyHot]).origins[0]),['고온 주의','자료 부족']);
 // Wheat's legacy export warning remains separate; a 20% export decline cannot alter weather-only pills.
 const wheatPoints=['캔자스(HRW)','일리노이 남부(SRW)'].map(location=>parseOpenMeteoEvidence({daily:{time,precipitation_sum:Array(7).fill(3),temperature_2m_max:Array(7).fill(25)}},'usa',location,checkedAt)!);
 const exportRisk=classifyWheatScreen({sourceReportDate:date(0).slice(0,7),dataFreshness:'live',production:'20M MT',exports:'10M MT',endingStocks:'2M MT',points:wheatPoints,exportYoYPct:-20});assert.equal(exportRisk,'모니터링');
 fs.writeFileSync(path.join(temp,'wheat-openmeteo-risk-v3.json'),JSON.stringify({version:3,checkedDay:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),evidence:{usa:wheatPoints}}));
 const actualWheat=await new WheatOriginRiskService().enrich(base);assert.deepEqual(labels(actualWheat.origins[0]),['특이 없음']);
 const wheatScreen=screenObservedWeather(wheatPoints.map(p=>({location:p.location,lastDay:p.mostRecentDay,checkedAt:p.checkedAt,rainfallDays:p.days,temperatureDays:p.days,precipMm:p.precipLast7Mm,hotDays:p.hotDays})),{locations:wheatPoints.map(p=>p.location),heatDays:3,rainMm:90,observationAgeDays:7});assert.deepEqual(labels(wheatScreen),['특이 없음']);
 const palm=(recentMm:number,baseMm=10)=>({model:true,retrievedAt:checkedAt,baseline:Array.from({length:21},(_,i)=>({day:date(30-i),mm:baseMm})),recent:Array.from({length:7},(_,i)=>({day:date(9-i),mm:recentMm}))});
 assert.deepEqual(labels(screenPalmRain(palm(20))),['강수 증가']);assert.deepEqual(labels(screenPalmRain(palm(2.5))),['강수 감소']);assert.deepEqual(labels(screenPalmRain(palm(10))),['특이 없음']);assert.deepEqual(labels(screenPalmRain(palm(1,0))),['자료 부족']);
 const gap=palm(20);gap.baseline[5].day=date(40);assert.deepEqual(labels(screenPalmRain(gap)),['자료 부족']);
 assert.deepEqual(labels(screenPalmRain({...palm(20),retrievedAt:new Date(now-4*86400000).toISOString()})),['자료 부족']);assert.deepEqual(labels(screenPalmRain({...palm(20),retrievalFailed:true})),['자료 부족']);
 const palmCache=withOriginWeatherPills('palm-oil',{...base,origins:[{...base.origins[0],status:'자료 부족',weatherEvidence:palm(20)}]} as any);assert.deepEqual(labels(palmCache.origins[0]),['강수 증가'],'valid cached weather independent of supply status');
 const fixtures:any={wheat:{...base,origins:[{...base.origins[0],status:exportRisk,...wheatScreen}]},corn:enrichCornWithEvidence(base,points),soybean:enrichSoybeanWithEvidence(base,soy),'palm-oil':palmCache};
 for(const id of ['soybean-oil','sugar','potato-starch','tapioca-starch']){
   const value=withOriginWeatherPills(id,{...base,origins:[{...base.origins[0],riskWeather:'최근 7일 모델 강수 21mm',status:'양호'}]});assert.deepEqual(labels(value.origins[0]),['자료 부족'],id+' has rainfall but no supported crop screen');fixtures[id]=value;
   const saved={...value,lastUpdated:checkedAt};fs.writeFileSync(path.join(temp,'all8-'+id+'.json'),JSON.stringify(saved));const cached=await loadAll8OriginRadar(id);assert.deepEqual(labels(cached.origins[0]),['자료 부족']);
 }
 fixtures.corn.origins=[{...base.origins[0],region:'동시 고온·강수 신호',...screenObservedWeather([{...point('A'),hotDays:4,precipMm:100},point('B')],policy)},...fixtures.corn.origins];
 for(const [id,value] of Object.entries(fixtures) as any){const html=renderToStaticMarkup(<OriginRadar commodityId={id} origins={value.origins}/>);assert.ok(html.includes('data-weather-pills'));assert.ok(!html.includes('>양호</span>'));assert.ok(!html.includes('>모니터링</span>'));assert.equal((html.match(/출처:/g)||[]).length,1);assert.ok(!html.includes('강수 편차 점검'));}
 const expired=renderToStaticMarkup(<OriginRadar commodityId="corn" origins={[{...base.origins[0],weatherPills:[{label:'특이 없음',basis:'expired'}],weatherValidUntil:date(1)}]}/>);assert.ok(expired.includes('>자료 부족</span>'));assert.ok(!expired.includes('>특이 없음</span>'));
 for(const future of ['저온 주의','서리 주의','강수 부족','강풍 주의']){assert.ok((WEATHER_PILL_LABELS as readonly string[]).includes(future));assert.ok(!JSON.stringify(fixtures).includes(future));}
 fs.writeFileSync(path.join(temp,'fixtures.json'),JSON.stringify(fixtures,null,2));fs.writeFileSync('/tmp/rms-weather-pills-test-out',temp);
 console.log('PASS: eight adapters/cache reads, weather-only supply separation; Corn null/partial/misaligned/outage integrity; Soy heat-only; Palm baseline directions/gaps/zero/stale; compact multiple pills and expiry; dormant cold/frost/wind vocabulary. Offline artifacts: '+temp);
}finally{globalThis.fetch=native;delete process.env.RMS_ORIGIN_CACHE_DIR;delete process.env.RMS_ALL8_ORIGIN_CACHE_DIR;}
