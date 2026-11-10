/**
 * Evidence-first editorial guidance for RMS Market Intelligence summaries.
 * A SOFT consistency target, never a completeness/factuality gate:
 * brief original reporting should not be padded, and sourced developments
 * must not be truncated or reworded after source-evidence acceptance.
 * No provider calls, metadata changes, or effects on previously published data.
 */
export const NEWS_SUMMARY_EDITORIAL_GUIDANCE = `Editorial consistency for all commodities: Write one coherent Korean paragraph, usually about 2–4 information-rich sentences. For articles containing sufficient verified evidence, aim for roughly 200–300 Korean characters (a soft editorial reference, NOT a minimum/maximum). Cover the main development, its strongest relevant verified evidence, and the specific market or procurement significance where the publisher supports it. Prioritize key prices, amounts, dates, units and uncertainty; omit secondary lists of figures and repetitive background. Do not pad a thin source with invented context, and do not remove essential supported facts to hit the character range. Different article lengths are acceptable when source completeness requires it. Never change, infer, calculate or combine facts across publisher articles.`;

export type SummaryConsistencyStats = {
  count: number;
  lengths: number[];
  shortest: number | null;
  longest: number | null;
  median: number | null;
  span: number | null;
  belowSoftRange: number;
  aboveSoftRange: number;
};

/** Read-only diagnostic. NEVER reject or mutate verified news based on length. */
export function summarizeNewsConsistency(
  articles: readonly {summary?: unknown}[]
): SummaryConsistencyStats {
  const lengths = articles.map(article =>
    Array.from(String(article.summary ?? '').replace(/\s+/g, ' ').trim()).length
  );
  const sorted = [...lengths].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    lengths,
    shortest: n ? sorted[0] : null,
    longest: n ? sorted[n - 1] : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    span: n ? sorted[n - 1] - sorted[0] : null,
    belowSoftRange: lengths.filter(length => length > 0 && length < 200).length,
    aboveSoftRange: lengths.filter(length => length > 300).length
  };
}
