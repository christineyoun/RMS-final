/** Optional, qualitative Overview-only prose from a reviewed STEP7 report. */
export const OVERVIEW_TAKEAWAY_MAX_CHARS = 150;

export function readOverviewTakeawayText(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const text = value.trim();
  // One Korean sentence, no new figures, source tags, markup or line breaks.
  if ([...text].length > OVERVIEW_TAKEAWAY_MAX_CHARS ||
      !/^[^.!?。！？\p{N}\p{Cc}\p{Cf}<>{}\[\]…]+다[.。]$/u.test(text) ||
      !/\p{Script=Hangul}/u.test(text) || /https?:|www\./i.test(text)) return;
  return text;
}

export type PublishedOverviewTakeaway = {
  text: string;
  commodityId: string;
  generatedAt: string;
  sourceUrls: string[];
};

export function readPublishedOverviewTakeaway(report: {
  id: string; generatedAt: string; overviewTakeaway?: unknown; sources?: unknown; rmsStep7Preview?: unknown; factReviewComplete?: unknown;
}): string | undefined {
  if (report.rmsStep7Preview !== true || report.factReviewComplete === false || !Array.isArray(report.sources)) return;
  const value = report.overviewTakeaway as Partial<PublishedOverviewTakeaway> | undefined;
  if (!value || value.commodityId !== report.id || value.generatedAt !== report.generatedAt ||
      !Array.isArray(value.sourceUrls) || value.sourceUrls.length < 1 || value.sourceUrls.length > 4) return;
  const urls = new Set(report.sources.map(source => source?.url));
  if (!value.sourceUrls.every(url => typeof url === 'string' && url.startsWith('https://') && urls.has(url))) return;
  return readOverviewTakeawayText(value.text);
}
