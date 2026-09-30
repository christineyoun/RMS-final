import React from 'react';
import { formatStarchSweetenerBenchmark } from '../utils/landedCostCalculator';
import { Currency } from '../types';

export interface CommodityItem {
  id: string;
  nameKo: string;
  nameEn: string;
  gradeEn: string;
  price: number;
  unit: string;
  changeWoW: number;
  changeMoM: number;
  path: string;
  category: 'grain' | 'oilseed' | 'sugar';
  sparkline?: number[];
}

interface PriceCardProps {
  item: CommodityItem;
  currency?: string;
  onNavigate?: (path: string) => void;
}

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

export const PriceCard: React.FC<PriceCardProps> = ({ item, currency = 'USD', onNavigate }) => {
  const sparklinePath = getSparklinePath(item.sparkline, item.changeWoW);
  const isNegative = item.changeWoW < 0;

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
            className={`px-1.5 py-0.5 font-mono text-[11px] rounded flex items-center gap-0.5 border ${
              item.changeWoW >= 0
                ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#10B981] font-semibold'
                : 'bg-red-50 border-red-200 text-[#EF4444] font-bold'
            }`}
          >
            {item.changeWoW >= 0 ? `+${item.changeWoW}% WoW` : `${item.changeWoW}% WoW`}
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

          <div className="w-16 h-5">
            <svg
              className={`w-full h-full ${isNegative ? 'text-[#EF4444]' : 'text-[#10B981]'}`}
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 64 20"
            >
              <path
                d={sparklinePath}
                stroke={isNegative ? '#EF4444' : '#10B981'}
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
    </div>
  );
};

export default PriceCard;
