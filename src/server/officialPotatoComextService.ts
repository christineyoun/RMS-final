import fs from 'node:fs';
import path from 'node:path';
/**
 * RMS Step 20 — Official Eurostat Comext potato starch trade (CN 11081300).
 * EU27 vs NON-EU partners only: movements between EU states are excluded.
 * Monthly quantity expressed in 100 kg units; 10 units = 1 metric tonne.
 * Uses the latest common contiguous 12-month period with complete import/export
 * observations. NEVER substitute the old RMS 1.42 / 0.98 MMT placeholders.
 * Data source: https://ec.europa.eu/eurostat/api/comext/dissemination
 * Dataset: DS-045409 (detailed trade), EU27_2020, EXT_EU27_2020.
 */

export const POTATO_COMEXT_PAGE = 'https://ec.europa.eu/eurostat/databrowser/view/DS-045409/default/table?lang=en';
const COMEXT_API = 'https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409';
const CN = '11081300';
const REPORTER = 'EU27_2020';
const PARTNER = 'EXT_EU27_2020';
const INDICATOR = 'QUANTITY_IN_100KG';
const CACHE_MS = 30 * 60_000;

type JsonStat = {
  id?: string[];
  size?: number[];
  dimension?: Record<string, {category?: {index?: Record<string, number> | string[], label?: Record<string, string>}}>;
  value?: Record<string, number | null> | (number | null)[];
  status?: Record<string, string> | string[];
};

type MonthObservation = {value: number; status: string};

export interface PotatoComextData {
  productCode: string;
  dataset: string;
  reporter: string;
  partner: string;
  periodStart: string;
  periodEnd: string;
  monthsCount: number;
  imports1000MT: number;
  exports1000MT: number;
  provisional: boolean;
  scope: string;
}
export interface PotatoComextResponse {
  success: boolean;
  dataStatus: 'live-verified' | 'last-verified' | 'unavailable';
  checkedAt: string;
  verifiedAt: string | null;
  source: string;
  sourceUrl: string;
  data: PotatoComextData | null;
  message?: string;
}
function codes(json: JsonStat, dimension: string): string[] {
  const ix = json.dimension?.[dimension]?.category?.index;
  if (Array.isArray(ix)) return ix.map(String);
  if (!ix || typeof ix !== 'object') return [];
  return Object.entries(ix).sort((a,b) => Number(a[1]) - Number(b[1])).map(([v]) => v);
}
function lookup(json: JsonStat, fixed: Record<string,string>, period: string): MonthObservation | null {
  if (!json.id || !json.size || !json.value || json.id.length !== json.size.length) return null;
  let index = 0;
  for (let i = 0; i < json.id.length; i++) {
    const dimension = json.id[i];
    const arr = codes(json, dimension);
    if (arr.length !== json.size[i]) return null;
    const expected = dimension === 'time' ? period : fixed[dimension];
    // Fail closed on unknown dimensions with >1 coordinate (no accidental sum).
    if (expected === undefined && arr.length !== 1) return null;
    const position = expected === undefined ? 0 : arr.indexOf(expected);
    if (position < 0) return null;
    index = index * arr.length + position;
  }
  const value = (json.value as any)[index];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100_000_000) return null;
  const status = String((json.status as any)?.[index] ?? '');
  // Suppressed / confidential / flagged unusable figures cannot count as complete.
  if (/[cuxz]/i.test(status)) return null;
  return {value, status};
}
function monthSerial(s: string): number {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s)) return NaN;
  const [year, month] = s.split('-').map(Number);
  return year * 12 + month - 1;
}
function serialMonth(n: number): string {
  return `${Math.floor(n/12)}-${String(n % 12 + 1).padStart(2,'0')}`;
}
/** Pure strict parser: avoids partial periods, unit mismatch, intra-EU double counting. */
export function parsePotatoComext(importJson: JsonStat, exportJson: JsonStat, now = new Date()): PotatoComextData | null {
  const configs = [{doc: importJson, flow:'1'}, {doc: exportJson, flow:'2'}];
  const fixedBase = {freq:'M', reporter:REPORTER, partner:PARTNER, product:CN, indicators:INDICATOR};
  const maps: Map<number,MonthObservation>[] = [];
  for (const {doc,flow} of configs) {
    if (!doc?.id?.includes('time') || !doc?.id?.includes('flow') ||
        !doc?.id?.includes('indicators') || !doc?.id?.includes('product') ||
        !doc?.id?.includes('reporter') || !doc?.id?.includes('partner') || !doc?.id?.includes('freq')) return null;
    if (!codes(doc,'reporter').includes(REPORTER) || !codes(doc,'partner').includes(PARTNER) ||
        !codes(doc,'product').includes(CN) || !codes(doc,'indicators').includes(INDICATOR) ||
        !codes(doc,'flow').includes(flow) || !codes(doc,'freq').includes('M')) return null;
    const times = codes(doc,'time');
    if (!times.length || times.length > 100) return null;
    const monthly = new Map<number,MonthObservation>();
    for(const period of times) {
      const n = monthSerial(period);
      if (!Number.isFinite(n) || monthly.has(n)) return null;
      const point = lookup(doc,{...fixedBase,flow},period);
      if(point) monthly.set(n,point);
    }
    maps.push(monthly);
  }
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const shared = [...maps[0].keys()].filter(n => maps[1].has(n) && n < currentMonth).sort((a,b)=>b-a);
  for(const end of shared) {
    if (currentMonth - end > 18) break;
    const begin = end - 11;
    let importsUnits = 0, exportsUnits = 0;
    let provisional = false;
    let complete = true;
    for(let n=begin;n<=end;n++) {
      const x=maps[0].get(n), y=maps[1].get(n);
      if(!x || !y) {complete=false;break;}
      importsUnits += x.value;
      exportsUnits += y.value;
      provisional ||= /[pe]/i.test(x.status+y.status);
    }
    if (!complete || importsUnits < 0 || exportsUnits <= 0) continue;
    // 1 unit of 100kg = 0.1 MT = 0.0001 kMT.
    // Round only final display values (never sum rounded months).
    return {
      productCode:CN, dataset:'DS-045409', reporter:REPORTER, partner:PARTNER,
      periodStart:serialMonth(begin), periodEnd:serialMonth(end), monthsCount:12,
      imports1000MT:Number((importsUnits / 10_000).toFixed(2)),
      exports1000MT:Number((exportsUnits / 10_000).toFixed(2)),
      provisional,
      scope:'EU27 aggregate, extra-EU trade only; excludes intra-EU flows; CN 11081300 (potato starch)'
    };
  }
  return null;
}
let lastVerified: {data:PotatoComextData; verifiedAt:string} | null = null;
let expiresAt = 0;

export async function fetchOfficialPotatoComext(force=false):Promise<PotatoComextResponse> {
  const checkedAt = new Date().toISOString();
  const base = {checkedAt, source:'Eurostat Comext — EU27 extra-EU potato starch CN 11081300',sourceUrl:POTATO_COMEXT_PAGE};
  if (!force && lastVerified && Date.now()<expiresAt) return {...base,success:true,dataStatus:'last-verified',verifiedAt:lastVerified.verifiedAt,data:lastVerified.data};
  try {
    const params = {format:'JSON', freq:'M',reporter:REPORTER,partner:PARTNER,product:CN,indicators:INDICATOR,
      sinceTimePeriod:`${new Date().getUTCFullYear()-3}-01`};
    const fetchFlow = async (flow: string):Promise<JsonStat> => {
      const query = new URLSearchParams({...params,flow});
      const response = await fetch(`${COMEXT_API}?${query}`,{
        headers:{Accept:'application/json','User-Agent':'RMS-Procurement/1.0'},
        signal:AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`Comext flow ${flow}: HTTP ${response.status}`);
      const json:JsonStat=await response.json();
      if (!json?.id || !json?.dimension) throw new Error(`Comext flow ${flow}: incomplete JSON-stat`);
      return json;
    };
    const [imports,exports]=await Promise.all([fetchFlow('1'),fetchFlow('2')]);
    const data=parsePotatoComext(imports,exports);
    if(!data) throw new Error('No complete common 12-month EU27 extra-EU trade series with verified quantities');
    lastVerified={data,verifiedAt:checkedAt};expiresAt=Date.now()+CACHE_MS;
    return {...base,success:true,dataStatus:'live-verified',verifiedAt:checkedAt,data};
  } catch(e) {
    const message=String((e as Error)?.message || e);
    if(lastVerified) return {...base,success:true,dataStatus:'last-verified',verifiedAt:lastVerified.verifiedAt,
      data:lastVerified.data,message:`Eurostat refresh unavailable: ${message}`};
    return {...base,success:false,dataStatus:'unavailable',verifiedAt:null,data:null,message};
  }
}

// Korea-bound monthly unit value is isolated from the existing extra-EU trade totals.
export interface PotatoExportUnitValue {
  productCode: '11081300'; reporter: 'EU27_2020'; partner: 'KR'; flow: '2';
  period: string; valueEur: number; netWeightMT: number; eurPerMT: number;
  provisional: boolean;
}
export interface PotatoExportQuoteResponse {
  success: boolean; dataStatus: 'live-verified' | 'last-verified' | 'unavailable';
  checkedAt: string; verifiedAt: string | null; refreshFailed: boolean; lastError?: string;
  source: string; sourceUrl: string; data: PotatoExportUnitValue | null;
  changes?: PotatoExportChanges;
}
/** Official monthly export statistical value / net mass, never a physical offer. */
export function parsePotatoExportSeries(json: JsonStat, now = new Date()): PotatoExportUnitValue[] {
  const fixed = {freq:'M', reporter:REPORTER, partner:'KR', product:CN, flow:'2'};
  const expected = [...Object.keys(fixed), 'indicators', 'time'];
  if (!json?.id || json.id.length !== expected.length || new Set(json.id).size !== expected.length ||
      !expected.every(d => json.id!.includes(d))) return [];
  for (const [dimension, code] of Object.entries(fixed)) {
    const values = codes(json, dimension);
    if (values.length !== 1 || values[0] !== code) return [];
  }
  const indicators = codes(json, 'indicators');
  if (indicators.length !== 2 || !['VALUE_IN_EUROS', INDICATOR].every(i => indicators.includes(i))) return [];
  const months = codes(json, 'time');
  if (!months.length || months.length > 100 || months.some(m => !Number.isFinite(monthSerial(m)))) return [];
  const current = now.getUTCFullYear()*12 + now.getUTCMonth();
  const series:PotatoExportUnitValue[]=[];
  for (const period of [...months].sort().reverse()) {
    if (monthSerial(period) >= current) continue;
    const value = lookup(json, {...fixed, indicators:'VALUE_IN_EUROS'}, period);
    const mass = lookup(json, {...fixed, indicators:INDICATOR}, period);
    if (!value || !mass || value.value <= 0 || mass.value <= 0) continue;
    const netWeightMT = mass.value / 10; // QUANTITY_IN_100KG is net mass: 100 kg = 0.1 MT.
    const eurPerMT = value.value / netWeightMT;
    if (!Number.isFinite(eurPerMT) || eurPerMT <= 0) continue;
    series.push({productCode:CN, reporter:REPORTER, partner:'KR', flow:'2', period,
      valueEur:value.value, netWeightMT, eurPerMT, provisional:/[pe]/i.test(value.status+mass.status)});
  }
  return series;
}
export function parsePotatoExportUnitValue(json:JsonStat,now=new Date()):PotatoExportUnitValue|null {
  return parsePotatoExportSeries(json,now)[0]||null;
}
export type PotatoExportChange={currentPeriod:string|null;referencePeriod:string|null;referenceEurPerMT:number|null;pct:number|null;amountEurPerMT:number|null;provisional:boolean};
export type PotatoExportChanges={mom:PotatoExportChange;yoy:PotatoExportChange};
/** Exact calendar months only: never substitute the closest available observation. */
export function calculatePotatoExportChanges(current:PotatoExportUnitValue|null,series:PotatoExportUnitValue[],now=new Date()):PotatoExportChanges {
  current=validExportObservation(current,now)?current:null;
  const change=(offset:number):PotatoExportChange=>{
    const referencePeriod=current?serialMonth(monthSerial(current.period)-offset):null;
    const ref=series.find(p=>p.period===referencePeriod&&validExportObservation(p,now)&&
      p.productCode===current?.productCode&&p.reporter===current?.reporter&&p.partner===current?.partner&&p.flow===current?.flow);
    const amount=current&&ref?current.eurPerMT-ref.eurPerMT:null;
    return {currentPeriod:current?.period||null,referencePeriod,referenceEurPerMT:ref?.eurPerMT??null,
      pct:amount!==null&&ref?amount/ref.eurPerMT*100:null,amountEurPerMT:amount,provisional:!!(current?.provisional||ref?.provisional)};
  };
  return {mom:change(1),yoy:change(12)};
}
type ExportQuoteReceipt = {data:PotatoExportUnitValue; verifiedAt:string; series?:PotatoExportUnitValue[]; comparisonPeriod?:string};
export interface PotatoExportQuoteStore {read:()=>unknown; write:(receipt:ExportQuoteReceipt)=>void}
function validExportObservation(d:any,now:Date):d is PotatoExportUnitValue {
  return !!d && d.productCode===CN && d.reporter===REPORTER && d.partner==='KR' && d.flow==='2' &&
    Number.isFinite(monthSerial(d.period)) && monthSerial(d.period)<now.getUTCFullYear()*12+now.getUTCMonth() &&
    Number.isFinite(d.valueEur) && d.valueEur>0 && Number.isFinite(d.netWeightMT) && d.netWeightMT>0 &&
    Number.isFinite(d.eurPerMT) && Math.abs(d.eurPerMT-d.valueEur/d.netWeightMT)<1e-8 &&
    typeof d.provisional==='boolean';
}
function validExportReceipt(raw:any,now:Date):raw is ExportQuoteReceipt {
  return validExportObservation(raw?.data,now) && Number.isFinite(Date.parse(raw.verifiedAt)) && Date.parse(raw.verifiedAt)<=+now;
}
/** Same 30-minute revalidation policy as Comext trade; injected storage keeps tests isolated. */
export function createPotatoExportQuoteService(options:{fetcher?:typeof fetch; store?:PotatoExportQuoteStore; now?:()=>Date}={}) {
  let retained:ExportQuoteReceipt|null=null, expires=0, pending:Promise<PotatoExportQuoteResponse>|null=null;
  const clock=options.now||(()=>new Date());
  const comparisonView=(receipt:ExportQuoteReceipt|null)=>{
    const changes=calculatePotatoExportChanges(receipt?.data||null,Array.isArray(receipt?.series)?receipt.series:[],clock());
    if(receipt?.comparisonPeriod&&receipt.comparisonPeriod>receipt.data.period){
      for(const [key,offset] of [['mom',1],['yoy',12]] as const)changes[key]={currentPeriod:receipt.comparisonPeriod,referencePeriod:serialMonth(monthSerial(receipt.comparisonPeriod)-offset),referenceEurPerMT:null,pct:null,amountEurPerMT:null,provisional:false};
    }
    return changes;
  };
  const response=(receipt:ExportQuoteReceipt|null,status:PotatoExportQuoteResponse['dataStatus'],failed=false,lastError?:string):PotatoExportQuoteResponse=>({
    success:!!receipt, dataStatus:status, checkedAt:clock().toISOString(), verifiedAt:receipt?.verifiedAt||null,
    refreshFailed:failed, ...(lastError?{lastError}:{}), source:'Eurostat Comext · EU27 → 한국 · CN 11081300 · 월별 평균 수출단가',
    sourceUrl:POTATO_COMEXT_PAGE, data:receipt?.data||null,
    changes:comparisonView(receipt)
  });
  const readSaved=()=>{
    try {const saved=options.store?.read();if(validExportReceipt(saved,clock()))retained=saved;}catch{/* Saved-only reads never collect or write. */}
    return response(retained,retained?'last-verified':'unavailable');
  };
  return {saved:readSaved,get(force=false):Promise<PotatoExportQuoteResponse> {
    if(pending)return pending;
    if(!retained)try{const saved=options.store?.read();if(validExportReceipt(saved,clock()))retained=saved;}catch{/* Unusable cache never supplies a quote. */}
    if(!force&&retained&&+clock()<expires)return Promise.resolve(response(retained,'last-verified'));
    pending=(async()=>{
      let issue='Eurostat 감자전분 기준시세 조회 실패';
      try {
        const query=new URLSearchParams({format:'JSON',freq:'M',reporter:REPORTER,partner:'KR',product:CN,flow:'2',
          sinceTimePeriod:`${clock().getUTCFullYear()-3}-01`});
        query.append('indicators','VALUE_IN_EUROS');query.append('indicators',INDICATOR);
        const res=await (options.fetcher||fetch)(`${COMEXT_API}?${query}`,{
          headers:{Accept:'application/json','User-Agent':'RMS-Procurement/1.0'},signal:AbortSignal.timeout(15000)});
        if(!res.ok){issue='Eurostat 감자전분 기준시세 HTTP '+res.status;throw Error(issue);}
        const raw:JsonStat=await res.json();
        const series=parsePotatoExportSeries(raw,clock());
        const data=series[0];
        if(!data){issue='한국향 수출금액·순중량의 완전한 최신 월별 자료 미확보';throw Error(issue);}
        // A source regression must not replace a newer verified month.
        if(retained&&data.period<retained.data.period){issue='이전 기준월 응답으로 마지막 검증값 유지';throw Error(issue);}
        // A newer published zero/partial/confidential month cannot silently become a comparison against an older month.
        const comparisonPeriod=codes(raw,'time').filter(period=>monthSerial(period)<clock().getUTCFullYear()*12+clock().getUTCMonth()&&
          ['VALUE_IN_EUROS',INDICATOR].some(indicators=>lookup({...raw,status:undefined},{freq:'M',reporter:REPORTER,partner:'KR',product:CN,flow:'2',indicators},period)!==null)).sort().at(-1);
        retained={data,series,comparisonPeriod,verifiedAt:clock().toISOString()};expires=+clock()+CACHE_MS;
        try{options.store?.write(retained);}catch{return response(retained,'live-verified',false,'검증값 영속 저장 실패 · 메모리 값 유지');}
        return response(retained,'live-verified');
      }catch{
        return response(retained,retained?'last-verified':'unavailable',true,issue);
      }
    })().finally(()=>{pending=null;});
    return pending;
  }};
}

const exportQuoteFile=()=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history','potato-export-unit-value.json');
const potatoExportQuoteService=createPotatoExportQuoteService({store:{
  read:()=>JSON.parse(fs.readFileSync(exportQuoteFile(),'utf8')),
  write:receipt=>{
    const file=exportQuoteFile(),temp=file+'.'+process.pid+'.tmp';
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(temp,JSON.stringify(receipt,null,2));fs.renameSync(temp,file);
  }
}});
export const fetchOfficialPotatoExportQuote=(force=false)=>potatoExportQuoteService.get(force);

/** Normal dashboard/PDF reads only consume the verified saved publication. */
export const readSavedPotatoExportQuote=()=>potatoExportQuoteService.saved();
