import { prefixCurrency } from './currencyFormatting';
import { observedPriceChanges } from './observedPriceChanges';
import type { Commodity, Currency } from '../types';
import { COMMODITY_CONFIGS, getCalculatedMetrics } from '../lib/priceCalculator.ts';

export { COMMODITY_CONFIGS, getCalculatedMetrics };



export const formatCurrencyValue = (value: number, currency: Currency): string => {
  if (currency === 'KRW') {
    return prefixCurrency(Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 }), '₩');
  }
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === 'EUR') {
    return prefixCurrency(formatted, '€');
  }
  return prefixCurrency(formatted, '$');
};

export const formatPrice = (value: number, currency: Currency, unitSuffix: string = 'MT'): string => {
  return `${formatCurrencyValue(value, currency)} / ${unitSuffix}`;
};

export const formatStarchSweetenerBenchmark = (
  commodityId: string,
  currency: Currency
): { priceText: string; unitText: string } | null => {
  if (commodityId === 'potato-starch') return {priceText:'미확인',unitText:'실물 견적 필요'};
  const config = COMMODITY_CONFIGS[commodityId];
  if (!config || !['potato-starch'].includes(commodityId)) {
    return null;
  }

  if (currency === 'KRW') {
    const baseVal = commodityId === 'tapioca-starch' ? 700 : config.benchmarkQuote;
    const baseKRW = Math.round(baseVal * 1388.5);
    return {
      priceText: prefixCurrency(baseKRW.toLocaleString('en-US'), '₩'),
      unitText: 'KRW / MT',
    };
  }

  if (currency === 'USD') {
    if (commodityId === 'potato-starch') {
      const usdVal = config.benchmarkQuote * 1.145;
      return {
        priceText: prefixCurrency(usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '$'),
        unitText: 'USD / MT',
      };
    }
    const usdVal = commodityId === 'tapioca-starch' ? 700 : config.benchmarkQuote;
    return {
      priceText: prefixCurrency(usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '$'),
      unitText: 'USD / MT',
    };
  }

  // currency === 'EUR'
  if (commodityId === 'potato-starch') {
    return {
      priceText: prefixCurrency(config.benchmarkQuote.toLocaleString('en-US'), '€'),
      unitText: 'EUR / MT',
    };
  }
  if (commodityId === 'tapioca-starch') {
    const eurVal = 700 / 1.08;
    return {
      priceText: prefixCurrency(eurVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '€'),
      unitText: 'EUR / MT',
    };
  }
  const eurVal = config.benchmarkQuote * (470.20 / 510);
  return {
    priceText: prefixCurrency(eurVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '€'),
    unitText: 'EUR / MT',
  };
};

export interface DynamicMetricsResult {
  wowPct: number | null;
  momPct: number | null;
}

/**
 * Shared dynamic WoW and MoM KPI calculator across the application.
 * Calculates dynamic WoW and MoM percentage changes from time series arrays.
 * Handles both date-based matching (approx 7 days and 30 days) and step-based fallback.
 * Returns null whenever data is missing or empty.
 */
export function calculateDynamicMetrics(
  commodityId: string,
  basePrice: number,
  timeSeries?: Array<{ usdPerMT?: number; price?: number; date?: string; cpoUsd?: number; centsPerBushel?: number } | number> | null
): DynamicMetricsResult {
  if (!timeSeries || timeSeries.length < 2) {
    return { wowPct: null, momPct: null };
  }

  if (!['wheat','corn'].includes(commodityId)) {
    const points=(timeSeries || []).filter((p:any)=>p && typeof p==='object' && !p.isSynthetic).map((p:any)=>({date:p.date,usdPerMT:p.usdPerMT ?? p.cpoUsd ?? p.price}));
    const moves=observedPriceChanges(points);
    return {wowPct:moves.wow.pct,momPct:moves.mom.pct};
  }
  const getPrice = (item: any): number => {
    if (typeof item === 'number') return item;
    if (!item) return basePrice;
    return item?.usdPerMT ?? item?.cpoUsd ?? item?.price ?? basePrice;
  };

  const getDateMs = (item: any): number => {
    if (typeof item === 'object' && item?.date) {
      const ms = new Date(String(item.date).replace(/\./g, '-')).getTime();
      return isNaN(ms) ? 0 : ms;
    }
    return 0;
  };

  const latest = timeSeries[timeSeries.length - 1];
  const latestPrice = getPrice(latest);
  const latestMs = getDateMs(latest);

  let weekPrice = 0;
  let monthPrice = 0;

  if (latestMs > 0) {
    const targetWeek = latestMs - 7 * 86400000;
    const targetMonth = latestMs - 30 * 86400000;
    let minWDiff = Infinity;
    let minMDiff = Infinity;

    for (let i = 0; i < timeSeries.length - 1; i++) {
      const ms = getDateMs(timeSeries[i]);
      if (ms > 0) {
        const wDiff = Math.abs(ms - targetWeek);
        if (wDiff < minWDiff) {
          minWDiff = wDiff;
          weekPrice = getPrice(timeSeries[i]);
        }
        const mDiff = Math.abs(ms - targetMonth);
        if (mDiff < minMDiff) {
          minMDiff = mDiff;
          monthPrice = getPrice(timeSeries[i]);
        }
      }
    }
  }

  // Fallback to index-based if date matching didn't yield positive values
  if (!weekPrice) {
    const isDaily = timeSeries.length > 30;
    const weekIdx = isDaily ? Math.max(0, timeSeries.length - 6) : Math.max(0, timeSeries.length - 2);
    weekPrice = getPrice(timeSeries[weekIdx]);
  }
  if (!monthPrice) {
    const isDaily = timeSeries.length > 30;
    const monthIdx = isDaily ? Math.max(0, timeSeries.length - 23) : Math.max(0, timeSeries.length - 5);
    monthPrice = getPrice(timeSeries[monthIdx]);
  }

  const wowPct = (weekPrice > 0 && latestPrice > 0)
    ? Number((((latestPrice - weekPrice) / weekPrice) * 100).toFixed(2))
    : null;
  const momPct = (monthPrice > 0 && latestPrice > 0)
    ? Number((((latestPrice - monthPrice) / monthPrice) * 100).toFixed(2))
    : null;

  return { wowPct, momPct };
}

/**
 * Universal percent change formatter.
 * Renders cleanly with + / - signs or default placeholder '--%' when null / undefined.
 */
export const formatPercentChange = (
  val: number | null | undefined,
  suffix: string = '',
  placeholder: string = '--%'
): string => {
  if (val === null || val === undefined || isNaN(val)) {
    return placeholder;
  }
  const sign = val >= 0 ? '+' : '';
  const numStr = val.toFixed(2);
  return suffix ? `${sign}${numStr}% ${suffix}` : `${sign}${numStr}%`;
};

