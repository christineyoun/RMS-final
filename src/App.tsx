import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header, getKSTTime } from './components/Header';
import { OverviewTerminal } from './components/OverviewTerminal';
import { CommodityDetail } from './components/CommodityDetail';
import { ExportReportModal } from './components/ExportReportModal';
import { COMMODITIES, MACRO_DRIVERS, MARKET_ISSUES } from './data/commoditiesData';
import { Commodity, LiveMarketUpdate, Currency } from './types';
import { geminiController } from './services/geminiController';
import { subscribeFxRates, getAllFxRates, fetchLiveFxRates, getDatedDisplayFx, FXRates } from './services/currencyService';
import { fetchCommodityQuotes, mapCommodityForDisplay } from './services/commodityQuoteSource';
import { exportGlobalDashboardToPdf } from './utils/exportDashboardPdf';

export default function App() {
  const [activeView, setActiveView] = useState<string>('main-dashboard');
  const [currency, setCurrency] = useState<Currency>('KRW');
  const [commodities, setCommodities] = useState<Commodity[]>(() => COMMODITIES.map(c => ({...c, price: 0, unit: 'USD / MT', changeWoW: null, changeMoM: null, sparkline: []})));
  const [macroDrivers, setMacroDrivers] = useState(MACRO_DRIVERS);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // RMS Step 16 — deterministic USDA Live Sync
  const [usdaRefreshRevision, setUsdaRefreshRevision] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>(getKSTTime());
  const [aiBriefText, setAiBriefText] = useState<string>('');
  const [modelVersion, setModelVersion] = useState<string>('gemini-flash-latest');
  const [fxRates, setFxRates] = useState<FXRates>(getAllFxRates());

  const [datedDisplayFx,setDatedDisplayFx]=useState(getDatedDisplayFx);
  useEffect(() => {
    const stop = subscribeFxRates(rates=>{setFxRates(rates);setDatedDisplayFx(getDatedDisplayFx());});
    void fetchLiveFxRates();
    return stop;
  }, []);

  // Intercept Ctrl+P or Cmd+P and trigger html2canvas PDF export
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        exportGlobalDashboardToPdf();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Handle URL hash routing on initial load and popstate
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        if (hash === 'main-dashboard') {
          setActiveView('main-dashboard');
        } else if (hash.startsWith('commodity-')) {
          setActiveView(hash);
        } else if (hash.startsWith('driver-') || hash === 'macro-drivers-section') {
          setActiveView('main-dashboard');
          setTimeout(() => scrollToAnchor(hash), 100);
        } else {
          // Check if hash matches commodity ID directly (e.g. #wheat -> commodity-wheat)
          const matched = commodities.find((c) => c.id === hash || c.path === hash);
          if (matched) {
            setActiveView(matched.path);
          }
        }
      }
    };

    handleHashChange();
    window.addEventListener('popstate', handleHashChange);
    return () => window.removeEventListener('popstate', handleHashChange);
  }, [commodities]);

  // Subscribe to Gemini Dynamic API Controller
  useEffect(() => {
    const unsubscribe = geminiController.subscribe((liveData: LiveMarketUpdate) => {
      setLastSyncTime(liveData.updatedAt);
      if (liveData.aiBriefSynthesis) {
        setAiBriefText(liveData.aiBriefSynthesis);
      }
      if (liveData.modelVersion) {
        setModelVersion(liveData.modelVersion);
      }

      // Commodity prices, changes and sparklines are owned solely by fetchCommodityQuotes().
      // The AI pipeline is not permitted to overwrite price cards.

      // Update macro drivers
      setMacroDrivers((prev) =>
        prev.map((d) => {
          if (d.id === 'fx' && liveData.usdKrw) {
            return {
              ...d,
              primaryValue: `${liveData.usdKrw.toLocaleString()} ₩`,
              secondaryValue: liveData.eurKrw ? `EUR ${liveData.eurKrw.toLocaleString()}₩` : '--'
            };
          }
          if (d.id === 'energy' && liveData.brent) {
            return {
              ...d,
              primaryValue: `$${liveData.brent.toFixed(2)} /bbl`
            };
          }
          if (d.id === 'freight' && liveData.scfi) {
            return {
              ...d,
              primaryValue: `${liveData.scfi.toLocaleString()} pts`
            };
          }
          return d;
        })
      );
    });

    return () => unsubscribe();
  }, []);

  const scrollToAnchor = (anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlightPulse');
      setTimeout(() => {
        el.classList.remove('highlightPulse');
      }, 2500);
    }
  };

  const handleNavigate = (view: string, hash?: string) => {
    let targetView = view;
    if (view !== 'main-dashboard' && !view.startsWith('commodity-')) {
      const match = commodities.find((c) => c.id === view || c.path === view || c.path === `commodity-${view}`);
      if (match) {
        targetView = match.path;
      }
    }

    setActiveView(targetView);
    window.location.hash = hash ? `${targetView}#${hash}` : targetView;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (hash) {
      setTimeout(() => {
        scrollToAnchor(hash);
      }, 150);
    }
  };

  // One canonical market snapshot for all eight detail views and Overview cards.
  // No synthetic fallbacks or recalculations in the Overview component.
  const syncAllCommodityMetrics = useCallback(async (force = false) => {
    const [quotes] = await Promise.all([fetchCommodityQuotes(force), fetchLiveFxRates(force)]);
    setCommodities(prev => prev.map(c => {
      const q = quotes[c.id as keyof typeof quotes];
      if (!q && c.id==='sugar') return c._sugarPriceSnapshot?{...c,_sugarPriceSnapshot:{...c._sugarPriceSnapshot,stale:true,lastError:'Price snapshot endpoint unavailable'}}:{...c,price:0,changeWoW:null,changeMoM:null,sparkline:[]};
      if (!q) return c.id==='soybean-oil' ? c._soybeanOilPriceSnapshot ? {...c,_soybeanOilPriceSnapshot:{...c._soybeanOilPriceSnapshot,stale:true,lastError:'Price snapshot endpoint unavailable'}} : {...c,price:0,changeWoW:null,changeMoM:null,sparkline:[]} : {...c,_canonicalQuoteStale:!!c._canonicalQuoteDate}; // keep the previous successful snapshot if the source temporarily fails
      return { ...c, price:q.priceUsdMt, unit:'USD / MT', changeWoW:q.changeWoW,
        changeMoM:q.changeMoM, sparkline:q.sparkline,
        ...(c.id==='tapioca-starch'?{changeYoY:q.changeYoY,_canonicalYoyUsdMt:q.changeYoYUsdMt,_canonicalYoyReferenceDate:q.yoyReferenceDate}:{}),
        ...(c.id==='potato-starch'?{_potatoExportQuote:q.potatoSnapshot}:c.id==='soybean'?{_soybeanPriceSnapshot:q.soybeanSnapshot}:c.id==='soybean-oil'?{_soybeanOilPriceSnapshot:q.soybeanOilSnapshot}:c.id==='sugar'?{_sugarPriceSnapshot:q.sugarSnapshot}:{}),
        ...(c.id==='wheat'?{_wheatPriceSnapshot:q.wheatSnapshot}:{}),
        _canonicalHistorySnapshot:q.historySnapshot,
        _canonicalQuoteDate:q.asOf,_canonicalQuoteStale:q.sourceStale, _canonicalQuoteSource:q.source,
        _canonicalWowUsdMt:q.changeWoWUsdMt, _canonicalMomUsdMt:q.changeMoMUsdMt };
    }));
  }, []);

  useEffect(() => {
    // Saved-only reads update the shared model on navigation, focus and publication checks.
    void syncAllCommodityMetrics();
    const reload=()=>{void syncAllCommodityMetrics();};
    const timer=window.setInterval(reload,60_000);
    window.addEventListener('focus',reload);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',reload);};
  }, [syncAllCommodityMetrics,activeView]);

  const handleRefreshGemini = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Preserve existing market-price/AI refreshes even if one source fails.
      const isPalmPage=commodities.find(c=>c.path===activeView)?.id==='palm-oil';
      const jobs: Promise<unknown>[] = isPalmPage ? [fetch('/api/rms/palm/free-refresh',{method:'POST'}).then(async r=>{if(!r.ok)throw Error('Free Palm refresh failed');return r.json();}),fetchLiveFxRates(true)] : [
        Promise.resolve().then(() => geminiController.fetchLiveMarketData(true)),
        Promise.resolve().then(() => syncAllCommodityMetrics(true)),
        Promise.resolve().then(() => fetchLiveFxRates(true))
      ];

      // Force the active USDA-backed commodity directly from Live Sync.
      // Avoid relying on a brief isSyncing React effect for network I/O.
      const activeUsdaId = commodities.find(c => c.path === activeView)?.id;
      if (activeUsdaId && ['wheat', 'corn', 'soybean', 'soybean-oil', 'palm-oil', 'sugar'].includes(activeUsdaId)) {
        jobs.push(fetch('/api/usda/' + activeUsdaId + '?force=true', { cache: 'no-store' }).then(async response => {
          if (!response.ok) throw new Error('USDA refresh HTTP ' + response.status);
          const payload = await response.json();
          if (!payload.success || !['live-verified', 'last-verified'].includes(payload.dataStatus))
            throw new Error('USDA returned no validated world data');
          if (payload.dataStatus === 'last-verified')
            console.warn('[RMS Live Sync] USDA not reachable; last verified data retained.');
          return payload;
        }));
      }
      const settled = await Promise.allSettled(jobs);
      settled.forEach((result, index) => {
        if (result.status === 'rejected') console.warn('[RMS Live Sync] Source ' + (index + 1) + ' failed:', result.reason);
      });
    } finally {
      // Refresh only the Global S&D card after forced USDA check completes.
      setUsdaRefreshRevision(previous => previous + 1);
      setLastSyncTime(getKSTTime());
      setIsSyncing(false);
    }
  };

  // Currency conversion is display-only and happens once in this shared parent.
  // An unavailable exchange rate shows an unavailable card price, never a hardcoded FX quote.
  const mappedCommodities = useMemo(() => commodities.map(c =>
    mapCommodityForDisplay(c,currency,datedDisplayFx)
  ), [commodities,currency,datedDisplayFx]);

  // Find currently selected commodity if in detail view
  const currentCommodity = mappedCommodities.find((c) => c.path === activeView);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#111827] flex font-sans antialiased selection:bg-[#DF0029] selection:text-white">
      {/* 1. Left Fixed Sidebar */}
      <Sidebar activeView={activeView} onNavigate={handleNavigate} />

      {/* 2. Top Fixed Header */}
      <Header
        commodities={mappedCommodities}
        currency={currency}
        onToggleCurrency={setCurrency}
        onNavigate={handleNavigate}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onRefreshGemini={handleRefreshGemini}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        modelVersion={modelVersion}
      />

      {/* 3. Main Content Area */}
      <main className="ml-64 mt-14 p-4 flex-1 min-h-[calc(100vh-56px)] overflow-x-hidden print:ml-0 print:mt-0 print:p-0 print:min-h-0 print:overflow-visible">
        <div className="max-w-[1680px] mx-auto print:max-w-full">
          {activeView === 'main-dashboard' || !currentCommodity ? (
            <OverviewTerminal
              commodities={mappedCommodities}
              macroDrivers={macroDrivers}
              marketIssues={MARKET_ISSUES}
              onNavigate={handleNavigate}
              currency={currency}
              onRefreshGemini={handleRefreshGemini}
              isSyncing={isSyncing}
              aiBriefText={aiBriefText}
              modelVersion={modelVersion}
              usdKrwRate={fxRates.USD_KRW || 0}
            />
          ) : currentCommodity.id!=='potato-starch' && currency !== 'USD' && (!datedDisplayFx) ? (
            <div className="p-6 bg-white rounded-xl border border-slate-200 text-slate-600">
              환율 데이터를 확인할 수 없어 임의의 환율로 표시하지 않습니다. 잠시 후 다시 확인하거나
              <button type="button" className="ml-2 underline font-semibold text-slate-800" onClick={() => setCurrency('USD')}>USD/MT로 보기</button>
            </div>
          ) : (
            <CommodityDetail
              key={currentCommodity.id}
              commodity={currentCommodity}
              usdaRefreshRevision={usdaRefreshRevision}
              onNavigateBack={() => handleNavigate('main-dashboard')}
              currency={currency}
              onOpenExportModal={() => setIsExportModalOpen(true)}
              onRefreshGemini={handleRefreshGemini}
              isSyncing={isSyncing}
              modelVersion={modelVersion}
            />
          )}
        </div>
      </main>

      {/* Export Report Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        commodities={mappedCommodities}
      />
    </div>
  );
}
