import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header, getKSTTime } from './components/Header';
import { OverviewTerminal } from './components/OverviewTerminal';
import { CommodityDetail } from './components/CommodityDetail';
import { ExportReportModal } from './components/ExportReportModal';
import { COMMODITIES, MACRO_DRIVERS, MARKET_ISSUES } from './data/commoditiesData';
import { Commodity, LiveMarketUpdate, Currency } from './types';
import { geminiController } from './services/geminiController';
import { centsPerLbToUsdPerMt, cornCentsPerBuToUsdPerMt, grainCentsPerBuToUsdPerMt } from './utils/commodityConversions';
import { exportGlobalDashboardToPdf } from './utils/exportDashboardPdf';

export default function App() {
  const [activeView, setActiveView] = useState<string>('main-dashboard');
  const [currency, setCurrency] = useState<Currency>('KRW');
  const [commodities, setCommodities] = useState<Commodity[]>(COMMODITIES);
  const [macroDrivers, setMacroDrivers] = useState(MACRO_DRIVERS);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(getKSTTime());
  const [aiBriefText, setAiBriefText] = useState<string>('');
  const [modelVersion, setModelVersion] = useState<string>('gemini-flash-latest');

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
          let updatedPrice = c.price;
          let updatedChangeWoW = c.changeWoW;
          let updatedChangeMoM = c.changeMoM;

          if (c.id === 'wheat' && liveData.wheatPrice) {
            updatedPrice = liveData.wheatPrice;
          } else if (c.id === 'corn' && liveData.cornPrice) {
            updatedPrice = liveData.cornPrice;
            if (liveData.cornWowChange !== undefined) updatedChangeWoW = liveData.cornWowChange;
          } else if (c.id === 'soybean' && liveData.soybeanPrice) {
            updatedPrice = liveData.soybeanPrice;
            if (liveData.soybeanWowChange !== undefined) updatedChangeWoW = liveData.soybeanWowChange;
          } else if (c.id === 'soybean-oil' && liveData.soybeanOilPrice) {
            updatedPrice = liveData.soybeanOilPrice;
            if (liveData.soybeanOilWowChange !== undefined) updatedChangeWoW = liveData.soybeanOilWowChange;
          } else if (c.id === 'palm-oil' && liveData.palmOilPrice) {
            updatedPrice = liveData.palmOilPrice;
          } else if (c.id === 'sugar' && liveData.sugarPrice) {
            updatedPrice = liveData.sugarPrice;
          } else if (c.id === 'potato-starch' && liveData.potatoStarchPrice) {
            updatedPrice = liveData.potatoStarchPrice;
          } else if (c.id === 'tapioca-starch' && liveData.tapiocaStarchPrice) {
            updatedPrice = liveData.tapiocaStarchPrice;
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

  const handleRefreshGemini = async () => {
    setIsSyncing(true);
    setLastSyncTime(getKSTTime());
    await geminiController.fetchLiveMarketData(true);
    setLastSyncTime(getKSTTime());
    setIsSyncing(false);
  };

  // Transform commodities based on global currency state
  const mappedCommodities = useMemo(() => {
    return commodities.map((c) => {
      let usdMt = c.price;

      // 1. Convert raw quotes to USD/MT baseline
      if (c.id === 'palm-oil') {
        // If price is raw MYR (>2000), convert MYR -> USD/MT (1 USD = 4.0831 MYR)
        usdMt = c.price > 2000 ? c.price / 4.0831 : c.price;
      } else if (c.id === 'potato-starch') {
        usdMt = c.price * 1.145;
      } else if (c.id === 'tapioca-starch') {
        usdMt = c.price || 700;
      } else if (c.unit.includes('USd/bu')) {
        usdMt = c.ticker.includes('ZC') ? cornCentsPerBuToUsdPerMt(c.price) : grainCentsPerBuToUsdPerMt(c.price);
      } else if (c.unit.includes('USc/lb')) {
        usdMt = centsPerLbToUsdPerMt(c.price);
      } else if (c.unit.includes('EUR/MT') || c.unit.includes('EUR / MT')) {
        usdMt = c.price * 1.08;
      } else if (c.unit.includes('USD/MT') || c.unit.includes('USD')) {
        usdMt = c.price;
      }

      // 2. Convert USD/MT baseline to active toggle choice
      let convertedPrice = usdMt;
      let newUnit = 'USD / MT';

      if (currency === 'EUR') {
        convertedPrice = c.id === 'potato-starch' ? c.price : usdMt / 1.08;
        newUnit = 'EUR / MT';
      } else if (currency === 'KRW') {
        if (c.id === 'palm-oil') {
          convertedPrice = usdMt * 1357.1; // 1,545,188 KRW / MT
        } else if (c.id === 'potato-starch') {
          convertedPrice = c.price * 1388.5;
        } else {
          convertedPrice = usdMt * 1388.5;
        }
        newUnit = 'KRW / MT';
      }

      return {
        ...c,
        price: convertedPrice,
        unit: newUnit,
        _originalPrice: c.id === 'palm-oil' ? (c.price > 2000 ? c.price : Math.round(c.price * 4.0831)) : c.price,
        _originalUnit: c.unit,
      };
    });
  }, [commodities, currency]);

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
