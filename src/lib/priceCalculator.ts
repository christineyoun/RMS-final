import { prefixCurrency } from '../utils/currencyFormatting';
import { getLiveExchangeRate, getAllFxRates } from '../services/currencyService.ts';
import palmOilCache from '../data/cache_palmoil.json' with { type: 'json' };
import { centsPerLbToUsdPerMt } from '../utils/commodityConversions.ts';

export interface CommodityPriceData {
  benchmarkQuote: number;       // Raw exchange price (USD/MT, EUR/MT, MYR/MT, or KRW/MT)
  currency: 'USD' | 'EUR' | 'MYR' | 'KRW';
  exchangeRateToKRW: number;    // e.g., USD: 1369, EUR: 1520, MYR: 325
}

export const COMMODITY_CONFIGS: Record<string, CommodityPriceData> = {
  'wheat':          { benchmarkQuote: 265,    currency: 'USD', exchangeRateToKRW: 1369 },
  'corn':           { benchmarkQuote: 216,    currency: 'USD', exchangeRateToKRW: 1369 },
  'soybean':        { benchmarkQuote: 495,    currency: 'USD', exchangeRateToKRW: 1369 },
  'soybean-oil':    { benchmarkQuote: 920,    currency: 'USD', exchangeRateToKRW: 1388.5 },
  'palm-oil':       { benchmarkQuote: palmOilCache.priceMyr, currency: 'MYR', exchangeRateToKRW: 332.36 },
  'sugar':          { benchmarkQuote: 418.00, currency: 'USD', exchangeRateToKRW: 1388.5 },
  'potato-starch':  { benchmarkQuote: 870,    currency: 'EUR', exchangeRateToKRW: 1520 },
  'tapioca-starch': { benchmarkQuote: 700,    currency: 'USD', exchangeRateToKRW: 1388.5 },
};

export function convertCommodityPrice(
  price: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: Record<string, number> = getAllFxRates() as Record<string, number>
): number {
  if (fromCurrency === toCurrency) return price;

  // Fetch live MYR rate from global FX store (e.g., fxRates['MYR'] or 'USD_MYR')
  const usdMyrRate = fxRates['MYR'] || fxRates['USD_MYR'] || getLiveExchangeRate('USD_MYR') || 4.0845;

  // Step 1: Convert base MYR to USD
  let priceInUsd = price;
  if (fromCurrency === 'MYR') {
    priceInUsd = price / usdMyrRate;
  }

  // Step 2: Convert USD to Target Currency (USD / EUR / KRW)
  if (toCurrency === 'USD') return priceInUsd;
  if (toCurrency === 'EUR') return priceInUsd * (fxRates['EUR'] || getLiveExchangeRate('EUR') || 0.925);
  if (toCurrency === 'KRW') return priceInUsd * (fxRates['KRW'] || getLiveExchangeRate('KRW') || 1388.5);

  return priceInUsd;
}

export interface CalculatedMetricsResult {
  priceUsd: number;
  priceUsdFormatted: string;
  priceKrw: number;
  priceKrwFormatted: string;
  priceEur: number;
  priceEurFormatted: string;
  baseQuoteFormatted: string;
  baseKRW: number;
  wowPct: number | null;
  wowPctFormatted: string;
  direction: 'up' | 'down' | 'unchanged';
}

export function getCalculatedMetrics(
  commodityKey: string,
  fxParam?: Record<string, number> | number,
  options?: {
    rawQuote?: number; // e.g., USc/lb for Sugar
    seriesData?: Array<{ date: string; usdPerMT?: number; centsPerBushel?: number }>;
    changeWoW?: number;
  }
): CalculatedMetricsResult {
  const krwRate = typeof fxParam === 'number' && fxParam > 100
    ? fxParam
    : typeof fxParam === 'object' && fxParam
    ? (fxParam['KRW'] || fxParam['USD_KRW'] || 1388.5)
    : 1388.5;

  const config = COMMODITY_CONFIGS[commodityKey] || COMMODITY_CONFIGS['corn'];
  
  let priceUsd = config.benchmarkQuote;
  if (commodityKey === 'sugar') {
    if (options?.rawQuote) {
      priceUsd = Number(centsPerLbToUsdPerMt(options.rawQuote).toFixed(2));
    } else if (options?.seriesData && options.seriesData.length > 0) {
      const latest = options.seriesData[options.seriesData.length - 1];
      if (latest.usdPerMT && latest.usdPerMT > 0) {
        priceUsd = Number(latest.usdPerMT.toFixed(2));
      } else if (latest.centsPerBushel && latest.centsPerBushel > 0) {
        priceUsd = Number(centsPerLbToUsdPerMt(latest.centsPerBushel).toFixed(2));
      }
    } else {
      // Default live sugar benchmark quote (418.00 USD/MT)
      priceUsd = 418.00;
    }
  } else if (config.currency === 'EUR') {
    priceUsd = Number((config.benchmarkQuote * 1.08).toFixed(2));
  } else if (config.currency === 'MYR') {
    const activeUsdMyr = (typeof fxParam === 'object' && fxParam ? (fxParam['USD_MYR'] || fxParam['MYR']) : null) || getLiveExchangeRate('USD_MYR') || 4.0845;
    priceUsd = Number((config.benchmarkQuote / activeUsdMyr).toFixed(2));
  }

  // Calculate WoW percentage
  let wowPct: number | null = options?.changeWoW ?? null;
  if (wowPct === null && options?.seriesData && options.seriesData.length >= 2) {
    const pts = options.seriesData;
    const latest = pts[pts.length - 1];
    const prevIdx = Math.max(0, pts.length - 6);
    const prev = pts[prevIdx];
    const latestVal = latest.usdPerMT || (latest.centsPerBushel ? centsPerLbToUsdPerMt(latest.centsPerBushel) : 0);
    const prevVal = prev.usdPerMT || (prev.centsPerBushel ? centsPerLbToUsdPerMt(prev.centsPerBushel) : 0);
    if (prevVal > 0 && latestVal > 0) {
      wowPct = Number((((latestVal - prevVal) / prevVal) * 100).toFixed(2));
    }
  }

  const priceKrw = Math.round(priceUsd * krwRate);
  const priceEur = Number((priceUsd / 1.08).toFixed(2));

  const direction: 'up' | 'down' | 'unchanged' =
    wowPct != null ? (wowPct > 0 ? 'up' : wowPct < 0 ? 'down' : 'unchanged') : 'unchanged';

  return {
    priceUsd,
    priceUsdFormatted: prefixCurrency(priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '$'),
    priceKrw,
    priceKrwFormatted: prefixCurrency(priceKrw.toLocaleString('en-US'), '₩'),
    priceEur,
    priceEurFormatted: prefixCurrency(priceEur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '€'),
    baseQuoteFormatted: `${priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD / MT`,
    baseKRW: priceKrw,
    wowPct,
    wowPctFormatted: wowPct != null ? `${wowPct >= 0 ? '+' : ''}${wowPct.toFixed(2)}%` : '--%',
    direction,
  };
}
