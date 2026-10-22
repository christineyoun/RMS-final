/** Offline source/identity/failure tests. No production cache writes or paid calls. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-origin-test-'));
process.env.RMS_ORIGIN_CACHE_DIR=temp;
const {parseNasaSoybeanWeather,enrichSoybeanWithEvidence,isRecentSoybeanWeather,SOYBEAN_WEATHER_POINTS,NasaSoybeanComparisonService:SoybeanOriginConditionsService}=await import('../soybeanOriginConditionsService.ts');
const {verifiedSoybeanCountryRows,SoybeanPsdOriginService}=await import('../soybeanPsdOriginService.ts');
const {OriginRadar}=await import('../../components/OriginRadar.tsx');
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected network or paid request');};
const now=Date.now(),checkedAt=new Date(now).toISOString(),lastDay=new Date(now-86400000).toISOString().slice(0,10),year=new Date().getUTCFullYear().toString(),month=checkedAt.slice(0,7);
const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(lastDay)+(i-6)*86400000).toISOString().slice(0,10).replaceAll('-',''));
const body=(point:any,rain:unknown[]=Array(7).fill(3),heat:unknown[]=Array(7).fill(25))=>({header:{time_standard:'LST',fill_value:-999},geometry:{coordinates:[point.lon,point.lat]},parameters:{PRECTOTCORR:{units:'mm/day'},T2M_MAX:{units:'C'}},properties:{parameter:{PRECTOTCORR:Object.fromEntries(dates.map((d,i)=>[d,rain[i]])),T2M_MAX:Object.fromEntries(dates.map((d,i)=>[d,heat[i]]))}}});
const rows=(country:string)=>[28,88,176].map((attributeId,i)=>({commodityCode:'2222000',countryCode:country,marketYear:year,calendarYear:month.slice(0,4),month:month.slice(5),attributeId,unitId:8,value:[11100,7350,355][i]}));
const response=(country:string)=>({success:true,statusCode:200,commodityCode:'2222000',marketYear:year,data:{marketYear:year,rawRecords:rows(country)},isCached:false}) as any;
try{
 const pa=verifiedSoybeanCountryRows(response('PA'),'PA',year)!;assert.equal(pa.productionMMT,11.1);assert.equal(pa.exportsMMT,7.35);assert.equal(pa.endingStocksMMT,.355);assert.equal(pa.rawRecords?.[0].countryCode,'PA');
 assert.equal(verifiedSoybeanCountryRows(response('PA'),'PY' as any,year),null);assert.equal(verifiedSoybeanCountryRows(response('US'),'PA',year),null);
 for(const change of [{commodityCode:'4232000'},{marketYear:String(+year-1)},{unitId:4},{calendarYear:String(+year-1)},{value:null}]){const r=response('PA');r.data.rawRecords[0]={...r.data.rawRecords[0],...change};assert.equal(verifiedSoybeanCountryRows(r,'PA',year),null);}
 const mixed=response('PA');mixed.data.rawRecords[1].month=String(Number(month.slice(5))===1?2:1);assert.equal(verifiedSoybeanCountryRows(mixed,'PA',year),null);
 let requested:string[]=[];
 const sources={world:async()=>({success:true,status:'last-verified',data:{marketYear:year}} as any),country:async(_commodity:string,country:string)=>{requested.push(country);return response(country);}};
 const supply=await new SoybeanPsdOriginService(sources).getSoybeanOriginRadar();assert.deepEqual(requested,['BR','US','AR','PA']);assert.ok(supply.origins.every(o=>o.marketYear===year+'/'+String(+year+1).slice(-2)));assert.ok(supply.origins.every(o=>!o.exportComparisonBasis));
 const stateFile=path.join(temp,'soybean-country-psd-v1.json'),state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const previous=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-2,1)).toISOString().slice(0,7);
 state.byCountry.PA.push({...pa,reportMonth:previous,exportsMMT:7.1,rawRecords:pa.rawRecords!.map(r=>({...r,calendarYear:previous.slice(0,4),month:previous.slice(5),value:r.attributeId===88?7100:r.value}))});fs.writeFileSync(stateFile,JSON.stringify(state));
 const compared=await new SoybeanPsdOriginService(sources).getSoybeanOriginRadar();assert.equal(compared.origins[3].exportComparisonBasis,previous+' → '+month);assert.ok(compared.origins[3].exportComparison?.includes('+0.25M MT'));
 const gapState=JSON.parse(fs.readFileSync(stateFile,'utf8')),gapMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-3,1)).toISOString().slice(0,7);
 gapState.byCountry.PA[1]={...gapState.byCountry.PA[1],reportMonth:gapMonth,rawRecords:gapState.byCountry.PA[1].rawRecords.map(r=>({...r,calendarYear:gapMonth.slice(0,4),month:gapMonth.slice(5)}))};fs.writeFileSync(stateFile,JSON.stringify(gapState));assert.equal((await new SoybeanPsdOriginService(sources).getSoybeanOriginRadar()).origins[3].exportComparisonBasis,undefined,'nonadjacent releases cannot become monthly comparison');
 const outage=new SoybeanPsdOriginService({...sources,country:async()=>{throw Error('Official source unavailable');}});const cached=await outage.getSoybeanOriginRadar();assert.ok(cached.origins.every(o=>o.dataFreshness==='cached'));assert.equal(cached.origins[3].production,'11.1M MT');
 const wrongYear=new SoybeanPsdOriginService({...sources,world:async()=>({success:true,status:'last-verified',data:{marketYear:String(+year+1)}} as any),country:async()=>{throw Error('No matching year');}});assert.ok((await wrongYear.getSoybeanOriginRadar()).origins.every(o=>!o.production),'old market years never substitute for requested year');
 const points=SOYBEAN_WEATHER_POINTS.map(p=>parseNasaSoybeanWeather(body(p),p,checkedAt)!);assert.ok(points.every(p=>isRecentSoybeanWeather(p,now)));
 let enriched=enrichSoybeanWithEvidence(supply,points,now);assert.ok(enriched.origins.every(o=>o.status==='양호'));
 const point=SOYBEAN_WEATHER_POINTS[0];
 for(const unavailable of [null,undefined,'',false,'0',-999,NaN,Infinity]){
  assert.equal(parseNasaSoybeanWeather(body(point,Array(7).fill(unavailable),Array(7).fill(unavailable)),point,checkedAt),null);
  const rainMissing=parseNasaSoybeanWeather(body(point,Array(7).fill(unavailable)),point,checkedAt)!;assert.equal(rainMissing.precip7mm,null);assert.equal(rainMissing.rainfallDays,0);assert.equal(rainMissing.hotDays,0);
  const heatMissing=parseNasaSoybeanWeather(body(point,Array(7).fill(3),Array(7).fill(unavailable)),point,checkedAt)!;assert.equal(heatMissing.hotDays,null);assert.equal(heatMissing.temperatureDays,0);assert.equal(heatMissing.precip7mm,21);
  enriched=enrichSoybeanWithEvidence(supply,[rainMissing,...points.slice(1)],now);assert.equal(enriched.origins.find(o=>o.originKey==='usa')?.status,'자료 부족');assert.ok(enriched.origins.find(o=>o.originKey==='usa')?.riskWeather.includes('강수 미확인'));
 }
 const zero=parseNasaSoybeanWeather(body(point,Array(7).fill(0),Array(7).fill(0)),point,checkedAt)!;assert.equal(zero.precip7mm,0);assert.equal(zero.hotDays,0);assert.equal(zero.temperatureDays,7,'actual numeric zero is valid');
 const partial=parseNasaSoybeanWeather(body(point,[3,3,3,null,3,3,3]),point,checkedAt)!;assert.equal(partial.rainfallDays,6);assert.equal(partial.observedRainMm,18);assert.equal(partial.precip7mm,null);assert.equal(enrichSoybeanWithEvidence(supply,[partial,...points.slice(1)],now).origins.find(o=>o.originKey==='usa')?.status,'자료 부족');
 const hot=parseNasaSoybeanWeather(body(point,Array(7).fill(null),[35,36,35,null,null,null,null]),point,checkedAt)!;assert.equal(hot.hotDays,3);assert.equal(enrichSoybeanWithEvidence(supply,[hot],now).origins.find(o=>o.originKey==='usa')?.status,'모니터링','known heat is not erased by missing rain');
 const wet=SOYBEAN_WEATHER_POINTS.map(p=>parseNasaSoybeanWeather(body(p,Array(7).fill(20)),p,checkedAt)!);assert.ok(enrichSoybeanWithEvidence(supply,wet,now).origins.every(o=>o.status==='양호'),'rainfall alone does not establish flooding');
 const wrongGeometry=body(point);wrongGeometry.geometry.coordinates=[NaN,NaN];assert.equal(parseNasaSoybeanWeather(wrongGeometry,point,checkedAt),null);
 const invalidUnit=body(point);invalidUnit.parameters.PRECTOTCORR.units='in/day';assert.equal(parseNasaSoybeanWeather(invalidUnit,point,checkedAt)?.precip7mm,null);
 assert.equal(isRecentSoybeanWeather({...points[0],checkedAt:new Date(now-4*86400000).toISOString()},now),false);
 assert.equal(enrichSoybeanWithEvidence(supply,[points[0],points[0]],now).origins.find(o=>o.originKey==='usa')?.status,'자료 부족','duplicate locations cannot replace second location');
 assert.equal(isRecentSoybeanWeather({...points[0],checkedAt:new Date(now+86400000).toISOString()},now),false);assert.equal(isRecentSoybeanWeather({...points[0],precip7mm:999},now),false);
 assert.equal(isRecentSoybeanWeather({...points[0],version:1} as any,now),false,'legacy lossy aggregates cannot certify green');
 assert.equal(enrichSoybeanWithEvidence(supply,points.slice(1),now).origins.find(o=>o.originKey==='usa')?.status,'자료 부족');
 const shifted=parseNasaSoybeanWeather(body(point),point,new Date(now).toISOString())!;shifted.lastDay=dates.at(-2)!.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');assert.equal(enrichSoybeanWithEvidence(supply,[shifted,...points.slice(1)],now).origins.find(o=>o.originKey==='usa')?.status,'자료 부족');
 // Actual refresh lifecycle: valid -> transport outage -> successfully retrieved missing data.
 let mode:'valid'|'outage'|'missing'='valid',weatherCalls=0;
 globalThis.fetch=async(input:any)=>{weatherCalls++;if(mode==='outage')return new Response('',{status:503});const u=new URL(String(input)),p=SOYBEAN_WEATHER_POINTS.find(p=>p.lat===Number(u.searchParams.get('latitude'))&&p.lon===Number(u.searchParams.get('longitude')))!;assert.ok(p);return Response.json(body(p,Array(7).fill(mode==='missing'?null:3),Array(7).fill(mode==='missing'?null:25)));};
 const service=new SoybeanOriginConditionsService();const valid=await service.getEvidence(true);assert.equal(valid.length,8);
 mode='outage';const retained=await service.getEvidence(true);assert.equal(retained.length,8);assert.ok(retained.every(p=>p.retrievalFailed&&p.checkedAt===valid.find(x=>x.location===p.location)!.checkedAt));assert.ok(enrichSoybeanWithEvidence(supply,retained).origins.every(o=>o.status==='자료 부족'));
 mode='missing';assert.deepEqual(await service.getEvidence(true),[],'new null source data cannot leave an old green result');assert.equal(weatherCalls,24);
 const html=renderToStaticMarkup(React.createElement(OriginRadar,{commodityId:'soybean',origins:enriched.origins}));assert.ok(html.includes('국가 생산'));assert.ok(html.includes('국가 수출'));assert.equal((html.match(/출처:/g)||[]).length,1);assert.equal((html.match(/NASA POWER/g)||[]).length,1);assert.ok(!html.includes('전월 비교 자료 없음'));assert.ok(!html.includes('강수 편차 점검'));
 console.log('PASS: USDA PA/country/commodity/year/units; exact quantities; actual mapped requests; missing comparisons; null/string/fill values and real zero; independent partial metrics; complete aligned windows; scoped soybean heat/rain screening; missing/outage safety; retained timestamps; national labels and one source footer.');
}finally{globalThis.fetch=native;delete process.env.RMS_ORIGIN_CACHE_DIR;fs.rmSync(temp,{recursive:true,force:true});}
