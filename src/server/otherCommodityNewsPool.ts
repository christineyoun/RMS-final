import {prioritizePotatoStarchCandidates} from './potatoStarchCandidatePriority.ts';
/**
 * Shared, bounded original-publisher candidate ordering for all eight commodities.
 *
 * This is an INPUT queue for independent publisher-page verification, not
 * evidence approval. Never publish or summarize anything from this queue
 * without passing verifyOtherCommodityArticles() first.
 *
 * Previously the scheduled free-source candidates were gathered but omitted
 * from verification, while the verifier only examined the first 16 discovery
 * candidates. New search results could consequently be crowded out by older
 * publisher feeds (notably repeat tapioca weekly bulletins).
 */
export function otherCommodityVerificationPool<T extends {
  originalUrl?: string;
  publishedAt?: string;
  sourceName?: string;
  rawTitle?: string;
  title?: string;
  unavailable?: boolean;
}>(
  savedFree: readonly T[],
  discovered: readonly T[],
  searched: readonly T[],
  now = new Date(),
  maximum = 16,
  commodity = ''
): T[] {
  const candidates: Array<{ article: T; date: number; position: number; publisher: string }> = [];
  const seenUrls = new Set<string>();
  const today = now.getTime();
  if (!Number.isFinite(today) || !Number.isInteger(maximum) || maximum < 1) return [];

  for (const article of [...savedFree, ...discovered, ...searched]) {
    if (!article || article.unavailable) continue;
    let url: URL;
    try { url = new URL(String(article.originalUrl || '')); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) continue;
    // URLs are candidates only; this never bypasses the original-page verifier.
    const normalized = url.origin.toLowerCase() + url.pathname.replace(/\/+$/, '') + url.search;
    if (seenUrls.has(normalized)) continue;
    const rawDate = String(article.publishedAt || '').slice(0, 10);
    const parsed = /^20\d{2}-\d{2}-\d{2}$/.test(rawDate) ? Date.parse(rawDate + 'T00:00:00Z') : NaN;
    // A future-dated report is not evidence and should not displace a real page.
    if (Number.isFinite(parsed) && parsed > today + 86400000) continue;
    const validDate = Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === rawDate;
    seenUrls.add(normalized);
    candidates.push({
      article,
      date: validDate ? parsed : Number.NEGATIVE_INFINITY,
      position: candidates.length,
      publisher: url.hostname.replace(/^www\./, '').toLowerCase()
    });
  }

  // Give the most recent real candidate pages a chance to be verified, rather
  // than filling the 16 verification slots with one publisher's older reports.
  candidates.sort((a, b) => b.date - a.date || a.position - b.position);
  if (commodity === 'potato-starch') {
    const ranked = prioritizePotatoStarchCandidates(candidates.map(x => x.article));
    const positions = new Map(ranked.map((a, i) => [a, i]));
    candidates.sort((a, b) => (positions.get(a.article) ?? Infinity) - (positions.get(b.article) ?? Infinity));
  }
  const chosen: typeof candidates = [];
  const deferred: typeof candidates = [];
  const perPublisher = new Map<string, number>();
  for (const candidate of candidates) {
    if ((perPublisher.get(candidate.publisher) || 0) >= 2) {
      deferred.push(candidate);
      continue;
    }
    chosen.push(candidate);
    perPublisher.set(candidate.publisher, (perPublisher.get(candidate.publisher) || 0) + 1);
  }
  return [...chosen, ...deferred].slice(0, maximum).map(x => x.article);
}
