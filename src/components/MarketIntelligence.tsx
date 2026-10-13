import React from 'react';
import { Newspaper } from 'lucide-react';
import { CommodityNews } from './CommodityNews';

interface MarketIntelligenceProps {
  commodityId: string;
  isSyncing?: boolean;
}

export const MarketIntelligence: React.FC<MarketIntelligenceProps> = ({ commodityId, isSyncing }) => {
  return <CommodityNews commodityId={commodityId} isSyncing={isSyncing} />;
};

export { CommodityNews };
export default MarketIntelligence;
