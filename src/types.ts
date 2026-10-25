import type {PotatoExportQuoteResponse} from './server/officialPotatoComextService';
import type {SugarPriceSnapshot} from './utils/sugarPriceSnapshot';
import type {SoybeanOilPriceSnapshot} from './utils/soybeanOilPriceSnapshot';
import type { SoybeanPriceSnapshot, DatedDisplayFx } from './utils/soybeanPriceSnapshot';
export type CommodityCategory = 'grain' | 'oils' | 'starches' | 'sweeteners';

export type Currency = 'KRW' | 'USD' | 'EUR';

export type CommodityId =
  | 'wheat'
  | 'corn'
  | 'soybean'
  | 'soybean-oil'
  | 'palm-oil'
  | 'sugar'
  | 'potato-starch'
  | 'tapioca-starch';

export interface WasdeKpi {
  value: string;
  unit: string;
  diff?: string;
  outlook?: string;
}

export interface OriginRoute {
  region: string;
  production: string;
  yoy?: string;
  exports: string;
  endingStocks: string;
  riskAssessment: string;
  riskLevel?: 'Low' | 'Medium' | 'High';
  isYoyPositive?: boolean;
  status?: string;
  statusColor?: string;
  sourceName?: string;
  sourceUrl?: string;
}

export interface Commodity {
  id: CommodityId | string;
  nameKo: string;
  nameEn: string;
  ticker: string;
  category: CommodityCategory;
  gradeEn: string;
  description?: string;
  price: number;
  unit: string;
  changeWoW?: number | null;


  _potatoExportQuote?: PotatoExportQuoteResponse;
  _canonicalDisplayCurrency?: Currency;
  _canonicalDisplayFx?: DatedDisplayFx | null;
  _sugarPriceSnapshot?: SugarPriceSnapshot;
  _soybeanOilPriceSnapshot?: SoybeanOilPriceSnapshot;
  _soybeanPriceSnapshot?: SoybeanPriceSnapshot;
  _soybeanDisplayFx?: DatedDisplayFx | null;
  _originalPrice?: number;
  _originalUnit?: string;
  _canonicalQuoteDate?: string;
  _canonicalQuoteSource?: string;
  _canonicalWowUsdMt?: number | null;
  _canonicalMomUsdMt?: number | null;
  sparkline?: number[];
  sparklineHistory?: Array<{ usdPerMT?: number; price?: number; date?: string } | number>;
  aiSynthesis?: string;
  recommendedCoverage?: string;

  wasdeKpis?: {
    production?: WasdeKpi;
    consumption?: WasdeKpi;
    endingStocks?: WasdeKpi;
    trade?: WasdeKpi;
  };
  originsLedger?: OriginRoute[];
  wasdeLedger?: any[];

  path?: string;
  categoryNameKo?: string;
  priceKrwEstimated?: number;
  changeMoM?: number | null;
  changeYoY?: number | null;
  _canonicalYoyUsdMt?: number | null;
  _canonicalYoyReferenceDate?: string | null;

  exchange?: string;
  chartData?: Array<{
    date: string;
    cashPrice: number;
    ma50: number;

  }>;
  aiConfidence?: number;
  bullishFactors?: string[];
  bearishFactors?: string[];
  monitoringItems?: string[];
  technicalSignals?: {
    headline: string;
    ma20: number;
    ma20Note: string;
    ma50: number;
    ma50Note: string;
    ma200: number;
    ma200Note: string;
    rsi: number;
    rsiStatus: string;
    macd: number;
    macdStatus: string;
    bollinger: string;
    bollingerStatus: string;
    r2: number;
    r1: number;
    pp: number;
    s1: number;
    s2: number;
    directive: string;
  };
  timelineEvents?: Array<{
    date: string;
    region: string;
    source: string;
    title: string;
    url: string;
    summary: string;
    importance: 'High' | 'Medium' | 'Low';
    direction: 'Bullish' | 'Bearish' | 'Neutral';
  }>;
}

export interface MacroDriver {
  id: string;
  anchorId: string;
  title: string;
  icon: string;
  change: string;
  isPositiveCostImpact: boolean; // positive for buyers (cost savings) vs cost inflation
  primaryValue: string;
  secondaryValue: string;
  badgeText: string;
  badgeType: 'red' | 'green' | 'amber';
  note: string;
  url?: string;
}

export interface MarketIssue {
  id: string;
  title: string;
  date: string;
  risk: 'High' | 'Med' | 'Low';
  direction: 'Bullish' | 'Bearish';
  source: string;
  url: string;
}

export interface WeatherAnomalyRegion {
  regionName: string;
  location: string;
  tempCurrent: number;
  tempMax: number;
  tempMin: number;
  precipSumMm: number;
  condition: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'Severe';
  cropImpact: string;
}

export interface WeatherTelemetry {
  usCornBelt: WeatherAnomalyRegion;
  southAmerica: WeatherAnomalyRegion;
  euCropRadar: WeatherAnomalyRegion;
}

export interface SupplyDemandBalance {
  productionMMT: number;
  consumptionMMT: number;
  endingStocksMMT: number;
  stocksToUseRatio: number;
  changeYoY: string;
  source: string;
}


export interface UnifiedEndpointMetrics {
  fx: {
    usdKrw: number;
    eurKrw: number;
    date: string;
    source: string;
  };
  weather: WeatherTelemetry;
  supplyDemand: SupplyDemandBalance;
  energy: {
    brent: number;
    naturalGas: number;
    scfi: number;
    bdi: number;
    source: string;
  };
  tradeData: {
    faoFoodPriceIndex: number;
    worldBankAgriIndex: number;
    euCerealBenchmarkEur: number;
  };
}

export interface LiveMarketUpdate {
  updatedAt: string;
  model: string;
  modelVersion?: string;
  grounded: boolean;
  usdKrw: number;
  eurKrw: number;
  brent: number;
  scfi: number;
  bdi?: number;
  wheatPrice: number;
  wheatMetrics?: {
    srw: UsWheatClassMetric;
    hrw: UsWheatClassMetric;
    hrs: UsWheatClassMetric;
    [key: string]: any;
  } | null;
  cornPrice: number;
  cornWowChange?: number;
  cornMomChange?: number;
  soybeanPrice: number;
  soybeanWowChange?: number;
  soybeanMomChange?: number;
  soybeanOilPrice: number;
  soybeanOilWowChange?: number;
  soybeanOilMomChange?: number;
  palmOilPrice: number;
  palmOilWowChange?: number;
  palmOilMomChange?: number;
  sugarPrice: number;
  sugarWowChange?: number;
  sugarMomChange?: number;
  potatoStarchPrice: number;
  potatoStarchWowChange?: number;
  potatoStarchMomChange?: number;
  tapiocaStarchPrice: number;
  tapiocaStarchWowChange?: number;
  tapiocaStarchMomChange?: number;
  aiBriefSynthesis: string;
  directives?: Array<{
    type: 'action' | 'watch' | 'favorable' | string;
    label: string;
    title: string;
    source: string;
  }>;
  macroRiskScore?: number; // 0 - 100
  macroRiskLevel?: 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL';
  macroRiskPointerAngle?: number; // -90 deg to +90 deg

  weather?: WeatherTelemetry;
  supplyDemand?: SupplyDemandBalance;
  citations: Array<{ title: string; uri: string }>;
  isQuotaExhausted?: boolean;
  quotaNotice?: string;
  sourceRegistry?: DataSourceDefinition[];
  normalizedData?: Record<string, NormalizedMarketData>;
  failedSourcesCount?: number;
}

// Central Source Registry Definition
export interface DataSourceDefinition {
  sourceId: string;
  sourceName: string;
  commodity: string;
  dataCategory: 'price' | 'fx' | 'weather' | 'macro' | 'supply-demand' | 'freight';
  updateFrequency: string; // e.g., '15m', '1h', '24h', 'daily'
  updateFrequencyMs: number; // TTL in milliseconds
  endpoint: string;
  authenticationType: 'none' | 'api-key' | 'bearer' | 'basic';
  secretName?: string;
  unit: string;
  sourceUrl: string;
  status?: 'success' | 'stale' | 'failed' | 'idle';
  lastAttemptTime?: string;
  lastSuccessTime?: string;
  errorMessage?: string;
}

// Normalized common internal format requested:
// { commodity, indicator, country, date, value, unit, source, sourceUrl, lastUpdated }
export interface NormalizedMarketData {
  commodity: string;
  indicator: string;
  country: string;
  date: string;
  value: number;
  unit: string;
  source: string;
  sourceUrl: string;
  lastUpdated: string;
  status?: 'success' | 'stale' | 'failed';
  errorMessage?: string;
}

export interface MarketDataSyncPayload {
  lastUpdated: string;
  sources: DataSourceDefinition[];
  normalizedData: Record<string, NormalizedMarketData>;
  failedSourcesCount: number;
  totalSourcesCount: number;
  alerts?: Array<{
    id: string;
    severity: 'high' | 'medium' | 'low';
    title: string;
    message: string;
  }>;
}

// U.S. Wheat Associates Historical Time-Series Types
export interface UsWheatHistoryDataPoint {
  date: string; // ISO date 'YYYY-MM-DD'
  reportDate: string; // e.g. 'September 18, 2026'
  contractMonth: string; // e.g. 'December'
  srwBu: number;
  srwMt: number;
  hrwBu: number;
  hrwMt: number;
  hrsBu: number;
  hrsMt: number;
}

export interface UsWheatClassMetric {
  wheatClass: 'SRW' | 'HRW' | 'HRS';
  classNameKo: string;
  classNameEn: string;
  exchange: string;
  contractMonth: string;
  latestPriceMt: number;
  latestPriceBu: number;
  wowChangeMt: number;
  wowChangeBu: number;
  wowChangePct: number;
  momChangeMt: number;
  momChangeBu: number;
  momChangePct: number;
  wowAvailable?: boolean;
  momAvailable?: boolean;
  wowReferenceDate?: string;
  momReferenceDate?: string;
}




export interface UsWheatPriceHistoryResponse {
  success: boolean;
  statusCode: number;
  source: string;
  sourceUrl: string;
  reportDate: string;
  lastRetrievalTime: string;
  primaryUnit: string;
  secondaryUnit: string;
  count: number;
  data: UsWheatHistoryDataPoint[];
  metrics: {
    srw: UsWheatClassMetric;
    hrw: UsWheatClassMetric;
    hrs: UsWheatClassMetric;
  };

  errorMessage?: string;
  isCached?: boolean;
  latestSourceType?: 'imported-baseline' | 'source-verified';
  sourceStatus?: 'verified' | 'baseline' | 'unavailable';
  sourceLastCheckedAt?: string | null;
  sourceLastVerifiedAt?: string | null;
  sourceError?: string | null;
}


// AMIS Market Monitor Wheat Market Intelligence Types
export interface AmisWheatFindings {
  priceDirection: string;
  productionOutlook: string;
  cropConditions: {
    us: string;
    australia: string;
    canada: string;
  };
  tradeAndLogistics: string;
  weatherRisks: string;
  majorMacroFactors: string;
}

export interface AmisWheatIntelligence {
  issueNumber: number;
  publicationDate: string;
  pdfUrl: string;
  sourcePageUrl: string;
  retrievalTimestamp: string;
  macroRiskSentenceKo: string;
  macroRiskScore: number;
  macroRiskLevel: '안정' | '주의' | '경계';
  findings: AmisWheatFindings;
  rawExcerpt?: string;
}

export interface AmisWheatResponse {
  success: boolean;
  statusCode: number;
  source: string;
  sourceUrl: string;
  data?: AmisWheatIntelligence;
  errorMessage?: string;
  isCached?: boolean;
  isStale?: boolean;
}

// USDA AMS Corn Physical Export & Ocean Freight Types



export interface CornProcurementAnalysisData {
  benchmarkPrice: {
    rawPrice: number;
    rawUnit: string;
    usdPerMT: number;
    observationDate: string;
    source: string;
  };
  weeklyChange: {
    wowPct: number;
    absoluteChangeUsdMt: number;
    direction: 'up' | 'down' | 'unchanged';
    previousPriceUsdMt: number;
    calculationBasis: string;
  };

  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계' | '자료 부족';
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}

// USDA AMS Soybean Physical Export & Ocean Freight Types



export interface SoybeanProcurementAnalysisData {
  benchmarkPrice: {
    rawPrice: number;
    rawUnit: string;
    usdPerMT: number;
    observationDate: string;
    source: string;
  };
  weeklyChange: {
    wowPct: number | null;
    absoluteChangeUsdMt: number | null;
    direction: 'up' | 'down' | 'unchanged' | 'unavailable';
    previousPriceUsdMt: number | null;
    calculationBasis: string;
  };

  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계' | '자료 부족';
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}

// USDA AMS / ERS Soybean Oil Physical Export & Ocean Freight Types



export interface SoybeanOilProcurementAnalysisData {
  supplyReference?: {commodityCode:string;marketYear:string;reportPeriod:string;verifiedAt:string;production1000MT:number;consumption1000MT:number;exports1000MT:number;endingStocks1000MT:number};
  benchmarkPrice: {
    rawPrice: number;
    rawUnit: string;
    usdPerMT: number;
    observationDate: string;
    source: string;
  };
  weeklyChange: {
    wowPct: number | null;
    absoluteChangeUsdMt: number | null;
    direction: 'up' | 'down' | 'unchanged' | 'unavailable';
    previousPriceUsdMt: number | null;
    calculationBasis: string;
  };

  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계' | '제한 평가' | '자료 부족';
    criteria?: string;
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}



