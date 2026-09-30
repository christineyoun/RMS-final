import React from 'react';

interface TelemetryCardProps {
  title: string;
  sourceText?: string;
  children: React.ReactNode;
}

export const TelemetryCard: React.FC<TelemetryCardProps> = ({
  title,
  sourceText = 'RMS 멀티소스 종합 피드 (USDA, CBOT, Platts, Refinitiv)',
  children
}) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-[#e5e7eb] flex flex-col justify-between space-y-3">
      <div>
        <div className="flex items-center justify-between pb-1.5 border-b border-[#f3f4f6]">
          <h3 className="text-sm font-bold text-[#111827]">{title}</h3>
        </div>
        <div className="pt-2">{children}</div>
      </div>
      <div className="pt-2 text-[#6b7280] text-[10px] flex items-center justify-between border-t border-[#f3f4f6]">
        <span className="truncate">데이터 출처: {sourceText}</span>
      </div>
    </div>
  );
};

export default TelemetryCard;
