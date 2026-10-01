import { getLiveExchangeRate, getAllFxRates } from '../services/currencyService';
import palmOilCache from '../data/cache_palmoil.json';

export interface CommodityPriceData {
  benchmarkQuote: number;       // Raw exchange price (USD/MT, EUR/MT, MYR/MT, or KRW/MT)
  currency: 'USD' | 'EUR' | 'MYR' | 'KRW';
  exchangeRateToKRW: number;    // e.g., USD: 1369, EUR: 1520, MYR: 325
  landedMultiplier: number;     // Freight + handling markup (strictly > 1.0)
}

export const COMMODITY_CONFIGS: Record<string, CommodityPriceData> = {
  'wheat':          { benchmarkQuote: 265,  currency: 'USD', exchangeRateToKRW: 1369, landedMultiplier: 1.06 },
  'corn':           { benchmarkQuote: 216,  currency: 'USD', exchangeRateToKRW: 1369, landedMultiplier: 1.05 },
  'soybean':        { benchmarkQuote: 495,  currency: 'USD', exchangeRateToKRW: 1369, landedMultiplier: 1.05 },
  'soybean-oil':    { benchmarkQuote: 920,  currency: 'USD', exchangeRateToKRW: 1388.5, landedMultiplier: 1.074457 },
  'palm-oil':       { benchmarkQuote: palmOilCache.priceMyr, currency: 'MYR', exchangeRateToKRW: 332.36, landedMultiplier: 1.035 },
  'sugar':          { benchmarkQuote: 477.30, currency: 'USD', exchangeRateToKRW: 1388.5, landedMultiplier: 1.07856 },
  'potato-starch':  { benchmarkQuote: 870,  currency: 'EUR', exchangeRateToKRW: 1520, landedMultiplier: 1.07 },
  'tapioca-starch': { benchmarkQuote: 700,  currency: 'USD', exchangeRateToKRW: 1388.5, landedMultiplier: 1.04 },
};

export function convertCommodityPrice(
  price: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: Record<string, number> = getAllFxRates() as Record<string, number>
): number {
  if (fromCurrency === toCurrency) return price;

  // Fetch live MYR rate from global FX store (e.g., fxRates['MYR'] or 'USD_MYR')
  const usdMyrRate = fxRates['MYR'] || fxRates['USD_MYR'] || getLiveExchangeRate('USD_MYR') || 4.0831;

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

export function getCalculatedMetrics(commodityKey: string) {
  const config = COMMODITY_CONFIGS[commodityKey] || COMMODITY_CONFIGS['corn'];
  
  // 1. Calculate base quote in KRW
  const baseKRW = Math.round(config.benchmarkQuote * config.exchangeRateToKRW);
  
  // 2. Calculate landed price in KRW (Always base * multiplier)
  const landedKRW = Math.round(baseKRW * config.landedMultiplier);

  return {
    baseQuoteFormatted: `${config.benchmarkQuote.toLocaleString()} ${config.currency} / MT`,
    baseKRW,
    landedKRWFormatted: `₩${landedKRW.toLocaleString()} / MT`,
  };
}
