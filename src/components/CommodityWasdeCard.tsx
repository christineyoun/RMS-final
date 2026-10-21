import {verifiedSoybeanOilSupply,soybeanOilCrushIndicators,type SoybeanOilSupplyResult} from '../lib/soybeanOilSupply';
import React, { useState, useEffect } from 'react';
import { normalizeVerifiedOtherCommodityWasde, USDA_WORLD_IDS } from '../lib/verifiedWorldWasde';
// RMS Step 12 world USDA validation
import { WASDE_BASELINES, WasdeRecord } from './WasdeTerminal';

export interface CommodityWasdeCardProps {
  commodityId: string;
  verifiedSupply?:SoybeanOilSupplyResult;
  commodityName?: string;
  customBrief?: string;
  className?: string;
  isSyncing?: boolean;
  refreshRevision?: number;
}

/**
 * Soybean oil USDA PSD cards: use ONE verified world record set for every metric.
 * Do not mix small kMT numbers from an API response with MMT numbers supplied by
 * an unrelated / cached commodity summary (a previous wheat fallback bug).
 */
export function normalizeVerifiedSoybeanOilWasde(payload: any, status: unknown, verifiedAt = ''): WasdeRecord | null {
  const data=verifiedSoybeanOilSupply({success:true,status:status as any,data:payload,verifiedAt,checkedAt:verifiedAt});if(!data)return null;
  const period=String(data.rawRecords[0].calendarYear)+'-'+data.releaseMonth.padStart(2,'0');
  return {commodity:'soybean-oil',marketYear:data.marketYear,productionMMT:data.productionMMT,productionKMT:data.production1000MT,consumptionMMT:data.domesticConsumptionMMT,consumptionKMT:data.domesticConsumption1000MT,endingStocksMMT:data.endingStocksMMT,stocksToUseRatio:data.stocksToUseRatioPct,exportsMMT:data.exportsMMT,exportsKMT:data.exports1000MT,areaHarvestedMHA:0,areaHarvestedKHA:0,yieldMTHA:0,yieldKGHA:0,lastUpdated:verifiedAt,source:'USDA FAS PSD',executiveBrief:data.executiveBrief,reportPeriod:period,...soybeanOilCrushIndicators(data)};
}

export const CommodityWasdeCard: React.FC<CommodityWasdeCardProps> = ({
  commodityId,
  commodityName,
  verifiedSupply,
  customBrief,
  className = '',
  isSyncing = false,
  refreshRevision = 0
}) => {
  const normalizedId = commodityId?.toLowerCase().trim() || 'wheat';
  const baseline = WASDE_BASELINES[normalizedId] || WASDE_BASELINES.wheat;
  const isSoybeanOil = normalizedId === 'soybean-oil' || normalizedId === 'soybean_oil';
  const isVerifiedUsdaCommodity = isSoybeanOil || USDA_WORLD_IDS.includes(normalizedId);

  const [data, setData] = useState<WasdeRecord>(baseline);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Treat the bundled soybean-oil PSD baseline as unverified, not as a live USDA observation.
  const [verifiedWorldPsd, setVerifiedWorldPsd] = useState(false);
  const [verifiedCommodityId, setVerifiedCommodityId] = useState('');
  const [usdaDataStatus, setUsdaDataStatus] = useState<'live-verified' | 'last-verified' | 'unavailable'>('unavailable');
  const [usdaVerifiedAt, setUsdaVerifiedAt] = useState('');

  // RMS Step 17 — official starch source separation
  const [tapiocaQuote, setTapiocaQuote] = useState<{ date: string; usdPerMt: number; wowPct: number | null } | null>(null);
  const [tapiocaQuoteStatus, setTapiocaQuoteStatus] = useState<'loading' | 'live-verified' | 'last-verified' | 'unavailable'>('loading');

  // RMS Step 20 — potato starch Eurostat Comext trade
  type PotatoTradeData = { periodStart: string; periodEnd: string; monthsCount: number; imports1000MT: number; exports1000MT: number; productCode: string; reporter: string; partner: string; provisional: boolean };
  const [potatoTradeData, setPotatoTradeData] = useState<PotatoTradeData | null>(null);
  const [potatoTradeStatus, setPotatoTradeStatus] = useState<'loading' | 'live-verified' | 'last-verified' | 'unavailable'>('loading');
  useEffect(() => {
    if (!['potato-starch', 'potato_starch'].includes(normalizedId)) return;
    let active = true;
    setPotatoTradeStatus('loading');
    fetch('/api/starch/potato-trade' + (refreshRevision > 0 ? '?force=true' : ''), {cache:'no-store'})
      .then(r => r.json())
      .then(json => {
        if (!active) return;
        const d = json.data;
        if (json.success === true && ['live-verified','last-verified'].includes(json.dataStatus) &&
            d && d.productCode === '11081300' && d.reporter === 'EU27_2020' &&
            d.partner === 'EXT_EU27_2020' && d.monthsCount === 12 &&
            /^20\d{2}-(0[1-9]|1[0-2])$/.test(d.periodStart) &&
            /^20\d{2}-(0[1-9]|1[0-2])$/.test(d.periodEnd) &&
            Number.isFinite(d.imports1000MT) && d.imports1000MT >= 0 &&
            Number.isFinite(d.exports1000MT) && d.exports1000MT > 0) {
          setPotatoTradeData(d); setPotatoTradeStatus(json.dataStatus);
        } else { setPotatoTradeData(null); setPotatoTradeStatus('unavailable'); }
      }).catch(() => {if(active){setPotatoTradeData(null);setPotatoTradeStatus('unavailable');}});
    return () => {active=false};
  }, [normalizedId, refreshRevision]);

  // RMS Step 18 — Eurostat potato harvest statistics
  type PotatoSourceData = { harvestYear: string; dataset: string; productionMMT: number; area1000HA: number; weightedYieldMTHA: number; coverage: string[]; isEstimateOrProvisional: boolean };
  const [potatoSourceData, setPotatoSourceData] = useState<PotatoSourceData | null>(null);
  const [potatoSourceStatus, setPotatoSourceStatus] = useState<'loading' | 'live-verified' | 'last-verified' | 'unavailable'>('loading');
  useEffect(() => {
    if (!['potato-starch', 'potato_starch'].includes(normalizedId)) return;
    let active = true;
    setPotatoSourceStatus('loading');
    const url = '/api/starch/potato-stats' + (refreshRevision > 0 ? '?force=true' : '');
    fetch(url, {cache: 'no-store'}).then(async response => {
      const json = await response.json();
      if (!active) return;
      const d = json.data;
      if (json.success === true && ['live-verified','last-verified'].includes(json.dataStatus) &&
          d && d.coverage?.length === 4 && ['DE','FR','NL','DK'].every(x => d.coverage.includes(x)) &&
          /^20\d{2}$/.test(d.harvestYear) &&
          Number.isFinite(d.productionMMT) && d.productionMMT > 0 &&
          Number.isFinite(d.area1000HA) && d.area1000HA > 0 &&
          Number.isFinite(d.weightedYieldMTHA) && d.weightedYieldMTHA > 0) {
        setPotatoSourceData(d); setPotatoSourceStatus(json.dataStatus);
      } else { setPotatoSourceData(null); setPotatoSourceStatus('unavailable'); }
    }).catch(() => {if(active){setPotatoSourceData(null); setPotatoSourceStatus('unavailable');}});
    return () => {active = false;};
  }, [normalizedId, refreshRevision]);
  useEffect(() => {
    if (!['tapioca-starch', 'tapioca_starch'].includes(normalizedId)) return;
    let active = true;
    setTapiocaQuoteStatus('loading');
    const url = '/api/starch/tapioca-quote' + (refreshRevision > 0 ? '?force=true' : '');
    fetch(url, { cache: 'no-store' }).then(async response => {
      const json = await response.json();
      if (!active) return;
      if ((json.dataStatus === 'live-verified' || json.dataStatus === 'last-verified') &&
          json.quote && Number.isFinite(json.quote.usdPerMt) && /^\d{4}-\d{2}-\d{2}$/.test(json.quote.date)) {
        setTapiocaQuote(json.quote);
        setTapiocaQuoteStatus(json.dataStatus);
      } else { setTapiocaQuote(null); setTapiocaQuoteStatus('unavailable'); }
    }).catch(() => { if (active) { setTapiocaQuote(null); setTapiocaQuoteStatus('unavailable'); } });
    return () => { active = false; };
  }, [normalizedId, refreshRevision]);

  useEffect(() => {
    // Starch metrics below are explicitly labeled historical estimates, NOT USDA global PSD.
    if (['potato-starch', 'potato_starch', 'tapioca-starch', 'tapioca_starch'].includes(normalizedId)) return;
    let isMounted = true;

    const fetchCommodityWasde = async () => {
      if(isSoybeanOil){const record=verifiedSupply&&normalizeVerifiedSoybeanOilWasde(verifiedSupply.data,verifiedSupply.status,verifiedSupply.verifiedAt);setData(record||baseline);setVerifiedWorldPsd(!!record);setVerifiedCommodityId(record?normalizedId:'');setUsdaDataStatus(record?verifiedSupply!.status:'unavailable');setUsdaVerifiedAt(verifiedSupply?.verifiedAt||'');setIsLoading(false);return;}
      setIsLoading(true);
      try {
        const res = await fetch(`/api/usda/${normalizedId}${isVerifiedUsdaCommodity && isSyncing ? '?force=true' : ''}`, {
          cache: 'no-store'
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const payload = json.data || json;

        if (isMounted && payload) {
          if (isVerifiedUsdaCommodity) {
            const verified = isSoybeanOil
              ? normalizeVerifiedSoybeanOilWasde(payload, json.dataStatus, json.verifiedAt || '')
              : normalizeVerifiedOtherCommodityWasde(payload, json.dataStatus, json.verifiedAt || '', normalizedId);
            if (verified) {
              setData(verified);
              setVerifiedWorldPsd(true);
              setVerifiedCommodityId(normalizedId);
              setUsdaDataStatus(json.dataStatus);
              setUsdaVerifiedAt(json.verifiedAt || '');
            } else {
              // Never display old wheat (or another commodity's) summary as soybean oil.
              setVerifiedWorldPsd(false);
              setVerifiedCommodityId('');
              setUsdaDataStatus('unavailable');
            }
            return;
          }
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
          if (isVerifiedUsdaCommodity) { setVerifiedWorldPsd(false); setVerifiedCommodityId(''); setUsdaDataStatus('unavailable'); }
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
  }, [normalizedId, customBrief, verifiedSupply, isSoybeanOil, isVerifiedUsdaCommodity, isSyncing, refreshRevision]);

  const isPotatoStarch = normalizedId === 'potato-starch' || normalizedId === 'potato_starch';

  const showSupplyFigures = !isVerifiedUsdaCommodity || (verifiedWorldPsd && verifiedCommodityId === normalizedId && data.commodity === normalizedId);

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
                Harvest Year: <span className="text-slate-800 font-semibold">{potatoSourceData?.harvestYear || "—"} · Eurostat</span>
              </span>
            </div>
          </div>

          {/* Dynamic 6-Grid S&D Telemetry Card */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
            {/* Box 1: 감자 생산량 (Potato Production) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">감자 생산량 (Potato Production · 4국)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                {potatoSourceData ? `${potatoSourceData.productionMMT.toFixed(2)} MMT` : "N/A"}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                {potatoSourceData ? `Eurostat ${potatoSourceData.harvestYear} · 감자 전체` : "공식 4국 수치 미확인"}
              </span>
            </div>

            {/* Box 2: 전분 수출량 (Starch Exports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">전분 수출량 (EU 역외 · Starch Exports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                {potatoTradeData ? potatoTradeData.exports1000MT.toLocaleString('en-US',{maximumFractionDigits:2}) + ' kMT' : 'N/A'}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                {potatoTradeData ? potatoTradeData.periodStart + '~' + potatoTradeData.periodEnd + ' · CN 11081300' : 'EU27 역외 공식 거래량 미확인'}
              </span>
            </div>

            {/* Box 3: 전분 수입량 (Starch Imports) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">전분 수입량 (EU 역외 · Starch Imports)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                {potatoTradeData ? potatoTradeData.imports1000MT.toLocaleString('en-US',{maximumFractionDigits:2}) + ' kMT' : 'N/A'}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                {potatoTradeData ? potatoTradeData.periodStart + '~' + potatoTradeData.periodEnd + ' · CN 11081300' : 'EU27 역외 공식 거래량 미확인'}
              </span>
            </div>

            {/* Box 4: 재배 면적 (Area Harvested) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">재배 면적 (Area Harvested · 4국)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                {potatoSourceData ? `${potatoSourceData.area1000HA.toLocaleString("en-US", {maximumFractionDigits: 1})} kHA` : "N/A"}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                {potatoSourceData ? `Eurostat ${potatoSourceData.harvestYear} · 4국 합계` : "공식 4국 수치 미확인"}
              </span>
            </div>

            {/* Box 5: 감자 단수 (Potato Yield) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">감자 단수 (Potato Yield · 4국)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                {potatoSourceData ? `${potatoSourceData.weightedYieldMTHA.toFixed(2)} MT/HA` : "N/A"}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
                {potatoSourceData ? "생산량 ÷ 면적 · 가중 환산" : "공식 수치 확인 불가"}
              </span>
            </div>

            {/* Box 6: JRC 수율 예측 (Starch Content) */}
            <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
              <span className="text-[10px] text-[#6b7280] block font-sans">감자 전분 함량 (Starch Content)</span>
              <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block">
                19.2% (평균)
              </span>
              <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5 font-medium">
                기존 참고 추정치 · 공급사 검증 필요
              </span>
            </div>
          </div>

          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed break-keep">
            {potatoSourceData ? `Eurostat ${potatoSourceData.dataset} ${potatoSourceData.harvestYear} 수확연도 기준 독일·프랑스·네덜란드·덴마크 4개국 전체 감자(종자용 포함) 생산량 ${potatoSourceData.productionMMT.toFixed(2)} MMT, 면적 ${potatoSourceData.area1000HA.toFixed(1)} kHA, 면적가중 단수 ${potatoSourceData.weightedYieldMTHA.toFixed(2)} MT/HA.${potatoSourceData.isEstimateOrProvisional ? " 일부 Eurostat 값은 잠정/추정 상태." : ""} 전분용 감자만의 생산량은 아닙니다. ${potatoTradeData ? `감자전분(CN 11081300) 거래량은 EU27 역외 교역만 집계한 ${potatoTradeData.periodStart}~${potatoTradeData.periodEnd} 12개월 통계(수출 ${potatoTradeData.exports1000MT.toFixed(2)} kMT·수입 ${potatoTradeData.imports1000MT.toFixed(2)} kMT)입니다. 생산량 4국과 무역통계 EU27은 집계 범위가 다르며 EU 내부 거래는 포함하지 않습니다. ${potatoTradeData.provisional ? "일부 거래량은 잠정치입니다. " : ""}` : "EU27 역외 감자전분 무역통계는 현재 확인되지 않아 N/A로 표시했습니다. "} 전분 함량 19.2%는 공급사 검증이 필요한 기존 참고 추정치입니다.` : "Eurostat의 독일·프랑스·네덜란드·덴마크 4개국 동일 수확연도 생산·면적 수치를 아직 검증하지 못했습니다. 첫째·넷째·다섯째 칸은 N/A입니다. 전분 수출입은 별도 Comext EU27 역외 무역자료로 표시되며, 전분 함량 19.2%는 미검증 참고치입니다. 실물 오퍼는 공급사 확인이 필요합니다."}
          </p>
        </div>

        {/* Footer Source */}
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>
            출처: {potatoSourceData ? `Eurostat ${potatoSourceData.dataset} · ${potatoSourceData.harvestYear}` : 'Eurostat 공식 수치 미확인'} · {potatoTradeData ? `Comext EU27 역외 ${potatoTradeData.periodEnd}` : "Comext 미확인"} · 전분함량 참고 추정치 ·{' '}
            <a
              href={`https://ec.europa.eu/eurostat/databrowser/view/${potatoSourceData?.dataset || "apro_cpnh1"}/default/table?lang=en`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              Eurostat ↗
            </a>
            {' · '}
            <a
              href="https://ec.europa.eu/eurostat/databrowser/view/DS-045409/default/table?lang=en"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              Comext ↗
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
                Season: <span className="text-slate-800 font-semibold">2025/26 · 참고 추정치</span>
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
                {tapiocaQuote ? `$${tapiocaQuote.usdPerMt.toFixed(2)} / MT` : 'N/A'}
              </span>
              <span className="text-[10px] font-mono text-[#059669] font-semibold block mt-0.5">
                {tapiocaQuote ? `발표 ${tapiocaQuote.date} · ${tapiocaQuote.wowPct !== null ? tapiocaQuote.wowPct.toFixed(2) + '% WoW' : '전주 대비 N/A'}` : '공식 주간 시세 확인 불가'}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed break-keep">
            {tapiocaQuote ? `TTSA 발표일 ${tapiocaQuote.date}: 방콕 FOB 타피오카 전분 기준가 ${tapiocaQuote.usdPerMt.toFixed(2)} USD/MT. ` : 'TTSA 공식 주간 가격 확인 불가. '}카사바 생산·수출·면적·단수는 2025/26 참고 추정치입니다. FOB 가격과 실제 공급사 견적 및 한국향 운송조건는 별도입니다.
          </p>
        </div>

        {/* Footer Source */}
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>
            출처: TTSA 주간 FOB {tapiocaQuote ? `· 발표 ${tapiocaQuote.date}` : '· 시세 미확인'} · 기타 수급 수치는 참고 추정치 ·{' '}
            <a
              href="https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
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
              Market Year: <span className="text-slate-800 font-semibold">{!showSupplyFigures ? '—' : (['wheat', 'corn', 'soybean','soybean-oil'].includes(normalizedId) && /^20\d{2}$/.test(String(data.marketYear)) ? `${data.marketYear}/${String(Number(data.marketYear) + 1).slice(-2)}` : (data.marketYear || '—'))}</span>
            </span>
          </div>
        </div>

        {/* Dynamic 6-Grid S&D Telemetry Card */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
          {/* Box 1: 총생산 (Production) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총생산 (Production)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-prod">
              {showSupplyFigures ? <>{data.productionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : "데이터 없음"}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.productionKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 2: 총소비 (Consumption) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">Domestic Consumption (총소비)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-cons">
              {showSupplyFigures ? <>{data.consumptionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : "데이터 없음"}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.consumptionKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 3: 기말재고 (Ending Stocks) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">기말재고 (Ending Stocks)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-stocks">
              {showSupplyFigures ? <>{data.endingStocksMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : "데이터 없음"}
            </span>
            <span className="text-[10px] font-mono text-slate-600 font-medium block mt-0.5" id="commodity-wasde-stu">
              {showSupplyFigures ? <>재고율 {data.stocksToUseRatio.toFixed(1)}% (S/U)</> : "—"}
            </span>
          </div>

          {/* Box 4: 총수출량 (Exports) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총수출량 (Exports)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-exports">
              {showSupplyFigures ? <>{data.exportsMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : "데이터 없음"}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.exportsKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 5: 수확면적 (Area Harvested) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">{isSoybeanOil ? '원료 대두 압착량 (연간 전망)' : 'Area Harvested (수확 면적)'}</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-area">
              {isSoybeanOil ? showSupplyFigures&&data.crush1000MT?(data.crush1000MT/1000).toFixed(3)+' MMT':'N/A' : !showSupplyFigures || !data.areaHarvestedMHA ? 'N/A' : <>{data.areaHarvestedMHA.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M HA</>}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {isSoybeanOil ? showSupplyFigures&&data.crush1000MT?data.crush1000MT.toLocaleString('en-US')+' kMT':'공식 압착량 미확인' : !showSupplyFigures || !data.areaHarvestedKHA ? '공식 면적 미연동' : <>{data.areaHarvestedKHA.toLocaleString('en-US')} kHA</>}
            </span>
          </div>

          {/* Box 6: 단수/수확량 (Yield) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">{isSoybeanOil ? '생산/압착량 환산율' : '단수/수확량 (Yield)'}</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id="commodity-wasde-yield">
              {isSoybeanOil ? showSupplyFigures&&data.oilCrushRatioPct!==undefined?data.oilCrushRatioPct.toFixed(2)+'%':'N/A' : !showSupplyFigures || !data.yieldMTHA ? 'N/A' : <>{data.yieldMTHA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT/HA</>}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {isSoybeanOil ? '생산 ÷ 압착량 · 연간 전망' : !showSupplyFigures || !data.yieldKGHA ? '공식 단수 미연동' : <>{data.yieldKGHA.toLocaleString('en-US')} kg/HA</>}
            </span>
          </div>
        </div>

        {/* Executive Brief */}
        {(showSupplyFigures && (data.executiveBrief || customBrief)) && (
          <p className="text-xs text-[#4b5563] bg-[#f9fafb] p-2.5 rounded border border-[#e5e7eb] leading-relaxed">
            {data.executiveBrief || customBrief}
          </p>
        )}
      </div>

      {/* Footer Source — the underlying verifiedAt stays available for freshness checks. */}
      <div className="mt-auto pt-4 flex justify-end text-right text-xs text-gray-400">
        <span className="block w-full break-keep" title={isVerifiedUsdaCommodity && usdaVerifiedAt ? `USDA 자료 검증일: ${usdaVerifiedAt.slice(0, 10)}` : undefined}>
          {isSoybeanOil&&data.reportPeriod&&<span>{verifiedSupply?.refreshFailed?'재확인 실패 · 저장 자료 · ':''}보고 {data.reportPeriod} · </span>}출처:{' '}
          <a
            href="https://apps.fas.usda.gov/psdonline/app/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-[#DF0029] hover:underline font-semibold inline-flex items-center gap-0.5 transition-colors cursor-pointer"
          >
            USDA FAS PSD Online ↗
          </a>
        </span>
      </div>
    </div>
  );
};

export default CommodityWasdeCard;
