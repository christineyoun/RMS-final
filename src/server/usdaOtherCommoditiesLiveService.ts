/**
 * Live authenticated USDA world PSD for Wheat, Corn, Soybean, Palm Oil & Sugar.
 * Unlike the legacy generic /api/usda route, this module NEVER treats a static
 * 2026 baseline or an unsuccessful network request as freshly verified data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { UsdaWheatWorldSummary, UsdaPsdRawRecord } from './usdaFasService.ts';
import { USDA_WORLD_COMMODITIES, parsePsdWorldRows, getWorldDomesticUseKMT } from '../lib/verifiedWorldWasde.ts';

export type PsdStatus = 'live-verified' | 'last-verified' | 'unavailable';
export interface PsdOtherResult {
  success: boolean;
  status: PsdStatus;
  data?: UsdaWheatWorldSummary;
  checkedAt: string;
  verifiedAt?: string;
  marketYear?: string;
  message?: string;
}
interface Snapshot { commodity: string; commodityCode: string; verifiedAt: string; data: UsdaWheatWorldSummary }
const BASE_URL = 'https://api.fas.usda.gov/api/psd';
const TTL_MS = 6 * 60 * 60 * 1000;
const inMemory = new Map<string, Snapshot>();
const lastAttempt = new Map<string, number>();
const pending = new Map<string, Promise<PsdOtherResult>>();

function summaryFor(input: unknown, id: string, year: number): UsdaWheatWorldSummary | null {
  const rows = parsePsdWorldRows(input, id, year);
  if (!rows) return null;
  const map = new Map<number, number>(rows.map(r => [r.attributeId, r.value]));
  const v = (key: number) => map.get(key) ?? 0;
  const prod = v(28), cons = getWorldDomesticUseKMT(rows, id), stocks = v(176), exp = v(88);
  const mmt = (kmt: number) => Math.round(kmt / 100) / 10;
  const ratio = Math.round(stocks / cons * 1000) / 10;
  const spec = USDA_WORLD_COMMODITIES[id];
  return {
    commodityCode: spec.code, marketYear: String(year), releaseMonth: rows.find(r => r.month)?.month || '',
    source: 'USDA FAS PSD Online', production1000MT: prod, productionMMT: mmt(prod),
    domesticConsumption1000MT: cons, domesticConsumptionMMT: mmt(cons),
    endingStocks1000MT: stocks, endingStocksMMT: mmt(stocks),
    beginningStocks1000MT: v(20), beginningStocksMMT: mmt(v(20)),
    imports1000MT: v(57), exports1000MT: exp, exportsMMT: mmt(exp),
    totalSupply1000MT: v(86) || (prod + v(57) + v(20)),
    stocksToUseRatio: ratio, stocksToUseRatioPct: ratio,
    areaHarvested1000HA: rows.find(r => r.attributeId === 4 && r.unitId === 4)?.value,
    yieldMTHA: rows.find(r => r.attributeId === 184)?.value,
    rawRecordsCount: rows.length, rawRecords: rows as UsdaPsdRawRecord[]
  };
}
function cacheFile(id: string) {
  return path.join(process.cwd(), 'src', 'data', `usda_world_last_verified_${id}.json`);
}
async function lastGood(id: string): Promise<Snapshot | null> {
  if (inMemory.has(id)) return inMemory.get(id)!;
  try {
    const saved = JSON.parse(await fs.readFile(cacheFile(id), 'utf8')) as Snapshot;
    const year = Number(saved?.data?.marketYear);
    if (saved?.commodity === id && saved?.commodityCode === USDA_WORLD_COMMODITIES[id].code &&
        saved?.verifiedAt && Number.isFinite(Date.parse(saved.verifiedAt)) &&
        Date.parse(saved.verifiedAt) <= Date.now() + 60_000 &&
        summaryFor(saved?.data?.rawRecords, id, year)) {
      inMemory.set(id, saved);
      return saved;
    }
  } catch { /* No genuine authenticated snapshot yet. */ }
  return null;
}
function useLastGood(snapshot: Snapshot | null, checkedAt: string, reason: string): PsdOtherResult {
  if (!snapshot) return { success: false, status: 'unavailable', checkedAt, message: reason };
  return { success: true, status: 'last-verified', checkedAt,
    verifiedAt: snapshot.verifiedAt, marketYear: snapshot.data.marketYear, data: snapshot.data, message: reason };
}
async function refresh(id: string, force: boolean): Promise<PsdOtherResult> {
  const checkedAt = new Date().toISOString();
  const previous = await lastGood(id);
  if (!force && previous && Date.now() - (lastAttempt.get(id) ?? 0) < TTL_MS) {
    return useLastGood(previous, checkedAt, 'Previously authenticated USDA data');
  }
  const key = (process.env.USDA_FAS_API_KEY || process.env.USDA_API_KEY || '').trim();
  if (!key) return useLastGood(previous, checkedAt, 'USDA_FAS_API_KEY not configured');
  const currentYear = new Date().getUTCFullYear();
  let failure = 'USDA did not return a complete world dataset';
  for (const year of [currentYear + 1, currentYear, currentYear - 1]) {
    try {
      const response = await fetch(`${BASE_URL}/commodity/${USDA_WORLD_COMMODITIES[id].code}/world/year/${year}`, {
        headers: { Accept: 'application/json', API_KEY: key, 'x-api-key': key },
        signal: AbortSignal.timeout(12000), cache: 'no-store'
      });
      if (response.status === 401 || response.status === 403) { failure = `USDA authorization HTTP ${response.status}`; break; }
      if (response.status === 429) { failure = 'USDA rate limit HTTP 429'; break; }
      if (response.status === 204 || response.status === 404) continue;
      if (!response.ok) { failure = `USDA HTTP ${response.status}`; continue; }
      const data = summaryFor(await response.json(), id, year);
      if (!data) continue;
      const snapshot: Snapshot = { commodity: id, commodityCode: USDA_WORLD_COMMODITIES[id].code,
        verifiedAt: checkedAt, data };
      inMemory.set(id, snapshot);
      lastAttempt.set(id, Date.now());
      try {
        await fs.mkdir(path.dirname(cacheFile(id)), { recursive: true });
        await fs.writeFile(cacheFile(id), JSON.stringify(snapshot, null, 2));
      } catch (e) { console.warn(`[USDA ${id}] Unable to write cache`, e); }
      return { success: true, status: 'live-verified', checkedAt, verifiedAt: checkedAt,
        marketYear: data.marketYear, data };
    } catch (e) { failure = e instanceof Error ? e.message : String(e); }
  }
  lastAttempt.set(id, Date.now());
  return useLastGood(previous, checkedAt, failure);
}
export async function fetchOtherCommodityWorldPsd(id: string, force = false): Promise<PsdOtherResult> {
  if (!USDA_WORLD_COMMODITIES[id]) return { success: false, status: 'unavailable', checkedAt: new Date().toISOString(), message: 'Unsupported commodity' };
  const existing = pending.get(id);
  if (existing) return existing;
  const request = refresh(id, force).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}
export const _verifyOtherWorldPsd = summaryFor;
