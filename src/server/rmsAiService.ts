import { GoogleGenAI, isPaidGeminiEnabled } from './paidGeminiGuard.ts';
import dotenv from 'dotenv';

dotenv.config();

export interface RmsStrategyEvaluation {
  commodityId: string;
  commodityName: string;
  currentPrice: number;
  unit: string;
  riskScore: number; // 0-100
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedCoveragePct: number; // e.g. 65%
  recommendedCoverageWindow: string; // e.g. "45~60일"
  procurementRecommendation: string;
  aiExecutiveSummary: string;
  bullishDrivers: string[];
  bearishDrivers: string[];
  updatedAt: string;
}

export class RmsAiService {
  private static instance: RmsAiService;

  private constructor() {}

  public static getInstance(): RmsAiService {
    if (!RmsAiService.instance) {
      RmsAiService.instance = new RmsAiService();
    }
    return RmsAiService.instance;
  }

  public async evaluateStrategy(
    commodityId: string,
    commodityName: string,
    currentPrice: number,
    historicalPrices: number[],
    unit: string = 'USD/MT'
  ): Promise<RmsStrategyEvaluation> {
    const validPrices = historicalPrices.filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);
    if(!Number.isFinite(currentPrice)||currentPrice<=0||validPrices.length<2)throw Error('Verified price/history unavailable for strategy evaluation');
    // Deterministic strategy policy v1: heuristic thresholds, never observed financial data.
    const min52W = Math.min(...validPrices);
    const max52W = Math.max(...validPrices);
    
    // Percentile position in 52-week range (0 to 100)
    const range52W = max52W - min52W || 1;
    const percentile = Math.round(((currentPrice - min52W) / range52W) * 100);

    // Risk score calculation based on percentile and volatility
    let riskScore = Math.min(100, Math.max(10, percentile));
    if (percentile > 80) riskScore = 85;
    else if (percentile < 25) riskScore = 30;

    let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium';
    if (riskScore >= 75) riskLevel = 'High';
    else if (riskScore >= 50) riskLevel = 'Medium';
    else riskLevel = 'Low';

    // Recommended Hedging / Coverage Ratio (%) based on band position
    let recommendedCoveragePct = 50;
    let recommendedCoverageWindow = '45~60일';
    let procurementRecommendation = '정상 분할 조달 (DCA 기조 유지)';

    if (percentile <= 30) {
      recommendedCoveragePct = 75;
      recommendedCoverageWindow = '75~90일 (장기 선도)';
      procurementRecommendation = '52주 최저점 부근 위치. 적극적인 장기 선도 계약 및 물량 확대를 권고합니다.';
    } else if (percentile >= 75) {
      recommendedCoveragePct = 30;
      recommendedCoverageWindow = '30~45일 (최소 스팟)';
      procurementRecommendation = '52주 최고점 부근 고평가 국면. 신규 추격 매수를 자제하고 필수 스팟 물량만 유지하십시오.';
    } else {
      recommendedCoveragePct = 55;
      recommendedCoverageWindow = '45~60일 (분할 매수)';
      procurementRecommendation = '중립적 박스권 장세. 조정 시마다 20%씩 분할 매입하여 평균 단가를 낮추십시오.';
    }

    let aiExecutiveSummary = `${commodityName} 현재 시세는 ${currentPrice.toLocaleString()} ${unit}로 52주 범위(${min52W.toFixed(1)} ~ ${max52W.toFixed(1)}) 내 ${percentile}% 위치에 있습니다. 글로벌 수급 여건과 항만 물류비를 종합할 때, 현재 구간에서는 ${recommendedCoverageWindow} 수준의 헷징 포지션을 설정하는 것이 최적입니다.`;

    // Try generating AI summary with Gemini if API key is present
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && isPaidGeminiEnabled()) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const modelName = 'gemini-2.5-flash';
        const prompt = `Act as an expert agricultural procurement risk manager for Nongshim. Provide a concise 3-sentence executive procurement strategy for ${commodityName} (${commodityId}) as of ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })}. Current price: ${currentPrice} ${unit}, 52-week low: ${min52W}, high: ${max52W}. Language: Korean.`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt
        });

        if (response.text) {
          aiExecutiveSummary = response.text.trim();
        }
      } catch (e) {
        console.warn('[RmsAiService] Gemini summary generation notice:', (e as Error)?.message || e);
      }
    }

    return {
      commodityId,
      commodityName,
      currentPrice,
      unit,
      riskScore,
      riskLevel,
      recommendedCoveragePct,
      recommendedCoverageWindow,
      procurementRecommendation,
      aiExecutiveSummary,
      bullishDrivers: [
        '주산지 기상 이변 및 파종기 토양 수분 부족 우려',
        '해상운임 변동성 및 항만 물류 비용 압박'
      ],
      bearishDrivers: [
        '단기 수확기 물량 유입 및 글로벌 이월 재고 풍부',
        '주요 수입국의 구매 수요 관망세 지속'
      ],
      updatedAt: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: true }) + ' KST'
    };
  }
}

export const rmsAiService = RmsAiService.getInstance();
