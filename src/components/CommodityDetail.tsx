import {soybeanDisplayFactor} from '../utils/soybeanPriceSnapshot';
import { prefixCurrency } from '../utils/currencyFormatting';
import {latestCommonPalmSpread,palmClosingRange} from '../utils/palmPriceIntegrity';
import {ChartEndpointLabels} from './ChartEndpointLabels';
import {IMPORTED_POTATO_PRODUCTION} from '../data/potatoProductionHistory';
import { observedPriceChanges } from '../utils/observedPriceChanges';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { Commodity, Currency, UsWheatPriceHistoryResponse, UsWheatHistoryDataPoint, UsWheatClassMetric, AmisWheatResponse, CornProcurementAnalysisData, SoybeanProcurementAnalysisData, SoybeanOilProcurementAnalysisData } from '../types';
import { formatPrice, formatStarchSweetenerBenchmark, COMMODITY_CONFIGS, getCalculatedMetrics, calculateDynamicMetrics } from '../utils/commodityPriceMetrics';
import { sanitizeOklchColorsForCanvas } from '../utils/exportDashboardPdf';
import { CommodityNews } from './CommodityNews';
import AiRecommendation from './AiRecommendation';
import { CommodityWasdeCard } from './CommodityWasdeCard';
import { OriginRadar } from './OriginRadar';
import { getLiveExchangeRate, subscribeFxRates, fetchLiveFxRates, getAllFxRates, FXRates } from '../services/currencyService';
import palmOilCacheFallback from '../data/cache_palmoil.json';
import tapiocaCacheFallback from '../data/cache_tapioca.json';

export interface UsdaWheatSummary {
  commodityCode?: string;
  marketYear?: string;
  releaseMonth?: string;
  source?: string;
  production1000MT?: number;
  productionMMT?: number;
  domesticConsumption1000MT?: number;
  domesticConsumptionMMT?: number;
  endingStocks1000MT?: number;
  endingStocksMMT?: number;
  beginningStocks1000MT?: number;
  beginningStocksMMT?: number;
  imports1000MT?: number;
  exports1000MT?: number;
  totalSupply1000MT?: number;
  stocksToUseRatioPct?: number;
  areaHarvested1000HA?: number;
  yieldMTHA?: number;
}

export interface WasdeTelemetryData {
  marketYear: string;
  source: string;
  lastUpdated: string;
  production: { mmt: number; kmt: string };
  consumption: { mmt: number; kmt: string };
  endingStocks: { mmt: number; stuRatio: string };
  exports: { mmt: number; kmt: string };
  areaHarvested: { mha: number; kha: string };
  yield: { mtPerHa: number; kgPerHa: string };
  executiveBrief: string;
}

export const defaultWasdeTelemetry: WasdeTelemetryData = {
  marketYear: '2026',
  source: 'USDA FAS PSD',
  lastUpdated: '10:38:34 PM KST',
  production: { mmt: 822.4, kmt: '822,432' },
  consumption: { mmt: 822.5, kmt: '822,456' },
  endingStocks: { mmt: 276.3, stuRatio: '33.6%' },
  exports: { mmt: 211.8, kmt: '211,768' },
  areaHarvested: { mha: 215.3, kha: '215,326' },
  yield: { mtPerHa: 3.82, kgPerHa: '3,820' },
  executiveBrief: '미국산 HRW 소맥은 560~590 USd/bu 범위의 단기 횡보세를 유지하고 있습니다. 미국 남부 평원지대의 지속적인 토양 수분 부족과 2025/26 흑해 수출 물량 감소가 상승 요인으로 작용하고 있습니다. 반면 러시아의 풍부한 이월 재고와 이집트 GASC 입찰 수요 둔화가 상단을 제한하고 있습니다. 국내 식품 제조 구매 데스크에서는 현재 570~575 USd 밴드 부근에서 1분기 물리적 수입 물량의 조달 약정을 체결할 것을 권고합니다.'
};

interface CommodityDetailProps {
  commodity: Commodity;
  onNavigateBack: () => void;
  currency: Currency;
  onOpenExportModal?: () => void;
  onRefreshGemini: () => void;
  isSyncing: boolean;
  /** Incremented after Live Sync so the global S&D card can re-read the verified snapshot. */
  usdaRefreshRevision?: number;
  modelVersion?: string;
  onUpdateCommodityMetrics?: (
    commodityId: string,
    metrics: { price?: number; changeWoW?: number; changeMoM?: number }
  ) => void;
}

// Palm cache rows include cpoUsd; normalized historical quotes may only have usdPerMT.
// Both shapes have the same USD/MT units. Preserve the existing precedence.
const palmCpoUsdPerMt = (point: { usdPerMT?: number; cpoUsd?: number }): number =>
  point.cpoUsd ?? point.usdPerMT ?? NaN;

const getPdfFilename = (nameEn: string) => {
  const cleanName = nameEn.trim().replace(/\s+/g, '');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const yyyymmdd = `${year}${month}${day}`;
  const hhmm = `${hours}${minutes}`;
  return `Nongshim_RMS_${cleanName}_${yyyymmdd}_${hhmm}.pdf`;
};

// Helper function for contract month mapping
const formatContractMonth = (monthStr: string) => {
  if (!monthStr) return '';
  const months: Record<string, string> = {
    'January': '1월물', 'February': '2월물', 'March': '3월물',
    'April': '4월물', 'May': '5월물', 'June': '6월물',
    'July': '7월물', 'August': '8월물', 'September': '9월물',
    'October': '10월물', 'November': '11월물', 'December': '12월물'
  };
  return months[monthStr] || monthStr;
};

const getRecommendationColor = (text: string) => {
  if (!text) return 'rms-status-warning bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';

  // Tier 1: HIGH RISK / TIGHT BUFFER (Solid Red)
  if (text.includes('30~45일') || text.includes('즉시') || text.includes('조치 필요')) {
    return 'rms-status-negative bg-[#DF0029] text-white font-bold px-2.5 py-1 rounded-md shadow-xs';
  }

  // Tier 2: FAVORABLE / EXTENDED LOCK (Solid Green - Max 75d)
  if (text.includes('60~75일') || text.includes('60일') || text.includes('75일') || text.includes('우호적')) {
    return 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';
  }

  // Tier 3: HYBRID SPOT/FORWARD / CAUTION (주의 / 중위험 / 스팟/선도)
  if (text.includes('주의') || text.includes('중위험') || text.includes('스팟/선도') || text.includes('혼합')) {
    return 'rms-status-warning bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';
  }

  // Tier 4: STANDARD FLEXIBLE (Soft Light Orange - 45~60d)
  return 'rms-status-warning bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';
};

interface ChartPoint {
  date: string;
  price: number;
  x: number;
  y: number;
  usdPerMT?: number;
  isSynthetic?: boolean;
}

interface ChartTick {
  value: number;
  y: number;
}

interface TimeframeChartData {
  axisLabels: [string, string, string, string];
  high: number;
  low: number;
  avg: number;
  minVal: number;
  maxVal: number;
  ticks: ChartTick[];
  linePath: string;
  areaPath: string;
  maPath: string;
  points: ChartPoint[];
}

interface ExchangeInfo {
  name: string;
  url: string;
}

export interface OriginItem {
  region: string;
  production: string;
  exports: string;
  endingStocks: string;
  riskAssessment: string;
  status: string;
  statusColor: 'green' | 'yellow' | 'red';
  sourceName: string;
}

export const COMMODITY_ORIGINS_MAP: Record<string, OriginItem[]> = {
  // Wheat deliberately has no hardcoded origin fallbacks.
  wheat: [],
  corn: [
    {
      region: '미국 (Corn Belt)',
      production: '385.0M MT',
      exports: '수출 58.5M MT',
      endingStocks: '기말재고 52.0M MT',
      riskAssessment: '저위험 - 풍작 수급 및 미 걸프만/PNW 원활 선적',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'USDA FAS',
    },
    {
      region: '브라질 (Mato Grosso / Safrinha)',
      production: '127.0M MT',
      exports: '수출 49.0M MT',
      endingStocks: '기말재고 10.5M MT',
      riskAssessment: '저위험 - 2기작(사프리냐) 수확 원활 및 대두 교대 선적',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'CONAB',
    },
    {
      region: '아르헨티나 (Pampas)',
      production: '51.0M MT',
      exports: '수출 36.0M MT',
      endingStocks: '기말재고 6.8M MT',
      riskAssessment: '중위험 - 파라나강 수위 저하에 따른 만재 흘수 제한 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'USDA FAS PSD',
    },
    {
      region: '우크라이나 (Black Sea)',
      production: '27.0M MT',
      exports: '수출 24.0M MT',
      endingStocks: '기말재고 2.5M MT',
      riskAssessment: '고위험 - 군사 분쟁 및 흑해 항만 선적 지연 불확실성',
      status: '주의 요망',
      statusColor: 'red',
      sourceName: 'IGC',
    },
  ],
  soybean: [
    {
      region: '브라질 (Mato Grosso)',
      production: '169.0M MT',
      exports: '수출 105.0M MT',
      endingStocks: '기말재고 38.0M MT',
      riskAssessment: '저위험 - 사상 최대 수확량 및 글로벌 수출 주도',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'CONAB',
    },
    {
      region: '미국 (Midwest)',
      production: '124.8M MT',
      exports: '수출 49.7M MT',
      endingStocks: '기말재고 15.0M MT',
      riskAssessment: '저위험 - 수확 완료 및 미 걸프/태평양 연안 공급 안정',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'USDA FAS',
    },
    {
      region: '아르헨티나 (Pampas)',
      production: '51.0M MT',
      exports: '수출 4.5M MT',
      endingStocks: '기말재고 24.0M MT',
      riskAssessment: '중위험 - 국내 착유 가공용 비축 집중 및 통화 불확실성',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'USDA FAS PSD',
    },
    {
      region: '파라과이 (Alto Paraná)',
      production: '10.5M MT',
      exports: '수출 6.8M MT',
      endingStocks: '기말재고 1.2M MT',
      riskAssessment: '저위험 - 바지선 내륙 수운 정상 가동',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'USDA FAS',
    },
  ],
  'soybean-oil': [
    {
      region: '아르헨티나 (Rosario Crushing Hub)',
      production: '8.38M MT',
      exports: '수출 5.2M MT',
      endingStocks: '기말재고 0.4M MT',
      riskAssessment: '중위험 - 로사리오 착유 공장 가동률 및 파라나강 운송 주시',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'BNA',
    },
    {
      region: '브라질 (Mato Grosso/Paraná)',
      production: '12.64M MT',
      exports: '수출 2.4M MT',
      endingStocks: '기말재고 0.5M MT',
      riskAssessment: '저위험 - 바이오디젤 의무혼합(B15) 및 수출 물량 적정 유지',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'CONAB',
    },
    {
      region: '미국 (Midwest Crushing)',
      production: '14.05M MT',
      exports: '수출 0.4M MT',
      endingStocks: '기말재고 0.8M MT',
      riskAssessment: '저위험 - 자국 재생디젤(RD/SAF) 수요 집중으로 수출 가용량 제한적',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'USDA FAS',
    },
    {
      region: '유럽연합 (독일/네덜란드)',
      production: '2.85M MT',
      exports: '수출 0.9M MT',
      endingStocks: '기말재고 0.2M MT',
      riskAssessment: '저위험 - 로테르담 정유 설비 정상 가동 및 유럽 역내 수급 균형',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'EC AGRI',
    },
  ],
  'palm-oil': [
    {
      region: '인도네시아 (Sumatra/Kalimantan)',
      production: '47.0M MT',
      exports: '수출 28.0M MT',
      endingStocks: '기말재고 3.2M MT',
      riskAssessment: '중위험 (B40 의무화) - B40 바이오디젤 의무화 및 DMO 수출 규제 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'GAPKI',
    },
    {
      region: '말레이시아 (Sabah/Sarawak)',
      production: '19.2M MT',
      exports: '수출 15.5M MT',
      endingStocks: '기말재고 1.8M MT',
      riskAssessment: '저위험 - 외국인 노동력 정상화 및 주요 수출항 선적 안정',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'MPOB',
    },
    {
      region: '콜롬비아 (Cesar/Meta)',
      production: '1.8M MT',
      exports: '수출 0.7M MT',
      endingStocks: '기말재고 0.1M MT',
      riskAssessment: '저위험 - 중남미 역내 및 대미 공급 지속',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'Fedepalma',
    },
    {
      region: '태국 (Southern Provinces)',
      production: '3.4M MT',
      exports: '수출 0.9M MT',
      endingStocks: '기말재고 0.3M MT',
      riskAssessment: '저위험 - 내수 식용유 안정화 우선 및 국경 무역 정상',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'OAE Thailand',
    },
  ],
  'palmoil': [
    {
      region: '인도네시아 (Sumatra/Kalimantan)',
      production: '47.0M MT',
      exports: '수출 28.0M MT',
      endingStocks: '기말재고 3.2M MT',
      riskAssessment: '중위험 (B40 의무화) - B40 바이오디젤 의무화 및 DMO 수출 규제 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'GAPKI',
    },
    {
      region: '말레이시아 (Sabah/Sarawak)',
      production: '19.2M MT',
      exports: '수출 15.5M MT',
      endingStocks: '기말재고 1.8M MT',
      riskAssessment: '저위험 - 외국인 노동력 정상화 및 주요 수출항 선적 안정',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'MPOB',
    },
    {
      region: '콜롬비아 (Cesar/Meta)',
      production: '1.8M MT',
      exports: '수출 0.7M MT',
      endingStocks: '기말재고 0.1M MT',
      riskAssessment: '저위험 - 중남미 역내 및 대미 공급 지속',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'Fedepalma',
    },
    {
      region: '태국 (Southern Provinces)',
      production: '3.4M MT',
      exports: '수출 0.9M MT',
      endingStocks: '기말재고 0.3M MT',
      riskAssessment: '저위험 - 내수 식용유 안정화 우선 및 국경 무역 정상',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'OAE Thailand',
    },
  ],
  'palm_oil': [
    {
      region: '인도네시아 (Sumatra/Kalimantan)',
      production: '47.0M MT',
      exports: '수출 28.0M MT',
      endingStocks: '기말재고 3.2M MT',
      riskAssessment: '중위험 (B40 의무화) - B40 바이오디젤 의무화 및 DMO 수출 규제 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'GAPKI',
    },
    {
      region: '말레이시아 (Sabah/Sarawak)',
      production: '19.2M MT',
      exports: '수출 15.5M MT',
      endingStocks: '기말재고 1.8M MT',
      riskAssessment: '저위험 - 외국인 노동력 정상화 및 주요 수출항 선적 안정',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'MPOB',
    },
    {
      region: '콜롬비아 (Cesar/Meta)',
      production: '1.8M MT',
      exports: '수출 0.7M MT',
      endingStocks: '기말재고 0.1M MT',
      riskAssessment: '저위험 - 중남미 역내 및 대미 공급 지속',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'Fedepalma',
    },
    {
      region: '태국 (Southern Provinces)',
      production: '3.4M MT',
      exports: '수출 0.9M MT',
      endingStocks: '기말재고 0.3M MT',
      riskAssessment: '저위험 - 내수 식용유 안정화 우선 및 국경 무역 정상',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'OAE Thailand',
    },
  ],
  sugar: [
    {
      region: '브라질 (Center-South)',
      production: '42.5M MT',
      exports: '수출 33.0M MT',
      endingStocks: '기말재고 3.5M MT',
      riskAssessment: '저위험 - 사탕수수 분쇄 순조 및 산투스(Santos) 항만 처리량 양호',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'UNICA',
    },
    {
      region: '인도 (Maharashtra/UP)',
      production: '32.0M MT',
      exports: '수출 1.0M MT',
      endingStocks: '기말재고 8.5M MT',
      riskAssessment: '고위험 (수출 제한) - 에탄올 전용 정책 및 정부 상업 수출 제한 조치 지속',
      status: '주의 요망',
      statusColor: 'red',
      sourceName: 'ISMA',
    },
    {
      region: '태국 (Central/Northeast)',
      production: '10.0M MT',
      exports: '수출 7.0M MT',
      endingStocks: '기말재고 1.2M MT',
      riskAssessment: '중위험 - 강수량 회복으로 수확량 반등, 방콕항 출하 대기',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'OCSB Thailand',
    },
    {
      region: '호주 (Queensland)',
      production: '4.2M MT',
      exports: '수출 3.4M MT',
      endingStocks: '기말재고 0.4M MT',
      riskAssessment: '저위험 - 벌크 터미널 인프라 우수 및 고품질 원당 안정 공급',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'QSL',
    },
  ],
  'potato-starch': [
    {
      region: '네덜란드 (Avebe / Groningen)',
      production: '245.0K MT',
      exports: '수출 160.0K MT',
      endingStocks: '기말재고 42.0K MT',
      riskAssessment: '저위험 - 품종 개량 및 선진 가공 공정 안정 가동',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'EC MARS',
    },
    {
      region: '독일 (Emsland Group)',
      production: '210.0K MT',
      exports: '수출 125.0K MT',
      endingStocks: '기말재고 36.0K MT',
      riskAssessment: '저위험 - 가공용 감자 수확량 적정 및 고품질 변성전분 제조 원활',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'EC MARS',
    },
    {
      region: '덴마크 (KMC / Jutland)',
      production: '165.0K MT',
      exports: '수출 120.0K MT',
      endingStocks: '기말재고 25.0K MT',
      riskAssessment: '저위험 - 스칸디나비아 협동조합 물류 및 대아시아 수출 안정',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'EC MARS',
    },
    {
      region: '폴란드 (WPPZ / Wielkopolska)',
      production: '115.0K MT',
      exports: '수출 58.0K MT',
      endingStocks: '기말재고 21.0K MT',
      riskAssessment: '저위험 - 동유럽 산지 단가 경쟁력 유지',
      status: '정상 선적',
      statusColor: 'green',
      sourceName: 'EC MARS',
    },
    {
      region: '프랑스 (Roquette)',
      production: '70.0K MT',
      exports: '수출 42.0K MT',
      endingStocks: '기말재고 13.0K MT',
      riskAssessment: '보통 - 특수 식품 전분 라인 공급 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'EC MARS',
    },
  ],
  'tapioca-starch': [
    {
      region: '태국 (Korat / Isan)',
      production: '4.6M MT',
      exports: '수출 천연 2.85M MT / 변성 1.15M MT',
      endingStocks: '기말재고 1.2M MT',
      riskAssessment: '생뿌리 18.58M MT (경작지 106만 HA) · 산지 수급 안정 및 FOB 방콕 $700/MT 유지',
      status: '정상',
      statusColor: 'green',
      sourceName: 'TTSA',
    },
    {
      region: '베트남 (Tây Ninh / Central)',
      production: '1.4M MT',
      exports: '수출 1.1M MT',
      endingStocks: '기말재고 0.2M MT',
      riskAssessment: '중국향 국경 무역 수요 경합 주시',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'VTA',
    },
    {
      region: '인도네시아 (Lampung)',
      production: '0.9M MT',
      exports: '수출 0.3M MT',
      endingStocks: '기말재고 0.1M MT',
      riskAssessment: '내수 스낵 및 식품 가공 가용량 우선 소비',
      status: '정상',
      statusColor: 'green',
      sourceName: 'BPS',
    },
    {
      region: '캄보디아 (Battambang)',
      production: '0.6M MT',
      exports: '수출 0.5M MT',
      endingStocks: '기말재고 0.1M MT',
      riskAssessment: '태국/베트남 가공 공장향 원료 칩 수송 모니터링',
      status: '모니터링',
      statusColor: 'yellow',
      sourceName: 'MAFF',
    },
  ],
};

export const EXTERNAL_CHART_URLS: Record<string, string> = {
  'palm-oil': 'https://www.investing.com/commodities/palm-oil',
  'palmoil': 'https://www.investing.com/commodities/palm-oil',
  'palm_oil': 'https://www.investing.com/commodities/palm-oil',
  'wheat': 'https://uswheat.org/market-information/price-report/',
  'corn': 'https://finance.yahoo.com/quote/ZC=F/',
  'soybean': 'https://finance.yahoo.com/quote/ZS=F/',
  'soybean-oil': 'https://finance.yahoo.com/quote/ZL=F/',
  'sugar': 'https://finance.yahoo.com/quote/SB=F/',
  'potato-starch': 'https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table',
  'tapioca-starch': 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price',
};

export const SOURCE_LABELS: Record<string, string> = {
  'wheat': 'U.S. Wheat Associates',
  'corn': 'CBOT (CC1)',
  'soybean': 'CBOT (ZS)',
  'soybean-oil': 'CBOT (ZL)',
  'palm-oil': 'Bursa Malaysia FCPO · Investing.com',
  'palmoil': 'Bursa Malaysia FCPO · Investing.com',
  'palm_oil': 'Bursa Malaysia FCPO · Investing.com',
  'sugar': 'ICE (SB)',
  'potato-starch': 'Eurostat · 원료감자 생산 대리지표',
  'tapioca-starch': 'TTSA FOB Bangkok',
};

export const getExchangeInfo = (commodityId: string) => {
  const name = SOURCE_LABELS[commodityId] || 'CME Group';
  const url = EXTERNAL_CHART_URLS[commodityId] || 'https://www.cmegroup.com/markets/agriculture.html';
  return { name, url };
};

export const getNiceTicks = (min: number, max: number, count = 5): number[] => {
  if (min === max) return [min];
  const rawStep = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(rawStep || 1));
  const normStep = rawStep / mag;
  let multiplier: number;
  if (normStep < 1.5) multiplier = 1;
  else if (normStep < 3) multiplier = 2;
  else if (normStep < 7) multiplier = 5;
  else multiplier = 10;

  const niceStep = multiplier * mag;
  const startTick = Math.floor(min / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(startTick + i * niceStep);
  }
  return ticks;
};

export const getNiceYAxisTicks = getNiceTicks;

export type Timeframe = '1M' | '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y';

// Preserve the item fields (contract month, class prices, etc.) when filtering dates.
// Narrowing to {date, reportDate} dropped fields needed by the Wheat chart tooltip.


const filterSeriesByTimeframe = <T extends { date?: string; reportDate?: string }>(
  series: T[],
  timeframe: string
) => {
  if (!series || series.length === 0) return [];

  const parseMs = (dStr: any) => {
    if (!dStr) return 0;
    const clean = String(dStr).replace(/\./g, '-').trim();
    const ms = new Date(clean).getTime();
    return isNaN(ms) ? 0 : ms;
  };

  const validSeries = series
    .filter((item) => parseMs(item.date || item.reportDate) > 0)
    .sort((a, b) => parseMs(a.date || a.reportDate) - parseMs(b.date || b.reportDate));

  if (validSeries.length === 0) return series;

  const maxTime = parseMs(validSeries[validSeries.length - 1].date || validSeries[validSeries.length - 1].reportDate);

  let daysBack = 365;
  if (timeframe === '1M') daysBack = 30;
  else if (timeframe === '3M') daysBack = 90;
  else if (timeframe === '6M') daysBack = 180;
  else if (timeframe === '1Y') daysBack = 365;
  else if (timeframe === '2Y') daysBack = 730;
  else if (timeframe === '3Y') daysBack = 1095;
  else if (timeframe === '5Y') daysBack = 1825;
  else if (timeframe === 'ALL') return validSeries;

  const cutoffTime = maxTime - daysBack * 24 * 60 * 60 * 1000;

  // Return EVERY single point that falls within the cutoff window with zero slicing or capping
  const filtered = validSeries.filter((item) => parseMs(item.date || item.reportDate) >= cutoffTime);

  return filtered.length > 0 ? filtered : validSeries;
};

export const CommodityDetail: React.FC<CommodityDetailProps> = ({
  commodity,
  onNavigateBack,
  currency,
  onOpenExportModal,
  onRefreshGemini,
  isSyncing,
  usdaRefreshRevision = 0,
  modelVersion,
  onUpdateCommodityMetrics
}) => {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(commodity.id==='potato-starch'?'5Y':'6M');

  // Annual production needs its full historical view; daily price pages keep 6M.
  useEffect(() => {
    setActiveTimeframe(commodity.id==='potato-starch'?'5Y':'6M');
  }, [commodity.id]);
  const [fxRates, setFxRates] = useState<FXRates>(getAllFxRates());

  useEffect(() => {
    const unsubscribe = subscribeFxRates((updated) => {
      setFxRates(updated);
    });
    fetchLiveFxRates();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isSyncing) {
      fetchLiveFxRates();
    }
  }, [isSyncing]);

  const selectedCurrency = currency;
  const exchangeRate = selectedCurrency === 'KRW' ? (fxRates.USD_KRW || 1388.5) : selectedCurrency === 'EUR' ? (1 / (fxRates.EUR_USD || 1.08)) : 1;
  const currencySymbol = selectedCurrency === 'KRW' ? '₩' : selectedCurrency === 'EUR' ? '€' : '$';
  const currencyLabel = currency === 'KRW' ? 'KRW/MT' : currency === 'EUR' ? 'EUR/MT' : 'USD/MT';

  const formatPriceValue = (usdVal: number, decimals: number = 2) => {
    const converted = usdVal * exchangeRate;
    if (currency === 'KRW') {
      return Math.round(converted).toLocaleString('en-US');
    }
    return converted.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatConvertedPrice = (val: number, decimals: number = 2) => {
    if (currency === 'KRW') {
      return Math.round(val).toLocaleString('en-US');
    }
    return val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatWheatUsd = (val: number, decimals: number = 2) => {
    const converted = val * exchangeRate;
    if (currency === 'KRW') {
      return Math.round(converted).toLocaleString('en-US');
    }
    return converted.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const isWheat = commodity.id === 'wheat';
  const isCorn = commodity.id === 'corn';
  const isSoybean = commodity.id === 'soybean';
  const isSoybeanOil = commodity.id === 'soybean-oil';
  const isPalmOil = commodity.id === 'palm-oil' || commodity.id === 'palmoil' || commodity.id === 'palm_oil';
  const isSugar = commodity.id === 'sugar';
  const isPotatoStarch = commodity.id === 'potato-starch';
  const isTapiocaStarch = commodity.id === 'tapioca-starch' || commodity.id === 'tapioca_starch';

  // CBOT & Commodity Live & Historical Price Report State
  const [fetchedHistoricalData, setHistoricalData] = useState<{
    success: boolean;
    symbol: string;
    source: string;
    priceMyr?: number;
    cpoUsdMt?: number;
    oleinUsd?: number;
    data: Array<{ date: string; centsPerBushel: number; usdPerMT: number; oleinUsdPerMt?: number }>;
  } | null>(null);
  const [isHistoryFailed, setIsHistoryFailed] = useState<boolean>(false);
  const lastSuccessfulHistoryRef = useRef<any>(null);

  // Separate Full 1Y (52-Week) Historical Price Dataset for 52-Week Range Percentile
  const [fetchedFullYearHistoryData, setFullYearHistoryData] = useState<{
    success: boolean;
    symbol: string;
    source: string;
    priceMyr?: number;
    cpoUsdMt?: number;
    oleinUsd?: number;
    data: Array<{ date: string; centsPerBushel: number; usdPerMT: number; oleinUsdPerMt?: number }>;
  } | null>(null);
  const lastSuccessfulFullYearHistoryRef = useRef<any>(null);



  const datedPriceSnapshot=isSoybean?commodity._soybeanPriceSnapshot:isSoybeanOil?commodity._soybeanOilPriceSnapshot:isSugar?commodity._sugarPriceSnapshot:undefined;
  const historicalData=(isSoybean||isSoybeanOil||isSugar)?(datedPriceSnapshot||null):fetchedHistoricalData;
  const fullYearHistoryData=(isSoybean||isSoybeanOil||isSugar)?(datedPriceSnapshot||null):fetchedFullYearHistoryData;
  const soybeanFactor=soybeanDisplayFactor(currency,commodity._soybeanDisplayFx);

  const liveUsdMyr = fxRates.USD_MYR || getLiveExchangeRate('USD_MYR');
  const liveUsdKrw = fxRates.USD_KRW || getLiveExchangeRate('KRW') || NaN;
  const liveEurUsd = fxRates.EUR_USD || getLiveExchangeRate('EUR');

  // Verified Scraped Market Benchmarks (with persistent cache_palmoil.json fallback)
  const palmObservedSeries = useMemo<any[]>(()=>historicalData?.data?.length ? historicalData.data : palmOilCacheFallback.historicalSeries,[historicalData]);
  const latestPalmSeriesPoint=[...palmObservedSeries].reverse().find(p=>Number.isFinite(p.cpoUsd??p.usdPerMT));
  const latestOleinSeriesPoint=[...palmObservedSeries].reverse().find(p=>Number.isFinite(p.oleinUsdPerMt??p.oleinUsd));
  const LIVE_CPO_MYR=latestPalmSeriesPoint?.cpoMyr??latestPalmSeriesPoint?.centsPerBushel??palmOilCacheFallback.priceMyr;
  const LIVE_OLEIN_USD=latestOleinSeriesPoint?.oleinUsdPerMt??latestOleinSeriesPoint?.oleinUsd??palmOilCacheFallback.oleinUsd;
  const cpoUsdMt=Number(latestPalmSeriesPoint?.cpoUsd??latestPalmSeriesPoint?.usdPerMT??palmOilCacheFallback.cpoUsdMt);

  // Both series, current quotes, chart, changes and range use the same display FX.
  // Saved CPO USD values retain their original/dated MYR conversion provenance.
  const palmDisplayRateCandidate=currency==='KRW'?liveUsdKrw:currency==='EUR'?(liveEurUsd>0?1/liveEurUsd:NaN):1;
  const palmDisplayRate=palmDisplayRateCandidate>0?palmDisplayRateCandidate:NaN;
  const cpoPrice=currency==='KRW'?Math.round(cpoUsdMt*palmDisplayRate):Number((cpoUsdMt*palmDisplayRate).toFixed(2));
  const oleinPrice=currency==='KRW'?Math.round(LIVE_OLEIN_USD*palmDisplayRate):Number((LIVE_OLEIN_USD*palmDisplayRate).toFixed(2));
  const commonPalmSpread=latestCommonPalmSpread(palmObservedSeries);
  const spreadUsd=commonPalmSpread?.usdPerMT??NaN;
  const currentSpread=spreadUsd*palmDisplayRate;
  const spreadPrice=currentSpread;

  const formattedSpread = useMemo(() => {
    if(!Number.isFinite(currentSpread))return '정규화 벤치마크 차이: --';
    const sign = currentSpread >= 0 ? '+' : '';
    if (currency === 'KRW') {
      return `정규화 벤치마크 차이(${commonPalmSpread?.date.slice(5).replace('-','.')}): ${sign}${prefixCurrency(Math.round(currentSpread).toLocaleString('en-US'), '₩')} KRW/MT`;
    }
    if (currency === 'EUR') {
      return `정규화 벤치마크 차이(${commonPalmSpread?.date.slice(5).replace('-','.')}): ${sign}${prefixCurrency(currentSpread.toFixed(2), '€')} EUR/MT`;
    }
    return `정규화 벤치마크 차이(${commonPalmSpread?.date.slice(5).replace('-','.')}): ${sign}${prefixCurrency(currentSpread.toFixed(2), '$')} USD/MT`;
  }, [currency, currentSpread, commonPalmSpread?.date]);

  const formatPalmPrice = (val: number) => {
    if (!Number.isFinite(val)) return '--';
    if (currency === 'KRW') {
      return Math.round(val).toLocaleString('en-US');
    }
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const palmChartData = useMemo(() => {
    if (!isPalmOil) return null;

    const convRate = palmDisplayRate;

    // 1. Dynamic series merging logic: Combine baseline cached JSON history with live server telemetry items
    const baseSeries = (palmOilCacheFallback && Array.isArray(palmOilCacheFallback.historicalSeries) && palmOilCacheFallback.historicalSeries.length > 0)
      ? palmOilCacheFallback.historicalSeries
      : [];
    const liveSeries = (historicalData?.data && Array.isArray(historicalData.data))
      ? historicalData.data
      : [];

    // Deduplicate entries by date (YYYY-MM-DD or YYYY.MM.DD)
    const palmDateMap = new Map<string, any>();
    baseSeries.forEach((item: any) => {
      const d = String(item.date).replace(/\./g, '-');
      palmDateMap.set(d, { ...item, date: d });
    });
    liveSeries.forEach((item: any) => {
      const d = String(item.date).replace(/\./g, '-');
      const prev = palmDateMap.get(d) || {};
      palmDateMap.set(d, { ...prev, ...item, date: d });
    });

    // Automatically sort the combined array chronologically
    const fullCombinedSeries = Array.from(palmDateMap.values()).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    const rawSourceSeries = filterSeriesByTimeframe(fullCombinedSeries, activeTimeframe);

    const pointsData = rawSourceSeries.map((p) => {
      // 1. Read raw FCPO MYR settlement price (checking all JSON keys)
      const rawMyr = p.cpoMyr ?? p.centsPerBushel ?? p.priceMyr;
      
      // Read the saved USD normalization; never apply today's MYR FX to old rows.
      const pointCpoUsd = p.cpoUsd ?? p.usdPerMT ?? NaN;

      // 3. Keep working Olein USD/MT benchmark intact
      const pointOleinUsd = Number.isFinite(p.oleinUsdPerMt)
        ? p.oleinUsdPerMt
        : (Number.isFinite(p.oleinUsd) ? p.oleinUsd : NaN);

      // 4. Apply currency toggle multiplier (KRW ₩, USD $, EUR €)
      const cpoPrice = pointCpoUsd * convRate;
      const oleinPrice = pointOleinUsd * convRate;
      const spreadUsd = Number((pointOleinUsd - pointCpoUsd).toFixed(2));
      const spreadPrice = oleinPrice - cpoPrice;

      return {
        date: p.date.replace(/-/g, '.'),
        cpoPrice,
        oleinPrice,
        cpoUsd: pointCpoUsd,
        oleinUsd: pointOleinUsd,
        spreadUsd,
        spreadPrice,
        rawCpoMyr: rawMyr,
        rawOleinUsd: pointOleinUsd,
      };
    });

    const allPrices = pointsData.flatMap(d => [d.cpoPrice, d.oleinPrice]).filter(Number.isFinite);
    if(!allPrices.length)return null;
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);

    const padding = (maxPrice - minPrice) * 0.15 || maxPrice * 0.05;
    const minVal = minPrice - padding;
    const maxVal = maxPrice + padding;
    const valRange = maxVal - minVal || 1;

    const width = 500;
    const height = 150;
    const padTop = 15;
    const padBottom = 15;
    const usableHeight = height - padTop - padBottom;

    const getTs = (dStr: string) => new Date(dStr.replace(/\./g, '-')).getTime();
    const timestamps = pointsData.map(p => getTs(p.date)).filter(t => !isNaN(t));
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : 1;
    const timeRange = maxTime - minTime || 1;

    const coords = pointsData.map((pt) => {
      const t = getTs(pt.date);
      const x = timeRange > 0 ? Math.round(((t - minTime) / timeRange) * width) : 250;
      const yCpo = Math.round(height - padBottom - ((pt.cpoPrice - minVal) / valRange) * usableHeight);
      const yOlein = Math.round(height - padBottom - ((pt.oleinPrice - minVal) / valRange) * usableHeight);
      return { ...pt, x, yCpo, yOlein };
    });

    const buildSplinePath = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return '';
      return pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');
    };

    const cpoLinePath = buildSplinePath(coords.filter(c=>Number.isFinite(c.yCpo)).map(c => ({ x: c.x, y: c.yCpo })));
    const oleinLinePath = buildSplinePath(coords.filter(c=>Number.isFinite(c.yOlein)).map(c => ({ x: c.x, y: c.yOlein })));
    const cpoCoords=coords.filter(c=>Number.isFinite(c.yCpo));
    const cpoAreaPath = cpoLinePath ? `${cpoLinePath} L ${cpoCoords.at(-1)?.x??0},150 L ${cpoCoords[0]?.x??0},150 Z` : '';

    const formatDateFromTs = (ts: number): string => {
      const d = new Date(ts);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    return {
      points: coords,
      lastCpo:coords.filter(c=>Number.isFinite(c.yCpo)).at(-1),
      lastOlein:coords.filter(c=>Number.isFinite(c.yOlein)).at(-1),
      cpoLinePath,
      oleinLinePath,
      cpoAreaPath,
      low: minPrice,
      high: maxPrice,
      avg: allPrices.reduce((a, b) => a + b, 0) / allPrices.length,
      ticks: [0, 1, 2, 3].map(i => {
        const value = minVal + ((maxVal - minVal) / 3) * i;
        const y = height - padBottom - ((value - minVal) / valRange) * usableHeight;
        return { value, y };
      }),
      axisLabels: [
        formatDateFromTs(minTime),
        formatDateFromTs(minTime + timeRange * 0.33),
        formatDateFromTs(minTime + timeRange * 0.66),
        formatDateFromTs(maxTime),
      ]
    };
  }, [isPalmOil, activeTimeframe, currency, cpoUsdMt, liveUsdMyr, liveUsdKrw, liveEurUsd, historicalData, spreadUsd]);

  const [usdaData, setUsdaData] = useState<UsdaWheatSummary | null>(null);
  const [usdaLastUpdated, setUsdaLastUpdated] = useState<string>('');
  const [isUsdaFailed, setIsUsdaFailed] = useState<boolean>(false);
  const [isUsdaLoading, setIsUsdaLoading] = useState<boolean>(true);
  const lastSuccessfulUsdaDataRef = useRef<UsdaWheatSummary | null>(null);

  // U.S. Wheat Associates Live & Historical Price Report State
  const [usWheatHistory, setUsWheatHistory] = useState<UsWheatPriceHistoryResponse | null>(
    null
  );
  const [usWheatLastRetrieved, setUsWheatLastRetrieved] = useState<string>('');
  const [isUsWheatFailed, setIsUsWheatFailed] = useState<boolean>(false);
  const lastSuccessfulWheatHistoryRef = useRef<UsWheatPriceHistoryResponse | null>(null);


  // AMIS Market Monitor (Wheat) – verified monthly market intelligence.
  const [amisResponse, setAmisResponse] = useState<AmisWheatResponse | null>(null);
  const [isAmisFailed, setIsAmisFailed] = useState<boolean>(false);
  const lastSuccessfulAmisRef = useRef<AmisWheatResponse | null>(null);

  // Wheat-specific sourcing origin radar. Other commodities keep the target project's existing origin logic.
  const [originRadarData, setOriginRadarData] = useState<OriginItem[] | null>(null);
  const [originRadarCommodityId, setOriginRadarCommodityId] = useState<string | null>(null);

  // Corn SCM Procurement Analysis State (CBOT ZC=F, USDA FAS PSD, AMIS)
  const [cornAnalysis, setCornAnalysis] = useState<CornProcurementAnalysisData | null>(null);
  const [isCornLoading, setIsCornLoading] = useState<boolean>(false);
  const lastSuccessfulCornAnalysisRef = useRef<CornProcurementAnalysisData | null>(null);

  // Soybean SCM Procurement Analysis State (CBOT ZS=F, USDA FAS PSD, AMIS)
  const soybeanAnalysis=commodity._soybeanPriceSnapshot?.procurementAnalysis||null;

  // Soybean Oil SCM Procurement Analysis State (CBOT ZL=F, Physical FOB, Liquid Tanker Freight, USDA FAS PSD, AMIS)
  const soybeanOilAnalysis=commodity._soybeanOilPriceSnapshot?.procurementAnalysis||null;

  // Dynamic WASDE 6-Metric Telemetry Pipeline State
  const [wasdeTelemetry, setWasdeTelemetry] = useState<WasdeTelemetryData>(defaultWasdeTelemetry);
  const [isWasdeTelemetryFailed, setIsWasdeTelemetryFailed] = useState<boolean>(false);
  const lastSuccessfulWasdeTelemetryRef = useRef<WasdeTelemetryData>(defaultWasdeTelemetry);

  const selectedCommodity = commodity;

  // Gemini AI Analysis State
  const [aiInsight, setAiInsight] = useState<{
    confidenceScore: number;
    deskRecommendation: string;
    executiveSummary: string;
    bullishFactors: string[];
    bearishFactors: string[];
    watchItems: string[];
    sources?: Array<{ title: string; url: string }>;
    generatedAt?: string;
    status?: 'live' | 'cached' | 'rule-based';
    model?: string;
  } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(true);
  const [isAiError, setIsAiError] = useState<boolean>(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    
    async function fetchAiAnalysis() {
      // Determine the active item slug/id
      const commodityId = selectedCommodity?.id || (selectedCommodity as any)?.slug || (selectedCommodity as any)?.key;
      if (!commodityId) return;

      // Force clearing previous state (Corn) immediately
      setAiInsight(null);
      setIsAiLoading(true);
      setIsAiError(false);

      try {
        // Use the same source-grounded AI Market View service for all eight commodities.
        const baseEndpoint = `/api/ai-analysis/${commodityId}`;
        const endpoint = isSyncing ? `${baseEndpoint}?force=true` : baseEndpoint;
        const res = await fetch(endpoint, { cache: 'no-store' });
        
        let json: any;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          json = await res.json();
        } else {
          const text = await res.text();
          try {
            json = JSON.parse(text);
          } catch {
            // Not valid JSON (e.g., plain text upstream proxy error like "Rate exceeded.")
            console.warn(`[CommodityDetail] Upstream returned non-JSON response (${res.status}):`, text);
            json = {
              success: false,
              errorMessage: `서버 응답 오류 (${res.status}): ${text.slice(0, 80)}`
            };
          }
        }

        if (res.ok && json.success && json.data && Array.isArray(json.data.sources) && json.data.sources.length > 0) {
          if (isMounted) setAiInsight(json.data);
        } else if (isMounted) {
          setIsAiError(true);
          console.info('[RMS AI]',commodityId,json.error||json.errorMessage||json.status);
          setAiErrorMessage('저장된 AI 분석이 없습니다.');
        }
      } catch (err: any) {
        console.warn("Failed to fetch AI analysis, activating fallback state:", err);
        if (isMounted) {
          setIsAiError(true);
          setAiErrorMessage(err.message || 'AI 분석 데이터를 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        if (isMounted) {
          setIsAiLoading(false);
        }
      }
    }

    fetchAiAnalysis();

    return () => {
      isMounted = false;
    };
  }, [selectedCommodity, isSyncing]);

  useEffect(() => {
    if (isWheat || isSoybean || isSoybeanOil || isSugar) return;

    let isMounted = true;

    const fetchPriceHistory = async () => {
      try {
        const res = await fetch(`/api/history?commodity=${commodity.id}&timeframe=${isPalmOil ? '5Y' : activeTimeframe}${isPalmOil ? (isSyncing ? '&force=true' : '') : '&force=true'}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          if (isMounted) {
            setHistoricalData(json);
            if(isPalmOil)setFullYearHistoryData(json);
            lastSuccessfulHistoryRef.current = json;
            setIsHistoryFailed(false);
          }
        } else {
          throw new Error('Invalid historical data');
        }
      } catch (err) {
        console.warn('[CommodityDetail] Price history fetch notice:', err);
        if (isMounted) {
          setIsHistoryFailed(true);
          if (!historicalData && lastSuccessfulHistoryRef.current) {
            setHistoricalData(lastSuccessfulHistoryRef.current);
          }
        }
      }
    };

    fetchPriceHistory();
    const timer=(isPalmOil||isTapiocaStarch)?setInterval(fetchPriceHistory,3600000):null;
    return () => {
      isMounted = false;if(timer)clearInterval(timer);
    };
  }, [commodity.id, isWheat, isPalmOil ? 'saved' : activeTimeframe, isSyncing]);

  // Fetch full multi-year historical price dataset independently of activeTimeframe for 52-week rolling range
  useEffect(() => {
    if (isWheat || isPalmOil || isSoybean || isSoybeanOil || isSugar) return;

    let isMounted = true;

    const fetchFullYearHistory = async () => {
      try {
        const res = await fetch(`/api/history?commodity=${commodity.id}&timeframe=5Y${isPalmOil ? '' : '&force=true'}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          if (isMounted) {
            setFullYearHistoryData(json);
            lastSuccessfulFullYearHistoryRef.current = json;
          }
        }
      } catch (err) {
        console.warn('[CommodityDetail] Multi-year history fetch notice:', err);
        if (isMounted && lastSuccessfulFullYearHistoryRef.current) {
          setFullYearHistoryData(lastSuccessfulFullYearHistoryRef.current);
        }
      }
    };

    fetchFullYearHistory();

    return () => {
      isMounted = false;
    };
  }, [commodity.id, isWheat, isSyncing]);

  useEffect(() => {
    if (!isWheat) return;

    if (!usWheatHistory && lastSuccessfulWheatHistoryRef.current) {
      setUsWheatHistory(lastSuccessfulWheatHistoryRef.current);
    }

    let isMounted = true;

    const fetchWheatPriceHistory = async () => {
      try {
        const url = isSyncing ? '/api/uswheat/price-history?force=true' : '/api/uswheat/price-history';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json: UsWheatPriceHistoryResponse = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          if (isMounted) {
            setUsWheatHistory(json);
            lastSuccessfulWheatHistoryRef.current = json;
            setUsWheatLastRetrieved(json.lastRetrievalTime || '');
            setIsUsWheatFailed(false);
          }
        } else {
          throw new Error(json.errorMessage || 'Invalid U.S. Wheat data');
        }
      } catch (err) {
        console.warn('[CommodityDetail] U.S. Wheat Associates fetch error:', err);
        if (isMounted) {
          setIsUsWheatFailed(true);
          // Retain last successfully loaded data if available
          if (!usWheatHistory && lastSuccessfulWheatHistoryRef.current) {
            setUsWheatHistory(lastSuccessfulWheatHistoryRef.current);
          }
        }
      }
    };

    fetchWheatPriceHistory();
    // Refresh the saved data from the server while the Wheat page is open.
    // Server-side checking is rate-limited to once per 6 hours, not on every poll.
    const interval = setInterval(fetchWheatPriceHistory, 60 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isWheat, isSyncing]);

  useEffect(() => {
    let isMounted = true;

    const fetchAmis = async () => {
      if (!isWheat) return;
      try {
        const url = isSyncing ? '/api/amis/wheat?force=true' : '/api/amis/wheat';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: AmisWheatResponse = await res.json();
        if (!json.success || !json.data) throw new Error(json.errorMessage || 'Invalid AMIS response');
        if (isMounted) {
          setAmisResponse(json);
          lastSuccessfulAmisRef.current = json;
          setIsAmisFailed(false);
        }
      } catch (err) {
        console.warn('[CommodityDetail] AMIS fetch notice:', err);
        if (isMounted) {
          setIsAmisFailed(true);
          if (!amisResponse && lastSuccessfulAmisRef.current) setAmisResponse(lastSuccessfulAmisRef.current);
        }
      }
    };

    const fetchOriginRadar = async () => {
      try {
        const baseEndpoint = isWheat ? '/api/wheat/origin-radar' : isCorn ? '/api/corn/origin-radar' : isSoybean ? '/api/soybean/origin-radar' : `/api/rms/origin-radar-all?commodity=${encodeURIComponent(commodity.id)}`;
        if (!baseEndpoint) return;
        const url = isWheat ? baseEndpoint : (isSyncing ? `${baseEndpoint}${baseEndpoint.includes('?')?'&':'?'}force=true` : baseEndpoint);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.origins) && isMounted) {
          setOriginRadarData(json.origins);
          setOriginRadarCommodityId(commodity.id);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Origin radar fetch notice:', err);
      }
    };

    fetchAmis();
    fetchOriginRadar();
    return () => { isMounted = false; };
  }, [commodity.id, isWheat, isCorn, isSoybean, isSoybeanOil, isSyncing]);

  // Corn SCM Procurement Analysis Fetch Hook
  useEffect(() => {
    if (!isCorn) return;
    let isMounted = true;
    setIsCornLoading(true);

    const fetchCornAnalysis = async () => {
      try {
        const url = isSyncing ? '/api/corn/procurement-analysis?force=true' : '/api/corn/procurement-analysis';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && json.data && isMounted) {
          setCornAnalysis(json.data);
          lastSuccessfulCornAnalysisRef.current = json.data;
          setIsCornLoading(false);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Corn procurement analysis fetch notice:', err);
        if (isMounted) {
          const previous = lastSuccessfulCornAnalysisRef.current;
          if (previous) {
            setCornAnalysis({ ...previous, procurementRisk: {
              ...previous.procurementRisk,
              level: '자료 부족',
              summarySentenceKo: `최신 조달 분석 갱신 실패 (마지막 가격 관측 ${previous.benchmarkPrice.observationDate}). 이전 분석은 참고용입니다.`,
            } });
          } else {
            setCornAnalysis(null);
          }
          setIsCornLoading(false);
        }
      }
    };

    fetchCornAnalysis();
    return () => { isMounted = false; };
  }, [isCorn, isSyncing]);

  // Universal USDA FAS PSD fetch logic for ALL commodities (Corn, Soybeans, Wheat, etc.)
  useEffect(() => {
    let isMounted = true;
    setIsUsdaLoading(true);

    const fetchUsdaPsd = async () => {
      try {
        const forceParam = isSyncing ? '?force=true' : '';
        const res = await fetch(`/api/usda/${commodity.id}${forceParam}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data) {
          if (isMounted) {
            setUsdaData(json.data);
            lastSuccessfulUsdaDataRef.current = json.data;
            setUsdaLastUpdated(json.timestamp || json.data.timestamp || '10:38:34 PM KST');
            setIsUsdaFailed(false);
            setIsUsdaLoading(false);
          }
        } else {
          throw new Error(json.errorMessage || 'Invalid USDA response');
        }
      } catch (err) {
        console.warn('[CommodityDetail] USDA FAS PSD fetch notice:', err);
        if (isMounted) {
          setIsUsdaFailed(true);
          setIsUsdaLoading(false);
          // Retain last successful data on failure
          if (!usdaData && lastSuccessfulUsdaDataRef.current) {
            setUsdaData(lastSuccessfulUsdaDataRef.current);
          }
        }
      }
    };

    fetchUsdaPsd();

    return () => {
      isMounted = false;
    };
  }, [commodity.id, isSyncing]);

  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const forceParam = isSyncing ? '&force=true' : '';
        const res = await fetch(`/api/pipeline/telemetry?commodity=${commodity.id}${forceParam}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.wasde && isMounted) {
          setWasdeTelemetry(json.wasde);
          lastSuccessfulWasdeTelemetryRef.current = json.wasde;
          setIsWasdeTelemetryFailed(false);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Telemetry WASDE fetch notice:', err);
        if (isMounted) {
          setIsWasdeTelemetryFailed(true);
          if (lastSuccessfulWasdeTelemetryRef.current) {
            setWasdeTelemetry(lastSuccessfulWasdeTelemetryRef.current);
          }
        }
      }
    };

    fetchTelemetry();

    return () => {
      isMounted = false;
    };
  }, [commodity.id, isSyncing]);

  const stockToUseRatio =
    (usdaData?.stocksToUseRatioPct ? `${usdaData.stocksToUseRatioPct}%` : null) ||
    (wasdeTelemetry?.endingStocks?.stuRatio ? wasdeTelemetry.endingStocks.stuRatio : null) ||
    commodity.wasdeLedger?.find((l) => l.item.includes('재고율'))?.reportNov ||
    commodity.wasdeKpis?.endingStocks?.outlook ||
    '-';

  // Wheat benchmark is the verified HRW weekly price in USD/MT.
  const hrwData = useMemo(() => {
    if (!isWheat || !usWheatHistory?.data?.length) return null;
    const points = usWheatHistory.data;
    const latest = points[points.length - 1];
    const prev = points.length >= 2 ? points[points.length - 2] : null;
    const absoluteChangeMt = prev ? Number((latest.hrwMt - prev.hrwMt).toFixed(2)) : null;
    const wowPct = prev && prev.hrwMt !== 0
      ? Number((((latest.hrwMt - prev.hrwMt) / prev.hrwMt) * 100).toFixed(2))
      : null;
    const direction: 'up' | 'down' | 'unchanged' =
      absoluteChangeMt == null || absoluteChangeMt === 0 ? 'unchanged' : absoluteChangeMt > 0 ? 'up' : 'down';

    return {
      latestPriceMt: latest.hrwMt,
      absoluteChangeMt,
      wowPct,
      direction,
      contractMonth: latest.contractMonth || usWheatHistory.metrics?.hrw?.contractMonth || '',
      reportDate: latest.reportDate || usWheatHistory.reportDate,
      prevReportDate: prev?.reportDate,
      source: usWheatHistory.source || 'U.S. Wheat Associates',
    };
  }, [isWheat, usWheatHistory]);

  // Tapioca Starch 3-Month Change: (latest price - actual TTSA price closest to 12 weeks earlier) / previous price * 100
  const tapioca3mChange = useMemo(() => {
    if (!isTapiocaStarch) return null;
    const series = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : (historicalData?.data && historicalData.data.length > 0)
      ? historicalData.data
      : null;

    let rawSeries = series?.map((d) => ({ date: d.date, price: d.usdPerMT })) || [];
    if (rawSeries.length === 0) {
      rawSeries = tapiocaCacheFallback.weeklyPrices.filter((p:any)=>!p.isSynthetic && Date.parse(p.date)<=Date.now()).map(p=>({date:p.date,price:p.price}));
    }

    if (rawSeries.length === 0) return null;

    const latestPoint = rawSeries[rawSeries.length - 1];
    const latestDate = new Date(latestPoint.date).getTime();
    // 12 weeks earlier (84 days)
    const target12wDate = latestDate - 12 * 7 * 24 * 60 * 60 * 1000;

    let closestPoint = rawSeries[0];
    let minDiff = Infinity;
    for (const pt of rawSeries) {
      const diff = Math.abs(new Date(pt.date).getTime() - target12wDate);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = pt;
      }
    }

    const latestPrice = latestPoint.price;
    const prevPrice = closestPoint.price;
    const absoluteChange = Number((latestPrice - prevPrice).toFixed(2));
    const pctChange = prevPrice !== 0 ? Number((((latestPrice - prevPrice) / prevPrice) * 100).toFixed(2)) : 0;
    const direction: 'up' | 'down' | 'unchanged' = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'unchanged';

    return {
      latestPrice,
      latestDate: latestPoint.date,
      prevPrice,
      prevDate: closestPoint.date,
      absoluteChange,
      pctChange,
      direction
    };
  }, [isTapiocaStarch, fullYearHistoryData, historicalData]);

  const palmMetrics = useMemo(() => {
    if (!isPalmOil) return null;

    const pts = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : (historicalData?.data && historicalData.data.length > 0)
      ? historicalData.data
      : palmOilCacheFallback.historicalSeries;

    if (!pts || pts.length < 2) {
      return null;
    }

    const cpoMoves=observedPriceChanges(pts.map((p:any)=>({date:p.date,usdPerMT:palmCpoUsdPerMt(p),isSynthetic:p.isSynthetic})));
    const oleinMoves=observedPriceChanges(pts.map((p:any)=>({date:p.date,usdPerMT:p.oleinUsdPerMt ?? p.oleinUsd,isSynthetic:p.isSynthetic})));
    const cpoWowPct=cpoMoves.wow.pct, cpoMomPct=cpoMoves.mom.pct;
    const cpoWowChangeMt=cpoMoves.wow.amountUsdMt ?? 0, cpoMomChangeMt=cpoMoves.mom.amountUsdMt ?? 0;
    const oleinWowPct=oleinMoves.wow.pct, oleinMomPct=oleinMoves.mom.pct;
    const oleinWowChangeMt=oleinMoves.wow.amountUsdMt ?? 0, oleinMomChangeMt=oleinMoves.mom.amountUsdMt ?? 0;

    const cpoWowChangeConv = currency === 'KRW' ? Math.round(cpoWowChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((cpoWowChangeMt / liveEurUsd).toFixed(2)) : cpoWowChangeMt;
    const cpoMomChangeConv = currency === 'KRW' ? Math.round(cpoMomChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((cpoMomChangeMt / liveEurUsd).toFixed(2)) : cpoMomChangeMt;

    const oleinWowChangeConv = currency === 'KRW' ? Math.round(oleinWowChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((oleinWowChangeMt / liveEurUsd).toFixed(2)) : oleinWowChangeMt;
    const oleinMomChangeConv = currency === 'KRW' ? Math.round(oleinMomChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((oleinMomChangeMt / liveEurUsd).toFixed(2)) : oleinMomChangeMt;

    return {
      cpo: {
        wowPct: cpoWowPct,
        wowChangeConv: cpoWowChangeConv,
        momPct: cpoMomPct,
        momChangeConv: cpoMomChangeConv,
      },
      olein: {
        wowPct: oleinWowPct,
        wowChangeConv: oleinWowChangeConv,
        momPct: oleinMomPct,
        momChangeConv: oleinMomChangeConv,
      }
    };
  }, [isPalmOil, fullYearHistoryData, historicalData, currency, liveUsdKrw, liveEurUsd, cpoPrice]);

  const amisData = amisResponse?.data;

  const nonWheatRisk = useMemo(() => {
    const rows = (commodity.originsLedger || []) as any[];
    const high = rows.find((row) => row.riskLevel === 'High' || row.statusColor === 'red');
    const medium = rows.find((row) => row.riskLevel === 'Medium' || row.statusColor === 'yellow');
    const selected = high || medium || rows[0];
    return {
      level: high ? '경계' : medium ? '주의' : '안정',
      summary: selected?.riskAssessment || '현재 확인된 주요 조달 리스크 없음',
    } as { level: '안정' | '주의' | '경계'; summary: string };
  }, [commodity.originsLedger]);

  const [livePotatoData, setLivePotatoData] = useState<any>({years:IMPORTED_POTATO_PRODUCTION});
  useEffect(() => {
    if (!isPotatoStarch) return;
    let isMounted = true;
    const fetchLivePotatoProduction = async () => {
      try {
        const url = isSyncing ? '/api/potato-starch/production?force=true' : '/api/potato-starch/production';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data && isMounted) {
            setLivePotatoData(json.data);
          }
        }
      } catch (err) {
        console.warn('[CommodityDetail] Live potato production fetch notice:', err);
      }
    };
    fetchLivePotatoProduction();
    const timer=setInterval(fetchLivePotatoProduction,3600000);
    return () => { isMounted = false;clearInterval(timer); };
  }, [isPotatoStarch, isSyncing]);

  const procurementRiskLevel: '안정' | '주의' | '경계' | '자료 부족' | '제한 평가' = isWheat
    ? (amisData?.macroRiskLevel || '주의')
    : isPotatoStarch
    ? '자료 부족'
    : isCorn
    ? (cornAnalysis?.procurementRisk?.level || '자료 부족')
    : isSoybean
    ? (soybeanAnalysis?.procurementRisk?.level || '자료 부족')
    : isSoybeanOil
    ? (soybeanOilAnalysis?.procurementRisk?.level || '자료 부족')
    : '자료 부족';
  const procurementRiskSummary = isWheat
    ? (amisData?.macroRiskSentenceKo || 'AMIS 최신 소맥 리스크 요약 연동 대기')
    : isPotatoStarch
    ? (livePotatoData?.summary || '원료감자 생산량은 전분 공급량·가격의 대리지표입니다. 검증된 전분 수급·실물 오퍼가 없어 위험 판단을 보류합니다.')
    : isCorn
    ? (cornAnalysis?.procurementRisk?.summarySentenceKo || '최신 조달 리스크 분석을 확인할 수 없습니다. 공급사 오퍼와 공식 수급 자료를 확인하세요.')
    : isSoybean
    ? (soybeanAnalysis?.procurementRisk?.summarySentenceKo || '최신 대두 가격·공식 수급 자료를 확인할 수 없습니다. 조달 판단 전 자료를 확인하세요.')
    : isSoybeanOil
    ? (soybeanOilAnalysis?.procurementRisk?.summarySentenceKo || '공식 수급과 실제 공급사 견적 확인 전 조달 위험 판단 보류')
    : '산지 공급·현물 오퍼·운임·환율의 충분한 교차 근거가 없어 위험 분류를 보류합니다.';

  // One authoritative recommendation per page: the verified, source-grounded AI
  // recommendation takes precedence once available. Deterministic procurement
  // guidance is the fallback, never a competing second desk recommendation.
  const activeDeskRecommendation =
    aiInsight?.deskRecommendation ||
    (isCorn && cornAnalysis?.deskRecommendation?.recommendation) ||
    (isSoybean && soybeanAnalysis?.deskRecommendation?.recommendation) ||
    (isSoybeanOil && (soybeanOilAnalysis?.deskRecommendation?.recommendation||'검증 자료 재확인 후 구매 판단')) ||
    (!isWheat && !isCorn && !isSoybean && !isSoybeanOil && '현물 견적 비교 후 구매 검토') ||
    (aiInsight as any)?.recommendation ||
    (isWheat
      ? (hrwData?.wowPct != null && hrwData.wowPct <= -1.5 ? '분할 구매 검토' : procurementRiskLevel === '경계' ? '일부 물량 선확보 검토' : '현 수준 관망')
      : isCorn
      ? '45~60일 분할 구매 권고'
      : isSoybean
      ? '45~60일 분할 구매 권고'
      : isSoybeanOil
      ? '검증 자료 재확인 후 구매 판단'
      : commodity.recommendedCoverage || '현 수준 관망');

  // A single verified pipeline owns each Origin Radar. Never fall back to
  // sample values in COMMODITY_ORIGINS_MAP or old Gemini-generated overlays.
  const combinedOrigins = useMemo(() =>
    originRadarCommodityId === commodity.id ? (originRadarData || []) : [],
    [commodity.id, originRadarData, originRadarCommodityId]);

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [crosshairState, setCrosshairState] = useState<{
    active: boolean;
    xPct: number;
    yPct: number;
    svgX: number;
    svgY: number;
    snappedX: number;
    snappedY: number;
    date: string;
    price: number;
    elevationPrice: number;
    isSynthetic?: boolean;
  } | null>(null);

  const [wheatCrosshairState, setWheatCrosshairState] = useState<{
    active: boolean;
    xPct: number;
    svgX: number;
    snappedX: number;
    reportDate: string;
    contractMonth: string;
    srwMt: number;
    hrwMt: number;
    hrsMt: number;
    srwBu: number;
    hrwBu: number;
    hrsBu: number;
    ySrw: number;
    yHrw: number;
    yHrs: number;
  } | null>(null);

  const [palmCrosshairState, setPalmCrosshairState] = useState<{
    active: boolean;
    xPct: number;
    svgX: number;
    snappedX: number;
    date: string;
    cpoPrice: number;
    oleinPrice: number;
    yCpo: number;
    yOlein: number;
  } | null>(null);

  const exchange = getExchangeInfo(commodity.id);

  const latestHistoricalData = !isWheat && historicalData?.data && historicalData.data.length > 0
    ? historicalData.data[historicalData.data.length - 1]
    : null;

  // Use the same canonical quote and FX snapshot as Overview; no local price override.
  const effectiveBasePrice = commodity.price;

  const dynamicKpiMetrics = useMemo(() => {
    // Percentage and absolute moves come from the same dated source observations.
    // Use the *same* FX factor that converted the canonical card price.
    const wowPct = isPotatoStarch ? null : commodity.changeWoW ?? null;
    const momPct = isPotatoStarch ? null : commodity.changeMoM ?? null;
    const originalPrice = commodity._originalPrice;
    const fxFactor = originalPrice != null && originalPrice > 0 && effectiveBasePrice > 0
      ? effectiveBasePrice / originalPrice : null;
    const convertedMove = (usdMt: number | null | undefined): number | null =>
      usdMt != null && Number.isFinite(usdMt) && fxFactor != null
        ? usdMt * fxFactor : null;
    return {
      wowPct, momPct,
      wowAmount: wowPct == null ? null : convertedMove(commodity._canonicalWowUsdMt),
      momAmount: momPct == null ? null : convertedMove(commodity._canonicalMomUsdMt),
    };
  }, [commodity, effectiveBasePrice]);

  // Removed: per-page calculations must never write into the shared Overview snapshot.

  // Universal Single-Commodity Historical Time-Series Chart Data from Yahoo Finance / TTSA / Eurostat
  const historicalChartData = useMemo(() => {
    if (isWheat || ((isSoybeanOil||isSugar)&&!Number.isFinite(soybeanFactor))) {
      return null;
    }

    // Dynamic series merging logic: Combine baseline cached JSON history with live server telemetry items
    const baseItems: Array<{ date: string; usdPerMT: number; centsPerBushel?: number; isSynthetic?: boolean }> = [];
    if (isTapiocaStarch && tapiocaCacheFallback && Array.isArray(tapiocaCacheFallback.weeklyPrices)) {
      tapiocaCacheFallback.weeklyPrices.forEach((item: any) => {
        baseItems.push({
          date: item.date,
          usdPerMT: item.price,
          centsPerBushel: item.price,
          isSynthetic: !!item.isSynthetic,
        });
      });
    }

    const liveItems = (historicalData && Array.isArray(historicalData.data)) ? historicalData.data : [];

    if (baseItems.length === 0 && liveItems.length === 0) {
      return null;
    }

    // Deduplicate entries by date (YYYY-MM-DD or YYYY.MM.DD)
    const dateMap = new Map<string, any>();
    baseItems.forEach((p) => {
      const d = String(p.date).replace(/\./g, '-');
      dateMap.set(d, { ...p, date: d });
    });
    liveItems.forEach((p) => {
      const d = String(p.date).replace(/\./g, '-');
      const prev = dateMap.get(d) || {};
      dateMap.set(d, { ...prev, ...p, date: d });
    });

    // Automatically sort the combined array chronologically
    const allPoints = Array.from(dateMap.values()).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Filter strictly by activeTimeframe calendar bounds
    const filtered = filterSeriesByTimeframe(allPoints.filter(p=>!p.isSynthetic && Number.isFinite(p.usdPerMT) && p.usdPerMT>0 && Date.parse(p.date)<=Date.now()), activeTimeframe);
    if (filtered.length === 0) return null;

    const convRate = (isSoybean||isSoybeanOil||isSugar) ? soybeanFactor : currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;

    let pointsData = filtered.map((p, i) => {
      const convPrice = p.usdPerMT * convRate;
      const windowStart = Math.max(0, i - 4);
      const windowPoints = filtered.slice(windowStart, i + 1);
      const maPrice = (windowPoints.reduce((acc, curr) => acc + curr.usdPerMT, 0) / windowPoints.length) * convRate;
      return {
        date: p.date.replace(/-/g, '.'),
        price: convPrice,
        maPrice,
        usdPerMT: p.usdPerMT,
        isSynthetic: (p as any).isSynthetic || false,
      };
    });

    const width = 500;
    const height = 200;

    const getTs = (dStr: string) => new Date(dStr.replace(/\./g, '-')).getTime();
    const timestamps = pointsData.map(p => getTs(p.date)).filter(t => !isNaN(t));
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : 1;
    const timeRange = maxTime - minTime || 1;

    const calcX = (dateStr: string) => {
      if (timeRange === 0) return 250;
      const t = getTs(dateStr);
      return Math.round(((t - minTime) / timeRange) * width);
    };

    const formatDateFromTs = (ts: number): string => {
      const d = new Date(ts);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    let axisLabels: [string, string, string, string] = [
      formatDateFromTs(minTime),
      formatDateFromTs(minTime + timeRange * 0.33),
      formatDateFromTs(minTime + timeRange * 0.66),
      formatDateFromTs(maxTime),
    ];

    const low = Math.min(...pointsData.map((pt) => pt.price));
    const high = Math.max(...pointsData.map((pt) => pt.price));
    const avg = pointsData.reduce((sum, val) => sum + val.price, 0) / pointsData.length;

    const padTop = 10;
    const padBottom = 15;
    const usableHeight = height - padTop - padBottom;

    const initialMin = low * 0.95;
    const initialMax = high * 1.08;
    const initialRange = initialMax - initialMin || 1;

    const tempChartPoints: ChartPoint[] = pointsData.map((pt) => {
      const x = calcX(pt.date);
      const y = Math.round(height - padBottom - ((pt.price - initialMin) / initialRange) * usableHeight);
      return {
        date: pt.date,
        price: pt.price,
        usdPerMT: pt.usdPerMT,
        isSynthetic: pt.isSynthetic,
        x,
        y,
      };
    });

    // 1. Find max price in current dataset
    const maxPricePoint = Math.max(...tempChartPoints.map(p => p.price), high);

    // 2. Pad maxVal by 10% so the line has room at the top
    const minVal = Math.min(...tempChartPoints.map(p => p.price)) * 0.95;
    const maxVal = maxPricePoint * 1.10; 
    const valRange = maxVal - minVal || 1;

    const chartPoints: ChartPoint[] = pointsData.map((pt) => {
      const x = calcX(pt.date);
      const y = Math.round(height - padBottom - ((pt.price - minVal) / valRange) * usableHeight);
      return {
        date: pt.date,
        price: pt.price,
        usdPerMT: pt.usdPerMT,
        isSynthetic: pt.isSynthetic,
        x,
        y,
      };
    });

    const maCoords = pointsData.map((pt) => {
      const x = calcX(pt.date);
      const y = Math.round(height - padBottom - ((pt.maPrice - minVal) / valRange) * usableHeight);
      return { x, y };
    });

    const linePath = chartPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');
    const areaPath = `${linePath} L ${width},200 L 0,200 Z`;
    const maPath = maCoords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');

    // 3. Generate 5 nice Y-axis ticks between minVal and maxVal
    const tickStep = (maxVal - minVal) / 4;
    const ticks: ChartTick[] = [0, 1, 2, 3, 4].map(i => {
      const value = minVal + tickStep * i;
      const y = height - padBottom - ((value - minVal) / (maxVal - minVal)) * usableHeight;
      return { value, y };
    });

    return {
      points: chartPoints,
      linePath,
      areaPath,
      maPath,
      minVal,
      maxVal,
      high,
      low,
      avg,
      ticks,
      axisLabels,
    };
  }, [isWheat, historicalData, activeTimeframe, currency, exchangeRate, soybeanFactor, commodity, latestHistoricalData]);

  const potatoProductionChartData = useMemo(() => {
    if (!isPotatoStarch) return null;

    // Germany, France, Netherlands, Denmark
    // 2022: 27.53, 2023: 29.16, 2024: 31.42, 2025: 30.00, 2026E: 27.60
    const fullData = livePotatoData?.years ? livePotatoData.years.map((y: any) => ({
      date: `${y.year} ${y.status === 'Actual' ? 'Actual' : 'Estimate'}`,
      price: y.productionMMT,
      isEstimate: y.status === 'Estimate'
    })) : IMPORTED_POTATO_PRODUCTION.map(y=>({date:y.year+' '+y.status,price:y.productionMMT,isEstimate:y.status==='Estimate'}));

    // Filter strictly by active timeframe:
    let rawData = fullData;
    if (activeTimeframe === '6M') {
      rawData = fullData.slice(-2); // 2025 -> 2026
    } else if (activeTimeframe === '1Y') {
      rawData = fullData.slice(-3); // 2024 -> 2025 -> 2026
    } else if (activeTimeframe === '3Y') {
      rawData = fullData.slice(-4); // 2023 -> 2024 -> 2025 -> 2026
    } else if (activeTimeframe === '5Y') {
      rawData = fullData;          // 2021 -> 2022 -> 2023 -> 2024 -> 2025 -> 2026
    }

    const N = rawData.length;
    if (N < 1) return null;
    const allPrices = rawData.map(d => d.price);
    const low = Math.min(...allPrices);
    const high = Math.max(...allPrices);
    const avg = allPrices.reduce((sum, val) => sum + val, 0) / N;

    const width = 500;
    const height = 200;
    const padTop = 10;
    const padBottom = 15;
    const usableHeight = height - padTop - padBottom;

    const margin=Math.max(1,(high-low)*0.15);
    const minVal = Math.min(25,low-margin);
    const maxVal = Math.max(34,high+margin);
    const valRange = maxVal - minVal;

    const chartPoints = rawData.map((pt, idx) => {
      const x = N>1?Math.round((idx / (N - 1)) * width):width/2;
      const y = Math.round(height - padBottom - ((pt.price - minVal) / valRange) * usableHeight);
      return {
        date: pt.date,
        price: pt.price,
        usdPerMT: pt.price,
        isEstimate: pt.isEstimate,
        x,
        y,
      };
    });

    const linePath = chartPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');
    const areaPath = `${linePath} L ${width},200 L 0,200 Z`;

    const ticks = [26.0, 28.0, 30.0, 32.0, 34.0].map(val => {
      const y = Math.round(height - padBottom - ((val - minVal) / valRange) * usableHeight);
      return { value: val, y };
    });

    let axisLabels: [string, string, string, string];

    if (N === 1) {
      axisLabels = [rawData[0].date,'','',''];
    } else if (N === 2) {
      axisLabels = [rawData[0].date, '', '', rawData[1].date];
    } else if (N === 3) {
      axisLabels = [rawData[0].date, rawData[1].date, '', rawData[2].date];
    } else if (N === 4) {
      axisLabels = [rawData[0].date, rawData[1].date, rawData[2].date, rawData[3].date];
    } else {
      axisLabels = [
        rawData[0].date,
        rawData[1].date,
        rawData[Math.floor(N / 2)].date,
        rawData[N - 1].date
      ];
    }

    return {
      points: chartPoints,
      linePath,
      areaPath,
      maPath: '',
      minVal,
      maxVal,
      high,
      low,
      avg,
      ticks,
      axisLabels,
    };
  }, [isPotatoStarch, activeTimeframe, livePotatoData]);

  const chartData = useMemo(() => {
    if (isPotatoStarch && potatoProductionChartData) {
      return potatoProductionChartData;
    }
    if (!isWheat && historicalChartData) {
      return historicalChartData;
    }
    // Never invent a price curve when the verified history source has no observations.
    return null;
  }, [isWheat, isPotatoStarch, potatoProductionChartData, historicalChartData]);

  // U.S. Wheat Associates Historical Time-Series Chart Data (SRW, HRW, HRS)
  const wheatChartData = useMemo(() => {
    if (!isWheat) return null;

    // Use strictly real live data from U.S. Wheat Associates
    const liveItems = (usWheatHistory && Array.isArray(usWheatHistory.data)) ? usWheatHistory.data : [];

    if (liveItems.length === 0) return null;

    const dateMap = new Map<string, UsWheatHistoryDataPoint>();

    liveItems.forEach((p) => {
      if (!p) return;
      const rawDate = String(p.date || p.reportDate || '').trim();
      const d = rawDate.replace(/\./g, '-');
      if (!d) return;

      const srwMt = Number(p.srwMt) || (Number(p.srwBu) > 0 ? Number(p.srwBu) * 36.7437 : NaN);
      const hrwMt = Number(p.hrwMt) || (Number(p.hrwBu) > 0 ? Number(p.hrwBu) * 36.7437 : NaN);
      const hrsMt = Number(p.hrsMt) || (Number(p.hrsBu) > 0 ? Number(p.hrsBu) * 36.7437 : NaN);
      if (![srwMt, hrwMt, hrsMt].every(n => Number.isFinite(n) && n > 0)) return;

      dateMap.set(d, {
        ...p,
        reportDate: d,
        date: d,
        srwMt,
        hrwMt,
        hrsMt
      });
    });

    // Sort live reports chronologically
    let cleanPoints = Array.from(dateMap.values()).sort((a, b) => {
      return new Date(a.reportDate.replace(/\./g, '-')).getTime() - new Date(b.reportDate.replace(/\./g, '-')).getTime();
    });

    // Filter by active timeframe (1M, 3M, 6M, 1Y) with a 5-point minimum floor for 1M
    let activeWheatPoints = filterSeriesByTimeframe(cleanPoints, activeTimeframe);
    if (activeTimeframe === '1M' && activeWheatPoints.length < 5) {
      activeWheatPoints = cleanPoints.slice(Math.max(0, cleanPoints.length - 6));
    }

    if (activeWheatPoints.length < 2) return null;

    const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
    const allPrices = activeWheatPoints.flatMap((p) => [p.srwMt * convRate, p.hrwMt * convRate, p.hrsMt * convRate]);
    const absoluteHigh = Math.max(...allPrices);
    const absoluteLow = Math.min(...allPrices);
    const paddingBuffer = (absoluteHigh - absoluteLow) * 0.08 || absoluteHigh * 0.08;
    const minVal = Math.max(0, absoluteLow - paddingBuffer);
    const maxVal = absoluteHigh + paddingBuffer;
    const range = maxVal - minVal || 1;

    const usableHeight = 150 - 25 - 25;

    const getTs = (dStr: string) => new Date(dStr.replace(/\./g, '-')).getTime();
    const timestamps = activeWheatPoints.map(p => getTs(p.reportDate)).filter(t => !isNaN(t));
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : 1;
    const timeRange = maxTime - minTime || 1;

    const formatDateFromTs = (ts: number): string => {
      const d = new Date(ts);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    const coordPoints = activeWheatPoints.map((p) => {
      const convSrwMt = p.srwMt * convRate;
      const convHrwMt = p.hrwMt * convRate;
      const convHrsMt = p.hrsMt * convRate;

      const t = getTs(p.reportDate);
      const x = timeRange > 0 ? Math.round(((t - minTime) / timeRange) * 500 * 10) / 10 : 250;
      const ySrw = Math.round((150 - 25 - ((convSrwMt - minVal) / range) * usableHeight) * 10) / 10;
      const yHrw = Math.round((150 - 25 - ((convHrwMt - minVal) / range) * usableHeight) * 10) / 10;
      const yHrs = Math.round((150 - 25 - ((convHrsMt - minVal) / range) * usableHeight) * 10) / 10;
      return {
        ...p,
        srwMt: convSrwMt,
        hrwMt: convHrwMt,
        hrsMt: convHrsMt,
        rawSrwMt: p.srwMt,
        rawHrwMt: p.hrwMt,
        rawHrsMt: p.hrsMt,
        x,
        ySrw,
        yHrw,
        yHrs
      };
    });

    const buildSmoothSplinePath = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return '';
      let path = `M ${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        const cpX = Math.round((curr.x + next.x) / 2);
        path += ` C ${cpX},${curr.y} ${cpX},${next.y} ${next.x},${next.y}`;
      }
      return path;
    };

    const srwLinePath = buildSmoothSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.ySrw })));
    const hrwLinePath = buildSmoothSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.yHrw })));
    const hrsLinePath = buildSmoothSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.yHrs })));

    const srwAreaPath = `${srwLinePath} L 500,150 L 0,150 Z`;

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const val = Math.round(minVal + ((maxVal - minVal) / (tickCount - 1)) * (tickCount - 1 - i));
      const y = 25 + (usableHeight / (tickCount - 1)) * i;
      return { value: val, y };
    });

    const axisLabels = [
      formatDateFromTs(minTime),
      formatDateFromTs(minTime + timeRange * 0.33),
      formatDateFromTs(minTime + timeRange * 0.66),
      formatDateFromTs(maxTime)
    ];

    const high = Math.max(...allPrices);
    const low = Math.min(...allPrices);
    const avg = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;

    const latestPoint = coordPoints[coordPoints.length - 1];


    return {
      points: coordPoints,
      srwLinePath,
      hrwLinePath,
      hrsLinePath,
      srwAreaPath,
      minVal,
      maxVal,
      high,
      low,
      avg,
      ticks,
      axisLabels,
      latestPoint,
    };
  }, [isWheat, usWheatHistory, activeTimeframe, currency, exchangeRate]);

  // Calculate period change percentage whenever active time series data updates
  const periodPctChange = useMemo(() => {
    if (isPalmOil && palmChartData?.points && palmChartData.points.length > 0) {
      const activeData = palmChartData.points.filter(p=>Number.isFinite(p.cpoPrice));
      const startPrice = activeData[0]?.cpoPrice ?? 0;
      const currentPrice = activeData[activeData.length - 1]?.cpoPrice ?? 0;
      return startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
    }

    if (!isWheat && historicalData?.data && historicalData.data.length > 0) {
      const firstPoint = historicalData.data[0]?.usdPerMT || 1;
      const lastPoint = historicalData.data[historicalData.data.length - 1]?.usdPerMT || 1;
      return firstPoint !== 0 ? ((lastPoint - firstPoint) / firstPoint) * 100 : 0;
    }

    if (isWheat && wheatChartData?.points && wheatChartData.points.length > 0) {
      const activeData = wheatChartData.points as any[];
      const startPrice = activeData[0]?.hrwMt ?? activeData[0]?.usdPerMT ?? 0;
      const currentPrice = activeData[activeData.length - 1]?.hrwMt ?? activeData[activeData.length - 1]?.usdPerMT ?? 0;
      return startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
    }

    if (chartData?.points && chartData.points.length > 0) {
      const activeData = chartData.points as any[];
      const startPrice = activeData[0]?.usdPerMT ?? activeData[0]?.price ?? 0;
      const currentPrice = activeData[activeData.length - 1]?.usdPerMT ?? activeData[activeData.length - 1]?.price ?? 0;
      return startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
    }

    return 0;
  }, [isWheat, isPalmOil, palmChartData, historicalData, wheatChartData, chartData]);

  const livePoint = chartData?.points?.length
    ? chartData.points[chartData.points.length - 1]
    : null;
  const latestLivePrice = livePoint?.price ?? null;
  // The canonical quote and the historical chart can have different observation times.
  // Never overwrite one with the other or silently label both as the same live price.
  const chartQuoteDiffers = isCorn && latestLivePrice != null && effectiveBasePrice > 0 &&
    Math.abs(latestLivePrice - effectiveBasePrice) >= (currency === 'KRW' ? 1 : 0.01);
  const liveY = livePoint?.y ?? 0;

  const range52WeekStats = useMemo(() => {
    if (isWheat && usWheatHistory?.data?.length) {
      const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
      const prices = usWheatHistory.data.map((d) => d.hrwMt * convRate).filter((v) => Number.isFinite(v));
      if (prices.length > 0) {
        const current = prices[prices.length - 1];
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const pct = high > low ? Math.max(0, Math.min(100, Math.round(((current - low) / (high - low)) * 100))) : 50;
        const zone = pct > 70 ? '고평가 구간' : pct < 30 ? '저평가 구간' : '안정 구간';
        return { current, high, low, pct, zone };
      }
    }

    if (isPalmOil) {
      const fullPalmData = fullYearHistoryData?.data && fullYearHistoryData.data.length > 0
        ? fullYearHistoryData.data
        : null;

      if (fullPalmData) {
        const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
        const last365Days = fullPalmData.filter((pt) => new Date(pt.date).getTime() >= oneYearAgoMs);
        const active365 = last365Days.length > 0 ? last365Days : fullPalmData;
        const cpoPrices = active365.map((p: any) => p.cpoUsd ?? p.usdPerMT).filter((v: number) => Number.isFinite(v) && v > 0);
        if (cpoPrices.length > 0) {
          const high = Math.max(...cpoPrices);
          const low = Math.min(...cpoPrices);
          const current = cpoPrice;
          let pct = 50;
          if (high > low) {
            pct = Math.max(0, Math.min(100, Math.round(((current - low) / (high - low)) * 100)));
          }
          const zone = pct > 70 ? '고평가 구간' : pct < 30 ? '저평가 구간' : '안정 구간';
          return { current, high, low, pct, zone };
        }
      }

      if (palmChartData) {
        const current = cpoPrice;
        const high = palmChartData.high;
        const low = palmChartData.low;
        let pct = 50;
        if (high > low) {
          pct = Math.max(0, Math.min(100, Math.round(((current - low) / (high - low)) * 100)));
        }
        const zone = pct > 70 ? '고평가 구간' : pct < 30 ? '저평가 구간' : '안정 구간';
        return { current, high, low, pct, zone };
      }
    }

    // Dynamic Rolling 52-Week (365 Days) Dataset for 52-Week Range Percentile
    const fullScrapedDataset = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : historicalData?.data || [];

    if (!isWheat && fullScrapedDataset.length > 0) {
      const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const last365DaysData = fullScrapedDataset.filter(
        (pt) => new Date(pt.date).getTime() >= oneYearAgoMs
      );

      const active365Data = last365DaysData.length > 0 ? last365DaysData : fullScrapedDataset;

      const convRate = (isSoybean||isSoybeanOil||isSugar) ? soybeanFactor : currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
      const validUsdPrices = active365Data.map((p) => p.usdPerMT).filter((v) => Number.isFinite(v) && v > 0);
      const low52W = validUsdPrices.length > 0 ? Math.min(...validUsdPrices) : 100;
      const high52W = validUsdPrices.length > 0 ? Math.max(...validUsdPrices) : 1000;

      // Use the exact same currency-adjusted benchmark shown in the top price card.
      // AI analysis benchmarks and the historical series can be from older snapshots;
      // using either here made the 52-week "Current" value disagree with the main card.
      // Keep 52-week low/high sourced from the historical observations above.
      const current = effectiveBasePrice;
      const high = high52W * convRate;
      const low = low52W * convRate;

      let pct = 50;
      if (high > low) {
        pct = Math.max(0, Math.min(100, Math.round(((current - low) / (high - low)) * 100)));
      }
      const zone = pct > 70 ? '고평가 구간' : pct < 30 ? '저평가 구간' : '안정 구간';

      return {
        current,
        high,
        low,
        pct,
        zone,
      };
    }

    const current = effectiveBasePrice;
    const low = current * 0.88;
    const high = current * 1.22;
    const pct = 42;
    return { current, high, low, pct, zone: '안정 구간' };
  }, [
    isWheat,
    isPalmOil,
    usWheatHistory,
    fullYearHistoryData,
    soybeanFactor,
    historicalData,
    palmChartData,
    cpoPrice,
    effectiveBasePrice,
    currency,
    exchangeRate
  ]);

  const palm52WeekStats = useMemo(() => {
    if(!isPalmOil)return null;
    const rows=fullYearHistoryData?.data?.length?fullYearHistoryData.data:palmObservedSeries;
    const cpo=palmClosingRange(rows,'cpo'),olein=palmClosingRange(rows,'olein');
    if(!cpo||!olein)return null;
    const convert=(value:number)=>currency==='KRW'?Math.round(value*palmDisplayRate):Number((value*palmDisplayRate).toFixed(2));
    return {cpoCurrent:convert(cpo.current),cpoLow:convert(cpo.low),cpoHigh:convert(cpo.high),cpoPct:cpo.pct,
      oleinCurrent:convert(olein.current),oleinLow:convert(olein.low),oleinHigh:convert(olein.high),oleinPct:olein.pct};
  }, [isPalmOil,fullYearHistoryData,palmObservedSeries,currency,palmDisplayRate]);

  const wheat52WeekStats = useMemo(() => {
    if (!isWheat || !usWheatHistory?.data?.length) return null;
    const allPts = [...usWheatHistory.data].filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date)).sort((a,b) => a.date.localeCompare(b.date));
    if (!allPts.length) return null;
    const latestMs = Date.parse(`${allPts[allPts.length - 1].date}T00:00:00Z`);
    const valid = allPts.filter(p => Date.parse(`${p.date}T00:00:00Z`) >= latestMs - 365 * 86400000);
    const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
    const stats = (key: 'srwMt' | 'hrwMt' | 'hrsMt') => {
      const values = valid.map(p => p[key]).filter(v => Number.isFinite(v) && v > 0);
      if (values.length === 0) return null;
      const current = values[values.length - 1];
      const low = Math.min(...values), high = Math.max(...values);
      const pct = high > low ? Math.max(0,Math.min(100,Math.round(((current-low)/(high-low))*100))) : 50;
      return {current:current*convRate,low:low*convRate,high:high*convRate,pct};
    };
    const srw=stats('srwMt'),hrw=stats('hrwMt'),hrs=stats('hrsMt');
    return srw && hrw && hrs ? {srw,hrw,hrs} : null;
  }, [isWheat, usWheatHistory, currency, exchangeRate]);

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const offsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const xRatio = offsetX / rect.width;
    const yRatio = offsetY / rect.height;

    const svgX = xRatio * 500;
    const svgY = yRatio * 150;

    // Dedicated handler for U.S. Wheat Associates 3-line chart
    if (isWheat && wheatChartData && wheatChartData.points.length > 0) {
      const pts = wheatChartData.points;
      let closest = pts[0];
      let minDiff = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const diff = Math.abs(pts[i].x - svgX);
        if (diff < minDiff) {
          minDiff = diff;
          closest = pts[i];
        }
      }
      setWheatCrosshairState({
        active: true,
        xPct: (closest.x / 500) * 100,
        svgX,
        snappedX: closest.x,
        reportDate: closest.reportDate,
        contractMonth: closest.contractMonth,
        srwMt: closest.srwMt,
        hrwMt: closest.hrwMt,
        hrsMt: closest.hrsMt,
        srwBu: closest.srwBu,
        hrwBu: closest.hrwBu,
        hrsBu: closest.hrsBu,
        ySrw: closest.ySrw,
        yHrw: closest.yHrw,
        yHrs: closest.yHrs
      });
      return;
    }

    // Dedicated handler for Palm Oil dual-series chart (CPO vs Palm Olein)
    if (isPalmOil && palmChartData && palmChartData.points.length > 0) {
      const pts = palmChartData.points;
      let closest = pts[0];
      let minDiff = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const diff = Math.abs(pts[i].x - svgX);
        if (diff < minDiff) {
          minDiff = diff;
          closest = pts[i];
        }
      }
      setPalmCrosshairState({
        active: true,
        xPct: (closest.x / 500) * 100,
        svgX,
        snappedX: closest.x,
        date: closest.date,
        cpoPrice: closest.cpoPrice,
        oleinPrice: closest.oleinPrice,
        yCpo: closest.yCpo,
        yOlein: closest.yOlein,
      });
      return;
    }

    if (!chartData?.points?.length) return;
    const pts = chartData.points;

    let closest = pts[0];
    let minDiff = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const diff = Math.abs(pts[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pts[i];
      }
    }

    const singleSvgY = yRatio * 200;
    const usableHeight = 200 - 10 - 15;
    const elevationPrice = Math.max(
      chartData.minVal,
      Math.min(
        chartData.maxVal,
        chartData.maxVal - ((singleSvgY - 10) / usableHeight) * (chartData.maxVal - chartData.minVal)
      )
    );

    setCrosshairState({
      active: true,
      xPct: (closest.x / 500) * 100,
      yPct: yRatio * 100,
      svgX,
      svgY,
      snappedX: closest.x,
      snappedY: closest.y,
      date: closest.date,
      price: closest.price,
      elevationPrice,
      isSynthetic: closest.isSynthetic || false,
    });
  };

  const handleChartMouseLeave = () => {
    setCrosshairState(null);
    setWheatCrosshairState(null);
    setPalmCrosshairState(null);
  };

  // Inlines parent document style rules into clonedDoc to guarantee published production build rendering
  const inlineStylesForClone = (clonedDoc: Document) => {
    const head = clonedDoc.head || clonedDoc.querySelector('head');
    if (!head) return;

    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules && rules.length > 0) {
          const styleEl = clonedDoc.createElement('style');
          styleEl.textContent = Array.from(rules)
            .map((r) => r.cssText)
            .join('\n');
          head.appendChild(styleEl);
        }
      } catch {
        // Ignore cross-origin stylesheet access restrictions if any
      }
    });
  };

  const handleExportPdf = async () => {
    const p1El = document.getElementById('commodity-pdf-page-1') as HTMLElement | null;
    const p2El = document.getElementById('commodity-pdf-page-2') as HTMLElement | null;

    if (!p1El || !p2El) return;

    try {
      setIsExportingPdf(true);

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { default: html2canvas } = await import('html2canvas-pro');
      const { jsPDF } = await import('jspdf');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const margin = 10;
      const contentWidth = pageWidth - margin * 2; // 190mm

      const canvasOpts = {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        width: 1200,
        windowWidth: 1200,
      };

      const fitImageHeight=(height:number)=>Math.min(height,277);
      // CANVAS 1 (PAGE 1)
      const canvas1 = await html2canvas(p1El, {
        ...canvasOpts,
        onclone: async (clonedDoc) => {
          inlineStylesForClone(clonedDoc);

          const p2 = clonedDoc.getElementById('commodity-pdf-page-2') as HTMLElement | null;
          if (p2) p2.style.setProperty('display', 'none', 'important');

          const el = clonedDoc.getElementById('commodity-pdf-page-1') as HTMLElement | null;
          if (el) {
            el.style.width = '1200px';
            el.style.minWidth = '1200px';
            el.style.padding = '20px';
            el.style.backgroundColor = '#f8fafc';
            el.style.fontFamily = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";
          }
          clonedDoc.querySelectorAll('button, header, aside, .export-report-btn, .export-btn-wrapper, .pdf-hide, .print-hide').forEach((node) => {
            (node as HTMLElement).style.setProperty('display', 'none', 'important');
          });
          // Preserve the Oil chart's actual plot width in canvas export. The
          // live SVG stays unchanged; only the export clone uses a sized image.
          if ((isSoybeanOil||isSugar) && el) {
            const svg=el.querySelector<SVGSVGElement>('svg[viewBox="0 0 500 200"]');
            if (svg) {
              const bounds=svg.parentElement!.getBoundingClientRect(),copy=svg.cloneNode(true) as SVGSVGElement;
              copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
              copy.setAttribute('width',String(bounds.width));copy.setAttribute('height',String(bounds.height));
              // Bake the responsive viewBox scale into the export geometry;
              // canvas SVG rendering can ignore preserveAspectRatio=none.
              copy.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
              const scaled=clonedDoc.createElementNS('http://www.w3.org/2000/svg','g');
              scaled.setAttribute('transform',`scale(${bounds.width/500} ${bounds.height/200})`);
              while(copy.firstChild) scaled.appendChild(copy.firstChild);
              copy.appendChild(scaled);
              copy.style.width=bounds.width+'px';copy.style.height=bounds.height+'px';
              copy.style.color=clonedDoc.defaultView!.getComputedStyle(svg).color;
              const image=clonedDoc.createElement('img');
              image.style.width=bounds.width+'px';image.style.height=bounds.height+'px';
              image.style.flexShrink='0';image.alt=isSugar?'ICE Sugar No.11 price chart':'CBOT ZL price chart';
              image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(copy));
              await image.decode();svg.replaceWith(image);
            }
          }
        },
      });

      const imgData1 = canvas1.toDataURL('image/png');
      const imgHeight1 = (canvas1.height * contentWidth) / canvas1.width;
      pdf.addImage(imgData1, 'PNG', margin, margin, imgHeight1>277?contentWidth*277/imgHeight1:contentWidth, fitImageHeight(imgHeight1), undefined, 'FAST');

      // CANVAS 2 (PAGE 2)
      const canvas2 = await html2canvas(p2El, {
        ...canvasOpts,
        onclone: (clonedDoc) => {
          inlineStylesForClone(clonedDoc);

          const p1 = clonedDoc.getElementById('commodity-pdf-page-1') as HTMLElement | null;
          if (p1) p1.style.setProperty('display', 'none', 'important');

          const el = clonedDoc.getElementById('commodity-pdf-page-2') as HTMLElement | null;
          if (el) {
            el.style.width = '1200px';
            el.style.minWidth = '1200px';
            el.style.padding = '20px';
            el.style.backgroundColor = '#f8fafc';
            el.style.fontFamily = "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";
          }
          clonedDoc.querySelectorAll('button, header, aside, .export-report-btn, .export-btn-wrapper, .pdf-hide, .print-hide').forEach((node) => {
            (node as HTMLElement).style.setProperty('display', 'none', 'important');
          });
        },
      });

      const imgData2 = canvas2.toDataURL('image/png');
      const imgHeight2 = (canvas2.height * contentWidth) / canvas2.width;
      pdf.addPage();
      pdf.addImage(imgData2, 'PNG', margin, margin, imgHeight2>277?contentWidth*277/imgHeight2:contentWidth, fitImageHeight(imgHeight2), undefined, 'FAST');

      const filename = getPdfFilename(commodity.nameEn);
      try {
        pdf.save(filename);
      } catch {
        const blobUrl = pdf.output('bloburl');
        window.open(blobUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to export commodity detail PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const formatChartPrice = (val: number) => {
    const formatted = val.toLocaleString('en-US', {
      minimumFractionDigits: currency === 'KRW' ? 0 : 2,
      maximumFractionDigits: currency === 'KRW' ? 0 : 2,
    });
    return `${prefixCurrency(formatted, currencySymbol)} ${currencyLabel}`;
  };

  return (
    <div ref={containerRef} className="CommodityDetail pdf-container flex flex-col w-full pb-10 space-y-4 print:space-y-2">
      {/* 1. Breadcrumb Bar */}
      <div className="flex items-center justify-between text-xs text-[#6b7280] print:hidden pdf-hide">
        <div className="flex items-center gap-1.5 flex-wrap print:hidden pdf-hide">
          <button
            type="button"
            onClick={onNavigateBack}
            className="hover:text-[#DF0029] flex items-center gap-1 font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span>종합 터미널 (Overview)</span>
          </button>
          <span className="text-[#d1d5db]">/</span>
          <span>원자재 모니터링</span>
          <span className="text-[#d1d5db]">/</span>
          <span className="font-bold text-[#111827] whitespace-nowrap">
            {commodity.nameKo} ({commodity.nameEn})
          </span>
        </div>

        {!isExportingPdf && (
          <div className="flex items-center gap-2 print:hidden pdf-hide export-btn-wrapper">
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-2.5 py-1 bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] rounded text-[#374151] font-semibold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer export-report-btn"
            >
              <span className="material-symbols-outlined text-[15px] text-[#DF0029]">picture_as_pdf</span>
              품목 리포트 출력
            </button>
          </div>
        )}
      </div>

      {/* PAGE 1 CONTAINER: SCM Analysis + Chart + 52W Range + AI Recommendation */}
      <div id="commodity-pdf-page-1" className="flex flex-col space-y-4 w-full">
        {/* 2. Top Executive Summary Card – shared SCM Procurement Analysis UI */}
        <section className="w-full max-w-full p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-xs pdf-section-block overflow-hidden">
        <div className="w-full max-w-full flex flex-col gap-3 min-w-0">
          {/* Header Title Block */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="px-1.5 py-0.5 bg-[#DF0029] text-white text-[10px] font-bold rounded tracking-wide shrink-0">
                  {commodity.category.toUpperCase() === 'GRAIN' ? 'GRAINS' : commodity.category.toUpperCase()}
                </span>
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono font-medium rounded border border-slate-200 shrink-0">
                  {isWheat
                    ? 'CBOT: SRW · KCBT: HRW · MIAX: HRS'
                    : isPalmOil
                    ? 'Bursa Malaysia · FCPO / FPOL'
                    : isCorn
                    ? 'CBOT: CC1'
                    : isSoybean
                    ? 'CBOT: ZS'
                    : isSoybeanOil
                    ? 'CBOT: ZL'
                    : isSugar
                    ? 'ICE: SB'
                    : isPotatoStarch
                    ? 'Eurostat · 생산 대리지표'
                    : isTapiocaStarch
                    ? 'TTSA: TS'
                    : commodity.ticker}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug break-keep whitespace-normal">
                {commodity.nameKo} ({commodity.nameEn}) SCM 조달 분석
              </h1>
            </div>
            <p className="text-xs text-slate-500 break-keep whitespace-normal leading-relaxed max-w-xl">
              {commodity.description}
            </p>
          </div>

          {/* Row 1: 3 enlarged KPI cards with active currency monetary change */}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 print:grid-cols-3 gap-3 w-full items-stretch min-w-0 header-metrics-wrapper pdf-header-metrics">
            {/* Card 1: Benchmark Price */}
            <div id="scm-benchmark-price-card" className="header-metric-card bg-slate-50/90 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-center min-w-0 min-h-[105px]">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1">
                {isWheat ? '기준 시세 (CBOT SRW)' : '기준 시세'}
              </span>
              <div className="flex items-baseline gap-1 min-w-0 flex-wrap sm:flex-nowrap">
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 whitespace-nowrap">
                  {(isPotatoStarch || !(effectiveBasePrice > 0) || (isWheat && !usWheatHistory?.metrics?.srw)) ? '--' : `${prefixCurrency(formatConvertedPrice(effectiveBasePrice), currencySymbol)}`}
                </span>
                <span className="text-[10px] font-normal text-slate-500 font-mono whitespace-nowrap">
                  {currencyLabel}
                </span>
              </div>
              <p className={isSoybeanOil ? "text-[11px] text-slate-500 font-mono mt-1 leading-tight whitespace-normal break-words" : "text-[11px] text-slate-500 font-mono mt-1 leading-tight whitespace-nowrap overflow-hidden text-ellipsis"}>
                {SOURCE_LABELS[commodity.id] || commodity.ticker} · {isSugar?'ICE: SB BENCHMARK':commodity.gradeEn}
              </p>
            </div>

            {/* Card 2: WoW & MoM Side-by-Side with Exact Amount Below */}
            <div id="scm-weekly-change-card" className="header-metric-card bg-slate-50/90 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-center min-w-0 min-h-[105px]">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1">
                시세 변동률 (WoW / MoM)
              </span>

              <div className="grid grid-cols-2 gap-2 items-center pt-0.5">
                {/* Left: WoW */}
                <div className="border-r border-slate-200/80 pr-2">
                  <span className="text-[10px] font-medium text-slate-400 block font-sans">주간 (WoW)</span>
                  {dynamicKpiMetrics?.wowPct != null ? (
                    <>
                      <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${
                        dynamicKpiMetrics.wowPct >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {dynamicKpiMetrics.wowPct >= 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        <span>{dynamicKpiMetrics.wowPct >= 0 ? `+${dynamicKpiMetrics.wowPct.toFixed(2)}%` : `${dynamicKpiMetrics.wowPct.toFixed(2)}%`}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5 whitespace-nowrap">
                        {dynamicKpiMetrics.wowAmount != null
                          ? `${dynamicKpiMetrics.wowAmount >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(dynamicKpiMetrics.wowAmount)), currencySymbol)}`
                          : '--'}
                      </span>
                    </>
                  ) : (
                    <div className="font-mono text-xs sm:text-sm font-bold text-slate-400 mt-0.5">
                      --%
                    </div>
                  )}
                </div>

                {/* Right: MoM */}
                <div className="pl-1">
                  <span className="text-[10px] font-medium text-slate-400 block font-sans">전월 (MoM)</span>
                  {dynamicKpiMetrics?.momPct != null ? (
                    <>
                      <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${
                        dynamicKpiMetrics.momPct >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {dynamicKpiMetrics.momPct >= 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        <span>{dynamicKpiMetrics.momPct >= 0 ? `+${dynamicKpiMetrics.momPct.toFixed(2)}%` : `${dynamicKpiMetrics.momPct.toFixed(2)}%`}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5 whitespace-nowrap">
                        {dynamicKpiMetrics.momAmount != null
                          ? `${dynamicKpiMetrics.momAmount >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(dynamicKpiMetrics.momAmount)), currencySymbol)}`
                          : '--'}
                      </span>
                    </>
                  ) : (
                    <div className="font-mono text-xs sm:text-sm font-bold text-slate-400 mt-0.5">
                      --%
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Desk Recommendation */}
            <div id="scm-desk-recommendation-card" className="header-metric-card bg-slate-50/90 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-center min-w-0 min-h-[105px]">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1.5">데스크 권고</span>
              <span className={`inline-flex self-start items-center text-xs font-bold px-2.5 py-1 rounded-md transition-colors break-keep whitespace-normal ${isPalmOil?'bg-slate-50 border border-slate-200 text-slate-700':getRecommendationColor(activeDeskRecommendation)}`}>
                {activeDeskRecommendation}
              </span>
            </div>
          </div>

          {/* Row 2: common Procurement Risk strip across full width. */}
          <div id="scm-procurement-risk-card" className="w-full bg-slate-50/80 border border-slate-200/70 rounded-lg px-3.5 py-2 flex flex-row items-center gap-2.5 min-w-0">
            {/* Left Label & Badge Group */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-800 whitespace-nowrap" title={isSoybean ? '평가 범위: CBOT 주간 가격 변화와 USDA 세계 재고율. 지역 작황·공급사 오퍼·운임·도착 원가의 검증을 의미하지 않습니다.' : undefined}>{(isSoybean||isSoybeanOil||isSugar) ? '지표 기준 조달 리스크' : '조달 리스크'}</span>
              <span title={isSoybeanOil?soybeanOilAnalysis?.procurementRisk.criteria:undefined} className={`inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded border leading-none tracking-tight whitespace-nowrap select-none ${
                procurementRiskLevel === '경계'
                  ? 'rms-status-negative text-red-700 bg-red-50 border-red-200'
                  : procurementRiskLevel === '주의'
                  ? 'rms-status-warning text-[#EC870C] bg-[#fff7ed] border-[#fed7aa]'
                  : (procurementRiskLevel === '자료 부족'||procurementRiskLevel === '제한 평가')
                  ? 'bg-slate-100 text-slate-600 border-slate-300'
                  : 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-medium text-[10px] px-2 py-0.5 rounded shrink-0'
              }`}>
                {procurementRiskLevel}
              </span>
            </div>

            {/* Right Summary Sentence */}
            <p className="text-xs text-slate-700 font-medium font-sans leading-relaxed break-keep whitespace-normal min-w-0 flex-1 my-0">
              {isSoybean ? procurementRiskSummary.replace(' 원산지별 작황과 FOB 오퍼, 운임, 환율을 별도 확인해야 합니다.', '') : procurementRiskSummary}
            </p>
            {isWheat && isAmisFailed && (
              <span className="text-[10px] text-[#DF0029] font-semibold shrink-0">AMIS 최신 갱신 실패 · 이전 검증 데이터 유지</span>
            )}
          </div>
        </div>
      </section>

      {(isSoybeanOil||isSugar)&&(!datedPriceSnapshot||datedPriceSnapshot.stale)&&<p className="text-[11px] text-amber-700" title={datedPriceSnapshot?.lastError}>{datedPriceSnapshot?'시세 갱신 실패 · 이전 관측 시세':(isSugar?'설탕 시세 자료 없음':'대두유 시세 자료 없음')}</p>}
      {/* 3. Interactive Historical Trend & Technical Chart (Full Width 100%) */}
      <section className="w-full bg-white p-5 rounded-lg shadow-sm border border-[#e5e7eb] space-y-4 pdf-section-block print:p-3 print:mt-4 overflow-visible">
        <div className="flex items-center justify-between w-full mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-[18px] text-[#111827]">show_chart</span>
            <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap min-w-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                {isWheat ? '가격 추이 분석' : isPotatoStarch ? '원료감자 생산량 대리지표 · 전분 가격 아님' : '가격 추이 및 기술적 지표'} <span className="text-sm font-bold text-slate-900 ml-1">({isPotatoStarch ? 'Raw Potato Production Trend' : 'Price Trend Analysis'})</span>
              </h3>
              {isWheat && (
                <a
                  href={usWheatHistory?.sourceUrl || EXTERNAL_CHART_URLS['wheat'] || "https://uswheat.org/market-information/price-report/"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs whitespace-nowrap text-gray-400 hover:text-[#DF0029] hover:underline transition-colors font-normal font-sans"
                >
                  출처: U.S. Wheat Associates ↗
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 font-sans ml-1">
              {isWheat ? (
                <>
                  <span className="font-sans font-normal" title={(usWheatHistory as any)?.sourceStatus === 'unavailable' ? '원본 가격 자료 재확인 필요 · 마지막 저장 자료 표시 중' : undefined}>Report Date: <span className="font-normal text-gray-500">{usWheatHistory?.reportDate || '데이터 확인 중'}</span></span>
                  {isUsWheatFailed && (
                    <span className="rms-status-negative text-[10px] font-semibold text-[#DF0029] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      업데이트 실패 (이전 데이터 유지)
                    </span>
                  )}
                </>
              ) : isPalmOil ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans">
                  <span>출처:</span>
                  <a 
                    href="https://www.investing.com/commodities/palm-oil" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#DF0029] transition-colors font-normal font-sans"
                  >
                    Bursa FCPO ↗
                  </a>
                  <span>·</span>
                  <a 
                    href="https://www.investing.com/commodities/rbd-palm-olein" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#2563EB] transition-colors font-normal font-sans"
                  >
                    RBD Olein ↗
                  </a>
                </div>
              ) : isPotatoStarch ? (
                <a 
                  href="https://joint-research-centre.ec.europa.eu/monitoring-agricultural-resources-mars/jrc-mars-bulletin_en" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#DF0029] transition-colors font-normal font-sans"
                >
                  출처: Eurostat · 전체 감자 수확량 (전분 가격 아님) ↗
                </a>
              ) : (
                <a 
                  href={exchange.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#DF0029] transition-colors font-normal font-sans"
                >
                  출처: {exchange.name} ↗
                </a>
              )}
            </div>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1 bg-[#f3f4f6] p-0.5 rounded border border-[#e5e7eb] shrink-0 pdf-hide">
            {(isPotatoStarch || isTapiocaStarch ? (['6M', '1Y', '3Y', '5Y'] as const) : (['1M', '3M', '6M', '1Y'] as const)).map((tf) => {
              const isActive = activeTimeframe === tf;

              // Calculate actual performance using the first and last data points of live history
              let actualPercentChange = 0;
              if (isPalmOil && palmChartData?.points && palmChartData.points.length > 0) {
                const activeData = palmChartData.points.filter(p=>Number.isFinite(p.cpoPrice));
                const firstPoint = activeData[0]?.cpoPrice || 1;
                const lastPoint = activeData[activeData.length - 1]?.cpoPrice || 1;
                actualPercentChange = ((lastPoint - firstPoint) / firstPoint) * 100;
              } else if (!isWheat && historicalChartData?.points && historicalChartData.points.length > 0) {
                const activeData = historicalChartData.points;
                const firstPoint = activeData[0]?.price || 1;
                const lastPoint = activeData[activeData.length - 1]?.price || 1;
                actualPercentChange = ((lastPoint - firstPoint) / firstPoint) * 100;
              } else if (!isWheat && historicalData?.data && historicalData.data.length > 0) {
                const firstPoint = historicalData.data[0]?.usdPerMT || 1;
                const lastPoint = historicalData.data[historicalData.data.length - 1]?.usdPerMT || 1;
                actualPercentChange = ((lastPoint - firstPoint) / firstPoint) * 100;
              } else if (isWheat && wheatChartData?.points && wheatChartData.points.length > 0) {
                const activeData = wheatChartData.points as any[];
                const firstPoint = activeData[0]?.hrwMt ?? activeData[0]?.usdPerMT ?? 1;
                const lastPoint = activeData[activeData.length - 1]?.hrwMt ?? activeData[activeData.length - 1]?.usdPerMT ?? 1;
                actualPercentChange = ((lastPoint - firstPoint) / firstPoint) * 100;
              } else if (chartData?.points && chartData.points.length > 0) {
                const activeData = chartData.points as any[];
                const firstPoint = activeData[0]?.usdPerMT ?? activeData[0]?.price ?? 1;
                const lastPoint = activeData[activeData.length - 1]?.usdPerMT ?? activeData[activeData.length - 1]?.price ?? 1;
                actualPercentChange = ((lastPoint - firstPoint) / firstPoint) * 100;
              } else {
                actualPercentChange = periodPctChange;
              }

              const isPositive = actualPercentChange >= 0;
              const formattedPct = `${isPositive ? '+' : ''}${actualPercentChange.toFixed(2)}%`;

              return (
                <div key={tf} className="relative flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setActiveTimeframe(tf)}
                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                      isActive
                        ? 'bg-white text-[#DF0029] shadow-xs'
                        : 'text-[#6b7280] hover:text-[#111827]'
                    }`}
                  >
                    {tf}
                  </button>

                  {isActive && Boolean(
                (isWheat && wheatChartData?.points?.length) ||
                (isPalmOil && palmChartData?.points?.length) ||
                (!isWheat && !isPalmOil && chartData?.points?.length)
              ) && (
                    <div className="absolute top-full mt-1.5 z-30 flex flex-col items-center pointer-events-none">
                      {/* Upward pointing CSS arrow tip */}
                      <div
                        className={`w-0 h-0 border-x-4 border-x-transparent border-b-4 ${
                          isPositive ? 'border-b-[#DF0029]' : 'border-b-[#059669]'
                        }`}
                      />
                      {/* Floating tooltip/badge */}
                      <span
                        className={`px-1.5 py-0.5 text-[10px] leading-tight font-mono font-bold text-white rounded shadow-md whitespace-nowrap ${
                          isPositive ? 'bg-[#DF0029]' : 'bg-[#059669]'
                        }`}
                      >
                        {formattedPct}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {chartQuoteDiffers && (
          <p className="text-[11px] text-slate-500 font-sans" title="기준 시세는 공통 시세 스냅샷, 차트 값은 마지막 역사적 관측값입니다.">
            차트의 마지막 관측 종가와 상단 기준 시세는 수집 시점이 달라 일치하지 않을 수 있습니다{livePoint?.date ? ` (차트 관측: ${livePoint.date})` : ''}.
          </p>
        )}

        {/* Metric Area: SRW, HRW, HRS Cards with Latest Published Price, WoW, MoM, Contract Month */}
        {isWheat && usWheatHistory?.metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* SRW Card */}
            <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DF0029] shrink-0"></span>
                  <span className="text-xs font-bold text-slate-900 font-mono">CBOT SRW</span>
                  <span className="text-[11px] text-slate-500">연질적색소맥</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">
                  {formatContractMonth(usWheatHistory.metrics.srw.contractMonth)}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {prefixCurrency(formatConvertedPrice(usWheatHistory.metrics.srw.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.srw.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.srw.wowAvailable === false ? '--' : `${usWheatHistory.metrics.srw.wowChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.srw.wowChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.srw.wowAvailable === false ? '' : `(${usWheatHistory.metrics.srw.wowChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.srw.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.srw.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.srw.momAvailable === false ? '--' : `${usWheatHistory.metrics.srw.momChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.srw.momChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.srw.momAvailable === false ? '' : `(${usWheatHistory.metrics.srw.momChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.srw.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* HRW Card */}
            <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] shrink-0"></span>
                  <span className="text-xs font-bold text-slate-900 font-mono">KCBT HRW</span>
                  <span className="text-[11px] text-slate-500">경질적색소맥</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">
                  {formatContractMonth(usWheatHistory.metrics.hrw.contractMonth)}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {prefixCurrency(formatConvertedPrice(usWheatHistory.metrics.hrw.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrw.wowAvailable === false ? '--' : `${usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.hrw.wowChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.hrw.wowAvailable === false ? '' : `(${usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrw.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrw.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrw.momAvailable === false ? '--' : `${usWheatHistory.metrics.hrw.momChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.hrw.momChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.hrw.momAvailable === false ? '' : `(${usWheatHistory.metrics.hrw.momChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrw.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* HRS Card */}
            <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shrink-0"></span>
                  <span className="text-xs font-bold text-slate-900 font-mono">MIAX HRS</span>
                  <span className="text-[11px] text-slate-500">경질봄소맥</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">
                  {formatContractMonth(usWheatHistory.metrics.hrs.contractMonth)}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {prefixCurrency(formatConvertedPrice(usWheatHistory.metrics.hrs.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrs.wowAvailable === false ? '--' : `${usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.hrs.wowChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.hrs.wowAvailable === false ? '' : `(${usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrs.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrs.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrs.momAvailable === false ? '--' : `${usWheatHistory.metrics.hrs.momChangeMt >= 0 ? '+' : ''}${usWheatHistory.metrics.hrs.momChangePct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {usWheatHistory.metrics.hrs.momAvailable === false ? '' : `(${usWheatHistory.metrics.hrs.momChangeMt >= 0 ? '+' : '−'}${prefixCurrency(formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrs.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1)), currencySymbol)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isPalmOil && <div className="text-[10px] text-slate-500" title={(historicalData as any)?.fxPolicy}>CPO는 관측일 환율로 USD 환산 · 표시통화는 공통 환율 적용 · 벤치마크 차이는 실제 정제마진이 아닙니다.{(historicalData as any)?.diagnostics?.estimatedFxObservations>0 && ' 일부 과거 환산값은 고정환율 추정입니다.'}{(historicalData as any)?.diagnostics?.lastError && ' 일부 가격 원문 갱신 불가 · 저장된 관측값 표시'}</div>}
        {/* Metric Area: Palm Oil Dual Cards (CPO & Palm Olein) */}
        {isPalmOil && palmMetrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1: CPO (Raw Palm Oil) */}
            <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DF0029] shrink-0"></span>
                  <span className="text-xs font-bold text-slate-900 font-mono">MDEX FCPO</span>
                  <span className="text-[11px] text-slate-500">원유팜유</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">
                  Bursa Malaysia
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {prefixCurrency(formatPalmPrice(cpoPrice), currencySymbol)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                    <span data-palm-observation="cpo" className="block text-[10px] font-normal text-slate-400">{latestPalmSeriesPoint?.date}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.cpo.wowChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.cpo.wowPct === null ? '--' : `${palmMetrics.cpo.wowPct >= 0 ? '+' : ''}${palmMetrics.cpo.wowPct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {palmMetrics.cpo.wowPct === null ? '' : `(${palmMetrics.cpo.wowChangeConv >= 0 ? '+' : '−'}${prefixCurrency(formatPalmPrice(Math.abs(palmMetrics.cpo.wowChangeConv)), currencySymbol)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.cpo.momChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.cpo.momPct === null ? '--' : `${palmMetrics.cpo.momPct >= 0 ? '+' : ''}${palmMetrics.cpo.momPct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {palmMetrics.cpo.momPct === null ? '' : `(${palmMetrics.cpo.momChangeConv >= 0 ? '+' : '−'}${prefixCurrency(formatPalmPrice(Math.abs(palmMetrics.cpo.momChangeConv)), currencySymbol)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: RBD Olein (Refined Olein) */}
            <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shrink-0"></span>
                  <span className="text-xs font-bold text-slate-900 font-mono">RBD Olein</span>
                  <span className="text-[11px] text-slate-500">정제 올레인</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-normal tracking-tight">
                  Bursa Malaysia FPOL
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {prefixCurrency(formatPalmPrice(oleinPrice), currencySymbol)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                    <span data-palm-observation="olein" className="block text-[10px] font-normal text-slate-400">{latestOleinSeriesPoint?.date}</span>

                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.olein.wowChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.olein.wowPct === null ? '--' : `${palmMetrics.olein.wowPct >= 0 ? '+' : ''}${palmMetrics.olein.wowPct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {palmMetrics.olein.wowPct === null ? '' : `(${palmMetrics.olein.wowChangeConv >= 0 ? '+' : '−'}${prefixCurrency(formatPalmPrice(Math.abs(palmMetrics.olein.wowChangeConv)), currencySymbol)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.olein.momChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.olein.momPct === null ? '--' : `${palmMetrics.olein.momPct >= 0 ? '+' : ''}${palmMetrics.olein.momPct.toFixed(2)}%`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {palmMetrics.olein.momPct === null ? '' : `(${palmMetrics.olein.momChangeConv >= 0 ? '+' : '−'}${prefixCurrency(formatPalmPrice(Math.abs(palmMetrics.olein.momChangeConv)), currencySymbol)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SVG Price Chart Canvas */}
        {isWheat && wheatChartData ? (
          <div className="h-68 sm:h-76 w-full bg-[#fafbfc] border border-[#f3f4f6] rounded-lg p-4 flex flex-col justify-between relative overflow-visible select-none">
            {/* Top Legend and Range Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#6b7280] font-mono gap-3 relative z-10 bg-[#fafbfc] w-full">
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DF0029]"></span> SRW (연질적색)
                </span>
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EC870C]"></span> HRW (경질적색)
                </span>
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span> HRS (경질봄)
                </span>
              </div>
              <div className="grid grid-cols-3 w-full sm:max-w-md items-center">
                <span className="text-left">최저: {prefixCurrency(formatConvertedPrice(wheatChartData.low), currencySymbol)}</span>
                <span className="text-center">평균: {prefixCurrency(formatConvertedPrice(wheatChartData.avg), currencySymbol)}</span>
                <span className="text-right">최고: {prefixCurrency(formatConvertedPrice(wheatChartData.high), currencySymbol)}</span>
              </div>
            </div>

            <div
              className="relative h-48 sm:h-52 w-full flex items-center justify-center my-2 cursor-crosshair group"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <svg className="w-full h-full overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 500 150">
                <defs>
                  <linearGradient id="grad-wheat-srw" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#DF0029" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#DF0029" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal clean gridlines */}
                {wheatChartData.ticks.map((tick, idx) => (
                  <line
                    key={`wheat-grid-${idx}`}
                    x1={0}
                    y1={tick.y}
                    x2={500}
                    y2={tick.y}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                  />
                ))}

                {/* Subtle Area Fill under SRW */}
                <path
                  d={wheatChartData.srwAreaPath}
                  fill="url(#grad-wheat-srw)"
                />

                {/* 1. SRW Line (Soft Red Winter - CBOT) */}
                <path
                  d={wheatChartData.srwLinePath}
                  stroke="#DF0029"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* 2. HRW Line (Hard Red Winter - KCBT) */}
                <path
                  d={wheatChartData.hrwLinePath}
                  stroke="#EC870C"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* 3. HRS Line (Hard Red Spring - MIAX) */}
                <path
                  d={wheatChartData.hrsLinePath}
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Hover Snap Indicator */}
                {wheatCrosshairState?.active && (
                  <g>
                    {/* Vertical Guide Line */}
                    <line
                      x1={wheatCrosshairState.snappedX}
                      y1={0}
                      x2={wheatCrosshairState.snappedX}
                      y2={150}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />

                    {/* SRW Dot */}
                    <circle
                      cx={wheatCrosshairState.snappedX}
                      cy={wheatCrosshairState.ySrw}
                      r="4.5"
                      fill="#DF0029"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    {/* HRW Dot */}
                    <circle
                      cx={wheatCrosshairState.snappedX}
                      cy={wheatCrosshairState.yHrw}
                      r="4.5"
                      fill="#EC870C"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    {/* HRS Dot */}
                    <circle
                      cx={wheatCrosshairState.snappedX}
                      cy={wheatCrosshairState.yHrs}
                      r="4.5"
                      fill="#2563EB"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>

              {/* Stacked Right Y-Axis Numeric Tick Labels */}
              <div className="absolute right-1 top-0 bottom-0 w-20 pointer-events-none z-0">
                {wheatChartData.ticks.map((tick, idx) => (
                  <span
                    data-chart-axis-label
                    key={`wheat-tick-label-${idx}`}
                    className="absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0"
                    style={{ top: `${(tick.y / 150) * 100}%` }}
                  >
                    {prefixCurrency(formatConvertedPrice(tick.value), currencySymbol)} {currencyLabel}
                  </span>
                ))}
              </div>

              <ChartEndpointLabels labels={[
                {id:'srw',text:`SRW ${prefixCurrency(formatConvertedPrice(wheatChartData.latestPoint.srwMt), currencySymbol)}`,color:'#DF0029',xPct:wheatChartData.latestPoint.x/5,yPct:wheatChartData.latestPoint.ySrw/1.5},
                {id:'hrw',text:`HRW ${prefixCurrency(formatConvertedPrice(wheatChartData.latestPoint.hrwMt), currencySymbol)}`,color:'#EC870C',xPct:wheatChartData.latestPoint.x/5,yPct:wheatChartData.latestPoint.yHrw/1.5},
                {id:'hrs',text:`HRS ${prefixCurrency(formatConvertedPrice(wheatChartData.latestPoint.hrsMt), currencySymbol)}`,color:'#2563EB',xPct:wheatChartData.latestPoint.x/5,yPct:wheatChartData.latestPoint.yHrs/1.5},
              ]}/>

              {/* X-Axis Active Date Badge (Bottom Border) */}
              {wheatCrosshairState?.active && (
                <div
                  className="absolute bottom-0 pointer-events-none z-20"
                  style={{
                    left: `${wheatCrosshairState.xPct}%`,
                    transform:
                      wheatCrosshairState.xPct <= 5
                        ? 'translate(0, 0)'
                        : wheatCrosshairState.xPct >= 95
                        ? 'translate(-100%, 0)'
                        : 'translate(-50%, 0)',
                  }}
                >
                  <span className="bg-[#0F172A] text-white font-mono text-[11px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap block font-semibold">
                    {wheatCrosshairState.reportDate}
                  </span>
                </div>
              )}

              {/* Floating Multi-Class Hover Tooltip Card */}
              {wheatCrosshairState?.active && (
                <div 
                  className="absolute top-2 pointer-events-none z-30 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded p-2.5 text-xs font-mono space-y-1"
                  style={{ left: wheatCrosshairState.xPct > 55 ? '12px' : 'auto', right: wheatCrosshairState.xPct > 55 ? 'auto' : '12px' }}
                >
                  <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 font-sans flex items-center justify-between gap-4">
                    <span>{wheatCrosshairState.reportDate}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-normal tracking-tight font-sans">
                      {formatContractMonth(wheatCrosshairState.contractMonth)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#DF0029]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> SRW:
                    </span>
                    <span className="font-bold">{prefixCurrency(formatConvertedPrice(wheatCrosshairState.srwMt), currencySymbol)}/MT</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#EC870C]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EC870C]"></span> HRW:
                    </span>
                    <span className="font-bold">{prefixCurrency(formatConvertedPrice(wheatCrosshairState.hrwMt), currencySymbol)}/MT</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#2563EB]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> HRS:
                    </span>
                    <span className="font-bold">{prefixCurrency(formatConvertedPrice(wheatCrosshairState.hrsMt), currencySymbol)}/MT</span>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Report Dates */}
            <div className="flex items-center justify-between text-[11px] text-[#9ca3af] font-mono border-t border-[#e5e7eb] pt-2">
              <span>{wheatChartData.axisLabels[0]}</span>
              <span>{wheatChartData.axisLabels[1]}</span>
              <span>{wheatChartData.axisLabels[2]}</span>
              <span>{wheatChartData.axisLabels[3]}</span>
            </div>
          </div>
        ) : isPalmOil && palmChartData ? (
          <div className="h-68 sm:h-76 w-full bg-[#fafbfc] border border-[#f3f4f6] rounded-lg p-4 flex flex-col justify-between relative overflow-visible select-none">
            {/* Top Legend and Range Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#6b7280] font-mono gap-3 relative z-10 bg-[#fafbfc] w-full">
              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DF0029]"></span> CPO (원유 팜유)
                </span>
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span> RBD Olein (정제 올레인)
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                  {formattedSpread}
                </span>
              </div>
              <div className="grid grid-cols-3 w-full sm:max-w-md items-center">
                <span className="text-left">최저: {prefixCurrency(formatPalmPrice(palmChartData.low), currencySymbol)}</span>
                <span className="text-center">평균: {prefixCurrency(formatPalmPrice(palmChartData.avg), currencySymbol)}</span>
                <span className="text-right">최고: {prefixCurrency(formatPalmPrice(palmChartData.high), currencySymbol)}</span>
              </div>
            </div>

            <div
              className="relative h-48 sm:h-52 w-full flex items-center justify-center my-2 cursor-crosshair group"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <svg className="w-full h-full overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 500 150">
                <defs>
                  <linearGradient id="grad-palm-cpo" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#DF0029" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#DF0029" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal clean gridlines */}
                {palmChartData.ticks.map((tick, idx) => (
                  <line
                    key={`palm-grid-${idx}`}
                    x1={0}
                    y1={tick.y}
                    x2={500}
                    y2={tick.y}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                  />
                ))}

                {/* Subtle Area Fill under CPO */}
                <path
                  d={palmChartData.cpoAreaPath}
                  fill="url(#grad-palm-cpo)"
                />

                {/* 1. CPO Line (Bursa Malaysia FCPO) */}
                <path
                  d={palmChartData.cpoLinePath}
                  stroke="#DF0029"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* 2. Palm Olein Line */}
                <path
                  d={palmChartData.oleinLinePath}
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Hover Snap Indicator */}
                {palmCrosshairState?.active && (
                  <g>
                    {/* Vertical Guide Line */}
                    <line
                      x1={palmCrosshairState.snappedX}
                      y1={0}
                      x2={palmCrosshairState.snappedX}
                      y2={150}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />

                    {/* CPO Dot */}
                    {Number.isFinite(palmCrosshairState.yCpo) && <circle
                      cx={palmCrosshairState.snappedX}
                      cy={palmCrosshairState.yCpo}
                      r="4.5"
                      fill="#DF0029"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />}
                    {/* Olein Dot */}
                    {Number.isFinite(palmCrosshairState.yOlein) && <circle
                      cx={palmCrosshairState.snappedX}
                      cy={palmCrosshairState.yOlein}
                      r="4.5"
                      fill="#2563EB"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />}
                  </g>
                )}
                {[{point:palmChartData.lastCpo,color:'#DF0029'},{point:palmChartData.lastOlein,color:'#2563EB'}].map(({point,color},idx)=>point&&<circle key={idx} cx={point.x} cy={idx===0?point.yCpo:point.yOlein} r="3.5" fill={color} stroke="#ffffff" strokeWidth="1.5"/>)}

              </svg>

              {/* Stacked Right Y-Axis Numeric Tick Labels */}
              <div className="absolute right-1 top-0 bottom-0 w-20 pointer-events-none z-0">
                {palmChartData.ticks.map((tick, idx) => (
                  <span
                    data-chart-axis-label
                    key={`palm-tick-label-${idx}`}
                    className="absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0"
                    style={{ top: `${(tick.y / 150) * 100}%` }}
                  >
                    {prefixCurrency(formatPalmPrice(tick.value), currencySymbol)} {currencyLabel}
                  </span>
                ))}
              </div>

              <ChartEndpointLabels labels={[
                ...(palmChartData.lastCpo?[{id:'cpo',text:`CPO ${prefixCurrency(formatPalmPrice(cpoPrice), currencySymbol)}`,color:'#DF0029',xPct:palmChartData.lastCpo.x/5,yPct:palmChartData.lastCpo.yCpo/1.5}]:[]),
                ...(palmChartData.lastOlein?[{id:'olein',text:`Olein ${prefixCurrency(formatPalmPrice(oleinPrice), currencySymbol)}`,color:'#2563EB',xPct:palmChartData.lastOlein.x/5,yPct:palmChartData.lastOlein.yOlein/1.5}]:[]),
              ]}/>

              {/* X-Axis Active Date Badge (Bottom Border) */}
              {palmCrosshairState?.active && (
                <div
                  className="absolute bottom-0 pointer-events-none z-20"
                  style={{
                    left: `${palmCrosshairState.xPct}%`,
                    transform:
                      palmCrosshairState.xPct <= 5
                        ? 'translate(0, 0)'
                        : palmCrosshairState.xPct >= 95
                        ? 'translate(-100%, 0)'
                        : 'translate(-50%, 0)',
                  }}
                >
                  <span className="bg-[#0F172A] text-white font-mono text-[11px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap block font-semibold">
                    {palmCrosshairState.date}
                  </span>
                </div>
              )}

              {/* Floating Multi-Class Hover Tooltip Card */}
              {palmCrosshairState?.active && (
                <div 
                  className="absolute top-2 pointer-events-none z-30 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded p-2.5 text-xs font-mono space-y-1"
                  style={{ left: palmCrosshairState.xPct > 55 ? '12px' : 'auto', right: palmCrosshairState.xPct > 55 ? 'auto' : '12px' }}
                >
                  <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 font-sans flex items-center justify-between gap-4">
                    <span>{palmCrosshairState.date}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-normal tracking-tight font-sans">
                      FCPO / FPOL
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#DF0029]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> CPO:
                    </span>
                    <span className="font-bold">{prefixCurrency(formatPalmPrice(palmCrosshairState.cpoPrice), currencySymbol)} {currencyLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#2563EB]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> Palm Olein:
                    </span>
                    <span className="font-bold">{prefixCurrency(formatPalmPrice(palmCrosshairState.oleinPrice), currencySymbol)} {currencyLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-slate-600 border-t border-slate-100 pt-1">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span> 벤치마크 스프레드:
                    </span>
                    <span className="font-bold font-mono">
                      {prefixCurrency(formatPalmPrice(palmCrosshairState.oleinPrice - palmCrosshairState.cpoPrice), currencySymbol)} {currencyLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Report Dates */}
            <div className="flex items-center justify-between text-[11px] text-[#9ca3af] font-mono border-t border-[#e5e7eb] pt-2">
              <span>{palmChartData.axisLabels[0]}</span>
              <span>{palmChartData.axisLabels[1]}</span>
              <span>{palmChartData.axisLabels[2]}</span>
              <span>{palmChartData.axisLabels[3]}</span>
            </div>
          </div>
        ) : isPalmOil ? (
          <div className="p-4 text-xs text-slate-500">환율 또는 가격 자료를 확인 중입니다.</div>
        ) : chartData ? (
          <div className="h-68 sm:h-76 w-full bg-[#fafbfc] border border-[#f3f4f6] rounded-lg p-4 flex flex-col justify-between relative overflow-visible select-none">
            <div className="grid grid-cols-3 w-full items-center text-xs text-[#6b7280] font-mono relative z-10 bg-[#fafbfc]">
              <span className="text-left">
                {isPotatoStarch ? `최저: ${chartData.low.toFixed(2)} MMT` : `최저: ${formatChartPrice(chartData.low)}`}
              </span>
              <span className="text-center">
                {isPotatoStarch ? `평균: ${chartData.avg.toFixed(2)} MMT` : `평균: ${formatChartPrice(chartData.avg)}`}
              </span>
              <span className="text-right">
                {isPotatoStarch ? `최고: ${chartData.high.toFixed(2)} MMT` : `최고: ${formatChartPrice(chartData.high)}`}
              </span>
            </div>

            <div
              className="relative h-48 sm:h-52 w-full flex items-center justify-center my-2 cursor-crosshair group"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <svg className="w-full h-full text-[#DF0029] overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 500 200">
                <defs>
                  <linearGradient id={`grad-${commodity.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#DF0029" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#DF0029" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal clean gridlines */}
                {chartData.ticks.map((tick, idx) => (
                  <line
                    key={`grid-${idx}`}
                    x1={0}
                    y1={tick.y}
                    x2={500}
                    y2={tick.y}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                  />
                ))}

                <path
                  d={chartData.areaPath}
                  fill={`url(#grad-${commodity.id})`}
                />
                <path
                  d={chartData.linePath}
                  stroke="#DF0029"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Crosshair guide lines & snapped point */}
                {crosshairState?.active && !crosshairState.isSynthetic && (
                  <g>
                    <line
                      x1={crosshairState.snappedX}
                      y1={0}
                      x2={crosshairState.snappedX}
                      y2={200}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={crosshairState.snappedX}
                      cy={crosshairState.snappedY}
                      r="4.5"
                      fill="#DF0829"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}

                {/* Connection line & point dot at the far right endpoint for live price badge */}
                {!isPotatoStarch && livePoint && (
                  <g>
                    <circle
                      cx={500}
                      cy={liveY}
                      r="3.5"
                      fill="#DF0829"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={500}
                      y1={liveY}
                      x2={500}
                      y2={Math.max(0, liveY - 16)}
                      stroke="#DF0829"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  </g>
                )}
              </svg>

              {/* Stacked Right Y-Axis Numeric Tick Labels */}
              <div className="absolute right-1 top-0 bottom-0 w-20 pointer-events-none z-0">
                {chartData.ticks.map((tick, idx) => (
                  <span
                    key={`tick-label-${idx}`}
                    className="absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0"
                    style={{ top: `${(tick.y / 200) * 100}%` }}
                  >
                    {isPotatoStarch ? `${tick.value.toFixed(1)} MMT` : `${prefixCurrency(Math.round(tick.value).toLocaleString('en-US'), currencySymbol)} ${currencyLabel}`}
                  </span>
                ))}
              </div>

              {/* Permanent Fixed Live Price Badge or Latest Production */}
              {!isPotatoStarch && latestLivePrice !== null && livePoint ? (
                <div
                  className="absolute right-0 pointer-events-none z-10 transition-all duration-200"
                  style={{
                    top: `${(liveY / 200) * 100}%`,
                    transform: 'translateY(-170%)'
                  }}
                >
                  <span className="bg-[#DF0829] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-sm whitespace-nowrap block">
                    {formatChartPrice(latestLivePrice)}
                  </span>
                </div>
              ) : (
                <div
                  className="absolute right-0 pointer-events-none z-10 transition-all duration-200"
                  style={{
                    top: `${((34.0 - 27.60) / (34.0 - 25.0)) * 100}%`,
                    transform: 'translateY(-170%)'
                  }}
                >
                  <span className="bg-[#DF0829] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-sm whitespace-nowrap block">
                    27.60 MMT
                  </span>
                </div>
              )}

              {/* X-Axis Active Badge */}
              {crosshairState?.active && !crosshairState.isSynthetic && (
                <div
                  className="absolute bottom-0 pointer-events-none z-20"
                  style={{
                    left: `${crosshairState.xPct}%`,
                    transform:
                      crosshairState.xPct <= 5
                        ? 'translate(0, 0)'
                        : crosshairState.xPct >= 95
                        ? 'translate(-100%, 0)'
                        : 'translate(-50%, 0)',
                  }}
                >
                  <span className="bg-[#0F172A] text-white font-mono text-[11px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap block font-semibold">
                    {crosshairState.date}
                  </span>
                </div>
              )}

              {/* Dynamic Interactive Hover Tooltip Card */}
              {crosshairState?.active && !crosshairState.isSynthetic && (
                <div 
                  className="absolute pointer-events-none z-30 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded p-2.5 text-xs font-mono space-y-1"
                  style={{ top: '8px', left: crosshairState.xPct > 55 ? '12px' : 'auto', right: crosshairState.xPct > 55 ? 'auto' : '12px' }}
                >
                  <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 font-sans flex items-center justify-between gap-4">
                    <span>{crosshairState.date}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {isPotatoStarch ? 'EU Procurement Origins' : commodity.gradeEn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#DF0029]">
                    <span className="font-sans font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> 
                      {isPotatoStarch ? '원료감자 생산량' : commodity.nameKo}:
                    </span>
                    <div className="text-right">
                      <span className="font-bold">
                        {isPotatoStarch 
                          ? `${crosshairState.price.toFixed(2)} MMT` 
                          : `${prefixCurrency(formatConvertedPrice(crosshairState.price), currencySymbol)} ${currencyLabel}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#9ca3af] font-mono border-t border-[#e5e7eb] pt-2">
              <span>{chartData.axisLabels[0]}</span>
              <span>{chartData.axisLabels[1]}</span>
              <span>{chartData.axisLabels[2]}</span>
              <span>{chartData.axisLabels[3]}</span>
            </div>
          </div>
        ) : (
          <div className="h-68 sm:h-76 w-full bg-[#fafbfc] border border-[#f3f4f6] rounded-lg flex items-center justify-center p-6 text-sm text-slate-500 text-center" role="status">
            {isHistoryFailed ? '데이터 갱신에 실패했습니다. 원본 데이터 연결 상태를 확인해 주세요.' : '표시할 실제 이력 데이터가 없습니다.'}
          </div>
        )}

        {/* 52-Week Range Bar / Summary (Exclusively hidden for Potato Starch) */}
        {!isPotatoStarch && (!(isSoybeanOil||isSugar)||(historicalData?.data?.length&&Number.isFinite(soybeanFactor))) && (
          isWheat && wheat52WeekStats ? (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">52주 가격 밴드 및 위치 분석 (52-Week Range Percentile)</span>
                <span className="font-mono text-[#111827]">{usWheatHistory?.metrics?.srw?.contractMonth || '계약월 확인 중'} 선물 벤치마크</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> CBOT SRW
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 {wheat52WeekStats.srw.pct}% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#DF0029] h-full rounded-full transition-all duration-300" style={{ width: `${wheat52WeekStats.srw.pct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.srw.low), currencySymbol)}</span>
                    <span className="font-bold text-slate-800">현: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.srw.current), currencySymbol)}</span>
                    <span>고: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.srw.high), currencySymbol)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EC870C]"></span> KCBT HRW
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 {wheat52WeekStats.hrw.pct}% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#EC870C] h-full rounded-full transition-all duration-300" style={{ width: `${wheat52WeekStats.hrw.pct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrw.low), currencySymbol)}</span>
                    <span className="font-bold text-slate-800">현: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrw.current), currencySymbol)}</span>
                    <span>고: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrw.high), currencySymbol)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> MIAX HRS
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 {wheat52WeekStats.hrs.pct}% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#2563EB] h-full rounded-full transition-all duration-300" style={{ width: `${wheat52WeekStats.hrs.pct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrs.low), currencySymbol)}</span>
                    <span className="font-bold text-slate-800">현: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrs.current), currencySymbol)}</span>
                    <span>고: {prefixCurrency(formatConvertedPrice(wheat52WeekStats.hrs.high), currencySymbol)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : isWheat ? (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] text-xs text-slate-500">52주 가격 자료를 불러오는 중입니다.</div>
          ) : isPalmOil && palm52WeekStats ? (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">52주 종가 밴드 및 위치 분석 (52-Week Closing Range)</span>
                <span className="font-mono text-[#111827]">
                  {formattedSpread}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* 1. CPO Bar (Red) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> CPO (원유 팜유)
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 {palm52WeekStats.cpoPct}% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#DF0029] h-full rounded-full transition-all duration-500" style={{ width: `${palm52WeekStats.cpoPct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {prefixCurrency(formatPalmPrice(palm52WeekStats.cpoLow), currencySymbol)}</span>
                    <span className="font-bold text-slate-800">현: {prefixCurrency(formatPalmPrice(palm52WeekStats.cpoCurrent), currencySymbol)}</span>
                    <span>고: {prefixCurrency(formatPalmPrice(palm52WeekStats.cpoHigh), currencySymbol)}</span>
                  </div>
                </div>

                {/* 2. RBD Olein Bar (Blue) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> RBD Olein (정제 올레인)
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 {palm52WeekStats.oleinPct}% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#2563EB] h-full rounded-full transition-all duration-500" style={{ width: `${palm52WeekStats.oleinPct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {prefixCurrency(formatPalmPrice(palm52WeekStats.oleinLow), currencySymbol)}</span>
                    <span className="font-bold text-slate-800">현: {prefixCurrency(formatPalmPrice(palm52WeekStats.oleinCurrent), currencySymbol)}</span>
                    <span>고: {prefixCurrency(formatPalmPrice(palm52WeekStats.oleinHigh), currencySymbol)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">{(isSoybean||isSoybeanOil||isSugar) ? '52주 최저–최고가 범위 내 위치 (52-Week Range Position)' : '52주 가격 밴드 및 위치 분석 (52-Week Range Percentile)'}</span>
                <span className="font-mono text-[#111827]">
                  {(isSoybean||isSoybeanOil||isSugar) ? `범위 내 ${range52WeekStats.pct}% 지점` : range52WeekStats.pct >= 98 
                    ? "52주 최고가 (고평가 구간)" 
                    : range52WeekStats.pct <= 2 
                    ? "52주 최저가 (저평가 구간)" 
                    : `상위 ${100 - range52WeekStats.pct}% (${range52WeekStats.zone})`}
                </span>
              </div>
              <div className="w-full bg-[#e5e7eb] h-2.5 rounded-full overflow-hidden flex">
                <div className="bg-[#DF0029] h-full rounded-full transition-all duration-500" style={{ width: `${range52WeekStats.pct}%` }}></div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-[#6b7280]">
                <span>52주 저점: {formatChartPrice(range52WeekStats.low)}</span>
                <span className="font-bold text-[#111827]">현재: {formatChartPrice(range52WeekStats.current)}</span>
                <span>52주 고점: {formatChartPrice(range52WeekStats.high)}</span>
              </div>
              {(isSoybean||isSoybeanOil||isSugar) && <p className="text-[10px] text-[#6b7280] leading-snug">관측 최저가 0% · 최고가 100% 기준의 가격 위치입니다.</p>}
            </div>
          )
        )}
      </section>

      {/* 4. AI Market View & Strategy Recommendation */}
      <AiRecommendation
        key={selectedCommodity?.id || (selectedCommodity as any)?.slug || (selectedCommodity as any)?.key || commodity.id}
        commodityId={commodity.id}
        currency={commodity.id === 'potato-starch' ? 'EUR' : currency}
        confidenceScore={aiInsight?.confidenceScore ?? 88}
        recommendedCoverage={activeDeskRecommendation}
        researchStatus={aiInsight?.status}
        researchSources={aiInsight?.sources}
        researchGeneratedAt={aiInsight?.generatedAt}
        researchModel={aiInsight?.model}
        executiveSummary={aiInsight?.executiveSummary}
        bullishFactors={aiInsight?.bullishFactors}
        bearishFactors={aiInsight?.bearishFactors}
        watchItems={aiInsight?.watchItems}
        isLoading={isAiLoading}
        isError={isAiError}
        errorMessage={aiErrorMessage}
        modelVersion={modelVersion}
        isSyncing={isSyncing}
        className="pdf-section-block print:p-3 print:mt-4"
      />
    </div>

    {/* PAGE 2 CONTAINER: Global S&D Balance + Origin Radar + Market Intelligence */}
    <div id="commodity-pdf-page-2" className="flex flex-col space-y-4 w-full">
      {/* 5. Lower Section: SCM Global S&D Balance & Sourcing Origin Radar */}
      <div className="wasde-origin-radar-section wasde-origin-radar-wrapper wasde-section-container grid grid-cols-1 lg:grid-cols-2 gap-4 print:mt-0 print:grid-cols-2 print:break-before-page">
        {/* S&D Balance */}
        <CommodityWasdeCard
          key={`wasde-card-${commodity.id}`}
          commodityId={commodity.id}
          refreshRevision={usdaRefreshRevision}
          commodityName={commodity.nameKo}
          verifiedSupply={isSoybeanOil?commodity._soybeanOilPriceSnapshot?.supplyEvidence:undefined}
          customBrief={commodity.aiSynthesis}
          className="print:break-inside-avoid"
        />

        {/* Sourcing Origin Radar */}
        <OriginRadar
          key={`origin-radar-${commodity.id}`}
          commodityId={commodity.id}
          origins={combinedOrigins}
          className="print:break-inside-avoid"
        />
      </div>

      {/* 5. Key Issues & Market News (Market Intelligence) */}
      <section className="market-intelligence-section pdf-section-block print:mt-4 print:pt-2">
        <CommodityNews commodityId={commodity.id} isSyncing={isSyncing} />
      </section>
    </div>
  </div>
);
};
