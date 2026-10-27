import {commodityBenchmarkDisplay,commodityComparisonDisplay,commodityComparisonValue} from '../services/commodityQuoteSource';
import {SourceAttribution} from './SourceAttribution';
import {brentCostSignal} from '../utils/overviewMacroPresentation';
import {formalAiText} from '../utils/aiReportPresentation';
import {loadOverviewIntelligence} from '../utils/overviewIntelligence';
import {overviewIssueSummary} from '../utils/overviewIssueSummary';
import React, { useState, useEffect } from 'react';
import { getPublisherPortalUrl, isInvalidOrSearchUrl } from '../utils/portalUrls';
import { Download } from 'lucide-react';
import { Commodity, Currency, MacroDriver, MarketIssue } from '../types';
import { exportGlobalDashboardToPdf } from '../utils/exportDashboardPdf';
import {formatPercentChange} from '../utils/commodityPriceMetrics';
import AiMarketBrief from './AiMarketBrief';
import { formatDateStandard } from '../utils/formatters';
import { normalizeVerifiedOtherCommodityWasde } from '../lib/verifiedWorldWasde';
import { normalizeVerifiedSoybeanOilWasde } from './CommodityWasdeCard';
import type { WasdeRecord } from './WasdeTerminal';

const GREEN_BADGE_STYLE = 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-bold px-2.5 py-1 rounded-md';

const DEFAULT_MACRO_FALLBACKS = {
  fx: {
    rate: '—',
    eurRate: 'EUR —',
    change: '',
    status: '환율 확인 중',
    badgeType: 'amber' as const,
    note: '공식 환율 확인 중'
  },
  oil: {
    rate: '— /bbl',
    secondary: '',
    change: '',
    status: '전일 비교 미제공',
    badgeType: 'amber' as const,
    note: '최근 검증된 관측 기준'
  },
  freight: {
    rate: '—',
    secondary: 'SCFI Index',
    change: '',
    status: '관측 확인 필요',
    badgeType: 'amber' as const,
    note: '주간 발표'
  },
  policy: {
    headline: '검증된 정책 자료 확인 중',
    subline: '공식 발표 범위 기준',
    change: '—',
    status: '정책 확인 필요',
    badgeType: 'amber' as const,
    note: '검증된 발표 기준'
  }
};

// The commodity detail cards and Overview both use /api/usda/:id and exactly the
// same strict USDA world PSD normalization. There are NO baseline S&D numbers here.
const USDA_PORTFOLIO = [
  { id: 'wheat', name: '소맥 (Wheat)' },
  { id: 'corn', name: '옥수수 (Corn)' },
  { id: 'soybean', name: '대두 (Soybean)' },
  { id: 'soybean-oil', name: '대두유 (Soybean Oil)' },
  { id: 'palm-oil', name: '팜유 (Palm Oil)' },
  { id: 'sugar', name: '원당 (Sugar)' },
] as const;

type UsdaPortfolioId = typeof USDA_PORTFOLIO[number]['id'];
type UsdaPortfolioData = Partial<Record<UsdaPortfolioId, WasdeRecord>>;

const formatPortfolioMMT = (n?: number): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT` : '—';
const formatPortfolioStocksRatio = (n?: number): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? `${n.toFixed(1)}%` : '—';


const getSparklinePath = (series?: number[]): string => {
  const points = (series || []).filter(p => Number.isFinite(p) && p > 0);
  if (points.length < 2) return '';
  const min = Math.min(...points), max = Math.max(...points), range = max-min || 1;
  return points.map((v,i) => {
    const x = 2 + i * 60 / (points.length-1);
    const y = 3 + (1-(v-min)/range) * 14;
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
};

const getCardEyebrow = (item: { id: string; gradeEn: string }) => {
  switch (item.id) {
    case 'wheat':
      return 'CBOT: SRW BENCHMARK';
    case 'corn':
      return 'CBOT: CC1 BENCHMARK';
    case 'soybean':
      return 'CBOT: ZS BENCHMARK';
    case 'soybean-oil':
      return 'CBOT: ZL BENCHMARK';
    case 'palm-oil':
      return 'MDEX: FCPO BENCHMARK';
    case 'sugar':
      return 'ICE: SBC1 BENCHMARK';
    case 'potato-starch':
      return 'EUROSTAT: COMEXT UNIT VALUE';
    case 'tapioca-starch':
      return 'TTSA: TS BENCHMARK';
    default:
      return item.gradeEn;
  }
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
  usdKrwRate = 0,
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
    badgeType: 'red' | 'green' | 'amber' | 'orange';
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
    sourceName?: string;
    classificationLabel?: string;
    recordKindLabel?: string;
  }>(DEFAULT_MACRO_FALLBACKS.policy);

  const [portfolioUsda, setPortfolioUsda] = useState<UsdaPortfolioData>({});
  const [portfolioLoading, setPortfolioLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setPortfolioLoading(true);
    // Use the SAME endpoint and strict normalization as CommodityWasdeCard.
    // Never fall back to bundled WASDE_BASELINES or a different crop's numbers.
    const jobs = USDA_PORTFOLIO.map(async ({ id }) => {
      try {
        const response = await fetch(`/api/usda/${id}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`USDA ${id}: HTTP ${response.status}`);
        const json = await response.json();
        const payload = json.data || json;
        const data = json.success === true
          ? (id === 'soybean-oil'
              ? normalizeVerifiedSoybeanOilWasde(payload, json.dataStatus, json.verifiedAt || '')
              : normalizeVerifiedOtherCommodityWasde(payload, json.dataStatus, json.verifiedAt || '', id))
          : null;
        if (mounted && data) setPortfolioUsda(prev => ({ ...prev, [id]: data }));
        else if (mounted) setPortfolioUsda(prev => { const next = { ...prev }; delete next[id]; return next; });
      } catch (error) {
        if (mounted && !controller.signal.aborted) {
          console.warn(`[OverviewTerminal] Verified USDA ${id} unavailable`, error);
          setPortfolioUsda(prev => { const next = { ...prev }; delete next[id]; return next; });
        }
      }
    });
    void Promise.allSettled(jobs).then(() => { if (mounted) setPortfolioLoading(false); });
    return () => { mounted = false; controller.abort(); };
  }, [isSyncing]);

  const portfolioPeriod=(id:string,year:string)=>['wheat','corn','soybean','soybean-oil'].includes(id)&&/^20\d{2}$/.test(year)?`${year}/${String(Number(year)+1).slice(-2)}`:year;
  const portfolioYears = Array.from(new Set(Object.entries(portfolioUsda as UsdaPortfolioData).map(([id,row]) => portfolioPeriod(id,row?.marketYear || '')).filter(Boolean)));
  const portfolioMarketYear = portfolioYears.length === 1 && Object.keys(portfolioUsda).length === USDA_PORTFOLIO.length
    ? portfolioYears[0] : '품목별';

  const [selectedWasdeKey, setSelectedWasdeKey] = useState<string>('wheat');
  const blankWeather={temp:null as number|null,precip:null as number|null,status:'판정 보류',asOf:'',windowStart:'',crop:'',basis:'',coordinates:[] as number[]};
  const [weatherData,setWeatherData]=useState({usCornBelt:blankWeather,saSoyBelt:blankWeather,euCropRadar:blankWeather});
  useEffect(()=>{let active=true;const load=async()=>{try{const r=await fetch('/api/rms/free-publication',{cache:'no-store'});if(r.ok){const p=await r.json();if(active&&p.data?.weatherOverview)setWeatherData(p.data.weatherOverview);}}catch{}};void load();const timer=setInterval(()=>void load(),60000);return()=>{active=false;clearInterval(timer);};},[isSyncing]);

  useEffect(() => {
    let isMounted = true;
    const fetchLivePolicy = async () => {
      try {
        const url = '/api/scm/live-policy';
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setPolicyData({
              headline: data.title,
              subline: [data.publishedAt,data.summary].filter(Boolean).join(' · '),
              change: '',
              status: data.statusTag,
              badgeType: data.statusType === 'favorable' ? 'green' : data.statusType === 'warning' ? 'red' : 'amber',
              note: data.summary,
              sourceUrl: data.sourceUrl, sourceName:data.sourceName,classificationLabel:data.classificationLabel,recordKindLabel:data.recordKindLabel
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch live trade policy:', err);
      }
    };
    void fetchLivePolicy();
    const policyTimer=window.setInterval(()=>void fetchLivePolicy(),60000);
    return () => { isMounted = false;clearInterval(policyTimer); };
  }, [isSyncing]);

  const [intelligence,setIntelligence]=useState<Awaited<ReturnType<typeof loadOverviewIntelligence>>|null>(null);
  useEffect(()=>{
    let disposed=false,active=false;let controller:AbortController|null=null;
    const update=async()=>{if(disposed||active||document.visibilityState==='hidden')return;active=true;controller=new AbortController();try{const data=await loadOverviewIntelligence(fetch,controller.signal);if(!disposed)setIntelligence(data);}catch(error){if(!disposed)setIntelligence(null);}finally{active=false;}};
    void update();const timer=window.setInterval(()=>void update(),60000);
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{disposed=true;controller?.abort();clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[isSyncing]);
  const localMarketIssues=intelligence?.issues||[];

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
        const url = '/api/pipeline/telemetry';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data) return;

        const macro=data.overviewMacro;
        const percent=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'';
        const fx=macro?.fx;
        if(fx)setFxData({rate:'USD/KRW '+fx.usdKrw.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),eurRate:'EUR/KRW '+fx.eurKrw.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+(percent(fx.eurChange)?' · '+percent(fx.eurChange):''),change:percent(fx.usdChange),status:'기준환율',badgeType:'amber',note:fx.date+(fx.previousDate?' · 전일 '+fx.previousDate+' 대비':'')});
        const oil=macro?.energy;
        setOilData(oil?{rate:'$'+oil.brent.toFixed(2)+' /bbl',secondary:'',change:percent(oil.brentChange),...brentCostSignal(oil.brentChange),note:(oil.sessionDate||oil.observationDate.slice(0,10))+' · '+(oil.comparisonBasis==='provider-reported-quote-change'?'Yahoo 호가 표시 변동 · 공식 종가·정산가 대비 아님 · 변동액 $'+oil.quoteChangeAmount.toFixed(2)+' · 역산 기준가 $'+oil.quoteReferencePrice.toFixed(2)+' (기준 거래일·계약 월물 미확인)':'Yahoo 비교 기준 확인 필요')}:{...DEFAULT_MACRO_FALLBACKS.oil,badgeType:'amber'});
        const freight=macro?.freight;
        setFreightData(freight?{rate:'SCFI '+freight.scfi.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' pts',secondary:'',change:percent(freight.changePct),status:'주간 지표 확인',badgeType:'amber',note:freight.observationDate+' · 주간 발표'}:{rate:'—',secondary:'',change:'',status:macro?.scfiStatus==='permission-required'?'이용 권한 확인 필요':'발표 자료 미확보',badgeType:'amber',note:'주간 발표'});

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

  const validWoWCommodities = commodities.filter((c) => c.price > 0 && c.changeWoW != null);
  const sortedCommodities = [...validWoWCommodities].sort((a, b) => (b.changeWoW ?? 0) - (a.changeWoW ?? 0));
  const topGainer = sortedCommodities.length > 0 ? sortedCommodities[0] : null;
  const topLoser = sortedCommodities.length > 0 ? sortedCommodities[sortedCommodities.length - 1] : null;




  return (
    <div id="main-dashboard-view" className="OverviewTerminal overview-container flex flex-col w-full pb-16 space-y-4 print:space-y-0 print:pb-0 print:p-0">
      {/* ==================== PAGE 1: EXECUTIVE BENCHMARK & WASDE ==================== */}
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

          {/* Right Column: Primary Export Button */}
          <div className="flex flex-col items-start md:items-end gap-2.5 print:gap-1.5 shrink-0 flex-shrink-0">
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
        <div className="bg-white border border-[#e5e7eb] rounded-lg px-4 py-2.5 shadow-sm flex items-center justify-between gap-4 text-[#111827] text-xs whitespace-nowrap overflow-x-auto pdf-section-card break-inside-avoid">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#DF0029]"></span>
            </span>
            <span className="material-symbols-outlined text-[16px] text-[#DF0029]">trending_up</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#111827]">
              오늘의 주요 원자재 변동률 (Portfolio Top Movers)
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-nowrap">
            {/* Top Gainer */}
            {topGainer && topGainer.changeWoW != null && (
              <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-bold px-1.5 py-0.5 rounded text-[10px] leading-normal shrink-0 inline-flex items-center">
                  최대 상승
                </span>
                <span
                  onClick={() => onNavigate(topGainer.path)}
                  className="text-[12px] font-semibold text-[#1e293b] hover:text-[#DF0029] cursor-pointer transition-colors leading-normal inline-flex items-center"
                >
                  {topGainer.nameKo} ({topGainer.nameEn})
                </span>
                <span className="text-[12px] font-bold text-[#059669] leading-normal inline-flex items-center">
                  {formatPercentChange(topGainer.changeWoW, 'WoW')}
                </span>
              </div>
            )}

            {topGainer && topLoser && <span className="text-[#cbd5e1] text-[12px] select-none px-1">|</span>}

            {/* Top Loser */}
            {topLoser && topLoser.changeWoW != null && (
              <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="rms-status-negative bg-red-50 border border-red-200 text-[#DF0029] font-bold px-1.5 py-0.5 rounded text-[10px] leading-normal shrink-0 inline-flex items-center">
                  최대 하락
                </span>
                <span
                  onClick={() => onNavigate(topLoser.path)}
                  className="text-[12px] font-semibold text-[#1e293b] hover:text-[#DF0029] cursor-pointer transition-colors leading-normal inline-flex items-center"
                >
                  {topLoser.nameKo} ({topLoser.nameEn})
                </span>
                <span className="text-[12px] font-bold text-[#e11d48] leading-normal inline-flex items-center">
                  {formatPercentChange(topLoser.changeWoW, 'WoW')}
                </span>
              </div>
            )}
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
                          {getCardEyebrow(item)}
                        </span>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                          {item.nameKo} ({item.nameEn})
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 ${
                          item.changeWoW == null
                            ? 'bg-slate-50 border border-slate-200 text-slate-400 font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                            : item.changeWoW >= 0
                            ? 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                            : 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border rms-status-negative bg-red-50 text-[#DF0029] border-red-200/80'
                        }`}
                      >
                        {item.changeWoW != null && (
                          <span className="material-symbols-outlined text-[13px]">
                            {item.changeWoW >= 0 ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        )}
                        {commodityComparisonDisplay(item,'wow','WoW')}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <span
                          className="font-mono text-xl font-bold text-[#111827]"
                          id={item.id === 'wheat' ? 'ticker-price' : `el-${item.id}-price`}
                        >
                          {commodityBenchmarkDisplay(item,currency).value}
                        </span>
                        <span className="text-xs text-[#6b7280] ml-1">{commodityBenchmarkDisplay(item,currency).unit}</span>
                      </div>
                      <div className="w-16 h-5">
                        <svg
                          className={`w-full h-full ${item.changeWoW != null && item.changeWoW < 0 ? 'text-[#DF0029]' : 'text-[#059669]'}`}
                          fill="none"
                          preserveAspectRatio="none"
                          viewBox="0 0 64 20"
                        >
                          <path
                            d={getSparklinePath(item.sparkline)}
                            stroke={item.changeWoW != null && item.changeWoW < 0 ? '#DF0029' : '#059669'}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#f1f5f9] flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#6b7280]">전월 대비 (MoM)</span>
                        <span className={`font-mono text-[11px] font-bold ${
                          item.changeMoM == null
                            ? 'text-slate-400'
                            : item.changeMoM >= 0
                            ? 'text-[#059669]'
                            : 'text-[#DF0029]'
                        }`}>
                          {commodityComparisonDisplay(item,'mom')}
                        </span>
                      </div>
                      
                      <span className="text-xs font-bold text-[#374151] group-hover:text-[#DF0029] transition-colors flex items-center gap-0.5">
                        <span>상세 분석</span>
                        <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                      </span>
                    </div>
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
              {oilCommodities.map((item) => {
                const isSoybeanOil = item.id === 'soybean-oil';
                const isWoWPositive = item.changeWoW != null && item.changeWoW >= 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.path)}
                    className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                  >
                    <div 
                      style={
                        isSoybeanOil 
                          ? { flex: '1 1 0%', display: 'flex', flexDirection: 'column', justifyContent: 'center', margin: 'auto 0' } 
                          : { flex: '1 1 0%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }
                      }
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
                            {getCardEyebrow(item)}
                          </span>
                          <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                            {item.nameKo} ({item.nameEn})
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 ${
                            item.changeWoW == null
                              ? 'bg-slate-50 border border-slate-200 text-slate-400 font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                              : isWoWPositive
                              ? 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                              : 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border rms-status-negative bg-red-50 text-[#DF0029] border-red-200/80'
                          }`}
                        >
                          {item.changeWoW != null && (
                            <span className="material-symbols-outlined text-[13px]">
                              {isWoWPositive ? 'arrow_upward' : 'arrow_downward'}
                            </span>
                          )}
                          {commodityComparisonDisplay(item,'wow','WoW')}
                        </span>
                      </div>

                      <div className="mt-2 flex items-baseline justify-between">
                        <div>
                          <span className="font-mono text-xl font-bold text-[#111827]" id={`el-${item.id}-price`}>
                            {commodityBenchmarkDisplay(item,currency).value}
                          </span>
                          <span className="text-xs text-[#6b7280] ml-1">{commodityBenchmarkDisplay(item,currency).unit}</span>

                          {item.id === 'palm-oil' && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">
                              MDEX (FCPO) · ({item._originalPrice ? item._originalPrice.toLocaleString('en-US') : '—'} USD/MT)
                            </p>
                          )}
                        </div>
                        <div className="w-16 h-5">
                          <svg
                            className={`w-full h-full ${item.changeWoW != null && item.changeWoW < 0 ? 'text-[#DF0029]' : 'text-[#059669]'}`}
                            fill="none"
                            preserveAspectRatio="none"
                            viewBox="0 0 64 20"
                          >
                            <path
                              d={getSparklinePath(item.sparkline)}
                              stroke={item.changeWoW != null && item.changeWoW < 0 ? '#DF0029' : '#059669'}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-[#f1f5f9] flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#6b7280]">전월 대비 (MoM)</span>
                        <span className={`font-mono text-[11px] font-bold ${
                          item.changeMoM == null
                            ? 'text-slate-400'
                            : item.changeMoM >= 0
                            ? 'text-[#059669]'
                            : 'text-[#DF0029]'
                        }`}>
                          {commodityComparisonDisplay(item,'mom')}
                        </span>
                      </div>
                      
                      <span className="text-xs font-bold text-[#374151] group-hover:text-[#DF0029] transition-colors flex items-center gap-0.5">
                        <span>상세 분석</span>
                        <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                      </span>
                    </div>
                  </div>
                );
              })}
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
              {starchCommodities.map((item) => {
                const comparisonPeriod=item.id==='potato-starch'||item.id==='tapioca-starch'?'yoy':'wow';
                const comparison=commodityComparisonValue(item,comparisonPeriod);
                const isWoWPositive = comparison != null && comparison > 0;
                const isWoWNegative = comparison != null && comparison < 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.path)}
                    className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
                            {getCardEyebrow(item)}
                          </span>
                          <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5 break-keep">
                            {item.nameKo} ({item.nameEn})
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 ${
                            comparison == null
                              ? 'bg-slate-50 border border-slate-200 text-slate-400 font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                              : isWoWPositive
                              ? 'rms-status-positive bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-bold font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5 rounded shrink-0'
                              : isWoWNegative
                              ? 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border rms-status-negative bg-red-50 text-[#DF0029] border-red-200/80'
                              : 'bg-[#f3f4f6] text-[#4b5563] border-[#e5e7eb] px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border'
                          }`}
                        >
                          {comparison != null && (
                            <span className="material-symbols-outlined text-[13px]">
                              {isWoWPositive ? 'arrow_upward' : isWoWNegative ? 'arrow_downward' : 'remove'}
                            </span>
                          )}
                          {commodityComparisonDisplay(item,comparisonPeriod,comparisonPeriod==='yoy'?'YoY':'WoW')}
                        </span>
                      </div>

                      <div className="mt-2 flex items-baseline justify-between">
                        <div>
                          <span className="font-mono text-xl font-bold text-[#111827]" id={`el-${item.id}-price`}>
                            {commodityBenchmarkDisplay(item,currency).value}
                          </span>
                          <span className="text-xs text-[#6b7280] ml-1">
                            {commodityBenchmarkDisplay(item,currency).unit}
                          </span>
                        </div>
                        <div className="w-16 h-5">
                          <svg
                            className={`w-full h-full ${
                              item.changeWoW != null && item.changeWoW > 0
                                ? 'text-[#059669]'
                                : item.changeWoW != null && item.changeWoW < 0
                                ? 'text-[#DF0029]'
                                : 'text-[#9ca3af]'
                            }`}
                            fill="none"
                            preserveAspectRatio="none"
                            viewBox="0 0 64 20"
                          >
                            <path
                              d={getSparklinePath(item.sparkline)}
                              stroke={item.changeWoW != null && item.changeWoW > 0 ? '#059669' : item.changeWoW != null && item.changeWoW < 0 ? '#DF0029' : '#9ca3af'}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[#f1f5f9] flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#6b7280]">전월 대비 (MoM)</span>
                          <span className={`font-mono text-[11px] font-bold ${
                            item.changeMoM == null
                              ? 'text-slate-400'
                              : item.changeMoM >= 0
                              ? 'text-[#059669]'
                              : 'text-[#DF0029]'
                          }`}>
                            {commodityComparisonDisplay(item,'mom')}
                          </span>
                        </div>
                        
                        <span className="text-xs font-bold text-[#374151] group-hover:text-[#DF0029] transition-colors flex items-center gap-0.5">
                          <span>상세 분석</span>
                          <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        </div>

        {/* 3. Row 3: WASDE Matrix (7 cols) + Weather Radar (5 cols) in 12-column grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 items-stretch gap-5 my-3 print:grid-cols-12 print:gap-3 print:my-2 pdf-section-card break-inside-avoid print:break-inside-avoid w-full" id="wasde-weather-grid">
          {/* WASDE Summary Table (7 Cols) */}
          <div className="lg:col-span-7 print:col-span-7 bg-white border border-slate-200/80 rounded-xl p-5 print:p-3 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 break-keep">
                  글로벌 수급 밸런스 (Global S&D Balance)
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-normal text-right">Market Year: <span className="text-slate-800 font-semibold">{portfolioLoading && portfolioYears.length === 0 ? '확인 중' : portfolioMarketYear}</span></span>
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
                  {USDA_PORTFOLIO.map(item => {
                    const record = portfolioUsda[item.id];
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 px-1.5 print:py-1.5 font-semibold text-slate-900 text-xs">
                          {item.name}
                          <span className="block text-[9px] text-slate-500 font-normal">Market Year: <span className="text-slate-800 font-semibold">{portfolioPeriod(item.id,record?.marketYear || '—')}</span></span>
                        </td>
                        <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{formatPortfolioMMT(record?.productionMMT)}</td>
                        <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{formatPortfolioMMT(record?.consumptionMMT)}</td>
                        <td className="py-2 px-1.5 print:py-1.5 text-slate-700 text-xs font-mono">{formatPortfolioMMT(record?.endingStocksMMT)}</td>
                        <td className="py-2 px-1.5 print:py-1.5 text-right font-bold text-slate-900 text-xs font-mono">{formatPortfolioStocksRatio(record?.stocksToUseRatio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <SourceAttribution className="justify-end text-right mt-2" entries={[{label:'USDA FAS PSD',url:'https://apps.fas.usda.gov/psdonline/app/index.html'}]}/>
          </div>

          {/* Weather Radar (5 Cols) */}
          <div className="lg:col-span-5 print:col-span-5 bg-white border border-slate-200/80 rounded-xl p-5 print:p-3 shadow-sm flex flex-col w-full" id="external-pipeline-section">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-sky-500">cloud</span>
                <h3 className="text-sm font-bold text-slate-800">
                  주요 생산지 기상 레이더
                </h3>
              </div>
            </div>

            <div className="space-y-2 flex-1 flex flex-col justify-around my-auto py-0.5">
              {[
                {
                  id: 'weather-us-corn-belt',
                  icon: '🌽',
                  title: '미국 콘벨트',
                  region: 'Iowa',
                  temp: weatherData.usCornBelt.temp?.toFixed(1)??'—',
                  rain: weatherData.usCornBelt.precip?.toFixed(1)??'—',
                  status: weatherData.usCornBelt.status,
                  details: weatherData.usCornBelt
                },
                {
                  id: 'weather-sa-soy-belt',
                  icon: '🌱',
                  title: '남미 대두벨트',
                  region: 'Mato Grosso',
                  temp: weatherData.saSoyBelt.temp?.toFixed(1)??'—',
                  rain: weatherData.saSoyBelt.precip?.toFixed(1)??'—',
                  status: weatherData.saSoyBelt.status,
                  details: weatherData.saSoyBelt
                },
                {
                  id: 'weather-eu-crop-radar',
                  icon: '🌾',
                  title: '프랑스 소맥',
                  region: 'France',
                  temp: weatherData.euCropRadar.temp?.toFixed(1)??'—',
                  rain: weatherData.euCropRadar.precip?.toFixed(1)??'—',
                  status: weatherData.euCropRadar.status,
                  details: weatherData.euCropRadar
                }
              ].map((item, index) => (
                <div 
                  key={index} 
                  className="flex flex-wrap gap-y-1 items-center justify-between p-2 rounded-lg bg-slate-50/80 border border-slate-200/60 text-xs"
                >
                  {/* Left: Icon + Title + Sub-region */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base flex-shrink-0">{item.icon}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap">{item.title}</span>
                    <span className="text-slate-400 text-[10px] font-normal whitespace-nowrap">({item.region})</span>
                  </div>

                  {/* Right: Temperature + 7-day Rainfall */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2" id={item.id} aria-description={[item.details.crop,item.details.coordinates.join(', '),item.details.windowStart+' ~ '+item.details.asOf,item.details.basis].join(' · ')}>
                    <span className="font-mono font-semibold text-slate-700 text-xs">{item.temp}°C</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-slate-500 text-[11px]">{item.rain}mm</span>
                    

                  </div>
                </div>
              ))}
            </div>

            <SourceAttribution className="justify-end text-right mt-auto pt-2" entries={[{label:'Open-Meteo Agro-Climatic Radar'}]}/>
          </div>
        </section>
      </div>

      {/* ==================== PAGE 2: MACRO DRIVERS, AI BRIEF & MARKET ISSUES ==================== */}
      <div className="overview-page-2 print:break-before-page flex flex-col space-y-4 print:space-y-3.5 w-full">
        {/* 1. Macroeconomic Sourcing Drivers Section */}
        <section className="macroeconomic-drivers-card bg-white p-4 print:p-2.5 rounded-lg shadow-sm border border-[#e5e7eb] space-y-3 print:space-y-1.5 pdf-section-card break-inside-avoid print:break-inside-avoid" id="macro-drivers-section">
          <style>{`@layer components { #macro-drivers-section .macro-market-status { font-weight: 400 !important; border-radius: 4px !important; } #macro-drivers-section .macro-observation { font-weight: 500 !important; } }`}</style>
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
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:border-[#DF0029] hover:shadow-md transition-all cursor-pointer scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      currency_exchange
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      환율 (ECB 기준환율)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-mono text-xs font-semibold ${fxData.change ? (fxData.change.startsWith('-') ? 'text-[#DF0029]' : 'text-[#059669]') : 'text-slate-500'}`}>
                      {fxData?.change || DEFAULT_MACRO_FALLBACKS.fx.change}
                    </span>
                  </div>
                </div>
                <div className="mt-2 print:mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-xl print:text-base font-bold text-slate-900" id="driver-fx-val" aria-label={fxData.rate}>
                    {fxData.rate.startsWith('USD/KRW ')?fxData.rate.slice(8)+' ₩':fxData.rate}
                  </div>
                  <span className="font-mono text-xs text-slate-400 font-normal" aria-label={fxData.eurRate}>
                    {fxData.eurRate.startsWith('EUR/KRW ')?'EUR '+fxData.eurRate.slice(8).split(' · ')[0]+'₩':fxData.eurRate}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={`macro-market-status text-[11px] font-normal px-2 py-0.5 rounded border ${
                  fxData.change ? (fxData.change.startsWith('+') ? 'rms-status-negative bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]' : 'rms-status-positive bg-[#F0FDF4] border-[#86EFAC] text-[#059669]') : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  {fxData.change ? (fxData.change.startsWith('-') ? 'USD 하락' : 'USD 상승') : fxData.status}
                </span>
                <a
                  href="https://www.kebhana.com/cont/mall/mall15/mall1501/index.jsp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rms-source text-xs text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                >
                  하나은행 실시간 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 2: Oil (Brent) */}
            <div
              id="driver-energy"
              className="group min-h-[130px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:border-[#DF0029] hover:shadow-md transition-all cursor-pointer scroll-mt-24"
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
                    <span className={`font-mono text-xs font-semibold ${oilData.change ? (oilData.change.startsWith('-') ? 'text-[#DF0029]' : 'text-[#059669]') : 'text-slate-500'}`}>
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
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 min-h-[31.5px] print:min-h-[27.5px] border-t border-[#f1f5f9] flex items-center justify-end">
                <a
                  href="https://finance.yahoo.com/quote/BZ=F/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rms-source text-xs text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                >
                  실시간 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 3: Freight (BDI / SCFI) */}
            <div
              id="driver-freight"
              className="group min-h-[182px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:border-[#DF0029] hover:shadow-md transition-all cursor-pointer scroll-mt-24"
            >
              <div>
                <div className="flex items-center justify-between text-[#6b7280]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#4b5563] group-hover:text-[#DF0029] transition-colors shrink-0">
                      directions_boat
                    </span>
                    <span className="font-bold text-slate-800 text-sm print:text-xs group-hover:text-[#DF0029] transition-colors truncate">
                      해상운임 지수 (SCFI)
                    </span>
                  </div>

                </div>
                <div className="mt-2 print:mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-xl print:text-base font-bold text-slate-900" id="driver-freight-val">
                    {freightData?.rate || DEFAULT_MACRO_FALLBACKS.freight.rate}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 min-h-[31.5px] print:min-h-[27.5px] border-t border-[#f1f5f9] flex items-center justify-end">
                <a
                  href="https://www.tradlinx.com/ko/freight-index"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rms-source text-xs text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                >
                  트레드링스 시세 ↗
                </a>
              </div>
            </div>

            {/* Card 4: Trade Policy */}
            <div
              id="driver-policy"
              className="group min-h-[182px] print:min-h-0 p-4 print:p-2.5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm hover:border-[#DF0029] hover:shadow-md transition-all cursor-pointer scroll-mt-24"
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

                </div>
                <div className="mt-2 print:mt-1 flex flex-col gap-1">
                  <div className="text-sm print:text-xs font-bold text-slate-900 leading-tight" id="driver-policy-val">
                    {policyData.headline || DEFAULT_MACRO_FALLBACKS.policy.headline}
                  </div>
                  <div className="text-[11px] print:text-[10px] text-slate-500 font-normal leading-relaxed">
                    {policyData.note || DEFAULT_MACRO_FALLBACKS.policy.subline}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 print:mt-1.5 pt-2 print:pt-1 border-t border-[#f1f5f9] flex items-center justify-between">
                <span className={'macro-market-status text-[11px] font-normal px-2 py-0.5 rounded border '+(policyData.badgeType==='green'?'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]':policyData.badgeType==='red'?'bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]':'bg-[#fff7ed] border-[#fed7aa] text-[#EC870C]')}>
                  {policyData.status}
                </span>
                <a
                  href={policyData.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rms-source text-xs text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                >
                  {policyData.sourceName ? policyData.sourceName+' ↗' : '출처 미확인'}
                </a>
              </div>
            </div>
          </div>

          {/* Footer Source */}
          <div className="mt-auto pt-2 print:pt-1 flex justify-end text-xs text-gray-400">
            <SourceAttribution className="justify-end text-right" entries={['ECB/Frankfurter','Yahoo Finance','SSE',policyData.sourceName||'—'].map(label=>({label}))}/>
          </div>
        </section>

        {/* 2. AI Market Brief & Key Market Issues Split Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 my-4">
          {/* Left Column (7 cols): AI Market Brief & Desk Directives */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm flex flex-col">
            <AiMarketBrief aiBriefText={intelligence?.brief} />

            <div className="mt-2 border-t border-slate-100 pt-2 space-y-2.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                데스크 구매 실행 지침 (DESK SOURCING DIRECTIVES)
              </span>
              
              {(intelligence?.directives||[]).map(d=>(
                <div key={d.commodity} data-overview-directive={d.commodity} aria-description={d.reason+' · '+d.generatedAt.slice(0,10)} className="flex items-center gap-3 p-3 bg-white border border-slate-200/80 rounded-lg shadow-2xs">
                  <span className="px-2 py-0.5 bg-[#DF0029] border border-[#DF0029] text-white text-[11px] rounded font-bold shrink-0">{d.name}</span>
                  <span className="text-xs font-bold text-slate-800 break-keep">{formalAiText(d.recommendation)}</span>
                </div>
              ))}
            </div>

            <SourceAttribution className="pt-2 justify-end text-right" entries={[{label:'품목별 RMS AI'}]}/>
          </div>

          {/* Right Column (5 cols): Key Market Issues */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[20px] text-[#DF0029] shrink-0">notification_important</span>
                  <h2 className="text-sm font-bold text-slate-900 break-keep">주요 시장 이슈 (Key Market Issues)</h2>
                </div>
                <span className="text-[10px] bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded text-slate-600 font-sans font-medium shrink-0">
                  {localMarketIssues.length}개 활성 모니터링
                </span>
              </div>

              <div className="space-y-2.5">
                {localMarketIssues.map((issue) => (
                  <article
                    key={issue.id}
                    data-overview-issue={issue.url}
                    className="group p-3 bg-white border border-slate-200/80 rounded-lg hover:border-[#DF0029] hover:shadow-md transition-all flex flex-col justify-between space-y-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded border border-blue-100">{issue.category||'시장 동향'}</span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#DF0029] transition-colors leading-snug break-keep">
                      <a href={issue.url} target="_blank" rel="noopener noreferrer" className="group-hover:text-[#DF0029] transition-colors">
                        {issue.title}
                      </a>
                    </h4>

                    {issue.summary && (
                      <p data-overview-issue-summary className="text-xs text-slate-600 leading-relaxed break-keep">
                        {overviewIssueSummary(issue.summary)}
                      </p>
                    )}

                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-400">
                          {formatDateStandard(issue.publishedAt)}
                        </span>
                      </div>
                      {!isInvalidOrSearchUrl(issue.url) ? (
                        <a data-market-source className="rms-source font-sans hover:underline transition-colors" href={issue.url} target="_blank" rel="noopener noreferrer">{issue.source}{'\u00a0'}↗</a>
                      ) : (
                        <span data-market-source className="rms-source font-sans">{issue.source}</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <SourceAttribution className="pt-2 justify-end text-right" entries={[{label:'품목별 Market Intelligence'}]}/>
          </div>
        </section>
      </div>
    </div>
  );
};
