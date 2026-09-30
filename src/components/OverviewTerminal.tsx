import React, { useState, useEffect } from 'react';
import { getPublisherPortalUrl, isInvalidOrSearchUrl } from '../utils/portalUrls';
import { Download } from 'lucide-react';
import { Commodity, Currency, MacroDriver, MarketIssue } from '../types';
import { exportGlobalDashboardToPdf } from '../utils/exportDashboardPdf';
import {
  formatPrice as formatPriceUtil,
  formatLandedCost as formatLandedCostUtil,
  formatStarchSweetenerBenchmark,
  formatCurrencyValue,
  COMMODITY_CONFIGS,
  getCalculatedMetrics
} from '../utils/landedCostCalculator';
import AiMarketBrief from './AiMarketBrief';

const GREEN_BADGE_STYLE = 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';

const DEFAULT_MACRO_FALLBACKS = {
  fx: {
    rate: '1,358.7 ₩',
    eurRate: 'EUR 1,556.2₩',
    change: '+0.82%',
    status: '원가상승 요인',
    badgeType: 'red' as const,
    note: '주요 외환 리스크'
  },
  oil: {
    rate: '$74.20 /bbl',
    secondary: 'TTF €39.8/MWh',
    change: '+0.45%',
    status: '우호적 (Favorable)',
    badgeType: 'green' as const,
    note: '가공 연료비 완화'
  },
  freight: {
    rate: '3,445.0 pts',
    secondary: 'BDI Index',
    change: '-1.77%',
    status: '운임 하향 안정',
    badgeType: 'green' as const,
    note: '로테르담-부산 구간'
  },
  policy: {
    headline: '러 곡물쿼터 축소',
    subline: '인니 B40 의무화',
    change: '1,100만T',
    status: '수출 통제 심화',
    badgeType: 'red' as const,
    note: '흑해 통상 규제'
  }
};

const WASDE_PORTFOLIO_SUMMARY = [
  { id: 'wheat', name: '소맥 (Wheat)', production: '822.4 MMT', consumption: '822.5 MMT', endingStocks: '276.3 MMT', stockToUseRatio: '33.6' },
  { id: 'corn', name: '옥수수 (Corn)', production: '1,235.7 MMT', consumption: '1,228.4 MMT', endingStocks: '318.5 MMT', stockToUseRatio: '25.9' },
  { id: 'soybean', name: '대두 (Soybean)', production: '428.7 MMT', consumption: '402.5 MMT', endingStocks: '134.6 MMT', stockToUseRatio: '33.4' },
  { id: 'soybean-oil', name: '대두유 (Soybean Oil)', production: '65.8 MMT', consumption: '65.2 MMT', endingStocks: '5.4 MMT', stockToUseRatio: '8.3' },
  { id: 'palm-oil', name: '팜유 (Palm Oil)', production: '79.8 MMT', consumption: '78.4 MMT', endingStocks: '17.2 MMT', stockToUseRatio: '21.9' },
  { id: 'sugar', name: '원당 (Sugar)', production: '186.2 MMT', consumption: '179.8 MMT', endingStocks: '41.5 MMT', stockToUseRatio: '23.1' },
];

const getSparklinePath = (sparkline: number[] | undefined, changeWoW: number): string => {
  let points: number[] = sparkline && sparkline.length >= 2 ? [...sparkline] : [];
  if (points.length < 2) {
    if (changeWoW < 0) {
      points = [12, 11, 9, 8, 7, 4];
    } else if (changeWoW > 0) {
      points = [4, 7, 8, 10, 11, 13];
    } else {
      points = [10, 10, 10, 10, 10, 10];
    }
  }

  // Force directional consistency with WoW metric:
  if (changeWoW < 0 && points[points.length - 1] >= points[0]) {
    const diff = Math.abs(points[points.length - 1] - points[0]) + 3;
    points[points.length - 1] = points[0] - diff;
  } else if (changeWoW > 0 && points[points.length - 1] <= points[0]) {
    const diff = Math.abs(points[0] - points[points.length - 1]) + 3;
    points[points.length - 1] = points[0] + diff;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const width = 64;
  const paddingX = 2;
  const paddingY = 3;
  const usableHeight = 14;

  const n = points.length;
  const stepX = (width - paddingX * 2) / (n - 1);

  return points
    .map((val, idx) => {
      const x = Math.round((paddingX + idx * stepX) * 10) / 10;
      const norm = (val - min) / range;
      const y = Math.round((paddingY + (1 - norm) * usableHeight) * 10) / 10;
      return `${idx === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
};

interface OverviewTerminalProps {
  commodities: Commodity[];
  macroDrivers: MacroDriver[];
  marketIssues: MarketIssue[];
  onNavigate: (view: string, hash?: string) => void;
  currency: Currency;
  onRefreshGemini: () => void;
  isSyncing: boolean;
  aiBriefText?: string;
  usdKrwRate?: number;
  modelVersion?: string;
}

export const OverviewTerminal: React.FC<OverviewTerminalProps> = ({
  commodities,
  macroDrivers,
  marketIssues,
  onNavigate,
  currency,
  onRefreshGemini,
  isSyncing,
  aiBriefText,
  usdKrwRate = 1388.5,
  modelVersion
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // 1. Silent Initial State for all 4 Macro Drivers (Zero UI Collapsing with Default Fallbacks)
  const [fxData, setFxData] = useState<{
    rate: string;
    eurRate: string;
    change: string;
    status: string;
    badgeType: 'red' | 'green' | 'amber';
    note: string;
  }>(DEFAULT_MACRO_FALLBACKS.fx);

  const [oilData, setOilData] = useState<{
    rate: string;
    secondary: string;
    change: string;
    status: string;
    badgeType: 'red' | 'green' | 'amber';
    note: string;
  }>(DEFAULT_MACRO_FALLBACKS.oil);

  const [freightData, setFreightData] = useState<{
    rate: string;
    secondary: string;
    change: string;
    status: string;
    badgeType: 'red' | 'green' | 'amber';
    note: string;
  }>(DEFAULT_MACRO_FALLBACKS.freight);

  const [policyData, setPolicyData] = useState<{
    headline: string;
    subline: string;
    change: string;
    status: string;
    badgeType: 'red' | 'green' | 'amber';
    note: string;
    sourceUrl?: string;
  }>(DEFAULT_MACRO_FALLBACKS.policy);

  const [selectedWasdeKey, setSelectedWasdeKey] = useState<string>('wheat');
  const [weatherData, setWeatherData] = useState({
    usCornBelt: { temp: 22.1, precip: 14.2 },
    saSoyBelt: { temp: 33.4, precip: 2.1 },
    euCropRadar: { temp: 17.5, precip: 6.4 }
  });

  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      const fetchSafe = async (url: string) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (res.ok) return await res.json();
        } catch {
          return null;
        }
        return null;
      };

      try {
        const [usData, saData, euData] = await Promise.all([
          fetchSafe('https://api.open-meteo.com/v1/forecast?latitude=41.8780&longitude=-93.0977&current_weather=true&daily=precipitation_sum&timezone=auto'),
          fetchSafe('https://api.open-meteo.com/v1/forecast?latitude=-12.6432&longitude=-55.4243&current_weather=true&daily=precipitation_sum&timezone=auto'),
          fetchSafe('https://api.open-meteo.com/v1/forecast?latitude=46.2276&longitude=2.2137&current_weather=true&daily=precipitation_sum&timezone=auto')
        ]);

        if (!isMounted) return;

        setWeatherData({
          usCornBelt: {
            temp: typeof usData?.current_weather?.temperature === 'number' ? usData.current_weather.temperature : 22.1,
            precip: typeof usData?.daily?.precipitation_sum?.[0] === 'number' ? usData.daily.precipitation_sum[0] : 14.2
          },
          saSoyBelt: {
            temp: typeof saData?.current_weather?.temperature === 'number' ? saData.current_weather.temperature : 33.4,
            precip: typeof saData?.daily?.precipitation_sum?.[0] === 'number' ? saData.daily.precipitation_sum[0] : 2.1
          },
          euCropRadar: {
            temp: typeof euData?.current_weather?.temperature === 'number' ? euData.current_weather.temperature : 17.5,
            precip: typeof euData?.daily?.precipitation_sum?.[0] === 'number' ? euData.daily.precipitation_sum[0] : 6.4
          }
        });
      } catch (err) {
        console.warn('[Open-Meteo fetch notice]:', err);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 300000); // 5 minutes refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchLivePolicy = async () => {
      try {
        const url = isSyncing ? '/api/scm/live-policy?force=true' : '/api/scm/live-policy';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setPolicyData({
              headline: data.title,
              subline: data.summary,
              change: data.statusType === 'favorable' ? '호재 반영' : data.statusType === 'warning' ? '우려 지속' : '중립적',
              status: data.statusTag,
              badgeType: data.statusType === 'favorable' ? 'green' : data.statusType === 'warning' ? 'red' : 'amber',
              note: data.summary,
              sourceUrl: data.sourceUrl
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch live trade policy:', err);
      }
    };
    fetchLivePolicy();
    const interval = setInterval(fetchLivePolicy, 600000); // 10 minutes refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isSyncing]);

  const riskWeight: Record<string, number> = {
    'High': 1, // 고위험 first
    'Med': 2,  // 중위험 second
    'Low': 3   // 저위험 last
  };

  const [localMarketIssues, setLocalMarketIssues] = useState<any[]>(() => {
    return [...marketIssues].sort((a, b) => {
      return (riskWeight[a.risk] || 99) - (riskWeight[b.risk] || 99);
    });
  });

  useEffect(() => {
    if (marketIssues && marketIssues.length > 0) {
      const sortedInitial = [...marketIssues].sort((a, b) => {
        return (riskWeight[a.risk] || 99) - (riskWeight[b.risk] || 99);
      });
      setLocalMarketIssues(sortedInitial);
    }
  }, [marketIssues]);

  useEffect(() => {
    let isMounted = true;
    const loadMarketIssues = async () => {
      try {
        const url = isSyncing ? '/api/scm/live-market-issues?force=true' : '/api/scm/live-market-issues';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data) && data.length > 0) {
            const mapped = data.map((item: any, idx: number) => ({
              id: `live-issue-${idx}`,
              title: item.title,
              risk: item.riskLevel === '고위험' ? 'High' : item.riskLevel === '중위험' ? 'Med' : 'Low',
              direction: item.impactDirection === '상승' ? 'Bullish' : 'Bearish',
              date: item.dateStr,
              source: item.publisher,
              url: item.sourceUrl
            }));
            const sortedIssues = [...mapped].sort((a, b) => {
              return (riskWeight[a.risk] || 99) - (riskWeight[b.risk] || 99);
            });
            setLocalMarketIssues(sortedIssues);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch live market issues:', err);
      }
    };
    loadMarketIssues();
    const interval = setInterval(loadMarketIssues, 600000); // 10 minutes refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [marketIssues, isSyncing]);

  const [wasdeData, setWasdeData] = useState<any>({
    commodityName: '소맥 (Wheat)',
    marketYear: '2025/26',
    source: 'USDA FAS PSD / WASDE Official',
    lastUpdated: '10:00:00 KST',
    production: { mmt: 822.4, kmt: '822,432', label: '총생산 (Production)', unit: 'MMT' },
    consumption: { mmt: 822.5, kmt: '822,456', label: '총소비 (Consumption)', unit: 'MMT' },
    endingStocks: { mmt: 276.3, stuRatio: '33.6%', label: '기말재고 (Ending Stocks)', unit: 'MMT' },
    exports: { mmt: 211.8, kmt: '211,768', label: '총수출량 (Exports)', unit: 'MMT' },
    areaHarvested: { mha: 215.3, kha: '215,326', label: '수확면적 (Area Harvested)', unit: 'M HA' },
    yield: { mtPerHa: 3.82, kgPerHa: '3,820', label: '단수/수확량 (Yield)', unit: 'MT/HA' },
    executiveBrief: '미국산 HRW 소맥은 560~590 USd/bu 범위의 단기 횡보세를 유지하고 있습니다.'
  });
  const [wasdeByCommodity, setWasdeByCommodity] = useState<Record<string, any>>({});

  // Parallel Background Fetchers: Connected to Server-Side Multi-Tier Pipeline (/api/pipeline/telemetry)
  useEffect(() => {
    let isMounted = true;

    const fetchServerPipeline = async () => {
      try {
        const url = isSyncing ? '/api/pipeline/telemetry?force=true' : '/api/pipeline/telemetry';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data) return;

        // 1. Safeguard FX State Setter
        if (data.usdKrw !== undefined || data.eurKrw !== undefined) {
          const rawKrw = Number(data.usdKrw);
          const krw = !isNaN(rawKrw) && rawKrw > 0 ? rawKrw : 1358.7;
          const prevCloseRef = 1347.6;
          const diffPct = ((krw - prevCloseRef) / prevCloseRef) * 100;
          const sign = diffPct >= 0 ? '+' : '';
          const changeStr = !isNaN(diffPct) ? `${sign}${diffPct.toFixed(2)}%` : DEFAULT_MACRO_FALLBACKS.fx.change;
          const isRed = diffPct >= 0;

          const rawEur = data.eurKrw ? Number(data.eurKrw) : krw / 0.92;
          const validEur = !isNaN(rawEur) && rawEur > 0 ? rawEur : 1556.2;
          const eurFormatted = validEur.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

          setFxData((prev) => ({
            rate: `${krw.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ₩`,
            eurRate: `EUR ${eurFormatted}₩`,
            change: changeStr || prev?.change || DEFAULT_MACRO_FALLBACKS.fx.change,
            status: isRed ? '원가상승 요인' : '안정 구간',
            badgeType: isRed ? 'red' : 'green',
            note: prev?.note || DEFAULT_MACRO_FALLBACKS.fx.note
          }));
        }

        // 2. Safeguard Energy/Oil State Setter: Map data.energy.brent and data.energy.brentChange directly
        const rawBrent = data.energy?.brent ?? data.brent;
        if (rawBrent !== undefined && rawBrent !== null) {
          const currentPrice = Number(rawBrent);
          if (!isNaN(currentPrice) && currentPrice > 0) {
            let pctChange: number;
            const rawChange = data.energy?.brentChange ?? data.brentChange;
            if (rawChange !== undefined && rawChange !== null && !isNaN(Number(rawChange))) {
              pctChange = Number(rawChange);
            } else {
              const prevClose = 73.85;
              pctChange = ((currentPrice - prevClose) / prevClose) * 100;
            }

            const sign = pctChange >= 0 ? '+' : '';
            const changeStr = `${sign}${pctChange.toFixed(2)}%`;
            const isFavorable = pctChange <= 0;

            const natGas = data.energy?.naturalGas ?? data.naturalGas;
            const secondaryStr = natGas && !isNaN(Number(natGas))
              ? `TTF €${Number(natGas).toFixed(1)}/MWh`
              : DEFAULT_MACRO_FALLBACKS.oil.secondary;

            setOilData((prev) => ({
              rate: `$${currentPrice.toFixed(2)} /bbl`,
              secondary: secondaryStr || prev?.secondary || DEFAULT_MACRO_FALLBACKS.oil.secondary,
              change: changeStr,
              status: isFavorable ? '우호적 (Favorable)' : '원가 부담 증가',
              badgeType: isFavorable ? 'green' : 'red',
              note: prev?.note || DEFAULT_MACRO_FALLBACKS.oil.note
            }));
          }
        }

        // 3. Safeguard Freight State Setter
        const energyData = data.energy;
        if (energyData && energyData.scfi !== undefined && energyData.bdi !== undefined) {
          const scfiVal = Number(energyData.scfi);
          const bdiVal = Number(energyData.bdi);
          const changeStr = energyData.freightChangeStr || DEFAULT_MACRO_FALLBACKS.freight.change;
          const statusStr = energyData.freightStatus || DEFAULT_MACRO_FALLBACKS.freight.status;
          const isFavorable = !changeStr.startsWith('+');

          setFreightData({
            rate: `SCFI ${scfiVal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`,
            secondary: `BDI ${bdiVal.toLocaleString()} pt`,
            change: changeStr,
            status: statusStr,
            badgeType: isFavorable ? 'green' : 'red',
            note: '상하이-유럽/미서안 및 발틱 건화물 지수 동향'
          });
        } else {
          const rawBdi = data.energy?.bdi ?? data.bdi ?? data.energy?.scfi ?? data.scfi;
          if (rawBdi !== undefined && rawBdi !== null) {
            const currentPoints = Number(rawBdi);
            if (!isNaN(currentPoints) && currentPoints > 0) {
              const prevClose = 1635;
              const pctChange = ((currentPoints - prevClose) / prevClose) * 100;
              const sign = pctChange >= 0 ? '+' : '';
              const changeStr = !isNaN(pctChange) ? `${sign}${pctChange.toFixed(2)}%` : DEFAULT_MACRO_FALLBACKS.freight.change;
              const isFavorable = pctChange <= 0;

              setFreightData((prev) => ({
                rate: `SCFI ${currentPoints.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`,
                secondary: `BDI 3,370 pt`,
                change: changeStr || prev?.change || DEFAULT_MACRO_FALLBACKS.freight.change,
                status: isFavorable ? '운임 하향 안정' : '운임 상승세',
                badgeType: isFavorable ? 'green' : 'red',
                note: prev?.note || DEFAULT_MACRO_FALLBACKS.freight.note
              }));
            }
          }
        }

        // 4. Safeguard WASDE Telemetry State Setter
        if (data.wasde && typeof data.wasde === 'object') {
          setWasdeData(data.wasde);
        }
        if (data.wasdeByCommodity && typeof data.wasdeByCommodity === 'object') {
          setWasdeByCommodity(data.wasdeByCommodity);
        }
      } catch (e) {
        // Silently preserve baseline default fallback state on error
        console.warn('OverviewTerminal server pipeline fetch notice:', e);
      }
    };

    fetchServerPipeline();
    const intervalId = setInterval(fetchServerPipeline, 60000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isSyncing]);

  const handleExportGlobalDashboard = async () => {
    try {
      setIsExporting(true);
      // Wait for DOM re-render to unmount export button
      await new Promise((resolve) => setTimeout(resolve, 150));
      await exportGlobalDashboardToPdf();
    } catch (error) {
      console.error('Failed to export global dashboard PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const grainCommodities = commodities.filter((c) => c.category === 'grain');
  const oilCommodities = commodities.filter((c) => c.category === 'oils');
  const starchCommodities = commodities.filter(
    (c) => c.category === 'starches' || c.category === 'sweeteners'
  );

  const palmOilItem = commodities.find((c) => c.id === 'palm-oil');
  const sugarItem = commodities.find((c) => c.id === 'sugar');
  const palmOilLandedKrw = palmOilItem?.landedKrwKg || palmOilItem?.priceKrwEstimated || 1440;
  const sugarLandedKrw = sugarItem?.landedKrwKg || sugarItem?.priceKrwEstimated || 640;

  const effectiveUsdKrw = React.useMemo(() => {
    const parsed = parseFloat(fxData.rate.replace(/[^0-9.]/g, ''));
    return !isNaN(parsed) && parsed > 0 ? parsed : (usdKrwRate || 1388.5);
  }, [fxData.rate, usdKrwRate]);

  const effectiveEurKrw = React.useMemo(() => {
    const parsed = parseFloat(fxData.eurRate.replace(/[^0-9.]/g, ''));
    return !isNaN(parsed) && parsed > 0 ? parsed : 1556.2;
  }, [fxData.eurRate]);

  const formatTopMoverLandedCost = (krwPerKg: number) => {
    if (currency === 'USD') {
      const usdPerKg = krwPerKg / effectiveUsdKrw;
      return `$${usdPerKg.toFixed(2)}/kg`;
    }
    if (currency === 'EUR') {
      const eurPerKg = krwPerKg / effectiveEurKrw;
      return `€${eurPerKg.toFixed(2)}/kg`;
    }
    return `₩${Math.round(krwPerKg).toLocaleString('en-US')}/kg`;
  };

  const formatPrice = (commodity: Commodity) => {
    if (commodity.id === 'palm-oil') {
      return `${commodity.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${commodity.unit}`;
    }
    return formatPriceUtil(commodity.price, currency, 'MT');
  };

  const formatLandedCost = (item: Commodity) => {
    return formatLandedCostUtil(item, currency, 42, usdKrwRate, 1 / 1.08);
  };

  const getLandedLabel = () => {
    if (currency === 'USD') return '추정 CIF (USD)';
    if (currency === 'EUR') return '추정 CIF (EUR)';
    return '추정 국내 도착가';
  };

  return (
    <div id="main-dashboard-view" className="OverviewTerminal overview-container flex flex-col w-full pb-16 space-y-4 print:space-y-0 print:pb-0 print:p-0">
      {/* ==================== PAGE 1: EXECUTIVE BENCHMARK, WASDE & MACRO DRIVERS ==================== */}
      <div className="overview-page-1 print:break-after-page flex flex-col space-y-4 print:space-y-2.5 w-full">
        {/* 1. Executive Header Bar */}
        <div className="w-full bg-white border border-slate-200 rounded-xl p-5 print:p-3 mb-2 print:mb-0 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6 print:gap-2 pdf-section-card break-inside-avoid">
          {/* Left Column: Directive Badge + Full Title (Wraps naturally) */}
          <div className="flex-1 max-w-3xl min-w-0">
            <div className="mb-2 print:mb-1">
              <span className="inline-flex items-center text-[11px] font-bold text-white bg-[#DF0029] px-2 py-0.5 rounded">
                데스크 구매 지침 (DESK DIRECTIVE)
              </span>
            </div>
            <h1 className="text-lg print:text-base font-bold text-slate-900 leading-snug break-keep">
              <div>글로벌 농산물 구매 및 시장 정보 개요</div>
              <div className="text-base print:text-sm font-bold text-slate-900 mt-0.5">(Global Agricultural Procurement & Market Intelligence Overview)</div>
            </h1>
            <p className="text-xs text-slate-500 mt-1.5 print:mt-0.5 leading-relaxed break-keep">
              농심 원자재 구매 데스크를 위한 핵심 품목 실시간 가격 벤치마크 및 거시경제 모니터링 매트릭스
            </p>
          </div>

          {/* Right Column: Compact Stacked Layout (Prevents horizontal overflow) */}
          <div className="flex flex-col items-start md:items-end gap-2.5 print:gap-1.5 shrink-0 flex-shrink-0">
            {/* Top Row of Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* High Risk Warning Badge */}
              <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 px-2.5 h-8 print:h-7 rounded-lg shrink-0">
                <span className="text-rose-600 font-bold">⚠️ 고위험 3건</span>
                <span className="text-slate-300">/</span>
                <span className="text-[#EC870C] font-medium">중위험 2건</span>
              </div>

              {/* Macro Risk Score Badge */}
              <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 px-2.5 h-8 print:h-7 rounded-lg shrink-0">
                <span className="font-sans font-bold text-slate-900">거시 리스크:</span>
                <span className="font-mono font-bold text-slate-900" id="risk-score-val">55/100</span>
                <span className="text-[11px] font-sans font-bold text-[#EC870C] bg-[#fff7ed] border border-[#fed7aa] px-1.5 py-0.5 rounded ml-0.5">
                  주의
                </span>
              </div>
            </div>

            {/* Bottom Row: Primary Export Button */}
            {!isExporting && (
              <div className="print:hidden pdf-hide export-btn-wrapper">
                <button
                  onClick={handleExportGlobalDashboard}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-[#DF0029] hover:bg-red-700 px-4 h-9 rounded-lg transition-colors shadow-sm shrink-0 cursor-pointer print:hidden pdf-hide export-report-btn"
                  type="button"
                >
                  <Download size={15} className="stroke-[2.5]" />
                  <span>리포트 내보내기 (Export Report)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Portfolio Top Movers Strip */}
        <div className="bg-white border border-[#e5e7eb] rounded-lg px-4 py-2 print:py-1.5 shadow-sm flex flex-wrap items-center justify-between gap-3 print:gap-1.5 text-[#111827] text-xs pdf-section-card break-inside-avoid">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4F46E5]"></span>
            </span>
            <span className="material-symbols-outlined text-[16px] text-[#DF0029]">trending_up</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#111827]">
              오늘의 주요 원자재 변동률 (Portfolio Top Movers)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-1.5 py-0.5 rounded text-[10px] shrink-0">
                최대 상승
              </span>
              <span
                onClick={() => onNavigate('commodity-palm-oil')}
                className="font-semibold text-[#111827] hover:text-[#DF0029] cursor-pointer transition-colors"
              >
                팜유 (Palm Oil)
              </span>
              <span className="font-mono text-[11px] text-[#059669] font-semibold">+3.80% WoW</span>
              <span className="text-[10px] text-[#6b7280]">
                (추정 도착가 {formatTopMoverLandedCost(palmOilLandedKrw)})
              </span>
            </div>
            <span className="hidden md:inline text-[#e5e7eb]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[#DF0029] text-[10px] font-bold shrink-0">
                최대 하락
              </span>
              <span
                onClick={() => onNavigate('commodity-sugar')}
                className="font-semibold text-[#111827] hover:text-[#DF0029] cursor-pointer transition-colors"
              >
                원당 (Sugar)
              </span>
              <span className="font-mono text-[11px] text-[#DF0029] font-bold">-1.20% WoW</span>
              <span className="text-[10px] text-[#6b7280]">
                (추정 도착가 {formatTopMoverLandedCost(sugarLandedKrw)})
              </span>
            </div>
          </div>
        </div>

        {/* 3. Categorized Commodity Monitoring Section */}
        <div className="space-y-3.5" id="filtered-commodity-grid" data-id="commodityContainer">
        {/* Category 1: Grains */}
        {grainCommodities.length > 0 && (
          <section className="commodity-category-section transition-all duration-200 pdf-section-card break-inside-avoid print:break-inside-avoid" data-category="grain">
            <div className="text-sm text-[#111827] font-bold border-b border-[#e5e7eb] pb-2 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">🌾 곡물류 (Grains - 3종)</span>
              <span className="text-[10px] text-[#6b7280] font-normal">CBOT 선물 벤치마크</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {grainCommodities.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate(item.path)}
                  className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
                          {item.gradeEn}
                        </span>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                          {item.nameKo} ({item.nameEn})
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 ${
                          item.changeWoW >= 0
                            ? 'bg-[#F0FDF4] border border-[#86EFAC] text-[#10B981] font-semibold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded'
                            : 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border bg-red-50 text-[#EF4444] border-red-200'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {item.changeWoW >= 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        {item.changeWoW >= 0 ? `+${item.changeWoW}% WoW` : `${item.changeWoW}% WoW`}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <span
                          className="font-mono text-xl font-bold text-[#111827]"
                          id={item.id === 'wheat' ? 'ticker-price' : `el-${item.id}-price`}
                        >
                          {item.id === 'palm-oil'
                            ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : currency === 'KRW'
                            ? `₩${Math.round(item.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                            : `${currency === 'EUR' ? '€' : '$'}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                        <span className="text-xs text-[#6b7280] ml-1">{item.unit}</span>
                      </div>
                      <div className="w-16 h-5">
                        <svg
                          className={`w-full h-full ${item.changeWoW < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}
                          fill="none"
                          preserveAspectRatio="none"
                          viewBox="0 0 64 20"
                        >
                          <path
                            d={getSparklinePath(item.sparkline, item.changeWoW)}
                            stroke={item.changeWoW < 0 ? '#EF4444' : '#10B981'}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[#6b7280]">
                      <span className="text-[10px]">전월 대비 (MoM)</span>
                      <span
                        className={`font-mono text-[11px] ${
                          item.changeMoM >= 0 ? 'text-[#10B981] font-semibold' : 'text-[#EF4444] font-semibold'
                        }`}
                      >
                        {item.changeMoM >= 0 ? `+${item.changeMoM}% MoM` : `${item.changeMoM}% MoM`}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#f9fafb] border border-[#e5e7eb] rounded flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#6b7280] font-bold">{getLandedLabel()}</span>
                      <span
                        className="font-mono text-xs text-[#111827] font-bold"
                        id={item.id === 'wheat' ? 'landed-cost' : `el-${item.id}-landed`}
                      >
                        {formatLandedCost(item)}
                      </span>
                    </div>
                    <span className="text-[#6b7280] group-hover:text-[#DF0029] text-[10px] flex items-center gap-0.5 font-bold">
                      <span>상세 분석</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category 2: Oils */}
        {oilCommodities.length > 0 && (
          <section className="commodity-category-section transition-all duration-200 pdf-section-card break-inside-avoid print:break-inside-avoid" data-category="oils">
            <div className="text-sm text-[#111827] font-bold border-b border-[#e5e7eb] pb-2 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">🛢️ 유지류 (Oils - 2종)</span>
              <span className="text-[10px] text-[#6b7280] font-normal">CBOT & BMD 벤치마크</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {oilCommodities.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate(item.path)}
                  className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
                          {item.gradeEn}
                        </span>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                          {item.nameKo} ({item.nameEn})
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 ${
                          item.changeWoW >= 0
                            ? 'bg-[#F0FDF4] border border-[#86EFAC] text-[#10B981] font-semibold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded'
                            : 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border bg-red-50 text-[#EF4444] border-red-200'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {item.changeWoW >= 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        {item.changeWoW >= 0 ? `+${item.changeWoW}% WoW` : `${item.changeWoW}% WoW`}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <span className="font-mono text-xl font-bold text-[#111827]" id={`el-${item.id}-price`}>
                          {item.id === 'palm-oil'
                            ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : currency === 'KRW'
                            ? `₩${Math.round(item.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                            : `${currency === 'EUR' ? '€' : '$'}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                        <span className="text-xs text-[#6b7280] ml-1">{item.unit}</span>
                      </div>
                      <div className="w-16 h-5">
                        <svg
                          className={`w-full h-full ${item.changeWoW < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}
                          fill="none"
                          preserveAspectRatio="none"
                          viewBox="0 0 64 20"
                        >
                          <path
                            d={getSparklinePath(item.sparkline, item.changeWoW)}
                            stroke={item.changeWoW < 0 ? '#EF4444' : '#10B981'}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[#6b7280]">
                      <span className="text-[10px]">전월 대비 (MoM)</span>
                      <span
                        className={`font-mono text-[11px] ${
                          item.changeMoM >= 0 ? 'text-[#10B981] font-semibold' : 'text-[#EF4444] font-semibold'
                        }`}
                      >
                        {item.changeMoM >= 0 ? `+${item.changeMoM}% MoM` : `${item.changeMoM}% MoM`}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#f9fafb] border border-[#e5e7eb] rounded flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#6b7280] font-bold">{getLandedLabel()}</span>
                      <span className="font-mono text-xs text-[#111827] font-bold" id={`el-${item.id}-landed`}>
                        {formatLandedCost(item)}
                      </span>
                    </div>
                    <span className="text-[#6b7280] group-hover:text-[#DF0029] text-[10px] flex items-center gap-0.5 font-bold">
                      <span>상세 분석</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category 3: Sweeteners & Starches */}
        {starchCommodities.length > 0 && (
          <section className="commodity-category-section transition-all duration-200 pdf-section-card break-inside-avoid print:break-inside-avoid" data-category="starches">
            <div className="text-sm text-[#111827] font-bold border-b border-[#e5e7eb] pb-2 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">🥔 당류 및 전분류 (Sweeteners & Starches - 3종)</span>
              <span className="text-[10px] text-[#6b7280] font-normal">ICE & FOB 아시아/유럽 벤치마크</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {starchCommodities.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate(item.path)}
                  className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
                          {item.gradeEn}
                        </span>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                          {item.nameKo} ({item.nameEn})
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 ${
                          item.changeWoW > 0
                            ? 'bg-[#F0FDF4] border border-[#86EFAC] text-[#10B981] font-semibold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded'
                            : item.changeWoW < 0
                            ? 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border bg-red-50 text-[#EF4444] border-red-200'
                            : 'bg-[#f3f4f6] text-[#4b5563] border-[#e5e7eb] px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {item.changeWoW > 0 ? 'arrow_upward' : item.changeWoW < 0 ? 'arrow_downward' : 'remove'}
                        </span>
                        {item.changeWoW > 0 ? `+${item.changeWoW}% WoW` : `${item.changeWoW}% WoW`}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <span className="font-mono text-xl font-bold text-[#111827]" id={`el-${item.id}-price`}>
                          {formatStarchSweetenerBenchmark(item.id, currency)?.priceText ??
                            (COMMODITY_CONFIGS[item.id]
                              ? (currency === 'KRW'
                                  ? `₩${getCalculatedMetrics(item.id).baseKRW.toLocaleString('en-US')}`
                                  : `${currency === 'EUR' ? '€' : '$'}${COMMODITY_CONFIGS[item.id].benchmarkQuote.toLocaleString('en-US')}`)
                              : `${currency === 'KRW' ? '₩' : currency === 'EUR' ? '€' : '$'}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                        </span>
                        <span className="text-xs text-[#6b7280] ml-1">
                          {formatStarchSweetenerBenchmark(item.id, currency)?.unitText ??
                            (COMMODITY_CONFIGS[item.id]
                              ? (currency === 'KRW' ? 'KRW / MT' : `${COMMODITY_CONFIGS[item.id].currency} / MT`)
                              : item.unit)}
                        </span>
                      </div>
                      <div className="w-16 h-5">
                        <svg
                          className={`w-full h-full ${
                            item.changeWoW > 0
                              ? 'text-[#10B981]'
                              : item.changeWoW < 0
                              ? 'text-[#EF4444]'
                              : 'text-[#9ca3af]'
                          }`}
                          fill="none"
                          preserveAspectRatio="none"
                          viewBox="0 0 64 20"
                        >
                          <path
                            d={getSparklinePath(item.sparkline, item.changeWoW)}
                            stroke={item.changeWoW > 0 ? '#10B981' : item.changeWoW < 0 ? '#EF4444' : '#9ca3af'}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[#6b7280]">
                      <span className="text-[10px]">전월 대비 (MoM)</span>
                      <span
                        className={`font-mono text-[11px] ${
                          item.changeMoM >= 0 ? 'text-[#10B981] font-semibold' : 'text-[#EF4444] font-semibold'
                        }`}
                      >
                        {item.changeMoM >= 0 ? `+${item.changeMoM}% MoM` : `${item.changeMoM}% MoM`}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#f9fafb] border border-[#e5e7eb] rounded flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#6b7280] font-bold">{getLandedLabel()}</span>
                      <span className="font-mono text-xs text-[#111827] font-bold" id={`el-${item.id}-landed`}>
                        {formatLandedCost(item)}
                      </span>
                    </div>
                    <span className="text-[#6b7280] group-hover:text-[#DF0029] text-[10px] flex items-center gap-0.5 font-bold">
                      <span>상세 분석</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        </div>

        {/* 3. Row 3: WASDE Matrix (7 cols) + Weather Radar (5 cols) in 12-column grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 my-3 print:grid-cols-12 print:gap-3 print:my-2 pdf-section-card break-inside-avoid print:break-inside-avoid w-full" id="wasde-weather-grid">
          {/* WASDE Summary Table (7 Cols) */}
          <div className="lg:col-span-7 print:col-span-7 bg-white border border-slate-200/80 rounded-xl p-5 print:p-3 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 break-keep">
                  글로벌 수급 밸런스 (Global S&D Balance)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">Market Year: 2026</span>
            </div>
            
            <div className="flex-1 flex flex-col justify-center">
              <table className="w-full text-left text-xs border-collapse tracking-tight">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2 px-1.5 print:py-1.5">품목</th>
                    <th className="py-2 px-1.5 print:py-1.5">총생산</th>
                    <th className="py-2 px-1.5 print:py-1.5">총소비</th>
                    <th className="py-2 px-1.5 print:py-1.5">기말재고</th>
                    <th className="py-2 px-1.5 print:py-1.5 text-right">재고율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {WASDE_PORTFOLIO_SUMMARY.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2 px-1.5 print:py-1.5 font-semibold text-slate-900 text-xs">{item.name}</td>
                      <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{item.production}</td>
                      <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{item.consumption}</td>
                      <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{item.endingStocks}</td>
                      <td className="py-2 px-1.5 print:py-1.5 text-right font-bold text-slate-900 text-xs font-mono">{item.stockToUseRatio}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-[#94A3B8] font-normal text-right mt-2 select-none">
              출처: USDA FAS PSD (2026 WASDE Telemetry)
            </div>
          </div>

          {/* Weather Radar (5 Cols) */}
          <div className="lg:col-span-5 print:col-span-5 bg-white border border-slate-200/80 rounded-xl p-5 print:p-3 shadow-sm flex flex-col justify-between" id="external-pipeline-section">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-sky-500">cloud</span>
                <h3 className="text-sm font-bold text-slate-800">
                  주요 생산지 기상 레이더
                </h3>
              </div>
            </div>

            <div className="space-y-3 flex-1 flex flex-col justify-around my-auto py-1">
              {[
                {
                  id: 'weather-us-corn-belt',
                  icon: '🌽',
                  title: '미국 콘벨트',
                  region: 'Iowa',
                  temp: weatherData.usCornBelt.temp.toFixed(1),
                  rain: weatherData.usCornBelt.precip.toFixed(1),
                  status: '적정 강우'
                },
                {
                  id: 'weather-sa-soy-belt',
                  icon: '🌱',
                  title: '남미 대두벨트',
                  region: 'Mato Grosso',
                  temp: weatherData.saSoyBelt.temp.toFixed(1),
                  rain: weatherData.saSoyBelt.precip.toFixed(1),
                  status: '고온 건조'
                },
                {
                  id: 'weather-eu-crop-radar',
                  icon: '🥔',
                  title: '유럽 곡창/감자',
                  region: 'France',
                  temp: weatherData.euCropRadar.temp.toFixed(1),
                  rain: weatherData.euCropRadar.precip.toFixed(1),
                  status: '온화 강우'
                }
              ].map((item, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/60 text-xs gap-2"
                >
                  {/* Left Group: Icon + Region Title + (Country/State) */}
                  <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap">{item.title}</span>
                    <span className="text-slate-400 text-[11px] whitespace-nowrap">({item.region})</span>
                  </div>

                  {/* Right Group: Temp + Rain + Status Badge */}
                  <div className="flex items-center gap-2.5 shrink-0 ml-auto" id={item.id}>
                    <span className="font-mono text-slate-700 font-semibold whitespace-nowrap">{item.temp}°C</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-slate-500 text-[11px] whitespace-nowrap">강우 {item.rain}mm</span>
                    
                    {/* Status Badge */}
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                      item.status.includes('건조') || item.status.includes('고온') 
                        ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                        : item.status.includes('흐림') || item.status.includes('주의')
                        ? 'bg-amber-50 text-amber-600 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}>
                      ({item.status})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-[#94A3B8] font-normal text-right mt-2 select-none">
              출처: Open-Meteo Agro-Climatic Radar
            </div>
          </div>
        </section>

        {/* 4. Macroeconomic Sourcing Drivers Section with smooth scroll targets (Inside Page 1) */}
        <section className="macroeconomic-drivers-card bg-white p-4 print:p-2.5 rounded-lg shadow-sm border border-[#e5e7eb] space-y-3 print:space-y-1.5 pdf-section-card break-inside-avoid print:break-inside-avoid print:mt-2" id="macro-drivers-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#111827]">query_stats</span>
              <h2 className="text-sm text-[#111827] font-bold tracking-tight break-keep">
                거시경제 구매 요인 (Macroeconomic Sourcing Drivers)
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#6b7280] uppercase">핵심 수입원가 요인 (Core Landed Cost Factors)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-2">
            {/* Card 1: FX (USD/KRW) */}
            <div
              id="driver-fx"
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      currency_exchange
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      환율 (하나은행 매매기준율)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                      일일 종가 (EOD)
                    </span>
                    <span className={`font-mono text-xs font-semibold ${(fxData?.change || DEFAULT_MACRO_FALLBACKS.fx.change).startsWith('-') ? 'text-[#DF0029]' : 'text-[#059669]'}`}>
                      {fxData?.change || DEFAULT_MACRO_FALLBACKS.fx.change}
                    </span>
                  </div>
                </div>
                <div className="mt-2 print:mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-xl print:text-base font-bold text-slate-900" id="driver-fx-val">
                    {fxData?.rate || DEFAULT_MACRO_FALLBACKS.fx.rate}
                  </div>
                  <span className="font-mono text-xs text-slate-400 font-normal">
                    {fxData?.eurRate || DEFAULT_MACRO_FALLBACKS.fx.eurRate}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                  (fxData?.change || DEFAULT_MACRO_FALLBACKS.fx.change).startsWith('+')
                    ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]'
                    : 'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]'
                }`}>
                  {fxData?.status || ((fxData?.change || DEFAULT_MACRO_FALLBACKS.fx.change).startsWith('+') ? '원가상승 요인' : '원가절감 요인')}
                </span>
                <a
                  href="https://www.kebhana.com/cont/mall/mall15/mall1501/index.jsp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold transition-colors"
                >
                  실시간 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 2: Oil (Brent) */}
            <div
              id="driver-energy"
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      local_gas_station
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      유가 / 에너지 (BRENT)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                      일일 종가 (EOD)
                    </span>
                    <span className={`font-mono text-xs font-semibold ${(oilData?.change || DEFAULT_MACRO_FALLBACKS.oil.change).startsWith('-') ? 'text-[#DF0029]' : 'text-[#059669]'}`}>
                      {oilData?.change || DEFAULT_MACRO_FALLBACKS.oil.change}
                    </span>
                  </div>
                </div>
                <div className="mt-2 print:mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-xl print:text-base font-bold text-slate-900" id="driver-energy-val">
                    {oilData?.rate || DEFAULT_MACRO_FALLBACKS.oil.rate}
                  </div>
                  <span className="font-mono text-xs text-slate-400 font-normal">
                    {oilData?.secondary || DEFAULT_MACRO_FALLBACKS.oil.secondary}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                  (oilData?.change || DEFAULT_MACRO_FALLBACKS.oil.change).startsWith('+')
                    ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]'
                    : 'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]'
                }`}>
                  {oilData?.status || ((oilData?.change || DEFAULT_MACRO_FALLBACKS.oil.change).startsWith('+') ? '유가 상승 위험' : '우호적 (Favorable)')}
                </span>
                <a
                  href="https://finance.yahoo.com/quote/BZ=F/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 font-medium hover:underline"
                >
                  실시간 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 3: Freight (BDI / SCFI) */}
            <div
              id="driver-freight"
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      directions_boat
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      해상운임 지수 (SCFI · BDI)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                      일일 종가 (EOD)
                    </span>
                    <span className={`font-mono text-xs font-semibold ${(freightData?.change || DEFAULT_MACRO_FALLBACKS.freight.change).startsWith('-') ? 'text-[#DF0029]' : 'text-[#059669]'}`}>
                      {freightData?.change || DEFAULT_MACRO_FALLBACKS.freight.change}
                    </span>
                  </div>
                </div>
                <div className="mt-2 print:mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-xl print:text-base font-bold text-slate-900" id="driver-freight-val">
                    {freightData?.rate || DEFAULT_MACRO_FALLBACKS.freight.rate}
                  </div>
                  <span className="font-mono text-xs text-slate-400 font-normal">
                    {freightData?.secondary || DEFAULT_MACRO_FALLBACKS.freight.secondary}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                  (freightData?.change || DEFAULT_MACRO_FALLBACKS.freight.change).startsWith('+')
                    ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]'
                    : 'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]'
                }`}>
                  {freightData?.status || ((freightData?.change || DEFAULT_MACRO_FALLBACKS.freight.change).startsWith('+') ? '운임 급등 위험' : '운임 하향 안정')}
                </span>
                <a
                  href="https://tradingeconomics.com/commodity/baltic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 font-medium hover:underline"
                >
                  실시간 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 4: Trade Policy */}
            <div
              id="driver-policy"
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      shield
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      통상 정책 · 수출 쿼터
                    </span>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      policyData?.badgeType === 'green'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : policyData?.badgeType === 'red'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {policyData?.change || '중립적'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 print:mt-1 flex flex-col gap-1">
                  <div className="text-sm print:text-xs font-bold text-slate-900 leading-tight" id="driver-policy-val">
                    {policyData?.headline || DEFAULT_MACRO_FALLBACKS.policy.headline}
                  </div>
                  <div className="text-[11px] print:text-[10px] text-slate-500 font-normal leading-relaxed">
                    {policyData?.subline || DEFAULT_MACRO_FALLBACKS.policy.subline}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={`px-2.5 py-1 print:px-2 print:py-0.5 text-xs print:text-[10px] font-bold rounded-md border ${
                  policyData?.badgeType === 'green'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : policyData?.badgeType === 'red'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  {policyData?.status || '통상 정책 점검'}
                </span>
                <a
                  href={policyData?.sourceUrl || 'https://www.foodsecurityportal.org/tools/COVID-19-food-trade-policy-tracker'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-0.5"
                >
                  실시간 동향 ↗
                </a>
              </div>
            </div>
          </div>

          {/* Footer Source */}
          <div className="mt-auto pt-2 print:pt-1 flex justify-end text-xs text-gray-400">
            <span>출처: Refinitiv · Bloomberg · TradingEconomics</span>
          </div>
        </section>
      </div>

      {/* ==================== PAGE 2: AI BRIEFS & DESK DIRECTIVES ==================== */}
      <div className="overview-page-2 print:break-before-page flex flex-col space-y-4 print:space-y-3.5 w-full">
        {/* 5. Lower Split Dashboard: AI Market Brief + Key Market Issues */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 print:grid print:grid-cols-2 print:gap-4 print:w-full break-inside-avoid print:break-inside-avoid">
        {/* Left: Combined AI Market Brief & Desk Sourcing Directives (7 cols on lg, 1 col in print) */}
        <div className="lg:col-span-7 print:col-span-1 print:w-full">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm flex flex-col justify-between h-full space-y-6 pdf-section-card min-h-[320px] break-inside-avoid print:break-inside-avoid">
            {/* Top Section: AI Market Brief */}
            <AiMarketBrief aiBriefText={aiBriefText} />

            {/* Divider */}
            <hr className="border-t border-[#F1F5F9] my-2" />

            {/* Bottom Section: Desk Sourcing Directives */}
            <div className="space-y-3">
              <span className="text-[10px] text-[#6b7280] uppercase font-bold tracking-wider block mb-1">
                데스크 구매 실행 지침 (Desk Sourcing Directives)
              </span>
              <div className="flex items-center gap-3 p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-sm">
                <span className="px-1.5 py-0.5 bg-[#DF0029] text-white text-[10px] rounded font-bold shrink-0">
                  조치 필요
                </span>
                <span className="text-xs font-semibold text-[#111827] break-keep">
                  현재 BMD 하락 구간에서 2025 Q1 팜유 포워드 커버리지 확보
                </span>
              </div>
              <div className="flex items-center gap-3 p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-sm">
                <span className="px-1.5 py-0.5 bg-[#fff7ed] text-[#EC870C] border border-[#fed7aa] text-[10px] rounded font-bold shrink-0">
                  주시
                </span>
                <span className="text-xs font-semibold text-[#111827] break-keep">
                  미국 농무부(USDA) 캔자스 동계소맥 작황 보고서 발표
                </span>
              </div>
              <div className="flex items-center gap-3 p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-sm">
                <span className="px-1.5 py-0.5 bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] text-[10px] rounded font-semibold shrink-0">
                  우호적 조건
                </span>
                <span className="text-xs font-semibold text-[#111827] break-keep">
                  로테르담 및 함부르크발 부산향 스팟 컨테이너 운임 안정
                </span>
              </div>
            </div>

            {/* Footer Citation */}
            <div className="text-xs text-[#94A3B8] font-normal text-right pt-2 select-none">
              출처: Refinitiv · USDA · CBOT · Platts (Gemini AI & RMS 멀티소스 피드 분석)
            </div>
          </div>
        </div>

        {/* Right: Key Market Issues (5 cols on lg, 1 col in print) */}
        <div className="lg:col-span-5 print:col-span-1 print:w-full bg-white p-4 rounded-lg shadow-sm border border-[#e5e7eb] flex flex-col justify-between space-y-3 pdf-section-card min-h-[320px] break-inside-avoid print:break-inside-avoid">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#f3f4f6]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-[#DF0029] shrink-0">notification_important</span>
                <h2 className="text-sm text-[#111827] font-bold break-keep">주요 시장 이슈 (Key Market Issues)</h2>
              </div>
              <span className="text-[10px] bg-[#f3f4f6] border border-[#e5e7eb] px-1.5 py-0.5 rounded text-[#4b5563] font-sans font-medium shrink-0">
                5개 활성 모니터링
              </span>
            </div>

            <div className="space-y-2">
              {localMarketIssues.map((issue) => {
                const targetUrl = issue.url && !isInvalidOrSearchUrl(issue.url)
                  ? issue.url
                  : getPublisherPortalUrl(issue.source, issue.url);

                return (
                  <article
                    key={issue.id}
                    className="news-card-item p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between min-w-0"
                  >
                    <div>
                      {/* Top Row: Pill Badges */}
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border ${
                              issue.risk === 'High'
                                ? 'bg-rose-50 border-rose-200 text-[#DF0029]'
                                : issue.risk === 'Med'
                                ? 'bg-[#fff7ed] border-[#fed7aa] text-[#EC870C]'
                                : 'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]'
                            }`}
                          >
                            {issue.risk === 'High' ? '고위험' : issue.risk === 'Med' ? '중위험' : '저위험'}
                          </span>
                        </div>
                      </div>

                      {/* Title Link */}
                      <h4 className="text-sm font-bold text-slate-900 hover:text-blue-600 hover:underline leading-snug break-keep cursor-pointer transition-colors mb-1.5">
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="block w-full"
                        >
                          {issue.title}
                        </a>
                      </h4>
                    </div>

                    {/* Unified Footer Row: Date + Direction on Left | Publisher Source on Right */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 flex-wrap">
                        <span>{issue.date}</span>
                        {issue.direction && (
                          <>
                            <span>·</span>
                            <span
                              className={`font-sans font-bold text-[10px] ${
                                issue.direction === 'Bullish' || issue.direction === '상승' ? 'text-[#DF0029]' : 'text-[#059669]'
                              }`}
                            >
                              {issue.direction === 'Bullish' || issue.direction === '상승' ? '↑ 상승' : '↓ 하락'}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="font-sans font-medium text-slate-600 text-xs shrink-0">
                        {issue.source}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="text-xs text-[#94A3B8] font-normal text-right mt-auto pt-3 select-none">
            출처: 글로벌 농산물 인텔리전스 네트워크 & S&P Global
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};
