import {loadPublicHistory,refreshPublicHistory} from './publicPriceHistory.ts';
import fs from 'fs';
import path from 'path';

const TAPIOCA_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_tapioca.json');

export interface TtsaWeeklyPrice {
  date: string; // YYYY-MM-DD
  price: number; // FOB Bangkok USD/MT
  domesticThb?: number; // THB/kg
  isSynthetic?: boolean;
  provenance?: string;
  sourceUrl?: string;
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

  public async getWeeklyPrices(timeframe:string|boolean='1Y',force=false):Promise<TtsaWeeklyPrice[]> {
    let history=loadPublicHistory('tapioca-starch');
    const requested=typeof timeframe==='boolean'?timeframe:force;
    if(requested && (!history.lastCheckedAt||Date.now()-Date.parse(history.lastCheckedAt)>6*3600000))history=await refreshPublicHistory('tapioca-starch');
    return history.points.filter(p=>p.benchmark==='tapioca-fob').map(p=>({date:p.date,price:p.value,domesticThb:p.domesticThb,provenance:p.provenance,sourceUrl:p.sourceUrl}));
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
throw Error('TTSA supply balance unavailable: no verified production/trade source; use dated weekly price observations');
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
