import React, { useState } from 'react';
import { Commodity } from '../types';
import { exportGlobalDashboardToPdf } from '../utils/exportDashboardPdf';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  commodities: Commodity[];
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  commodities
}) => {
  const [format, setFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [includeAI, setIncludeAI] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      if (format === 'csv') {
        const headers = ['ID', '품목명(한글)', 'Name(En)', 'Ticker', '시세', '단위', 'WoW(%)', '추정국내도착가(원/kg)'];
        const rows = commodities.map((c) => [
          c.id,
          c.nameKo,
          c.nameEn,
          c.ticker,
          c.price,
          c.unit,
          c.changeWoW,
          c.landedKrwKg
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Nongshim_SCM_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (format === 'json') {
        const jsonContent = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(commodities, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', jsonContent);
        link.setAttribute('download', `Nongshim_SCM_Report_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // High-fidelity A4 Multi-page PDF Export
        try {
          await exportGlobalDashboardToPdf();
        } catch (pdfErr) {
          console.warn('[ExportReportModal] Direct PDF export fallback to window.print:', pdfErr);
          try {
            window.print();
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl border border-[#e5e7eb] max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#f3f4f6]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#DF0029] text-[22px]">file_download</span>
            <h3 className="text-base font-bold text-[#111827]">농심 구매팀 인텔리전스 리포트 내보내기</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#111827] transition-colors p-1"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-[11px] font-bold text-[#374151] block mb-1.5">내보내기 포맷 (Export Format)</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-2.5 rounded border text-center font-semibold transition-all ${
                  format === 'pdf'
                    ? 'border-[#DF0029] bg-[#fdf2f2] text-[#DF0029]'
                    : 'border-[#e5e7eb] hover:bg-[#f9fafb] text-[#4b5563]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] block mx-auto mb-1">picture_as_pdf</span>
                PDF 브리프
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-2.5 rounded border text-center font-semibold transition-all ${
                  format === 'csv'
                    ? 'border-[#DF0029] bg-[#fdf2f2] text-[#DF0029]'
                    : 'border-[#e5e7eb] hover:bg-[#f9fafb] text-[#4b5563]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] block mx-auto mb-1">table_chart</span>
                Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-2.5 rounded border text-center font-semibold transition-all ${
                  format === 'json'
                    ? 'border-[#DF0029] bg-[#fdf2f2] text-[#DF0029]'
                    : 'border-[#e5e7eb] hover:bg-[#f9fafb] text-[#4b5563]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] block mx-auto mb-1">data_object</span>
                JSON 원천
              </button>
            </div>
          </div>

          <div className="bg-[#f9fafb] p-3 rounded border border-[#e5e7eb] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#374151] font-semibold">대상 품목:</span>
              <span className="font-bold text-[#111827]">농심 8대 핵심 원자재 전체</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#374151] font-semibold">기준 시점:</span>
              <span className="font-sans font-medium text-[#111827]">실시간 <span className="font-mono">LIVE</span> (Gemini Search Grounded)</span>
            </div>
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                className="rounded text-[#DF0029] focus:ring-[#DF0029]"
              />
              <span className="text-[#4b5563]">AI 시장 브리프 및 데스크 실행 지침 포함</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f3f4f6]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[#e5e7eb] text-xs font-semibold text-[#4b5563] hover:bg-[#f9fafb] transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="px-4 py-1.5 rounded bg-[#DF0029] hover:bg-[#c90024] text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            {isExporting ? (
              <span>생성 중...</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>리포트 다운로드</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
