import { loadPublicHistory, palmHistoryPayload, refreshPublicHistory } from './publicPriceHistory.ts';
import fs from 'fs';
import path from 'path';
import { ttsaService } from './ttsaService.ts';
import { LBS_PER_METRIC_TON, CORN_BUSHELS_PER_MT, WHEAT_SOY_BUSHELS_PER_MT, centsPerLbToUsdPerMt } from '../utils/commodityConversions.ts';
import { updateSavedBaselinePrice } from './geminiApi.ts';
import { getLiveExchangeRate } from '../services/currencyService.ts';
import { scrapeInvestingOleinHistory } from './palmOleinScraperService.ts';

const PALM_CACHE_FILE = path.join(process.cwd(), 'src/data/cache_palmoil.json');
const TRADINGVIEW_FCPO_URL = 'https://www.tradingview.com/symbols/MYX-FCPO1!/';
const INVESTING_OLEIN_URL = 'https://www.investing.com/commodities/rbd-palm-olein';

export interface PalmOilDataPoint {
  oleinPublisherQuoteDate?:string;
  cpoMyr?: number;
  date: string;
  centsPerBushel: number; // MDEX FCPO in MYR/MT
  usdPerMT: number;       // CPO in USD/MT
  cpoUsd?: number;        // Explicit CPO in USD/MT
  oleinUsd?: number;      // Explicit RBD Palm Olein in USD/MT
  oleinUsdPerMt: number;  // RBD Palm Olein in USD/MT
}

export interface PalmOilCachePayload {
  diagnostics?:any;fxPolicy?:string;
  cpoObservationDate?:string;
  oleinObservationDate?:string;
  priceMyr: number;
  cpoUsdMt: number;
  oleinUsd: number;
  updatedAt: string;
  source: string;
  cpoSourceUrl: string;
  oleinSourceUrl: string;
  historicalSeries: PalmOilDataPoint[];
}

let lastPalmScrapeAt = 0;
const PALM_SCRAPE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes unless forceRefresh is true

export function getPalmCache(): PalmOilCachePayload | null {
  try {
    if (fs.existsSync(PALM_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PALM_CACHE_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.historicalSeries) && parsed.historicalSeries.length > 0) {
        return parsed as PalmOilCachePayload;
      }
    }
  } catch (e) {
    console.warn('[PalmOilCache] Could not read palm oil disk cache:', e);
  }
  return null;
}

export function updatePalmCache(data: PalmOilCachePayload): void {
  try {
    fs.writeFileSync(PALM_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[PalmOilCache] Could not write palm oil disk cache:', e);
  }
}

function parseTradingViewFcpoHtml(html: string): number | null {
  const patterns = [
    /"last_price"\s*:\s*([\d.]+)/i,
    /"trade_price"\s*:\s*([\d.]+)/i,
    /data-symbol-last=["']([\d.,]+)["']/i,
    /"price"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/i,
    /MYX:FCPO1![\s\S]{0,400}?(\d{1},?\d{3}(?:\.\d+)?)/i,
    /class="[^"]*last-[^"]*"[^>]*>\s*([\d,]+(?:\.\d+)?)/i
  ];
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(val) && val >= 3000 && val <= 7500) {
        return Math.round(val);
      }
    }
  }
  return null;
}

function parseInvestingOleinHtml(html: string): number | null {
  const patterns = [
    /data-test=["']instrument-price-last["'][^>]*>\s*([\d,]+(?:\.\d+)?)\s*</i,
    /"last"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/i,
    /"last_numeric"\s*:\s*([\d.]+)/i,
    /instrument-price-last[^>]*>([\d,]+(?:\.\d+)?)</i,
    /RBD Palm Olein[\s\S]{0,500}?(\d{1},?\d{3}\.\d{2})/i
  ];
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(val) && val >= 700 && val <= 2200) {
        return Number(val.toFixed(2));
      }
    }
  }
  return null;
}

export async function scrapeLivePalmOilPrices(forceRefresh=false):Promise<PalmOilCachePayload> {
  let history=loadPublicHistory('palm-oil');
  if(forceRefresh)
    history=await refreshPublicHistory('palm-oil',getLiveExchangeRate('USD_MYR'));
  return palmHistoryPayload(history);
}

export interface TickerConfig {
  symbol: string;
  name: string;
  buPerMt?: number;
  lbsPerMt?: number;
  multiplier?: number;
  quoteUnit?: string;
  exchange?: string;
}

export const tickerMap: Record<string, TickerConfig> = {
  corn: { symbol: 'ZC=F', buPerMt: CORN_BUSHELS_PER_MT, name: 'CBOT Corn', quoteUnit: 'US¢/bu', exchange: 'CBOT' },
  soybean: { symbol: 'ZS=F', buPerMt: WHEAT_SOY_BUSHELS_PER_MT, name: 'CBOT Soybean', quoteUnit: 'US¢/bu', exchange: 'CBOT' },
  'soybean-oil': { symbol: 'ZL=F', lbsPerMt: LBS_PER_METRIC_TON, name: 'CBOT Soybean Oil', quoteUnit: 'US¢/lb', exchange: 'CBOT' },
  'soybean-meal': { symbol: 'ZM=F', multiplier: 1.1023, name: 'CBOT Soybean Meal' },
  wheat: { symbol: 'ZW=F', buPerMt: WHEAT_SOY_BUSHELS_PER_MT, name: 'CBOT Wheat', quoteUnit: 'US¢/bu', exchange: 'CBOT' },
  'palm-oil': { symbol: 'FCPO.KL', multiplier: 1, name: 'Bursa Malaysia Palm Oil' },
  sugar: { symbol: 'SB=F', lbsPerMt: LBS_PER_METRIC_TON, name: 'ICE Sugar', quoteUnit: 'US¢/lb', exchange: 'ICE Futures U.S.' },
  'potato-starch': { symbol: 'CN_110813', name: 'Eurostat Comext CN 110813 Potato Starch Unit Value' },
  'tapioca-starch': { symbol: 'TTSA_FOB_BANGKOK', name: 'Thai Tapioca Starch Association Weekly Price' }
};

export async function fetchHistoricalData(commodityId: string = 'corn', timeframe: string = '6M', forceRefresh: boolean = false) {
  const cleanId = (commodityId || 'corn').toLowerCase();
  
  if (cleanId === 'potato-starch' || cleanId === 'potato_starch') {
    return { success: false, commodity: 'potato-starch', symbol: 'unavailable', timeframe,
      range: timeframe, source: '감자전분 실물 가격 미확인', data: [],
      dataStatus: 'unavailable', error: '공식 감자 수확량은 농업 생산 대리지표이며 감자전분 시장가격이 아닙니다.' };
  }

  if (cleanId === 'tapioca-starch' || cleanId === 'tapioca_starch') {
    const weeklyPrices = await ttsaService.getWeeklyPrices(timeframe, forceRefresh);
    const nowMs = Date.now();

    let daysToKeep = 180; // Default 6M
    if (timeframe === '1M') daysToKeep = 30;
    else if (timeframe === '3M') daysToKeep = 90;
    else if (timeframe === '6M') daysToKeep = 180;
    else if (timeframe === '1Y') daysToKeep = 365;
    else if (timeframe === '3Y') daysToKeep = 1095;
    else if (timeframe === '5Y' || timeframe === 'ALL') daysToKeep = 1825;

    const cutoffMs = nowMs - daysToKeep * 24 * 60 * 60 * 1000;
    const filtered = weeklyPrices.filter(item => !item.isSynthetic && Number.isFinite(item.price) && item.price > 0 && new Date(item.date).getTime() >= cutoffMs && new Date(item.date).getTime() <= nowMs);

    const dataPoints = filtered.map(item => ({
      date: item.date,
      usdPerMT: item.price,
      centsPerBushel: item.price,
      isSynthetic: item.isSynthetic || false,
      provenance: item.provenance,
      sourceUrl: item.sourceUrl
    }));

    return {
      success: true,
      commodity: 'tapioca-starch',
      symbol: 'TTSA_FOB_BANGKOK',
      timeframe,
      range: timeframe,
      source: 'Thai Tapioca Starch Association · FOB Bangkok',
      data: dataPoints,
    };
  }

  if (cleanId === 'palm-oil' || cleanId === 'palmoil' || cleanId === 'palm_oil') {
    const palmPayload = await scrapeLivePalmOilPrices(forceRefresh);
    const fullSeries = palmPayload.historicalSeries || [];

    // Slice verified historical series by timeframe without synthetic generation
    let filtered = fullSeries;
    const nowMs = Date.now();
    if (timeframe === '1M') {
      const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
      const matched = fullSeries.filter(pt => new Date(pt.date).getTime() >= cutoff);
      filtered = matched.length > 0 ? matched : fullSeries.slice(-22);
    } else if (timeframe === '3M') {
      const cutoff = nowMs - 90 * 24 * 60 * 60 * 1000;
      const matched = fullSeries.filter(pt => new Date(pt.date).getTime() >= cutoff);
      filtered = matched.length > 0 ? matched : fullSeries.slice(-66);
    } else if (timeframe === '6M') {
      const cutoff = nowMs - 180 * 24 * 60 * 60 * 1000;
      const matched = fullSeries.filter(pt => new Date(pt.date).getTime() >= cutoff);
      filtered = matched.length > 0 ? matched : fullSeries.slice(-130);
    } else if (timeframe === '1Y' || timeframe === 'ALL') {
      filtered = fullSeries;
    }

    const formattedFiltered = filtered.map((pt) => {
      const cpoUsd = pt.cpoUsd ?? pt.usdPerMT;
      const oleinUsd = pt.oleinUsd ?? pt.oleinUsdPerMt;
      return {
        date: pt.date,
        cpoMyr:pt.cpoMyr,
        centsPerBushel: pt.centsPerBushel,
        usdPerMT: cpoUsd,
        cpoUsd,
        oleinUsd,
        oleinUsdPerMt: oleinUsd,
        oleinPublisherQuoteDate:pt.oleinPublisherQuoteDate,
        spreadUsd: Number((oleinUsd - cpoUsd).toFixed(2)),
      };
    });

    return {
      success: true,
      commodity: 'palm-oil',
      symbol: 'MYX-FCPO1! · RBD Palm Olein',
      timeframe,
      range: timeframe,
      source: palmPayload.source || 'MDEX (FCPO) · RBD Olein (Investing.com)',
      cpoSourceUrl: palmPayload.cpoSourceUrl || TRADINGVIEW_FCPO_URL,
      oleinSourceUrl: palmPayload.oleinSourceUrl || INVESTING_OLEIN_URL,
      updatedAt: palmPayload.updatedAt,
      diagnostics:palmPayload.diagnostics,fxPolicy:palmPayload.fxPolicy,
      priceMyr: palmPayload.priceMyr,
      cpoUsdMt: palmPayload.cpoUsdMt,
      oleinUsd: palmPayload.oleinUsd,
      cpoObservationDate:palmPayload.cpoObservationDate,
      oleinObservationDate:palmPayload.oleinObservationDate,
      data: formattedFiltered,
    };
  }

  const config = tickerMap[cleanId] || tickerMap.corn;
  const symbol = config.symbol;

  const rangeMap: Record<string, string> = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '5Y': '5y',
    'ALL': 'max'
  };
  const yahooRange = rangeMap[timeframe] || '6mo';

  let targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yahooRange}&interval=1d`;

  // A forced refresh must not reuse a local HTTP cache. Yahoo may still apply
  // its own upstream caching; fetchedAt below reports *retrieval* time only.
  const yahooFetchOptions: RequestInit = {
    cache: forceRefresh ? 'no-store' : 'default',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      ...(forceRefresh ? { 'Cache-Control': 'no-cache' } : {}),
    },
    signal: AbortSignal.timeout(12000),
  };
  let response = await fetch(targetUrl, yahooFetchOptions);

  let json = response.ok ? await response.json() : null;
  let result = json?.chart?.result?.[0];

  if (!result || (result.timestamp || []).length <= 1) {
    response = await fetch(targetUrl, yahooFetchOptions);
    if (response.ok) {
      json = await response.json();
      result = json?.chart?.result?.[0];
    }
  }

  if (!result) {
    throw new Error(`Invalid response payload from Yahoo Finance for ${symbol}`);
  }

  const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quotes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
  const quoteUnit = config.quoteUnit || 'unspecified';
  const exchange = config.exchange || 'Unknown exchange';
  const exchangeTimezone = result.meta?.exchangeTimezoneName || 'UTC';
  const mult = config.buPerMt ?? config.lbsPerMt ?? config.multiplier ?? NaN;
  const toUsdPerMt = (quoteValue: number): number =>
    Number((config.lbsPerMt
      ? centsPerLbToUsdPerMt(quoteValue)
      : (quoteValue / 100) * mult).toFixed(2));

  // Daily Yahoo bars use exchange-local trading dates. Do not date a live
  // market quote using the server's UTC calendar day.
  const tradingDate = (timestampSeconds: number): string => {
    const date = new Date(timestampSeconds * 1000);
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: exchangeTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const part = (type: string) => parts.find(item => item.type === type)?.value || '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };

  const marketTime = Number(result.meta?.regularMarketTime);
  const marketQuotePrice = Number(result.meta?.regularMarketPrice);
  const hasMarketTime = Number.isFinite(marketTime) && marketTime > 0;
  const hasMarketQuote = Number.isFinite(marketQuotePrice) && marketQuotePrice > 0;
  const marketQuoteDate = hasMarketTime ? tradingDate(marketTime) : null;

  // A live/latest quote is not a historical close or an official settlement.
  // Keep it in a separate object, rather than appending it to chart history.
  const latestMarketQuote = hasMarketQuote ? {
    quoteValue: Number(marketQuotePrice.toFixed(2)),
    quoteUnit,
    usdPerMT: toUsdPerMt(marketQuotePrice),
    asOf: hasMarketTime ? new Date(marketTime * 1000).toISOString() : null,
    tradingDate: marketQuoteDate,
    type: 'latest_quote_not_verified_settlement',
  } : null;

  // Deduplicate by exchange-local trading date; a later daily bar for the
  // same session replaces the previous one, with no synthetic observations.
  const uniqueDailyBars = new Map<string, {
    date: string;
    quoteValue: number;
    quoteUnit: string;
    centsPerBushel: number;
    usdPerMT: number;
    isProvisional: boolean;
  }>();

  timestamps.forEach((timestamp, index) => {
    const rawVal = quotes[index];
    if (!Number.isFinite(timestamp) || timestamp <= 0 ||
        typeof rawVal !== 'number' || !Number.isFinite(rawVal) || rawVal <= 0) return;
    const date = tradingDate(timestamp);
    const quotedPrice = Number(rawVal.toFixed(2));
    uniqueDailyBars.set(date, {
      date,
      quoteValue: quotedPrice,
      quoteUnit,
      // DEPRECATED alias retained for current RMS frontend compatibility.
      // For oil/sugar this is cents/lb, NOT cents/bushel. Use quoteValue/unit.
      centsPerBushel: quotedPrice,
      usdPerMT: toUsdPerMt(rawVal),
      isProvisional: date === marketQuoteDate,
    });
  });

  const priceData = Array.from(uniqueDailyBars.values())
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    success: true,
    commodity: cleanId,
    symbol: `${symbol} (${config.name})`,
    timeframe,
    range: yahooRange,
    source: `${exchange} / Yahoo Finance`,
    exchange,
    provider: 'Yahoo Finance',
    quoteUnit,
    priceUnit: 'USD/MT',
    fetchedAt: new Date().toISOString(),
    latestMarketQuote,
    historicalDataType: 'Yahoo daily bars; settlement status not independently verified',
    contractSeries: {
      ticker: symbol,
      type: 'Yahoo generic futures symbol',
      rolloverVerified: false,
      // To verify historical rollover, explicit dated futures-contract data is needed.
    },
    data: priceData,
  };
}

// Startup Data Integrity check for Tapioca Starch
try {
  const cachePath = path.join(process.cwd(), 'src/data/cache_tapioca.json');
  if (fs.existsSync(cachePath)) {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const json = JSON.parse(raw);
    const point2022 = json?.weeklyPrices?.find((p: any) => p.date === '2022-02-08');
    if (point2022 && point2022.price === 490) {
      console.log('[DATA INTEGRITY CHECK] Sample point 2022-02-08: $490.00 USD/MT (PASS)');
    } else {
      console.warn(`[DATA INTEGRITY CHECK] Sample point 2022-02-08: Expected $490.00, got $${point2022?.price} USD/MT (FAIL)`);
    }
  }
} catch (e) {
  console.warn('[DATA INTEGRITY CHECK] Verification error:', e);
}

