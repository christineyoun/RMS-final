import fs from 'fs';
import path from 'path';

const TAPIOCA_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_tapioca.json');

export interface TtsaRawPricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // FOB Bangkok USD/MT (strictly from Column 3)
  domesticThb?: number; // THB/kg (strictly from Column 2)
  isSynthetic?: boolean;
}

export class TapiocaScraper {
  /**
   * Parses 100% of table rows from the raw HTML of Thai Tapioca Starch Association (TTSA).
   * Extracts Column 3 ("Export Price USD/MT FOB Bangkok") directly without truncation.
   * Enforces outlier purge (420 <= USD <= 1000) and divisibility assertions (% 5 === 0).
   */
  public static parseHtml(html: string): TtsaRawPricePoint[] {
    const prices: TtsaRawPricePoint[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;

    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[1];
      const cellMatches = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
        .map(m => m[1].replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim());

      // Column 1: Date, Column 2: Domestic Baht/Kg, Column 3: Export USD/MT
      if (cellMatches.length >= 3) {
        const dateStr = cellMatches[0];
        let formattedDate = '';
        const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-\s]+([A-Za-z]+|\d{1,2})[\/\-\s]+(201\d|202\d|203\d)/);
        
        if (ddmmyyyy) {
          const day = ddmmyyyy[1].padStart(2, '0');
          const monthRaw = ddmmyyyy[2].toLowerCase();
          const month = monthNames[monthRaw.slice(0, 3)] || monthRaw.padStart(2, '0');
          const year = ddmmyyyy[3];
          formattedDate = `${year}-${month}-${day}`;
        } else {
          const yyyymmdd = dateStr.match(/(201\d|202\d|203\d)[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          if (yyyymmdd) {
            formattedDate = `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
          }
        }

        if (formattedDate) {
          let domesticThb: number | undefined;
          let usdPrice: number | undefined;

          // Column 2: THB/kg
          const rawDomestic = parseFloat(cellMatches[1].replace(/[^0-9.]/g, ''));
          if (!isNaN(rawDomestic) && rawDomestic > 0 && rawDomestic < 100) {
            domesticThb = rawDomestic;
          }

          // Column 3: FOB Bangkok USD/MT with Outlier Purge (420-1000 USD/MT) & Divisibility assertions
          const rawUsd = parseFloat(cellMatches[2].replace(/[^0-9.]/g, ''));
          if (!isNaN(rawUsd) && rawUsd >= 420 && rawUsd <= 1000 && rawUsd % 5 === 0) {
            usdPrice = rawUsd;
          }

          if (usdPrice !== undefined) {
            prices.push({
              date: formattedDate,
              price: usdPrice,
              ...(domesticThb !== undefined ? { domesticThb } : {})
            });
          }
        }
      }
    }

    return prices;
  }

  /**
   * Generates every Tuesday date in YYYY-MM-DD format from startDateStr to endDateStr.
   */
  public static generateTuesdayDates(startDateStr: string, endDateStr: string): string[] {
    const dates: string[] = [];
    const current = new Date(startDateStr);

    // Fast-forward to the first Tuesday on or after startDate
    while (current.getUTCDay() !== 2) {
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const end = new Date(endDateStr);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setUTCDate(current.getUTCDate() + 7);
    }

    return dates;
  }

  /**
   * Automated Weekly Tuesday Calendar Assertor:
   * Asserts that every single Tuesday date from 2021-01-05 through today exists in the series.
   * Performs strict forward-fill using the preceding Tuesday's valid $5 benchmark price for any missing week.
   */
  public static assertWeeklyTuesdayCalendar(rawPrices: TtsaRawPricePoint[], startDateStr = '2021-01-05', endDateStr?: string): TtsaRawPricePoint[] {
    if (rawPrices.length === 0) return [];

    const sortedRaw = [...rawPrices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const rawMap = new Map<string, TtsaRawPricePoint>();
    sortedRaw.forEach(p => {
      const existing = rawMap.get(p.date);
      if (!existing) {
        rawMap.set(p.date, p);
      } else if (existing.isSynthetic && !p.isSynthetic) {
        // Authenticated/non-synthetic benchmark entry takes precedence over synthetic placeholders
        rawMap.set(p.date, p);
      } else if (!existing.isSynthetic && !p.isSynthetic) {
        rawMap.set(p.date, p);
      }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const maxScrapedDate = sortedRaw[sortedRaw.length - 1].date;
    const targetEnd = endDateStr || (maxScrapedDate > todayStr ? maxScrapedDate : todayStr);

    const tuesdays = this.generateTuesdayDates(startDateStr, targetEnd);
    const asserted: TtsaRawPricePoint[] = [];

    let lastValidPoint: TtsaRawPricePoint = sortedRaw[0];

    for (const tuesdayDate of tuesdays) {
      if (rawMap.has(tuesdayDate)) {
        const rawPt = rawMap.get(tuesdayDate)!;
        lastValidPoint = rawPt;
        asserted.push(rawPt);
      } else {
        // Missing Tuesday: forward-fill with preceding Tuesday's valid benchmark price
        asserted.push({
          date: tuesdayDate,
          price: lastValidPoint.price,
          domesticThb: lastValidPoint.domesticThb,
          isSynthetic: true
        });
      }
    }

    return asserted;
  }

  /**
   * Universal Forward-Fill Logic for Skipped / Missing Weeks.
   */
  public static forwardFillWeeklyPrices(prices: TtsaRawPricePoint[]): TtsaRawPricePoint[] {
    return this.assertWeeklyTuesdayCalendar(prices);
  }

  /**
   * Refreshes and cleans the local JSON cache with raw scraped prices and forward filled rows.
   */
  public static async scrapeAllAndCache(): Promise<void> {
    const currentYear = new Date().getFullYear();
    const startYear = 2017;
    const allPrices: TtsaRawPricePoint[] = [];

    // Read existing cache as base fallback
    try {
      if (fs.existsSync(TAPIOCA_CACHE_FILE)) {
        const cachedRaw = fs.readFileSync(TAPIOCA_CACHE_FILE, 'utf-8');
        const json = JSON.parse(cachedRaw);
        if (json && Array.isArray(json.weeklyPrices)) {
          allPrices.push(...json.weeklyPrices);
        }
      }
    } catch (e) {
      console.warn('[TapiocaScraper] Warning reading existing cache:', e);
    }

    // Live scrapers for full page archives
    for (let year = startYear; year <= currentYear; year++) {
      try {
        const url = `https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price/${year}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000)
        });

        if (res.ok) {
          const html = await res.text();
          const parsed = this.parseHtml(html);
          if (parsed.length > 0) {
            allPrices.push(...parsed);
          }
        }
      } catch (err) {
        console.warn(`[TapiocaScraper] Scrape failed for year ${year}, using cached copy:`, (err as Error).message);
      }
    }

    if (allPrices.length > 0) {
      // 1. Outlier Purge (420 <= USD <= 1000) & Divisibility Assertions (% 5 === 0)
      const validPoints = allPrices.filter(p => {
        return p.price >= 420 && p.price <= 1000 && p.price % 5 === 0;
      });

      // 2. Automated Weekly Tuesday Calendar Assertor (2021-01-05 through today)
      const assertedSeries = this.assertWeeklyTuesdayCalendar(validPoints, '2021-01-05');

      // 3. Chronological Master Sort of final array
      assertedSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const payload = {
        updatedAt: new Date().toISOString(),
        source: "Thai Tapioca Starch Association (TTSA) Weekly Statistics",
        sourceUrl: "https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price",
        weeklyPrices: assertedSeries
      };

      fs.writeFileSync(TAPIOCA_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
      console.log(`[TapiocaScraper] Clean ledger successfully written with ${assertedSeries.length} asserted weekly rows.`);
    }
  }
}
