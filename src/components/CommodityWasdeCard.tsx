import tapiocaSupplyHistory from '../data/tapioca_supply_history_verified.json';
import {parseSoybeanOilSupply} from '../lib/soybeanOilSupply';
import {SourceAttribution} from './SourceAttribution';
import {PotatoRawSupplyCard} from './PotatoRawSupplyCard';
import {verifiedSoybeanOilSupply,soybeanOilCrushIndicators,type SoybeanOilSupplyResult} from '../lib/soybeanOilSupply';
import React, { useState, useEffect } from 'react';
import { normalizeVerifiedOtherCommodityWasde, USDA_WORLD_IDS } from '../lib/verifiedWorldWasde';
// RMS Step 12 world USDA validation
import { unavailableWasdeRecord, WasdeRecord } from './WasdeTerminal';

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
export function normalizeVerifiedSoybeanOilWasde(payload: any, status: unknown, verifiedAt = '', historical=false): WasdeRecord | null {
  const data=historical&&['live-verified','last-verified'].includes(String(status))?parseSoybeanOilSupply(payload?.rawRecords,Number(payload?.marketYear),new Date(),true):verifiedSoybeanOilSupply({success:true,status:status as any,data:payload,verifiedAt,checkedAt:verifiedAt});if(!data)return null;
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
  const baseline = unavailableWasdeRecord(normalizedId);
  const isSoybeanOil = normalizedId === 'soybean-oil' || normalizedId === 'soybean_oil';
  const isVerifiedUsdaCommodity = isSoybeanOil || USDA_WORLD_IDS.includes(normalizedId);

  const [data, setData] = useState<WasdeRecord>(baseline);
  const [previousData,setPreviousData]=useState<WasdeRecord|null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Treat the bundled soybean-oil PSD baseline as unverified, not as a live USDA observation.
  const [verifiedWorldPsd, setVerifiedWorldPsd] = useState(false);
  const [verifiedCommodityId, setVerifiedCommodityId] = useState('');
  const [usdaDataStatus, setUsdaDataStatus] = useState<'live-verified' | 'last-verified' | 'unavailable'>('unavailable');
  const [usdaVerifiedAt, setUsdaVerifiedAt] = useState('');

  // RMS Step 17 — official starch source separation
  const [tapiocaQuote, setTapiocaQuote] = useState<{ date: string; usdPerMt: number; wowPct: number | null } | null>(null);
  const [tapiocaQuoteStatus, setTapiocaQuoteStatus] = useState<'loading' | 'live-verified' | 'last-verified' | 'unavailable'>('loading');

  // RMS Step 18 — Eurostat potato harvest statistics
  type PotatoSourceData = { harvestYear: string; dataset: string; productionMMT: number; area1000HA: number; weightedYieldMTHA: number; coverage: string[]; isEstimateOrProvisional: boolean };
  const [potatoHistory,setPotatoHistory]=useState<PotatoSourceData[]>([]);
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
        setPotatoSourceData(d); setPotatoHistory(json.history||[]);setPotatoSourceStatus(json.dataStatus);
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
          setData(unavailableWasdeRecord(normalizedId));
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

  useEffect(()=>{
    if(!isVerifiedUsdaCommodity||!verifiedWorldPsd)return;
    let active=true;setPreviousData(null);
    const year=Number(data.marketYear)-1;
    if(!Number.isInteger(year))return;
    fetch('/api/usda/'+normalizedId+'?marketYear='+year,{cache:'no-store'}).then(r=>r.json()).then(json=>{
      if(!active||Number(json.data?.marketYear)!==year)return;
      const record=isSoybeanOil?normalizeVerifiedSoybeanOilWasde(json.data,json.dataStatus,json.verifiedAt,true):normalizeVerifiedOtherCommodityWasde(json.data,json.dataStatus,json.verifiedAt,normalizedId);
      if(record)setPreviousData(record);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[normalizedId,data.marketYear,verifiedWorldPsd,isSoybeanOil,isVerifiedUsdaCommodity,refreshRevision]);

  const isPotatoStarch = normalizedId === 'potato-starch' || normalizedId === 'potato_starch';

  const showSupplyFigures = !isVerifiedUsdaCommodity || (verifiedWorldPsd && verifiedCommodityId === normalizedId && data.commodity === normalizedId);

  if (isPotatoStarch) return <PotatoRawSupplyCard data={potatoSourceData} history={potatoHistory} className={className}/>;

  const isTapiocaStarch = normalizedId === 'tapioca-starch' || normalizedId === 'tapioca_starch';

  const tapiocaCurrent=tapiocaSupplyHistory.rows.find(r=>r.marketYear==='2025/2026');
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
                글로벌 수급 밸런스 (Global S&D Balance)
              </h3>
            </div>
          </div>

          <div className="text-xs text-slate-500" data-supply-year="current">Market Year: {tapiocaCurrent?.marketYear.replace(/\/20(\d{2})$/, '/$1')||'—'}</div>
          <div data-supply-grid="current" className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
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

        </div>

        {/* Footer Source */}
        <SourceAttribution className="mt-auto pt-4 justify-end" entries={[{label:'TTSA',url:'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price'},{label:'TTSA 생산 통계',url:tapiocaSupplyHistory.sourceUrl}]}/>
      </div>
    );
  }

  const yearLabel=(year:string)=>['wheat','corn','soybean','soybean-oil'].includes(normalizedId)&&/^20\d{2}$/.test(year)?year+'/'+String(Number(year)+1).slice(-2):year;
  const renderSupplyGrid=(data:WasdeRecord,showSupplyFigures:boolean,previous=false)=>(
    <div data-supply-grid={previous?'previous':'current'} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] wasde-grid gap-3">
          {/* Box 1: 총생산 (Production) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총생산 (Production)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-prod"}>
              {showSupplyFigures ? <>{data.productionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : (previous?'—':'데이터 없음')}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.productionKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 2: 총소비 (Consumption) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">Domestic Consumption (총소비)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-cons"}>
              {showSupplyFigures ? <>{data.consumptionMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : (previous?'—':'데이터 없음')}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.consumptionKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 3: 기말재고 (Ending Stocks) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">기말재고 (Ending Stocks)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-stocks"}>
              {showSupplyFigures ? <>{data.endingStocksMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : (previous?'—':'데이터 없음')}
            </span>
            <span className="text-[10px] font-mono text-slate-600 font-medium block mt-0.5" id={previous?undefined:"commodity-wasde-stu"}>
              {showSupplyFigures ? <>재고율 {data.stocksToUseRatio.toFixed(1)}% (S/U)</> : "—"}
            </span>
          </div>

          {/* Box 4: 총수출량 (Exports) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">총수출량 (Exports)</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-exports"}>
              {showSupplyFigures ? <>{data.exportsMMT.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MMT</> : (previous?'—':'데이터 없음')}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {showSupplyFigures ? <>{data.exportsKMT.toLocaleString('en-US')} kMT</> : "—"}
            </span>
          </div>

          {/* Box 5: 수확면적 (Area Harvested) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans whitespace-normal break-keep">{isSoybeanOil ? '원료 대두 압착량 (연간 전망)' : 'Area Harvested (수확 면적)'}</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-area"}>
              {isSoybeanOil ? showSupplyFigures&&data.crush1000MT?(data.crush1000MT/1000).toFixed(3)+' MMT':(previous?'—':'N/A') : !showSupplyFigures || !data.areaHarvestedMHA ? (previous?'—':'N/A') : <>{data.areaHarvestedMHA.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M HA</>}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {isSoybeanOil ? showSupplyFigures&&data.crush1000MT?data.crush1000MT.toLocaleString('en-US')+' kMT':(previous?'—':'공식 압착량 미확인') : !showSupplyFigures || !data.areaHarvestedKHA ? (previous?'—':'공식 면적 미연동') : <>{data.areaHarvestedKHA.toLocaleString('en-US')} kHA</>}
            </span>
          </div>

          {/* Box 6: 단수/수확량 (Yield) */}
          <div className="p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">
            <span className="text-[10px] text-[#6b7280] block font-sans">{isSoybeanOil ? '생산/압착량 환산율' : '단수/수확량 (Yield)'}</span>
            <span className="font-mono text-sm font-bold text-[#111827] mt-0.5 block" id={previous?undefined:"commodity-wasde-yield"}>
              {isSoybeanOil ? showSupplyFigures&&data.oilCrushRatioPct!==undefined?data.oilCrushRatioPct.toFixed(2)+'%':(previous?'—':'N/A') : !showSupplyFigures || !data.yieldMTHA ? (previous?'—':'N/A') : <>{data.yieldMTHA.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT/HA</>}
            </span>
            <span className="text-[10px] font-mono text-[#6b7280] block mt-0.5">
              {isSoybeanOil ? '생산 ÷ 압착량 · 연간 전망' : !showSupplyFigures || !data.yieldKGHA ? (previous?'—':'공식 단수 미연동') : <>{data.yieldKGHA.toLocaleString('en-US')} kg/HA</>}
            </span>
          </div>
        </div>
  );

  return (
    <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className || ''}`.trim()}>
      {/* Upper Content Section */}
      <div className="flex-1 space-y-3">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#f3f4f6]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">inventory_2</span>
            <h3 className="text-base font-bold text-slate-900 break-keep">
              글로벌 수급 밸런스 (Global S&D Balance)
            </h3>
            {isLoading && (
              <span className="relative flex h-2 w-2 ml-1 shrink-0" aria-description="동기화 중">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4F46E5]"></span>
              </span>
            )}
          </div>
        </div>

        {/* Dynamic 6-Grid S&D Telemetry Card */}
        <div className="text-xs text-slate-500" data-supply-year="current">Market Year: {!showSupplyFigures?'—':yearLabel(data.marketYear)}</div>
        {renderSupplyGrid(data,showSupplyFigures)}
        <div className="text-xs text-slate-500" data-supply-year="previous">Market Year: {yearLabel(String(Number(data.marketYear)-1))}</div>
        {renderSupplyGrid(previousData||data,!!previousData,true)}


      </div>

      {/* Footer Source — the underlying verifiedAt stays available for freshness checks. */}
      <SourceAttribution className="mt-auto pt-4 justify-end text-right" aria-description={isVerifiedUsdaCommodity && usdaVerifiedAt ? 'USDA 자료 검증일: '+usdaVerifiedAt.slice(0,10) : undefined} entries={[{label:'USDA FAS PSD Online',url:'https://apps.fas.usda.gov/psdonline/app/index.html'}]}/>
    </div>
  );
};

export default CommodityWasdeCard;
