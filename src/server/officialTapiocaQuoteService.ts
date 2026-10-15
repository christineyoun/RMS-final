/**
 * RMS Step 17: official Thai Tapioca Starch Association (TTSA) weekly FOB quote.
 * No invented prices, no synthetic carry-forward, no dates later than today.
 */
export const TTSA_WEEKLY_URL = 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price';

export type OfficialTapiocaQuote = {
  date: string;
  usdPerMt: number;
  previousDate: string | null;
  previousUsdPerMt: number | null;
  wowPct: number | null;
};
export type OfficialTapiocaResponse = {
  success: boolean;
  dataStatus: 'live-verified' | 'last-verified' | 'unavailable';
  checkedAt: string;
  verifiedAt: string | null;
  source: string;
  sourceUrl: string;
  quote: OfficialTapiocaQuote | null;
  message?: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};
const strip = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim();

function parsedDate(text: string): string | null {
  const date = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (!date) return null;
  const month = MONTHS[date[2].toLowerCase().slice(0, 3)];
  if (!month) return null;
  const day = Number(date[1]);
  const year = Number(date[3]);
  const millis = Date.UTC(year, month - 1, day);
  if (new Date(millis).getUTCDate() !== day || new Date(millis).getUTCMonth() !== month - 1) return null;
  return new Date(millis).toISOString().slice(0, 10);
}

/** Parse the official TTSA column labels: date, domestic THB/kg, export USD/MT. */
export function parseOfficialTtsaHtml(html: string, now: Date = new Date()): OfficialTapiocaQuote | null {
  const observed = new Map<string, number>();
  const today = now.toISOString().slice(0, 10);
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x => strip(x[1]));
    if (cells.length < 3) continue;
    const date = parsedDate(cells[0]);
    if (!date || date > today) continue;
    const usd = Number(cells[2].replace(/,/g, '').replace(/\s*(?:USD|US\$|\$).*$/i, '').trim());
    if (!Number.isFinite(usd) || usd < 250 || usd > 2000) continue;
    // Reject conflicting duplicate rows rather than trusting arbitrary scraped table order.
    if (observed.has(date) && observed.get(date) !== usd) return null;
    observed.set(date, usd);
  }
  const dates = [...observed.keys()].sort().reverse();
  if (!dates.length) return null;
  const current = dates[0];
  const previous = dates[1] || null;
  const price = observed.get(current)!;
  const prevPrice = previous ? observed.get(previous)! : null;
  const percent = prevPrice ? Number((((price - prevPrice) / prevPrice) * 100).toFixed(2)) : null;
  return { date: current, usdPerMt: price, previousDate: previous, previousUsdPerMt: prevPrice, wowPct: percent };
}

let lastSuccess: { quote: OfficialTapiocaQuote; verifiedAt: string } | null = null;
let cacheUntil = 0;

export async function fetchOfficialTapiocaQuote(force = false): Promise<OfficialTapiocaResponse> {
  const checkedAt = new Date().toISOString();
  const base = { source: 'Thai Tapioca Starch Association (TTSA)', sourceUrl: TTSA_WEEKLY_URL, checkedAt };
  if (!force && lastSuccess && Date.now() < cacheUntil) {
    return { ...base, success: true, dataStatus: 'last-verified', verifiedAt: lastSuccess.verifiedAt, quote: lastSuccess.quote,
      message: 'Recently verified official quote returned from short-term cache.' };
  }
  try {
    const year = new Date().getUTCFullYear();
    const url = `${TTSA_WEEKLY_URL}/${year}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 RMS-Procurement/1.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`TTSA HTTP ${response.status}`);
    const html = await response.text();
    const quote = parseOfficialTtsaHtml(html);
    if (!quote) throw new Error('No valid dated official TTSA quote found in the expected table');
    lastSuccess = { quote, verifiedAt: checkedAt };
    cacheUntil = Date.now() + 5 * 60 * 1000;
    return { ...base, success: true, dataStatus: 'live-verified', verifiedAt: checkedAt, quote };
  } catch (error) {
    if (lastSuccess) {
      return { ...base, success: true, dataStatus: 'last-verified', verifiedAt: lastSuccess.verifiedAt,
        quote: lastSuccess.quote, message: `Official quote check unavailable: ${String((error as Error)?.message || error)}` };
    }
    return { ...base, success: false, dataStatus: 'unavailable', verifiedAt: null, quote: null,
      message: `Official quote not verified: ${String((error as Error)?.message || error)}` };
  }
}
