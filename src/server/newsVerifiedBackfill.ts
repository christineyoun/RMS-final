/** Verify original publisher pages in bounded waves, retaining only independently
 * approved articles. Later waves matter when an already-full first wave leaves
 * independent publishers unexamined. This never authorizes model use or publication.
 */
type PublisherCandidate = {originalUrl?: unknown; sourceName?: unknown};

/** Preserve the original generic helper contract: non-article callers (including
 * numeric offline test fixtures) have no publisher identity, but still verify
 * and observe the original bounded-wave behavior. */
function publisherKey(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const article = candidate as PublisherCandidate;
  if (typeof article.originalUrl === 'string') {
    try {
      const url = new URL(article.originalUrl);
      if (url.protocol === 'https:') return url.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {/* Fall back to the provided publisher label. */}
  }
  const name = typeof article.sourceName === 'string' ? article.sourceName.trim().toLowerCase() : '';
  return name || null;
}

/** When verification returns more items than the existing bounded budget,
 * retain earlier source order within each publisher while preventing one
 * publisher from consuming every slot. No article is accepted by this step.
 */
function retainDiverse<T>(accepted: readonly T[], limit: number): T[] {
  if (accepted.length <= limit) return [...accepted];
  const groups = new Map<string, T[]>();
  for (let index = 0; index < accepted.length; index++) {
    const item = accepted[index];
    const key = publisherKey(item) || `unknown-${index}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  const selected: T[] = [];
  let depth = 0;
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      if (group.length <= depth) continue;
      selected.push(group[depth]);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    depth++;
  }
  return selected;
}

export async function verifyWithBoundedBackfill<T>(
  candidates: readonly T[],
  verifier: (candidate: T) => Promise<T | null>,
  options: {firstWave?: number; maximum?: number; target?: number; limit?: number} = {}
): Promise<T[]> {
  const firstWave = options.firstWave ?? 16;
  const maximum = options.maximum ?? 32;
  const target = options.target ?? 6;
  const limit = options.limit ?? 8;
  if (![firstWave, maximum, target, limit].every(Number.isSafeInteger) ||
      firstWave < 1 || maximum < firstWave || target < 1 || limit < target || maximum > 32)
    return [];

  const bounded = candidates.slice(0, maximum);
  const availablePublishers = new Set(bounded.map(publisherKey).filter((x): x is string => Boolean(x)));
  // The existing publication policy permits at most two articles per publisher.
  // Seek enough verified independent sources for the target-sized evidence pool,
  // but NEVER treat that target as a publication quota or acceptance shortcut.
  const desiredPublishers = Math.min(Math.ceil(target / 2), availablePublishers.size);
  const accepted: T[] = [];

  for (let start = 0; start < bounded.length; start += firstWave) {
    const end = Math.min(start + firstWave, bounded.length);
    const results = await Promise.all(bounded.slice(start, end).map(verifier));
    for (const item of results) if (item !== null) accepted.push(item);

    if (accepted.length < target) continue;
    const verifiedPublishers = new Set(accepted.map(publisherKey).filter((x): x is string => Boolean(x)));
    if (verifiedPublishers.size >= desiredPublishers) break;
    // Avoid unnecessary page requests if later candidates cannot add a new
    // independent publisher. Preserve established acceptance and the bounds.
    const hasUnexaminedIndependentPublisher = bounded.slice(end).some(
      item => {
        const key = publisherKey(item);
        return key !== null && !verifiedPublishers.has(key);
      }
    );
    if (!hasUnexaminedIndependentPublisher) break;
  }
  return retainDiverse(accepted, limit);
}
