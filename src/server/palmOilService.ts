import fs from 'fs';
import path from 'path';

const PALM_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_palmoil.json');

export interface PalmOilPricePoint {
  date: string; // YYYY-MM-DD
  cpoMyr: number; // MYR/MT
  oleinUsd: number; // USD/MT
  cpoUsd?: number;
  usdPerMT?: number;
  isSynthetic?: boolean;
}

export class PalmOilService {
  private static instance: PalmOilService;
  private cachedSeries: PalmOilPricePoint[] = [];
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 30 * 60 * 1000;

  private constructor() {}

  public static getInstance(): PalmOilService {
    if (!PalmOilService.instance) {
      PalmOilService.instance = new PalmOilService();
    }
    return PalmOilService.instance;
  }

  public async getPriceSeries(force: boolean = false): Promise<PalmOilPricePoint[]> {
const {loadPublicHistory,palmHistoryPayload}=await import('./publicPriceHistory.ts');
const payload=palmHistoryPayload(loadPublicHistory('palm-oil'));
return payload.historicalSeries.filter(p=>!p.isSynthetic).map(p=>({date:p.date,cpoMyr:p.cpoMyr??p.centsPerBushel,oleinUsd:p.oleinUsd??p.oleinUsdPerMt,cpoUsd:p.cpoUsd??p.usdPerMT,usdPerMT:p.usdPerMT}));
}
}

export const palmOilService = PalmOilService.getInstance();
