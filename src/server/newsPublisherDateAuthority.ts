/** Prefer the independently verified original publisher date over provisional index dates.
 * The caller is responsible for independently verifying the original article,
 * exact publication date, freshness, subject relevance, and body content.
 * RSS/search metadata is never approval evidence.
 */
export function publisherVerifiedDate(
  originalPublisherDate: Date,
  provisionalIndexDate: string | undefined,
  now = new Date(),
  maximumAgeDays = 31
): string | null {
  const ts = originalPublisherDate.getTime();
  if (!Number.isFinite(ts) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(maximumAgeDays) || maximumAgeDays <= 0 ||
      ts > now.getTime() + 86400000 ||
      now.getTime() - ts > maximumAgeDays * 86400000) return null;
  // Disagreement is diagnosed by upstream discovery diagnostics if desired,
  // but never substitutes an unverified index date for original evidence.
  void provisionalIndexDate;
  return originalPublisherDate.toISOString().slice(0, 10);
}
