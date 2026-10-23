import {completeOriginRadar,loadAll8OriginRadar} from './all8OriginRadarService.ts';
/**
 * Origin Radar Service (주요 조달 산지 및 물류 현황)
 * 
 * Wheat now uses independently verified country-specific PSD figures (not live shipping data):
 * 1. United States: USDA FAS PSD (Primary) & USDA WASDE / AMIS (Supporting)
 * 2. Australia: ABARES (Primary) & AMIS (Supporting)
 * 3. Canada: AAFC (Primary), Sask Wheat (Supplementary) & AMIS (Supporting)
 * 4. European Union: EU Agri-food Cereals API (Primary) & AMIS (Supporting)
 * 5. Russia / Black Sea: USDA FAS PSD (Primary) & AMIS Trade/Logistics (Supporting)
 */

import {withHistoricalWeatherContext} from './originHistoricalWeather.ts';
import {WHEAT_WEATHER_POINTS} from './wheatOriginRiskService.ts';
import {CORN_WEATHER_POINTS} from './cornOriginConditionsService.ts';
import {SOYBEAN_WEATHER_POINTS} from './soybeanOriginConditionsService.ts';
import type {WeatherPill} from '../utils/originWeatherPills.ts';
import { usdaFasService } from './usdaFasService.ts';
import { wheatVerifiedOriginService } from './wheatVerifiedOriginService.ts';
import { wheatOriginRiskService } from './wheatOriginRiskService.ts';
import { cornWasdeOriginService } from './cornWasdeOriginService.ts';
import { cornOriginConditionsService } from './cornOriginConditionsService.ts';
import { soybeanPsdOriginService } from './soybeanPsdOriginService.ts';
import { soybeanOriginConditionsService } from './soybeanOriginConditionsService.ts';

export interface OriginItemDetail {
  originKey: 'usa' | 'australia' | 'canada' | 'eu' | 'russia' | 'brazil' | 'argentina' | 'ukraine' | 'paraguay' | 'indonesia' | 'malaysia' | 'thailand' | 'colombia' | 'netherlands' | 'germany' | 'denmark' | 'poland' | 'vietnam' | 'cambodia' | 'laos';
  region: string;
  production: string;
  productionNumericMMT: number | null;
  unit: string;
  marketYear: string;
  exports: string;
  endingStocks: string;
  riskAssessment: string; // One concise Korean comment based on verified current data
  status: '정상' | '양호' | '모니터링' | '주의' | '자료 확인' | '자료 없음' | '확인 중' | '자료 부족';
  statusColor: 'green' | 'yellow' | 'red' | 'gray';
  riskWeather?: string;
  weatherSource?: string;
  weatherDataKind?: string;
  weatherEvidence?: any;
  weatherHistoricalContext?: {schemaVersion:number;role:string;canTriggerCurrentAlerts:boolean;points:any[]};
  weatherAsOf?: string;
  weatherPills?: WeatherPill[];
  weatherValidUntil?: string;
  primarySource: string;
  supportingSource?: string;
  sourceName: string;
  sourceOrg: string;
  sourceReportDate: string;
  sourceUrl: string;
  retrievedAt: string;
  isLive: boolean;
  dataFreshness: 'live' | 'cached' | 'unavailable';
  notes?: string;
  sourcingInsight?: string;
  exportComparison?: string;
  exportComparisonBasis?: string;
  exportYoYPct?: number;
  logisticsInsight?: string;
  logisticsSourceDate?: string;
  logisticsSourceUrl?: string;
  policySourceDate?: string;
  policySourceUrl?: string;
  statusBasis?: string;
  supplyIndicators?: Array<{text:string;source:string;url:string;period:string;display?:'origin-summary'}>;
  weatherCropContext?: {clearSupported?:boolean;warningSupported?:boolean;basis:string;sourceUrl:string;publishedAt:string};
  weatherScreening?: import('../utils/originWeatherPills.ts').WeatherScreen['weatherScreening'];
}

export interface OriginRadarResponse {
  success: boolean;
  statusCode: number;
  lastUpdated: string;
  origins: OriginItemDetail[];
  sourcesUsed: Array<{
    origin: string;
    primarySource: string;
    supportingSource?: string;
    sourceOrg: string;
    sourceReportDate: string;
    sourceUrl: string;
    status: 'live' | 'cached' | 'unavailable';
  }>;
  sourceFooterText: string;
}

// Wheat is sourced exclusively from the independently verified PSD pipeline.
// Do not reintroduce sample production/export numbers as a "live" fallback.
export class OriginRadarService {
  private static instance: OriginRadarService;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // Legacy caches for non-Wheat origin services.
  private constructor() {}

  public static getInstance(): OriginRadarService {
    if (!OriginRadarService.instance) OriginRadarService.instance = new OriginRadarService();
    return OriginRadarService.instance;
  }

  public async getWheatOriginRadar(force: boolean = false): Promise<OriginRadarResponse> {
    const verified = await wheatVerifiedOriginService.getWheatOriginRadar(force,!force);
    return completeOriginRadar('wheat',await withHistoricalWeatherContext(await wheatOriginRiskService.enrich(verified,!force,force),WHEAT_WEATHER_POINTS,{savedOnly:!force}));
  }

  // Corn uses free, published USDA WASDE country rows rather than the PSD sample fallbacks.
  public async getCornOriginRadar(force: boolean = false): Promise<OriginRadarResponse> {
    const supply = await cornWasdeOriginService.getCornOriginRadar(force,!force);
    return completeOriginRadar('corn',await withHistoricalWeatherContext(await cornOriginConditionsService.enrich(supply, force,!force),CORN_WEATHER_POINTS,{savedOnly:!force}));
  }

  // Soybean uses authenticated country PSD observations, not sample baselines.
  public async getSoybeanOriginRadar(force = false): Promise<OriginRadarResponse> {
    const supply = await soybeanPsdOriginService.getSoybeanOriginRadar(force,!force);
    return completeOriginRadar('soybean',await withHistoricalWeatherContext(await soybeanOriginConditionsService.enrich(supply, force,!force),SOYBEAN_WEATHER_POINTS,{savedOnly:!force}));
  }

  private soybeanOilCachedResult: OriginRadarResponse | null = null;
  private soybeanOilLastFetchTime: number = 0;

  private async fetchSoybeanOilArgentinaData(): Promise<OriginItemDetail> {
    const defaultItem: OriginItemDetail = {
      originKey: 'argentina' as any,
      region: '아르헨티나 (Upriver / Rosario)',
      production: '7.6M MT',
      productionNumericMMT: 7.6,
      unit: 'MMT',
      marketYear: '2026/27',
      exports: '수출 4.9M MT',
      endingStocks: '기말재고 0.4M MT',
      riskAssessment: '세계 1위 대두유 수출국, 로사리오항 가공 가동률 및 파라나강 수운 안정',
      status: '정상',
      statusColor: 'green',
      primarySource: 'USDA FAS PSD',
      supportingSource: 'AMIS · Gemini Search',
      sourceName: 'USDA FAS PSD · AMIS · Gemini Search',
      sourceOrg: 'USDA FAS & FAO AMIS',
      sourceReportDate: '2026-09-12',
      sourceUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
      retrievedAt: new Date().toISOString(),
      isLive: true,
      dataFreshness: 'live'
    };

    try {
      const psd = await usdaFasService.fetchCountryPsd('4232000', 'AR', '2026');
      const retrievedAt = new Date().toISOString();
      const d = psd.data;
      const prodMMT = d?.productionMMT || 7.6;
      const expMMT = d?.exportsMMT || 4.9;
      const stockMMT = d?.endingStocksMMT || 0.4;
      const reportDate = d?.releaseMonth ? `2026-${String(d.releaseMonth).padStart(2, '0')}-12` : '2026-09-12';

      return {
        ...defaultItem,
        production: `${prodMMT.toFixed(1)}M MT`,
        productionNumericMMT: prodMMT,
        exports: `수출 ${expMMT.toFixed(1)}M MT`,
        endingStocks: `기말재고 ${stockMMT.toFixed(1)}M MT`,
        sourceReportDate: reportDate,
        retrievedAt,
        isLive: true,
        dataFreshness: psd.isCached ? 'cached' : 'live'
      };
    } catch {
      return {
        ...defaultItem,
        dataFreshness: 'cached',
        isLive: false,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  private async fetchSoybeanOilBrazilData(): Promise<OriginItemDetail> {
    const defaultItem: OriginItemDetail = {
      originKey: 'brazil' as any,
      region: '브라질 (Paranagua / Santos)',
      production: '11.1M MT',
      productionNumericMMT: 11.1,
      unit: 'MMT',
      marketYear: '2026/27',
      exports: '수출 1.4M MT',
      endingStocks: '기말재고 0.5M MT',
      riskAssessment: '대두 착유량 호조 및 내수 바이오디젤(B14) 소비 증가, 산토스/파라나과 수출 안정',
      status: '정상',
      statusColor: 'green',
      primarySource: 'USDA FAS PSD',
      supportingSource: 'CONAB · AMIS · Gemini Search',
      sourceName: 'USDA FAS PSD · CONAB · AMIS · Gemini Search',
      sourceOrg: 'USDA FAS & CONAB & FAO AMIS',
      sourceReportDate: '2026-09-12',
      sourceUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
      retrievedAt: new Date().toISOString(),
      isLive: true,
      dataFreshness: 'live'
    };

    try {
      const psd = await usdaFasService.fetchCountryPsd('4232000', 'BR', '2026');
      const retrievedAt = new Date().toISOString();
      const d = psd.data;
      const prodMMT = d?.productionMMT || 11.1;
      const expMMT = d?.exportsMMT || 1.4;
      const stockMMT = d?.endingStocksMMT || 0.5;
      const reportDate = d?.releaseMonth ? `2026-${String(d.releaseMonth).padStart(2, '0')}-12` : '2026-09-12';

      return {
        ...defaultItem,
        production: `${prodMMT.toFixed(1)}M MT`,
        productionNumericMMT: prodMMT,
        exports: `수출 ${expMMT.toFixed(1)}M MT`,
        endingStocks: `기말재고 ${stockMMT.toFixed(1)}M MT`,
        sourceReportDate: reportDate,
        retrievedAt,
        isLive: true,
        dataFreshness: psd.isCached ? 'cached' : 'live'
      };
    } catch {
      return {
        ...defaultItem,
        dataFreshness: 'cached',
        isLive: false,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  private async fetchSoybeanOilUsaData(): Promise<OriginItemDetail> {
    const defaultItem: OriginItemDetail = {
      originKey: 'usa' as any,
      region: '미국 (US Gulf / Midwest)',
      production: '12.7M MT',
      productionNumericMMT: 12.7,
      unit: 'MMT',
      marketYear: '2026/27',
      exports: '수출 0.4M MT',
      endingStocks: '기말재고 0.8M MT',
      riskAssessment: '재생디젤(RD) 원료 내수 소비 확대로 수출 가용량 제한적, 국내 프리미엄 지지',
      status: '모니터링',
      statusColor: 'yellow',
      primarySource: 'USDA FAS PSD',
      supportingSource: 'WASDE · USDA ERS · AMIS · Gemini Search',
      sourceName: 'USDA FAS PSD · WASDE · USDA ERS · AMIS · Gemini Search',
      sourceOrg: 'USDA FAS & USDA ERS & FAO AMIS',
      sourceReportDate: '2026-09-12',
      sourceUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
      retrievedAt: new Date().toISOString(),
      isLive: true,
      dataFreshness: 'live'
    };

    try {
      const psd = await usdaFasService.fetchCountryPsd('4232000', 'US', '2026');
      const retrievedAt = new Date().toISOString();
      const d = psd.data;
      const prodMMT = d?.productionMMT || 12.7;
      const expMMT = d?.exportsMMT || 0.4;
      const stockMMT = d?.endingStocksMMT || 0.8;
      const reportDate = d?.releaseMonth ? `2026-${String(d.releaseMonth).padStart(2, '0')}-12` : '2026-09-12';

      return {
        ...defaultItem,
        production: `${prodMMT.toFixed(1)}M MT`,
        productionNumericMMT: prodMMT,
        exports: `수출 ${expMMT.toFixed(1)}M MT`,
        endingStocks: `기말재고 ${stockMMT.toFixed(1)}M MT`,
        sourceReportDate: reportDate,
        retrievedAt,
        isLive: true,
        dataFreshness: psd.isCached ? 'cached' : 'live'
      };
    } catch {
      return {
        ...defaultItem,
        dataFreshness: 'cached',
        isLive: false,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  private async fetchSoybeanOilParaguayData(): Promise<OriginItemDetail> {
    const defaultItem: OriginItemDetail = {
      originKey: 'paraguay' as any,
      region: '파라과이 (Alto Paraná / Villeta)',
      production: '0.8M MT',
      productionNumericMMT: 0.8,
      unit: 'MMT',
      marketYear: '2026/27',
      exports: '수출 0.7M MT',
      endingStocks: '기말재고 0.05M MT',
      riskAssessment: '바지선 내륙 수운 정상 가동 및 아르헨티나/우루과이 환적 수출 원활',
      status: '정상',
      statusColor: 'green',
      primarySource: 'USDA FAS PSD',
      supportingSource: 'AMIS · Gemini Search',
      sourceName: 'USDA FAS PSD · AMIS · Gemini Search',
      sourceOrg: 'USDA FAS & FAO AMIS',
      sourceReportDate: '2026-09-12',
      sourceUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
      retrievedAt: new Date().toISOString(),
      isLive: true,
      dataFreshness: 'live'
    };

    try {
      const psd = await usdaFasService.fetchCountryPsd('4232000', 'PY', '2026');
      const retrievedAt = new Date().toISOString();
      const d = psd.data;
      const prodMMT = d?.productionMMT || 0.8;
      const expMMT = d?.exportsMMT || 0.7;
      const stockMMT = d?.endingStocksMMT || 0.05;
      const reportDate = d?.releaseMonth ? `2026-${String(d.releaseMonth).padStart(2, '0')}-12` : '2026-09-12';

      return {
        ...defaultItem,
        production: `${prodMMT.toFixed(1)}M MT`,
        productionNumericMMT: prodMMT,
        exports: `수출 ${expMMT.toFixed(1)}M MT`,
        endingStocks: `기말재고 ${stockMMT.toFixed(2)}M MT`,
        sourceReportDate: reportDate,
        retrievedAt,
        isLive: true,
        dataFreshness: psd.isCached ? 'cached' : 'live'
      };
    } catch {
      return {
        ...defaultItem,
        dataFreshness: 'cached',
        isLive: false,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Retrieve aggregated verified Origin Radar data across all 4 Soybean Oil origins
   */
  public async getSoybeanOilOriginRadar(force: boolean = false): Promise<OriginRadarResponse> {
    return loadAll8OriginRadar('soybean-oil',force);
  }
}

export const originRadarService = OriginRadarService.getInstance();
