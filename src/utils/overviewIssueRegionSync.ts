/**
 * Display-only region reconciliation for Overview Key Market Issues.
 * The original verified commodity Market Intelligence article is the ONLY source.
 * This code does not search the web, infer geography, alter article selection,
 * or persist any records. A missing/conflicting region stays absent.
 */
export type OverviewRegionInput = {
  id: string;
  articles?: unknown[];
};

type RegionIssue = {
  url?: unknown;
  originalUrl?: unknown;
  affectedRegion?: unknown;
  affected_region?: unknown;
  commodities?: unknown;
  publishedAt?: unknown;
};

type SourceArticle = {
  originalUrl?: unknown;
  affectedRegion?: unknown;
  affected_region?: unknown;
  unavailable?: unknown;
  linkStatus?: unknown;
  publishedAt?: unknown;
};

function articleKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Match original URL identity; keep query parameters and path untouched.
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function declaredRegion(record: SourceArticle): string {
  for (const value of [record.affectedRegion, record.affected_region]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Reconcile only exact source-URL matches from the original commodity MI records. */
export function applyCommodityMiRegions(
  issues: RegionIssue[],
  inputs: OverviewRegionInput[],
): number {
  let updated = 0;
  for (const issue of issues) {
    const key = articleKey(issue.url ?? issue.originalUrl);
    if (!key) continue;
    const sourceIds = new Set(Array.isArray(issue.commodities) ?
      issue.commodities.filter((id): id is string => typeof id === 'string') : []);
    if (!sourceIds.size) continue;
    const matched: string[] = [];
    for (const input of inputs) {
      if (!sourceIds.has(input.id)) continue;
      for (const candidate of input.articles ?? []) {
        if (!candidate || typeof candidate !== 'object') continue;
        const article = candidate as SourceArticle;
        if (article.unavailable === true || article.linkStatus !== 'verified') continue;
        if (articleKey(article.originalUrl) !== key) continue;
        // A reused publisher URL with a different publication date is NOT the same article.
        if (typeof issue.publishedAt === 'string' && typeof article.publishedAt === 'string' &&
            issue.publishedAt.trim() && article.publishedAt.trim() &&
            issue.publishedAt.slice(0,10) !== article.publishedAt.slice(0,10)) continue;
        const region = declaredRegion(article);
        if (region) matched.push(region);
      }
    }
    const unique = [...new Set(matched)];
    // A disagreeing set of original MI records should not become a guessed label.
    if (unique.length !== 1) continue;
    if (declaredRegion(issue) === unique[0]) continue;
    issue.affectedRegion = unique[0];
    updated++;
  }
  return updated;
}

/**
 * If the saved Overview input is missing region metadata, read ONLY the same
 * already-saved MI API that powers commodity cards. No fresh research/AI calls.
 */
export async function syncOverviewIssueRegions(
  issues: RegionIssue[],
  inputs: OverviewRegionInput[],
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  applyCommodityMiRegions(issues, inputs);
  const missing = issues.filter(issue => !declaredRegion(issue));
  if (!missing.length) return;
  const needed = new Set<string>();
  for (const issue of missing) {
    if (!Array.isArray(issue.commodities)) continue;
    for (const id of issue.commodities) if (typeof id === 'string') needed.add(id);
  }
  if (!needed.size) return;
  // Only the commodity MI route; no independent searching, Gemini, or paid path.
  const retrieved = await Promise.allSettled([...needed].map(async id => {
    const response = await fetcher('/api/market-intelligence?commodity=' + encodeURIComponent(id), {cache:'no-store',signal});
    if (!response.ok) return null;
    const body = await response.json();
    if (body?.success !== true || !Array.isArray(body.articles)) return null;
    return {id, articles:body.articles} as OverviewRegionInput;
  }));
  const snapshots = retrieved.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  // Preserve region metadata from the original Overview snapshot on outage.
  applyCommodityMiRegions(missing, snapshots);
}
