export interface MarketFactorEvidence {
  text: string;
  category: 'upward' | 'downward' | 'monitor';
  affectedRegion: string;
  sourceOrg: string;
  sourceUrl: string;
  publicationDate: string;
  retrievalDate: string;
}

export interface WheatAiRecommendationData {
  success: boolean;
  statusCode: number;
  lastUpdated: string;
  sources: {
    usWheat: {
      reportDate: string;
      source: string;
      hrwPriceUsdPerBu: number;
      hrwPriceUsdPerMt: number;
      hrwWeeklyChangeText: string;
      hrwWeeklyChangeUsd: number;
    };
    amis: {
      issueNumber: number;
      publicationDate: string;
      macroRiskSentenceKo: string;
      macroRiskLevel: string;
    };
    webResearch: {
      latestDate: string;
      primaryAgencies: string[];
    };
  };
  recommendation: {
    deskRecommendation: string;
    confidenceScore: number;
    summaryParagraph: string;
    bullishImpactText: string;
    bearishImpactText: string;
    watchTimeframeText: string;
    bullishFactors: string[];
    bearishFactors: string[];
    watchItems: string[];
  };
  evidenceRegistry: MarketFactorEvidence[];
}

interface SearchResearchPayload {
  latestDate?: string;
  deskRecommendation?: string;
  summaryParagraph?: string;
  bullishFactors?: Array<{
    text: string;
    affectedRegion: string;
    sourceOrg: string;
    sourceUrl: string;
    publicationDate: string;
  }>;
  bearishFactors?: Array<{
    text: string;
    affectedRegion: string;
    sourceOrg: string;
    sourceUrl: string;
    publicationDate: string;
  }>;
  watchItems?: Array<{
    text: string;
    affectedRegion: string;
    sourceOrg: string;
    sourceUrl: string;
    publicationDate: string;
  }>;
}

/** Retired unverified recommendation assembler. The dashboard reads accepted analysis snapshots. */
class WheatIntelligenceService {
 public async getWheatRecommendation(_force=false):Promise<WheatAiRecommendationData>{throw Error('Use the accepted saved Wheat analysis; sample-based recommendation unavailable');}
}
export const wheatIntelligenceService=new WheatIntelligenceService();
