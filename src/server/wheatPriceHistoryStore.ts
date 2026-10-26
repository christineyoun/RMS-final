/** Durable, provenance-aware U.S. Wheat Associates weekly price history.
 * Imported baseline points are explicitly marked legacy until independently verified.
 * This file has no Gemini dependency and never performs network requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { rawDefaultWheatSeries } from '../data/wheatHistory.ts';
import type { UsWheatHistoryDataPoint, UsWheatClassMetric } from '../types.ts';

export const WHEAT_PRICE_SOURCE = 'https://uswheat.org/market-information/price-report/';
export const BUSHELS_PER_METRIC_TON = 36.7437;
const HISTORY_VERSION = 1;
const RETAIN_DAYS = 366 * 5;
const historyPath = () => path.join(process.cwd(), '.rms-price-history', 'wheat.json');

export type WheatStoredPoint = {
  date: string;
  srwMt: number;
  hrwMt: number;
  hrsMt: number;
  contractMonth: string;
  provenance: 'imported-baseline' | 'source-verified';
  sourceUrl?: string;
  receiptPath?:string;receiptSha256?:string;
};
export type WheatHistoryStore = {
  version: number;
  points: WheatStoredPoint[];
  lastCheckedAt?: string;
  lastVerifiedAt?: string;
  lastError?: string;
};
export type WheatIncomingReport = {
  date: string; srwBu: number; hrwBu: number; hrsBu: number;
  // Optional exact USD/MT settlements printed in the official USW report PDF.
  // When provided, all three must be provided and match the quoted USD/bu values.
  srwMt?: number; hrwMt?: number; hrsMt?: number;
  contractMonth: string; sourceUrl: string;
  receiptPath?:string;receiptSha256?:string;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
export const toMetricTon = (usdPerBu: number) => round2(usdPerBu * BUSHELS_PER_METRIC_TON);
/** Parse the publisher's calendar date without shifting a day in KST or other time zones.
 * The old Date.parse('October 09, 2026') -> toISOString() converted KST midnight
 * to UTC October 8. A published date is a calendar date, not a timestamp.
 */
export const asIsoDate = (input: string): string | null => {
  const s = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s ? s : null;
  }
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})$/i.exec(s);
  if (!match) return null;
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month = monthNames.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
};
export const isValidPricePoint = (p: WheatStoredPoint) =>
  Boolean(asIsoDate(p.date) === p.date) && [p.srwMt, p.hrwMt, p.hrsMt].every(n => Number.isFinite(n) && n >= 80 && n <= 1300);

const seedPoints = (): WheatStoredPoint[] => rawDefaultWheatSeries
  .map(p => ({ ...p, contractMonth: 'December', provenance: 'imported-baseline' as const }))
  .filter(isValidPricePoint);

export function trimHistory(points: WheatStoredPoint[], now = new Date()): WheatStoredPoint[] {
  const cutoff = now.getTime() - RETAIN_DAYS * 86400000;
  const map = new Map<string, WheatStoredPoint>();
  for (const p of points) {
    const timestamp = Date.parse(`${p.date}T00:00:00Z`);
    if (!isValidPricePoint(p) || timestamp < cutoff || timestamp > now.getTime() + 86400000) continue;
    const existing = map.get(p.date);
    // A verified observation always takes precedence over the imported historical baseline.
    if (!existing || p.provenance === 'source-verified') map.set(p.date, p);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function loadWheatHistory(): WheatHistoryStore {
  const file = historyPath();
  if (!fs.existsSync(file)) return { version: HISTORY_VERSION, points: trimHistory(seedPoints()) };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.version !== HISTORY_VERSION || !Array.isArray(parsed.points)) throw new Error('Unsupported wheat history store format');
    return { ...parsed, points: trimHistory(parsed.points) };
  } catch (error) {
    // Fail closed: do not overwrite a corrupted file with a fresh seed.
    throw new Error(`Saved Wheat history cannot be read safely: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function saveWheatHistory(history: WheatHistoryStore): void {
  const file = historyPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  const next: WheatHistoryStore = { ...history, version: HISTORY_VERSION, points: trimHistory(history.points) };
  try {
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'w' });
    fs.renameSync(temp, file); // atomic replacement on the same filesystem
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function mergePublishedWheatReport(history: WheatHistoryStore, report: WheatIncomingReport, now = new Date()): { history: WheatHistoryStore; changed: boolean } {
  const date = asIsoDate(report.date);
  const futureLimit = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  if (!date || date > futureLimit || ![report.srwBu, report.hrwBu, report.hrsBu].every(n => Number.isFinite(n) && n >= 2 && n <= 25)) {
    throw new Error('Published wheat report has an invalid date or unrealistic price');
  }
  if (!/^https:\/\/(?:www\.)?uswheat\.org\//i.test(report.sourceUrl)) throw new Error('Unrecognized wheat report publisher URL');
  if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(report.contractMonth)) throw new Error('Unrecognized futures contract month');
  const printedMt = [report.srwMt, report.hrwMt, report.hrsMt];
  const hasPrintedMt = printedMt.some(v => v !== undefined);
  if (hasPrintedMt && (!printedMt.every(v => typeof v === 'number' && Number.isFinite(v)) ||
      printedMt.some((v, i) => Math.abs(v! - toMetricTon([report.srwBu, report.hrwBu, report.hrsBu][i])) > 0.15))) {
    throw new Error('Official PDF $/MT values missing, invalid, or inconsistent with $/bu');
  }
  const point: WheatStoredPoint = {
    date,
    srwMt: hasPrintedMt ? report.srwMt! : toMetricTon(report.srwBu),
    hrwMt: hasPrintedMt ? report.hrwMt! : toMetricTon(report.hrwBu),
    hrsMt: hasPrintedMt ? report.hrsMt! : toMetricTon(report.hrsBu),
    contractMonth: report.contractMonth,
    provenance: 'source-verified',
    sourceUrl: report.sourceUrl,...(report.receiptPath?{receiptPath:report.receiptPath,receiptSha256:report.receiptSha256}:{})
  };
  if (!isValidPricePoint(point)) throw new Error('Converted wheat prices outside acceptable bounds');
  const existing = history.points.find(p => p.date === date);
  // One-time correction for the October 9, 2026 report: on Asia/Seoul systems,
  // the previous parser stored this *same* official quote as October 8.
  // Only remove an October 8 source-verified point whose three prices and
  // contract are identical to this newly fetched October 9 report.
  // Imported historical points and any distinct October 8 quote are preserved.
  const mislabeledOct8 = date === '2026-10-09' && history.points.some(p =>
    p.date === '2026-10-08' && p.provenance === 'source-verified' &&
    p.sourceUrl === report.sourceUrl && p.contractMonth === point.contractMonth &&
    p.srwMt === point.srwMt && p.hrwMt === point.hrwMt && p.hrsMt === point.hrsMt
  );
  const changed = mislabeledOct8 || !existing || existing.provenance !== 'source-verified' ||
    ['srwMt', 'hrwMt', 'hrsMt', 'contractMonth'].some(k => String((existing as any)[k]) !== String((point as any)[k]));
  const nextPoints = history.points.filter(p => p.date !== date && !(
    mislabeledOct8 && p.date === '2026-10-08' && p.provenance === 'source-verified' &&
    p.sourceUrl === report.sourceUrl && p.contractMonth === point.contractMonth &&
    p.srwMt === point.srwMt && p.hrwMt === point.hrwMt && p.hrsMt === point.hrsMt
  ));
  nextPoints.push(point);
  return {
    changed,
    history: { ...history, points: trimHistory(nextPoints, now), lastVerifiedAt: now.toISOString(), lastError: undefined }
  };
}

const DAY = 86400000;
function findComparison(points: WheatStoredPoint[], latest: WheatStoredPoint, targetDays: number, tolerance: number): WheatStoredPoint | null {
  const latestMs = Date.parse(`${latest.date}T00:00:00Z`);
  const candidates = points.filter(p => p.date < latest.date && p.contractMonth === latest.contractMonth)
    .map(p => ({ p, offset: (latestMs - Date.parse(`${p.date}T00:00:00Z`)) / DAY }))
    .filter(({ offset }) => Math.abs(offset - targetDays) <= tolerance)
    .sort((a,b) => Math.abs(a.offset-targetDays) - Math.abs(b.offset-targetDays));
  return candidates[0]?.p || null;
}

export function buildWheatMetrics(points: WheatStoredPoint[]): { srw: UsWheatClassMetric; hrw: UsWheatClassMetric; hrs: UsWheatClassMetric } | null {
  const latest = points[points.length - 1];
  if (!latest) return null;
  const wow = findComparison(points, latest, 7, 5);
  const mom = findComparison(points, latest, 30, 10);
  const metric = (wheatClass: 'SRW' | 'HRW' | 'HRS', nameKo: string, nameEn: string, exchange: string): UsWheatClassMetric => {
    const k = `${wheatClass.toLowerCase()}Mt` as 'srwMt' | 'hrwMt' | 'hrsMt';
    const current = latest[k];
    const calc = (previous: WheatStoredPoint | null) => previous ? {
      pct: round2(((current - previous[k]) / previous[k]) * 100),
      mt: round2(current - previous[k]),
      bu: round2((current - previous[k]) / BUSHELS_PER_METRIC_TON)
    } : { pct: 0, mt: 0, bu: 0 };
    const w = calc(wow), m = calc(mom);
    return {
      wheatClass, classNameKo: nameKo, classNameEn: nameEn, exchange, contractMonth: latest.contractMonth,
      latestPriceMt: current, latestPriceBu: round2(current / BUSHELS_PER_METRIC_TON),
      wowChangeMt: w.mt, wowChangeBu: w.bu, wowChangePct: w.pct,
      momChangeMt: m.mt, momChangeBu: m.bu, momChangePct: m.pct,
      // Additional fields allow UI to hide absent period comparisons rather than displaying an invented 0%.
      wowAvailable: Boolean(wow), momAvailable: Boolean(mom), wowReferenceDate: wow?.date, momReferenceDate: mom?.date
    };
  };
  return { srw: metric('SRW','연질적색소맥','Soft Red Winter','CBOT'), hrw: metric('HRW','경질적색소맥','Hard Red Winter','KCBT'), hrs: metric('HRS','경질봄소맥','Hard Red Spring','MIAX') };
}

export function toChartPoints(points: WheatStoredPoint[]): UsWheatHistoryDataPoint[] {
  return points.map(p => ({
    date: p.date, reportDate: new Date(`${p.date}T12:00:00Z`).toLocaleDateString('en-US', { month:'long', day:'2-digit', year:'numeric', timeZone:'UTC' }),
    contractMonth: p.contractMonth,
    srwMt:p.srwMt, hrwMt:p.hrwMt, hrsMt:p.hrsMt,
    srwBu:round2(p.srwMt / BUSHELS_PER_METRIC_TON), hrwBu:round2(p.hrwMt / BUSHELS_PER_METRIC_TON), hrsBu:round2(p.hrsMt / BUSHELS_PER_METRIC_TON)
  }));
}
