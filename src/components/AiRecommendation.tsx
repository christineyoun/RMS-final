import {formalAiText,aiEvidenceDateLabel} from '../utils/aiReportPresentation';
import {getRecommendationColor} from '../utils/recommendationPresentation';
export {getRecommendationColor} from '../utils/recommendationPresentation';
import {SourceAttribution} from './SourceAttribution';
import React from 'react';
import { Bot, Loader2 } from 'lucide-react';
import {aiPublisherLabel,aiSourceTooltip,isDirectAiFooterSource,type AiDisplaySource} from '../utils/aiSourcePresentation';
import {rmsAiEditorial} from '../utils/rmsAiEditorial';

export interface AiRecommendationProps {
  key?: string;
  commodityId?: string;
  currency?: string;
  confidenceScore?: number; // retained for compatibility; not shown to users
  recommendedCoverage?: string;
  executiveSummary?: string;
  bullishFactors?: string[];
  bearishFactors?: string[];
  watchItems?: string[];
  researchStatus?: "live" | "cached" | "rule-based";
  researchSources?: AiDisplaySource[];
  researchEvidenceDates?: string[];
  researchGeneratedAt?: string; // report creation time, distinct from evidence observation dates
  researchModel?: string; // retained for compatibility
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  modelVersion?: string;
  isSyncing?: boolean;
  className?: string;
}


export default function AiRecommendation({
  commodityId,
  currency,
  recommendedCoverage = '자료 확인 후 구매 검토',
  executiveSummary,
  bullishFactors = [],
  bearishFactors = [],
  watchItems = [],
  researchStatus,
  researchSources = [],
  researchGeneratedAt,
  researchEvidenceDates = [],
  isLoading = false,
  isError = false,
  errorMessage = '',
  className = ''
}: AiRecommendationProps) {
  const editorial=rmsAiEditorial(commodityId,researchGeneratedAt,researchSources,{
    deskRecommendation:recommendedCoverage,executiveSummary,bullishFactors,bearishFactors,watchItems,
  });
  ({deskRecommendation:recommendedCoverage,executiveSummary,bullishFactors,bearishFactors,watchItems}=editorial.fields);
  researchSources=editorial.sources;
  recommendedCoverage=formalAiText(recommendedCoverage);
  executiveSummary=executiveSummary&&formalAiText(executiveSummary);
  bullishFactors=bullishFactors.map(formalAiText);bearishFactors=bearishFactors.map(formalAiText);watchItems=watchItems.map(formalAiText);
  const evidenceDates=aiEvidenceDateLabel(researchGeneratedAt,researchEvidenceDates);

  // Preserve distinct exact URLs, including query-specific publications. A
  // publisher label is presentation only; no source records are rewritten.
  const sourceLinks = Array.from(new Map(researchSources.filter((s) => {
    if(!isDirectAiFooterSource(s))return false;
    try { return s?.url && ['https:', 'http:'].includes(new URL(s.url).protocol); }
    catch { return false; }
  }).map((s): [string,AiDisplaySource] => [s.url,s])).values());

  if (isError || researchStatus === 'rule-based') {
    return <div className={`w-full bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm pdf-section-card ${className}`}>
      <h3 className="text-base font-bold text-slate-900">RMS AI 시장 전망 및 구매 전략 권고</h3>
      <p className="text-sm text-slate-500 mt-4">저장된 AI 분석이 없습니다.</p>
    </div>;
  }

  if (isLoading) {
    return (
      <div className={`w-full flex flex-col h-full justify-between bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm animate-pulse ${className}`.trim()}>
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
      </div>
    );
  }

  const defaultSummary = '검증된 분석 자료가 없습니다. 실제 공급사 견적과 공식 수급을 확인하세요.';

  return (
    <div data-rms-editorial={editorial.editorial || undefined} className={`w-full flex flex-col h-full justify-between bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm pdf-section-card min-h-[300px] break-inside-avoid print:break-inside-avoid ${className}`.trim()}>
      
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

        </div>

        {/* Coverage Recommendation Badge */}
        <div className="flex items-center gap-2 mt-2 mb-4">
          <span className="text-xs font-semibold text-slate-500">데스크 권고:</span>
          <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md transition-colors ${getRecommendationColor(recommendedCoverage)}`}>
            {recommendedCoverage}
          </span>
        </div>

        {evidenceDates&&<div data-ai-evidence-dates className="text-[10px] text-slate-500 mb-3">{evidenceDates}</div>}
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
              <span className="text-[11px] font-sans font-medium text-[#EC870C]">주요 확인 사항</span>
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
      {sourceLinks.length>0&&<SourceAttribution data-rms-ai-sources className="mt-auto pt-4 justify-end text-right" entries={sourceLinks.map(source=>({label:aiPublisherLabel(source),url:source.url,description:aiSourceTooltip(source)}))}/>}

    </div>
  );
}
