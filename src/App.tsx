import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header, getKSTTime } from './components/Header';
import { OverviewTerminal } from './components/OverviewTerminal';
import { CommodityDetail } from './components/CommodityDetail';
import { ExportReportModal } from './components/ExportReportModal';
import { COMMODITIES, MACRO_DRIVERS, MARKET_ISSUES } from './data/commoditiesData';
import { Commodity, LiveMarketUpdate, Currency } from './types';
import { geminiController } from './services/geminiController';
import { getLiveExchangeRate, subscribeFxRates, getAllFxRates, FXRates } from './services/currencyService';
import { centsPerLbToUsdPerMt, cornCentsPerBuToUsdPerMt, grainCentsPerBuToUsdPerMt } from './utils/commodityConversions';
import { exportGlobalDashboardToPdf } from './utils/exportDashboardPdf';
import { calculateDynamicMetrics } from './utils/landedCostCalculator';
import tapiocaCacheFallback from './data/cache_tapioca.json';
import palmOilCacheFallback from './data/cache_palmoil.json';

export default function App() {
  const [activeView, setActiveView] = useState<string>('main-dashboard');
  const [currency, setCurrency] = useState<Currency>('KRW');
  const [commodities, setCommodities] = useState<Commodity[]>(COMMODITIES);
  const [macroDrivers, setMacroDrivers] = useState(MACRO_DRIVERS);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // RMS Step 16 — deterministic USDA Live Sync
  const [usdaRefreshRevision, setUsdaRefreshRevision] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>(getKSTTime());
  const [aiBriefText, setAiBriefText] = useState<string>('');
  const [modelVersion, setModelVersion] = useState<string>('gemini-flash-latest');
  const [fxRates, setFxRates] = useState<FXRates>(getAllFxRates());

  useEffect(() => {
    return subscribeFxRates(setFxRates);
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

      // Update commodity prices reactively
      setCommodities((prev) =>
        prev.map((c) => {
          if (c.id === 'wheat' && liveData.wheatMetrics) {
            return {
              ...c,
              price: liveData.wheatMetrics.srw.latestPriceMt,
              changeWoW: liveData.wheatMetrics.srw.wowChangePct, // -3.03% or live
              changeMoM: liveData.wheatMetrics.srw.momChangePct, // +10.06%
            };
          }

          let updatedPrice = c.price;
          let updatedChangeWoW = c.changeWoW;
          let updatedChangeMoM = c.changeMoM;

          if (c.id === 'wheat' && liveData.wheatPrice) {
            updatedPrice = liveData.wheatPrice;
            if (liveData.wheatMetrics?.srw) {
              updatedChangeWoW = liveData.wheatMetrics.srw.wowChangePct;
              updatedChangeMoM = liveData.wheatMetrics.srw.momChangePct;
            }
          } else if (c.id === 'corn' && liveData.cornPrice) {
            updatedPrice = liveData.cornPrice;
            if (liveData.cornWowChange !== undefined) updatedChangeWoW = liveData.cornWowChange;
            if (liveData.cornMomChange !== undefined) updatedChangeMoM = liveData.cornMomChange;
          } else if (c.id === 'soybean' && liveData.soybeanPrice) {
            updatedPrice = liveData.soybeanPrice;
            if (liveData.soybeanWowChange !== undefined) updatedChangeWoW = liveData.soybeanWowChange;
            if (liveData.soybeanMomChange !== undefined) updatedChangeMoM = liveData.soybeanMomChange;
          } else if (c.id === 'soybean-oil' && liveData.soybeanOilPrice) {
            updatedPrice = liveData.soybeanOilPrice;
            if (liveData.soybeanOilWowChange !== undefined) updatedChangeWoW = liveData.soybeanOilWowChange;
            if (liveData.soybeanOilMomChange !== undefined) updatedChangeMoM = liveData.soybeanOilMomChange;
          } else if (c.id === 'palm-oil' && liveData.palmOilPrice) {
            updatedPrice = liveData.palmOilPrice;
            if (liveData.palmOilWowChange !== undefined) updatedChangeWoW = liveData.palmOilWowChange;
            if (liveData.palmOilMomChange !== undefined) updatedChangeMoM = liveData.palmOilMomChange;
          } else if (c.id === 'sugar' && liveData.sugarPrice) {
            updatedPrice = liveData.sugarPrice;
            if (liveData.sugarWowChange !== undefined) updatedChangeWoW = liveData.sugarWowChange;
            if (liveData.sugarMomChange !== undefined) updatedChangeMoM = liveData.sugarMomChange;
          } else if (c.id === 'potato-starch' && liveData.potatoStarchPrice) {
            updatedPrice = liveData.potatoStarchPrice;
            if (liveData.potatoStarchWowChange !== undefined) updatedChangeWoW = liveData.potatoStarchWowChange;
            if (liveData.potatoStarchMomChange !== undefined) updatedChangeMoM = liveData.potatoStarchMomChange;
          } else if (c.id === 'tapioca-starch' && liveData.tapiocaStarchPrice) {
            updatedPrice = liveData.tapiocaStarchPrice;
            if (liveData.tapiocaStarchWowChange !== undefined) updatedChangeWoW = liveData.tapiocaStarchWowChange;
            if (liveData.tapiocaStarchMomChange !== undefined) updatedChangeMoM = liveData.tapiocaStarchMomChange;
          }

          return {
            ...c,
            price: updatedPrice,
            changeWoW: updatedChangeWoW,
            changeMoM: updatedChangeMoM,
          };
        })
      );

      // Update macro drivers
      setMacroDrivers((prev) =>
        prev.map((d) => {
          if (d.id === 'fx' && liveData.usdKrw) {
            return {
              ...d,
              primaryValue: `${liveData.usdKrw.toLocaleString()} ₩`,
              secondaryValue: `EUR ${liveData.eurKrw?.toLocaleString() || 1485.40}₩`
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

  // Unified dynamic metrics synchronization for ALL 8 commodities on startup & Live Sync
  const syncAllCommodityMetrics = useCallback(async (force: boolean = false) => {
    try {
      const [
        wheatRes,
        cornRes,
        soybeanRes,
        soybeanOilRes,
        palmRes,
        sugarRes,
        potatoRes,
        tapiocaRes
      ] = await Promise.all([
        fetch(`/api/uswheat/price-history${force ? '?force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=corn&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=soybean&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=soybean-oil&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=palm-oil&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=sugar&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=potato-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/history?commodity=tapioca-starch&timeframe=5Y${force ? '&force=true' : ''}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      setCommodities((prev) =>
        prev.map((c) => {
          let updatedPrice = c.price;
          let updatedWoW = c.changeWoW;
          let updatedMoM = c.changeMoM;

          if (c.id === 'wheat') {
            if (wheatRes?.metrics?.srw) {
              updatedPrice = wheatRes.metrics.srw.latestPriceMt;
              updatedWoW = wheatRes.metrics.srw.wowChangePct;
              updatedMoM = wheatRes.metrics.srw.momChangePct;
            } else if (wheatRes?.data && wheatRes.data.length >= 2) {
              const m = calculateDynamicMetrics('wheat', c.price, wheatRes.data);
              if (m.wowPct != null) updatedWoW = m.wowPct;
              if (m.momPct != null) updatedMoM = m.momPct;
            }
          } else {
            const resMap: Record<string, any> = {
              'corn': cornRes,
              'soybean': soybeanRes,
              'soybean-oil': soybeanOilRes,
              'palm-oil': palmRes,
              'sugar': sugarRes,
              'potato-starch': potatoRes,
              'tapioca-starch': tapiocaRes,
            };
            const itemRes = resMap[c.id];
            let seriesData = itemRes?.data;
            if (!seriesData || seriesData.length < 2) {
              if (c.id === 'palm-oil') seriesData = palmOilCacheFallback?.historicalSeries;
              if (c.id === 'tapioca-starch') seriesData = tapiocaCacheFallback?.weeklyPrices;
            }

            if (seriesData && seriesData.length >= 2) {
              const latest = seriesData[seriesData.length - 1];
              const latestPrice = latest?.usdPerMT ?? latest?.cpoUsd ?? latest?.price;
              if (latestPrice && latestPrice > 0 && c.id !== 'palm-oil') {
                updatedPrice = latestPrice;
              }
              const m = calculateDynamicMetrics(c.id, updatedPrice, seriesData);
              if (m.wowPct != null) updatedWoW = m.wowPct;
              if (m.momPct != null) updatedMoM = m.momPct;
            }
          }

          return {
            ...c,
            price: updatedPrice,
            changeWoW: updatedWoW,
            changeMoM: updatedMoM,
          };
        })
      );
    } catch (err) {
      console.warn('Initial global metrics sync notice:', err);
    }
  }, []);

  // Compute dynamic metrics on initial startup
  useEffect(() => {
    syncAllCommodityMetrics(false);
  }, [syncAllCommodityMetrics]);

  const handleRefreshGemini = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Preserve existing market-price/AI refreshes even if one source fails.
      const jobs: Promise<unknown>[] = [
        Promise.resolve().then(() => geminiController.fetchLiveMarketData(true)),
        Promise.resolve().then(() => syncAllCommodityMetrics(true))
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

  const handleUpdateCommodityMetrics = useCallback(
    (commodityId: string, metrics: { price?: number; changeWoW?: number | null; changeMoM?: number | null }) => {
      setCommodities((prev) =>
        prev.map((c) => {
          if (c.id === commodityId) {
            const updatedPrice = metrics.price !== undefined && metrics.price > 0 ? metrics.price : c.price;
            const updatedWoW = metrics.changeWoW !== undefined ? metrics.changeWoW : c.changeWoW;
            const updatedMoM = metrics.changeMoM !== undefined ? metrics.changeMoM : c.changeMoM;
            
            return {
              ...c,
              price: updatedPrice,
              changeWoW: updatedWoW,
              changeMoM: updatedMoM,
            };
          }
          return c;
        })
      );
    },
    []
  );

  // Transform commodities based on global currency state
  const mappedCommodities = useMemo(() => {
    return commodities.map((c) => {
      let usdMt = c.price;

      // 1. Convert raw quotes to USD/MT baseline
      if (c.id === 'palm-oil') {
        const activeUsdMyr = fxRates.USD_MYR || getLiveExchangeRate('USD_MYR') || 4.0845;
        usdMt = c.price > 2000 ? c.price / activeUsdMyr : c.price;
      } else if (c.id === 'potato-starch' || c.unit.includes('EUR/MT') || c.unit.includes('EUR / MT')) {
        const activeEurUsd = fxRates.EUR_USD || getLiveExchangeRate('EUR') || 1.08;
        usdMt = c.price * activeEurUsd;
      } else if (c.id === 'tapioca-starch') {
        usdMt = c.price || 700;
      } else if (c.unit.includes('USd/bu')) {
        usdMt = c.ticker.includes('ZC') ? cornCentsPerBuToUsdPerMt(c.price) : grainCentsPerBuToUsdPerMt(c.price);
      } else if (c.unit.includes('USc/lb')) {
        usdMt = centsPerLbToUsdPerMt(c.price);
      } else if (c.unit.includes('USD/MT') || c.unit.includes('USD')) {
        usdMt = c.price;
      }

      // 2. Convert USD/MT baseline to active toggle choice
      let convertedPrice = usdMt;
      let newUnit = 'USD / MT';

      const activeUsdKrw = fxRates.USD_KRW || getLiveExchangeRate('KRW') || 1388.5;
      const activeEurUsd = fxRates.EUR_USD || getLiveExchangeRate('EUR') || 1.08;

      if (currency === 'EUR') {
        convertedPrice = c.id === 'potato-starch' ? c.price : usdMt / activeEurUsd;
        newUnit = 'EUR / MT';
      } else if (currency === 'KRW') {
        if (c.id === 'palm-oil') {
          convertedPrice = usdMt * (fxRates.USD_KRW || 1357.1);
        } else {
          convertedPrice = usdMt * activeUsdKrw;
        }
        newUnit = 'KRW / MT';
      }

      // 3. Fallback to cache series only if metrics are not yet loaded
      let computedWoW = c.changeWoW;
      let computedMoM = c.changeMoM;

      if (computedWoW == null) {
        if (c.id === 'tapioca-starch' && tapiocaCacheFallback?.weeklyPrices) {
          const series = tapiocaCacheFallback.weeklyPrices.map(p => ({ usdPerMT: p.price, date: p.date }));
          const metrics = calculateDynamicMetrics('tapioca-starch', c.price, series);
          if (metrics.wowPct != null) computedWoW = metrics.wowPct;
          if (metrics.momPct != null) computedMoM = metrics.momPct;
        } else if (c.id === 'palm-oil' && palmOilCacheFallback?.historicalSeries) {
          const series = palmOilCacheFallback.historicalSeries.map(p => ({ usdPerMT: p.usdPerMT, date: p.date }));
          const metrics = calculateDynamicMetrics('palm-oil', c.price, series);
          if (metrics.wowPct != null) computedWoW = metrics.wowPct;
          if (metrics.momPct != null) computedMoM = metrics.momPct;
        }
      }

      return {
        ...c,
        price: convertedPrice,
        unit: newUnit,
        changeWoW: computedWoW,
        changeMoM: computedMoM,
        _originalPrice: c.id === 'palm-oil' ? (c.price > 2000 ? c.price : Math.round(c.price * (fxRates.USD_MYR || getLiveExchangeRate('USD_MYR') || 4.0845))) : c.price,
        _originalUnit: c.unit,
      };
    });
  }, [commodities, currency, fxRates]);

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
            />
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
              onUpdateCommodityMetrics={handleUpdateCommodityMetrics}
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
