import {currentSharedWeather,weatherWindowEnd,type SharedWeatherEvidence,type WeatherPoint} from './originWeatherService.ts';
import type {OriginRadarResponse} from './originRadarService.ts';

async function originWeatherPoints(id:string):Promise<readonly WeatherPoint[]> {
  if(id==='wheat')return (await import('./wheatOriginRiskService.ts')).WHEAT_WEATHER_POINTS;
  if(id==='corn')return (await import('./cornOriginConditionsService.ts')).CORN_WEATHER_POINTS;
  if(id==='soybean')return (await import('./soybeanOriginConditionsService.ts')).SOYBEAN_WEATHER_POINTS;
  const spec=(await import('./all8OriginRadarService.ts')).ORIGIN_MVP[id];
  if(!spec)throw Error('No Origin Radar weather locations configured for '+id);
  return spec.points.map(p=>({...p,label:p.region}));
}

type PointStatus='current'|'retained'|'incomplete'|'missing'|'invalid';
function coverage(e:SharedWeatherEvidence,point:WeatherPoint,now:Date,wrapperFailed:boolean) {
  const checked=Date.parse(e.checkedAt);
  if(!Number.isFinite(checked)||checked>now.getTime()+60000||!currentSharedWeather(e,point,new Date(checked)))
    return {status:'invalid' as const,observed:null,expected:null};
  const expected=weatherWindowEnd(now,e.timeZone);
  const observed=e.lastDay;
  if(observed>expected)return {status:'invalid' as const,observed:null,expected};
  if(observed<expected)return {status:'retained' as const,observed,expected};
  const complete=!wrapperFailed&&!e.retrievalFailed&&e.history.length===28&&
    e.history.every(d=>d.precipMm!==null)&&e.rainfallDays===7&&e.temperatureDays===7&&e.minimumTemperatureDays===7;
  return {status:complete&&currentSharedWeather(e,point,now)?'current' as const:'incomplete' as const,observed,expected};
}

/** Audit each configured point even when its origin or one of its receipts is absent.
 * The saved radar contains the actual observations, including older ones. This report
 * never advances a source date or includes raw response contents. */
export async function originWeatherPublicationStatus(id:string,publication:OriginRadarResponse,now=new Date()) {
  const configured=await originWeatherPoints(id);
  const counts:Record<PointStatus,number>={current:0,retained:0,incomplete:0,missing:0,invalid:0};
  const points=configured.map(point=>{
    const wrappers=publication.origins.filter(o=>String(o.originKey)===point.key).map(o=>o.weatherEvidence);
    const matches=wrappers.flatMap(w=>(Array.isArray(w)?w:[w?.shared||w])
      .filter(e=>e?.location===point.label)
      .map(e=>coverage(e,point,now,!!w?.retrievalFailed)));
    const order:PointStatus[]=['current','incomplete','retained','invalid','missing'];
    const best=matches.sort((a,b)=>order.indexOf(a.status)-order.indexOf(b.status)||
      (b.observed||'').localeCompare(a.observed||''))[0]||
      {status:'missing' as const,observed:null,expected:null};
    counts[best.status]++;
    return {origin:point.key,location:point.label,...best};
  });
  const latestObservation=points.flatMap(p=>p.observed?[p.observed]:[]).sort().at(-1);
  return {counts,points,latestObservation};
}
