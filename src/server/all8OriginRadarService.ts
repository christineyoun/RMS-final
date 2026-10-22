import {withHistoricalWeatherContext} from './originHistoricalWeather.ts';
import {getOriginWeather,currentSharedWeather,parseSharedOpenMeteo,sharedWeatherSummary,withSharedFreezingRisk,TROPICAL_FREEZING_CROPS,type WeatherPoint,type SharedWeatherEvidence} from './originWeatherService.ts';
import {soybeanOilOriginService} from './soybeanOilOriginService.ts';
import {fetchOfficialPotatoEurostat} from './officialPotatoEurostatService.ts';
import fs from 'node:fs';
import {screenPalmRain,insufficientWeather,deferredWeatherAssessment} from '../utils/originWeatherPills.ts';
import path from 'node:path';
/** Free-first, evidence-only sourcing radar for RMS's five remaining commodities.
 * No Gemini calls; no historical sample numbers masquerading as live supply. */
import type { OriginRadarResponse, OriginItemDetail } from './originRadarService.ts';
type Point = {key:string;region:string;country:string;lat:number;lon:number};
type Spec = {code?:string;points:Point[]};
export const ORIGIN_MVP:Record<string,Spec> = {
  'soybean-oil':{code:'4232000',points:[['argentina','아르헨티나 (Rosario)','AR',-32.95,-60.66],['brazil','브라질 (Mato Grosso)','BR',-12.55,-55.72],['usa','미국 (Midwest)','US',41.59,-93.62],['paraguay','파라과이 (Alto Paraná)','PA',-25.53,-54.63]].map(p=>({key:String(p[0]),region:String(p[1]),country:String(p[2]),lat:Number(p[3]),lon:Number(p[4])}))},
  'palm-oil':{code:'4243000',points:[['indonesia','인도네시아 (Sumatra)','ID',3.59,98.67],['malaysia','말레이시아 (Sabah)','MY',5.84,118.11],['thailand','태국 (Surat Thani)','TH',9.14,99.32],['colombia','콜롬비아 (Meta)','CO',4.14,-73.63]].map(p=>({key:String(p[0]),region:String(p[1]),country:String(p[2]),lat:Number(p[3]),lon:Number(p[4])}))},
  sugar:{code:'0612000',points:[['brazil','브라질 (Center-South)','BR',-21.18,-47.81],['india','인도 (Maharashtra)','IN',16.71,74.24],['thailand','태국 (Nakhon Ratchasima)','TH',14.98,102.10],['australia','호주 (Queensland)','AS',-19.26,146.82]].map(p=>({key:String(p[0]),region:String(p[1]),country:String(p[2]),lat:Number(p[3]),lon:Number(p[4])}))},
  'potato-starch':{points:[['netherlands','네덜란드 (Groningen)','NL',53.22,6.57],['germany','독일 (Lower Saxony)','GM',52.37,9.73],['denmark','덴마크 (Jutland)','DA',56.27,9.50],['poland','폴란드 (Wielkopolska)','PL',52.41,16.93]].map(p=>({key:String(p[0]),region:String(p[1]),country:String(p[2]),lat:Number(p[3]),lon:Number(p[4])}))},
  'tapioca-starch':{points:[['thailand','태국 (Nakhon Ratchasima)','TH',14.98,102.10],['vietnam','베트남 (Tây Ninh)','VM',11.31,106.10],['cambodia','캄보디아 (Battambang)','CB',13.10,103.20],['laos','라오스 (Savannakhet)','LA',16.56,104.75]].map(p=>({key:String(p[0]),region:String(p[1]),country:String(p[2]),lat:Number(p[3]),lon:Number(p[4])}))}
};
function currentWeatherCache(id:string,value:OriginRadarResponse){return value.origins.length===ORIGIN_MVP[id].points.length&&value.origins.every(o=>{const p=ORIGIN_MVP[id].points.find(p=>p.key===o.originKey),e=o.weatherEvidence?.shared||o.weatherEvidence;return !!p&&e?.rainfallDays===7&&e?.temperatureDays===7&&e?.minimumTemperatureDays===7&&!e.retrievalFailed&&currentSharedWeather(e,{...p,label:p.region});});}
const memory=new Map<string,{at:number,value:OriginRadarResponse}>();
const format=(n:number)=>`${n.toFixed(2)}M MT`;
export function parseVerifiedPsd(rows:unknown,code:string,country:string,year:string) {
  if(!Array.isArray(rows))return null;
  const valid=(rows as any[]).filter(r=>r && String(r.commodityCode)===code && String(r.countryCode)===country && String(r.marketYear)===year && Number(r.unitId)===8 && /^\d{1,2}$/.test(String(r.month||'')));
  for(const month of [...new Set(valid.map(r=>String(r.month).padStart(2,'0')))].sort().reverse()){
    const items=valid.filter(r=>String(r.month).padStart(2,'0')===month);
    const get=(a:number)=>{const n=Number(items.find(r=>Number(r.attributeId)===a)?.value);return Number.isFinite(n)&&n>=0&&n<1e9?n/1000:null;};
    const production=get(28), exports=get(88), endingStocks=get(176);
    if(production!=null&&exports!=null&&endingStocks!=null && Number(month)>=1 && Number(month)<=12)
      {
        const priorMonths=[...new Set(valid.map(r=>String(r.month).padStart(2,'0')))].filter(m=>m<month).sort().reverse();
        const prev=priorMonths.map(m=>({month:m,row:valid.find(r=>String(r.month).padStart(2,'0')===m&&Number(r.attributeId)===88)})).find(v=>v.row&&Number.isFinite(Number(v.row.value)));
        return {production,exports,endingStocks,reportMonth:`${year}-${month}`,previousExports:prev?Number(prev.row.value)/1000:null,previousReportMonth:prev?`${year}-${prev.month}`:null};
      }
  }
  return null;
}
async function supply(p:Point,code:string|undefined,year:string){
  const key=(process.env.USDA_FAS_API_KEY||process.env.USDA_API_KEY||'').trim();if(!code||!key)return null;
  try{const r=await fetch(`https://api.fas.usda.gov/api/psd/commodity/${code}/country/${p.country}/year/${year}`,
    {headers:{Accept:'application/json','API_KEY':key,'x-api-key':key},signal:AbortSignal.timeout(9000)});
    return r.ok?parseVerifiedPsd(await r.json(),code,p.country,year):null;
  }catch{return null;}
}
function summarizeMeteoWeather(e:SharedWeatherEvidence|null){
 if(!e||e.rainfallDays!==7||e.retrievalFailed)return null;
 const recent=e.daily.map(d=>({day:d.date,mm:d.precipMm!})),base=e.history.slice(0,-7);
 const baseline=base.map(d=>({day:d.date,mm:d.precipMm!})),baselineComplete=base.length===21&&base.every(d=>d.precipMm!==null);
 return {mm:e.precip7mm!,days:7,day:e.lastDay,baselineMm:baselineComplete?base.reduce((n,d)=>n+d.precipMm!,0)/3:null,baselineDays:baselineComplete?21:0,complete:true,recent,baseline,evidence:e};
}
/** Compatibility entry point delegates to the same source/date/unit validator. */
export function parseMeteoWeather(body:unknown,point?:WeatherPoint,now=new Date(),extended=false){
 return point?summarizeMeteoWeather(parseSharedOpenMeteo(body,point,now.toISOString(),extended?28:7)):null;
}
async function weather(p:Point,extended=false,force=false,minimumTemperature=false){return getOriginWeather({...p,label:p.region},{historyDays:extended?28:7,force,minimumTemperature});}
const weatherEvidence=(id:string,e:SharedWeatherEvidence)=>id==='palm-oil'?{shared:e,recent:e.daily.map(d=>({day:d.date,mm:d.precipMm})),baseline:e.history.slice(0,-7).map(d=>({day:d.date,mm:d.precipMm})),model:true,coordinates:e.coordinates,retrievedAt:e.checkedAt}:e;

export function withOriginWeatherPills(id:string,value:OriginRadarResponse):OriginRadarResponse {
  return {...value,origins:value.origins.map(origin=>{
    const evidence=origin.weatherEvidence?.shared||origin.weatherEvidence;
    const point=ORIGIN_MVP[id]?.points.find(p=>p.key===origin.originKey);
    const verifiedCurrent=!!point&&!!evidence&&currentSharedWeather(evidence,{...point,label:point.region});
    const recheckFailed=!!origin.weatherEvidence?.retrievalFailed||!!evidence?.retrievalFailed;
    const current=verifiedCurrent&&!recheckFailed;
    let screen;
    if(id==='palm-oil'&&verifiedCurrent&&recheckFailed){
      // Recompute only from the source-validated retained history, never saved
      // pill labels or an unverified wrapper. No failed recheck can certify clear.
      const retained=screenPalmRain({shared:evidence,model:true,retrievedAt:evidence.checkedAt,
        recent:evidence.daily.map((d:any)=>({day:d.date,mm:d.precipMm})),
        baseline:evidence.history.slice(0,-7).map((d:any)=>({day:d.date,mm:d.precipMm}))});
      screen={...retained,weatherPills:[...retained.weatherPills.filter(p=>p.label==='강수 증가'||p.label==='강수 감소').map(p=>({...p,basis:p.basis+' · 저장 기상(재확인 실패) · 새로 확인된 기상 아님'})),
        ...insufficientWeather(`저장 기상 재확인 실패 · 마지막 검증 ${evidence.checkedAt} · 현재 기상 재확인 필요`).weatherPills]};
    }
    else if(!current)screen=insufficientWeather('최근 현지 7일 모델 기상의 출처·기간 또는 재확인 상태 확인 필요');
    else if(id==='palm-oil')screen=screenPalmRain(origin.weatherEvidence);
    else if(evidence.rainfallDays!==7||evidence.temperatureDays!==7)
      screen=insufficientWeather(`기상 확인 필요: 강수 ${evidence.rainfallDays}/7일 · 일최고기온 ${evidence.temperatureDays}/7일`);
    else {
      const reason:Record<string,string>={sugar:'생육단계·관개를 반영한 사탕수수 선별 기준 미확정','potato-starch':'토양온도·생육단계를 반영한 원료감자 선별 기준 미확정','tapioca-starch':'정식·생육단계를 반영한 카사바 선별 기준 미확정'};
      screen=deferredWeatherAssessment('기상 7일 확인(강수 7/7일 · 일최고기온 7/7일) · '+(reason[id]||'품목별 기상 선별 기준 미확정'));
    }
    if(point)screen=withSharedFreezingRisk(id,screen,evidence,{...point,label:point.region});
    return {...origin,...screen};
  })};
}
async function loadOriginRadarData(id:string,force=false):Promise<OriginRadarResponse>{
  if(id==='soybean-oil')return soybeanOilOriginService.get(force);
  const spec=ORIGIN_MVP[id];if(!spec)throw Error('Unsupported commodity');
  const cached=memory.get(id);if(!force&&cached&&Date.now()-cached.at<3*3600000&&currentWeatherCache(id,cached.value))return withOriginWeatherPills(id,cached.value);
  const year=String(new Date().getUTCFullYear());
  const savedFile=path.join(process.env.RMS_ALL8_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'all8-shared-weather-v1-'+id+'.json');
  let saved:any=null;try{saved=JSON.parse(fs.readFileSync(savedFile,'utf8'));}catch{try{saved=JSON.parse(fs.readFileSync(path.join(path.dirname(savedFile),'all8-'+id+'.json'),'utf8'));}catch{}}
  if(!force&&fs.existsSync(savedFile)&&saved?.lastUpdated&&Date.now()-Date.parse(saved.lastUpdated)<3*3600000&&Array.isArray(saved.origins)&&currentWeatherCache(id,saved))return withOriginWeatherPills(id,saved);
  const potato=id==='potato-starch'?await fetchOfficialPotatoEurostat(false):null;
  const origins:OriginItemDetail[]=await Promise.all(spec.points.map(async p=>{
    const [psd,e]=await Promise.all([supply(p,spec.code,year),weather(p,id==='palm-oil',force,true) ]);
    const w=summarizeMeteoWeather(e);
    let s:any=psd;
    const geo=({germany:'DE',netherlands:'NL',denmark:'DK',poland:'PL'} as Record<string,string>)[p.key];
    const country=potato?.success?potato.data?.countries.find(c=>c.country===geo):null;
    if(country)s={production:country.production1000MT/1000,exports:null,endingStocks:null,reportMonth:potato!.data!.harvestYear};
    const previous=saved?.origins?.find((o:any)=>o.originKey===p.key);
    if(!s&&previous){
      return {...previous,...(id==='palm-oil'?screenPalmRain(e?weatherEvidence(id,e):null):insufficientWeather()),weatherEvidence:e?weatherEvidence(id,e):(previous.weatherEvidence?{...previous.weatherEvidence,retrievalFailed:true}:undefined),status:'자료 부족',statusColor:'gray',isLive:false,dataFreshness:'cached',
        riskWeather:w?`모델 기상(현지 ${w.evidence.windowStart}~${w.day}): ${w.mm.toFixed(1)}mm`:e?sharedWeatherSummary([e]):'모델 기상 자료 부족 (Open-Meteo)',
        weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherAsOf:e?.lastDay||''} as OriginItemDetail;
    }
    const palmScreen=id==='palm-oil'&&w&&w.complete&&w.baselineDays===21&&w.baselineMm!=null;
    const anomalous=palmScreen&&(w.baselineMm>0?(w.mm>=2*w.baselineMm||w.mm<=0.25*w.baselineMm):w.mm>0);
    const palmStatus=palmScreen?(anomalous?'모니터링':'양호'):'자료 부족';
    return {originKey:p.key as any,region:p.region,production:s?format(s.production)+(country?' (원료감자)':''):'',productionNumericMMT:s?s.production:null,
      exports:s?.exports!=null?'수출 '+format(s.exports):'',endingStocks:s?.endingStocks!=null?'기말재고 '+format(s.endingStocks):'',
      exportComparison:s?.previousExports>0?`전기 대비 ${((s.exports-s.previousExports)/s.previousExports*100).toFixed(1)}%`:'',
      exportComparisonBasis:s?.previousReportMonth||'',
      marketYear:s?`${year}/${String(+year+1).slice(-2)}`:'',unit:'MMT',
      status:id==='palm-oil'?palmStatus:s&&w?'모니터링':'자료 부족',statusColor:id==='palm-oil'?(palmStatus==='양호'?'green':palmStatus==='모니터링'?'yellow':'gray'):s&&w?'yellow':'gray',statusBasis:id==='palm-oil'?(palmScreen?`지역 모델 강수의 직전 3주 주평균 대비 단기 편차 스크리닝: 최근 ${w.mm.toFixed(1)}mm / 기준 ${w.baselineMm!.toFixed(1)}mm. 2배 이상 또는 1/4 이하이면 감시합니다. 팜 생육 임계치·작황 피해·납품 안전 판정이 아닙니다.`:'최근 7일 및 비교 21일 강수 근거가 부족합니다. 확인된 국가 수급은 유지합니다.'):s&&w?'국가 수급과 최근 지역 강수 확인; 생육 피해나 납품 위험은 별도 확인 필요':'위험 분류에 필요한 수급·기상 근거가 부족합니다.',
      riskAssessment:s?'공식 USDA 생산·수출·재고 확인, 위험 분류는 별도 검증 필요':'산지별 공식 생산·수출·재고 미확인',
      riskWeather:w?`모델 기상(현지 ${w.evidence.windowStart}~${w.day}, ${w.evidence.timeZone}): ${w.mm.toFixed(1)}mm`+(id==='palm-oil'&&w.baselineMm!=null?` · 직전 3주 주평균 ${w.baselineMm.toFixed(1)}mm`:''):e?sharedWeatherSummary([e]):'모델 기상 자료 부족 (Open-Meteo)',
      weatherDataKind:'archived-model',weatherSource:'Open-Meteo',weatherAsOf:e?.lastDay||'',weatherEvidence:e?weatherEvidence(id,e): (previous?.weatherEvidence?{...previous.weatherEvidence,retrievalFailed:true}:undefined),
      primarySource:s?(country?'Eurostat (원료감자)':'USDA FAS PSD'):w?'Open-Meteo':'',sourceName:s?(country?'Eurostat (원료감자)':'USDA FAS PSD'):w?'Open-Meteo':'',sourceOrg:s?(country?'Eurostat (원료감자)':'USDA FAS'):w?'Open-Meteo':'',
      sourceReportDate:s?.reportMonth||'',sourceUrl:s?(country?potato!.sourceUrl:'https://apps.fas.usda.gov/psdonline/app/index.html'):w?'https://open-meteo.com/':'',
      retrievedAt:new Date().toISOString(),isLive:!!s,dataFreshness:s?'live':w?'cached':'unavailable'
    } as OriginItemDetail;
  }));
  const value:OriginRadarResponse=withOriginWeatherPills(id,{success:true,statusCode:200,lastUpdated:new Date().toISOString(),origins,
    sourcesUsed:origins.map(o=>({origin:o.region,primarySource:o.sourceName||'',sourceOrg:o.sourceOrg||'',sourceReportDate:o.sourceReportDate||'',sourceUrl:o.sourceUrl||'',status:o.dataFreshness})),
    sourceFooterText:spec.code?'USDA FAS PSD · Open-Meteo':'Open-Meteo (기상만 확인, 전분 수급 통계 미확인)'});
  fs.mkdirSync(path.dirname(savedFile),{recursive:true});const temp=savedFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,savedFile);
  memory.set(id,{at:Date.now(),value});return value;
}

export async function loadAll8OriginRadar(id:string,force=false):Promise<OriginRadarResponse>{
 const result=await loadOriginRadarData(id,force);
 return withHistoricalWeatherContext(result,ORIGIN_MVP[id].points.map(p=>({...p,label:p.region})));
}
