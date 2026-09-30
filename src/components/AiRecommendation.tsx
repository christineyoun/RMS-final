import React from 'react';
import { Bot, Loader2 } from 'lucide-react';

export interface AiRecommendationProps {
  key?: string;
  commodityId?: string;
  currency?: string;
  confidenceScore?: number;
  recommendedCoverage?: string;
  executiveSummary?: string;
  bullishFactors?: string[];
  bearishFactors?: string[];
  watchItems?: string[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  modelVersion?: string;
  isSyncing?: boolean;
  className?: string;
}

export const GREEN_BADGE_STYLE = 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';

const getActionPillStyle = (score: number) => {
  if (score >= 85) return GREEN_BADGE_STYLE;
  if (score >= 70) return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold';
  return 'bg-red-600 text-white font-bold border-transparent shadow-sm';
};

export const getRecommendationColor = (text: string) => {
  if (!text) return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';

  // Tier 1: HIGH RISK / TIGHT BUFFER (Solid Red)
  if (text.includes('30~45일') || text.includes('즉시') || text.includes('조치 필요')) {
    return 'bg-[#DF0029] text-white font-bold px-2.5 py-1 rounded-md shadow-xs';
  }

  // Tier 2: EXTENDED LONG-TERM LOCK (Soft Green - 60~75d)
  if (text.includes('60~75일') || text.includes('75일') || text.includes('유럽 수입 계약')) {
    return 'bg-[#F0FDF4] border border-[#86EFAC] text-[#059669] font-semibold px-2.5 py-1 rounded-md';
  }

  // Tier 3: FLEXIBLE SPLIT-BUY / CAUTION (Soft Orange - 45~60d, 분할 구매, 스팟/선도)
  return 'bg-[#fff7ed] border border-[#fed7aa] text-[#EC870C] font-semibold px-2.5 py-1 rounded-md';
};

export default function AiRecommendation({
  commodityId,
  currency,
  confidenceScore = 88,
  recommendedCoverage = '60~75일 선도 구매',
  executiveSummary,
  bullishFactors = [],
  bearishFactors = [],
  watchItems = [],
  isLoading = false,
  isError = false,
  errorMessage = '',
  className = ''
}: AiRecommendationProps) {

  // Determine dynamic footer source:
  // Grains & Oilseeds -> Google Gemini AI · Refinitiv · USDA FAS
  // Starch Derivatives (Potato Starch, Tapioca Starch) -> Google Gemini AI · EEX · TTSA · Tridge
  const isStarchDerivative = commodityId ? (
    commodityId.toLowerCase().includes('starch') ||
    commodityId.toLowerCase().includes('potato') ||
    commodityId.toLowerCase().includes('tapioca') ||
    commodityId.includes('전분')
  ) : false;

  const footerSource = isStarchDerivative
    ? '출처: Google Gemini AI · EEX · TTSA · Tridge'
    : '출처: Google Gemini AI · Refinitiv · USDA FAS';

  if (isError) {
    return (
      <div className={`w-full flex flex-col h-full justify-between bg-white border border-red-200 rounded-xl p-5 mb-6 shadow-sm ${className}`.trim()}>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 border border-red-100 rounded-lg shrink-0">
              <Bot className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                RMS AI 시장 전망 호출 오류 (RMS AI Market View Error)
              </h3>
              <p className="text-xs text-red-500 font-sans mt-0.5">데이터 로딩에 실패했습니다.</p>
            </div>
          </div>
          <div className="bg-red-50/80 border border-red-100 rounded-lg p-3.5 mt-2">
            <p className="text-xs text-red-700 font-sans">
              {errorMessage || 'AI 분석 분석 데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
            </p>
          </div>
        </div>
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>{footerSource}</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`w-full flex flex-col h-full justify-between bg-white border border-emerald-100 rounded-xl p-5 mb-6 shadow-sm animate-pulse ${className}`.trim()}>
        <div className="flex-1">
          <div className="flex items-center justify-between w-full mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg shrink-0">
                <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
              </div>
              <div className="h-5 bg-slate-200 rounded w-64"></div>
            </div>
            <div className="h-6 bg-slate-200 rounded w-24"></div>
          </div>
          <div className="h-4 bg-slate-200 rounded w-36 mb-4"></div>
          <div className="bg-slate-100 rounded-lg p-4 mb-4 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-full"></div>
            <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            <div className="h-4 bg-slate-200 rounded w-4/6"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-slate-100 rounded-lg p-3.5 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-200 rounded w-3/4"></div>
              <div className="h-3 bg-slate-200 rounded w-2/3"></div>
            </div>
            <div className="border border-slate-100 rounded-lg p-3.5 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-200 rounded w-3/4"></div>
              <div className="h-3 bg-slate-200 rounded w-2/3"></div>
            </div>
            <div className="border border-slate-100 rounded-lg p-3.5 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-200 rounded w-3/4"></div>
              <div className="h-3 bg-slate-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>
        <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
          <span>{footerSource}</span>
        </div>
      </div>
    );
  }

  const defaultSummary = '원자재 시세 및 글로벌 수급 여건을 분석 중입니다. 국내 식품 제조 SCM에 맞춘 최적 선도 조달 전략을 제공합니다.';

  return (
    <div className={`w-full flex flex-col h-full justify-between bg-white border border-emerald-100 rounded-xl p-5 mb-6 shadow-sm pdf-section-card min-h-[300px] break-inside-avoid print:break-inside-avoid ${className}`.trim()}>
      
      <div className="flex-1">
        {/* Top Header Row */}
        <div className="flex items-center justify-between w-full mb-3 gap-2">
          {/* Left Side: Icon + Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg shrink-0">
              <Bot className="w-5 h-5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 break-keep">
                RMS AI 시장 전망 및 구매 전략 권고 (RMS AI Market View & Strategy Recommendation)
              </h3>
            </div>
          </div>

          {/* Right Metadata Container: Confidence Score Only */}
          <div className="flex items-center gap-2 shrink-0 flex-shrink-0 ml-4">
            <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md transition-colors ${getActionPillStyle(confidenceScore)}`}>
              신뢰도 점수: {confidenceScore}%
            </span>
          </div>
        </div>

        {/* Coverage Recommendation Badge */}
        <div className="flex items-center gap-2 mt-2 mb-4">
          <span className="text-xs font-semibold text-slate-500">데스크 권고:</span>
          <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md transition-colors ${getRecommendationColor(recommendedCoverage)}`}>
            {recommendedCoverage}
          </span>
        </div>

        {/* AI Summary Text Box */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-4 mb-4">
          <p className="text-[13px] text-slate-700 leading-relaxed font-sans whitespace-pre-line">
            {executiveSummary || defaultSummary}
          </p>
        </div>

        {/* 3-Column Factors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Column 1: Bullish */}
          <div className="border border-slate-100 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-[#059669]">상승 요인 <span className="font-normal opacity-80">(BULLISH FACTORS)</span></h3>
            </div>
            <ul className="space-y-2 text-[12px] text-slate-600 font-sans">
              {(bullishFactors.length > 0 ? bullishFactors : ['검증된 최신 상승 요인 없음']).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#059669] mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2: Bearish */}
          <div className="border border-slate-100 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-rose-600">하락 요인 <span className="font-normal opacity-80">(BEARISH FACTORS)</span></h3>
            </div>
            <ul className="space-y-2 text-[12px] text-slate-600 font-sans">
              {(bearishFactors.length > 0 ? bearishFactors : ['검증된 최신 하락 요인 없음']).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Watch Items */}
          <div className="border border-slate-100 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-[#EC870C]">모니터링 항목 <span className="font-normal opacity-80">(WATCH ITEMS)</span></h3>
              <span className="text-[11px] font-sans font-medium text-[#EC870C]"><span className="font-mono">7~14</span>일 내 영향</span>
            </div>
            <ul className="space-y-2 text-[12px] text-slate-600 font-sans">
              {(watchItems.length > 0 ? watchItems : ['검증된 최신 모니터링 항목 없음']).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EC870C] mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      {/* Footer Citation */}
      <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
        <span>{footerSource}</span>
      </div>
    </div>
  );
}
