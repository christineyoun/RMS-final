import { GoogleGenAI } from './paidGeminiGuard.ts';
import type { DataSourceDefinition, NormalizedMarketData, MarketDataSyncPayload } from '../types.ts';
import { CENTRAL_SOURCE_REGISTRY, getSourceDefinition } from './sourceRegistry.ts';
import { usdaFasService } from './usdaFasService.ts';
import type { UsdaWheatWorldSummary } from './usdaFasService.ts';
import { usWheatPriceReportService } from './usWheatService.ts';
import { centsPerLbToUsdPerMt } from '../utils/commodityConversions.ts';
import palmOilCache from '../data/cache_palmoil.json' with { type: 'json' };
import { scrapeLivePalmOilPrices } from './historicalPriceService.ts';
import { ttsaService } from './ttsaService.ts';

export const getKSTFormattedTime = (): string => {
  return (
    new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' KST'
  );
};

export const getKSTDateString = (): string => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
};

interface SourceRuntimeState {
  sourceId: string;
  status: 'idle' | 'success' | 'stale' | 'failed';
  lastAttemptTime?: string;
  lastSuccessTime?: string;
  lastSuccessTimestampMs: number;
  errorMessage?: string;
  data: NormalizedMarketData[];
}

class ServerMarketDataService {
  private static instance: ServerMarketDataService;
  private runtimeStore: Map<string, SourceRuntimeState> = new Map();
  private isSyncingAll: boolean = false;
  private geminiCooldownUntil: number = 0;

  private constructor() {
    const nowKST = getKSTFormattedTime();
    const dateKST = getKSTDateString();

    // Initialize runtime store from registry
    for (const def of CENTRAL_SOURCE_REGISTRY) {
      let initialData: NormalizedMarketData[] = [];
      let initialStatus: 'idle' | 'success' = 'idle';

      this.runtimeStore.set(def.sourceId, {
        sourceId: def.sourceId,
        status: initialStatus,
        lastSuccessTime: undefined,
        lastSuccessTimestampMs: 0,
        data: initialData
      });
    }
  }

  public static getInstance(): ServerMarketDataService {
    if (!ServerMarketDataService.instance) {
      ServerMarketDataService.instance = new ServerMarketDataService();
    }
    return ServerMarketDataService.instance;
  }

  /**
   * Check if a source's stored data is older than its expected update frequency
   */
  public isSourceStale(sourceId: string): boolean {
    const def = getSourceDefinition(sourceId);
    const state = this.runtimeStore.get(sourceId);
    if (!def || !state) return true;

    // Never fetched yet
    if (state.lastSuccessTimestampMs === 0 || state.data.length === 0) {
      return true;
    }

    const elapsed = Date.now() - state.lastSuccessTimestampMs;
    return elapsed >= def.updateFrequencyMs;
  }

  /**
   * Retrieve list of source definitions annotated with runtime status and update times
   */
  public getSourceRegistryWithStatus(): DataSourceDefinition[] {
    return CENTRAL_SOURCE_REGISTRY.map((def) => {
      const state = this.runtimeStore.get(def.sourceId);
      const isStale = this.isSourceStale(def.sourceId);
      let status: 'idle' | 'success' | 'stale' | 'failed' = state?.status || 'idle';
      if (status === 'success' && isStale) {
        status = 'stale';
      }

      return {
        ...def,
        status,
        lastAttemptTime: state?.lastAttemptTime,
        lastSuccessTime: state?.lastSuccessTime,
        errorMessage: state?.errorMessage
      };
    });
  }

  /**
   * Fetch and normalize Frankfurter FX data
   */
  private async fetchFrankfurterFx(force: boolean = false): Promise<NormalizedMarketData[]> {
 const state=this.runtimeStore.get('frankfurter-fx')!;
 try{
  const {readFreeJson}=await import('./freeDailyPublication.ts');
  const {parseDatedDisplayFx,displayCurrencyFactor}=await import('../utils/soybeanPriceSnapshot.ts');
  const saved=readFreeJson('free-fx.json'),fx=parseDatedDisplayFx(saved?.raw,saved?.verifiedAt);
  if(!fx)throw Error('Verified saved FX unavailable');
  const source=getSourceDefinition('frankfurter-fx')!;
  state.data=[['USD/KRW',fx.USD_KRW],['EUR/KRW',displayCurrencyFactor('EUR','KRW',fx)],['EUR/USD',fx.EUR_USD]].map(([pair,value])=>({commodity:String(pair),indicator:String(pair),country:'FX',date:fx.observationDate,value:Number(value),unit:String(pair).split('/')[1],source:source.sourceName,sourceUrl:fx.sourceUrl,lastUpdated:fx.retrievedAt,status:'success'}));
  state.status='success';state.lastSuccessTime=fx.retrievedAt;state.lastSuccessTimestampMs=Date.parse(fx.retrievedAt);return state.data;
 }catch{state.status=state.data.length?'stale':'failed';state.errorMessage='Verified saved FX unavailable';return state.data.map(row=>({...row,status:'stale' as const}));}
}

  /**
   * Fetch and normalize Open-Meteo Weather Radar data for a given region
   */
  private async fetchOpenMeteoRadar(sourceId: string, force: boolean = false): Promise<NormalizedMarketData[]> {
    const def = getSourceDefinition(sourceId);
    if (!def) return [];
    const state = this.runtimeStore.get(sourceId)!;

    if (!force && !this.isSourceStale(sourceId) && state.data.length > 0) {
      return state.data;
    }

    const nowKST = getKSTFormattedTime();
    const dateKST = getKSTDateString();
    state.lastAttemptTime = nowKST;

    try {
      const res = await fetch(def.endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) {
        throw new Error(`Open-Meteo returned HTTP ${res.status}: ${res.statusText}`);
      }

      const json: any = await res.json();
      const currentTemp = json.current?.temperature_2m;
      const precipSum = json.daily?.precipitation_sum?.[0] ?? NaN;
      const tempMax = json.daily?.temperature_2m_max?.[0] ?? currentTemp;
      const tempMin = json.daily?.temperature_2m_min?.[0] ?? currentTemp;

      if (![currentTemp,precipSum].every(Number.isFinite)) {
        throw new Error('Invalid Open-Meteo response: temperature_2m missing');
      }

      let country = 'USA';
      if (sourceId === 'open-meteo-south-america') country = 'BRA';
      if (sourceId === 'open-meteo-eu-crops') country = 'FRA';

      const normalized: NormalizedMarketData[] = [
        {
          commodity: def.commodity,
          indicator: `${def.sourceName} - 현재 기온`,
          country,
          date: dateKST,
          value: Math.round(currentTemp * 10) / 10,
          unit: '°C',
          source: def.sourceName,
          sourceUrl: def.sourceUrl,
          lastUpdated: nowKST,
          status: 'success'
        },
        {
          commodity: def.commodity,
          indicator: `${def.sourceName} - 일일 강수량`,
          country,
          date: dateKST,
          value: Math.round(precipSum * 10) / 10,
          unit: 'mm',
          source: def.sourceName,
          sourceUrl: def.sourceUrl,
          lastUpdated: nowKST,
          status: 'success'
        }
      ];

      state.status = 'success';
      state.lastSuccessTime = nowKST;
      state.lastSuccessTimestampMs = Date.now();
      state.errorMessage = undefined;
      state.data = normalized;
      return normalized;
    } catch (err: any) {
      state.status=state.data.length?'stale':'failed';state.errorMessage='Weather source unavailable';return state.data.map(row=>({...row,status:'stale' as const}));
    }
  }

  /**
   * Verified Agricultural Exchange Baseline Data for zero-downtime fallback
   */
  public getFallbackGeminiCommodities(dateKST: string, nowKST: string): NormalizedMarketData[] {
return []; // No authoritative exchange observation is available from a sample factory.
}

  /**
   * Fetch and normalize Gemini Search Grounded Commodity Benchmarks
   */
  private async fetchGeminiCommodities(force: boolean = false): Promise<NormalizedMarketData[]> {
return []; // Prices belong to authenticated publisher/source history, never model-extracted defaults.
}

  /**
   * Fetch and normalize USDA FAS PSD data (Commodity: Wheat 0410000, Market Year: 2026)
   */
  public async fetchUsdaFasPsd(force: boolean = false): Promise<NormalizedMarketData[]> {
    const sourceId = 'usda-fas-psd';
    const state = this.runtimeStore.get(sourceId);
    if (!state) return [];

    if (!force && !this.isSourceStale(sourceId) && state.data.length > 0) {
      return state.data;
    }

    const nowKST = getKSTFormattedTime();
    state.lastAttemptTime = nowKST;

    try {
      const result = await usdaFasService.fetchWorldPsd('0410000', String(new Date().getUTCFullYear()));
      if (result.normalizedData && result.normalizedData.length > 0) {
        state.status = 'success';
        state.lastSuccessTime = nowKST;
        state.lastSuccessTimestampMs = Date.now();
        state.errorMessage = undefined;
        state.data = result.normalizedData;
        return result.normalizedData;
      }
      throw new Error(result.errorMessage || 'Failed to fetch USDA FAS PSD dataset');
    } catch (err: any) {
      console.warn(`[MarketDataService] USDA FAS PSD notice: ${err.message || String(err)}. Serving official WASDE baseline.`);
      const result = await usdaFasService.fetchWorldPsd('0410000', String(new Date().getUTCFullYear()));
      if (result.normalizedData) {
        state.status = 'success';
        state.lastSuccessTime = nowKST;
        state.lastSuccessTimestampMs = Date.now();
        state.errorMessage = undefined;
        state.data = result.normalizedData;
        return result.normalizedData;
      }
      return state.data;
    }
  }

  /**
   * Fetch and normalize U.S. Wheat Associates Price Report
   */
  public async fetchUsWheatPriceReport(force: boolean = false): Promise<NormalizedMarketData[]> {
    const sourceId = 'uswheat-price-report';
    const state = this.runtimeStore.get(sourceId);
    if (!state) return [];

    if (!force && !this.isSourceStale(sourceId) && state.data.length > 0) {
      return state.data;
    }

    const nowKST = getKSTFormattedTime();
    state.lastAttemptTime = nowKST;

    try {
      const result = await usWheatPriceReportService.fetchLatestPriceReport(force);
      if (result.success && result.normalizedData && result.normalizedData.length > 0) {
        state.status = 'success';
        state.lastSuccessTime = nowKST;
        state.lastSuccessTimestampMs = Date.now();
        state.errorMessage = undefined;
        state.data = result.normalizedData;
        return result.normalizedData;
      }
      if (result.errorMessage) {
        throw new Error(result.errorMessage);
      }
      return state.data;
    } catch (err: any) {
      const errorMsg = `U.S. Wheat price report fetch error: ${err.message || String(err)}`;
      state.status=state.data.length?'stale':'failed';state.errorMessage=errorMsg;return state.data.map(row=>({...row,status:'stale' as const}));
    }
  }

  /**
   * Fetch and normalize Yahoo Finance live SB=F Sugar prices with browser User-Agent headers
   */
  public async fetchYahooLiveSugar(): Promise<NormalizedMarketData | null> {
    const nowKST = getKSTFormattedTime();
    const dateKST = getKSTDateString();

    try {
      const targetUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/SB%3DF?interval=1d&range=2d';
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) {
        throw new Error(`Yahoo Finance HTTP ${res.status}`);
      }

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('No result in Yahoo payload for SB=F');

      const quotes = result.indicators?.quote?.[0]?.close || [];
      const validQuotes = quotes.filter((q: any) => typeof q === 'number' && !isNaN(q));
      const rawCentsPerLb = result.meta?.regularMarketPrice || validQuotes.slice(-1)[0];
      const observedAt = result.meta?.regularMarketTime ?? result.timestamp?.at(-1);
      if (!Number.isFinite(rawCentsPerLb) || rawCentsPerLb <= 0 || !Number.isFinite(observedAt) || observedAt <= 0) {
        throw new Error('Timestamped Sugar observation unavailable');
      }
      const observationTime = new Date(observedAt * 1000).toISOString();

      // Formula: (USc/lb / 100) * LBS_PER_METRIC_TON = USD/MT
      const sugarUsdPerMt = Math.round(centsPerLbToUsdPerMt(rawCentsPerLb) * 100) / 100;

      return {
        commodity: 'sugar',
        indicator: 'ICE 원당 No.11 선물가',
        country: 'USA',
        date: observationTime.slice(0, 10),
        value: Math.round(rawCentsPerLb * 100) / 100, // Raw USc/lb
        unit: 'USc/lb',
        source: 'ICE / Yahoo Finance',
        sourceUrl: 'https://finance.yahoo.com/quote/SB=F',
        lastUpdated: observationTime,
        status: 'success'
      };
    } catch (err: any) {
      console.warn('[MarketDataService] Yahoo Finance SB=F fetch notice:', err?.message || String(err));
      return null;
    }
  }

  /**
   * Synchronize all active sources according to their update frequencies
   */
  public async syncAllSources(force: boolean = false): Promise<MarketDataSyncPayload> {
    if (this.isSyncingAll && !force) {
      return this.getCurrentPayload();
    }

    this.isSyncingAll = true;

    try {
      // 1. Fetch Frankfurter FX
      await this.fetchFrankfurterFx(force);

      // 2. Fetch Open-Meteo crop radar endpoints
      await Promise.allSettled([
        this.fetchOpenMeteoRadar('open-meteo-corn-belt', force),
        this.fetchOpenMeteoRadar('open-meteo-south-america', force),
        this.fetchOpenMeteoRadar('open-meteo-eu-crops', force)
      ]);

      // 3. Fetch Gemini agricultural exchange data
      await this.fetchGeminiCommodities(force);

      // 4. Fetch Live Sugar (SB=F) from Yahoo Finance to update gemini-search-grounding state
      const liveSugar = await this.fetchYahooLiveSugar();
      if (liveSugar) {
        const geminiState = this.runtimeStore.get('gemini-search-grounding');
        if (geminiState && geminiState.data) {
          const idx = geminiState.data.findIndex((item) => item.commodity === 'sugar');
          if (idx !== -1) {
            geminiState.data[idx] = liveSugar;
          } else {
            geminiState.data.push(liveSugar);
          }
        }
      }

      // 5. Fetch USDA FAS PSD World Wheat data (0410000, 2026)
      await this.fetchUsdaFasPsd(force);

      // 6. Fetch U.S. Wheat Associates Price Report
      await this.fetchUsWheatPriceReport(force);

      // 7. Scrape Palm Oil (FCPO / RBD Olein) live settlement
      await scrapeLivePalmOilPrices(force).catch((err) =>
        console.warn('[MarketDataService] Palm oil live sync notice:', err?.message || err)
      );

      // 8. Scrape Thai Tapioca Starch Association (TTSA) weekly benchmark
      await ttsaService.getWeeklyPrices('6M', force).catch((err) =>
        console.warn('[MarketDataService] TTSA live sync notice:', err?.message || err)
      );

      return this.getCurrentPayload();
    } finally {
      this.isSyncingAll = false;
    }
  }

  /**
   * Get all normalized data mapped by unique key
   */
  public getAllNormalizedData(): Record<string, NormalizedMarketData> {
    const map: Record<string, NormalizedMarketData> = {};
    for (const state of this.runtimeStore.values()) {
      for (const item of state.data) {
        const key = `${item.commodity}_${item.indicator}`.replace(/\s+/g, '_');
        map[key] = item;
      }
    }
    return map;
  }

  /**
   * Return aggregated current state payload
   */
  public getCurrentPayload(): MarketDataSyncPayload {
const sources=this.getSourceRegistryWithStatus();return {lastUpdated:sources.map(s=>s.lastSuccessTime||'').sort().at(-1)||'',sources,normalizedData:this.getAllNormalizedData(),failedSourcesCount:sources.filter(s=>s.status==='failed').length,totalSourcesCount:sources.length,alerts:[]};
}
}

export const serverMarketDataService = ServerMarketDataService.getInstance();
