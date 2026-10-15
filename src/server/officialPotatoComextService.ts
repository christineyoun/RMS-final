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
