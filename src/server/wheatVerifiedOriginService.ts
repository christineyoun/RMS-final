/**
 * Wheat Origin Radar: trustworthy, non-Gemini, country-level USDA FAS PSD data.
 * Does not use fabricated numeric fallbacks, page-view Gemini calls, or assert that
 * an annual/marketing-year forecast is live port/weather intelligence.
 *
 * FAS official API: https://apps.fas.usda.gov/opendatawebv2/
 * A FAS API key is required: USDA_FAS_API_KEY (or USDA_API_KEY) in server .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OriginItemDetail, OriginRadarResponse } from './originRadarService.ts';

const PSD_BASE = 'https://api.fas.usda.gov/api/psd';
const OFFICIAL_SOURCE_URL = 'https://fas.usda.gov/psdonline';
const CACHE_DIR = process.env.RMS_ORIGIN_CACHE_DIR || path.join(process.cwd(), '.rms-origin-verified');
const CACHE_FILE = path.join(CACHE_DIR, 'wheat.json');
const WHEAT_CODE = '0410000';
const MIN_YEAR = 2020;

type OriginKey = OriginItemDetail['originKey'];
type OfficialRow = Record<string, unknown>;
type Provenance = { key: OriginKey; countryCode: string; reportMonth: string; productionMMT: number | null; exportsMMT: number | null; stocksMMT: number | null; year: number };

type SavedPayload = { version: 1; marketYear: number; attemptedDay: string; savedAt: string; verified: Record<string, OriginItemDetail> };
const SOURCE_ROWS: Array<{key: OriginKey; label:string; matches: RegExp; production:[number, number] }> = [
  {key:'usa', label:'미국 (HRW/SRW)', matches:/^(united states(?: of america)?|u\\.?s\\.?a\\.?)$/i,production:[10,100]},
  {key:'australia',label:'호주 (APW/AHW)',matches:/^australia$/i,production:[5,80]},
  {key:'canada',label:'캐나다 (CWRS)',matches:/^canada$/i,production:[5,80]},
  {key:'eu',label:'유럽연합 (EU-27)',matches:/^european union(?:[ -]?(?:27|eu[- ]?27))?$/i,production:[40,250]},
  {key:'russia',label:'러시아 (제분용)',matches:/^(russia|russian federation)$/i,production:[15,150]},
];

function field(x: OfficialRow, ...names:string[]): unknown {
  for (const name of names) if (Object.prototype.hasOwnProperty.call(x, name)) return x[name];
  return undefined;
}
function str(x: unknown):string { return x == null ? '' : String(x).trim(); }
function num(x:unknown):number|null {
  if (typeof x==='number' && Number.isFinite(x)) return x;
  if (typeof x==='string' && /^-?\d+(?:\.\d+)?$/.test(x.trim())) return Number(x.trim());
  return null;
}
function getRecords(body: unknown): OfficialRow[] {
  const possible = Array.isArray(body) ? body :
    (body && typeof body==='object' ? field(body as OfficialRow,'data','Data','items','Items') : null);
  return Array.isArray(possible) ? possible.filter((x):x is OfficialRow=>x!==null && typeof x==='object' && !Array.isArray(x)) : [];
}
function kstToday(d=new Date()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function yearForCrop(d=new Date()):number {
  const [yr,month] = kstToday(d).split('-').map(Number);
  return month>=7 ? yr : yr-1;
}
function monthKey(r:OfficialRow):string|null {
  const year=num(field(r,'calendarYear','CalendarYear'));
  const month=num(field(r,'month','Month'));
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < MIN_YEAR || year > 2100 || month < 1 || month > 12) return null;
  const key=`${year}-${String(month).padStart(2,'0')}`;
  const now=new Date();
  const latest=Number(kstToday(now).slice(0,7).replace('-',''));
  if(Number(key.replace('-',''))>latest+1) return null;
  return key;
}
function metricMMT(rows:OfficialRow[],attributeId:number, bounds:[number,number]):number|null {
  const values=rows.filter(r=>num(field(r,'attributeId','AttributeId'))===attributeId &&
    num(field(r,'unitId','UnitId'))===8)
    .map(r=>num(field(r,'value','Value')))
    .filter((x):x is number=>x!==null);
  // Never sum duplicate PSD revisions or treat an empty metric as zero.
  if(values.length!==1) return null;
  const mmt=values[0]/1000; // PSD unit #8 is 1000 metric tons.
  if(!Number.isFinite(mmt) || mmt<bounds[0] || mmt>bounds[1]) return null;
  return Math.round(mmt*100)/100;
}
function countryCodeLookup(rows:OfficialRow[]):Map<OriginKey,string> {
  const m=new Map<OriginKey,string>();
  const used=new Set<string>();
  for(const origin of SOURCE_ROWS){
    const matching=rows.filter(r=>origin.matches.test(str(field(r,'countryName','CountryName','name','Name'))));
    const codes=Array.from(new Set(matching.map(r=>str(field(r,'countryCode','CountryCode','code','Code')).toUpperCase()).filter(Boolean)));
    if(codes.length===1 && !used.has(codes[0])) { m.set(origin.key,codes[0]);used.add(codes[0]); }
  }
  return m;
}
export function parseOfficialWheatPsd(countryRows:unknown, psdRows:unknown, marketingYear:number):Provenance[] {
  const countryLookup=countryCodeLookup(getRecords(countryRows));
  const all=getRecords(psdRows);
  const result: Provenance[]=[];
  for(const spec of SOURCE_ROWS){
    const code=countryLookup.get(spec.key);
    if (!code) continue; // Do not guess country/aggregate code.
    const rows=all.filter(r=>str(field(r,'countryCode','CountryCode')).toUpperCase()===code &&
      str(field(r,'commodityCode','CommodityCode'))===WHEAT_CODE &&
      num(field(r,'marketYear','MarketYear'))===marketingYear);
    const dated=new Map<string,OfficialRow[]>();
    for(const r of rows){
      const m=monthKey(r); if (!m) continue;
      if(!dated.has(m)) dated.set(m,[]);
      dated.get(m)!.push(r);
    }
    // A single publication vintage is used for all metrics: never mix months.
    const months=Array.from(dated.keys()).sort().reverse();
    for(const m of months){
      const thisMonth=dated.get(m)!;
      const production=metricMMT(thisMonth,28,spec.production);
      const exports=metricMMT(thisMonth,88,[0,200]);
      const stocks=metricMMT(thisMonth,176,[0,200]);
      if(production===null && exports===null && stocks===null) continue;
      result.push({key:spec.key,countryCode:code,reportMonth:m,year:marketingYear,
        productionMMT:production,exportsMMT:exports,stocksMMT:stocks});
      break;
    }
  }
  return result;
}
function safeReadCache():SavedPayload|null {
  try{
    const obj=JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
    if(obj?.version!==1 || typeof obj.attemptedDay!=='string' || typeof obj.marketYear!=='number' ||
       typeof obj.verified!=='object' || obj.verified===null) return null;
    return obj as SavedPayload;
  } catch {return null;}
}
function saveCache(data:SavedPayload) {
  fs.mkdirSync(CACHE_DIR,{recursive:true,mode:0o700});
  const tmp=`${CACHE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});
  fs.renameSync(tmp,CACHE_FILE);
}
function fallbackOrigin(key:OriginKey,reason:string):OriginItemDetail {
  const origin=SOURCE_ROWS.find(v=>v.key===key)!;
  return {originKey:key,region:origin.label,production:'',productionNumericMMT:null,unit:'MMT',marketYear:'',
    exports:'',endingStocks:'',riskAssessment:'기상·운임·항만 및 통상 리스크는 별도 근거 확인 필요',
    status:'자료 없음',statusColor:'yellow',primarySource:'USDA FAS PSD',sourceName:'USDA FAS PSD',
    sourceOrg:'USDA Foreign Agricultural Service',sourceReportDate:'',sourceUrl:OFFICIAL_SOURCE_URL,
    retrievedAt:'',isLive:false,dataFreshness:'unavailable',notes:reason};
}
function fromOfficial(record:Provenance,retrievedAt:string):OriginItemDetail {
  const s=SOURCE_ROWS.find(v=>v.key===record.key)!;
  const fmt=(n:number|null)=>n===null?'':`${n.toFixed(2)}M MT`;
  return {originKey:record.key,region:s.label,production:fmt(record.productionMMT),
    productionNumericMMT:record.productionMMT,unit:'MMT',marketYear:`${record.year}/${String(record.year+1).slice(-2)}`,
    exports:record.exportsMMT===null?'':`수출 ${fmt(record.exportsMMT)}`,
    endingStocks:record.stocksMMT===null?'':`기말재고 ${fmt(record.stocksMMT)}`,
    riskAssessment:'수급 수치만 검증됨 · 기상/항만/운임 위험은 별도 확인 필요',
    status:'자료 확인',statusColor:'yellow',primarySource:'USDA FAS PSD',sourceName:'USDA FAS PSD',
    sourceOrg:'USDA Foreign Agricultural Service',sourceReportDate:record.reportMonth,sourceUrl:OFFICIAL_SOURCE_URL,
    retrievedAt,isLive:true,dataFreshness:'live',notes:'USDA PSD 공개 전망값; 실제 선적 실적이나 실시간 물류 자료가 아닙니다.'};
}
function cachedVersion(item:OriginItemDetail):OriginItemDetail {
  return {...item,isLive:false,dataFreshness:'cached',status:'자료 확인',
    notes:'마지막 공식 API 조회 성공본. 오늘 재검증 전이거나 공식 API 조회가 실패했습니다.'};
}
function response(verified:Record<string,OriginItemDetail>,reason?:string):OriginRadarResponse {
  const origins=SOURCE_ROWS.map(s=>verified[s.key] ? cachedVersion(verified[s.key]) : fallbackOrigin(s.key,reason||'공식 USDA PSD 수치 미확인'));
  return {
    success:true,statusCode:200,lastUpdated:origins.map(o=>o.retrievedAt).filter(Boolean).sort().at(-1)||'',origins,
    sourcesUsed:origins.map(o=>({origin:o.region,primarySource:o.primarySource,sourceOrg:o.sourceOrg,
      sourceReportDate:o.sourceReportDate,sourceUrl:o.sourceUrl,status:o.dataFreshness})),
    sourceFooterText:'USDA FAS PSD · 국가별 공개 전망 (당일 실시간 물류 아님)'
  };
}

export class WheatVerifiedOriginService {
  private pending:Promise<OriginRadarResponse>|null=null;
  private last:OriginRadarResponse|null=null;
  private checkedDay='';
  async getWheatOriginRadar(force=false):Promise<OriginRadarResponse> {
    if(this.pending) return this.pending;
    const today=kstToday();
    if(!force && this.last && this.checkedDay===today) return this.last;
    const task=this.run(force);
    this.pending=task;
    try{return await task;} finally {this.pending=null;}
  }
  private async run(force:boolean):Promise<OriginRadarResponse>{
    const today=kstToday();
    const year=yearForCrop();
    const existing=safeReadCache();
    const stored=existing?.marketYear===year ? existing.verified : {};
    if(!force && existing?.marketYear===year && existing.attemptedDay===today){
      this.checkedDay=today;
      this.last=response(stored,'오늘 공식 데이터 조회 결과가 없습니다.');
      return this.last;
    }
    const key=(process.env.USDA_FAS_API_KEY || process.env.USDA_API_KEY || '').trim();
    if(!key){
      // Don't substitute country-level corn baselines or pretend USDA returned Wheat data.
      this.last=response(stored,'USDA_FAS_API_KEY 미설정. USDA API 키를 추가하면 공식 원산지 수급을 조회할 수 있습니다.');
      this.checkedDay=today;
      return this.last;
    }
    const get=async(endpoint:string):Promise<unknown>=>{
      const resp=await fetch(`${PSD_BASE}${endpoint}`,{
        headers:{Accept:'application/json','API_KEY':key,'x-api-key':key},signal:AbortSignal.timeout(10000)});
      if(!resp.ok) throw new Error(`USDA PSD returned HTTP ${resp.status}`);
      return resp.json();
    };
    try{
      // Confirm national identity via USDA's published country lookup, avoiding guessed EU/RU codes.
      const [countries,records]=await Promise.all([
        get('/countries'),get(`/commodity/${WHEAT_CODE}/country/all/year/${year}`)
      ]);
      const observations=parseOfficialWheatPsd(countries,records,year);
      const verified={...stored};
      const now=new Date().toISOString();
      for(const observation of observations) verified[observation.key]=fromOfficial(observation,now);
      saveCache({version:1,marketYear:year,attemptedDay:today,savedAt:now,verified});
      const originItems=SOURCE_ROWS.map(s=>{
        const found=observations.find(r=>r.key===s.key);
        return found ? fromOfficial(found,now) :
          verified[s.key] ? cachedVersion(verified[s.key]) : fallbackOrigin(s.key,'해당 국가의 최신 수치/자료 기준월을 검증하지 못했습니다.');
      });
      this.last={success:true,statusCode:200,lastUpdated:now,origins:originItems,
        sourcesUsed:originItems.map(o=>({origin:o.region,primarySource:o.primarySource,sourceOrg:o.sourceOrg,
          sourceReportDate:o.sourceReportDate,sourceUrl:o.sourceUrl,status:o.dataFreshness})),
        sourceFooterText:'USDA FAS PSD · 국가별 공개 전망 (당일 실시간 물류 아님)'};
      this.checkedDay=today;
      return this.last;
    }catch(err:any){
      console.warn('[Wheat Origin Radar] USDA PSD unavailable:',String(err?.message||err).slice(0,120));
      // Cache failure for the day to avoid repeated calls on every page view.
      saveCache({version:1,marketYear:year,attemptedDay:today,savedAt:existing?.savedAt||'',verified:stored});
      this.last=response(stored,'USDA 공식 API 응답 실패. 이전 검증본이 있으면 해당 기준월로 표시합니다.');
      this.checkedDay=today;
      return this.last;
    }
  }
}

export const wheatVerifiedOriginService=new WheatVerifiedOriginService();
