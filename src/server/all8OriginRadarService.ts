import {soybeanOilOriginService} from './soybeanOilOriginService.ts';
import {fetchOfficialPotatoEurostat} from './officialPotatoEurostatService.ts';
import fs from 'node:fs';
import {screenPalmRain,insufficientWeather,validWeatherDay} from '../utils/originWeatherPills.ts';
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
export function parseMeteoWeather(body:unknown){
  const d=(body as any)?.daily;
  if(!Array.isArray(d?.time)||!Array.isArray(d?.precipitation_sum)||new Set(d.time).size!==d.time.length)return null;
  const today=new Date().toISOString().slice(0,10);
  const available=d.time.map((v:string,i:number)=>({day:String(v),mm:typeof d.precipitation_sum[i]==='number'?d.precipitation_sum[i]:NaN}))
    .filter((v:any)=>validWeatherDay(v.day)&&v.day<today&&Date.parse(v.day)>Date.now()-40*86400000&&Number.isFinite(v.mm)&&v.mm>=0&&v.mm<=500).sort((a:any,b:any)=>a.day.localeCompare(b.day));
  const rows=available.slice(-7);const baseline=available.slice(-28,-7);const baselineMm=baseline.length===21&&Date.parse(rows[0]?.day)-Date.parse(baseline[0]?.day)===21*86400000?baseline.reduce((n:number,r:any)=>n+r.mm,0)/3:null;
  if(rows.length<5||Date.parse(rows.at(-1)!.day)<Date.now()-4*86400000)return null;
  return {mm:rows.reduce((n:number,r:any)=>n+r.mm,0),days:rows.length,day:rows.at(-1)!.day,baselineMm,baselineDays:baseline.length,complete:rows.length===7&&Date.parse(rows.at(-1)!.day)-Date.parse(rows[0].day)===6*86400000,recent:rows,baseline};
}
async function weather(p:Point,extended=false){
  try{const u=`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=precipitation_sum&past_days=${extended?35:8}&forecast_days=1&timezone=auto`;
    const r=await fetch(u,{signal:AbortSignal.timeout(9000)});return r.ok?parseMeteoWeather(await r.json()):null;
  }catch{return null;}
}
export function withOriginWeatherPills(id:string,value:OriginRadarResponse):OriginRadarResponse {
  return {...value,origins:value.origins.map(origin=>({...origin,...(id==='palm-oil'?screenPalmRain((origin as any).weatherEvidence):insufficientWeather('지역 강수 관측은 있으나 이 원자재의 검증된 기상 선별 규칙은 아직 없습니다.'))}))};
}
export async function loadAll8OriginRadar(id:string,force=false):Promise<OriginRadarResponse>{
  if(id==='soybean-oil')return soybeanOilOriginService.get(force);
  const spec=ORIGIN_MVP[id];if(!spec)throw Error('Unsupported commodity');
  const cached=memory.get(id);if(!force&&cached&&Date.now()-cached.at<3*3600000)return withOriginWeatherPills(id,cached.value);
  const year=String(new Date().getUTCFullYear());
  const savedFile=path.join(process.env.RMS_ALL8_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'all8-'+id+'.json');
  let saved:any=null;try{saved=JSON.parse(fs.readFileSync(savedFile,'utf8'));}catch{}
  if(!force&&saved?.lastUpdated&&Date.now()-Date.parse(saved.lastUpdated)<3*3600000&&Array.isArray(saved.origins))return withOriginWeatherPills(id,saved);
  const potato=id==='potato-starch'?await fetchOfficialPotatoEurostat(false):null;
  const origins:OriginItemDetail[]=await Promise.all(spec.points.map(async p=>{
    const [psd,w]=await Promise.all([supply(p,spec.code,year),weather(p,id==='palm-oil') ]);
    let s:any=psd;
    const geo=({germany:'DE',netherlands:'NL',denmark:'DK',poland:'PL'} as Record<string,string>)[p.key];
    const country=potato?.success?potato.data?.countries.find(c=>c.country===geo):null;
    if(country)s={production:country.production1000MT/1000,exports:null,endingStocks:null,reportMonth:potato!.data!.harvestYear};
    const previous=saved?.origins?.find((o:any)=>o.originKey===p.key);
    const priorWeather=previous?.weatherAsOf&&Date.parse(previous.weatherAsOf)>Date.now()-10*86400000?previous:null;
    if(!s&&previous){
      return {...previous,...(id==='palm-oil'?screenPalmRain(w?{recent:w.recent,baseline:w.baseline,model:true,retrievedAt:new Date().toISOString()}:null):insufficientWeather()),weatherEvidence:id==='palm-oil'&&w?{recent:w.recent,baseline:w.baseline,model:true,coordinates:[p.lat,p.lon],retrievedAt:new Date().toISOString()}:previous.weatherEvidence?{...previous.weatherEvidence,retrievalFailed:true}:undefined,status:'자료 부족',statusColor:'gray',isLive:false,dataFreshness:'cached',
        riskWeather:w?`기상(최근 ${w.days}일 모델 강수): ${w.mm.toFixed(1)}mm`:priorWeather?.riskWeather||'',
        weatherSource:w?'Open-Meteo':priorWeather?.weatherSource||'',weatherAsOf:w?.day||priorWeather?.weatherAsOf||''} as OriginItemDetail;
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
      riskWeather:w?`기상(최근 ${w.days}일 모델 강수): ${w.mm.toFixed(1)}mm`+(id==='palm-oil'&&w.baselineMm!=null?` · 직전 3주 주평균 ${w.baselineMm.toFixed(1)}mm`:''):priorWeather?.riskWeather||'',
      weatherSource:w?'Open-Meteo':priorWeather?.weatherSource||'',weatherAsOf:w?.day||priorWeather?.weatherAsOf||'',weatherEvidence:id==='palm-oil'&&w?{recent:w.recent,baseline:w.baseline,model:true,coordinates:[p.lat,p.lon],retrievedAt:new Date().toISOString()}:previous?.weatherEvidence?{...previous.weatherEvidence,retrievalFailed:true}:undefined,
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
