import React from 'react';

interface DataPipelineSectionProps {
  children?: React.ReactNode;
}

export const DataPipelineSection: React.FC<DataPipelineSectionProps> = ({ children }) => {
  return (
    <section className="bg-white p-4 rounded-lg shadow-sm border border-[#e5e7eb] flex flex-col justify-between h-full space-y-3" id="external-pipeline-section">
      <div className="border-b border-[#f3f4f6] pb-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              멀티티어 외부 데이터 파이프라인 (Multi-Tier REST/CSV Telemetry Pipeline)
            </h2>
          </div>
        </div>
      </div>
      {children}
      <div className="text-xs text-[#94A3B8] font-normal text-right mt-auto pt-3 select-none">
        출처: USDA FAS PSD · EU Agri-food · FAO FPMA · World Bank · Frankfurter FX · Open-Meteo · US EIA
      </div>
    </section>
  );
};

export const TelemetryPipeline = DataPipelineSection;
export default DataPipelineSection;
