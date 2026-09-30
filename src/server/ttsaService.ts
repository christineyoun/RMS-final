import fs from 'fs';
import path from 'path';

const TAPIOCA_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_tapioca.json');

export interface TtsaWeeklyPrice {
  date: string; // YYYY-MM-DD
  price: number; // FOB Bangkok USD/MT
  domesticThb?: number; // THB/kg
  isSynthetic?: boolean;
}

export interface TtsaSupplyBalance {
  referencePeriod: string;
  plantedArea: number; // in kRAI
  plantedAreaYoY: number; // %
  cassavaYield: number; // in Ton/Rai
  yieldYoY: number; // %
  cassavaProduction: number; // in MMT
  productionYoY: number; // %
  nativeStarchExportVolume: number; // in MMT
  nativeStarchExportYoY: number; // %
  modifiedStarchExportVolume: number; // in MMT
  modifiedStarchExportYoY: number; // %
  latestFobBangkokPrice: number; // USD/MT
  priceWoW: number; // %
  sourceDates: {
    priceDate: string;
    statisticsDate: string;
  };
}

export class TtsaService {
  private static instance: TtsaService;
  private cachedPrices: TtsaWeeklyPrice[] = [];
  private cachedSupply: TtsaSupplyBalance | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 30 * 60 * 1000; // 30 minutes

  // Official TTSA weekly FOB Bangkok Starch Price Series for 2026 (Sorted by date ascending)
  private readonly fallbackPrices: TtsaWeeklyPrice[] = [
    // 2021
    { date: '2021-01-05', price: 440, domesticThb: 11.50 }, // Absolute 5Y Low ($440 USD / ₩610,940 KRW)
    { date: '2021-06-15', price: 490, domesticThb: 12.80 },
    { date: '2021-12-21', price: 520, domesticThb: 13.50 },
    // 2022
    { date: '2022-03-15', price: 540, domesticThb: 14.00 },
    { date: '2022-09-20', price: 530, domesticThb: 13.80 },
    // 2023
    { date: '2023-01-10', price: 540, domesticThb: 14.10 },
    { date: '2023-06-20', price: 510, domesticThb: 13.20 },
    { date: '2023-11-14', price: 500, domesticThb: 13.00 },
    // 2024
    { date: '2024-02-13', price: 520, domesticThb: 13.60 },
    { date: '2024-07-16', price: 500, domesticThb: 13.00 },
    { date: '2024-12-17', price: 480, domesticThb: 12.50 },
    // 2025
    { date: '2025-03-11', price: 485, domesticThb: 12.60 },
    { date: '2025-08-19', price: 490, domesticThb: 12.80 },
    { date: '2025-12-23', price: 480, domesticThb: 12.50 },
    // 2026
    { date: '2026-01-06', price: 480, domesticThb: 14.10 },
    { date: '2026-01-13', price: 480, domesticThb: 14.20 },
    { date: '2026-01-20', price: 485, domesticThb: 14.20 },
    { date: '2026-01-27', price: 490, domesticThb: 14.25 },
    { date: '2026-02-03', price: 490, domesticThb: 14.30 },
    { date: '2026-02-10', price: 490, domesticThb: 14.40 },
    { date: '2026-02-17', price: 490, domesticThb: 14.40 },
    { date: '2026-02-24', price: 495, domesticThb: 14.50 },
    { date: '2026-03-03', price: 500, domesticThb: 14.70 },
    { date: '2026-03-10', price: 500, domesticThb: 15.00 },
    { date: '2026-03-17', price: 510, domesticThb: 15.20 },
    { date: '2026-03-24', price: 515, domesticThb: 15.60 },
    { date: '2026-03-31', price: 525, domesticThb: 16.20 },
    { date: '2026-04-07', price: 540, domesticThb: 16.50 },
    { date: '2026-04-21', price: 555, domesticThb: 16.70 },
    { date: '2026-04-28', price: 565, domesticThb: 17.20 },
    { date: '2026-05-05', price: 580, domesticThb: 17.90 },
    { date: '2026-05-12', price: 605, domesticThb: 18.50 },
    { date: '2026-05-19', price: 625, domesticThb: 19.50 },
    { date: '2026-05-26', price: 650, domesticThb: 20.00 },
    { date: '2026-06-02', price: 665, domesticThb: 20.70 },
    { date: '2026-06-09', price: 685, domesticThb: 21.30 },
    { date: '2026-06-16', price: 700, domesticThb: 21.70 },
    { date: '2026-06-23', price: 700, domesticThb: 22.00 },
    { date: '2026-06-30', price: 700, domesticThb: 22.00 },
    { date: '2026-07-07', price: 700, domesticThb: 22.15 },
    { date: '2026-07-14', price: 700, domesticThb: 22.15 },
    { date: '2026-07-21', price: 700, domesticThb: 22.15 },
    { date: '2026-08-04', price: 705, domesticThb: 22.30 },
    { date: '2026-08-11', price: 705, domesticThb: 22.30 },
    { date: '2026-08-18', price: 705, domesticThb: 22.30 },
    { date: '2026-08-25', price: 705, domesticThb: 22.30 },
    { date: '2026-09-01', price: 705, domesticThb: 22.30 },
    { date: '2026-09-08', price: 705, domesticThb: 22.30 },
    { date: '2026-09-15', price: 700, domesticThb: 22.10 },
    { date: '2026-09-22', price: 700, domesticThb: 22.10 }
  ];

  private readonly fallbackSupply: TtsaSupplyBalance = {
    referencePeriod: '2025/2026 Season',
    plantedArea: 6615.283, // kRAI
    plantedAreaYoY: -21.7, 
    cassavaYield: 2.809, // Ton/Rai
    yieldYoY: -5.0,
    cassavaProduction: 18.582, // MMT
    productionYoY: -25.6,
    nativeStarchExportVolume: 2.85, 
    nativeStarchExportYoY: 4.2, 
    modifiedStarchExportVolume: 1.15, 
    modifiedStarchExportYoY: -1.5, 
    latestFobBangkokPrice: 700,
    priceWoW: 0.00,
    sourceDates: {
      priceDate: '2026-09-22',
      statisticsDate: '2026-09-11'
    }
  };

  private constructor() {}

  public static getInstance(): TtsaService {
    if (!TtsaService.instance) {
      TtsaService.instance = new TtsaService();
    }
    return TtsaService.instance;
  }

  public getDiskCache(): TtsaWeeklyPrice[] {
    try {
      if (fs.existsSync(TAPIOCA_CACHE_FILE)) {
        const raw = fs.readFileSync(TAPIOCA_CACHE_FILE, 'utf-8');
        const json = JSON.parse(raw);
        if (json && Array.isArray(json.weeklyPrices) && json.weeklyPrices.length > 0) {
          return json.weeklyPrices as TtsaWeeklyPrice[];
        }
      }
    } catch (e) {
      console.warn('[TtsaService] Failed to read cache_tapioca.json:', e);
    }
    return [];
  }

  public saveDiskCache(prices: TtsaWeeklyPrice[]): void {
    try {
      const nowMs = Date.now();
      const cutoff5YMs = nowMs - 1825 * 24 * 60 * 60 * 1000;
      const rollingPrices = prices.filter(p => new Date(p.date).getTime() >= cutoff5YMs);

      const payload = {
        updatedAt: new Date().toISOString(),
        source: 'Thai Tapioca Starch Association (TTSA) Weekly Statistics',
        sourceUrl: 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price',
        weeklyPrices: rollingPrices
      };
      fs.writeFileSync(TAPIOCA_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[TtsaService] Failed to write cache_tapioca.json:', e);
    }
  }

  public async getWeeklyPrices(timeframe: string | boolean = '1Y', force: boolean = false): Promise<TtsaWeeklyPrice[]> {
    let tf = '1Y';
    let isForce = false;
    if (typeof timeframe === 'boolean') {
      isForce = timeframe;
    } else {
      tf = timeframe;
      isForce = force;
    }

    const now = Date.now();
    if (!isForce && this.cachedPrices.length > 0 && now < this.cacheExpiresAt) {
      return this.cachedPrices;
    }

    const diskCache = this.getDiskCache();

    const currentYear = new Date().getFullYear(); // 2026
    let startYear = 2017; // Full historical span 2017-2026

    const allPrices: TtsaWeeklyPrice[] = [...diskCache];

    if (isForce || diskCache.length === 0) {
      for (let year = startYear; year <= currentYear; year++) {
        try {
          const url = `https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price/${year}`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(6000)
          });

          if (res.ok) {
            const html = await res.text();
            const yearPrices = this.parseTtsaHtml(html);
            if (yearPrices.length > 0) {
              allPrices.push(...yearPrices);
              console.log(`[TtsaService] Successfully fetched ${yearPrices.length} weekly prices from TTSA for year ${year}`);
            }
          }
        } catch (err) {
          console.warn(`[TtsaService] Failed to scrape TTSA year ${year}:`, (err as Error)?.message || err);
        }
      }
    }

    if (allPrices.length > 0) {
      // Deduplicate and sort by date ascending
      const uniqueMap = new Map<string, TtsaWeeklyPrice>();
      allPrices.forEach(p => uniqueMap.set(p.date, p));
      
      const sorted = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      this.saveDiskCache(sorted);
      const filled = TtsaService.forwardFillWeeklyPrices(sorted);
      this.cachedPrices = filled;
      this.cacheExpiresAt = now + this.cacheDurationMs;
      return filled;
    }

    // Fallback if disk read or scrape failed
    const sortedFallback = diskCache.length > 0 ? diskCache : [...this.fallbackPrices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filledFallback = TtsaService.forwardFillWeeklyPrices(sortedFallback);
    this.cachedPrices = filledFallback;
    this.cacheExpiresAt = now + 5 * 60 * 1000;
    return filledFallback;
  }

  private parseTtsaHtml(html: string): TtsaWeeklyPrice[] {
    const prices: TtsaWeeklyPrice[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;

    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[1];
      const cellMatches = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(m => m[1].replace(/<[^>]+>/g, '').trim());
      if (cellMatches.length >= 2) {
        const dateStr = cellMatches[0];
        let formattedDate = '';
        const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-\s]+([A-Za-z]+|\d{1,2})[\/\-\s]+(201\d|202\d)/);
        if (ddmmyyyy) {
          const day = ddmmyyyy[1].padStart(2, '0');
          const monthRaw = ddmmyyyy[2].toLowerCase();
          const month = monthNames[monthRaw.slice(0, 3)] || monthRaw.padStart(2, '0');
          const year = ddmmyyyy[3];
          formattedDate = `${year}-${month}-${day}`;
        } else {
          const yyyymmdd = dateStr.match(/(201\d|202\d)[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          if (yyyymmdd) {
            formattedDate = `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
          }
        }

        if (formattedDate) {
          let domesticThb: number | undefined;
          let usdPrice: number | undefined;

          // TTSA Column 1 = Domestic Baht/Kg, Column 2 = Export USD/MT (FOB Bangkok)
          if (cellMatches.length >= 3) {
            const rawDomestic = parseFloat(cellMatches[1].replace(/[^0-9.]/g, ''));
            if (!isNaN(rawDomestic) && rawDomestic > 0 && rawDomestic < 100) {
              domesticThb = rawDomestic;
            }
            const rawUsd = parseFloat(cellMatches[2].replace(/[^0-9.]/g, ''));
            if (!isNaN(rawUsd) && rawUsd >= 300 && rawUsd <= 1000 && rawUsd % 5 === 0) {
              usdPrice = rawUsd;
            }
          }

          if (usdPrice === undefined) {
            for (let i = 1; i < cellMatches.length; i++) {
              const num = parseFloat(cellMatches[i].replace(/[^0-9.]/g, ''));
              if (!isNaN(num) && num >= 300 && num <= 1000 && num % 5 === 0) {
                usdPrice = num;
                break;
              }
            }
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

  public async getSupplyBalance(force: boolean = false): Promise<TtsaSupplyBalance> {
    const now = Date.now();
    if (!force && this.cachedSupply && now < this.cacheExpiresAt) {
      return this.cachedSupply;
    }

    try {
      const prices = await this.getWeeklyPrices(force);
      const latestPrice = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      
      const priceVal = latestPrice ? latestPrice.price : 700;
      const prevVal = prevPrice ? prevPrice.price : 700;
      const wow = prevVal === 0 ? 0 : ((priceVal - prevVal) / prevVal) * 100;

      this.cachedSupply = {
        ...this.fallbackSupply,
        latestFobBangkokPrice: priceVal,
        priceWoW: Number(wow.toFixed(2)),
        sourceDates: {
          priceDate: latestPrice ? latestPrice.date : '2026-09-22',
          statisticsDate: '2026-09-11'
        }
      };
      
      return this.cachedSupply;
    } catch (err) {
      console.warn('[TtsaService] Error computing supply balance:', err);
      return this.fallbackSupply;
    }
  }

  public static forwardFillWeeklyPrices(prices: TtsaWeeklyPrice[]): TtsaWeeklyPrice[] {
    if (prices.length === 0) return [];

    const sorted = [...prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filled: TtsaWeeklyPrice[] = [];
    filled.push(sorted[0]);

    for (let i = 1; i < sorted.length; i++) {
      const prev = filled[filled.length - 1];
      const curr = sorted[i];

      const prevDate = new Date(prev.date);
      const currDate = new Date(curr.date);

      const msDiff = currDate.getTime() - prevDate.getTime();
      const dayDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));

      if (dayDiff > 7) {
        let stepDate = new Date(prevDate);
        stepDate.setDate(stepDate.getDate() + 7);

        while (stepDate < currDate) {
          const stepStr = stepDate.toISOString().split('T')[0];
          if (stepStr !== curr.date) {
            filled.push({
              date: stepStr,
              price: prev.price,
              domesticThb: prev.domesticThb,
              isSynthetic: true
            });
          }
          stepDate.setDate(stepDate.getDate() + 7);
        }
      }
      filled.push(curr);
    }

    return filled;
  }
}

export const ttsaService = TtsaService.getInstance();
