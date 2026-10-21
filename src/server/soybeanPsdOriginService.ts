/** Country-level USDA FAS soybean PSD, only when the response contains actual
 * authenticated, commodity/country/year-specific underlying records.
 * Never promote the generic USDA service's hardcoded baseline to verified data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { usdaFasService, type UsdaPsdFetchResult, type UsdaPsdRawRecord } from './usdaFasService.ts';
import { fetchOtherCommodityWorldPsd } from './usdaOtherCommoditiesLiveService.ts';
import type { OriginItemDetail, OriginRadarResponse } from './originRadarService.ts';

type CountryCode = 'BR'|'US'|'AR'|'PA';
type Observation={country:CountryCode; marketYear:string; reportMonth:string; productionMMT:number; exportsMMT:number; endingStocksMMT:number;rawRecords?:UsdaPsdRawRecord[];verifiedAt?:string};
type State={version:1; byCountry: Partial<Record<CountryCode,Observation[]>>};
const ORIGINS=[
  {country:'BR',key:'brazil',label:'브라질 (Mato Grosso/Paraná)'},
  {country:'US',key:'usa',label:'미국 (Midwest)'},
  {country:'AR',key:'argentina',label:'아르헨티나 (Pampas)'},
  // USDA PSD uses PA for Paraguay (official /api/psd/countries), not ISO PY.
  {country:'PA',key:'paraguay',label:'파라과이 (Alto Paraná/Itapúa)'}
] as const;
const URL='https://apps.fas.usda.gov/psdonline/app/index.html';
const CACHE=path.join(process.env.RMS_ORIGIN_CACHE_DIR||path.join(process.cwd(),'.rms-origin-verified'),'soybean-country-psd-v1.json');
const isValidNumber=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const monthPattern=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const monthAge=(month:string,now=new Date())=>{
  const [y,m]=month.split('-').map(Number);
  return (now.getUTCFullYear()-y)*12+now.getUTCMonth()+1-m;
};
export function verifiedSoybeanCountryRows(res:UsdaPsdFetchResult, code:CountryCode, year:string):Observation|null {
  if(!['BR','US','AR','PA'].includes(code))return null;
  const rows=res?.data?.rawRecords;
  if(!res.success || !res.data || res.commodityCode!=='2222000' ||
     res.marketYear!==year || res.data.marketYear!==year || !Array.isArray(rows) || !rows.length) return null;
  if(rows.some((row:UsdaPsdRawRecord)=>row.commodityCode!=='2222000'||row.countryCode!==code||row.marketYear!==year))return null;
  const months=new Set(rows.map(row=>String(row.month).padStart(2,'0')));
  if(months.size!==1)return null;
  const calendarYears=new Set(rows.map(row=>String(row.calendarYear)));
  if(calendarYears.size!==1)return null;
  const reportYear=[...calendarYears][0];
  const month=reportYear+'-'+[...months][0];
  if(!monthPattern.test(month)||monthAge(month)<0||monthAge(month)>3)return null;
  const attributes=new Map<number,number>();
  for(const row of rows) {
    if([28,88,176].includes(row.attributeId)) {
      if(attributes.has(row.attributeId) || !isValidNumber(row.value)||row.unitId!==8)return null;
      attributes.set(row.attributeId,row.value);
    }
  }
  if(![28,88,176].every(a=>attributes.has(a)) || attributes.get(28)!<=0)return null;
  const n=(id:number)=>attributes.get(id)!/1000;
  return {country:code,marketYear:year,reportMonth:month,productionMMT:n(28),exportsMMT:n(88),endingStocksMMT:n(176),rawRecords:rows,...(!res.isCached&&res.statusCode===200?{verifiedAt:new Date().toISOString()}: {})};
}
function readState():State {
  try {
    const state=JSON.parse(fs.readFileSync(CACHE,'utf8'));
    if(state?.version===1&&state.byCountry&&typeof state.byCountry==='object')return state;
  }catch{/* Not yet cached. */}
  return {version:1,byCountry:{}};
}
function validateStored(o:any,c:CountryCode):o is Observation {
  if(!(o?.country===c&&/^20\d{2}$/.test(o.marketYear)&&monthPattern.test(o.reportMonth)&&
    [o.productionMMT,o.exportsMMT,o.endingStocksMMT].every(isValidNumber)&&o.productionMMT>0))return false;
  // Approved older aggregate-only records remain usable. New retained raw records
  // must agree with the exact country, crop/year, release period, unit and totals.
  if(o.rawRecords===undefined)return true;
  if(!Array.isArray(o.rawRecords)||!o.rawRecords.length||o.rawRecords.some((r:UsdaPsdRawRecord)=>
    r.commodityCode!=='2222000'||r.countryCode!==c||r.marketYear!==o.marketYear||
    String(r.calendarYear)+'-'+String(r.month).padStart(2,'0')!==o.reportMonth))return false;
  return [[28,'productionMMT'],[88,'exportsMMT'],[176,'endingStocksMMT']].every(([id,key])=>{
    const matches=o.rawRecords.filter((r:UsdaPsdRawRecord)=>r.attributeId===id);
    return matches.length===1&&matches[0].unitId===8&&isValidNumber(matches[0].value)&&matches[0].value/1000===o[key];
  });
}
function updateState(state:State,newValues:Observation[]):State {
  const byCountry={...state.byCountry};
  for(const o of newValues) {
    const previous=(byCountry[o.country]||[]).filter(v=>validateStored(v,o.country) && v.marketYear===o.marketYear);
    byCountry[o.country]=[o,...previous.filter(v=>v.reportMonth!==o.reportMonth)].sort((a,b)=>b.reportMonth.localeCompare(a.reportMonth)).slice(0,4);
  }
  return {version:1,byCountry};
}
function saveState(state:State):void {
  try{
    fs.mkdirSync(path.dirname(CACHE),{recursive:true,mode:0o700});
    const tmp=CACHE+'.'+process.pid+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,CACHE);
  }catch(e){console.warn('[Soybean PSD] unable to persist verified snapshot',String(e).slice(0,90));}
}
function show(n:number):string{return (Math.round(n*10)/10).toFixed(1)+'M MT';}
function fmtChange(current:Observation,prior?:Observation):string{
  if(!prior || !monthPattern.test(prior.reportMonth) || (Number(current.reportMonth.slice(0,4))-Number(prior.reportMonth.slice(0,4)))*12+Number(current.reportMonth.slice(5))-Number(prior.reportMonth.slice(5))!==1)return '전월 비교 자료 없음';
  const d=current.exportsMMT-prior.exportsMMT;
  return `전월 ${show(prior.exportsMMT)} · ${Math.abs(d)<0.005?'변동 없음':`${d>0?'+':'-'}${Math.abs(d).toFixed(2)}M MT`}`;
}
function makeItem(c:typeof ORIGINS[number],state:State,current?:Observation,status:'live'|'cached'|'unavailable'='unavailable'):OriginItemDetail {
  const prior=current ? (state.byCountry[c.country]||[]).find(x=>x.marketYear===current.marketYear && x.reportMonth!==current.reportMonth && x.reportMonth<current.reportMonth && validateStored(x,c.country)) : undefined;
  const actualPrevious = prior && fmtChange(current!,prior)!=='전월 비교 자료 없음' ? prior : undefined;
  const verified=!!current;
  return {originKey:c.key, region:c.label, production:verified?show(current!.productionMMT):'',
    productionNumericMMT:verified?current!.productionMMT:null, unit:'MMT',marketYear:current?.marketYear?`${current.marketYear}/${String(Number(current.marketYear)+1).slice(-2)}`:'',
    exports:verified?'수출 '+show(current!.exportsMMT):'',
    exportComparison:verified?fmtChange(current!,actualPrevious):undefined,
    exportComparisonBasis:actualPrevious?`${actualPrevious.reportMonth} → ${current!.reportMonth}`:undefined,
    endingStocks:verified?'기말재고 '+show(current!.endingStocksMMT):'',
    riskAssessment:verified?'공식 국가 수급 전망 확인. 조달 위험도는 기상 자료와 별도 평가':'검증된 국가별 USDA 수급 자료를 확인할 수 없습니다.',
    status:'자료 부족',statusColor:'gray',primarySource:'USDA FAS PSD',sourceName:'USDA FAS PSD',sourceOrg:verified?'USDA FAS':'',
    sourceReportDate:current?.reportMonth||'',sourceUrl:URL,retrievedAt:new Date().toISOString(),
    isLive:verified&&status==='live',dataFreshness:verified?status:'unavailable',
    statusBasis:verified?'공식 PSD 국가별 생산·수출·기말재고 확인. 기상 및 조달 위험 상태는 별도 판단합니다.':'공식 원자료 검증 실패. 수치를 추정하지 않습니다.'};
}
export class SoybeanPsdOriginService {
  constructor(private readonly sources={world:fetchOtherCommodityWorldPsd,country:usdaFasService.fetchCountryPsd.bind(usdaFasService)}) {}
  private cached:OriginRadarResponse|null=null;
  private checkedAt=0;
  private pending:Promise<OriginRadarResponse>|null=null;
  async getSoybeanOriginRadar(force=false):Promise<OriginRadarResponse> {
    const now=Date.now();
    if(!force&&this.cached&&now-this.checkedAt<6*3600000)return this.cached;
    if(this.pending)return this.pending;
    this.pending=this.load();
    try {return await this.pending;} finally {this.pending=null;}
  }
  private async load():Promise<OriginRadarResponse>{
    const world = await this.sources.world('soybean');
    const year=/^20\d{2}$/.test(String(world.data?.marketYear||''))
      ? String(world.data?.marketYear) : String(new Date().getUTCFullYear());
    const stored=readState();
    const responses=await Promise.all(ORIGINS.map(async c=>{
      try{const res=await this.sources.country('2222000',c.country,year);
        return {country:c.country,observation:verifiedSoybeanCountryRows(res,c.country,year),status:res.isCached?'cached' as const:'live' as const};
      }catch{return {country:c.country,observation:null,status:'unavailable' as const};}
    }));
    const fresh=responses.flatMap(r=>r.observation?[r.observation]:[]);
    const state=updateState(stored,fresh);
    if(fresh.length)saveState(state);
    const origins=ORIGINS.map(c=>{
      const found=responses.find(r=>r.country===c.country)!;
      const storedCurrent=state.byCountry[c.country]?.find(o=>validateStored(o,c.country)&&o.marketYear===year&&monthAge(o.reportMonth)>=0&&monthAge(o.reportMonth)<=2);
      const current=found.observation||storedCurrent;
      return makeItem(c,state,current,current?(found.observation?found.status:'cached'):'unavailable');
    });
    const out:OriginRadarResponse={success:true,statusCode:200,lastUpdated:new Date().toISOString(),origins,
      sourcesUsed:origins.map(o=>({origin:o.region,primarySource:o.primarySource,sourceOrg:o.sourceOrg,
        sourceReportDate:o.sourceReportDate,sourceUrl:o.sourceUrl,status:o.dataFreshness})),
      sourceFooterText:'USDA FAS PSD'};
    this.checkedAt=Date.now();this.cached=out;return out;
  }
}
export const soybeanPsdOriginService=new SoybeanPsdOriginService();
