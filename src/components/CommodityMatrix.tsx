import React from 'react';
import { PriceCard, CommodityItem } from './PriceCard';

interface CommodityMatrixProps {
  commodities?: CommodityItem[];
  currency?: string;
  onNavigate?: (path: string) => void;
}

export const CommodityMatrix: React.FC<CommodityMatrixProps> = ({
  commodities = [],
  currency = 'USD',
  onNavigate
}) => {
  return (
    <section className="space-y-4" id="commodity-matrix">
      <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-2">
        <h2 className="text-sm font-bold text-[#111827]">
          원자재 모니터링 매트릭스 (Commodity Matrix)
        </h2>
        <span className="text-[10px] text-[#6b7280]">CBOT / 글로벌 벤치마크</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {commodities.map((item) => (
          <PriceCard
            key={item.id}
            item={item}
            currency={currency}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
};

export default CommodityMatrix;
