import React from 'react';
import { Newspaper } from 'lucide-react';
import { CommodityNews } from './CommodityNews';

interface MarketIntelligenceProps {
  commodityId: string;
}

export const MarketIntelligence: React.FC<MarketIntelligenceProps> = ({ commodityId }) => {
  return <CommodityNews commodityId={commodityId} />;
};

export { CommodityNews };
export default MarketIntelligence;
