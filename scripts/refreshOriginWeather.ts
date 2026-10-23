/** Explicit laptop-only weather publication. No server route or scheduler. */
import fs from 'node:fs';import path from 'node:path';
import {getOriginWeather,currentSharedWeather,type WeatherPoint} from '../src/server/originWeatherService.ts';
import {WHEAT_WEATHER_POINTS} from '../src/server/wheatOriginRiskService.ts';
import {CORN_WEATHER_POINTS} from '../src/server/cornOriginConditionsService.ts';
import {SOYBEAN_WEATHER_POINTS} from '../src/server/soybeanOriginConditionsService.ts';
import {ORIGIN_MVP,loadAll8OriginRadar} from '../src/server/all8OriginRadarService.ts';
import {originRadarService} from '../src/server/originRadarService.ts';
import {originWeatherDisplayStatus} from '../src/components/OriginRadar.tsx';
const outputArg=process.argv.find(a=>a.startsWith('--output='));
const output=path.resolve(outputArg?.slice(9)||'.rms-research/weather-only-refresh-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const configured:Record<string,ReadonlyArray<WeatherPoint>>={wheat:WHEAT_WEATHER_POINTS,corn:CORN_WEATHER_POINTS,soybean:SOYBEAN_WEATHER_POINTS,
 ...Object.fromEntries(Object.entries(ORIGIN_MVP).map(([id,spec])=>[id,spec.points.map(p=>({key:p.key,label:p.region,lat:p.lat,lon:p.lon}))]))};
const jobs=[...new Map(ids.flatMap(id=>configured[id].map(point=>({point,historyDays:28}))).map(j=>[JSON.stringify(j),j])).values()];
const nativeFetch=globalThis.fetch;let requests=0;const requestLog:any[]=[];
globalThis.fetch=async()=>{throw Error('Weather-only refresh blocked a non-weather service request');};
const freeFetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
 if(url.protocol!=='https:'||url.hostname!=='api.open-meteo.com'||url.pathname!=='/v1/forecast'||url.searchParams.has('apikey'))throw Error('Only the FREE public Open-Meteo weather endpoint is authorized');
 if(++requests>jobs.length*2)throw Error('Bounded weather-only request budget exceeded');
 const startedAt=new Date().toISOString();try{const response=await nativeFetch(input,init);requestLog.push({url:String(input),startedAt,status:response.status});return response;}
 catch(e){requestLog.push({url:String(input),startedAt,error:e instanceof Error?e.message:String(e)});throw e;}
};
try{
 const attempts:any[]=[];let next=0;
 // Two workers avoid the previous all-region burst and retain bounded retries.
 await Promise.all([0,1].map(async()=>{while(next<jobs.length){const {point,historyDays}=jobs[next++];
  const refreshStartedAt=Date.now();
  const evidence=await getOriginWeather(point,{force:true,minimumTemperature:true,historyDays,fetcher:freeFetcher});
  const now=new Date(),current=!!evidence&&currentSharedWeather(evidence,point,now);
  attempts.push({point,historyDays,current,refreshed:!!evidence&&Date.parse(evidence.checkedAt)>=refreshStartedAt,window:evidence?[evidence.windowStart,evidence.lastDay]:null,timeZone:evidence?.timeZone,
   historyDaysComplete:evidence?.history.filter(d=>d.precipMm!==null).length||0,rainfallDays:evidence?.rainfallDays||0,temperatureDays:evidence?.temperatureDays||0,minimumTemperatureDays:evidence?.minimumTemperatureDays||0,
   sourceUrl:evidence?.sourceUrl,checkedAt:evidence?.checkedAt});
  console.log(`${attempts.length}/${jobs.length} ${point.label}: ${current?'current':'retained/missing'} rain ${evidence?.rainfallDays||0}/7 Tmax ${evidence?.temperatureDays||0}/7 Tmin ${evidence?.minimumTemperatureDays||0}/7`);
 }}));
 const regions:any[]=[];
 for(const id of ids){const radar=id==='wheat'?await originRadarService.getWheatOriginRadar():id==='corn'?await originRadarService.getCornOriginRadar():id==='soybean'?await originRadarService.getSoybeanOriginRadar():await loadAll8OriginRadar(id);
  fs.writeFileSync(path.join(output,'api-'+id+'.json'),JSON.stringify(radar,null,2));
  for(const origin of radar.origins){const raw=origin.weatherEvidence,points=Array.isArray(raw)?raw:raw?[raw.shared||raw]:[];
   const status=originWeatherDisplayStatus(origin,id);
   regions.push({commodity:id,region:origin.region,label:status.label,reason:status.basis,screening:origin.weatherScreening,
    points:points.map((e:any)=>({location:e.location,coordinates:e.coordinates,window:[e.windowStart,e.lastDay],timeZone:e.timeZone,checkedAt:e.checkedAt,
     current:configured[id].some(p=>currentSharedWeather(e,p)),rainfallDays:e.rainfallDays,temperatureDays:e.temperatureDays,minimumTemperatureDays:e.minimumTemperatureDays,
     previousWeeklyMm:e.history.length===28&&e.history.slice(0,21).every((d:any)=>d.precipMm!==null)?e.history.slice(0,21).reduce((n:number,d:any)=>n+d.precipMm,0)/3:null,historyRainfallDays:e.history.filter((d:any)=>d.precipMm!==null).length,rainfallMm:e.precip7mm,minimumC:Math.min(...e.daily.filter((d:any)=>d.tMinC!=null).map((d:any)=>d.tMinC)),maximumC:Math.max(...e.daily.filter((d:any)=>d.tMaxC!=null).map((d:any)=>d.tMaxC)),sourceUrl:e.sourceUrl}))});
  }
 }
 fs.writeFileSync(path.join(output,'refresh.json'),JSON.stringify({startedAt:requestLog[0]?.startedAt,finishedAt:new Date().toISOString(),manual:true,free:true,requests,attempts,requestLog,regions},null,2));
 console.log(`Published weather only: ${requests} free requests, ${regions.length} regions. ${regions.filter(r=>r.label==='판정 보류').length} responsibly deferred.`);
 if(attempts.some(p=>!p.refreshed||!p.current||p.historyDaysComplete!==28||p.rainfallDays!==7||p.temperatureDays!==7||p.minimumTemperatureDays!==7))process.exitCode=2;
}finally{globalThis.fetch=nativeFetch;}
