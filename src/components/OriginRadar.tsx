import React from 'react';
import { Globe } from 'lucide-react';

export interface OriginItem {
  country?: string;
  region?: string;
  share?: string;
  production?: string;
  exports?: string;
  endingStocks?: string;
  riskAssessment?: string;
  status: string;
  statusColor?: 'green' | 'yellow' | 'red';
  freightDays?: number;
  leadTimeRisk?: string;
  sourceName?: string;
  sourceOrg?: string;
  sourceReportDate?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  unit?: string;
  isLive?: boolean;
}


interface OriginRadarProps {
  commodityId?: string;
  origins?: OriginItem[];
  title?: string;
  className?: string;
  sourceFooterText?: string;
}


export const OriginRadar: React.FC<OriginRadarProps> = ({
  origins = [],
  title = '주요 조달 산지 및 물류 현황 (Origin Radar)',
  commodityId,
  sourceFooterText,
  className = ''
}) => {
  const isCorn = commodityId ? (commodityId.toLowerCase().includes('corn') || commodityId.includes('옥수수')) : false;
  const isSoybeanOil = commodityId ? (commodityId.toLowerCase().includes('soybean-oil') || commodityId.includes('대두유')) : false;
  const isSoybean = !isSoybeanOil && commodityId ? (commodityId.toLowerCase().includes('soybean') || commodityId.includes('대두')) : false;
  const isPalmOil = commodityId ? (commodityId.toLowerCase().includes('palm-oil') || commodityId.includes('팜유')) : false;
  const isPotatoStarch = commodityId ? (commodityId.toLowerCase().includes('potato-starch') || commodityId.includes('감자전분') || commodityId.includes('potato')) : false;

  const preferredSourceOrder = ['USDA FAS PSD', 'WASDE', 'CONAB', 'AMIS', 'USDA ERS', 'IGC', 'Gemini Search', 'USDA FAS', 'ABARES', 'EC', 'AAFC', 'Sask Wheat'];
  const extractedSources = Array.from(new Set(
    origins
      .flatMap((origin) => String(origin.sourceName || '').split('·'))
      .map((source) => source.trim().replace(/취합$/, '').trim())
      .filter((s) => Boolean(s) && s !== 'BNA')
  ));
  extractedSources.sort((a, b) => {
    const idxA = preferredSourceOrder.indexOf(a);
    const idxB = preferredSourceOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const isTapioca = commodityId ? (commodityId.toLowerCase().includes('tapioca') || commodityId.includes('타피오카')) : false;

  const computedFooterText = isCorn
    ? 'USDA FAS PSD · WASDE · CONAB · AMIS · IGC · Gemini Search'
    : isSoybeanOil
    ? 'USDA FAS PSD · WASDE · CONAB · AMIS · USDA ERS · Gemini Search'
    : isSoybean
    ? 'USDA FAS PSD · WASDE · CONAB · AMIS · Gemini Search'
    : isPalmOil
    ? 'USDA FAS PSD · MPOC · AMIS · Gemini Search'
    : isPotatoStarch
    ? 'JRC MARS · Eurostat Crop Production · Eurostat Comext · Gemini Search'
    : isTapioca
    ? 'Thai Tapioca Starch Association · Gemini Search'
    : (sourceFooterText || (extractedSources.length > 0 ? `${extractedSources.join(' · ')} 취합` : '공식 산지 데이터 소스 취합'));

  return (
    <div className={`flex flex-col h-full justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm pdf-section-card min-h-[280px] break-inside-avoid print:break-inside-avoid ${className}`.trim()}>
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-slate-700 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 break-keep">
              {title}
            </h3>
          </div>
        </div>

        {/* Origin Breakdown List */}
        <div className="flex flex-col gap-2">
          {origins.length === 0 ? (
            <p className="text-xs text-[#6b7280]">조달 산지 데이터가 등록되지 않았습니다.</p>
          ) : (
            origins.map((origin, idx) => {
              const displayName = origin.region || origin.country || '산지 미정';
              const isGreen = origin.statusColor === 'green' || origin.status?.includes('정상');
              const isYellow = origin.statusColor === 'yellow' || origin.status?.includes('모니터링');

              return (
                <div
                  key={idx}
                  className="origin-card p-2.5 bg-[#f9fafb] rounded border border-[#e5e7eb] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-[#111827]">{displayName}</span>
                      {origin.share && (
                        <span className="text-[10px] text-[#6b7280] font-mono">({origin.share})</span>
                      )}
                      {origin.production && (
                        <span className="text-[10px] bg-white border border-[#e5e7eb] px-1.5 py-0.5 rounded font-sans font-medium text-[#374151]">
                          생산 <span className="font-mono font-bold">{origin.production}</span>
                        </span>
                      )}
                    </div>
                    {(origin.exports || origin.endingStocks || origin.riskAssessment) && (
                      <div className="text-[10px] text-[#6b7280] mt-0.5 font-sans break-keep whitespace-normal leading-snug">
                        {[origin.exports, origin.endingStocks, origin.riskAssessment].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border ${
                        isGreen
                          ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#059669]'
                          : isYellow
                          ? 'bg-[#fff7ed] border-[#fed7aa] text-[#EC870C]'
                          : 'bg-[#FFF1F2] border-[#FECDD3] text-[#DF0029]'
                      }`}
                    >
                      {origin.status}
                    </span>
                    {origin.freightDays !== undefined && (
                      <span className="text-[10px] text-[#6b7280] font-mono">리드타임 {origin.freightDays}일</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-auto pt-4 flex justify-end text-xs text-gray-400">
        <span>출처: {computedFooterText}</span>
      </div>
    </div>
  );
};

export default OriginRadar;

