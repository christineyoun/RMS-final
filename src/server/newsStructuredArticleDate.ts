/** Optional original-publisher JSON-LD date evidence. Never uses index/search metadata as approval. */
type Input = { scripts: readonly string[]; headline: string };
const simplify = (value: unknown) => String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function headlineMatches(expected: string, declared: string): boolean {
  const tokens = (s: string) => new Set(simplify(s).split(/\s+/).filter(x => x.length >= 4));
  const a = tokens(expected), b = tokens(declared);
  if (a.size < 2 || b.size < 2) return false;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return common >= 2 && common / Math.min(a.size, b.size) >= 0.6;
}
export function structuredArticleDate({scripts, headline}: Input): string {
  const candidates: string[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (depth > 8 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value.slice(0,80)) walk(item, depth+1); return; }
    const node = value as Record<string, unknown>;
    const types = ([] as unknown[]).concat(node['@type'] ?? []).map(x=>String(x).toLowerCase());
    const isArticle = types.some(t=>/^(?:newsarticle|article|report|analysisnewsarticle|blogposting)$/.test(t));
    if (isArticle && typeof node.headline === 'string' && headlineMatches(headline, node.headline) && typeof node.datePublished === 'string') {
      const ms = Date.parse(node.datePublished);
      if (Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}/.test(node.datePublished) && new Date(ms).toISOString().slice(0,10)===node.datePublished.slice(0,10)) {
        candidates.push(node.datePublished);
      }
    }
    if (node['@graph']) walk(node['@graph'], depth+1);
  };
  for (const raw of scripts.slice(0,40)) {
    if (raw.length > 100_000) continue;
    try { walk(JSON.parse(raw)); } catch { /* malformed publisher metadata is not evidence */ }
  }
  const days = [...new Set(candidates.map(s=>s.slice(0,10)))];
  // Conflicting dates are ambiguous; fail closed rather than picking one.
  return days.length === 1 ? days[0] : '';
}
