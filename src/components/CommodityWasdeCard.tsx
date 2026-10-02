import React, { useState, useEffect } from 'react';
import { WASDE_BASELINES, WasdeRecord } from './WasdeTerminal';

export interface CommodityWasdeCardProps {
  commodityId: string;
  commodityName?: string;
  customBrief?: string;
  className?: string;
}

export const CommodityWasdeCard: React.FC<CommodityWasdeCardProps> = ({
  commodityId,
  commodityName,
  customBrief,
  className = ''
}) => {
  const normalizedId = commodityId?.toLowerCase().trim() || 'wheat';
  const baseline = WASDE_BASELINES[normalizedId] || WASDE_BASELINES.wheat;

  const [data, setData] = useState<WasdeRecord>(baseline);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchCommodityWasde = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/usda/${normalizedId}`, {
          cache: 'no-store'
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const payload = json.data || json;

        if (isMounted && payload) {
          setData({
            commodity: payload.commodity || normalizedId,
            marketYear: payload.marketYear || '2026',
            productionMMT: payload.productionMMT ?? baseline.productionMMT,
            productionKMT: payload.productionKMT ?? payload.production1000MT ?? baseline.productionKMT,
            consumptionMMT: payload.consumptionMMT ?? payload.domesticConsumptionMMT ?? baseline.consumptionMMT,
            consumptionKMT: payload.consumptionKMT ?? payload.domesticConsumption1000MT ?? baseline.consumptionKMT,
            endingStocksMMT: payload.endingStocksMMT ?? baseline.endingStocksMMT,
            stocksToUseRatio: payload.stocksToUseRatio ?? payload.stocksToUseRatioPct ?? baseline.stocksToUseRatio,
            exportsMMT: payload.exportsMMT ?? baseline.exportsMMT,
            exportsKMT: payload.exportsKMT ?? payload.exports1000MT ?? baseline.exportsKMT,
            areaHarvestedMHA: payload.areaHarvestedMHA ?? (payload.areaHarvested1000HA ? Number((payload.areaHarvested1000HA / 1000).toFixed(1)) : baseline.areaHarvestedMHA),
            areaHarvestedKHA: payload.areaHarvestedKHA ?? payload.areaHarvested1000HA ?? baseline.areaHarvestedKHA,
            yieldMTHA: payload.yieldMTHA ?? baseline.yieldMTHA,
            yieldKGHA: payload.yieldKGHA ?? (payload.yieldMTHA ? Math.round(payload.yieldMTHA * 1000) : baseline.yieldKGHA),
            lastUpdated: payload.lastUpdated || json.lastUpdated || baseline.lastUpdated,
            source: payload.source || json.source || baseline.source,
            executiveBrief: payload.executiveBrief || json.executiveBrief || customBrief || ''
          });
        }
      } catch (err) {
        console.warn(`[CommodityWasdeCard] Failed to fetch /api/usda/${normalizedId}:`, err);
        if (isMounted) {
          setData(WASDE_BASELINES[normalizedId] || WASDE_BASELINES.wheat);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchCommodityWasde();

    return () => {
      isMounted = false;
    };
  }, [normalizedId, customBrief]);

  const isPotatoStarch = normalizedId === 'potato-starch' || normalizedId === 'potato_starch';

  if (isPotatoStarch) {
    return (
      <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className || ''}`.trim()}>
        {/* Upper Content Section */}
        <div className="flex-1 space-y-3">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
              <h3 className="text-base font-bold text-slate-900 break-keep">
                글로벌 수급 밸런스 (Global S&D Balance - Potato Starch)
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                Crop Year: <span className="text-slate-800 font-semibold">2026/27</span>
              </span>
            </div>
          </div>

          {/* Dynamic 6-Grid S&D Telemetry Card */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
            {/* Box 1: 감자 생산량 (Potato Production) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">감자 생산량 (Potato Production)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                27.60 MMT
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2025: 30.00 MMT (-8.00%)
              </span>
            </div>

            {/* Box 2: 전분 수출량 (Starch Exports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">전분 수출량 (Starch Exports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                1.42 MMT
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                CN 110813 (안정적)
              </span>
            </div>

            {/* Box 3: 전분 수입량 (Starch Imports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">전분 수입량 (Starch Imports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                0.98 MMT
              </span>
              <span className="text-[10px] font-mono text-[#059669] font-medium block mt-0.5">
                수지 균형 안정적
              </span>
            </div>

            {/* Box 4: 재배 면적 (Area Harvested) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">재배 면적 (Area Harvested)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                699 kHA
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2025: 720 kHA (-2.92%)
              </span>
            </div>

            {/* Box 5: 감자 단수 (Potato Yield) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">감자 단수 (Potato Yield)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                39.5 MT/HA
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2025: 41.7 MT/HA (-5.3%)
              </span>
            </div>

            {/* Box 6: JRC 수율 예측 (Starch Content) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">감자 전분 함량 (Starch Content)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                19.2% (평균)
              </span>
              <span className="text-[10px] font-mono text-amber-500 block mt-0.5 font-medium">
                고온 가뭄 여파 수율 편차
              </span>
            </div>
          </div>

          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed break-keep">
            주요 조달국(독일, 프랑스, 네덜란드, 덴마크)의 원료감자 생산량 전망치는 재배면적 축소(-2.92%)와 여름철 가뭄 여파에 따른 단수 하락(-5.3%)이 중첩되어 전년(30.00 MMT) 대비 -8.00% 감소한 27.60 MMT로 예측됩니다. 이에 따라 원료 공급 타이트화 및 가공용 수율(Starch Content) 편차 위험으로 전반적인 조달 타이트와 단가 변동성 주시가 권고됩니다.
          </p>
        </div>

        {/* Footer Source */}
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>
            출처: JRC MARS · Eurostat Crop Production · Eurostat Comext ·{' '}
            <a
              href="https://ec.europa.eu/eurostat"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors"
            >
              Eurostat ↗
            </a>
          </span>
        </div>
      </div>
    );
  }

  const isTapiocaStarch = normalizedId === 'tapioca-starch' || normalizedId === 'tapioca_starch';

  if (isTapiocaStarch) {
    return (
      <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className || ''}`.trim()}>
        {/* Upper Content Section */}
        <div className="flex-1 space-y-3">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
              <h3 className="text-base font-bold text-slate-900 break-keep">
                글로벌 수급 밸런스 (Global S&D Balance - Tapioca Starch)
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                Season: <span className="text-slate-800 font-semibold">2025/26</span>
              </span>
            </div>
          </div>

          {/* Dynamic 6-Grid S&D Telemetry Card */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
            {/* Box 1: 카사바 생산량 (Cassava Production) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">카사바 생산량 (Cassava Production)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                18.58 MMT
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2024/25: 24.98 MMT (-25.6%)
              </span>
            </div>

            {/* Box 2: 천연전분 수출량 (Native Starch Exports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">천연전분 수출량 (Native Starch Exports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                2.85 MMT
              </span>
              <span className="text-[10px] font-mono text-[#059669] font-semibold block mt-0.5">
                YoY: +4.2%
              </span>
            </div>

            {/* Box 3: 변성전분 수출량 (Modified Starch Exports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">변성전분 수출량 (Modified Starch Exports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                1.15 MMT
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                YoY: -1.5%
              </span>
            </div>

            {/* Box 4: 재배 면적 (Cassava Area) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">카사바 재배면적 (Planted Area)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                6,615 kRAI
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2024/25: 8,445 kRAI (-21.7%)
              </span>
            </div>

            {/* Box 5: 카사바 단수 (Cassava Yield) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">카사바 평균단수 (Cassava Yield)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                2.81 MT/Rai
              </span>
              <span className="text-[10px] font-mono text-[#DF0029] font-semibold block mt-0.5">
                vs 2024/25: 2.96 MT/Rai (-5.0%)
              </span>
            </div>

            {/* Box 6: TTSA FOB 가격 (FOB Bangkok) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">TTSA 기준시세 (FOB BKK)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                $700.00 / MT
              </span>
              <span className="text-[10px] font-mono text-[#059669] font-semibold block mt-0.5">
                vs 전주 대비: 0.00% WoW
              </span>
            </div>
          </div>

          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed break-keep">
            최근 태국 타피오카 전분 FOB 방콕 가격은 톤당 700 USD에서 안정세를 보이고 있으며, 2025/26 시즌 카사바 생산량(18.58 MMT) 감소에 따른 공급 제약 속에서도 천연전분 수출(2.85 MMT)은 견조한 수요를 유지하고 있습니다. 향후 1~3개월간 중국 수입 수요와 산지 수확 진척도가 주요 가격 변동 요인으로 작용할 전망입니다.
          </p>
        </div>

        {/* Footer Source */}
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>
            출처: Thai Tapioca Starch Association (TTSA) ·{' '}
            <a
              href="https://www.thaitapiocastarch.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors"
            >
              TTSA ↗
            </a>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className || ''}`.trim()}>
      {/* Upper Content Section */}
      <div className="flex-1 space-y-3">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
            <h3 className="text-base font-bold text-slate-900 break-keep">
              글로벌 수급 밸런스 (Global S&D Balance){commodityName ? ` - ${commodityName}` : ''}
            </h3>
            {isLoading && (
              <span className="relative flex h-2 w-2 ml-1 shrink-0" title="동기화 중">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4F46E5]"></span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
              Market Year: <span className="text-slate-800 font-semibold">{data.marketYear || '2026'}</span>
            </span>
          </div>
        </div>

        {/* Dynamic 6-Grid S&D Telemetry Card */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
          {/* Box 1: 총생산 (Production) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총생산 (Production)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-prod">
              {data.productionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {data.productionKMT.toLocaleString('en-US')} kMT
            </span>
          </div>

          {/* Box 2: 총소비 (Consumption) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">Domestic Consumption (총소비)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-cons">
              {data.consumptionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {data.consumptionKMT.toLocaleString('en-US')} kMT
            </span>
          </div>

          {/* Box 3: 기말재고 (Ending Stocks) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">기말재고 (Ending Stocks)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-stocks">
              {data.endingStocksMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
            <span className="text-[10px] font-mono text-[#059669] font-medium block mt-0.5" id="wasde-stu">
              재고율 {data.stocksToUseRatio.toFixed(1)}% (S/U)
            </span>
          </div>

          {/* Box 4: 총수출량 (Exports) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총수출량 (Exports)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-exports">
              {data.exportsMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {data.exportsKMT.toLocaleString('en-US')} kMT
            </span>
          </div>

          {/* Box 5: 수확면적 (Area Harvested) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">Area Harvested (수확 면적)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-area">
              {data.areaHarvestedMHA.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M HA
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {data.areaHarvestedKHA.toLocaleString('en-US')} kHA
            </span>
          </div>

          {/* Box 6: 단수/수확량 (Yield) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">단수/수확량 (Yield)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="wasde-yield">
              {data.yieldMTHA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT/HA
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {data.yieldKGHA.toLocaleString('en-US')} kg/HA
            </span>
          </div>
        </div>

        {/* Executive Brief */}
        {(data.executiveBrief || customBrief) && (
          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed">
            {data.executiveBrief || customBrief}
          </p>
        )}
      </div>

      {/* Footer Source */}
      <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
        <span>
          출처: {data.source || 'USDA FAS PSD'} ·{' '}
          <a
            href="https://apps.fas.usda.gov/psdonline/app/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors"
          >
            USDA PSD Online ↗
          </a>
        </span>
      </div>
    </div>
  );
};

export default CommodityWasdeCard;
