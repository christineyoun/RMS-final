/**
 * RMS Step 18 — official Eurostat harvested POTATO statistics, not potato starch.
 * Source: apro_cpnh1 (national humidity), with apro_cpsh1 fallback if appropriate.
 * Crop R1000 = potatoes including seed potatoes; geographical coverage DE FR NL DK.
 * Fail closed on missing, incomplete, future-year, mislabeled, or mixed-year values.
 */
export const POTATO_EUROSTAT_PAGE = 'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en';
const EUROSTAT_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
const COUNTRIES = ['DE', 'FR', 'NL', 'DK'] as const;

type OfficialRow = { country: string; production1000MT: number; area1000HA: number; yieldMTHA: number; productionStatus?: string; areaStatus?: string };
export type OfficialPotatoEurostatRecord = {
  harvestYear: string;
  dataset: string;
  production1000MT: number;
  productionMMT: number;
  area1000HA: number;
  weightedYieldMTHA: number;
  coverage: string[];
  countries: OfficialRow[];
  isEstimateOrProvisional: boolean;
};
export type OfficialPotatoEurostatResponse = {
  success: boolean;
  dataStatus: 'live-verified' | 'last-verified' | 'unavailable';
  checkedAt: string;
  verifiedAt: string | null;
  source: string;
  sourceUrl: string;
  scope: string;
  data: OfficialPotatoEurostatRecord | null;
  message?: string;
  history?: OfficialPotatoEurostatRecord[];
};

type JsonStat = {
  id?: string[];
  size?: number[];
  dimension?: Record<string, { category?: { index?: Record<string, number> | string[]; label?: Record<string, string> } }>;
  value?: Record<string, number | null> | Array<number | null>;
  status?: Record<string, string> | string[];
  updated?: string;
};

function dimensionCodes(data: JsonStat, name: string): string[] {
  const index = data.dimension?.[name]?.category?.index;
  if (Array.isArray(index)) return index;
  if (!index || typeof index !== 'object') return [];
  return Object.entries(index).sort((a, b) => Number(a[1]) - Number(b[1])).map(([key]) => key);
}

function structureKey(codes: string[], labels: Record<string, string> | undefined, kind: 'production' | 'area'): string | null {
  // Eurostat changed code families after the 2025 SAIO transition. Resolve the
  // measure with BOTH its code and official label, rather than guessing by slot.
  const options = codes.filter(code => {
    const label = (labels?.[code] || '').toLowerCase();
    if (kind === 'production') return /^(PR|PR_THS_T|PR_\w+)$/.test(code) ||
      (/harvested production/.test(label) && /1\s?000|thousand/.test(label));
    return /^(AR|AR_THS_HA|HA|AR_\w+)$/.test(code) ||
      (/area/.test(label) && /1\s?000|thousand/.test(label) && /hectares|ha\b/.test(label));
  });
  if (!options.length) return null;
  return (kind === 'production'
    ? ['PR_THS_T','PR','PR_HU_NAT','PR_HU_EU']
    : ['AR_THS_HA','AR','HA'])
    .find(key => options.includes(key)) || options[0];
}

function coordinateValue(data: JsonStat, values: Record<string, string>): {value: number; status: string} | null {
  const dims = data.id || [];
  const sizes = data.size || [];
  if (!dims.length || dims.length !== sizes.length || !data.value) return null;
  let flat = 0;
  for (let i = 0; i < dims.length; i++) {
    const codes = dimensionCodes(data, dims[i]);
    if (codes.length !== sizes[i]) return null;
    const requested = values[dims[i]];
    if (requested === undefined && sizes[i] !== 1) return null;
    const offset = requested === undefined ? 0 : codes.indexOf(requested);
    if (offset < 0) return null;
    flat = flat * sizes[i] + offset;
  }
  const raw = (data.value as any)[flat];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const status = data.status ? String((data.status as any)[flat] || '') : '';
  return { value: raw, status };
}

export function parseEurostatPotatoHistory(json: JsonStat, dataset: string, now: Date = new Date()): OfficialPotatoEurostatRecord[] {
  const history:OfficialPotatoEurostatRecord[]=[];
  if (!json || !json.dimension || !json.id || !json.value) return [];
  const cropCodes = dimensionCodes(json, 'crops');
  const availableGeos = dimensionCodes(json, 'geo');
  if (!cropCodes.includes('R1000') || !COUNTRIES.every(c => availableGeos.includes(c))) return [];
  const measureCodes = dimensionCodes(json, 'strucpro');
  const labels = json.dimension.strucpro?.category?.label;
  const prodCode = structureKey(measureCodes, labels, 'production');
  const areaCode = structureKey(measureCodes, labels, 'area');
  if (!prodCode || !areaCode || prodCode === areaCode) return [];
  const years = dimensionCodes(json, 'time').filter(x => /^20\d{2}$/.test(x) && Number(x) <= now.getUTCFullYear())
    .sort((a,b) => Number(b) - Number(a));
  for (const year of years) {
    if (now.getUTCFullYear() - Number(year) > 5) continue;
    const countryRows: OfficialRow[] = [];
    for (const country of COUNTRIES) {
      const common = { freq: 'A', crops: 'R1000', geo: country, time: year };
      const production = coordinateValue(json, { ...common, strucpro: prodCode });
      const area = coordinateValue(json, { ...common, strucpro: areaCode });
      if (!production || !area || production.value <= 0 || area.value <= 0) break;
      const yieldMTHA = production.value / area.value; // k tonnes / k hectares = tonnes/hectare
      if (production.value > 100_000 || area.value > 10_000 || yieldMTHA < 5 || yieldMTHA > 100) break;
      countryRows.push({ country, production1000MT: production.value, area1000HA: area.value,
        yieldMTHA: Number(yieldMTHA.toFixed(3)), productionStatus: production.status, areaStatus: area.status });
    }
    if (countryRows.length !== COUNTRIES.length) continue; // never mix years or omit a country
    const production1000MT = countryRows.reduce((sum, x) => sum + x.production1000MT, 0);
    const area1000HA = countryRows.reduce((sum, x) => sum + x.area1000HA, 0);
    const weightedYieldMTHA = production1000MT / area1000HA;
    history.push({ harvestYear: year, dataset, production1000MT: Number(production1000MT.toFixed(2)),
      productionMMT: Number((production1000MT / 1000).toFixed(2)),
      area1000HA: Number(area1000HA.toFixed(2)), weightedYieldMTHA: Number(weightedYieldMTHA.toFixed(2)),
      coverage: [...COUNTRIES], countries: countryRows,
      isEstimateOrProvisional: countryRows.some(x => /[pe]/i.test((x.productionStatus || '') + (x.areaStatus || ''))) });
  }
  return history.sort((a,b)=>a.harvestYear.localeCompare(b.harvestYear));
}
export function parseEurostatPotatoes(json: JsonStat,dataset:string,now:Date=new Date()):OfficialPotatoEurostatRecord|null {return parseEurostatPotatoHistory(json,dataset,now).at(-1)||null;}


let verified: {data: OfficialPotatoEurostatRecord; verifiedAt: string} | null = null;
let cacheExpiresAt = 0;
let verifiedHistory:OfficialPotatoEurostatRecord[]=[];

export async function fetchOfficialPotatoEurostat(force = false): Promise<OfficialPotatoEurostatResponse> {
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, source: 'Eurostat — harvested potatoes, four-country total',
    sourceUrl: POTATO_EUROSTAT_PAGE, scope: 'DE, FR, NL, DK · all potatoes including seed; NOT starch-potato-only or starch production' };
  if (!force && verified && Date.now() < cacheExpiresAt) return {
    ...base, success: true, dataStatus: 'last-verified', verifiedAt: verified.verifiedAt, data: verified.data, history:verifiedHistory,
    message: 'Last successfully verified Eurostat data returned from short-term cache.' };
  const issues: string[] = [];
  for (const dataset of ['apro_cpnh1', 'apro_cpsh1']) {
    try {
      const params = new URLSearchParams({ lang: 'EN', freq: 'A', crops: 'R1000', sinceTimePeriod: String(new Date().getUTCFullYear()-5) });
      COUNTRIES.forEach(country => params.append('geo', country));
      const response = await fetch(`${EUROSTAT_API}${dataset}?${params.toString()}`, {
        headers: {Accept: 'application/json', 'User-Agent': 'RMS-Procurement/1.0'},
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) { issues.push(`${dataset}: HTTP ${response.status}`); continue; }
      const raw = await response.json();
      const history = parseEurostatPotatoHistory(raw, dataset);
      const data = history.at(-1);
      if (!data) { issues.push(`${dataset}: incomplete or incompatible 4-country dataset`); continue; }
      verified = { data, verifiedAt: checkedAt };verifiedHistory=history;
      cacheExpiresAt = Date.now() + 30 * 60 * 1000;
      return {...base, success: true, dataStatus: 'live-verified', verifiedAt: checkedAt, data, history};
    } catch (e) { issues.push(`${dataset}: ${String((e as Error)?.message || e)}`); }
  }
  if (verified) return { ...base, success: true, dataStatus: 'last-verified', verifiedAt: verified.verifiedAt,
    data: verified.data, message: `Could not recheck Eurostat: ${issues.join('; ')}` };
  return { ...base, success: false, dataStatus: 'unavailable', verifiedAt: null,
    data: null, message: `No complete verified Eurostat 4-country potato series. ${issues.join('; ')}` };
}
