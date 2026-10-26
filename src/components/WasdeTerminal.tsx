import {SourceAttribution} from './SourceAttribution';
import React, { useState, useEffect } from 'react';
import { BarChart2 } from 'lucide-react';

export interface WasdeRecord {
  commodity: string;
  marketYear: string;
  productionMMT: number;
  productionKMT: number;
  consumptionMMT: number;
  consumptionKMT: number;
  endingStocksMMT: number;
  stocksToUseRatio: number;
  exportsMMT: number;
  exportsKMT: number;
  areaHarvestedMHA: number;
  areaHarvestedKHA: number;
  yieldMTHA: number;
  yieldKGHA: number;
  lastUpdated: string;
  source?: string;
  crush1000MT?:number;
  oilCrushRatioPct?:number;
  reportPeriod?:string;
  executiveBrief?: string;
}

export const WASDE_TABS = [
  { id: 'wheat', label: '소맥' },
  { id: 'corn', label: '옥수수' },
  { id: 'soybean', label: '대두' },
  { id: 'soybean-oil', label: '대두유' },
  { id: 'palm-oil', label: '팜유' },
  { id: 'sugar', label: '원당' },
] as const;

/** Explicit unavailable record; NaN is never an observed zero. */
export function unavailableWasdeRecord(commodity:string):WasdeRecord {
 return {commodity,marketYear:'',productionMMT:NaN,productionKMT:NaN,consumptionMMT:NaN,consumptionKMT:NaN,endingStocksMMT:NaN,stocksToUseRatio:NaN,exportsMMT:NaN,exportsKMT:NaN,areaHarvestedMHA:NaN,areaHarvestedKHA:NaN,yieldMTHA:NaN,yieldKGHA:NaN,lastUpdated:'',source:'자료 미확보'};
}
interface WasdeTerminalProps {
  initialCommodity?: string;
  className?: string;
}

export const WasdeTerminal: React.FC<WasdeTerminalProps> = ({
  initialCommodity = 'wheat',
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialCommodity);
  const [data, setData] = useState<WasdeRecord>(
    unavailableWasdeRecord(initialCommodity)
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchWasde = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/usda/${activeTab}`, {
          cache: 'no-store'
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const payload = json.data || json;

        if (isMounted && payload) {
          setData({
            commodity: payload.commodity || activeTab,
            marketYear: payload.marketYear || '',
            productionMMT: payload.productionMMT ?? NaN,
            productionKMT: payload.productionKMT ?? payload.production1000MT ?? 0,
            consumptionMMT: payload.consumptionMMT ?? payload.domesticConsumptionMMT ?? 0,
            consumptionKMT: payload.consumptionKMT ?? payload.domesticConsumption1000MT ?? 0,
            endingStocksMMT: payload.endingStocksMMT ?? 0,
            stocksToUseRatio: payload.stocksToUseRatio ?? payload.stocksToUseRatioPct ?? 0,
            exportsMMT: payload.exportsMMT ?? 0,
            exportsKMT: payload.exportsKMT ?? payload.exports1000MT ?? 0,
            areaHarvestedMHA: payload.areaHarvestedMHA ?? (payload.areaHarvested1000HA ? Number((payload.areaHarvested1000HA / 1000).toFixed(1)) : 0),
            areaHarvestedKHA: payload.areaHarvestedKHA ?? payload.areaHarvested1000HA ?? 0,
            yieldMTHA: payload.yieldMTHA ?? 0,
            yieldKGHA: payload.yieldKGHA ?? (payload.yieldMTHA ? Math.round(payload.yieldMTHA * 1000) : 0),
            lastUpdated: payload.lastUpdated || json.lastUpdated || '',
            source: payload.source || json.source || 'USDA FAS PSD / WASDE Official',
            executiveBrief: payload.executiveBrief || json.executiveBrief || ''
          });
        }
      } catch (err) {
        console.warn(`[WasdeTerminal] Failed to fetch /api/usda/${activeTab}:`, err);
        // Fallback to verified baseline
        if (isMounted) setData(unavailableWasdeRecord(activeTab));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchWasde();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const activeCommodityData = data.commodity === activeTab ? data : unavailableWasdeRecord(activeTab);
  if(!Number.isFinite(activeCommodityData.productionMMT))return <div className={className}>검증된 수급 자료 미확보</div>;
  const selectedCommodity = activeTab;
  const currentData = activeCommodityData;
  const activePsdData = {
    ...currentData,
    areaMHA: currentData.areaHarvestedMHA,
  };

  return (
    <div className={`p-3 bg-[#f9fafb] rounded border border-[#e5e7eb] flex flex-col justify-between space-y-2.5 pdf-section-card min-h-[260px] break-inside-avoid print:break-inside-avoid ${className}`}>
      {/* --- ROW 1: Title (Left) and Market Year (Far Right) --- */}
      <div className="flex items-center justify-between w-full border-b border-[#e5e7eb] pb-2.5 mb-1 flex-wrap sm:flex-nowrap gap-2">
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 break-keep">
            글로벌 수급 밸런스 (Global S&D Balance)
          </h3>
        </div>

        {/* Far Right: Market Year Label */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
            Market Year: <strong className="text-slate-700 font-bold">2026</strong>
          </span>
          {isLoading && (
            <span className="relative flex h-2 w-2" aria-description="동기화 중">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
        </div>
      </div>

      {/* --- ROW 2: Commodity Tabs (Strictly Left-Aligned) --- */}
      <div className="flex items-center justify-start gap-1.5 mb-1.5 flex-wrap print:hidden">
        {WASDE_TABS.map((item) => (
          <button
            key={`wasde-tab-${item.id}`}
            onClick={() => setActiveTab(item.id)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
              activeTab === item.id
                ? 'bg-[#111827] text-white font-bold'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 6-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 print:grid-cols-3 print:gap-2 print:w-full wasde-grid text-left">
        {/* 1. Production */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">총생산 (Production)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-prod">
              {activePsdData.productionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-10 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#6b7280] block font-mono whitespace-nowrap">
              {activePsdData.productionKMT.toLocaleString('en-US')} kMT
            </span>
          )}
        </div>

        {/* 2. Consumption */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">총소비 (Consumption)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-cons">
              {activePsdData.consumptionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-10 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#6b7280] block font-mono whitespace-nowrap">
              {activePsdData.consumptionKMT.toLocaleString('en-US')} kMT
            </span>
          )}
        </div>

        {/* 3. Ending Stocks */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">기말재고 (Ending Stocks)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-stocks">
              {activePsdData.endingStocksMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-12 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#059669] block font-mono font-semibold whitespace-nowrap" id="wasde-stu">
              재고율 {activePsdData.stocksToUseRatio.toFixed(1)}% (S/U)
            </span>
          )}
        </div>

        {/* 4. Exports */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">총수출량 (Exports)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-exports">
              {activePsdData.exportsMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-10 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#6b7280] block font-mono whitespace-nowrap">
              {activePsdData.exportsKMT.toLocaleString('en-US')} kMT
            </span>
          )}
        </div>

        {/* 5. Area */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">수확면적 (Area Harvested)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-area">
              {activePsdData.areaMHA.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M HA
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-10 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#6b7280] block font-mono whitespace-nowrap">
              {activePsdData.areaHarvestedKHA.toLocaleString('en-US')} kHA
            </span>
          )}
        </div>

        {/* 6. Yield */}
        <div className="p-2 bg-white rounded border border-[#e5e7eb] break-inside-avoid print:break-inside-avoid">
          <span className="text-[10px] text-[#6b7280] block font-medium whitespace-nowrap">단수/수확량 (Yield)</span>
          {isLoading ? (
            <div className="h-5 bg-slate-100 animate-pulse rounded w-16 my-0.5" />
          ) : (
            <span className="font-mono text-sm font-bold text-[#111827] block whitespace-nowrap" id="wasde-yield">
              {activePsdData.yieldMTHA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT/HA
            </span>
          )}
          {isLoading ? (
            <div className="h-3 bg-slate-100 animate-pulse rounded w-10 mt-0.5" />
          ) : (
            <span className="text-[9px] text-[#6b7280] block font-mono whitespace-nowrap">
              {activePsdData.yieldKGHA.toLocaleString('en-US')} kg/HA
            </span>
          )}
        </div>
      </div>

      {/* Metadata line */}
      <SourceAttribution className="pt-1 border-t border-slate-200/60" entries={[{label:'USDA FAS PSD'},{label:'Official WASDE Release',url:'https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report'}]}/>
    </div>
  );
};

export default WasdeTerminal;
