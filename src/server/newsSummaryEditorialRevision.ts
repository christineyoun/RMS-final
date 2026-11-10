/**
 * Identify genuine editorial outliers AFTER original-publisher validation.
 * Advisory planning only: never reject, clip, pad, or replace published data.
 * Calls must be separately authorized by the existing Stage 3 transport.
 */
export type RevisionSource = {
  rawId: string;
  originalUrl: string;
  rawTitle: string;
  rawSnippet: string;
};
export type AcceptedSummary = {originalUrl: string; summary: string};
const length = (value: string): number =>
  Array.from(String(value || '').replace(/\s+/g, ' ').trim()).length;

/**
 * Up to two outliers can be offered for a single OPTIONAL editorial review.
 * The min absolute threshold avoids paid calls for natural short differences.
 * The relative threshold permits longer coverage when ALL sources are complex.
 */
export function planEvidenceBoundEditorialRevision<T extends RevisionSource>(
  sources: readonly T[],
  accepted: readonly AcceptedSummary[],
  limit = 2
): Array<{source: T; originalSummary: string}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4) return [];
  const lengths = accepted.map(a => length(a.summary)).filter(n => n > 0).sort((a,b) => a-b);
  if (!lengths.length) return [];
  const mid = Math.floor(lengths.length / 2);
  const median = lengths.length % 2 ? lengths[mid] : (lengths[mid-1]+lengths[mid])/2;
  const bound = new Map(sources.filter(s =>
    Boolean(s.rawId && s.originalUrl && s.rawTitle && s.rawSnippet)
  ).map(s => [s.originalUrl, s]));
  const seen = new Set<string>();
  const result: Array<{source:T;originalSummary:string}> = [];
  for (const article of accepted) {
    const source = bound.get(article.originalUrl);
    if (!source || seen.has(article.originalUrl)) continue;
    seen.add(article.originalUrl);
    const chars = length(article.summary);
    // Do not spend to harmonize normal differences. A very long summary is
    // eligible even if every accepted article in a sparse batch is long.
    if (!(chars > 320)) continue;
    result.push({source, originalSummary:article.summary});
    if (result.length === limit) break;
  }
  return result;
}

/** Only permit meaningful improvements; factual/source validation is separate. */
export function improvedEditorialRevision(before: string, after: string): boolean {
  const original = length(before), revised = length(after);
  return original > 320 && revised >= 170 && revised <= 320 &&
    revised <= original - 20;
}
