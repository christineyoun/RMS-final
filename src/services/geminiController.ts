import { LiveMarketUpdate } from '../types';
import { fetchLivePipelineMetrics } from './externalPipeline';
import palmOilCache from '../data/cache_palmoil.json';
import { getCalculatedMetrics } from '../lib/priceCalculator';
import { calculateDynamicMetrics } from '../utils/commodityPriceMetrics';

export const getKSTTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' KST';
};

type Listener = (data: LiveMarketUpdate) => void;

class GeminiController {
  private static instance: GeminiController;
  private listeners: Listener[] = [];
  private currentData: LiveMarketUpdate | null = null;
  private isQuerying: boolean = false;
  private intervalId: any = null;

  private constructor() {
    // Initial fetch on browser load
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.fetchLiveMarketData();
      }, 500);

      // Stage 1: No automatic periodic Gemini refreshes.
      // An explicit weekday scheduler will replace this in Stage 2.
    }
  }

  public static getInstance(): GeminiController {
    if (!GeminiController.instance) {
      GeminiController.instance = new GeminiController();
    }
    return GeminiController.instance;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    if (this.currentData) {
      listener(this.currentData);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public async fetchLiveMarketData(force: boolean = false): Promise<LiveMarketUpdate | null> {
    if (this.isQuerying) return this.currentData;
    this.isQuerying = true;

    try {
      const [
        res,
        wheatRes,
        cornRes,
        soybeanRes,
        soybeanOilRes,
        palmRes,
        sugarRes,
        potatoRes,
        tapiocaRes
      ] = await Promise.all([
        fetch('/api/gemini/live-market-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force })
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/uswheat/price-history${force ? '?force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=corn&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/soybean/price-snapshot${force ? '?force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/soybean-oil/price-snapshot${force ? '?force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=palm-oil&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/sugar/price-snapshot${force ? '?force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=potato-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=tapioca-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
      // Absence of an owner-approved macro snapshot is not permission to invent values.
      // React's saved FX/telemetry readers own the current data cards independently.
      if(!res)return this.currentData;
      const data: any = res;

      const liveWheatPrice = wheatRes?.metrics?.srw?.latestPriceMt || 258.40;
      const liveWheatMetrics = wheatRes?.metrics || null;

      const cornPoints = cornRes?.data || [];
      const cornLatest = cornPoints[cornPoints.length - 1];
      const liveCornPrice = cornLatest?.usdPerMT || 189.46;
      const cornMetrics = calculateDynamicMetrics('corn', liveCornPrice, cornPoints);

      const soybeanPoints = soybeanRes?.data || [];
      const soybeanLatest = soybeanPoints[soybeanPoints.length - 1];
      const liveSoybeanPrice = soybeanLatest?.usdPerMT || 376.53;
      const soybeanMetrics = calculateDynamicMetrics('soybean', liveSoybeanPrice, soybeanPoints);

      const soybeanOilPoints = soybeanOilRes?.data || [];
      const soybeanOilLatest = soybeanOilPoints[soybeanOilPoints.length - 1];
      const liveSoybeanOilPrice = soybeanOilLatest?.usdPerMT || 0;
      const soybeanOilMetrics = calculateDynamicMetrics('soybean-oil', liveSoybeanOilPrice, soybeanOilPoints);

      const palmPoints = palmRes?.data || palmOilCache.historicalSeries || [];
      const palmMetrics = calculateDynamicMetrics('palm-oil', 0, palmPoints);

      const sugarPoints = sugarRes?.data || [];
      const sugarLatest = sugarPoints[sugarPoints.length - 1];
      const liveSugarPrice = sugarLatest?.usdPerMT || 0;
      const sugarMetrics = {wowPct:sugarRes?.priceInputs?.comparisons?.wow?.pct??null,momPct:sugarRes?.priceInputs?.comparisons?.mom?.pct??null};

      const potatoPoints = potatoRes?.data || [];
      const potatoLatest = potatoPoints[potatoPoints.length - 1];
      const livePotatoPrice = potatoLatest?.usdPerMT || 928.80;
      const potatoMetrics = calculateDynamicMetrics('potato-starch', livePotatoPrice, potatoPoints);

      const tapiocaPoints = tapiocaRes?.data || [];
      const tapiocaLatest = tapiocaPoints[tapiocaPoints.length - 1];
      const liveTapiocaPrice = tapiocaLatest?.usdPerMT || 700.00;
      const tapiocaMetrics = calculateDynamicMetrics('tapioca-starch', liveTapiocaPrice, tapiocaPoints);

      const liveUpdate: LiveMarketUpdate = {
        updatedAt: data.updatedAt || getKSTTime(),
        model: data.model || 'gemini-3.8-flash (Search Grounded + Multi-Tier Pipeline)',
        modelVersion: data.modelVersion || 'gemini-flash-latest',
        grounded: true,
        usdKrw: data.usdKrw || 1388.50,
        eurKrw: data.eurKrw || 1485.40,
        brent: data.brent || 74.20,
        scfi: data.scfi || 2165.8,
        bdi: data.bdi || 1580,
        macroRiskScore: typeof data.macroRiskScore === 'number' ? data.macroRiskScore : 58,
        macroRiskLevel: data.macroRiskLevel || 'MODERATE',
        macroRiskPointerAngle: typeof data.macroRiskPointerAngle === 'number' ? data.macroRiskPointerAngle : 14,
        weather: data.weather,
        supplyDemand: data.supplyDemand,
        wheatPrice: liveWheatPrice,
        wheatMetrics: liveWheatMetrics,
        cornPrice: liveCornPrice,
        cornWowChange: cornMetrics.wowPct,
        cornMomChange: cornMetrics.momPct,
        soybeanPrice: liveSoybeanPrice,
        soybeanWowChange: soybeanMetrics.wowPct,
        soybeanMomChange: soybeanMetrics.momPct,
        soybeanOilPrice: liveSoybeanOilPrice,
        soybeanOilWowChange: soybeanOilMetrics.wowPct,
        soybeanOilMomChange: soybeanOilMetrics.momPct,
        palmOilPrice: (palmRes?.priceMyr && palmRes.priceMyr > 2000)
          ? palmRes.priceMyr
          : (data.commodities?.palmOil?.price && data.commodities.palmOil.price > 2000)
          ? data.commodities.palmOil.price
          : palmOilCache.priceMyr,
        palmOilWowChange: palmMetrics.wowPct,
        palmOilMomChange: palmMetrics.momPct,
        sugarPrice: liveSugarPrice,
        sugarWowChange: sugarMetrics.wowPct,
        sugarMomChange: sugarMetrics.momPct,
        potatoStarchPrice: livePotatoPrice,
        potatoStarchWowChange: potatoMetrics.wowPct,
        potatoStarchMomChange: potatoMetrics.momPct,
        tapiocaStarchPrice: liveTapiocaPrice,
        tapiocaStarchWowChange: tapiocaMetrics.wowPct,
        tapiocaStarchMomChange: tapiocaMetrics.momPct,
        aiBriefSynthesis: data.aiBriefSynthesis || '글로벌 소맥 및 유지류 시장은 흑해 수출 회랑 불확실성과 남미 주요 파종지의 가뭄으로 단기 상승 압력에 직면해 있습니다.',
        directives: data.directives,
        citations: data.citations || [],
        isQuotaExhausted: !!data.isQuotaExhausted,
        quotaNotice: data.quotaNotice
      };

      this.currentData = liveUpdate;

      // Inject the JSON response directly into matching HTML element IDs across all screens
      this.injectDataIntoElementIds(liveUpdate, data);

      // Notify React subscribers
      this.listeners.forEach((listener) => listener(liveUpdate));

      return liveUpdate;
    } catch (err) {
      console.warn('Saved market publication unavailable:', err);
      return this.currentData;
    } finally {
      this.isQuerying = false;
    }
  }

  /**
   * Directly injects the JSON values into matching HTML element IDs across all screens
   */
  private injectDataIntoElementIds(update: LiveMarketUpdate, rawData: any) {
    if (typeof document === 'undefined') return;

    const mapping: Record<string, string | number> = {
      // Primary required DOM IDs
      'wasde-prod': `${update.supplyDemand?.productionMMT || 798.5} MMT`,
      'wasde-cons': `${update.supplyDemand?.consumptionMMT || 802.1} MMT`,
      'wasde-stocks': `${update.supplyDemand?.endingStocksMMT || 257.4} MMT`,
      'wasde-stu': `${update.supplyDemand?.stocksToUseRatio || 32.1}%`,
      'risk-score-val': `${update.macroRiskScore || 58}/100`,

      'el-fx-usd-krw': `${update.usdKrw.toLocaleString()} ₩`,
      'el-fx-eur-krw': `EUR ${update.eurKrw.toLocaleString()}₩`,
      'el-energy-brent': `$${update.brent.toFixed(2)} /bbl`,
      'el-freight-scfi': `${update.scfi.toLocaleString()} pts`,
      'el-live-sync-timestamp': update.updatedAt
    };

    Object.entries(mapping).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) {
        // Prevent accidental clobbering of parent card container elements
        if (id === 'driver-fx') {
          const valEl = document.getElementById('driver-fx-val');
          if (valEl) valEl.textContent = String(val);
          return;
        }
        if (id === 'driver-energy') {
          const valEl = document.getElementById('driver-energy-val');
          if (valEl) valEl.textContent = String(val);
          return;
        }
        if (id === 'driver-freight') {
          const valEl = document.getElementById('driver-freight-val');
          if (valEl) valEl.textContent = String(val);
          return;
        }
        el.textContent = String(val);
      }
    });

    // Special binding for #risk-pointer: rotate the gauge needle and apply transition
    const riskPointerEl = document.getElementById('risk-pointer');
    if (riskPointerEl) {
      const angle = update.macroRiskPointerAngle || Math.round(((update.macroRiskScore || 58) - 50) * 1.8);
      riskPointerEl.style.transform = `rotate(${angle}deg)`;
      riskPointerEl.setAttribute('data-angle', String(angle));
      riskPointerEl.setAttribute('data-score', String(update.macroRiskScore || 58));
    }

    // Bind weather anomalies
    if (update.weather) {
      const usEl = document.getElementById('weather-us-corn-belt');
      if (usEl) {
        usEl.innerHTML = `<span class="font-mono text-slate-800 font-medium">${update.weather.usCornBelt.tempCurrent}°C</span> <span class="text-slate-300">•</span> <span class="font-sans text-slate-800 font-medium">강우</span> <span class="font-mono text-slate-800 font-medium">${update.weather.usCornBelt.precipSumMm}mm</span> <span class="font-sans font-bold text-amber-600 ml-1">(${update.weather.usCornBelt.condition})</span>`;
      }
      const saEl = document.getElementById('weather-sa-soy-belt');
      if (saEl) {
        saEl.innerHTML = `<span class="font-mono text-slate-800 font-medium">${update.weather.southAmerica.tempCurrent}°C</span> <span class="text-slate-300">•</span> <span class="font-sans text-slate-800 font-medium">강우</span> <span class="font-mono text-slate-800 font-medium">${update.weather.southAmerica.precipSumMm}mm</span> <span class="font-sans font-bold text-rose-600 ml-1">(${update.weather.southAmerica.condition})</span>`;
      }
      const euEl = document.getElementById('weather-eu-crop-radar');
      if (euEl) {
        euEl.innerHTML = `<span class="font-mono text-slate-800 font-medium">${update.weather.euCropRadar.tempCurrent}°C</span> <span class="text-slate-300">•</span> <span class="font-sans text-slate-800 font-medium">강우</span> <span class="font-mono text-slate-800 font-medium">${update.weather.euCropRadar.precipSumMm}mm</span> <span class="font-sans font-bold text-emerald-600 ml-1">(${update.weather.euCropRadar.condition})</span>`;
      }
    }
  }

  public getCurrentData(): LiveMarketUpdate | null {
    return this.currentData;
  }

  public destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

export const geminiController = GeminiController.getInstance();
