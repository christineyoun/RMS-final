import React from 'react';
import { TelemetryCard } from './TelemetryCard';

interface MacroMetricsProps {
  usdKrw?: number;
  wtiCrude?: number;
  bdiIndex?: number;
  bdiChange?: string;
}

export const MacroMetrics: React.FC<MacroMetricsProps> = ({
  usdKrw = 1385.5,
  wtiCrude = 78.4,
  bdiIndex = 1845,
  bdiChange = '+2.4%'
}) => {
  return (
    <section className="bg-white p-4 rounded-lg shadow-sm border border-[#e5e7eb] space-y-3" id="macro-metrics-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#111827]">query_stats</span>
          <h2 className="text-sm text-[#111827] font-bold tracking-tight">
            거시경제 구매 요인 (Macroeconomic Sourcing Drivers)
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#6b7280] uppercase">핵심 수입원가 요인 (Core Landed Cost Factors)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TelemetryCard title="원/달러 환율 (USD/KRW)" sourceText="한국은행 ECOS / Frankfurter FX">
          <div className="font-mono text-xl font-bold text-[#111827]">{usdKrw.toLocaleString()} KRW</div>
        </TelemetryCard>

        <TelemetryCard title="국제 유가 (WTI 원유)" sourceText="US EIA / NYMEX">
          <div className="font-mono text-xl font-bold text-[#111827]">${wtiCrude.toFixed(2)}/bbl</div>
        </TelemetryCard>

        <TelemetryCard title="해상 운임 지수 (BDI)" sourceText="Baltic Exchange">
          <div className="font-mono text-xl font-bold text-[#111827]">{bdiIndex.toLocaleString()} pt ({bdiChange})</div>
        </TelemetryCard>
      </div>
    </section>
  );
};

export default MacroMetrics;
