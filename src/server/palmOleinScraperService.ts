import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'src/data/cache_palmoil.json');
const INVESTING_OLEIN_URL = 'https://www.investing.com/commodities/rbd-palm-olein-historical-data';

export async function syncAndRollPalmOleinData(): Promise<{ updated: boolean; latestDate?: string; latestPrice?: number }> {
  try {
    const res = await fetch(INVESTING_OLEIN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.investing.com/commodities/rbd-palm-olein'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const html = await res.text();
      // Parse the top/latest row from the historical table
      const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([A-Za-z]{3}\s+\d{2},\s+\d{4})<\/td>[\s\S]*?<td[^>]*>([\d,]+\.?\d*)<\/td>/gi;
      const match = rowRegex.exec(html);

      if (match) {
        const rawDate = match[1];
        const rawPrice = match[2].replace(/,/g, '');
        const price = parseFloat(rawPrice);

        if (!isNaN(price) && price > 500) {
          const parsedDate = new Date(rawDate);
          if (!isNaN(parsedDate.getTime())) {
            const isoDate = parsedDate.toISOString().split('T')[0];
            const result = executeRollingLedgerUpdate({ date: isoDate, oleinUsdPerMt: price });
            return { updated: result, latestDate: isoDate, latestPrice: price };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SyncEngine] Live Olein scrape check skipped, serving cached ledger:', err);
  }
  return { updated: false };
}

function executeRollingLedgerUpdate(latestPoint: { date: string; oleinUsdPerMt: number }): boolean {
  if (!fs.existsSync(CACHE_FILE)) return false;

  const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  let series = cacheData.historicalSeries || [];

  // Append or update target date
  const targetIdx = series.findIndex((s: any) => s.date === latestPoint.date);
  if (targetIdx >= 0) {
    series[targetIdx].oleinUsdPerMt = latestPoint.oleinUsdPerMt;
    series[targetIdx].oleinUsd = latestPoint.oleinUsdPerMt;
  } else {
    series.push({
      date: latestPoint.date,
      centsPerBushel: Math.round(latestPoint.oleinUsdPerMt * 4.0845),
      usdPerMT: latestPoint.oleinUsdPerMt,
      cpoUsd: latestPoint.oleinUsdPerMt,
      oleinUsd: latestPoint.oleinUsdPerMt,
      oleinUsdPerMt: latestPoint.oleinUsdPerMt
    });
  }

  // Sort series chronologically
  series.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

  cacheData.oleinUsd = latestPoint.oleinUsdPerMt;
  cacheData.updatedAt = new Date().toISOString();
  cacheData.historicalSeries = series;

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
  return true;
}

export async function scrapeInvestingOleinHistory(): Promise<boolean> {
  const result = await syncAndRollPalmOleinData();
  return result.updated;
}
