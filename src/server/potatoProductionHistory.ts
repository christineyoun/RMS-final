import {potatoChartOfficialFetch} from './potatoChartTransport.ts';
import fs from 'node:fs';
import path from 'node:path';
import { IMPORTED_POTATO_PRODUCTION } from '../data/potatoProductionHistory.ts';
import { fetchOfficialPotatoEurostat, type OfficialPotatoEurostatRecord } from './officialPotatoEurostatService.ts';
export type PotatoYear={year:string;productionMMT:number;status:string;sourceUrl:string;unit:string;coverage:string[];provenance:string};
export type PotatoHistory={version:1;years:PotatoYear[];importedOriginal:PotatoYear[];lastCheckedAt?:string;lastError?:string};
const file=()=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history','potato-production.json');
export function loadPotatoProductionHistory():PotatoHistory {
  if(!fs.existsSync(file()))return {version:1,years:IMPORTED_POTATO_PRODUCTION.map(p=>({...p})),importedOriginal:IMPORTED_POTATO_PRODUCTION};
  const saved=JSON.parse(fs.readFileSync(file(),'utf8'));
  if(saved.version!==1||!Array.isArray(saved.years)||!saved.years.every(validYear))throw Error('Unreadable saved potato history; original file retained');
  return saved;
}
const validYear=(p:PotatoYear)=>/^20\d{2}$/.test(p.year)&&Number(p.year)<=new Date().getUTCFullYear()&&Number.isFinite(p.productionMMT)&&p.productionMMT>0&&p.productionMMT<200&&p.unit==='MMT'&&p.coverage?.join(',')==='DE,FR,NL,DK';
export function mergePotatoProduction(history:PotatoHistory,records:OfficialPotatoEurostatRecord[]):PotatoHistory {
  const years=new Map(history.years.map(p=>[p.year,p]));
  for(const r of records){
    const p:PotatoYear={year:r.harvestYear,productionMMT:r.productionMMT,status:r.isEstimateOrProvisional?'Estimate':'Actual',sourceUrl:'https://ec.europa.eu/eurostat/databrowser/view/'+r.dataset+'/default/table?lang=en',unit:'MMT',coverage:r.coverage,provenance:'source-verified'};
    if(!validYear(p))throw Error('Invalid or mixed-coverage official potato observation');
    years.set(p.year,p);
  }
  return {...history,years:[...years.values()].sort((a,b)=>a.year.localeCompare(b.year))};
}
export function savePotatoProductionHistory(history:PotatoHistory){fs.mkdirSync(path.dirname(file()),{recursive:true});const temp=file()+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(history,null,2));fs.renameSync(temp,file());}
export async function refreshPotatoProductionHistory():Promise<PotatoHistory>{
  let history=loadPotatoProductionHistory();
  try{
    const result=await fetchOfficialPotatoEurostat(true);
    if(result.success&&result.data){history=mergePotatoProduction(history,result.history||[result.data]);history.lastError=undefined;}
    else history.lastError=result.message||'Official source unavailable';
  }catch(e){history.lastError=String((e as Error).message);}
  history.lastCheckedAt=new Date().toISOString();savePotatoProductionHistory(history);return history;
}
export function potatoProductionPayload(history=loadPotatoProductionHistory()){
  return {success:true,dataStatus:history.lastError?'last-verified':'saved-history',data:{years:history.years,unit:'MMT',coverage:['DE','FR','NL','DK'],summary:'독일·프랑스·네덜란드·덴마크 원료감자 생산량. 전분 가격 아님.'},diagnostics:{lastCheckedAt:history.lastCheckedAt,lastError:history.lastError}};
}

// Graph-only regional history. Existing four-country payload/SCM consumers above are unchanged.
export type {PotatoChartSnapshot,PotatoChartPoint} from '../utils/potatoProductionChart.ts';
import {POTATO_CHART_REGIONS,type PotatoChartSnapshot,type PotatoChartPoint,type PotatoArea,type PotatoYieldForecast,type PotatoOriginalPoint} from '../utils/potatoProductionChart.ts';
import {readRetainedPotatoChartYields,type PotatoChartJrcPacket} from './potatoJrcOutlook.ts';
const regionalFile=()=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history','potato-production-regions-v2.json');
const regionalUrl='https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/apro_cpnh1';
const regionalPage='https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en';
function regionalCodes(raw:any,dim:string):string[]{const ix=raw?.dimension?.[dim]?.category?.index;return Array.isArray(ix)?ix:ix&&typeof ix==='object'?Object.keys(ix).sort((a,b)=>ix[a]-ix[b]):[];}
function regionalValue(raw:any,fixed:Record<string,string>):{value:number;flags:string}|null{
 if(!Array.isArray(raw?.id)||raw.id.length!==raw.size?.length)return null;
 let index=0;
 for(let i=0;i<raw.id.length;i++){const dim=raw.id[i],codes=regionalCodes(raw,dim),pos=codes.indexOf(fixed[dim]);if(codes.length!==raw.size[i]||pos<0)return null;index=index*codes.length+pos;}
 const value=raw.value?.[index],flags=String(raw.status?.[index]||'');
 return typeof value==='number'&&Number.isFinite(value)&&value>0&&!/[cuxz]/i.test(flags)?{value,flags}:null;
}
/** Independent region/year observations, not the old summed four-country manual series. */
export function parseRegionalPotatoProduction(raw:any,now=new Date()):{points:PotatoChartPoint[];areas:PotatoArea[]}{
 const points:PotatoChartPoint[]=[],areas:PotatoArea[]=[];
 if(raw?.id?.length!==5||new Set(raw.id).size!==5||!['freq','crops','geo','strucpro','time'].every(d=>raw.id.includes(d))||
 regionalCodes(raw,'freq').join()!=='A'||regionalCodes(raw,'crops').join()!=='R1000'||!Number.isFinite(Date.parse(raw.updated))||Date.parse(raw.updated)>+now)return {points,areas};
 const labels=raw.dimension.strucpro?.category?.label||{};
 const production=regionalCodes(raw,'strucpro').find(code=>/harvested production/i.test(labels[code]||'')&&/thousand tonnes/i.test(labels[code]||''));
 const area=regionalCodes(raw,'strucpro').find(code=>code==='AR_THS_HA'&&/thousand hectares/i.test(labels[code]||''));
 for(const region of POTATO_CHART_REGIONS){
  if(!regionalCodes(raw,'geo').includes(region))continue;
  for(const yearCode of regionalCodes(raw,'time')){
   const year=Number(yearCode);if(!/^\d{4}$/.test(yearCode)||year<1900||year>now.getUTCFullYear())continue;
   const common={freq:'A',crops:'R1000',geo:region,time:yearCode};
   const a=area?regionalValue(raw,{...common,strucpro:area}):null;
   if(a&&a.value<100000)areas.push({region,year,area1000HA:a.value,sourceUrl:regionalPage,publishedAt:raw.updated,verifiedAt:now.toISOString(),crop:'R1000',flags:a.flags});
   const p=production?regionalValue(raw,{...common,strucpro:production}):null;
   if(!p||p.value>1_000_000)continue;
   // e is Eurostat's official estimated observation; p is provisional, not final Actual.
   const status=/e/i.test(p.flags)?'Official Estimate':/p/i.test(p.flags)?'Provisional':'Actual';
   points.push({region,year,productionMMT:p.value/1000,status,sourceUrl:regionalPage,publishedAt:raw.updated,publicationDateKind:'dataset-update',verifiedAt:now.toISOString(),crop:'R1000',unit:'MMT',flags:p.flags});
  }
 }
 return {points,areas};
}
/** The original chart's DE/FR/NL/DK sum, complete official production observations only. */
export function parseOriginalPotatoSeries(raw:any,now=new Date()):PotatoOriginalPoint[]{
 const verified=parseRegionalPotatoProduction(raw,now);if(!verified.points.length)return [];
 const labels=raw.dimension.strucpro.category.label||{},measure=regionalCodes(raw,'strucpro').find(code=>/harvested production/i.test(labels[code]||'')&&/thousand tonnes/i.test(labels[code]||''));
 if(!measure)return [];const series:PotatoOriginalPoint[]=[];
 for(const yearCode of regionalCodes(raw,'time')){
  const year=Number(yearCode);if(!/^\d{4}$/.test(yearCode)||year<1900||year>now.getUTCFullYear())continue;
  const rows=['DE','FR','NL','DK'].map(geo=>regionalValue(raw,{freq:'A',crops:'R1000',geo,time:yearCode,strucpro:measure}));
  if(rows.some(row=>!row))continue;
  const flags=rows.map(row=>row!.flags).join(''),productionMMT=rows.reduce((n,row)=>n+row!.value,0)/1000;
  series.push({region:'ORIGINS4',coverage:['DE','FR','NL','DK'],year,productionMMT,status:/e/i.test(flags)?'Official Estimate':/p/i.test(flags)?'Provisional':'Actual',sourceUrl:regionalPage,publishedAt:raw.updated,publicationDateKind:'dataset-update',verifiedAt:now.toISOString(),crop:'R1000',unit:'MMT',flags});
 }return series.sort((a,b)=>a.year-b.year);
}
export function deriveRegionalPotatoProduction(areas:PotatoArea[],forecasts:PotatoYieldForecast[]):PotatoChartPoint[]{
 return forecasts.flatMap(f=>{
  const matches=areas.filter(a=>a.region===f.region&&a.year===f.year&&a.crop===f.crop);
  if(matches.length!==1||f.crop!=='R1000'||!POTATO_CHART_REGIONS.includes(f.region)||!Number.isFinite(f.yieldMTHA)||f.yieldMTHA<=0||f.yieldMTHA>100||!f.definitionEvidence)return [];
  const a=matches[0];if(!Number.isFinite(a.area1000HA)||a.area1000HA<=0)return [];
  return [{region:f.region,year:f.year,productionMMT:a.area1000HA*f.yieldMTHA/1000,status:'Derived Estimate' as const,sourceUrl:f.sourceUrl,publishedAt:f.publishedAt,publicationDateKind:'report-publication' as const,verifiedAt:f.verifiedAt,crop:'R1000' as const,unit:'MMT' as const,flags:a.flags,area1000HA:a.area1000HA,yieldMTHA:f.yieldMTHA,areaSourceUrl:a.sourceUrl,areaPublishedAt:a.publishedAt,formula:`${a.area1000HA} kHA × ${f.yieldMTHA} MT/HA ÷ 1000`}];
 });
}
function validRegionalPoint(p:any,now:Date):p is PotatoChartPoint{
 return p&&POTATO_CHART_REGIONS.includes(p.region)&&Number.isInteger(p.year)&&p.year>=1900&&p.year<=now.getUTCFullYear()&&Number.isFinite(p.productionMMT)&&p.productionMMT>0&&p.productionMMT<1000&&p.crop==='R1000'&&p.unit==='MMT'&&['Actual','Provisional','Official Estimate','Derived Estimate'].includes(p.status)&&
 Number.isFinite(Date.parse(p.publishedAt))&&Date.parse(p.publishedAt)<=+now&&Number.isFinite(Date.parse(p.verifiedAt))&&Date.parse(p.verifiedAt)<=+now&&
 (p.status==='Derived Estimate'?p.areaSourceUrl===regionalPage&&Number.isFinite(p.area1000HA)&&p.area1000HA>0&&Number.isFinite(p.yieldMTHA)&&p.yieldMTHA>0&&Math.abs(p.productionMMT-p.area1000HA*p.yieldMTHA/1000)<1e-10&&/^https:\/\/publications\.jrc\.ec\.europa\.eu\//.test(p.sourceUrl):p.sourceUrl===regionalPage);
}
/** Injectable graph-only store; default reads never import manual production history. */
export function createRegionalPotatoHistory(options:{file?:string|null;now?:()=>Date;fetcher?:typeof fetch;jrc?:()=>Promise<PotatoChartJrcPacket>}={}){
 const filename=options.file===undefined?regionalFile():options.file,clock=options.now||(()=>new Date());
 let state:PotatoChartSnapshot={version:2,points:[],areas:[]},loaded=false,expires=0,pending:Promise<PotatoChartSnapshot>|null=null;
 const read=()=>{if(loaded)return;loaded=true;if(filename)try{const raw=JSON.parse(fs.readFileSync(filename,'utf8'));if(raw.version===2&&Array.isArray(raw.points)&&raw.points.every((p:any)=>validRegionalPoint(p,clock()))){state=raw;state.originalSeries=Array.isArray(raw.originalSeries)?raw.originalSeries.filter((p:any)=>p.region==='ORIGINS4'&&JSON.stringify(p.coverage)===JSON.stringify(['DE','FR','NL','DK'])&&p.status!=='Derived Estimate'&&validRegionalPoint({...p,region:'DE'},clock())):[];}}catch{}};
 const refresh=()=>{
  if(pending)return pending;read();
  pending=(async()=>{
   const errors:string[]=[];
   const [official,jrc]=await Promise.allSettled([(async()=>{
    const q=new URLSearchParams({lang:'EN',freq:'A',crops:'R1000'});for(const g of [...POTATO_CHART_REGIONS,'FR'])q.append('geo',g);
    const response=await (options.fetcher||potatoChartOfficialFetch)(regionalUrl+'?'+q,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Object.assign(Error('Eurostat HTTP '+response.status),{stage:'http'});
    let raw:any;try{raw=await response.json();}catch{throw Object.assign(Error('Eurostat JSON 응답 해석 실패'),{stage:'parse'});}
    const parsed=parseRegionalPotatoProduction(raw,clock()),originalSeries=parseOriginalPotatoSeries(raw,clock());
    if(!parsed.points.length)throw Object.assign(Error('공식 생산량 차원·단위·기준일 검증 실패'),{stage:'validation'});
    return {...parsed,originalSeries};
   })(),(options.jrc||(()=>readRetainedPotatoChartYields(process.cwd(),clock())))()]);
   const map=new Map(state.points.map(p=>[p.region+':'+p.year,p]));
   if(official.status==='fulfilled'){
    for(const p of official.value.points){const old=map.get(p.region+':'+p.year);if(!old||p.publishedAt>=old.publishedAt||old.status==='Derived Estimate')map.set(p.region+':'+p.year,p);}
    if(official.value.originalSeries.length)state.originalSeries=official.value.originalSeries;
    state.areas=official.value.areas;state.lastSuccessfulFetchAt=clock().toISOString();
      }else{
    const e=official.reason,code=String(e?.cause?.code||e?.code||''),stage=e?.stage||(/CERT|TLS|SSL/.test(code)?'tls':'network');
    errors.push(`Eurostat ${stage} 오류${code?' ('+code+')':''} · 기존 검증 생산량과 자료 갱신일 유지`);
   }
   if(jrc.status==='fulfilled'){
    const packet=jrc.value;state.jrc={latestReportDate:packet.latestReportDate,latestReportUrl:packet.latestReportUrl,checkedAt:packet.checkedAt,message:packet.message,documents:packet.documents};
    // Never derive new numbers using stale area carried through an API failure.
    if(official.status==='fulfilled')for(const p of deriveRegionalPotatoProduction(state.areas,packet.forecasts)){
     const old=map.get(p.region+':'+p.year);if(!old||old.status==='Derived Estimate'&&p.publishedAt>=old.publishedAt)map.set(p.region+':'+p.year,p);
    }
   }else errors.push('JRC 조회·추출 실패 · 검증되지 않은 생산량 추정 제외');
   state.points=[...map.values()].filter(p=>validRegionalPoint(p,clock())).sort((a,b)=>a.year-b.year||a.region.localeCompare(b.region));
   state.lastCheckedAt=clock().toISOString();state.lastError=errors.length?errors.join(' / '):undefined;
   if(filename)try{fs.mkdirSync(path.dirname(filename),{recursive:true});const temp=filename+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,filename);}catch{state.lastError=(state.lastError||'')+' · 그래프 저장 실패';}
   expires=+clock()+30*60000;return structuredClone(state);
  })().finally(()=>{pending=null;});return pending;
 };
 /** Explicit, offline reconciliation; preserve all historical values and source dates. */
 const reconcileSaved=async()=>{
  read();
  const packet=await (options.jrc||(()=>readRetainedPotatoChartYields(process.cwd(),clock())))();
  const areas=state.areas.filter(a=>a.sourceUrl===regionalPage&&a.crop==='R1000'&&Number.isFinite(Date.parse(a.verifiedAt))&&Date.parse(a.verifiedAt)<=+clock()&&Number.isFinite(Date.parse(a.publishedAt))&&Date.parse(a.publishedAt)<=+clock()&&!/[cuxz]/i.test(a.flags));
  const map=new Map(state.points.map(p=>[p.region+':'+p.year,p]));
  for(const p of deriveRegionalPotatoProduction(areas,packet.forecasts).filter(p=>validRegionalPoint(p,clock()))){
   const key=p.region+':'+p.year,old=map.get(key);
   if(!old||old.status==='Derived Estimate'&&p.publishedAt>=old.publishedAt)map.set(key,p);
  }
  state.points=[...map.values()].sort((a,b)=>a.year-b.year||a.region.localeCompare(b.region));
  const {forecasts,...provenance}=packet;state.jrc=provenance;state.lastCheckedAt=clock().toISOString();
  if(filename){const temp=filename+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,filename);}
  return structuredClone(state);
 };
 return {refresh,reconcileSaved,saved(){read();return structuredClone(state);},get(force=false){read();return force||!state.points.length||+clock()>=expires?refresh():Promise.resolve(structuredClone(state));}};
}
const regionalHistory=createRegionalPotatoHistory();
export const refreshRegionalPotatoProduction=()=>regionalHistory.refresh();
export const getRegionalPotatoProduction=(force=false)=>regionalHistory.get(force);

export const readSavedRegionalPotatoProduction=()=>regionalHistory.saved();
