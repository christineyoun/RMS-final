import { Commodity, Currency } from '../types';
import { COMMODITY_CONFIGS, getCalculatedMetrics } from '../lib/priceCalculator';
import { centsPerLbToUsdPerMt, cornCentsPerBuToUsdPerMt, grainCentsPerBuToUsdPerMt } from './commodityConversions';

export { COMMODITY_CONFIGS, getCalculatedMetrics };

export const EUR_USD_RATE = 1.08;
export const LIVE_KRW_RATE = 1369;
export const LIVE_EUR_RATE = 1 / 1.08;

export interface LandedCostCalculation {
  usdCifMt: number;
  eurCifMt: number;
  krwKg: number;
}

export const formatCurrencyValue = (value: number, currency: Currency): string => {
  if (currency === 'KRW') {
    return `₩${Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === 'EUR') {
    return `€${formatted}`;
  }
  return `$${formatted}`;
};

export const formatPrice = (value: number, currency: Currency, unitSuffix: string = 'MT'): string => {
  return `${formatCurrencyValue(value, currency)} / ${unitSuffix}`;
};

export const getBaseUsdCif = (commodity: Commodity, simulatedFreight: number = 42): number => {
  const config = COMMODITY_CONFIGS[commodity.id];
  if (config) {
    if (config.currency === 'USD') return config.benchmarkQuote * config.landedMultiplier;
    if (config.currency === 'EUR') return (config.benchmarkQuote * EUR_USD_RATE) * config.landedMultiplier;
    if (config.currency === 'MYR') return (config.benchmarkQuote / 4.45) * config.landedMultiplier;
  }

  const price = (commodity as any)._originalPrice ?? commodity.price;
  const unit = (commodity as any)._originalUnit ?? commodity.unit;
  let rawUsdMt = price;

  if (unit.includes('USd/bu')) {
    rawUsdMt = commodity.ticker.includes('ZC') ? cornCentsPerBuToUsdPerMt(price) : grainCentsPerBuToUsdPerMt(price);
  } else if (unit.includes('USc/lb')) {
    rawUsdMt = centsPerLbToUsdPerMt(price);
  } else if (unit.includes('MYR/MT')) {
    rawUsdMt = price / 4.45;
  } else if (unit.includes('EUR/MT')) {
    rawUsdMt = price * EUR_USD_RATE;
  } else if (unit.includes('USD/MT') || unit.includes('USD / MT')) {
    rawUsdMt = price;
  }
  return rawUsdMt + simulatedFreight;
};

export const formatStarchSweetenerBenchmark = (
  commodityId: string,
  currency: Currency
): { priceText: string; unitText: string } | null => {
  const config = COMMODITY_CONFIGS[commodityId];
  if (!config || !['potato-starch'].includes(commodityId)) {
    return null;
  }

  if (currency === 'KRW') {
    const baseVal = commodityId === 'tapioca-starch' ? 700 : config.benchmarkQuote;
    const baseKRW = Math.round(baseVal * 1388.5);
    return {
      priceText: `₩${baseKRW.toLocaleString('en-US')}`,
      unitText: 'KRW / MT',
    };
  }

  if (currency === 'USD') {
    if (commodityId === 'potato-starch') {
      const usdVal = config.benchmarkQuote * 1.145;
      return {
        priceText: `$${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        unitText: 'USD / MT',
      };
    }
    const usdVal = commodityId === 'tapioca-starch' ? 700 : config.benchmarkQuote;
    return {
      priceText: `$${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      unitText: 'USD / MT',
    };
  }

  // currency === 'EUR'
  if (commodityId === 'potato-starch') {
    return {
      priceText: `€${config.benchmarkQuote.toLocaleString('en-US')}`,
      unitText: 'EUR / MT',
    };
  }
  if (commodityId === 'tapioca-starch') {
    const eurVal = 700 / 1.08;
    return {
      priceText: `€${eurVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      unitText: 'EUR / MT',
    };
  }
  const eurVal = config.benchmarkQuote * (470.20 / 510);
  return {
    priceText: `€${eurVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    unitText: 'EUR / MT',
  };
};

export const formatLandedCost = (
  commodity: Commodity,
  currency: Currency,
  simulatedFreight: number = 42,
  liveKRW: number = LIVE_KRW_RATE,
  liveEUR: number = LIVE_EUR_RATE
): string => {
  const config = COMMODITY_CONFIGS[commodity.id];
  if (config && ['sugar', 'potato-starch', 'tapioca-starch'].includes(commodity.id)) {
    if (currency === 'KRW') {
      const baseVal = commodity.id === 'tapioca-starch' ? 700 : config.benchmarkQuote;
      const baseKRW = Math.round(baseVal * 1388.5);
      const landedKRW = Math.round(baseKRW * config.landedMultiplier);
      return `₩${landedKRW.toLocaleString('en-US')} KRW / MT`;
    }
    if (currency === 'EUR') {
      const baseEUR =
        commodity.id === 'potato-starch'
          ? config.benchmarkQuote
          : commodity.id === 'tapioca-starch'
          ? 700 / 1.08
          : config.benchmarkQuote * (470.20 / 510);
      const landedEUR = baseEUR * config.landedMultiplier;
      return `€${landedEUR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR / MT`;
    }
    // USD
    const baseUSD =
      commodity.id === 'potato-starch'
        ? config.benchmarkQuote * 1.145
        : commodity.id === 'tapioca-starch'
        ? 700
        : config.benchmarkQuote;
    const landedUSD = baseUSD * config.landedMultiplier;
    return `$${landedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD / MT`;
  }

  if (config) {
    if (currency === 'KRW') {
      const metrics = getCalculatedMetrics(commodity.id);
      return metrics.landedKRWFormatted;
    }
    if (currency === 'EUR') {
      const baseEUR = config.currency === 'EUR' ? config.benchmarkQuote : (config.benchmarkQuote * config.exchangeRateToKRW) / 1520;
      const landedEUR = baseEUR * config.landedMultiplier;
      return `€${landedEUR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MT`;
    }
    // USD
    const baseUSD = config.currency === 'USD' ? config.benchmarkQuote : (config.benchmarkQuote * config.exchangeRateToKRW) / 1369;
    const landedUSD = baseUSD * config.landedMultiplier;
    return `$${landedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MT`;
  }

  const baseUsdCif = getBaseUsdCif(commodity, simulatedFreight);

  if (currency === 'EUR') {
    const eurValue = baseUsdCif * liveEUR;
    return `€${eurValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MT`;
  }
  if (currency === 'KRW') {
    const krwValue = baseUsdCif * liveKRW;
    return `₩${Math.round(krwValue).toLocaleString('en-US', { maximumFractionDigits: 0 })} / MT`;
  }
  // USD
  return `$${baseUsdCif.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MT`;
};

export const calculateCommodityLandedCosts = (
  commodity: Commodity,
  simulatedFreight: number = 42,
  simulatedFx: number = 1369
): LandedCostCalculation => {
  const config = COMMODITY_CONFIGS[commodity.id];
  if (config) {
    const metrics = getCalculatedMetrics(commodity.id);
    const baseUSD = config.currency === 'USD' ? config.benchmarkQuote : (config.benchmarkQuote * config.exchangeRateToKRW) / 1369;
    const landedUSD = baseUSD * config.landedMultiplier;
    const baseEUR = config.currency === 'EUR' ? config.benchmarkQuote : (config.benchmarkQuote * config.exchangeRateToKRW) / 1520;
    const landedEUR = baseEUR * config.landedMultiplier;
    return {
      usdCifMt: Math.round(landedUSD * 100) / 100,
      eurCifMt: Math.round(landedEUR * 100) / 100,
      krwKg: Math.round(metrics.baseKRW * config.landedMultiplier / 1000),
    };
  }

  const baseUsdCif = getBaseUsdCif(commodity, simulatedFreight);
  const totalCifEur = baseUsdCif / EUR_USD_RATE;
  const landedWonPerKg = (baseUsdCif * simulatedFx * 1.03) / 1000;

  return {
    usdCifMt: Math.round(baseUsdCif * 100) / 100,
    eurCifMt: Math.round(totalCifEur * 100) / 100,
    krwKg: commodity.landedKrwKg || Math.round(landedWonPerKg),
  };
};

export const formatLandedCostString = (
  commodity: Commodity,
  currency: Currency,
  simulatedFreight: number = 42,
  simulatedFx: number = 1369
): string => {
  return formatLandedCost(commodity, currency, simulatedFreight, simulatedFx, 1 / EUR_USD_RATE);
};


/**
 * U.S. HRW Wheat Estimated Korea Landed Cost Calculator
 * 
 * Formula: Estimated Korea Landed Cost = FOB Cash Price + Ocean Freight + Port Cost
 * Excludes: Insurance, USD/KRW conversion, Inland transportation, VAT, Customs duty, Financing cost.
 * Result unit: USD/MT.
 */
export interface HrwLandedCostInputs {
  hrwFobCashPriceUsdMt: number | null;
  oceanFreightUsdMt: number | null;
  portCostAssumptionUsdMt: number | null;
}

export interface HrwLandedCostResult {
  isAvailable: boolean;
  landedCostUsdMt: number | null;
  compactBreakdown: string;
  missingInputs: string[];
}

export const calculateHrwKoreaLandedCost = (
  inputs: HrwLandedCostInputs
): HrwLandedCostResult => {
  const missingInputs: string[] = [];
  if (inputs.hrwFobCashPriceUsdMt == null) missingInputs.push('fob');
  if (inputs.oceanFreightUsdMt == null) missingInputs.push('freight');
  if (inputs.portCostAssumptionUsdMt == null) missingInputs.push('portCost');

  if (missingInputs.length > 0) {
    const fobStr = inputs.hrwFobCashPriceUsdMt != null ? `FOB ${inputs.hrwFobCashPriceUsdMt.toFixed(2)}` : 'FOB 미확인';
    const freightStr = inputs.oceanFreightUsdMt != null ? `Freight ${inputs.oceanFreightUsdMt.toFixed(2)}` : 'Freight 미확인';
    const portStr = inputs.portCostAssumptionUsdMt != null ? `Port ${inputs.portCostAssumptionUsdMt.toFixed(2)}` : 'Port (미설정)';
    return {
      isAvailable: false,
      landedCostUsdMt: null,
      compactBreakdown: `${fobStr} + ${freightStr} + ${portStr}`,
      missingInputs
    };
  }

  const landedCost =
    Math.round((inputs.hrwFobCashPriceUsdMt! + inputs.oceanFreightUsdMt! + inputs.portCostAssumptionUsdMt!) * 100) / 100;
  return {
    isAvailable: true,
    landedCostUsdMt: landedCost,
    compactBreakdown: `FOB ${inputs.hrwFobCashPriceUsdMt!.toFixed(2)} + Freight ${inputs.oceanFreightUsdMt!.toFixed(2)} + Port ${inputs.portCostAssumptionUsdMt!.toFixed(2)}`,
    missingInputs: []
  };
};
