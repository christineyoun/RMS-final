import React from 'react';

interface AiMarketBriefProps {
  aiBriefText?: string;
}

export const DEFAULT_BRIEF = `[현재 시세] - 글로벌 소맥 및 유지류 시장은 주요 원자재 수급 우려와 남미 기상 이변으로 인해 소폭의 상승세를 나타내고 있습니다. 원/달러 환율은 1367.8원 부근에서 좁은 폭으로 횡보하고 있습니다.

[주요 원인] - 남미 파종지 고온 건조 기후(26.2°C, 강우 0.2mm) 지속 - 홍해 지정학적 리스크에 따른 원양 컨테이너 운임(SCFI 2165.8pt) 변동성 - 흑해 곡물 수출 회랑 관련 수급 불확실성

[전망] - 향후 1-3개월간 소맥 및 팜유 가격은 남미 작황 진척도와 가을철 강우 강도에 따라 추가 변동성이 예상됩니다.

[구매 제안] - 주요 원자재 가격 변동성 완화를 위해 안정적인 분할 구매 방식을 채택하고, 리스크 완충용 주요 변수를 집중 모니터링할 것을 제안합니다.`;

export const renderBriefText = (text: string) => {
  if (!text) return null;

  const sections = [
    { key: '[현재 시세]', label: '[현재 시세]' },
    { key: '[주요 원인]', label: '[주요 원인]' },
    { key: '[전망]', label: '[전망]' },
    { key: '[구매 제안]', label: '[구매 제안]' }
  ];

  const positions = sections
    .map(sec => ({
      ...sec,
      index: text.indexOf(sec.key)
    }))
    .filter(pos => pos.index !== -1)
    .sort((a, b) => a.index - b.index);

  if (positions.length === 0) {
    return (
      <p className="leading-relaxed">{text}</p>
    );
  }

  const paragraphs: React.ReactNode[] = [];

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const next = positions[i + 1];

    const startIdx = current.index + current.key.length;
    const endIdx = next ? next.index : text.length;
    let content = text.slice(startIdx, endIdx).trim();

    // Trim off leading/trailing markdown asterisks, spaces, colons, or dashes
    content = content
      .replace(/^[*:\s-]+/, '')
      .replace(/[*:\s-]+$/, '')
      .trim();

    // Split by newlines and clean individual lines, then join with " - "
    const lines = content.split(/\n+/);
    const cleanedParts = lines
      .map(line => {
        let l = line.trim();
        l = l.replace(/^[-*•\s]+/, '').replace(/[-*•\s]+$/, '').trim();
        return l;
      })
      .filter(l => l.length > 0);

    const formattedContent = cleanedParts.join(' - ');

    paragraphs.push(
      <p key={current.key} className="leading-relaxed">
        <span className="font-bold text-[#0F172A] mr-1">{current.label}</span>
        {formattedContent ? ` - ${formattedContent}` : ''}
      </p>
    );
  }

  return paragraphs;
};

export default function AiMarketBrief({ aiBriefText }: AiMarketBriefProps) {
  return (
    <div className="flex flex-col gap-3 min-h-[140px] pdf-section-card break-inside-avoid print:break-inside-avoid">
      {/* Top Section: AI Market Brief Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[20px] text-[#DF0029] shrink-0">auto_awesome</span>
          <h2 className="text-sm text-[#111827] font-bold break-keep">AI 시장 브리프 (AI Market Brief)</h2>
        </div>
      </div>

      {/* Synthesis Paragraph */}
      <div
        id="ai-synthesis-text"
        className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4.5 my-3 space-y-3 text-sm text-[#334155] leading-relaxed"
      >
        {renderBriefText(aiBriefText || DEFAULT_BRIEF)}
      </div>
    </div>
  );
}
