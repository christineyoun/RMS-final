import React from 'react';
import AiRecommendation from './AiRecommendation';

interface AiStrategyRecommendationProps {
  commodityId?: string;
  currency?: string;
  confidenceScore?: number;
  modelVersion?: string;
}

export const AiStrategyRecommendation: React.FC<AiStrategyRecommendationProps> = ({ commodityId, currency, confidenceScore, modelVersion }) => {
  return <AiRecommendation commodityId={commodityId} currency={currency} confidenceScore={confidenceScore} modelVersion={modelVersion} />;
};

export default AiStrategyRecommendation;
