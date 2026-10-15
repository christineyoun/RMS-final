/**
 * Supplemental OFFICIAL evidence for Soybean Oil market commentary.
 * No company-claimed FOB/tanker rates and no historical snapshot is described as live.
 *
 * EIA monthly table is sourced from https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=M&n=PET&s=M_EPOOBDSO_YIFBP_NUS_MMLB
 * The 2026-07 snapshot was cross-checked against the EIA publication released 2026-09-30.
 * If the EIA page changes format or HTTPS fails, the clearly dated snapshot can be used
 * as HISTORICAL context only. It is never represented as an updated live number.
 */
export const EIA_SOYBEAN_OIL_BIOFUEL_URL =
  'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=M&n=PET&s=M_EPOOBDSO_YIFBP_NUS_MMLB';
export const USDA_NASS_FATS_OILS_URL =
  'https://esmis.nal.usda.gov/publication/fats-and-oils-oilseed-crushings-production-consumption-and-stocks';
export const USDA_FAS_PSD_URL = 'https://apps.fas.usda.gov/opendatawebv2/';
export const USDA_AMS_GTR_URL = 'https://www.ams.usda.gov/services/transportation-analysis/gtr';

export interface EiaBiofuelObservation {
  period: string;                    // YYYY-MM reporting period, NOT publication date
  soybeanOilMillionLb: number;
  previousYearMillionLb: number | null;
  yoyPercent: number | null;
  releaseDate: string;               // publication date reported on source page
  sourceUrl: string;
  retrieval: 'eia-official-web' | 'dated-official-snapshot';
}
export interface SoybeanOilOfficialEvidence {
  eia: EiaBiofuelObservation | null;
  nass: { publicationDate: string; sourceUrl: string; status: 'publication-confirmed; figures-not-ingested' };
  fobAndFreight: { status: 'not-verified'; note: string };
}

// Source-checked against the official EIA monthly table (release 2026-09-30).
// 2025 Jul = 1,108 million lb; 2026 Jul = 1,687 million lb.
export const EIA_DATED_SNAPSHOT: Readonly<EiaBiofuelObservation> = Object.freeze({
  period: '2026-07',
  soybeanOilMillionLb: 1687,
  previousYearMillionLb: 1108,
  yoyPercent: Number(((1687 / 1108 - 1) * 100).toFixed(1)),
  releaseDate: '2026-09-30',
  sourceUrl: EIA_SOYBEAN_OIL_BIOFUEL_URL,
  retrieval: 'dated-official-snapshot'
});

const monthToIndex = (m: string) => Number(m) - 1;
const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const isValidDate = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(`${x}T00:00:00Z`));
const numeric = (text: string): number | null => {
  const t = text.replace(/,/g, '').trim();
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : null;
};

/** Parse the EIA *monthly* year-by-month table, refusing unrelated / malformed pages. */
export function parseEiaBiofuelPage(html: string, checkedOn = new Date()): EiaBiofuelObservation | null {
  if (!/Total Soybean Oil Inputs to Biofuels Production/i.test(html)) return null;
  const releaseMatch = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .match(/Release Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!releaseMatch) return null;
  const releaseDate = `${releaseMatch[3]}-${releaseMatch[1].padStart(2, '0')}-${releaseMatch[2].padStart(2, '0')}`;
  if (!isValidDate(releaseDate) || Date.parse(`${releaseDate}T00:00:00Z`) > checkedOn.getTime() + 86400000) return null;

  // EIA's table has <tr> rows labelled by year, followed by Jan..Dec numeric cells.
  const rows = new Map<number, Array<number | null>>();
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim());
    const yearText = cells[0]?.replace(/\s+/g, '');
    if (!/^20\d{2}$/.test(yearText || '') || cells.length < 13) continue;
    rows.set(Number(yearText), cells.slice(1, 13).map(numeric));
  }
  if (!rows.size) return null;
  const available = [...rows.entries()].flatMap(([year, values]) => values
    .map((v, month) => (v !== null ? { year, month, value: v } : null))
    .filter((v): v is {year:number;month:number;value:number} => v !== null && v.value > 0))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  const latest = available[0];
  if (!latest) return null;
  const period = `${latest.year}-${String(latest.month + 1).padStart(2, '0')}`;
  if (Date.parse(`${period}-01T00:00:00Z`) > checkedOn.getTime()) return null;
  const prior = rows.get(latest.year - 1)?.[latest.month] ?? null;
  return {
    period,
    soybeanOilMillionLb: latest.value,
    previousYearMillionLb: prior && prior > 0 ? prior : null,
    yoyPercent: prior && prior > 0 ? Number(((latest.value / prior - 1) * 100).toFixed(1)) : null,
    releaseDate,
    sourceUrl: EIA_SOYBEAN_OIL_BIOFUEL_URL,
    retrieval: 'eia-official-web'
  };
}

let cached: { until: number; value: EiaBiofuelObservation | null } | undefined;

/** Live fetch with safe fallback to a dated historical observation. */
export async function fetchSoybeanOilOfficialEvidence(
  now = new Date(),
  httpFetch: typeof fetch = fetch,
  forceRefresh = false
): Promise<SoybeanOilOfficialEvidence> {
  const snapshotStillUseful = now.getTime() <= Date.parse('2026-12-01T00:00:00Z') &&
    now.getTime() >= Date.parse(EIA_DATED_SNAPSHOT.releaseDate + 'T00:00:00Z');
  let eia = snapshotStillUseful ? { ...EIA_DATED_SNAPSHOT } : null;
  if (!forceRefresh && cached && cached.until > now.getTime()) {
    eia = cached.value ?? eia;
  } else {
    try {
      const response = await httpFetch(EIA_SOYBEAN_OIL_BIOFUEL_URL, {
        headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; RMS-DataAudit/1.0)' },
        signal: AbortSignal.timeout(6500)
      });
      if (response.ok) {
        const html = await response.text();
        const parsed = parseEiaBiofuelPage(html, now);
        if (parsed && parsed.period >= (eia?.period || '0000-00')) eia = parsed;
      }
    } catch {
      // No stale-data promotion or silent fabricated data. Keep only explicitly dated snapshot.
    }
    // 6-hour cache. External failure never blocks the RMS chart or analysis.
    cached = { until: now.getTime() + 6 * 3600000, value: eia };
  }
  return {
    eia,
    nass: {
      publicationDate: '2026-10-01',
      sourceUrl: USDA_NASS_FATS_OILS_URL,
      status: 'publication-confirmed; figures-not-ingested'
    },
    fobAndFreight: {
      status: 'not-verified',
      note: '실물 대두유 FOB 오퍼 및 액체 벌크선 한국향 운임은 공식 자료로 최신 수치가 확인되지 않았습니다.'
    }
  };
}
