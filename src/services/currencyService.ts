export interface FXRates {
  USD_KRW: number;
  EUR_USD: number;
  USD_MYR: number;
  EUR_KRW?: number;
  [key: string]: number | undefined;
}

type FXListener = (rates: FXRates) => void;

let cacheFxRates: FXRates = {
  USD_KRW: 1388.5,
  EUR_USD: 1.081,
  USD_MYR: 4.0845,
};

const listeners: Set<FXListener> = new Set();

export function subscribeFxRates(listener: FXListener): () => void {
  listeners.add(listener);
  listener(cacheFxRates); // Emit current cached rates immediately
  return () => {
    listeners.delete(listener);
  };
}

export function updateLiveFxRates(newRates: Partial<FXRates>): void {
  cacheFxRates = { ...cacheFxRates, ...newRates };
  listeners.forEach((listener) => listener(cacheFxRates));
}

export function getAllFxRates(): FXRates {
  return cacheFxRates;
}

export function getLiveExchangeRate(pair: string = 'USD_MYR'): number {
  if (pair === 'USD_MYR' || pair === 'MYR') {
    return cacheFxRates.USD_MYR || 4.0845;
  }
  if (pair === 'USD_KRW' || pair === 'KRW') {
    return cacheFxRates.USD_KRW || 1388.5;
  }
  if (pair === 'EUR_USD' || pair === 'EUR') {
    return cacheFxRates.EUR_USD || 1.081;
  }
  return cacheFxRates[pair] || 1;
}

/**
 * Dynamically fetches live FX rates from the pipeline telemetry endpoint or Frankfurter API.
 */
export async function fetchLiveFxRates(): Promise<FXRates> {
  let updated = false;
  const newRates: Partial<FXRates> = {};

  // 1. Try /api/pipeline/telemetry endpoint
  try {
    const res = await fetch('/api/pipeline/telemetry');
    if (res.ok) {
      const data = await res.json();
      const usdKrw = data.usdKrw;
      const eurKrw = data.eurKrw;

      if (typeof usdKrw === 'number' && usdKrw > 0) {
        newRates.USD_KRW = usdKrw;
        updated = true;
      }
      if (typeof usdKrw === 'number' && typeof eurKrw === 'number' && usdKrw > 0) {
        newRates.EUR_USD = Number((eurKrw / usdKrw).toFixed(4));
        updated = true;
      }

      if (Array.isArray(data.normalizedData)) {
        const myrEntry = data.normalizedData.find(
          (d: any) => d.commodity === 'USD/MYR' || (d.indicator && d.indicator.includes('MYR'))
        );
        if (myrEntry && typeof myrEntry.value === 'number' && myrEntry.value > 0) {
          newRates.USD_MYR = myrEntry.value;
          updated = true;
        }

        const eurUsdEntry = data.normalizedData.find(
          (d: any) => d.commodity === 'EUR/USD' || (d.indicator && d.indicator.includes('EUR/USD'))
        );
        if (eurUsdEntry && typeof eurUsdEntry.value === 'number' && eurUsdEntry.value > 0) {
          newRates.EUR_USD = eurUsdEntry.value;
          updated = true;
        }
      }
    }
  } catch (err) {
    console.warn('[CurrencyService] Telemetry pipeline fetch notice:', err);
  }

  // 2. Direct live Frankfurter API fetch for public benchmark
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,MYR');
    if (res.ok) {
      const json = await res.json();
      if (json && json.rates) {
        if (typeof json.rates.KRW === 'number') newRates.USD_KRW = json.rates.KRW;
        if (typeof json.rates.MYR === 'number') newRates.USD_MYR = json.rates.MYR;
        if (typeof json.rates.EUR === 'number' && json.rates.EUR > 0) {
          newRates.EUR_USD = Number((1 / json.rates.EUR).toFixed(4));
        }
        updated = true;
      }
    }
  } catch (err) {
    console.warn('[CurrencyService] Frankfurter API direct fetch notice:', err);
  }

  if (updated && Object.keys(newRates).length > 0) {
    updateLiveFxRates(newRates);
  }

  return cacheFxRates;
}
