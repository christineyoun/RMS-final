/**
 * Source verification has already established which original publisher pages
 * qualify as evidence. Preserve every eligible verified article, but carry
 * the shared fresh-source / independent-publisher priority into the Gemini
 * input instead of silently restoring date-only ordering.
 *
 * This is an ordering preference ONLY. It never approves articles, changes the
 * final two-per-publisher/maximum-four publication rules, or calls a provider.
 * Older evidence remains eligible when the caller's existing policy allows it.
 */
import {focusOnFreshVerifiedNews} from './newsFreshEvidencePolicy.ts';
export function cloudCompatibleVerifiedSourcePool<
  T extends {publishedAt?:string;rawTitle?:string;title?:string;sourceName?:string}
>(rankedVerified:readonly T[],commodity:string,now=new Date()):T[]{
  // focusOnFreshVerifiedNews applies the existing commodity eligibility gate,
  // prioritizes current reports and surfaces a publisher's first eligible
  // article before its repetitions, WITHOUT removing the remaining articles.
  return focusOnFreshVerifiedNews(rankedVerified,now,2,commodity);
}
