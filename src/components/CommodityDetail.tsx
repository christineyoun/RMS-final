import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { Commodity, Currency, UsWheatPriceHistoryResponse, UsWheatHistoryDataPoint, UsWheatClassMetric, AmisWheatResponse, CornProcurementAnalysisData, EstimatedCornKoreaLandedCost, SoybeanProcurementAnalysisData, SoybeanOilProcurementAnalysisData } from '../types';
import { formatPrice, formatStarchSweetenerBenchmark, COMMODITY_CONFIGS, getCalculatedMetrics } from '../utils/landedCostCalculator';
import { sanitizeOklchColorsForCanvas } from '../utils/exportDashboardPdf';
import { CommodityNews } from './CommodityNews';
import AiRecommendation from './AiRecommendation';
import { CommodityWasdeCard } from './CommodityWasdeCard';
import { OriginRadar } from './OriginRadar';
import { getLiveExchangeRate, subscribeFxRates, fetchLiveFxRates, getAllFxRates, FXRates } from '../services/currencyService';
import palmOilCacheFallback from '../data/cache_palmoil.json';

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

// Default initial wheat history baseline so Wheat renders the 3 multi-class KPI cards and 3-line chart immediately on Second 0
const DEFAULT_WHEAT_HISTORY_BASELINE: UsWheatPriceHistoryResponse = {
  success: true,
  statusCode: 200,
  source: 'U.S. Wheat Associates',
  sourceUrl: 'https://www.uswheat.org/market-information/price-reports/',
  reportDate: 'September 25, 2026',
  lastRetrievalTime: '10:38:34 PM KST',
  primaryUnit: 'USD/MT',
  secondaryUnit: 'USc/bu',
  count: 4,
  metrics: {
    srw: { wheatClass: 'SRW', classNameKo: '연질적색겨울밀', classNameEn: 'Soft Red Winter', exchange: 'CBOT', contractMonth: 'December', latestPriceMt: 258.40, latestPriceBu: 703.25, wowChangePct: -3.03, wowChangeMt: -8.08, wowChangeBu: -22, momChangePct: 10.02, momChangeMt: 23.49, momChangeBu: 64 },
    hrw: { wheatClass: 'HRW', classNameKo: '경질적색겨울밀', classNameEn: 'Hard Red Winter', exchange: 'KCBT', contractMonth: 'December', latestPriceMt: 279.98, latestPriceBu: 762.00, wowChangePct: -4.63, wowChangeMt: -13.59, wowChangeBu: -37, momChangePct: 7.63, momChangeMt: 19.84, momChangeBu: 54 },
    hrs: { wheatClass: 'HRS', classNameKo: '경질적색봄밀', classNameEn: 'Hard Red Spring', exchange: 'MIAX', contractMonth: 'December', latestPriceMt: 262.16, latestPriceBu: 713.50, wowChangePct: -4.16, wowChangeMt: -11.39, wowChangeBu: -31, momChangePct: 3.48, momChangeMt: 8.83, momChangeBu: 24 },
  },
  data: [
    { date: '2025-12-19', reportDate: '2025.12.19', contractMonth: 'December', srwMt: 240, hrwMt: 250, hrsMt: 260, srwBu: 650, hrwBu: 680, hrsBu: 710 },
    { date: '2026-03-21', reportDate: '2026.03.21', contractMonth: 'December', srwMt: 255, hrwMt: 270, hrsMt: 285, srwBu: 690, hrwBu: 730, hrsBu: 770 },
    { date: '2026-06-21', reportDate: '2026.06.21', contractMonth: 'December', srwMt: 250, hrwMt: 265, hrsMt: 275, srwBu: 680, hrwBu: 720, hrsBu: 750 },
    { date: '2026-09-25', reportDate: '2026.09.25', contractMonth: 'December', srwMt: 258.40, hrwMt: 279.98, hrsMt: 262.16, srwBu: 703.25, hrwBu: 762, hrsBu: 713.50 },
  ],
};

interface CommodityDetailProps {
  commodity: Commodity;
  onNavigateBack: () => void;
  currency: Currency;
  onOpenExportModal?: () => void;
  onRefreshGemini: () => void;
  isSyncing: boolean;
  modelVersion?: string;
}

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
  if (!text) return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';

  // Tier 1: HIGH RISK / TIGHT BUFFER (Solid Red)
  if (text.includes('30~45일') || text.includes('즉시') || text.includes('조치 필요')) {
    return 'bg-[#DF0029] text-white font-bold px-2.5 py-1 rounded-md shadow-xs';
  }

  // Tier 2: FAVORABLE / EXTENDED LOCK (Solid Green - Max 75d)
  if (text.includes('60~75일') || text.includes('60일') || text.includes('75일') || text.includes('우호적')) {
    return 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';
  }

  // Tier 3: HYBRID SPOT/FORWARD / CAUTION (주의 / 중위험 / 스팟/선도)
  if (text.includes('주의') || text.includes('중위험') || text.includes('스팟/선도') || text.includes('혼합')) {
    return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';
  }

  // Tier 4: STANDARD FLEXIBLE (Soft Light Orange - 45~60d)
  return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';
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
  wheat: [
    {
      region: '미국 (HRW/SRW)', production: '53.7M MT', exports: '수출 22.5M MT', endingStocks: '기말재고 22.1M MT',
      riskAssessment: '생산 전망 상향 및 미 태평양(PNW) 수출 물류 원활', status: '정상', statusColor: 'green', sourceName: 'USDA FAS PSD · AMIS',
    },
    {
      region: '호주 (APW/AHW)', production: '31.8M MT', exports: '수출 23.5M MT', endingStocks: '기말재고 4.8M MT',
      riskAssessment: '생산 상향 전망이나 동부 건조 지속으로 단수 모니터링', status: '모니터링', statusColor: 'yellow', sourceName: 'ABARES · AMIS',
    },
    {
      region: '캐나다 (CWRS)', production: '34.3M MT', exports: '수출 25.0M MT', endingStocks: '기말재고 5.2M MT',
      riskAssessment: '봄밀 생산 전망 변화 모니터링 및 밴쿠버 수출 선적 안정', status: '정상', statusColor: 'green', sourceName: 'AAFC · AMIS',
    },
    {
      region: '유럽연합 (프랑스/독일)', production: '122.6M MT', exports: '수출 30.0M MT', endingStocks: '기말재고 10.8M MT',
      riskAssessment: '서유럽 수확기 강우에 따른 제분용 품질 편차 모니터링', status: '모니터링', statusColor: 'yellow', sourceName: 'EU Agri-food API · AMIS',
    },
    {
      region: '러시아 (12.5% 제분용)', production: '81.5M MT', exports: '수출 48.0M MT', endingStocks: '기말재고 11.2M MT',
      riskAssessment: '흑해 수출·항만 물류 및 정책 변수 주의', status: '주의', statusColor: 'red', sourceName: 'USDA FAS PSD · AMIS',
    },
  ],
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
  'soybean': 'https://finance.yahoo.com/quote/ZS=F/',
  'soybean-oil': 'https://finance.yahoo.com/quote/ZL=F/',
  'corn': 'https://finance.yahoo.com/quote/ZC=F/',
  'sugar': 'https://finance.yahoo.com/quote/SB=F/',
  'palm-oil': 'https://www.tradingview.com/symbols/MYX-FCPO1!/',
  'palmoil': 'https://www.tradingview.com/symbols/MYX-FCPO1!/',
  'palm_oil': 'https://www.tradingview.com/symbols/MYX-FCPO1!/',
  // Keep existing working links for wheat and starches untouched:
  'wheat': 'https://uswheat.org/market-information/price-report/',
  'potato-starch': 'https://tradingeconomics.com/commodity/potatoes',
  'tapioca-starch': 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price',
};

export const SOURCE_LABELS: Record<string, string> = {
  'wheat': 'U.S. Wheat Associates',
  'corn': 'CBOT (CC1)',
  'soybean': 'CBOT (ZS)',
  'soybean-oil': 'CBOT (ZL)',
  'palm-oil': 'MDEX (FCPO) / MPOB',
  'palmoil': 'MDEX (FCPO) / MPOB',
  'palm_oil': 'MDEX (FCPO) / MPOB',
  'sugar': 'ICE (SBC1)',
  'potato-starch': 'Eurostat Spot',
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

const formatDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
};

const formatMonthDay = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}.${d}`;
};

export type Timeframe = '1M' | '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y';

const getTimeframeChartData = (
  basePrice: number,
  timeframe: Timeframe,
  sparkline: number[] = [10, 12, 11, 14, 13, 15]
): TimeframeChartData => {
  const configs: Record<
    Timeframe,
    {
      days: number;
      steps: number;
      priceMultipliers: number[];
      maMultipliers: number[];
    }
  > = {
    '1M': {
      days: 30,
      steps: 30,
      priceMultipliers: [0.985, 0.992, 0.988, 1.006, 0.998, 1.012, 1.0],
      maMultipliers: [0.991, 0.993, 0.995, 0.997, 1.001, 1.003, 1.002],
    },
    '3M': {
      days: 90,
      steps: 45,
      priceMultipliers: [0.935, 0.965, 0.948, 0.985, 0.972, 1.028, 1.0],
      maMultipliers: [0.955, 0.965, 0.972, 0.985, 0.996, 1.008, 1.004],
    },
    '6M': {
      days: 180,
      steps: 50,
      priceMultipliers: [0.910, 0.940, 0.970, 1.030, 1.015, 0.985, 1.0],
      maMultipliers: [0.930, 0.945, 0.965, 0.995, 1.008, 1.012, 1.005],
    },
    '1Y': {
      days: 365,
      steps: 52,
      priceMultipliers: [0.865, 0.915, 0.985, 1.065, 1.035, 0.965, 1.0],
      maMultipliers: [0.895, 0.920, 0.955, 0.990, 1.015, 1.020, 1.008],
    },
    '2Y': {
      days: 730,
      steps: 104,
      priceMultipliers: [0.820, 0.880, 0.950, 1.100, 1.050, 0.930, 1.0],
      maMultipliers: [0.850, 0.890, 0.930, 0.980, 1.020, 1.030, 1.010],
    },
    '3Y': {
      days: 1095,
      steps: 156,
      priceMultipliers: [0.780, 0.850, 0.920, 1.120, 1.060, 0.900, 1.0],
      maMultipliers: [0.810, 0.860, 0.900, 0.970, 1.030, 1.040, 1.015],
    },
    '5Y': {
      days: 1825,
      steps: 260,
      priceMultipliers: [0.720, 0.810, 0.950, 1.150, 1.080, 0.880, 1.0],
      maMultipliers: [0.760, 0.830, 0.920, 1.020, 1.050, 0.950, 1.010],
    },
  };

  const cfg = configs[timeframe];
  const sparkMin = Math.min(...sparkline);
  const sparkRange = Math.max(...sparkline) - sparkMin || 1;
  const sparkNorm = sparkline.map((v) => (v - sparkMin) / sparkRange - 0.5);

  const numPoints = cfg.steps;
  const totalDays = cfg.days;

  const pointsData: Array<{ date: string; price: number; maPrice: number }> = [];

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    const dayOffset = Math.round((1 - progress) * totalDays);
    const pointDate = new Date();
    pointDate.setDate(pointDate.getDate() - dayOffset);
    const dateStr = formatDateStr(pointDate);

    const baseIdx = progress * (cfg.priceMultipliers.length - 1);
    const i0 = Math.floor(baseIdx);
    const i1 = Math.min(cfg.priceMultipliers.length - 1, Math.ceil(baseIdx));
    const t = baseIdx - i0;
    const rawMult = cfg.priceMultipliers[i0] * (1 - t) + cfg.priceMultipliers[i1] * t;
    const sparkNudge = (sparkNorm[i % sparkNorm.length] || 0) * 0.015 * Math.sin(progress * Math.PI * 3);

    const price = i === numPoints - 1 ? basePrice : basePrice * (rawMult + sparkNudge);

    const maMult = cfg.maMultipliers[i0] * (1 - t) + cfg.maMultipliers[i1] * t;
    const maPrice = i === numPoints - 1 ? basePrice * 1.002 : basePrice * maMult;

    pointsData.push({ date: dateStr, price, maPrice });
  }

  const allVals = pointsData.flatMap((p) => [p.price, p.maPrice]);
  const high = Math.max(...allVals);
  const low = Math.min(...allVals);
  const avg = pointsData.reduce((sum, val) => sum + val.price, 0) / pointsData.length;

  const absoluteMaxPrice = Math.max(...allVals, basePrice, high);
  const absoluteMinPrice = Math.min(...allVals, basePrice, low);

  const minVal = absoluteMinPrice * 0.95;
  const maxVal = absoluteMaxPrice * 1.08; // Padded to prevent top clipping
  const valRange = maxVal - minVal || 1;

  const width = 500;
  const height = 200;
  const padTop = 10;
  const padBottom = 15;
  const usableHeight = height - padTop - padBottom;

  const chartPoints: ChartPoint[] = pointsData.map((pt, idx) => {
    const x = Math.round((idx / (numPoints - 1)) * width);
    const y = Math.round(height - padBottom - ((pt.price - minVal) / valRange) * usableHeight);
    return {
      date: pt.date,
      price: pt.price,
      x,
      y,
    };
  });

  const maCoords = pointsData.map((pt, idx) => {
    const x = Math.round((idx / (numPoints - 1)) * width);
    const y = Math.round(height - padBottom - ((pt.maPrice - minVal) / valRange) * usableHeight);
    return { x, y };
  });

  const linePath = chartPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');
  const areaPath = `${linePath} L ${width},200 L 0,200 Z`;
  const maPath = maCoords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');

  // Compute nice Y-axis ticks using Nice Numbers algorithm
  const niceTickValues = getNiceYAxisTicks(minVal, maxVal, 5);
  const ticks: ChartTick[] = niceTickValues.map((value) => {
    const y = Math.round(height - padBottom - ((value - minVal) / valRange) * usableHeight);
    return { value, y };
  });

  // Dynamic axis labels based on active timeframe
  let axisLabels: [string, string, string, string];
  const now = new Date();

  if (timeframe === '1M' || timeframe === '3M' || timeframe === '6M') {
    const getDateAt = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return formatMonthDay(d);
    };
    axisLabels = [
      getDateAt(totalDays),
      getDateAt(Math.round((totalDays * 2) / 3)),
      getDateAt(Math.round(totalDays / 3)),
      formatMonthDay(now),
    ];
  } else {
    // '1Y'
    const getYearMonthAt = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    axisLabels = [
      getYearMonthAt(totalDays),
      getYearMonthAt(Math.round((totalDays * 2) / 3)),
      getYearMonthAt(Math.round(totalDays / 3)),
      `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, '0')}`,
    ];
  }

  return {
    axisLabels,
    high,
    low,
    avg,
    minVal,
    maxVal,
    ticks,
    linePath,
    areaPath,
    maPath,
    points: chartPoints,
  };
};




export const CommodityDetail: React.FC<CommodityDetailProps> = ({
  commodity,
  onNavigateBack,
  currency,
  onOpenExportModal,
  onRefreshGemini,
  isSyncing,
  modelVersion
}) => {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('6M');

  // Reset timeRange to '6M' every time the active commodity changes
  useEffect(() => {
    setActiveTimeframe('6M');
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

  const formatLandedBreakdownFootnote = (
    fobUsd: number,
    freightUsd: number,
    portUsd: number,
    usdSourcePrefix: string = 'USDA AMS'
  ): string => {
    if (selectedCurrency === 'KRW') {
      const krwRate = fxRates.USD_KRW || 1388.5;
      const fobKrw = Math.round(fobUsd * krwRate).toLocaleString('en-US');
      const freightKrw = Math.round(freightUsd * krwRate).toLocaleString('en-US');
      const portKrw = Math.round(portUsd * krwRate).toLocaleString('en-US');
      return `환율 ₩${Math.round(krwRate)}/USD 적용 · FOB ₩${fobKrw} + 해상운임 ₩${freightKrw} + 항만비 ₩${portKrw}`;
    }
    if (selectedCurrency === 'EUR') {
      const eurUsdRate = fxRates.EUR_USD || 1.08;
      const fobEur = (fobUsd / eurUsdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const freightEur = (freightUsd / eurUsdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const portEur = (portUsd / eurUsdRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `EUR/USD ${eurUsdRate.toFixed(2)} 적용 · FOB €${fobEur} + 해상운임 €${freightEur} + 항만비 €${portEur}`;
    }
    return `${usdSourcePrefix} · FOB $${fobUsd.toFixed(2)} + 해상운임 $${freightUsd.toFixed(2)} + 항만비 $${portUsd.toFixed(2)}`;
  };

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
  const [historicalData, setHistoricalData] = useState<{
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
  const [fullYearHistoryData, setFullYearHistoryData] = useState<{
    success: boolean;
    symbol: string;
    source: string;
    priceMyr?: number;
    cpoUsdMt?: number;
    oleinUsd?: number;
    data: Array<{ date: string; centsPerBushel: number; usdPerMT: number; oleinUsdPerMt?: number }>;
  } | null>(null);
  const lastSuccessfulFullYearHistoryRef = useRef<any>(null);



  const liveUsdMyr = fxRates.USD_MYR || getLiveExchangeRate('USD_MYR');
  const liveUsdKrw = fxRates.USD_KRW || exchangeRate || getLiveExchangeRate('KRW');
  const liveEurUsd = fxRates.EUR_USD || getLiveExchangeRate('EUR');

  // Verified Scraped Market Benchmarks (with persistent cache_palmoil.json fallback)
  const latestPalmSeriesPoint = useMemo(() => {
    if (isPalmOil && historicalData?.data && historicalData.data.length > 0) {
      return historicalData.data[historicalData.data.length - 1];
    }
    const fallbackSeries = palmOilCacheFallback.historicalSeries;
    return fallbackSeries[fallbackSeries.length - 1];
  }, [isPalmOil, historicalData]);

  const LIVE_CPO_MYR = latestPalmSeriesPoint?.centsPerBushel || palmOilCacheFallback.priceMyr || 4649;
  const LIVE_OLEIN_USD = latestPalmSeriesPoint?.oleinUsdPerMt || palmOilCacheFallback.oleinUsd || 1167.50;

  // Dynamic CPO in USD/MT derived from raw CPO MYR / live USD_MYR exchange rate (1 USD = 4.0845 MYR)
  const cpoUsdMt = useMemo(() => {
    const activeUsdMyr = liveUsdMyr > 0 ? liveUsdMyr : 4.0845;
    return Number((LIVE_CPO_MYR / activeUsdMyr).toFixed(2));
  }, [LIVE_CPO_MYR, liveUsdMyr]);

  // Convert according to active currency selector
  const cpoPrice = useMemo(() => {
    if (currency === 'KRW') return Math.round(cpoUsdMt * (currency === 'KRW' ? exchangeRate : 1));
    if (currency === 'EUR') return Number((cpoUsdMt / 1.08).toFixed(2));
    return cpoUsdMt;
  }, [currency, cpoUsdMt, exchangeRate]);

  const oleinPrice = useMemo(() => {
    if (currency === 'KRW') return Math.round(LIVE_OLEIN_USD * (currency === 'KRW' ? exchangeRate : 1));
    if (currency === 'EUR') return Number((LIVE_OLEIN_USD / 1.08).toFixed(2));
    return LIVE_OLEIN_USD;
  }, [currency, LIVE_OLEIN_USD, exchangeRate]);

  const currentSpread = oleinPrice - cpoPrice;
  const spreadPrice = currentSpread;
  const spreadUsd = Number((LIVE_OLEIN_USD - cpoUsdMt).toFixed(2));

  const formattedSpread = useMemo(() => {
    const sign = currentSpread >= 0 ? '+' : '';
    if (currency === 'KRW') {
      return `스프레드: ${sign}₩${Math.round(currentSpread).toLocaleString('en-US')} KRW/MT`;
    }
    if (currency === 'EUR') {
      return `스프레드: ${sign}€${currentSpread.toFixed(2)} EUR/MT`;
    }
    return `스프레드: ${sign}$${currentSpread.toFixed(2)} USD/MT`;
  }, [currency, currentSpread]);

  const formatPalmPrice = (val: number) => {
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

    const convRate = currency === 'KRW' ? liveUsdKrw : currency === 'EUR' ? liveEurUsd : 1;

    // Strictly use verified scraped series or persistent local cache fallback (cache_palmoil.json)
    const fallbackSeries = palmOilCacheFallback.historicalSeries || [];
    let rawSourceSeries: Array<{ date: string; centsPerBushel?: number; usdPerMT?: number; cpoUsd?: number; oleinUsd?: number; oleinUsdPerMt?: number }> = [];

    if (historicalData?.data && historicalData.data.length > 0) {
      rawSourceSeries = historicalData.data;
    } else {
      if (activeTimeframe === '1M') rawSourceSeries = fallbackSeries.slice(-11);
      else if (activeTimeframe === '3M') rawSourceSeries = fallbackSeries.slice(-22);
      else if (activeTimeframe === '6M') rawSourceSeries = fallbackSeries.slice(-36);
      else rawSourceSeries = fallbackSeries;
    }

    const pointsData = rawSourceSeries.map((p) => {
      const pointCpoUsd = p.cpoUsd ?? (
        (p.centsPerBushel && liveUsdMyr > 0)
          ? (p.centsPerBushel / liveUsdMyr)
          : (Number.isFinite(p.usdPerMT) ? (p.usdPerMT as number) : cpoUsdMt)
      );
      const pointOleinUsd = p.oleinUsd ?? (
        Number.isFinite(p.oleinUsdPerMt) ? (p.oleinUsdPerMt as number) : LIVE_OLEIN_USD
      );

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
        rawCpo: pointCpoUsd,
        rawOlein: pointOleinUsd,
      };
    });

    const allPrices = pointsData.flatMap(d => [d.cpoPrice, d.oleinPrice]);
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
      let path = `M ${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const cpX = Math.round((pts[i].x + pts[i + 1].x) / 2);
        path += ` C ${cpX},${pts[i].y} ${cpX},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
      }
      return path;
    };

    const cpoLinePath = buildSplinePath(coords.map(c => ({ x: c.x, y: c.yCpo })));
    const oleinLinePath = buildSplinePath(coords.map(c => ({ x: c.x, y: c.yOlein })));
    const cpoAreaPath = `${cpoLinePath} L 500,150 L 0,150 Z`;

    const formatDateFromTs = (ts: number): string => {
      const d = new Date(ts);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    return {
      points: coords,
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
    commodity.id === 'wheat' ? DEFAULT_WHEAT_HISTORY_BASELINE : null
  );
  const [usWheatLastRetrieved, setUsWheatLastRetrieved] = useState<string>('');
  const [isUsWheatFailed, setIsUsWheatFailed] = useState<boolean>(false);
  const lastSuccessfulWheatHistoryRef = useRef<UsWheatPriceHistoryResponse | null>(DEFAULT_WHEAT_HISTORY_BASELINE);


  // AMIS Market Monitor (Wheat) – verified monthly market intelligence.
  const [amisResponse, setAmisResponse] = useState<AmisWheatResponse | null>(null);
  const [isAmisFailed, setIsAmisFailed] = useState<boolean>(false);
  const lastSuccessfulAmisRef = useRef<AmisWheatResponse | null>(null);

  // Wheat-specific sourcing origin radar. Other commodities keep the target project's existing origin logic.
  const [originRadarData, setOriginRadarData] = useState<OriginItem[] | null>(null);

  // Corn SCM Procurement Analysis State (CBOT ZC=F, USDA AMS Landed Cost, USDA FAS PSD, AMIS)
  const [cornAnalysis, setCornAnalysis] = useState<CornProcurementAnalysisData | null>(null);
  const [isCornLoading, setIsCornLoading] = useState<boolean>(false);
  const lastSuccessfulCornAnalysisRef = useRef<CornProcurementAnalysisData | null>(null);

  // Soybean SCM Procurement Analysis State (CBOT ZS=F, USDA AMS Landed Cost, USDA FAS PSD, AMIS)
  const [soybeanAnalysis, setSoybeanAnalysis] = useState<SoybeanProcurementAnalysisData | null>(null);
  const [isSoybeanLoading, setIsSoybeanLoading] = useState<boolean>(false);
  const lastSuccessfulSoybeanAnalysisRef = useRef<SoybeanProcurementAnalysisData | null>(null);

  // Soybean Oil SCM Procurement Analysis State (CBOT ZL=F, Physical FOB, Liquid Tanker Freight, USDA FAS PSD, AMIS)
  const [soybeanOilAnalysis, setSoybeanOilAnalysis] = useState<SoybeanOilProcurementAnalysisData | null>(null);
  const [isSoybeanOilLoading, setIsSoybeanOilLoading] = useState<boolean>(false);
  const lastSuccessfulSoybeanOilAnalysisRef = useRef<SoybeanOilProcurementAnalysisData | null>(null);

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
        const baseEndpoint = commodityId === 'wheat'
          ? '/api/wheat/ai-recommendation'
          : `/api/ai-analysis/${commodityId}`;
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

        if (commodityId === 'wheat' && json.success && json.recommendation) {
          if (isMounted) {
            setAiInsight({
              confidenceScore: json.recommendation.confidenceScore ?? 88,
              deskRecommendation: json.recommendation.deskRecommendation || '현 수준 관망',
              executiveSummary: json.recommendation.summaryParagraph || '',
              bullishFactors: Array.isArray(json.recommendation.bullishFactors) ? json.recommendation.bullishFactors : [],
              bearishFactors: Array.isArray(json.recommendation.bearishFactors) ? json.recommendation.bearishFactors : [],
              watchItems: Array.isArray(json.recommendation.watchItems) ? json.recommendation.watchItems : [],
            });
          }
        } else if (json.success && json.data) {
          if (isMounted) {
            setAiInsight(json.data);
          }
        } else {
          console.warn("AI Analysis returned notice or baseline format:", json);
          if (isMounted) {
            // If data exists in payload, use it
            if (json.data) {
              setAiInsight(json.data);
            } else {
              setIsAiError(true);
              setAiErrorMessage(json.error || json.errorMessage || 'AI 분석 응답을 수신하지 못했습니다.');
            }
          }
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
    if (isWheat) return;

    let isMounted = true;

    const fetchPriceHistory = async () => {
      try {
        const forceParam = isSyncing ? '&force=true' : '';
        const res = await fetch(`/api/history?commodity=${commodity.id}&timeframe=${activeTimeframe}${forceParam}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          if (isMounted) {
            setHistoricalData(json);
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

  }, [commodity.id, isWheat, activeTimeframe, isSyncing]);

  // Fetch full multi-year historical price dataset independently of activeTimeframe for 52-week rolling range
  useEffect(() => {
    if (isWheat) return;

    let isMounted = true;

    const fetchFullYearHistory = async () => {
      try {
        const forceParam = isSyncing ? '&force=true' : '';
        const res = await fetch(`/api/history?commodity=${commodity.id}&timeframe=5Y${forceParam}`);
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

    if (!usWheatHistory) {
      setUsWheatHistory(lastSuccessfulWheatHistoryRef.current || DEFAULT_WHEAT_HISTORY_BASELINE);
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

    return () => {
      isMounted = false;
    };
  }, [isWheat, isSyncing]);

  useEffect(() => {
    if (!isWheat && !isCorn && !isSoybean && !isSoybeanOil) return;
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
        const baseEndpoint = isWheat ? '/api/wheat/origin-radar' : isCorn ? '/api/corn/origin-radar' : isSoybeanOil ? '/api/soybean-oil/origin-radar' : isSoybean ? '/api/soybean/origin-radar' : null;
        if (!baseEndpoint) return;
        const url = isSyncing ? `${baseEndpoint}?force=true` : baseEndpoint;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.origins) && json.origins.length > 0 && isMounted) {
          setOriginRadarData(json.origins);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Origin radar fetch notice:', err);
      }
    };

    fetchAmis();
    fetchOriginRadar();
    return () => { isMounted = false; };
  }, [isWheat, isCorn, isSoybean, isSoybeanOil, isSyncing]);

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
          if (lastSuccessfulCornAnalysisRef.current) {
            setCornAnalysis(lastSuccessfulCornAnalysisRef.current);
          }
          setIsCornLoading(false);
        }
      }
    };

    fetchCornAnalysis();
    return () => { isMounted = false; };
  }, [isCorn, isSyncing]);

  // Soybean SCM Procurement Analysis Fetch Hook
  useEffect(() => {
    if (!isSoybean) return;
    let isMounted = true;
    setIsSoybeanLoading(true);

    const fetchSoybeanAnalysis = async () => {
      try {
        const url = isSyncing ? '/api/soybean/procurement-analysis?force=true' : '/api/soybean/procurement-analysis';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && json.data && isMounted) {
          setSoybeanAnalysis(json.data);
          lastSuccessfulSoybeanAnalysisRef.current = json.data;
          setIsSoybeanLoading(false);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Soybean procurement analysis fetch notice:', err);
        if (isMounted) {
          if (lastSuccessfulSoybeanAnalysisRef.current) {
            setSoybeanAnalysis(lastSuccessfulSoybeanAnalysisRef.current);
          }
          setIsSoybeanLoading(false);
        }
      }
    };

    fetchSoybeanAnalysis();
    return () => { isMounted = false; };
  }, [isSoybean, isSyncing]);

  // Soybean Oil SCM Procurement Analysis Fetch Hook
  useEffect(() => {
    if (!isSoybeanOil) return;
    let isMounted = true;
    setIsSoybeanOilLoading(true);

    const fetchSoybeanOilAnalysis = async () => {
      try {
        const url = isSyncing ? '/api/soybean-oil/procurement-analysis?force=true' : '/api/soybean-oil/procurement-analysis';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && json.data && isMounted) {
          setSoybeanOilAnalysis(json.data);
          lastSuccessfulSoybeanOilAnalysisRef.current = json.data;
          setIsSoybeanOilLoading(false);
        }
      } catch (err) {
        console.warn('[CommodityDetail] Soybean Oil procurement analysis fetch notice:', err);
        if (isMounted) {
          if (lastSuccessfulSoybeanOilAnalysisRef.current) {
            setSoybeanOilAnalysis(lastSuccessfulSoybeanOilAnalysisRef.current);
          }
          setIsSoybeanOilLoading(false);
        }
      }
    };

    fetchSoybeanOilAnalysis();
    return () => { isMounted = false; };
  }, [isSoybeanOil, isSyncing]);

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
      // Standard TTSA 2026 weekly series fallback
      rawSeries = [
        { date: '2026-01-06', price: 480 },
        { date: '2026-01-13', price: 480 },
        { date: '2026-01-20', price: 485 },
        { date: '2026-01-27', price: 490 },
        { date: '2026-02-03', price: 490 },
        { date: '2026-02-10', price: 490 },
        { date: '2026-02-17', price: 490 },
        { date: '2026-02-24', price: 495 },
        { date: '2026-03-03', price: 500 },
        { date: '2026-03-10', price: 500 },
        { date: '2026-03-17', price: 510 },
        { date: '2026-03-24', price: 515 },
        { date: '2026-03-31', price: 525 },
        { date: '2026-04-07', price: 540 },
        { date: '2026-04-21', price: 555 },
        { date: '2026-04-28', price: 565 },
        { date: '2026-05-05', price: 580 },
        { date: '2026-05-12', price: 605 },
        { date: '2026-05-19', price: 625 },
        { date: '2026-05-26', price: 650 },
        { date: '2026-06-02', price: 665 },
        { date: '2026-06-09', price: 685 },
        { date: '2026-06-16', price: 700 },
        { date: '2026-06-23', price: 700 },
        { date: '2026-06-30', price: 700 },
        { date: '2026-07-07', price: 700 },
        { date: '2026-07-14', price: 700 },
        { date: '2026-07-21', price: 700 },
        { date: '2026-08-04', price: 705 },
        { date: '2026-08-11', price: 705 },
        { date: '2026-08-18', price: 705 },
        { date: '2026-08-25', price: 705 },
        { date: '2026-09-01', price: 705 },
        { date: '2026-09-08', price: 705 },
        { date: '2026-09-15', price: 700 },
        { date: '2026-09-22', price: 700 }
      ];
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

  // Sugar Weekly Change calculation directly from shared SB=F historical series
  const sugarMetrics = useMemo(() => {
    if (!isSugar) return null;
    return getCalculatedMetrics('sugar', exchangeRate, {
      seriesData: historicalData?.data,
      changeWoW: commodity.changeWoW,
    });
  }, [isSugar, exchangeRate, historicalData, commodity.changeWoW]);

  const sugarWeeklyChange = useMemo(() => {
    if (!isSugar || !historicalData?.data || historicalData.data.length < 2) return null;
    const pts = historicalData.data;
    const latest = pts[pts.length - 1];
    const prevIndex = Math.max(0, pts.length - 6);
    const prev = pts[prevIndex];
    const absChangeUsdMt = Number((latest.usdPerMT - prev.usdPerMT).toFixed(2));
    const wowPct = prev.usdPerMT > 0 ? Number((((latest.usdPerMT - prev.usdPerMT) / prev.usdPerMT) * 100).toFixed(2)) : 0;
    const direction: 'up' | 'down' | 'unchanged' = absChangeUsdMt > 0 ? 'up' : absChangeUsdMt < 0 ? 'down' : 'unchanged';
    return {
      absChangeUsdMt,
      wowPct,
      direction
    };
  }, [isSugar, historicalData]);

  // Palm Oil Weekly Change calculation directly from shared FCPO.KL historical series
  const palmOilWeeklyChange = useMemo(() => {
    if (!isPalmOil) return null;
    const pts = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : (historicalData?.data && historicalData.data.length > 0)
      ? historicalData.data
      : null;
    if (!pts || pts.length < 2) {
      return {
        absChangeUsdMt: -32.50,
        wowPct: -2.90,
        direction: 'down' as const
      };
    }
    const latest = pts[pts.length - 1];
    const prevIndex = Math.max(0, pts.length - 6);
    const prev = pts[prevIndex];
    const absChangeUsdMt = Number((latest.usdPerMT - prev.usdPerMT).toFixed(2));
    const wowPct = prev.usdPerMT > 0 ? Number((((latest.usdPerMT - prev.usdPerMT) / prev.usdPerMT) * 100).toFixed(2)) : -2.90;
    const direction: 'up' | 'down' | 'unchanged' = absChangeUsdMt > 0 ? 'up' : absChangeUsdMt < 0 ? 'down' : 'unchanged';
    return {
      absChangeUsdMt,
      wowPct,
      direction
    };
  }, [isPalmOil, fullYearHistoryData, historicalData]);

  const palmMetrics = useMemo(() => {
    if (!isPalmOil) return null;

    const pts = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : (historicalData?.data && historicalData.data.length > 0)
      ? historicalData.data
      : palmOilCacheFallback.historicalSeries;

    let cpoWowPct = 0.82;
    let cpoWowChangeMt = 9.40;
    let cpoMomPct = 3.82;
    let cpoMomChangeMt = 41.20;

    let oleinWowPct = 0.86;
    let oleinWowChangeMt = 10.00;
    let oleinMomPct = 3.92;
    let oleinMomChangeMt = 44.00;

    if (pts.length >= 2) {
      const latest = pts[pts.length - 1];
      const latestCpo = latest.usdPerMT;
      const latestOlein = (latest as any).oleinUsdPerMt || LIVE_OLEIN_USD;

      // 1 week ago in verified series
      const weekAgoIdx = Math.max(0, pts.length - 3);
      const weekAgo = pts[weekAgoIdx];
      const weekAgoCpo = weekAgo.usdPerMT;
      const weekAgoOlein = (weekAgo as any).oleinUsdPerMt || LIVE_OLEIN_USD;

      if (weekAgoCpo > 0) {
        cpoWowChangeMt = Number((latestCpo - weekAgoCpo).toFixed(2));
        cpoWowPct = Number((((latestCpo - weekAgoCpo) / weekAgoCpo) * 100).toFixed(2));
      }
      if (weekAgoOlein > 0) {
        oleinWowChangeMt = Number((latestOlein - weekAgoOlein).toFixed(2));
        oleinWowPct = Number((((latestOlein - weekAgoOlein) / weekAgoOlein) * 100).toFixed(2));
      }

      // 1 month ago in verified series
      const monthAgoIdx = Math.max(0, pts.length - 11);
      const monthAgo = pts[monthAgoIdx];
      const monthAgoCpo = monthAgo.usdPerMT;
      const monthAgoOlein = (monthAgo as any).oleinUsdPerMt || LIVE_OLEIN_USD;

      if (monthAgoCpo > 0) {
        cpoMomChangeMt = Number((latestCpo - monthAgoCpo).toFixed(2));
        cpoMomPct = Number((((latestCpo - monthAgoCpo) / monthAgoCpo) * 100).toFixed(2));
      }
      if (monthAgoOlein > 0) {
        oleinMomChangeMt = Number((latestOlein - monthAgoOlein).toFixed(2));
        oleinMomPct = Number((((latestOlein - monthAgoOlein) / monthAgoOlein) * 100).toFixed(2));
      }
    }

    const cpoWowChangeConv = currency === 'KRW' ? Math.round(cpoWowChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((cpoWowChangeMt * liveEurUsd).toFixed(2)) : cpoWowChangeMt;
    const cpoMomChangeConv = currency === 'KRW' ? Math.round(cpoMomChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((cpoMomChangeMt * liveEurUsd).toFixed(2)) : cpoMomChangeMt;

    const oleinWowChangeConv = currency === 'KRW' ? Math.round(oleinWowChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((oleinWowChangeMt * liveEurUsd).toFixed(2)) : oleinWowChangeMt;
    const oleinMomChangeConv = currency === 'KRW' ? Math.round(oleinMomChangeMt * liveUsdKrw) : currency === 'EUR' ? Number((oleinMomChangeMt * liveEurUsd).toFixed(2)) : oleinMomChangeMt;

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
  }, [isPalmOil, fullYearHistoryData, historicalData, currency, liveUsdKrw, liveEurUsd, spreadUsd]);

  const wheatLandedCost = useMemo(() => isWheat ? (usWheatHistory?.landedCost || null) : null, [isWheat, usWheatHistory]);
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

  const [livePotatoData, setLivePotatoData] = useState<any>(null);
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
    return () => { isMounted = false; };
  }, [isPotatoStarch, isSyncing]);

  const procurementRiskLevel: '안정' | '주의' | '경계' = isWheat
    ? (amisData?.macroRiskLevel || '주의')
    : isPotatoStarch
    ? '주의'
    : isCorn
    ? (cornAnalysis?.procurementRisk?.level || '안정')
    : isSoybean
    ? (soybeanAnalysis?.procurementRisk?.level || '안정')
    : isSoybeanOil
    ? (soybeanOilAnalysis?.procurementRisk?.level || '안정')
    : nonWheatRisk.level;
  const procurementRiskSummary = isWheat
    ? (amisData?.macroRiskSentenceKo || 'AMIS 최신 소맥 리스크 요약 연동 대기')
    : isPotatoStarch
    ? (livePotatoData?.summary || '유럽 주요 조달국 원료감자 생산량 감소 전망(-8.00%) 및 재배면적 축소(-2.92%), 여름철 가뭄 여파로 공급이 타이트한 상태이며 전분 수율 변동과 천연가스/유틸리티 비용 주시가 권고됩니다.')
    : isCorn
    ? (cornAnalysis?.procurementRisk?.summarySentenceKo || '미 콘벨트 수확 진척 및 글로벌 옥수수 공급 안정세(재고율 25.9%)가 유지되고 있으나 남미 파종기 강우 여건 및 해상 운임 변동성 모니터링 필요')
    : isSoybean
    ? (soybeanAnalysis?.procurementRisk?.summarySentenceKo || '브라질 대풍작 및 미 중서부 수확 진행으로 글로벌 대두 수급 안정세(재고율 28.4%)가 유지되고 있으나 주요 산지 기상 및 원양 운임 추이 모니터링 필요')
    : isSoybeanOil
    ? (soybeanOilAnalysis?.procurementRisk?.summarySentenceKo || '글로벌 대두 착유량 및 대두유 재고 안정세가 유지되고 있으나 바이오연료 의무혼합 정책 및 액체 화물 운임 추이 모니터링 필요')
    : nonWheatRisk.summary;

  const activeDeskRecommendation =
    (isCorn && cornAnalysis?.deskRecommendation?.recommendation) ||
    (isSoybean && soybeanAnalysis?.deskRecommendation?.recommendation) ||
    (isSoybeanOil && soybeanOilAnalysis?.deskRecommendation?.recommendation) ||
    aiInsight?.deskRecommendation ||
    (aiInsight as any)?.recommendation ||
    (isWheat
      ? (hrwData?.wowPct != null && hrwData.wowPct <= -1.5 ? '분할 구매 검토' : procurementRiskLevel === '경계' ? '일부 물량 선확보 검토' : '현 수준 관망')
      : isCorn
      ? '45~60일 분할 구매 권고'
      : isSoybean
      ? '45~60일 분할 구매 권고'
      : isSoybeanOil
      ? '45~60일 분할 구매 권고'
      : commodity.recommendedCoverage || '현 수준 관망');

  const [liveOrigins, setLiveOrigins] = useState<any[]>([]);
  useEffect(() => {
    let isMounted = true;
    const fetchLiveOrigins = async () => {
      try {
        const forceParam = isSyncing ? '&force=true' : '';
        const res = await fetch(`/api/origins/live?commodity=${commodity.id}${forceParam}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.origins) && json.origins.length > 0 && isMounted) {
            setLiveOrigins(json.origins);
          }
        }
      } catch (err) {
        console.warn('[CommodityDetail] Live origins fetch notice:', err);
      }
    };
    fetchLiveOrigins();
    return () => { isMounted = false; };
  }, [commodity.id, isSyncing]); // <-- Added isSyncing

  const combinedOrigins = useMemo(() => {
    if (liveOrigins && liveOrigins.length > 0) {
      return liveOrigins;
    }
    if ((isWheat || isCorn || isSoybean) && originRadarData?.length) {
      return originRadarData;
    }
    return COMMODITY_ORIGINS_MAP[commodity.id] || (commodity.originsLedger as any) || [];
  }, [commodity.id, commodity.originsLedger, liveOrigins, originRadarData, isWheat, isCorn, isSoybean]);

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

  const effectiveBasePrice = useMemo(() => {
    if (isWheat && usWheatHistory?.metrics?.srw?.latestPriceMt) {
      const rawUsd = usWheatHistory.metrics.srw.latestPriceMt;
      if (currency === 'KRW') return Math.round(rawUsd * exchangeRate);
      if (currency === 'EUR') return Number((rawUsd / 1.08).toFixed(2));
      return rawUsd;
    }
    return commodity.price;
  }, [commodity.price, isWheat, usWheatHistory, currency, exchangeRate]);

  // Universal Single-Commodity Historical Time-Series Chart Data from Yahoo Finance
  const historicalChartData = useMemo(() => {
    if (isWheat || !historicalData || !historicalData.data || historicalData.data.length === 0) {
      return null;
    }

    const allPoints = historicalData.data;
    const totalCount = allPoints.length;

    // Filter by timeframe: 1M (22 trading days), 3M (65 trading days), 6M (130 trading days), 1Y (all)
    let sliceCount = 65;
    if (activeTimeframe === '1M') sliceCount = 22;
    else if (activeTimeframe === '3M') sliceCount = 65;
    else if (activeTimeframe === '6M') sliceCount = 130;
    else sliceCount = totalCount;

    const isTapioca = commodity.id === 'tapioca-starch';
    const filtered = isTapioca ? allPoints : allPoints.slice(Math.max(0, totalCount - sliceCount));
    if (filtered.length === 0) return null;

    const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;

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
  }, [isWheat, historicalData, activeTimeframe, currency, exchangeRate, commodity, latestHistoricalData]);

  const potatoProductionChartData = useMemo(() => {
    if (!isPotatoStarch) return null;

    // Germany, France, Netherlands, Denmark
    // 2022: 27.53, 2023: 29.16, 2024: 31.42, 2025: 30.00, 2026E: 27.60
    const fullData = livePotatoData?.years ? livePotatoData.years.map((y: any) => ({
      date: `${y.year} ${y.status === 'Actual' ? 'Actual' : 'Estimate'}`,
      price: y.productionMMT,
      isEstimate: y.status === 'Estimate'
    })) : [
      { date: '2021 Actual', price: 28.50, isEstimate: false }, // 5Y Start Point
      { date: '2022 Actual', price: 27.53, isEstimate: false },
      { date: '2023 Actual', price: 29.16, isEstimate: false }, // 3Y Start Point
      { date: '2024 Actual', price: 31.42, isEstimate: false }, // 1Y Start Point
      { date: '2025 Actual', price: 30.00, isEstimate: false }, // 6M Start Point
      { date: '2026 Estimate', price: 27.60, isEstimate: true }
    ];

    // Filter strictly by active timeframe:
    let rawData = fullData;
    if (activeTimeframe === '6M') {
      rawData = fullData.slice(-2); // 2025 -> 2026
    } else if (activeTimeframe === '1Y') {
      rawData = fullData.slice(-3); // 2024 -> 2025 -> 2026
    } else if (activeTimeframe === '3Y') {
      rawData = fullData.slice(-4); // 2023 -> 2024 -> 2025 -> 2026
    } else if (activeTimeframe === '5Y' || activeTimeframe === 'ALL') {
      rawData = fullData;          // 2021 -> 2022 -> 2023 -> 2024 -> 2025 -> 2026
    }

    const N = rawData.length;
    const allPrices = rawData.map(d => d.price);
    const low = Math.min(...allPrices);
    const high = Math.max(...allPrices);
    const avg = allPrices.reduce((sum, val) => sum + val, 0) / N;

    const width = 500;
    const height = 200;
    const padTop = 10;
    const padBottom = 15;
    const usableHeight = height - padTop - padBottom;

    const minVal = 25.0; 
    const maxVal = 34.0;
    const valRange = maxVal - minVal;

    const chartPoints = rawData.map((pt, idx) => {
      const x = Math.round((idx / (N - 1)) * width);
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

    if (N === 2) {
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
    return getTimeframeChartData(effectiveBasePrice, activeTimeframe, commodity.sparkline);
  }, [isWheat, isPotatoStarch, potatoProductionChartData, historicalChartData, effectiveBasePrice, activeTimeframe, commodity.sparkline]);

  // U.S. Wheat Associates Historical Time-Series Chart Data (SRW, HRW, HRS)
  const wheatChartData = useMemo(() => {
    if (!isWheat || !usWheatHistory || !usWheatHistory.data || usWheatHistory.data.length === 0) {
      return null;
    }

    const allPoints = usWheatHistory.data;
    const totalCount = allPoints.length;

    // Filter by timeframe: 1M (5 weeks), 3M (14 weeks), 6M (26 weeks), 1Y/ALL (all 29 weeks)
    let sliceCount = 14;
    if (activeTimeframe === '1M') sliceCount = 5;
    else if (activeTimeframe === '3M') sliceCount = 14;
    else if (activeTimeframe === '6M') sliceCount = 26;
    else sliceCount = totalCount;

    const filtered = allPoints.slice(Math.max(0, totalCount - sliceCount));
    if (filtered.length === 0) return null;

    // Convert wheat prices according to the active currency selector
    const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
    const allPrices = filtered.flatMap((p) => [p.srwMt * convRate, p.hrwMt * convRate, p.hrsMt * convRate]);
    const absoluteHigh = Math.max(...allPrices);
    const absoluteLow = Math.min(...allPrices);
    const paddingBuffer = (absoluteHigh - absoluteLow) * 0.05 || absoluteHigh * 0.05;
    const minVal = absoluteLow - paddingBuffer;
    const maxVal = absoluteHigh + paddingBuffer;
    const range = maxVal - minVal || 1;

    const usableHeight = 150 - 25 - 25; // top: 25, bottom: 25

    const getTs = (dStr: string) => new Date(dStr.replace(/\./g, '-')).getTime();
    const timestamps = filtered.map(p => getTs(p.reportDate)).filter(t => !isNaN(t));
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

    const coordPoints = filtered.map((p) => {
      const convSrwMt = p.srwMt * convRate;
      const convHrwMt = p.hrwMt * convRate;
      const convHrsMt = p.hrsMt * convRate;
      // Preserve source bushel values internally for traceability/tooltips only.
      const convSrwBu = p.srwBu;
      const convHrwBu = p.hrwBu;
      const convHrsBu = p.hrsBu;

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
        srwBu: convSrwBu,
        hrwBu: convHrwBu,
        hrsBu: convHrsBu,
        x,
        ySrw,
        yHrw,
        yHrs
      };
    });

    const buildSplinePath = (coords: { x: number; y: number }[]) => {
      if (coords.length < 2) return '';
      let path = `M ${coords[0].x},${coords[0].y}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const curr = coords[i];
        const next = coords[i + 1];
        const cpX = Math.round((curr.x + next.x) / 2);
        path += ` C ${cpX},${curr.y} ${cpX},${next.y} ${next.x},${next.y}`;
      }
      return path;
    };

    const srwLinePath = buildSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.ySrw })));
    const hrwLinePath = buildSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.yHrw })));
    const hrsLinePath = buildSplinePath(coordPoints.map((p) => ({ x: p.x, y: p.yHrs })));

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

    // Collision resolution for far-right Y-axis price badges
    const rawBadges = [
      { id: 'srw', y: latestPoint.ySrw },
      { id: 'hrw', y: latestPoint.yHrw },
      { id: 'hrs', y: latestPoint.yHrs },
    ].sort((a, b) => a.y - b.y);

    const minGapPx = 20; // Enforce minimum 20px gap between badges
    for (let i = 1; i < rawBadges.length; i++) {
      const prevY = rawBadges[i - 1].y;
      if (rawBadges[i].y - prevY < minGapPx) {
        rawBadges[i].y = prevY + minGapPx;
      }
    }

    // Clamp within chart bounds
    const maxCanvasY = 138;
    for (let i = rawBadges.length - 1; i >= 0; i--) {
      if (rawBadges[i].y > maxCanvasY) {
        rawBadges[i].y = maxCanvasY;
        if (i > 0 && rawBadges[i].y - rawBadges[i - 1].y < minGapPx) {
          rawBadges[i - 1].y = rawBadges[i].y - minGapPx;
        }
      }
    }

    const resolvedPcts: Record<string, number> = {};
    rawBadges.forEach((b) => {
      resolvedPcts[b.id] = (b.y / 150) * 100;
    });

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
      srwYPct: resolvedPcts['srw'],
      hrwYPct: resolvedPcts['hrw'],
      hrsYPct: resolvedPcts['hrs'],
    };
  }, [isWheat, usWheatHistory, activeTimeframe, currency, exchangeRate]);

  // Calculate period change percentage whenever active time series data updates
  const periodPctChange = useMemo(() => {
    if (isPalmOil && palmChartData?.points && palmChartData.points.length > 0) {
      const activeData = palmChartData.points;
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

  const livePoint = chartData.points && chartData.points.length > 0
    ? chartData.points[chartData.points.length - 1]
    : null;
  const latestLivePrice = livePoint ? livePoint.price : effectiveBasePrice;
  const liveY = livePoint ? livePoint.y : Math.round(200 - 15 - ((latestLivePrice - chartData.minVal) / (chartData.maxVal - chartData.minVal || 1)) * (200 - 10 - 15));
  const liveYPct = (liveY / 200) * 100;

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

      const convRate = currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1;
      const validUsdPrices = active365Data.map((p) => p.usdPerMT).filter((v) => Number.isFinite(v) && v > 0);
      const low52W = validUsdPrices.length > 0 ? Math.min(...validUsdPrices) : 100;
      const high52W = validUsdPrices.length > 0 ? Math.max(...validUsdPrices) : 1000;

      const rawCurrentPrice = (isSoybean && soybeanAnalysis?.benchmarkPrice?.usdPerMT)
        || (isCorn && cornAnalysis?.benchmarkPrice?.usdPerMT)
        || (isSoybeanOil && soybeanOilAnalysis?.benchmarkPrice?.usdPerMT)
        || active365Data[active365Data.length - 1]?.usdPerMT
        || effectiveBasePrice;

      const current = currency === 'KRW' && !isSoybean && !isCorn && !isSoybeanOil ? effectiveBasePrice : rawCurrentPrice * convRate;
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
    isSoybean,
    isCorn,
    isSoybeanOil,
    usWheatHistory,
    fullYearHistoryData,
    historicalData,
    palmChartData,
    cpoPrice,
    soybeanAnalysis,
    cornAnalysis,
    soybeanOilAnalysis,
    effectiveBasePrice,
    currency,
    exchangeRate
  ]);

  const palm52WeekStats = useMemo(() => {
    if (!isPalmOil) return null;

    // Strictly use full 1Y verified dataset or cache_palmoil.json fallback
    const fullPalmDataset = (fullYearHistoryData?.data && fullYearHistoryData.data.length > 0)
      ? fullYearHistoryData.data
      : (historicalData?.data && historicalData.data.length > 0 ? historicalData.data : palmOilCacheFallback.historicalSeries);

    const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const last365Days = fullPalmDataset.filter((pt: any) => new Date(pt.date).getTime() >= oneYearAgoMs);
    const year1Data = last365Days.length > 0 ? last365Days : fullPalmDataset;

    const cpoUsdPrices = year1Data
      .map((d: any) => d.cpoUsd ?? ((d.centsPerBushel && liveUsdMyr > 0) ? (d.centsPerBushel / liveUsdMyr) : d.usdPerMT))
      .filter((v: any) => Number.isFinite(v) && v > 0);
    const oleinUsdPrices = year1Data
      .map((d: any) => d.oleinUsd ?? d.oleinUsdPerMt)
      .filter((v: any): v is number => Number.isFinite(v) && v > 0);

    const rawCpoLow = cpoUsdPrices.length > 0 ? Math.min(...cpoUsdPrices, cpoUsdMt) : 967.47;
    const rawCpoHigh = cpoUsdPrices.length > 0 ? Math.max(...cpoUsdPrices, cpoUsdMt) : 1120.24;

    const rawOleinLow = oleinUsdPrices.length > 0 ? Math.min(...oleinUsdPrices, LIVE_OLEIN_USD) : 1012.00;
    const rawOleinHigh = oleinUsdPrices.length > 0 ? Math.max(...oleinUsdPrices, LIVE_OLEIN_USD) : 1167.50;

    const cpoCurrent = cpoPrice;
    const cpoLow = currency === 'KRW' ? Math.round(rawCpoLow * liveUsdKrw) : currency === 'EUR' ? Number((rawCpoLow * liveEurUsd).toFixed(2)) : rawCpoLow;
    const cpoHigh = currency === 'KRW' ? Math.round(rawCpoHigh * liveUsdKrw) : currency === 'EUR' ? Number((rawCpoHigh * liveEurUsd).toFixed(2)) : rawCpoHigh;

    const oleinCurrent = oleinPrice;
    const oleinLow = currency === 'KRW' ? Math.round(rawOleinLow * liveUsdKrw) : currency === 'EUR' ? Number((rawOleinLow * liveEurUsd).toFixed(2)) : rawOleinLow;
    const oleinHigh = currency === 'KRW' ? Math.round(rawOleinHigh * liveUsdKrw) : currency === 'EUR' ? Number((rawOleinHigh * liveEurUsd).toFixed(2)) : rawOleinHigh;

    const cpoPct = rawCpoHigh > rawCpoLow ? Math.max(0, Math.min(100, Math.round(((cpoUsdMt - rawCpoLow) / (rawCpoHigh - rawCpoLow)) * 100))) : 50;
    const oleinPct = rawOleinHigh > rawOleinLow ? Math.max(0, Math.min(100, Math.round(((LIVE_OLEIN_USD - rawOleinLow) / (rawOleinHigh - rawOleinLow)) * 100))) : 50;

    return {
      cpoCurrent,
      cpoLow,
      cpoHigh,
      cpoPct,
      oleinCurrent,
      oleinLow,
      oleinHigh,
      oleinPct,
    };
  }, [isPalmOil, currency, liveUsdMyr, liveUsdKrw, liveEurUsd, cpoUsdMt, cpoPrice, oleinPrice, spreadUsd, fullYearHistoryData, historicalData]);

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

    const pts = chartData.points;
    if (!pts || pts.length === 0) return;

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

      // CANVAS 1 (PAGE 1)
      const canvas1 = await html2canvas(p1El, {
        ...canvasOpts,
        onclone: (clonedDoc) => {
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
        },
      });

      const imgData1 = canvas1.toDataURL('image/png');
      const imgHeight1 = (canvas1.height * contentWidth) / canvas1.width;
      pdf.addImage(imgData1, 'PNG', margin, margin, contentWidth, imgHeight1, undefined, 'FAST');

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
      pdf.addImage(imgData2, 'PNG', margin, margin, contentWidth, imgHeight2, undefined, 'FAST');

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
    return `${currencySymbol}${formatted} ${currencyLabel}`;
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
                    ? 'MDEX: FCPO · Spot: RBD Olein'
                    : isCorn
                    ? 'CBOT: CC1'
                    : isSoybean
                    ? 'CBOT: ZS'
                    : isSoybeanOil
                    ? 'CBOT: ZL'
                    : isSugar
                    ? 'ICE: SBC1'
                    : isPotatoStarch
                    ? 'EEX: PS'
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
                  {currencySymbol}{formatConvertedPrice(effectiveBasePrice)}
                </span>
                <span className="text-[10px] font-normal text-slate-500 font-mono whitespace-nowrap">
                  {currencyLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-1 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                {SOURCE_LABELS[commodity.id] || commodity.ticker} · {commodity.gradeEn}
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
                  <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${
                    commodity.changeWoW >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {commodity.changeWoW >= 0 ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                    <span>{commodity.changeWoW >= 0 ? `+${commodity.changeWoW.toFixed(2)}%` : `${commodity.changeWoW.toFixed(2)}%`}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5 whitespace-nowrap">
                    {commodity.changeWoW >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(effectiveBasePrice * (commodity.changeWoW / 100)))}
                  </span>
                </div>

                {/* Right: MoM */}
                <div className="pl-1">
                  <span className="text-[10px] font-medium text-slate-400 block font-sans">전월 (MoM)</span>
                  <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${
                    commodity.changeMoM >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {commodity.changeMoM >= 0 ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                    <span>{commodity.changeMoM >= 0 ? `+${commodity.changeMoM.toFixed(2)}%` : `${commodity.changeMoM.toFixed(2)}%`}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5 whitespace-nowrap">
                    {commodity.changeMoM >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(effectiveBasePrice * (commodity.changeMoM / 100)))}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Desk Recommendation */}
            <div id="scm-desk-recommendation-card" className="header-metric-card bg-slate-50/90 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-center min-w-0 min-h-[105px]">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1.5">데스크 권고</span>
              <span className={`inline-flex self-start items-center text-xs font-bold px-2.5 py-1 rounded-md transition-colors break-keep whitespace-normal ${getRecommendationColor(activeDeskRecommendation)}`}>
                {activeDeskRecommendation}
              </span>
            </div>
          </div>

          {/* Row 2: common Procurement Risk strip across full width. */}
          <div id="scm-procurement-risk-card" className="w-full bg-slate-50/80 border border-slate-200/70 rounded-lg px-3.5 py-2 flex flex-row items-center gap-2.5 min-w-0">
            {/* Left Label & Badge Group */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">조달 리스크</span>
              <span className={`inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded border leading-none tracking-tight whitespace-nowrap select-none ${
                procurementRiskLevel === '경계'
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : procurementRiskLevel === '주의'
                  ? 'text-[#EC870C] bg-[#fff7ed] border-[#fed7aa]'
                  : 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-medium text-[10px] px-2 py-0.5 rounded shrink-0'
              }`}>
                {procurementRiskLevel}
              </span>
            </div>

            {/* Right Summary Sentence */}
            <p className="text-xs text-slate-700 font-medium font-sans leading-relaxed break-keep whitespace-normal min-w-0 flex-1 my-0">
              {procurementRiskSummary}
            </p>
            {isWheat && isAmisFailed && (
              <span className="text-[10px] text-[#DF0029] font-semibold shrink-0">AMIS 최신 갱신 실패 · 이전 검증 데이터 유지</span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Interactive Historical Trend & Technical Chart (Full Width 100%) */}
      <section className="w-full bg-white p-5 rounded-lg shadow-sm border border-[#e5e7eb] space-y-4 pdf-section-block print:p-3 print:mt-4 overflow-visible">
        <div className="flex items-center justify-between w-full mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-[18px] text-[#111827]">show_chart</span>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              {isWheat ? '가격 추이 분석' : isPotatoStarch ? '주요 조달국 원료감자 생산량 추이' : '가격 추이 및 기술적 지표'} <span className="text-sm font-bold text-slate-900 ml-1">({isPotatoStarch ? 'Raw Potato Production Trend' : 'Price Trend Analysis'})</span>
            </h3>

            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 font-sans ml-1">
              {isWheat ? (
                <>
                  <a 
                    href={usWheatHistory?.sourceUrl || EXTERNAL_CHART_URLS['wheat'] || "https://uswheat.org/market-information/price-report/"} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#DF0029] transition-colors font-normal font-sans"
                  >
                    출처: U.S. Wheat Associates ↗
                  </a>
                  <span>|</span>
                  <span className="font-sans font-normal">Report Date: <span className="font-normal text-gray-500">{usWheatHistory?.reportDate || 'September 18, 2026'}</span></span>
                  {isUsWheatFailed && (
                    <span className="text-[10px] font-semibold text-[#DF0029] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      업데이트 실패 (이전 데이터 유지)
                    </span>
                  )}
                </>
              ) : isPalmOil ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans">
                  <span>출처:</span>
                  <a 
                    href="https://www.tradingview.com/symbols/MYX-FCPO1!/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#DF0029] transition-colors font-normal font-sans"
                  >
                    MDEX (FCPO) ↗
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
                  출처: JRC MARS · Eurostat ↗
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
                const activeData = palmChartData.points;
                const firstPoint = activeData[0]?.cpoPrice || 1;
                const lastPoint = activeData[activeData.length - 1]?.cpoPrice || 1;
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

                  {isActive && (
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
                    {currencySymbol}{formatConvertedPrice(usWheatHistory.metrics.srw.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.srw.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.srw.wowChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.srw.wowChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.srw.wowChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.srw.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.srw.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.srw.momChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.srw.momChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.srw.momChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.srw.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
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
                    {currencySymbol}{formatConvertedPrice(usWheatHistory.metrics.hrw.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.hrw.wowChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.hrw.wowChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrw.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrw.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrw.momChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.hrw.momChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.hrw.momChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrw.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
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
                    {currencySymbol}{formatConvertedPrice(usWheatHistory.metrics.hrs.latestPriceMt * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.hrs.wowChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.hrs.wowChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrs.wowChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      usWheatHistory.metrics.hrs.momChangeMt >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {usWheatHistory.metrics.hrs.momChangeMt >= 0 ? '+' : ''}{usWheatHistory.metrics.hrs.momChangePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({usWheatHistory.metrics.hrs.momChangeMt >= 0 ? '+' : '-'}{currencySymbol}{formatConvertedPrice(Math.abs(usWheatHistory.metrics.hrs.momChangeMt) * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                    {currencySymbol}{formatPalmPrice(cpoPrice)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.cpo.wowChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.cpo.wowChangeConv >= 0 ? '+' : ''}{palmMetrics.cpo.wowPct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({palmMetrics.cpo.wowChangeConv >= 0 ? '+' : '-'}{currencySymbol}{formatPalmPrice(Math.abs(palmMetrics.cpo.wowChangeConv))})
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.cpo.momChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.cpo.momChangeConv >= 0 ? '+' : ''}{palmMetrics.cpo.momPct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({palmMetrics.cpo.momChangeConv >= 0 ? '+' : '-'}{currencySymbol}{formatPalmPrice(Math.abs(palmMetrics.cpo.momChangeConv))})
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
                  FOB Mal/Indo
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                    {currencySymbol}{formatPalmPrice(oleinPrice)}
                    <span className="text-xs font-semibold text-slate-500 ml-1">{currencyLabel}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">WoW:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.olein.wowChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.olein.wowChangeConv >= 0 ? '+' : ''}{palmMetrics.olein.wowPct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({palmMetrics.olein.wowChangeConv >= 0 ? '+' : '-'}{currencySymbol}{formatPalmPrice(Math.abs(palmMetrics.olein.wowChangeConv))})
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-400">MoM:</span>
                    <span className={`text-xs font-mono font-bold ${
                      palmMetrics.olein.momChangeConv >= 0 ? 'text-[#059669]' : 'text-[#DF0029]'
                    }`}>
                      {palmMetrics.olein.momChangeConv >= 0 ? '+' : ''}{palmMetrics.olein.momPct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({palmMetrics.olein.momChangeConv >= 0 ? '+' : '-'}{currencySymbol}{formatPalmPrice(Math.abs(palmMetrics.olein.momChangeConv))})
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
                <span className="text-left">최저: {currencySymbol}{formatConvertedPrice(wheatChartData.low)}</span>
                <span className="text-center">평균: {currencySymbol}{formatConvertedPrice(wheatChartData.avg)}</span>
                <span className="text-right">최고: {currencySymbol}{formatConvertedPrice(wheatChartData.high)}</span>
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
                    key={`wheat-tick-label-${idx}`}
                    className="absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0"
                    style={{ top: `${(tick.y / 150) * 100}%` }}
                  >
                    {currencySymbol}{formatConvertedPrice(tick.value)} {currencyLabel}
                  </span>
                ))}
              </div>

              {/* Permanent Fixed Live Price Badges on Far-Right Y-Axis (Collision Resolved) */}
              <div
                className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10 transition-all duration-200"
                style={{ top: `${wheatChartData.srwYPct}%` }}
              >
                <span className="bg-[#DF0029] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-xs whitespace-nowrap block border border-white/20">
                  SRW {currencySymbol}{formatConvertedPrice(wheatChartData.latestPoint.srwMt)}
                </span>
              </div>
              <div
                className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10 transition-all duration-200"
                style={{ top: `${wheatChartData.hrwYPct}%` }}
              >
                <span className="bg-[#EC870C] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-xs whitespace-nowrap block border border-white/20">
                  HRW {currencySymbol}{formatConvertedPrice(wheatChartData.latestPoint.hrwMt)}
                </span>
              </div>
              <div
                className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10 transition-all duration-200"
                style={{ top: `${wheatChartData.hrsYPct}%` }}
              >
                <span className="bg-[#2563EB] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-xs whitespace-nowrap block border border-white/20">
                  HRS {currencySymbol}{formatConvertedPrice(wheatChartData.latestPoint.hrsMt)}
                </span>
              </div>

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
                    <span className="font-bold">{currencySymbol}{formatConvertedPrice(wheatCrosshairState.srwMt)}/MT</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#EC870C]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EC870C]"></span> HRW:
                    </span>
                    <span className="font-bold">{currencySymbol}{formatConvertedPrice(wheatCrosshairState.hrwMt)}/MT</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#2563EB]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> HRS:
                    </span>
                    <span className="font-bold">{currencySymbol}{formatConvertedPrice(wheatCrosshairState.hrsMt)}/MT</span>
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
                <span className="text-left">최저: {currencySymbol}{formatPalmPrice(palmChartData.low)}</span>
                <span className="text-center">평균: {currencySymbol}{formatPalmPrice(palmChartData.avg)}</span>
                <span className="text-right">최고: {currencySymbol}{formatPalmPrice(palmChartData.high)}</span>
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
                    <circle
                      cx={palmCrosshairState.snappedX}
                      cy={palmCrosshairState.yCpo}
                      r="4.5"
                      fill="#DF0029"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    {/* Olein Dot */}
                    <circle
                      cx={palmCrosshairState.snappedX}
                      cy={palmCrosshairState.yOlein}
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
                {palmChartData.ticks.map((tick, idx) => (
                  <span
                    key={`palm-tick-label-${idx}`}
                    className="absolute right-0 text-[10px] text-slate-400 font-mono transform -translate-y-1/2 bg-transparent select-none whitespace-nowrap z-0"
                    style={{ top: `${(tick.y / 150) * 100}%` }}
                  >
                    {currencySymbol}{formatPalmPrice(tick.value)} {currencyLabel}
                  </span>
                ))}
              </div>

              {/* Permanent Fixed Live Price Badges on Far-Right Y-Axis */}
              {palmChartData.points.length > 0 && (
                <>
                  <div
                    className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10"
                    style={{ top: `${(palmChartData.points[palmChartData.points.length - 1].yCpo / 150) * 100}%` }}
                  >
                    <span className="bg-[#DF0029] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-xs whitespace-nowrap block">
                      CPO {currencySymbol}{formatPalmPrice(cpoPrice)}
                    </span>
                  </div>
                  <div
                    className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10"
                    style={{ top: `${(palmChartData.points[palmChartData.points.length - 1].yOlein / 150) * 100}%` }}
                  >
                    <span className="bg-[#2563EB] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-xs whitespace-nowrap block">
                      Olein {currencySymbol}{formatPalmPrice(oleinPrice)}
                    </span>
                  </div>
                </>
              )}

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
                      MDEX / Spot
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#DF0029]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> CPO:
                    </span>
                    <span className="font-bold">{currencySymbol}{formatPalmPrice(palmCrosshairState.cpoPrice)} {currencyLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[#2563EB]">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> Palm Olein:
                    </span>
                    <span className="font-bold">{currencySymbol}{formatPalmPrice(palmCrosshairState.oleinPrice)} {currencyLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-slate-600 border-t border-slate-100 pt-1">
                    <span className="font-sans font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span> 정제 스프레드:
                    </span>
                    <span className="font-bold font-mono">
                      {currencySymbol}{formatPalmPrice(palmCrosshairState.oleinPrice - palmCrosshairState.cpoPrice)} {currencyLabel}
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
        ) : (
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
                {!isPotatoStarch && (
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
                    {isPotatoStarch ? `${tick.value.toFixed(1)} MMT` : `${currencySymbol}${Math.round(tick.value).toLocaleString('en-US')} ${currencyLabel}`}
                  </span>
                ))}
              </div>

              {/* Permanent Fixed Live Price Badge or Latest Production */}
              {!isPotatoStarch ? (
                <div
                  className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10"
                  style={{ top: `${((liveY - 16) / 200) * 100}%` }}
                >
                  <span className="bg-[#DF0829] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-sm whitespace-nowrap block">
                    {formatChartPrice(latestLivePrice)}
                  </span>
                </div>
              ) : (
                <div
                  className="absolute right-0 pointer-events-none transform -translate-y-1/2 z-10"
                  style={{ top: `${((34.0 - 27.60) / (34.0 - 25.0)) * 100}%` }}
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
                          : `${currencySymbol}${formatConvertedPrice(crosshairState.price)} ${currencyLabel}`}
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
        )}

        {/* 52-Week Range Bar / Summary (Exclusively hidden for Potato Starch) */}
        {!isPotatoStarch && (
          isWheat ? (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">52주 가격 밴드 및 위치 분석 (52-Week Range Percentile)</span>
                <span className="font-mono text-[#111827]">December 2026 인도물 벤치마크</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#DF0029]"></span> CBOT SRW
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 81% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#DF0029] h-full rounded-full" style={{ width: '81%' }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {currencySymbol}{formatConvertedPrice(187.03 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span className="font-bold text-slate-800">현: {currencySymbol}{formatConvertedPrice(262.35 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span>고: {currencySymbol}{formatConvertedPrice(279.62 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#EC870C]"></span> KCBT HRW
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 87% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#EC870C] h-full rounded-full" style={{ width: '87%' }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {currencySymbol}{formatConvertedPrice(189.23 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span className="font-bold text-slate-800">현: {currencySymbol}{formatConvertedPrice(288.07 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span>고: {currencySymbol}{formatConvertedPrice(302.03 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span> MIAX HRS
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">밴드 90% 위치</span>
                  </div>
                  <div className="w-full bg-[#e5e7eb] h-2 rounded-full overflow-hidden">
                    <div className="bg-[#2563EB] h-full rounded-full" style={{ width: '90%' }}></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>저: {currencySymbol}{formatConvertedPrice(211.64 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span className="font-bold text-slate-800">현: {currencySymbol}{formatConvertedPrice(272.27 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                    <span>고: {currencySymbol}{formatConvertedPrice(278.52 * (currency === 'KRW' ? exchangeRate : currency === 'EUR' ? 1 / 1.08 : 1))}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : isPalmOil && palm52WeekStats ? (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">52주 가격 밴드 및 위치 분석 (52-Week Range Percentile)</span>
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
                    <span>저: {currencySymbol}{formatPalmPrice(palm52WeekStats.cpoLow)}</span>
                    <span className="font-bold text-slate-800">현: {currencySymbol}{formatPalmPrice(palm52WeekStats.cpoCurrent)}</span>
                    <span>고: {currencySymbol}{formatPalmPrice(palm52WeekStats.cpoHigh)}</span>
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
                    <span>저: {currencySymbol}{formatPalmPrice(palm52WeekStats.oleinLow)}</span>
                    <span className="font-bold text-slate-800">현: {currencySymbol}{formatPalmPrice(palm52WeekStats.oleinCurrent)}</span>
                    <span>고: {currencySymbol}{formatPalmPrice(palm52WeekStats.oleinHigh)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#f9fafb] rounded-lg border border-[#e5e7eb] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#6b7280]">52주 가격 밴드 및 위치 분석 (52-Week Range Percentile)</span>
                <span className="font-mono text-[#111827]">
                  {range52WeekStats.pct >= 98 
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
            </div>
          )
        )}
      </section>

      {/* 4. AI Market View & Strategy Recommendation */}
      <AiRecommendation
        key={selectedCommodity?.id || (selectedCommodity as any)?.slug || (selectedCommodity as any)?.key || commodity.id}
        commodityId={commodity.id}
        currency={commodity.id === 'potato-starch' ? 'EUR' : currency}
        confidenceScore={aiInsight?.confidenceScore || 88}
        recommendedCoverage={activeDeskRecommendation}
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
          commodityName={commodity.name}
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
        <CommodityNews commodityId={commodity.id} />
      </section>
    </div>
  </div>
);
};
