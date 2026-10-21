/** Extract publisher-printed USD/MT settlements from the latest USW Weekly Price Report PDF.
 * Text parsing is deliberately strict: if rows/dates/contracts cannot be proven to match,
 * do not mistake FOB prices or secondary-month $/bu quotations for front-month settlements.
 */
export type ExactWheatFutures = {
  reportDate: string;
  contractMonth: string;
  srwMt: number; hrwMt: number; hrsMt: number;
  srwBu: number; hrwBu: number; hrsBu: number;
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const FUTURES_CODES: Record<string,string> = { March:'H', May:'K', July:'N', September:'U', December:'Z' };
const round2 = (x:number) => Math.round(x * 100) / 100;
const VALID_PUBLISHER = /^https:\/\/(?:www\.)?uswheat\.org\//i;

export function usWheatPdfCandidates(reportDate: string, html: string = '', archiveUrls: string[] = []): string[] {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(Date.parse(reportDate + 'T00:00:00Z'))) return [];
  const [yyyy,mm,dd] = reportDate.split('-');
  const stem = `PR-${yyyy.slice(-2)}${mm}${dd}`;
  const discovered = [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map(m => m[1]);
  const urls = [...archiveUrls,...discovered].map(u => {try{return new URL(u, 'https://uswheat.org/').href;}catch{return ''}})
    .filter(u => VALID_PUBLISHER.test(u) && new RegExp(`\\/${stem}(?:-\\d+)?\\.pdf(?:\\?|$)`, 'i').test(u));
  urls.push(`https://uswheat.org/wp-content/uploads/${yyyy}/${mm}/${stem}.pdf`);
  urls.push(`https://uswheat.org/wp-content/uploads/${yyyy}/${mm}/${stem}-1.pdf`);
  urls.push(`https://uswheat.org/wp-content/uploads/${yyyy}/${mm}/${stem}-2.pdf`);
  return [...new Set(urls)];
}

export function parseUsWheatFuturesPdf(text: string, reportDate: string, contractMonth: string): ExactWheatFutures | null {
  const expectedDate = /^20\d{2}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : '';
  if (!expectedDate || !MONTHS.includes(contractMonth)) return null;
  const [year, month, day] = expectedDate.split('-').map(Number);
  const monthName = MONTHS[month - 1];
  const publishedDate = new RegExp(`Weekly\\s+Price\\s+Report\\s+${monthName}\\s+0?${day},?\\s+${year}`, 'i');
  if (!publishedDate.test(text)) return null;
  const marketCode = FUTURES_CODES[contractMonth];
  // The publisher includes $/MT only for the front futures month. Refuse a different contract.
  if (!marketCode || !new RegExp(`\\b${contractMonth.slice(0,3)}\\s*\\(${marketCode}${String(year).slice(-2)}\\)`, 'i').test(text)) return null;
  const start = text.search(/Futures\s+Exchange\s+Settlements/i);
  if (start < 0) return null;
  const segment = text.slice(start, start + 9000).split(/\bLegend\s*:/i)[0];
  // The first two numeric columns are the publisher's front-month $/MT and $/bu.
  const read = (rx: RegExp): {mt:number;bu:number}|null => {
    const match = segment.match(rx);
    if (!match) return null;
    const mt = Number(match[1]); const bu = Number(match[2]);
    if (!Number.isFinite(mt) || !Number.isFinite(bu) || mt < 80 || mt > 1300 || bu < 2 || bu > 25 ||
        Math.abs(round2(bu * 36.7437) - mt) > 0.15) return null;
    return {mt,bu};
  };
  const srw = read(/Chicago\s+BOT\s+SRW\s+W\s+(\d{2,4}\.\d{2})\s+(\d{1,2}\.\d{4})/i);
  const hrw = read(/Kansas\s+City\s+BOT\s+HRW\s+K\s+(\d{2,4}\.\d{2})\s+(\d{1,2}\.\d{4})/i);
  const hrs = read(/Minneapolis\s+(?:MIAX|MGEX)\s+(?:NS\/DNS|HRS)\s+M\s+(\d{2,4}\.\d{2})\s+(\d{1,2}\.\d{4})/i);
  if (!srw || !hrw || !hrs) return null;
  return { reportDate:expectedDate, contractMonth, srwMt:srw.mt,hrwMt:hrw.mt,hrsMt:hrs.mt,
    srwBu:srw.bu,hrwBu:hrw.bu,hrsBu:hrs.bu };
}
