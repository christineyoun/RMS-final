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

  public async getSoybeanOilOriginRadar(force: boolean = false): Promise<OriginRadarResponse> {
    return loadAll8OriginRadar('soybean-oil',force);
  }
}

export const originRadarService = OriginRadarService.getInstance();
