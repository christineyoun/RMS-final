import type {
  CornProcurementAnalysisData,
} from '../types.ts';
import { fetchHistoricalData } from './historicalPriceService.ts';
import { observedPriceChanges } from '../utils/observedPriceChanges.ts';
import { usdaFasService } from './usdaFasService.ts';

export class CornIntelligenceService {
  private static instance: CornIntelligenceService;
  private cachedAnalysis: CornProcurementAnalysisData | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15-minute cache

  private constructor() {}

  public static getInstance(): CornIntelligenceService {
    if (!CornIntelligenceService.instance) {
      CornIntelligenceService.instance = new CornIntelligenceService();
    }
    return CornIntelligenceService.instance;
  }

  /**
   * Generates comprehensive Corn SCM procurement analysis
   * integrating CBOT ZC=F, USDA FAS PSD, and AMIS intelligence.
   */
  public async getCornProcurementAnalysis(force: boolean = false): Promise<CornProcurementAnalysisData> {
    const now = Date.now();
    if (!force && this.cachedAnalysis && now < this.cacheExpiresAt) {
      return this.cachedAnalysis;
    }

    try {
      // 1. Fetch live CBOT Corn futures series (ZC=F)
      const historyRes = await fetchHistoricalData('corn', '3M');
      const dataPoints = (historyRes.data || []).filter((p: any) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) &&
        !p.isSynthetic && Number.isFinite(Number(p.usdPerMT)) && Number(p.usdPerMT) > 0
      ).sort((a: any, b: any) => a.date.localeCompare(b.date));
      const changes = observedPriceChanges(dataPoints.map((p: any) => ({
        date: p.date, usdPerMT: Number(p.usdPerMT),
      })));
      if (dataPoints.length < 2 || changes.wow.pct === null ||
          changes.wow.amountUsdMt === null || !changes.wow.referenceDate) {
        throw new Error('Insufficient dated Corn observations for a valid weekly comparison');
      }

      const latestPoint = dataPoints[dataPoints.length - 1];
      const rawPrice = Number(latestPoint.centsPerBushel);
      const usdPerMT = Number(latestPoint.usdPerMT);
      const observationDate = latestPoint.date;
      const prevPoint = dataPoints.find((p: any) => p.date === changes.wow.referenceDate)!;
      const prevPriceUsdMt = Number(prevPoint.usdPerMT);
      const absoluteChangeUsdMt = changes.wow.amountUsdMt;
      const wowPct = changes.wow.pct;
      const direction: 'up' | 'down' | 'unchanged' =
        absoluteChangeUsdMt > 0 ? 'up' : absoluteChangeUsdMt < 0 ? 'down' : 'unchanged';

      // 3. Fetch official USDA FAS PSD dataset for World Corn (0440000, 2026)
      const psdRes = await usdaFasService.fetchWorldPsd('0440000', '2026');
      const psdData = psdRes.data;
      const ratio = psdData?.stocksToUseRatioPct;
      const stocksAvailable = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0;
      const stocksToUsePct = stocksAvailable ? Number(ratio) : 0;

      // Futures and stock levels provide a market signal, not an actionable physical offer.
      // Without a dated supplier quote, freight terms and FX, keep decisions conditional.
      let recommendation = '실제 공급사 견적·해상운임·환율 확인 후 분할 구매 검토';
      if (wowPct <= -2.0) {
        recommendation = '선물 시세 하락 확인 · 현물 오퍼·운임·환율 비교 후 분할 매수 검토';
      } else if (wowPct >= 3.0) {
        recommendation = '선물 변동성 확대 · 실제 공급사 오퍼 확인 전 확대 구매 보류';
      } else if (stocksAvailable && stocksToUsePct < 25) {
        recommendation = '공급 여건 점검 · 승인 공급사 견적과 납기 확인 후 분할 구매 검토';
      }

      // 6. Synthesize Procurement Risk (Qualitative status & concise 1-2 line Korean explanation)
      let riskLevel: '안정' | '주의' | '경계' | '자료 부족' = stocksAvailable ? '안정' : '자료 부족';
      let riskSummaryKo = stocksAvailable
        ? `글로벌 옥수수 재고율 ${stocksToUsePct.toFixed(1)}% 기준 · 남미 기상 및 해상운임 변동성 모니터링 필요`
        : 'USDA 재고율을 확인할 수 없어 공급 위험을 판정하지 않습니다. 공식 수급 자료 확인 필요';

      if (!stocksAvailable) {
        recommendation = '공식 재고율 확인 전 매입 판단 보류 · 공급사 오퍼 점검';
      } else if (stocksToUsePct < 22.0 || wowPct > 4.0) {
        riskLevel = '경계';
        // A tight stock buffer can justify a red risk signal even during a
        // weekly price decline. Never describe a price surge unless observed.
        riskSummaryKo = stocksToUsePct < 22.0 && wowPct > 4.0
          ? `글로벌 옥수수 재고율 ${stocksToUsePct.toFixed(1)}%로 타이트하고 선물 주간 ${wowPct.toFixed(2)}% 상승하여 조달 위험 경계 필요`
          : stocksToUsePct < 22.0
          ? `글로벌 옥수수 재고율 ${stocksToUsePct.toFixed(1)}%로 공급 완충 여력 제한 · 주간 선물 ${wowPct > 0 ? '+' : ''}${wowPct.toFixed(2)}%와 별개로 조달 위험 점검 필요`
          : `선물 주간 ${wowPct.toFixed(2)}% 급등에 따른 원가 변동성 경계 · 실제 현물 오퍼·운임·환율 확인 필요`;
      } else if (stocksToUsePct < 25.0 || wowPct > 2.0) {
        riskLevel = '주의';
        riskSummaryKo = stocksToUsePct < 25.0
          ? `글로벌 옥수수 재고율 ${stocksToUsePct.toFixed(1)}% · 공급 여력과 남미 기상·운임 변수 지속 점검 필요`
          : `선물 주간 ${wowPct.toFixed(2)}% 상승 · 남미 파종기 기상 및 원양 곡물 벌크선 운임 추이 모니터링 필요`;
      }

      const result: CornProcurementAnalysisData = {
        benchmarkPrice: {
          rawPrice,
          rawUnit: 'cents/bushel',
          usdPerMT,
          observationDate,
          source: 'CBOT (ZC=F)'
        },
        weeklyChange: {
          wowPct,
          absoluteChangeUsdMt,
          direction,
          previousPriceUsdMt: prevPriceUsdMt,
          calculationBasis: `CBOT ZC=F 1-Week Interval (${prevPoint.date} → ${observationDate})`
        },
        deskRecommendation: {
          recommendation,
          dataInputsUsed: [
            'CBOT ZC=F Benchmark (USD/MT)',
            `Weekly Price Change (${wowPct > 0 ? '+' : ''}${wowPct}%)`,
            stocksAvailable ? `USDA FAS PSD (STU ${stocksToUsePct.toFixed(1)}%)` : 'USDA FAS PSD 재고율 미확인'
          ]
        },
        procurementRisk: {
          level: riskLevel,
          summarySentenceKo: riskSummaryKo,
          sourcesUsed: [
            'USDA FAS PSD',
            'CME CBOT (ZC=F)'
          ]
        }
      };

      this.cachedAnalysis = result;
      this.cacheExpiresAt = now + this.cacheDurationMs;
      return result;
    } catch (err: any) {
      console.error('[CornIntelligenceService] Error generating corn analysis:', err);
      // Do not fabricate a dated price or a green risk badge after a source failure.
      // The HTTP endpoint reports an error; UI shows a neutral '자료 부족' state.
      throw err;
    }
  }
}

export const cornIntelligenceService = CornIntelligenceService.getInstance();
