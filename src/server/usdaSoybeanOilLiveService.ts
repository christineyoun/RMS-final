/**
 * Live USDA FAS PSD world soybean-oil feed.
 * Never promotes a bundled baseline or a failed network request to "verified".
 * An authenticated successful result is cached on disk for use during outages.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { UsdaWheatWorldSummary, UsdaPsdRawRecord } from './usdaFasService.ts';

export type SoybeanOilPsdStatus = 'live-verified' | 'last-verified' | 'unavailable';
export interface SoybeanOilPsdResult {
  success: boolean;
  status: SoybeanOilPsdStatus;
  data?: UsdaWheatWorldSummary;
  verifiedAt?: string;
  checkedAt: string;
  marketYear?: string;
  message?: string;
}
interface StoredSnapshot {
  commodityCode: '4232000';
  verifiedAt: string;
  data: UsdaWheatWorldSummary;
}
const COMMODITY = '4232000';
const BASE_URL = 'https://api.fas.usda.gov/api/psd';
const CACHE_FILE = path.join(process.cwd(), 'src', 'data', 'usda_soybean_oil_last_verified.json');
const TTL_MS = 6 * 60 * 60 * 1000;
let currentSnapshot: StoredSnapshot | null = null;
let previousCheckAt = 0;
let pending: Promise<SoybeanOilPsdResult> | null = null;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}
function parseRecord(value: any): UsdaPsdRawRecord | null {
  const attributeId = asNumber(value?.attributeId ?? value?.AttributeId ?? value?.AttributeID);
  const quantity = asNumber(value?.value ?? value?.Value);
  if (attributeId === null || quantity === null) return null;
  return {
    commodityCode: String(value?.commodityCode ?? value?.CommodityCode ?? COMMODITY),
    countryCode: String(value?.countryCode ?? value?.CountryCode ?? '00'),
    marketYear: String(value?.marketYear ?? value?.MarketYear ?? ''),
    calendarYear: String(value?.calendarYear ?? value?.CalendarYear ?? ''),
    month: String(value?.month ?? value?.Month ?? ''),
    attributeId,
    unitId: Number(value?.unitId ?? value?.UnitId ?? 8),
    value: quantity
  };
}
function summarize(payload: unknown, year: number): UsdaWheatWorldSummary | null {
  const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : [];
  const records = rows.map(parseRecord).filter((r): r is UsdaPsdRawRecord => Boolean(r));
  if (records.length === 0) return null;
  // This route must not accidentally consume soybean, palm oil or a different market year.
  if (records.some(r => r.commodityCode !== COMMODITY || (r.marketYear && Number(r.marketYear) !== year))) return null;
  const attrs = new Map<number, number>();
  for (const row of records) attrs.set(row.attributeId, row.value);
  const production = attrs.get(28);
  const consumption = attrs.get(125);
  const stocks = attrs.get(176);
  const exports = attrs.get(88);
  if (production === undefined || consumption === undefined || stocks === undefined || exports === undefined ||
      production <= 0 || consumption <= 0 || stocks < 0 || exports < 0) return null;
  const imports = attrs.get(57) ?? 0;
  const beginningStocks = attrs.get(20) ?? 0;
  const supply = attrs.get(86) ?? production + imports + beginningStocks;
  const releaseMonth = [...records].reverse().find(x => /^\d{1,2}$/.test(x.month))?.month ?? '';
  const mmt = (v: number) => Math.round(v / 100) / 10;
  const stockRatio = Math.round((stocks / consumption) * 1000) / 10;
  return {
    commodityCode: COMMODITY,
    marketYear: String(year),
    releaseMonth,
    source: 'USDA FAS PSD Online · authenticated world records',
    production1000MT: production, productionMMT: mmt(production),
    domesticConsumption1000MT: consumption, domesticConsumptionMMT: mmt(consumption),
    endingStocks1000MT: stocks, endingStocksMMT: mmt(stocks),
    beginningStocks1000MT: beginningStocks, beginningStocksMMT: mmt(beginningStocks),
    imports1000MT: imports, exports1000MT: exports, exportsMMT: mmt(exports),
    totalSupply1000MT: supply, stocksToUseRatio: stockRatio, stocksToUseRatioPct: stockRatio,
    rawRecordsCount: records.length, rawRecords: records,
    executiveBrief: `USDA FAS PSD ${year}/${String(year + 1).slice(-2)} 글로벌 대두유: 생산 ${mmt(production)} MMT, 소비 ${mmt(consumption)} MMT, 기말재고 ${mmt(stocks)} MMT, 수출 ${mmt(exports)} MMT. 실제 공급사 오퍼와 한국 도착원가는 별도 확인이 필요합니다.`
  };
}
async function lastGood(): Promise<StoredSnapshot | null> {
  if (currentSnapshot) return currentSnapshot;
  try {
    const saved = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) as StoredSnapshot;
    const valid = saved?.commodityCode === COMMODITY &&
      Boolean(saved?.verifiedAt && !Number.isNaN(Date.parse(saved.verifiedAt))) &&
      Boolean(saved.data?.rawRecords?.length && summarize(saved.data.rawRecords, Number(saved.data.marketYear)));
    if (valid) currentSnapshot = saved;
  } catch { /* No verified cache yet. This is normal on a first run. */ }
  return currentSnapshot;
}
function cachedResponse(snapshot: StoredSnapshot | null, checkedAt: string, reason: string): SoybeanOilPsdResult {
  if (!snapshot) return { success: false, status: 'unavailable', checkedAt, message: reason };
  return { success: true, status: 'last-verified', checkedAt, verifiedAt: snapshot.verifiedAt,
    marketYear: snapshot.data.marketYear, data: snapshot.data, message: reason };
}
async function refresh(force: boolean): Promise<SoybeanOilPsdResult> {
  const checkedAt = new Date().toISOString();
  const prior = await lastGood();
  if (!force && prior && Date.now() - previousCheckAt < TTL_MS) {
    return cachedResponse(prior, checkedAt, 'Previously verified USDA data (recently checked)');
  }
  const key = (process.env.USDA_FAS_API_KEY || process.env.USDA_API_KEY || '').trim();
  if (!key) return cachedResponse(prior, checkedAt, 'USDA_FAS_API_KEY is not configured on this server');
  // Probe the next marketing year, then the current one, then the preceding year.
  // Do not mistake the calendar year for the latest available USDA marketing-year series.
  const calendarYear = new Date().getUTCFullYear();
  let error = 'USDA API did not return a valid soybean-oil world series';
  for (const year of [calendarYear + 1, calendarYear, calendarYear - 1]) {
    const url = `${BASE_URL}/commodity/${COMMODITY}/world/year/${year}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', API_KEY: key, 'x-api-key': key },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store'
      });
      if (response.status === 401 || response.status === 403) {
        error = `USDA API key denied (HTTP ${response.status})`;
        break;
      }
      if (response.status === 429) { error = 'USDA API rate limit (HTTP 429)'; break; }
      if (response.status === 404 || response.status === 204) continue;
      if (!response.ok) { error = `USDA API HTTP ${response.status}`; continue; }
      const summary = summarize(await response.json(), year);
      if (!summary) continue;
      const snapshot: StoredSnapshot = { commodityCode: COMMODITY, verifiedAt: checkedAt, data: summary };
      currentSnapshot = snapshot;
      previousCheckAt = Date.now();
      try {
        await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
        await fs.writeFile(CACHE_FILE, JSON.stringify(snapshot, null, 2));
      } catch (e) { console.warn('[USDA soybean oil] Could not save last-verified cache:', e); }
      return { success: true, status: 'live-verified', data: summary, marketYear: String(year),
        verifiedAt: checkedAt, checkedAt };
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  previousCheckAt = Date.now();
  return cachedResponse(prior, checkedAt, error);
}
export async function fetchSoybeanOilWorldPsd(force = false): Promise<SoybeanOilPsdResult> {
  if (!pending) pending = refresh(force).finally(() => { pending = null; });
  return pending;
}
// Exported for offline regression tests; not called by the frontend.
export const _verifyUsdaSoybeanOilWorldRecords = summarize;
