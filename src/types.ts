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
  changeWoW: number;
  landedKrwKg: number;

  sparkline?: number[];
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
  changeMoM?: number;
  changeYoY?: number;
  cifBusanDesc?: string;
  exchange?: string;
  chartData?: Array<{
    date: string;
    cashPrice: number;
    ma50: number;
    landedBaseline: number;
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
  scenarios?: {
    base: {
      title: string;
      probability: number;
      drivers: string;
      landedKrw: number;
      diffPct: number;
      recommendation: string;
    };
    bull: {
      title: string;
      probability: number;
      drivers: string;
      landedKrw: number;
      diffPct: number;
      diffKrw: number;
      recommendation: string;
    };
    bear: {
      title: string;
      probability: number;
      drivers: string;
      landedKrw: number;
      diffPct: number;
      diffKrw: number;
      recommendation: string;
    };
    maxRiskUp: string;
    maxOpportunityDown: string;
    optimalHedge: string;
  };
  landedCompetitiveness?: Array<{
    origin: string;
    grade: string;
    regionCategory: 'all' | 'na' | 'sa' | 'oc' | 'eu' | 'asia';
    regionTag: string;
    fob: string;
    freight: string;
    tariff: string;
    cfr: string;
    landedKrw: string;
    assessment: string;
    highlightBadge?: string;
  }>;
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

export interface BusanLandedCostItem {
  commodityKey: string;
  landedKrwKg: number;
  benchmarkPrice: number;
  unit: string;
  freightUsd: number;
  usdKrwRate: number;
  tariffPercent: number;
  portHandlingPercent: number;
  calculationFormula: string;
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
  soybeanPrice: number;
  soybeanWowChange?: number;
  soybeanOilPrice: number;
  soybeanOilWowChange?: number;
  palmOilPrice: number;
  sugarPrice: number;
  potatoStarchPrice: number;
  tapiocaStarchPrice: number;
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
  busanLandedCosts?: Record<string, BusanLandedCostItem>;
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
}

export interface UsWheatHrwFobExport {
  wheatClass: 'HRW';
  proteinSpec: string;
  exportLocation: string;
  shipmentPeriod: string;
  fobPriceUsdMt: number;
  fobPriceUsdBu: number;
  basisCentsBu: number;
  reportDate: string;
  sourcePdfUrl: string;
}

export interface UsWheatKoreaFreight {
  origin: string;
  destination: string;
  freightRateUsdMt: number;
  vessel: string;
  quotationDate: string;
  sourcePdfUrl: string;
}

export interface EstimatedKoreaLandedCost {
  isAvailable: boolean;
  statusText: string;
  statusReason?: string;
  estimatedLandedCostUsdMt: number | null;
  compactFormulaText: string;
  hrwFob: UsWheatHrwFobExport | null;
  koreaFreight: UsWheatKoreaFreight | null;
  portCostAssumption: {
    portCostUsdMt: number | null;
    isConfigured: boolean;
    label: string;
  };
  missingInputs: string[];
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
  landedCost?: EstimatedKoreaLandedCost;
  errorMessage?: string;
  isCached?: boolean;
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
export interface UsdaAmsCornFobExport {
  commodity: 'Corn';
  grade: string; // e.g. '#2 Yellow Corn'
  exportLocation: string; // e.g. 'U.S. Gulf (Louisiana)'
  shipmentPeriod: string; // e.g. 'Prompt / Nearby'
  fobPriceUsdMt: number;
  fobPriceUsdBu: number;
  basisCentsBu?: number;
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface CornKoreaOceanFreight {
  origin: string; // 'U.S. Gulf'
  destination: string; // 'South Korea'
  freightRateUsdMt: number;
  vessel: string; // 'Panamax (54+ TMT)'
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface EstimatedCornKoreaLandedCost {
  isAvailable: boolean;
  statusText: string;
  statusReason?: string;
  estimatedLandedCostUsdMt: number | null;
  compactFormulaText: string;
  physicalFob: UsdaAmsCornFobExport | null;
  koreaFreight: CornKoreaOceanFreight | null;
  portCostAssumption: {
    portCostUsdMt: number | null;
    isConfigured: boolean;
    label: string;
  };
  missingInputs: string[];
}

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
  landedCost: EstimatedCornKoreaLandedCost;
  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계';
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}

// USDA AMS Soybean Physical Export & Ocean Freight Types
export interface UsdaAmsSoybeanFobExport {
  commodity: 'Soybean';
  grade: string;
  exportLocation: string;
  shipmentPeriod: string;
  fobPriceUsdMt: number;
  fobPriceUsdBu: number;
  basisCentsBu?: number;
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface SoybeanKoreaOceanFreight {
  origin: string;
  destination: string;
  freightRateUsdMt: number;
  vessel: string;
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface EstimatedSoybeanKoreaLandedCost {
  isAvailable: boolean;
  statusText: string;
  statusReason?: string;
  estimatedLandedCostUsdMt: number | null;
  compactFormulaText: string;
  physicalFob: UsdaAmsSoybeanFobExport | null;
  koreaFreight: SoybeanKoreaOceanFreight | null;
  portCostAssumption: {
    portCostUsdMt: number | null;
    isConfigured: boolean;
    label: string;
  };
  missingInputs: string[];
}

export interface SoybeanProcurementAnalysisData {
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
  landedCost: EstimatedSoybeanKoreaLandedCost;
  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계';
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}

// USDA AMS / ERS Soybean Oil Physical Export & Ocean Freight Types
export interface UsdaAmsSoybeanOilFobExport {
  commodity: 'Soybean Oil';
  grade: string;
  exportLocation: string;
  shipmentPeriod: string;
  fobPriceUsdMt: number;
  rawPrice?: number;
  rawUnit?: string;
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface SoybeanOilKoreaOceanFreight {
  origin: string;
  destination: string;
  freightRateUsdMt: number;
  vessel: string;
  observationDate: string;
  source: string;
  sourceUrl: string;
}

export interface EstimatedSoybeanOilKoreaLandedCost {
  isAvailable: boolean;
  statusText: string;
  statusReason?: string;
  estimatedLandedCostUsdMt: number | null;
  compactFormulaText: string;
  physicalFob: UsdaAmsSoybeanOilFobExport | null;
  koreaFreight: SoybeanOilKoreaOceanFreight | null;
  portCostAssumption: {
    portCostUsdMt: number | null;
    isConfigured: boolean;
    label: string;
  };
  missingInputs: string[];
}

export interface SoybeanOilProcurementAnalysisData {
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
  landedCost: EstimatedSoybeanOilKoreaLandedCost;
  deskRecommendation: {
    recommendation: string;
    dataInputsUsed: string[];
  };
  procurementRisk: {
    level: '안정' | '주의' | '경계';
    summarySentenceKo: string;
    sourcesUsed: string[];
  };
}



