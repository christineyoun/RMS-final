/**
 * Shared USDA PSD world-series validator for food-procurement commodity dashboards.
 * Never accepts a mixed-commodity response, a different market year, or figures
 * assembled from separate cached series. This is deliberately independent of
 * the page's bundled 2026 WASDE baselines.
 */
import type { WasdeRecord } from '../components/WasdeTerminal';

export const USDA_WORLD_COMMODITIES: Record<string, { code: string; ko: string; isCrop: boolean }> = {
  wheat: { code: '0410000', ko: '소맥', isCrop: true },
  corn: { code: '0440000', ko: '옥수수', isCrop: true },
  soybean: { code: '2222000', ko: '대두', isCrop: true },
  'palm-oil': { code: '4243000', ko: '팜유', isCrop: true },
  sugar: { code: '0612000', ko: '원당', isCrop: false }
};
export const USDA_WORLD_IDS = Object.keys(USDA_WORLD_COMMODITIES);

type WorldRow = {
  commodityCode: string;
  countryCode: string;
  marketYear: string;
  calendarYear: string;
  month: string;
  attributeId: number;
  unitId: number;
  value: number;
};

function nullableNumber(x: unknown): number | null {
  if (x === undefined || x === null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parsePsdWorldRows(input: unknown, expectedId: string, expectedYear: number): WorldRow[] | null {
  const spec = USDA_WORLD_COMMODITIES[expectedId];
  if (!spec || !Number.isInteger(expectedYear) || expectedYear < 2010 || expectedYear > new Date().getUTCFullYear() + 2) return null;
  const payload = input as any;
  const arr: unknown[] = Array.isArray(input) ? input : Array.isArray(payload?.data) ? payload.data : [];
  if (!arr.length) return null;
  const records: WorldRow[] = [];
  for (const raw of arr) {
    const r = raw as any;
    const commodityCode = String(r?.commodityCode ?? r?.CommodityCode ?? '');
    const countryCode = String(r?.countryCode ?? r?.CountryCode ?? '');
    const marketYear = String(r?.marketYear ?? r?.MarketYear ?? '');
    const attributeId = nullableNumber(r?.attributeId ?? r?.AttributeId ?? r?.AttributeID);
    const value = nullableNumber(r?.value ?? r?.Value);
    const unitId = nullableNumber(r?.unitId ?? r?.UnitId ?? r?.UnitID);
    // Require explicit identity from USDA; never infer it from an API URL alone.
    if (commodityCode !== spec.code || countryCode !== '00' || Number(marketYear) !== expectedYear ||
        attributeId === null || value === null || unitId === null) return null;
    records.push({ commodityCode, countryCode, marketYear,
      calendarYear: String(r?.calendarYear ?? r?.CalendarYear ?? ''),
      month: String(r?.month ?? r?.Month ?? ''), attributeId, unitId, value });
  }
  // Essential quantities must be present in 1,000 metric tons (USDA unit id 8).
  // Sugar, centrifugal reports a different consumption-attribute set from grains.
  // Use the official distribution identity rather than invent a value for ID 125:
  // domestic use = total distribution (178) - exports (88) - ending stocks (176).
  const essentials = expectedId === 'sugar' ? [28, 176, 88, 86, 178] : [28, 125, 176, 88];
  const seen = new Map<number, number>();
  for (const row of records) {
    if (!essentials.includes(row.attributeId)) continue;
    if (row.unitId !== 8) return null;
    if (seen.has(row.attributeId) && seen.get(row.attributeId) !== row.value) return null;
    seen.set(row.attributeId, row.value);
  }
  if (essentials.some(id => !seen.has(id)) || seen.get(28)! <= 0) return null;
  if (expectedId === 'sugar') {
    const supply = seen.get(86)!;
    const distribution = seen.get(178)!;
    const use = distribution - seen.get(88)! - seen.get(176)!;
    // Supply and distribution must agree. Do not accept mismatched world tables.
    if (supply <= 0 || distribution <= 0 || use <= 0 ||
        Math.abs(supply - distribution) > Math.max(1, supply * 0.001)) return null;
  } else if (seen.get(125)! <= 0) return null;
  return records;
}

// Validated world records only: for Sugar, domestic use is the residual of
// USDA's complete distribution balance, not the absent grain field 125.
export function getWorldDomesticUseKMT(rows: Array<{ attributeId: number; value: number }>, id: string): number {
  const map = new Map(rows.map(row => [row.attributeId, row.value]));
  return id === 'sugar'
    ? map.get(178)! - map.get(88)! - map.get(176)!
    : map.get(125)!;
}

export function normalizeVerifiedOtherCommodityWasde(
  rawPayload: any, dataStatus: unknown, verifiedAt: string, commodityId: string
): WasdeRecord | null {
  if (dataStatus !== 'live-verified' && dataStatus !== 'last-verified') return null;
  const year = Number(rawPayload?.marketYear);
  const rows = parsePsdWorldRows(rawPayload?.rawRecords, commodityId, year);
  const spec = USDA_WORLD_COMMODITIES[commodityId];
  if (!rows || !spec) return null;
  const values = new Map(rows.map(r => [r.attributeId, r]));
  const n = (id: number) => values.get(id)?.value ?? 0;
  const mmt = (x: number) => Math.round(x / 100) / 10;
  const productionKMT = n(28), consumptionKMT = getWorldDomesticUseKMT(rows, commodityId), endingStocksKMT = n(176), exportsKMT = n(88);
  const areaKHA = spec.isCrop && values.get(4)?.unitId === 4 ? n(4) : 0;
  const yieldMTHA = spec.isCrop && values.get(184)?.unitId === 26 && n(184) > 0 ? n(184) : 0;
  const marketYear = String(year), label = `${year}/${String(year + 1).slice(-2)}`;
  return {
    commodity: commodityId, marketYear,
    productionKMT, productionMMT: mmt(productionKMT),
    consumptionKMT, consumptionMMT: mmt(consumptionKMT),
    endingStocksMMT: mmt(endingStocksKMT),
    stocksToUseRatio: Math.round(1000 * endingStocksKMT / consumptionKMT) / 10,
    exportsKMT, exportsMMT: mmt(exportsKMT),
    areaHarvestedKHA: areaKHA, areaHarvestedMHA: mmt(areaKHA),
    yieldMTHA, yieldKGHA: Math.round(yieldMTHA * 1000),
    lastUpdated: verifiedAt,
    source: 'USDA FAS PSD Online',
    executiveBrief: `USDA FAS PSD ${label} 글로벌 ${spec.ko}: 생산 ${mmt(productionKMT).toFixed(1)} MMT, 소비 ${mmt(consumptionKMT).toFixed(1)} MMT, 기말재고 ${mmt(endingStocksKMT).toFixed(1)} MMT, 수출 ${mmt(exportsKMT).toFixed(1)} MMT. 실제 공급처 오퍼·실제 공급사 견적 및 한국향 운송조건는 별도 확인이 필요합니다.`
  };
}
