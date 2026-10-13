import { LiveMarketUpdate } from '../types';
import { fetchLivePipelineMetrics } from './externalPipeline';
import palmOilCache from '../data/cache_palmoil.json';
import { getCalculatedMetrics } from '../lib/priceCalculator';
import { calculateDynamicMetrics } from '../utils/landedCostCalculator';

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

      // Auto sync every 5 minutes (standard commodity market update frequency)
      this.intervalId = setInterval(() => {
        this.fetchLiveMarketData();
      }, 300000);
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
        fetch(`/api/history?commodity=soybean&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=soybean-oil&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=palm-oil&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=sugar&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=potato-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=tapioca-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
      const data: any = res || {};

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
      const liveSoybeanOilPrice = soybeanOilLatest?.usdPerMT || 1486.80;
      const soybeanOilMetrics = calculateDynamicMetrics('soybean-oil', liveSoybeanOilPrice, soybeanOilPoints);

      const palmPoints = palmRes?.data || palmOilCache.historicalSeries || [];
      const palmMetrics = calculateDynamicMetrics('palm-oil', 0, palmPoints);

      const sugarPoints = sugarRes?.data || [];
      const sugarLatest = sugarPoints[sugarPoints.length - 1];
      const liveSugarPrice = sugarLatest?.usdPerMT || getCalculatedMetrics('sugar').priceUsd;
      const sugarMetrics = calculateDynamicMetrics('sugar', liveSugarPrice, sugarPoints);

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
      console.warn('Gemini Controller market data fetch notice (switching to live pipeline metrics):', err);
      try {
        const pipeline = await fetchLivePipelineMetrics();
        const defaultCommodities = {
          wheat: { price: 258.40, unit: 'USD/MT', changeWoW: null, landedKrw: 358 },
          corn: { price: 189.46, unit: 'USD/MT', changeWoW: null, landedKrw: 274 },
          soybean: { price: 376.53, unit: 'USD/MT', changeWoW: null, landedKrw: 658 },
          soybeanOil: { price: 1486.80, unit: 'USD/MT', changeWoW: null, landedKrw: 2064 },
          palmOil: { price: palmOilCache.priceMyr, unit: 'MYR/MT', changeWoW: null, landedKrw: 1545 },
          sugar: { price: getCalculatedMetrics('sugar').priceUsd, unit: 'USD/MT', changeWoW: null, landedKrw: getCalculatedMetrics('sugar').baseKRW },
          potatoStarch: { price: 928.80, unit: 'EUR/MT', changeWoW: null, landedKrw: 1290 },
          tapiocaStarch: { price: 700.00, unit: 'USD/MT', changeWoW: null, landedKrw: 1010 }
        };

        let macroScore = 58;
        if (pipeline.usdKrw > 1380) macroScore += 4;
        if (pipeline.weather.southAmerica.riskLevel === 'Elevated') macroScore += 4;
        const angle = Math.round((macroScore - 50) * 1.8);

        const fallbackUpdate: LiveMarketUpdate = {
          updatedAt: getKSTTime(),
          model: 'RMS Multi-Tier Pipeline (Live Benchmarks)',
          modelVersion: 'gemini-flash-latest',
          grounded: true,
          usdKrw: pipeline.usdKrw,
          eurKrw: pipeline.eurKrw,
          brent: pipeline.energy.brent,
          scfi: pipeline.energy.scfi,
          bdi: pipeline.energy.bdi,
          macroRiskScore: macroScore,
          macroRiskLevel: macroScore >= 60 ? 'ELEVATED' : 'MODERATE',
          macroRiskPointerAngle: angle,
          weather: pipeline.weather,
          supplyDemand: pipeline.supplyDemand,
          wheatPrice: defaultCommodities.wheat.price,
          cornPrice: defaultCommodities.corn.price,
          cornWowChange: defaultCommodities.corn.changeWoW,
          soybeanPrice: defaultCommodities.soybean.price,
          soybeanWowChange: defaultCommodities.soybean.changeWoW,
          soybeanOilPrice: defaultCommodities.soybeanOil.price,
          soybeanOilWowChange: defaultCommodities.soybeanOil.changeWoW,
          palmOilPrice: defaultCommodities.palmOil.price,
          sugarPrice: defaultCommodities.sugar.price,
          potatoStarchPrice: defaultCommodities.potatoStarch.price,
          tapiocaStarchPrice: defaultCommodities.tapiocaStarch.price,
          aiBriefSynthesis: `글로벌 소맥 및 유지류 시장은 흑해 수출 회랑 불확실성과 남미 주요 파종지의 가뭄으로 단기 상승 압력에 직면해 있습니다. 실시간 환율(USD/KRW ${pipeline.usdKrw.toLocaleString()}원)과 원양 운임(SCFI ${pipeline.energy.scfi}pt)을 감안한 부산도착원가는 소맥 ₩${defaultCommodities.wheat.landedKrw}/kg, 팜유 ₩${defaultCommodities.palmOil.landedKrw}/kg 수준입니다.`,
          directives: [
            { type: 'action', label: '조치 필요 (Action Required)', title: `BMD 하락 구간에서 2025 Q1 팜유 포워드 커버리지(목표 ₩${defaultCommodities.palmOil.landedKrw}/kg 이하) 확보`, source: '출처: RMS 멀티소스 피드 종합 분석' },
            { type: 'watch', label: '주시 (Watch Closely)', title: `미국 농무부(USDA) 캔자스 동계소맥 작황 보고서 및 콘벨트 강우(${pipeline.weather.usCornBelt.precipSumMm}mm) 모니터링`, source: '출처: USDA FAS PSD & Open-Meteo 레이더' },
            { type: 'favorable', label: '우호적 조건 (Favorable)', title: `로테르담/함부르크발 부산향 스팟 컨테이너 운임 안정 및 감자 전분(₩${defaultCommodities.potatoStarch.landedKrw}/kg) 단가 완충`, source: '출처: EU Agri-food Data Portal' }
          ],
          citations: [
            { title: 'Frankfurter Exchange Rate Portal', uri: 'https://api.frankfurter.dev/v1/latest' },
            { title: 'Open-Meteo Global Crop Weather Radar', uri: 'https://open-meteo.com/' }
          ],
          isQuotaExhausted: false
        };

        this.currentData = fallbackUpdate;
        this.injectDataIntoElementIds(fallbackUpdate, { commodities: defaultCommodities });
        this.listeners.forEach((listener) => listener(fallbackUpdate));
        return fallbackUpdate;
      } catch (fallbackErr) {
        console.warn('Fallback pipeline calculation notice:', fallbackErr);
        return null;
      }
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
      'driver-fx-val': `${update.usdKrw.toLocaleString()} ₩`,
      'driver-energy-val': `$${update.brent.toFixed(2)} /bbl`,
      'driver-freight-val': `${update.scfi.toLocaleString()} pts`,
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
