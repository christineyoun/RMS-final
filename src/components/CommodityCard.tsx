import React from 'react';
import PriceCard, { CommodityItem } from './PriceCard';
import { formatStarchSweetenerBenchmark } from '../utils/landedCostCalculator';
import { Currency } from '../types';

export interface CommodityCardProps {
  item: CommodityItem;
  currency?: string;
  onNavigate?: (path: string) => void;
  recommendedCoverage?: string;
}

export const GREEN_BADGE_STYLE = 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';

export const getRecommendationColor = (text: string) => {
  // Favorable / Extended Coverage (Green)
  if (text.includes('60~75일') || text.includes('90일') || text.includes('우호적')) {
    return GREEN_BADGE_STYLE;
  }
  // Urgent / Immediate Buy (Nongshim Red)
  if (text.includes('즉시') || text.includes('조치 필요') || text.includes('스팟')) {
    return 'bg-[#DF0029] text-white font-bold border-transparent';
  }
  // Standard / Moderate Caution Coverage (Amber/Orange)
  return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold';
};

export const getRecommendationStyle = getRecommendationColor;

export const CommodityCard: React.FC<CommodityCardProps> = ({
  item,
  currency = 'USD',
  onNavigate,
  recommendedCoverage = '60~75일 선도 구매'
}) => {
  return (
    <div
      onClick={() => onNavigate?.(item.path)}
      className="commodity-card group cursor-pointer bg-white p-3.5 rounded-lg shadow-sm border border-[#e5e7eb] hover:border-[#DF0029] hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3"
    >
      <div>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
              {item.gradeEn}
            </span>
            <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#DF0029] transition-colors mt-0.5">
              {item.nameKo} ({item.nameEn})
            </h3>
          </div>
          <span
            className={
              item.changeWoW >= 0
                ? `${GREEN_BADGE_STYLE} font-mono text-[11px] flex items-center gap-0.5 !py-0.5 !px-1.5`
                : 'px-1.5 py-0.5 font-mono text-[11px] rounded font-bold flex items-center gap-0.5 border bg-red-50 text-[#DF0029] border-red-200'
            }
          >
            {item.changeWoW >= 0 ? `+${item.changeWoW}%` : `${item.changeWoW}%`}
          </span>
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <span className="font-mono text-xl font-bold text-[#111827]">
              {formatStarchSweetenerBenchmark(item.id, currency as Currency)?.priceText ??
                (item.id === 'palm-oil'
                  ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : currency === 'KRW'
                  ? `₩${Math.round(item.price).toLocaleString('en-US')}`
                  : `${currency === 'EUR' ? '€' : '$'}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
            </span>
            <span className="text-xs text-[#6b7280] ml-1">
              {formatStarchSweetenerBenchmark(item.id, currency as Currency)?.unitText ?? item.unit}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-col items-start gap-1">
          <span className="text-[11px] font-medium text-slate-400">데스크 권고</span>
          <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md transition-colors ${getRecommendationColor(recommendedCoverage)}`}>
            {recommendedCoverage}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommodityCard;
