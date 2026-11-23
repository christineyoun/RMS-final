/**
 * A commodity-specific topical shortlist is a preference, not an irrevocable
 * veto over a newer, independently verified and evidence-accepted summary.
 * Give the shared FINAL four-card selector an opportunity to evaluate that
 * latest already-accepted story under its relevance, duplicate and source
 * diversity checks. No content is approved or published by this helper.
 */
export function includeNewestValidatedNews<T extends {
  originalUrl:string;publishedAt:string
}>(preferred:readonly T[],validated:readonly T[]):T[]{
  if(!validated.length)return [...preferred];
  const latest=[...validated].filter(x=>x.originalUrl&&Number.isFinite(Date.parse(x.publishedAt)))
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
  if(!latest||preferred.some(x=>x.originalUrl===latest.originalUrl))return [...preferred];
  const maxPreferred=preferred.map(x=>x.publishedAt).filter(Boolean).sort().at(-1);
  if(maxPreferred&&latest.publishedAt<=maxPreferred)return [...preferred];
  // This candidate passed the caller's mandatory original-publisher and full
  // model evidence gates. selectProcurementNews still decides the final four.
  return [...preferred,latest];
}
